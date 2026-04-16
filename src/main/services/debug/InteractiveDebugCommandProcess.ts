import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { prepareSpawnCommand } from '../code/CodeRunProfileService';

interface InteractiveDebugCommandProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  promptPattern: RegExp;
  onOutput: (chunk: string, stream: 'stdout' | 'stderr' | 'system') => void;
  onExit: (result: { exitCode: number | null; error?: string }) => void;
}

interface PendingRequest {
  buffer: string;
  allowExit: boolean;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class InteractiveDebugCommandProcess {
  readonly child: ChildProcessWithoutNullStreams;

  private readonly promptPattern: RegExp;
  private readonly onOutput: InteractiveDebugCommandProcessOptions['onOutput'];
  private readonly onExit: InteractiveDebugCommandProcessOptions['onExit'];
  private operationQueue: Promise<unknown> = Promise.resolve();
  private pendingRequest: PendingRequest | null = null;
  private unclaimedBuffer = '';
  private exited = false;
  private exitCode: number | null = null;

  constructor(options: InteractiveDebugCommandProcessOptions) {
    this.promptPattern = buildPromptPattern(options.promptPattern);
    this.onOutput = options.onOutput;
    this.onExit = options.onExit;
    const command = normalizeSpawnCommand(options.command);
    const args = normalizeSpawnArgs(options.args);
    if (!command) {
      throw new Error('Debugger command is empty');
    }
    const preparedCommand = prepareSpawnCommand(
      command,
      args,
      options.cwd,
      options.env ?? process.env,
    );

    this.child = spawn(preparedCommand.command, preparedCommand.args, {
      ...preparedCommand.options,
      stdio: 'pipe',
      windowsHide: true,
    });

    this.child.stdout.on('data', (chunk: Buffer) => {
      this.handleChunk(chunk.toString('utf8'), 'stdout');
    });
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.handleChunk(chunk.toString('utf8'), 'stderr');
    });
    this.child.on('error', (error) => {
      this.exited = true;
      this.resolvePendingOnExit({
        exitCode: null,
        error: error.message,
      });
      this.onExit({
        exitCode: null,
        error: error.message,
      });
    });
    this.child.on('exit', (code) => {
      this.exited = true;
      this.exitCode = code ?? null;
      this.resolvePendingOnExit({
        exitCode: this.exitCode,
      });
      this.onExit({
        exitCode: this.exitCode,
      });
    });
  }

  isExited(): boolean {
    return this.exited;
  }

  async waitForPrompt(timeoutMs = 15000, allowExit = false): Promise<string> {
    return await this.enqueueOperation(() => this.runOperation(null, timeoutMs, allowExit));
  }

  async executeCommand(command: string, timeoutMs = 30000, allowExit = false): Promise<string> {
    return await this.enqueueOperation(() => this.runOperation(command, timeoutMs, allowExit));
  }

  async interrupt(timeoutMs = 8000, allowExit = false): Promise<string> {
    if (this.exited) {
      return '';
    }

    try {
      this.child.kill(process.platform === 'win32' ? undefined : 'SIGINT');
    } catch {
      return '';
    }

    return await this.enqueueOperation(() => this.runOperation(null, timeoutMs, allowExit));
  }

  async stop(): Promise<void> {
    if (this.exited) {
      return;
    }

    try {
      this.child.kill();
    } catch {
      // The process is already gone.
    }
  }

  private async enqueueOperation<T>(task: () => Promise<T>): Promise<T> {
    const nextOperation = this.operationQueue.catch(() => undefined).then(task);
    this.operationQueue = nextOperation.then(() => undefined, () => undefined);
    return await nextOperation;
  }

  private async runOperation(command: string | null, timeoutMs: number, allowExit: boolean): Promise<string> {
    if (this.exited) {
      return allowExit ? this.unclaimedBuffer : Promise.reject(new Error('Debugger process has already exited'));
    }

    return await new Promise<string>((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        buffer: this.unclaimedBuffer,
        allowExit,
        resolve,
        reject,
        timer: setTimeout(() => {
          if (this.pendingRequest === pendingRequest) {
            this.pendingRequest = null;
          }
          reject(new Error(`Timed out waiting for debugger prompt after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this.unclaimedBuffer = '';
      this.pendingRequest = pendingRequest;

      if (this.tryResolvePendingRequest()) {
        return;
      }

      if (command) {
        this.child.stdin.write(`${command}\n`);
      }
    });
  }

  private handleChunk(chunk: string, stream: 'stdout' | 'stderr'): void {
    this.onOutput(chunk, stream);

    if (this.pendingRequest) {
      this.pendingRequest.buffer += chunk;
      this.tryResolvePendingRequest();
      return;
    }

    this.unclaimedBuffer += chunk;
  }

  private tryResolvePendingRequest(): boolean {
    if (!this.pendingRequest) {
      return false;
    }

    if (!this.promptPattern.test(this.pendingRequest.buffer)) {
      return false;
    }

    const resolvedValue = stripPrompt(this.pendingRequest.buffer, this.promptPattern);
    const { resolve, timer } = this.pendingRequest;
    clearTimeout(timer);
    this.pendingRequest = null;
    resolve(resolvedValue);
    return true;
  }

  private resolvePendingOnExit(result: { exitCode: number | null; error?: string }): void {
    if (!this.pendingRequest) {
      return;
    }

    const pendingRequest = this.pendingRequest;
    this.pendingRequest = null;
    clearTimeout(pendingRequest.timer);

    if (pendingRequest.allowExit) {
      pendingRequest.resolve(stripPrompt(pendingRequest.buffer, this.promptPattern));
      return;
    }

    const message = result.error
      ?? `Debugger process exited with code ${result.exitCode ?? 'unknown'}`;
    pendingRequest.reject(new Error(message));
  }
}

function normalizeSpawnCommand(command: string): string {
  return command.trim().replace(/^"(.*)"$/s, '$1');
}

function normalizeSpawnArgs(args: string[]): string[] {
  return args
    .filter((arg): arg is string => typeof arg === 'string')
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

function buildPromptPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('m')
    ? pattern.flags
    : `${pattern.flags}m`;
  return new RegExp(pattern.source, flags.replace(/g/g, ''));
}

function stripPrompt(value: string, promptPattern: RegExp): string {
  return value.replace(promptPattern, '').trimEnd();
}
