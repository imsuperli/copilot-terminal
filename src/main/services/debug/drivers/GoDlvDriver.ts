import path from 'path';
import type {
  CodePaneBreakpoint,
  CodePaneDebugEvaluationResult,
  CodePaneExceptionBreakpoint,
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

const DLV_PROMPT_PATTERN = /\(dlv\)\s*$/m;

export class GoDlvDriver implements DebugDriver {
  readonly adapterType = 'dlv';

  private readonly target;
  private readonly callbacks;
  private readonly appliedBreakpointKeys = new Set<string>();
  private process: InteractiveDebugCommandProcess | null = null;

  constructor(private readonly context: DebugDriverContext) {
    this.target = context.target;
    this.callbacks = context.callbacks;
  }

  async start(): Promise<DebugDriverSnapshot> {
    if (!this.target.filePath) {
      throw new Error('Go debugging requires a concrete file target');
    }

    const packageDirectory = path.dirname(this.target.filePath);
    this.process = new InteractiveDebugCommandProcess({
      command: resolveDlvCommand(),
      args: ['debug', packageDirectory],
      cwd: this.target.workingDirectory,
      promptPattern: DLV_PROMPT_PATTERN,
      onOutput: this.callbacks.onOutput,
      onExit: this.callbacks.onTerminated,
    });
    this.callbacks.onOutput(`$ ${resolveDlvCommand()} debug ${packageDirectory}\n`, 'system');

    await this.process.waitForPrompt(30000);
    await this.applyBreakpoints(this.context.breakpoints);
    await this.applyExceptionBreakpoints(this.context.exceptionBreakpoints);
    return await this.inspectPausedState('entry');
  }

  async applyBreakpoints(breakpoints: CodePaneBreakpoint[]): Promise<void> {
    const process = this.requireProcess();
    const nextKeys = new Set<string>();

    for (const breakpoint of breakpoints) {
      const key = `${normalizePath(breakpoint.filePath)}:${breakpoint.lineNumber}`;
      nextKeys.add(key);
      if (this.appliedBreakpointKeys.has(key)) {
        continue;
      }

      await process.executeCommand(`break ${key}`);
      this.appliedBreakpointKeys.add(key);
    }

    for (const key of Array.from(this.appliedBreakpointKeys)) {
      if (nextKeys.has(key)) {
        continue;
      }

      await process.executeCommand(`clear ${key}`);
      this.appliedBreakpointKeys.delete(key);
    }
  }

  async applyExceptionBreakpoints(_breakpoints: CodePaneExceptionBreakpoint[]): Promise<void> {
    // Delve CLI does not expose a generic exception breakpoint model here.
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
    await process.executeCommand('stepout', 30000, true);
    if (process.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('step');
  }

  async evaluate(expression: string): Promise<CodePaneDebugEvaluationResult> {
    const process = this.requireProcess();
    const output = await process.executeCommand(`print ${expression}`);
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
    const stackOutput = await process.executeCommand('stack 20');
    const localsOutput = await process.executeCommand('locals');
    const stackFrames = parseGoStackFrames(stackOutput);
    const currentFrame = stackFrames[0] ?? null;

    return {
      state: 'paused',
      stopReason,
      currentFrame,
      stackFrames,
      scopes: [{
        id: 'locals',
        name: 'Locals',
        variables: parseGoVariables(localsOutput),
      }],
    };
  }

  private requireProcess(): InteractiveDebugCommandProcess {
    if (!this.process) {
      throw new Error('Go debugger is not running');
    }

    return this.process;
  }
}

function resolveDlvCommand(): string {
  return process.platform === 'win32' ? 'dlv.exe' : 'dlv';
}

function parseGoStackFrames(output: string): CodePaneDebugStackFrame[] {
  const frames: CodePaneDebugStackFrame[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^\d+\s+(.+?)\s+at\s+(.+):(\d+)$/i);
    if (!match) {
      continue;
    }

    frames.push({
      id: `frame-${frames.length + 1}`,
      name: match[1].trim(),
      filePath: normalizePath(match[2]),
      lineNumber: Number(match[3]),
      column: 1,
    });
  }

  return frames;
}

function parseGoVariables(output: string): CodePaneDebugVariable[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(' = '))
    .map((line, index) => {
      const [name, ...valueParts] = line.split(' = ');
      return {
        id: `var-${index + 1}`,
        name: name.trim(),
        value: valueParts.join(' = ').trim(),
      };
    });
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
