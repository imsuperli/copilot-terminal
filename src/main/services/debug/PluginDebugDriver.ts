import { randomUUID } from 'crypto';
import { createInterface, type Interface } from 'readline';
import type { PluginRuntimeState } from '../../../shared/types/plugin';
import type { ResolvedCodeRunTarget } from '../code/CodeRunProfileService';
import type {
  DebugDriver,
  DebugDriverCallbacks,
  DebugDriverSnapshot,
} from './DebugDriver';
import type { SpawnedRuntimeProcess } from '../language/runtime/shared';

interface PluginDebugDriverOptions {
  adapterType: string;
  pluginId: string;
  projectRoot: string;
  target: ResolvedCodeRunTarget;
  breakpoints: Parameters<DebugDriver['applyBreakpoints']>[0];
  exceptionBreakpoints: Parameters<DebugDriver['applyExceptionBreakpoints']>[0];
  callbacks: DebugDriverCallbacks;
  emitRuntimeState: (state: PluginRuntimeState, message?: string) => void;
  spawnRuntime: () => Promise<SpawnedRuntimeProcess>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export class PluginDebugDriver implements DebugDriver {
  readonly adapterType: string;

  private readonly pluginId: string;
  private readonly projectRoot: string;
  private readonly target: ResolvedCodeRunTarget;
  private readonly callbacks: DebugDriverCallbacks;
  private readonly emitRuntimeState: (state: PluginRuntimeState, message?: string) => void;
  private readonly spawnRuntime: () => Promise<SpawnedRuntimeProcess>;
  private breakpoints: Parameters<DebugDriver['applyBreakpoints']>[0];
  private exceptionBreakpoints: Parameters<DebugDriver['applyExceptionBreakpoints']>[0];
  private spawned: SpawnedRuntimeProcess | null = null;
  private stdoutReader: Interface | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private terminationHandled = false;

  constructor(options: PluginDebugDriverOptions) {
    this.adapterType = options.adapterType;
    this.pluginId = options.pluginId;
    this.projectRoot = options.projectRoot;
    this.target = options.target;
    this.breakpoints = options.breakpoints;
    this.exceptionBreakpoints = options.exceptionBreakpoints;
    this.callbacks = options.callbacks;
    this.emitRuntimeState = options.emitRuntimeState;
    this.spawnRuntime = options.spawnRuntime;
  }

  async start(): Promise<DebugDriverSnapshot> {
    const result = await this.sendRequest('start', {
      pluginId: this.pluginId,
      projectRoot: this.projectRoot,
      target: serializeTarget(this.target),
      breakpoints: this.breakpoints,
      exceptionBreakpoints: this.exceptionBreakpoints,
    });
    return normalizeSnapshot(result);
  }

  async applyBreakpoints(breakpoints: Parameters<DebugDriver['applyBreakpoints']>[0]): Promise<void> {
    this.breakpoints = breakpoints;
    await this.sendRequest('applyBreakpoints', {
      breakpoints,
    });
  }

  async applyExceptionBreakpoints(
    breakpoints: Parameters<DebugDriver['applyExceptionBreakpoints']>[0],
  ): Promise<void> {
    this.exceptionBreakpoints = breakpoints;
    await this.sendRequest('applyExceptionBreakpoints', {
      breakpoints,
    });
  }

  async resume(): Promise<DebugDriverSnapshot> {
    return normalizeSnapshot(await this.sendRequest('resume'));
  }

  async requestPause(): Promise<void> {
    await this.sendRequest('pause');
  }

  async stepOver(): Promise<DebugDriverSnapshot> {
    return normalizeSnapshot(await this.sendRequest('stepOver'));
  }

  async stepInto(): Promise<DebugDriverSnapshot> {
    return normalizeSnapshot(await this.sendRequest('stepInto'));
  }

  async stepOut(): Promise<DebugDriverSnapshot> {
    return normalizeSnapshot(await this.sendRequest('stepOut'));
  }

  async evaluate(expression: string): Promise<Awaited<ReturnType<DebugDriver['evaluate']>>> {
    const response = await this.sendRequest('evaluate', {
      expression,
    });
    return normalizeEvaluation(response);
  }

  async stop(): Promise<void> {
    const activeChild = this.spawned?.child ?? null;

    try {
      await this.sendRequest('stop');
    } catch {
      // Ignore stop failures and continue terminating the runtime.
    }

    if (!activeChild || activeChild.exitCode !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (activeChild.exitCode === null) {
          activeChild.kill();
        }
        resolve();
      }, 200);
      activeChild.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private async ensureSpawned(): Promise<SpawnedRuntimeProcess> {
    if (this.spawned) {
      return this.spawned;
    }

    this.emitRuntimeState('starting');
    const spawned = await this.spawnRuntime();
    this.spawned = spawned;
    this.stdoutReader = createInterface({
      input: spawned.child.stdout,
      crlfDelay: Infinity,
    });
    this.stdoutReader.on('line', this.handleProtocolLine);
    spawned.child.stderr.on('data', (chunk: Buffer) => {
      this.callbacks.onOutput(chunk.toString('utf8'), 'system');
    });
    spawned.child.on('error', (error) => {
      this.handleTermination({
        exitCode: null,
        error: error.message,
      });
    });
    spawned.child.on('close', (exitCode) => {
      const error = exitCode && exitCode !== 0
        ? `Plugin debug runtime exited with code ${exitCode}`
        : undefined;
      this.handleTermination({
        exitCode,
        ...(error ? { error } : {}),
      });
    });
    this.emitRuntimeState('running');
    return spawned;
  }

  private readonly handleProtocolLine = (line: string) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(trimmedLine) as unknown;
    } catch {
      this.callbacks.onOutput(`${line}\n`, 'system');
      return;
    }

    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return;
    }

    const payload = message as Record<string, unknown>;
    if (typeof payload.event === 'string') {
      this.handleEvent(payload.event, payload.payload);
      return;
    }

    if (typeof payload.id !== 'string') {
      return;
    }

    const pendingRequest = this.pendingRequests.get(payload.id);
    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(payload.id);
    if (payload.ok === false || payload.success === false) {
      pendingRequest.reject(new Error(typeof payload.error === 'string' ? payload.error : 'Plugin debug request failed'));
      return;
    }

    pendingRequest.resolve(payload.result ?? payload);
  };

  private handleEvent(event: string, payload: unknown): void {
    if (event === 'output') {
      const chunk = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).chunk === 'string'
        ? (payload as Record<string, unknown>).chunk as string
        : '';
      const stream = payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>).stream
        : undefined;
      this.callbacks.onOutput(
        chunk,
        stream === 'stdout' || stream === 'stderr' || stream === 'system' ? stream : 'system',
      );
      return;
    }

    if (event === 'terminated') {
      const exitCode = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).exitCode === 'number'
        ? (payload as Record<string, unknown>).exitCode as number
        : null;
      const error = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
        ? (payload as Record<string, unknown>).error as string
        : undefined;
      this.handleTermination({
        exitCode,
        ...(error ? { error } : {}),
      });
    }
  }

  private handleTermination(result: { exitCode: number | null; error?: string }): void {
    if (this.terminationHandled) {
      return;
    }

    this.terminationHandled = true;
    this.stdoutReader?.close();
    this.stdoutReader = null;
    this.spawned = null;
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(new Error(result.error ?? 'Plugin debug runtime terminated'));
    }
    this.pendingRequests.clear();
    this.emitRuntimeState(result.error ? 'error' : 'stopped', result.error);
    this.callbacks.onTerminated(result);
  }

  private async sendRequest(command: string, payload?: Record<string, unknown>): Promise<unknown> {
    const spawned = await this.ensureSpawned();
    const id = randomUUID();

    const responsePromise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve,
        reject,
      });
    });

    await new Promise<void>((resolve, reject) => {
      if (!spawned.child.stdin.writable) {
        reject(new Error('Plugin debug runtime stdin is not writable'));
        return;
      }

      spawned.child.stdin.write(`${JSON.stringify({ id, command, payload })}\n`, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
          return;
        }

        resolve();
      });
    });

    return await responsePromise;
  }
}

function serializeTarget(target: ResolvedCodeRunTarget): Record<string, unknown> {
  return {
    id: target.id,
    label: target.label,
    detail: target.detail,
    kind: target.kind,
    languageId: target.languageId,
    workingDirectory: target.workingDirectory,
    filePath: target.filePath,
    rootPath: target.rootPath,
    command: target.command,
    args: target.args,
    canDebug: target.canDebug,
    debugRequest: target.debugRequest,
  };
}

function normalizeSnapshot(value: unknown): DebugDriverSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Plugin debug runtime returned an invalid snapshot');
  }

  const payload = value as Record<string, unknown>;
  const state = payload.state;
  if (state !== 'paused' && state !== 'stopped' && state !== 'error') {
    throw new Error('Plugin debug runtime returned an unsupported session state');
  }

  return {
    state,
    ...(typeof payload.stopReason === 'string' ? { stopReason: payload.stopReason } : {}),
    ...(typeof payload.error === 'string' ? { error: payload.error } : {}),
    currentFrame: normalizeFrame(payload.currentFrame),
    stackFrames: Array.isArray(payload.stackFrames)
      ? payload.stackFrames.map(normalizeFrame).filter((frame): frame is NonNullable<DebugDriverSnapshot['currentFrame']> => Boolean(frame))
      : [],
    scopes: Array.isArray(payload.scopes)
      ? payload.scopes.map(normalizeScope).filter((scope): scope is DebugDriverSnapshot['scopes'][number] => Boolean(scope))
      : [],
  };
}

function normalizeFrame(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.id !== 'string' || typeof payload.name !== 'string') {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    ...(typeof payload.filePath === 'string' ? { filePath: payload.filePath } : {}),
    ...(typeof payload.lineNumber === 'number' ? { lineNumber: payload.lineNumber } : {}),
    ...(typeof payload.column === 'number' ? { column: payload.column } : {}),
  };
}

function normalizeScope(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.id !== 'string' || typeof payload.name !== 'string') {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    variables: Array.isArray(payload.variables)
      ? payload.variables.map(normalizeVariable).filter((variable): variable is NonNullable<ReturnType<typeof normalizeVariable>> => Boolean(variable))
      : [],
  };
}

function normalizeVariable(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.id !== 'string' || typeof payload.name !== 'string' || typeof payload.value !== 'string') {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name,
    value: payload.value,
    ...(typeof payload.type === 'string' ? { type: payload.type } : {}),
    ...(typeof payload.evaluateName === 'string' ? { evaluateName: payload.evaluateName } : {}),
  };
}

function normalizeEvaluation(value: unknown): Awaited<ReturnType<DebugDriver['evaluate']>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Plugin debug runtime returned an invalid evaluation result');
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.value !== 'string') {
    throw new Error('Plugin debug runtime evaluation result is missing value');
  }

  return {
    value: payload.value,
    ...(typeof payload.type === 'string' ? { type: payload.type } : {}),
  };
}
