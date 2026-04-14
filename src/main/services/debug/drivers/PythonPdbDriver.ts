import path from 'path';
import type {
  CodePaneBreakpoint,
  CodePaneDebugEvaluationResult,
  CodePaneDebugScope,
  CodePaneDebugStackFrame,
  CodePaneDebugVariable,
} from '../../../../shared/types/electron-api';
import type {
  DebugDriver,
  DebugDriverContext,
  DebugDriverSnapshot,
} from '../DebugDriver';
import { InteractiveDebugCommandProcess } from '../InteractiveDebugCommandProcess';

const PDB_PROMPT_PATTERN = /\(Pdb\)\s*$/m;

export class PythonPdbDriver implements DebugDriver {
  readonly adapterType = 'pdb';

  private readonly target;
  private readonly callbacks;
  private process: InteractiveDebugCommandProcess | null = null;
  private readonly appliedBreakpointKeys = new Set<string>();

  constructor(private readonly context: DebugDriverContext) {
    this.target = context.target;
    this.callbacks = context.callbacks;
  }

  async start(): Promise<DebugDriverSnapshot> {
    if (!this.target.filePath) {
      throw new Error('Python debugging requires a concrete file target');
    }

    const scriptPath = path.resolve(this.target.filePath);
    this.process = new InteractiveDebugCommandProcess({
      command: this.target.command,
      args: ['-m', 'pdb', scriptPath],
      cwd: this.target.workingDirectory,
      promptPattern: PDB_PROMPT_PATTERN,
      onOutput: this.callbacks.onOutput,
      onExit: this.callbacks.onTerminated,
    });
    this.callbacks.onOutput(`$ ${this.target.command} -m pdb ${scriptPath}\n`, 'system');

    await this.process.waitForPrompt();
    await this.applyBreakpoints(this.context.breakpoints);
    return await this.inspectPausedState('entry');
  }

  async applyBreakpoints(breakpoints: CodePaneBreakpoint[]): Promise<void> {
    const process = this.requireProcess();
    const nextKeys = new Set<string>();

    for (const breakpoint of breakpoints) {
      const key = breakpointKey(breakpoint);
      nextKeys.add(key);
      if (this.appliedBreakpointKeys.has(key)) {
        continue;
      }

      await process.executeCommand(`break ${normalizePath(breakpoint.filePath)}:${breakpoint.lineNumber}`);
      this.appliedBreakpointKeys.add(key);
    }

    for (const key of Array.from(this.appliedBreakpointKeys)) {
      if (nextKeys.has(key)) {
        continue;
      }

      const breakpoint = parseBreakpointKey(key);
      await process.executeCommand(`clear ${normalizePath(breakpoint.filePath)}:${breakpoint.lineNumber}`);
      this.appliedBreakpointKeys.delete(key);
    }
  }

  async resume(): Promise<DebugDriverSnapshot> {
    const process = this.requireProcess();
    await process.executeCommand('continue', 120000, true);
    if (process.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('breakpoint');
  }

  async requestPause(): Promise<void> {
    const process = this.requireProcess();
    await process.interrupt(15000, true);
  }

  async stepOver(): Promise<DebugDriverSnapshot> {
    const process = this.requireProcess();
    await process.executeCommand('next', 30000, true);
    if (process.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('step');
  }

  async stepInto(): Promise<DebugDriverSnapshot> {
    const process = this.requireProcess();
    await process.executeCommand('step', 30000, true);
    if (process.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('step');
  }

  async stepOut(): Promise<DebugDriverSnapshot> {
    const process = this.requireProcess();
    await process.executeCommand('return', 30000, true);
    if (process.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('step');
  }

  async evaluate(expression: string): Promise<CodePaneDebugEvaluationResult> {
    const process = this.requireProcess();
    const output = await process.executeCommand(`p ${expression}`);
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      value: lines.at(-1) ?? '',
    };
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    await this.process.stop();
    this.process = null;
  }

  private async inspectPausedState(stopReason: string): Promise<DebugDriverSnapshot> {
    const process = this.requireProcess();
    const stackOutput = await process.executeCommand('where');
    const scopes = await this.loadScopes();
    const stackFrames = parsePythonStackFrames(stackOutput);
    const currentFrame = stackFrames[0] ?? null;

    return {
      state: 'paused',
      stopReason,
      currentFrame,
      stackFrames,
      scopes,
    };
  }

  private async loadScopes(): Promise<CodePaneDebugScope[]> {
    const process = this.requireProcess();
    const argsOutput = await process.executeCommand('args');
    const localsOutput = await process.executeCommand(
      '!import json; print(json.dumps({k: repr(v) for k, v in locals().items()}))',
    );

    const argVariables = parseAssignmentVariables(argsOutput);
    const localsVariables = parseJsonVariables(localsOutput);
    const scopes: CodePaneDebugScope[] = [];
    if (argVariables.length > 0) {
      scopes.push({
        id: 'args',
        name: 'Arguments',
        variables: argVariables,
      });
    }
    if (localsVariables.length > 0) {
      scopes.push({
        id: 'locals',
        name: 'Locals',
        variables: localsVariables,
      });
    }

    return scopes;
  }

  private requireProcess(): InteractiveDebugCommandProcess {
    if (!this.process) {
      throw new Error('Python debugger is not running');
    }

    return this.process;
  }
}

function parsePythonStackFrames(output: string): CodePaneDebugStackFrame[] {
  const frames: CodePaneDebugStackFrame[] = [];
  const lines = output.split(/\r?\n/);
  let index = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^[> ]\s*(.+)\((\d+)\)(.+)$/);
    if (!match) {
      continue;
    }

    index += 1;
    frames.push({
      id: `frame-${index}`,
      name: match[3]?.trim() || '<module>',
      filePath: normalizePath(match[1]),
      lineNumber: Number(match[2]),
      column: 1,
    });
  }

  return frames;
}

function parseJsonVariables(output: string): CodePaneDebugVariable[] {
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith('{') && line.endsWith('}'));
  if (!jsonLine) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonLine) as Record<string, string>;
    return Object.entries(parsed).map(([name, value], index) => ({
      id: `local-${index + 1}`,
      name,
      value,
    }));
  } catch {
    return [];
  }
}

function parseAssignmentVariables(output: string): CodePaneDebugVariable[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(' = '))
    .map((line, index) => {
      const [name, ...valueParts] = line.split(' = ');
      return {
        id: `arg-${index + 1}`,
        name: name.trim(),
        value: valueParts.join(' = ').trim(),
      };
    });
}

function breakpointKey(breakpoint: CodePaneBreakpoint): string {
  return `${normalizePath(breakpoint.filePath)}:${breakpoint.lineNumber}`;
}

function parseBreakpointKey(value: string): CodePaneBreakpoint {
  const separatorIndex = value.lastIndexOf(':');
  return {
    filePath: value.slice(0, separatorIndex),
    lineNumber: Number(value.slice(separatorIndex + 1)),
  };
}

function createStoppedSnapshot(): DebugDriverSnapshot {
  return {
    state: 'stopped',
    currentFrame: null,
    stackFrames: [],
    scopes: [],
  };
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}
