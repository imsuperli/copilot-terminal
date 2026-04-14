import net from 'net';
import path from 'path';
import { statSync } from 'fs';
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

const JDB_PROMPT_PATTERN = /(^|\n)(?:>|\w+\[\d+\])\s*$/m;

export class JavaJdbDriver implements DebugDriver {
  readonly adapterType = 'jdb';

  private readonly target;
  private readonly callbacks;
  private readonly rootPath;
  private debuggerProcess: InteractiveDebugCommandProcess | null = null;
  private launchProcess: InteractiveDebugCommandProcess | null = null;
  private readonly appliedBreakpointKeys = new Set<string>();
  private readonly port = 5005 + Math.floor(Math.random() * 1000);
  private terminated = false;

  constructor(private readonly context: DebugDriverContext) {
    this.target = context.target;
    this.callbacks = context.callbacks;
    this.rootPath = context.rootPath;
  }

  async start(): Promise<DebugDriverSnapshot> {
    const jdbCommand = resolveJdbCommand();
    if (!jdbCommand) {
      throw new Error('Unable to locate jdb. Configure JAVA_HOME/JDK_HOME to a full JDK or add jdb to PATH.');
    }

    const launchConfig = buildJavaDebugLaunch(this.target, this.port);
    if (!launchConfig) {
      throw new Error('The selected Java target does not support the current debug launcher.');
    }

    this.launchProcess = new InteractiveDebugCommandProcess({
      command: launchConfig.command,
      args: launchConfig.args,
      cwd: this.target.workingDirectory,
      promptPattern: /$^/,
      onOutput: this.callbacks.onOutput,
      onExit: (result) => {
        if (this.terminated) {
          return;
        }

        this.terminated = true;
        this.callbacks.onTerminated(result);
      },
    });
    this.callbacks.onOutput(`$ ${launchConfig.command} ${launchConfig.args.join(' ')}\n`, 'system');

    await waitForPort(this.port, 30000);

    this.debuggerProcess = new InteractiveDebugCommandProcess({
      command: jdbCommand,
      args: ['-attach', String(this.port)],
      cwd: this.target.workingDirectory,
      promptPattern: JDB_PROMPT_PATTERN,
      onOutput: this.callbacks.onOutput,
      onExit: (result) => {
        if (this.terminated) {
          return;
        }

        this.terminated = true;
        this.callbacks.onTerminated(result);
      },
    });
    this.callbacks.onOutput(`$ ${jdbCommand} -attach ${this.port}\n`, 'system');

    await this.debuggerProcess.waitForPrompt(30000);
    await this.applyBreakpoints(this.context.breakpoints);
    return await this.inspectPausedState('entry');
  }

  async applyBreakpoints(breakpoints: CodePaneBreakpoint[]): Promise<void> {
    const debuggerProcess = this.requireDebugger();
    const nextKeys = new Set<string>();

    for (const breakpoint of breakpoints) {
      const location = toJavaBreakpointLocation(this.rootPath, breakpoint.filePath, breakpoint.lineNumber);
      if (!location) {
        continue;
      }

      const key = `${location.className}:${location.lineNumber}`;
      nextKeys.add(key);
      if (this.appliedBreakpointKeys.has(key)) {
        continue;
      }

      await debuggerProcess.executeCommand(`stop at ${location.className}:${location.lineNumber}`);
      this.appliedBreakpointKeys.add(key);
    }

    for (const key of Array.from(this.appliedBreakpointKeys)) {
      if (nextKeys.has(key)) {
        continue;
      }

      await debuggerProcess.executeCommand(`clear ${key}`);
      this.appliedBreakpointKeys.delete(key);
    }
  }

  async resume(): Promise<DebugDriverSnapshot> {
    const debuggerProcess = this.requireDebugger();
    await debuggerProcess.executeCommand('cont', 120000, true);
    if (debuggerProcess.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('breakpoint');
  }

  async requestPause(): Promise<void> {
    const debuggerProcess = this.requireDebugger();
    await debuggerProcess.interrupt(15000, true);
  }

  async stepOver(): Promise<DebugDriverSnapshot> {
    const debuggerProcess = this.requireDebugger();
    await debuggerProcess.executeCommand('next', 30000, true);
    if (debuggerProcess.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('step');
  }

  async stepInto(): Promise<DebugDriverSnapshot> {
    const debuggerProcess = this.requireDebugger();
    await debuggerProcess.executeCommand('step', 30000, true);
    if (debuggerProcess.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('step');
  }

  async stepOut(): Promise<DebugDriverSnapshot> {
    const debuggerProcess = this.requireDebugger();
    await debuggerProcess.executeCommand('step up', 30000, true);
    if (debuggerProcess.isExited()) {
      return createStoppedSnapshot();
    }

    return await this.inspectPausedState('step');
  }

  async evaluate(expression: string): Promise<CodePaneDebugEvaluationResult> {
    const debuggerProcess = this.requireDebugger();
    const output = await debuggerProcess.executeCommand(`print ${expression}`);
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const lastLine = lines.at(-1) ?? '';

    return {
      value: lastLine.includes(' = ')
        ? lastLine.slice(lastLine.indexOf(' = ') + 3)
        : lastLine,
    };
  }

  async stop(): Promise<void> {
    this.terminated = true;
    await Promise.all([
      this.debuggerProcess?.stop(),
      this.launchProcess?.stop(),
    ]);
    this.debuggerProcess = null;
    this.launchProcess = null;
  }

  private async inspectPausedState(stopReason: string): Promise<DebugDriverSnapshot> {
    const debuggerProcess = this.requireDebugger();
    const stackOutput = await debuggerProcess.executeCommand('where');
    const localsOutput = await debuggerProcess.executeCommand('locals');
    const stackFrames = parseJavaStackFrames(stackOutput);
    const currentFrame = stackFrames[0] ?? null;

    return {
      state: 'paused',
      stopReason,
      currentFrame,
      stackFrames,
      scopes: [{
        id: 'locals',
        name: 'Locals',
        variables: parseJavaVariables(localsOutput),
      }],
    };
  }

  private requireDebugger(): InteractiveDebugCommandProcess {
    if (!this.debuggerProcess) {
      throw new Error('Java debugger is not running');
    }

    return this.debuggerProcess;
  }
}

function parseJavaStackFrames(output: string): CodePaneDebugStackFrame[] {
  const frames: CodePaneDebugStackFrame[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^\[(\d+)\]\s+(.+?)\s+\(([^:]+):(\d+)\)$/);
    if (!match) {
      continue;
    }

    frames.push({
      id: `frame-${match[1]}`,
      name: match[2].trim(),
      filePath: match[3].trim(),
      lineNumber: Number(match[4]),
      column: 1,
    });
  }

  return frames;
}

function parseJavaVariables(output: string): CodePaneDebugVariable[] {
  const variables: CodePaneDebugVariable[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine.includes(' = ')) {
      continue;
    }

    const [name, ...valueParts] = trimmedLine.split(' = ');
    variables.push({
      id: `var-${variables.length + 1}`,
      name: name.trim(),
      value: valueParts.join(' = ').trim(),
    });
  }

  return variables;
}

function buildJavaDebugLaunch(
  target: DebugDriverContext['target'],
  port: number,
): { command: string; args: string[] } | null {
  const debugAgent = `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:${port}`;
  const baseName = path.basename(target.command).toLowerCase();

  if (baseName === 'mvn' || baseName === 'mvn.cmd' || baseName === 'mvnw' || baseName === 'mvnw.cmd') {
    const propertyName = target.args.some((arg) => arg.includes('spring-boot:run'))
      ? 'spring-boot.run.jvmArguments'
      : 'exec.jvmArgs';
    return {
      command: target.command,
      args: [`-D${propertyName}=${debugAgent}`, ...target.args],
    };
  }

  return null;
}

function toJavaBreakpointLocation(
  rootPath: string,
  filePath: string,
  lineNumber: number,
): { className: string; lineNumber: number } | null {
  const normalizedFilePath = path.resolve(filePath);
  const candidates = [
    path.join(rootPath, 'src', 'main', 'java'),
    path.join(rootPath, 'src', 'test', 'java'),
  ];

  for (const candidateRoot of candidates) {
    const relativePath = path.relative(candidateRoot, normalizedFilePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      continue;
    }

    const className = relativePath
      .replace(/\\/g, '.')
      .replace(/\//g, '.')
      .replace(/\.java$/i, '');
    return {
      className,
      lineNumber,
    };
  }

  if (normalizedFilePath.toLowerCase().endsWith('.java')) {
    return {
      className: path.basename(normalizedFilePath, '.java'),
      lineNumber,
    };
  }

  return null;
}

function resolveJdbCommand(): string | null {
  const configuredJavaHome = process.env.JDK_HOME ?? process.env.JAVA_HOME;
  if (configuredJavaHome) {
    const candidatePath = path.join(
      configuredJavaHome,
      'bin',
      process.platform === 'win32' ? 'jdb.exe' : 'jdb',
    );
    if (fileExists(candidatePath)) {
      return candidatePath;
    }
  }

  return process.platform === 'win32' ? 'jdb.exe' : 'jdb';
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const connected = await tryConnect(port);
    if (connected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for debug port ${port}`);
}

async function tryConnect(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    const finalize = (connected: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(500);
    socket.once('connect', () => finalize(true));
    socket.once('error', () => finalize(false));
    socket.once('timeout', () => finalize(false));
    socket.connect(port, '127.0.0.1');
  });
}

function fileExists(targetPath: string): boolean {
  try {
    return statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function createStoppedSnapshot(): DebugDriverSnapshot {
  return {
    state: 'stopped',
    currentFrame: null,
    stackFrames: [],
    scopes: [],
  };
}
