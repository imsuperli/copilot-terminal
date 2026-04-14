import { randomUUID } from 'crypto';
import type {
  CodePaneBreakpoint,
  CodePaneDebugControlConfig,
  CodePaneDebugEvaluateConfig,
  CodePaneDebugEvaluationResult,
  CodePaneDebugSession,
  CodePaneDebugSessionChangedPayload,
  CodePaneDebugSessionDetails,
  CodePaneDebugSessionOutputPayload,
  CodePaneDebugStartConfig,
  CodePaneRemoveBreakpointConfig,
  CodePaneSetBreakpointConfig,
} from '../../../shared/types/electron-api';
import { CodeRunProfileService } from '../code/CodeRunProfileService';
import type {
  DebugDriver,
  DebugDriverFactory,
  DebugDriverSnapshot,
} from './DebugDriver';
import { DebugSessionStore } from './DebugSessionStore';
import { GoDlvDriver } from './drivers/GoDlvDriver';
import { JavaJdbDriver } from './drivers/JavaJdbDriver';
import { PythonPdbDriver } from './drivers/PythonPdbDriver';

interface ActiveDebugSession {
  rootPath: string;
  driver: DebugDriver;
  runningTask: Promise<void> | null;
  pendingBreakpointSync: boolean;
}

export interface DebugAdapterSupervisorOptions {
  runProfileService: CodeRunProfileService;
  emitSessionChanged: (payload: CodePaneDebugSessionChangedPayload) => void;
  emitSessionOutput: (payload: CodePaneDebugSessionOutputPayload) => void;
  now?: () => string;
  sessionStore?: DebugSessionStore;
  createDriver?: DebugDriverFactory;
}

export class DebugAdapterSupervisor {
  private readonly runProfileService: CodeRunProfileService;
  private readonly emitSessionChanged: (payload: CodePaneDebugSessionChangedPayload) => void;
  private readonly emitSessionOutput: (payload: CodePaneDebugSessionOutputPayload) => void;
  private readonly now: () => string;
  private readonly sessionStore: DebugSessionStore;
  private readonly createDriver: DebugDriverFactory;
  private readonly activeSessions = new Map<string, ActiveDebugSession>();

  constructor(options: DebugAdapterSupervisorOptions) {
    this.runProfileService = options.runProfileService;
    this.emitSessionChanged = options.emitSessionChanged;
    this.emitSessionOutput = options.emitSessionOutput;
    this.now = options.now ?? (() => new Date().toISOString());
    this.sessionStore = options.sessionStore ?? new DebugSessionStore();
    this.createDriver = options.createDriver ?? createDefaultDebugDriver;
  }

  async startSession(config: CodePaneDebugStartConfig): Promise<CodePaneDebugSession> {
    const target = this.runProfileService.getResolvedTarget(config.targetId);
    if (!target) {
      throw new Error(`Unknown debug target: ${config.targetId}`);
    }
    if (!target.canDebug) {
      throw new Error(`Target ${config.targetId} does not support debugging`);
    }

    const sessionId = randomUUID();
    const driver = this.createDriver({
      rootPath: config.rootPath,
      target,
      breakpoints: this.sessionStore.getBreakpoints(config.rootPath),
      callbacks: {
        onOutput: (chunk, stream) => {
          this.emitSessionOutput({
            rootPath: config.rootPath,
            sessionId,
            chunk,
            stream,
          });
        },
        onTerminated: (result) => {
          this.handleDriverTermination(sessionId, result);
        },
      },
    });

    const session: CodePaneDebugSession = {
      id: sessionId,
      targetId: target.id,
      label: target.label,
      detail: target.detail,
      languageId: target.languageId,
      adapterType: driver.adapterType,
      state: 'starting',
      workingDirectory: target.workingDirectory,
      startedAt: this.now(),
      currentFrame: null,
    };
    this.sessionStore.storeSession(config.rootPath, session);
    this.emitSession(config.rootPath, session);

    const snapshot = await driver.start();
    this.activeSessions.set(sessionId, {
      rootPath: config.rootPath,
      driver,
      runningTask: null,
      pendingBreakpointSync: false,
    });
    const nextSession = this.applySnapshot(config.rootPath, sessionId, snapshot);
    if (!nextSession) {
      throw new Error('Failed to initialize debug session');
    }

    return nextSession;
  }

  async stopSession(config: CodePaneDebugControlConfig): Promise<void> {
    const activeSession = this.activeSessions.get(config.sessionId);
    if (!activeSession) {
      this.markSessionStopped(config.sessionId, 'stopped');
      return;
    }

    await activeSession.driver.stop();
    this.activeSessions.delete(config.sessionId);
    this.markSessionStopped(config.sessionId, 'stopped');
  }

  async pauseSession(config: CodePaneDebugControlConfig): Promise<void> {
    const activeSession = this.requireActiveSession(config.sessionId);
    await activeSession.driver.requestPause();
  }

  async continueSession(config: CodePaneDebugControlConfig): Promise<void> {
    const activeSession = this.requireActiveSession(config.sessionId);
    this.updateSessionState(config.sessionId, activeSession.rootPath, {
      state: 'running',
      stopReason: undefined,
    });
    activeSession.runningTask = this.runDriverTask(config.sessionId, async () => {
      const snapshot = await activeSession.driver.resume();
      return snapshot;
    });
  }

  async stepOver(config: CodePaneDebugControlConfig): Promise<void> {
    await this.runStepCommand(config.sessionId, 'running', (driver) => driver.stepOver());
  }

  async stepInto(config: CodePaneDebugControlConfig): Promise<void> {
    await this.runStepCommand(config.sessionId, 'running', (driver) => driver.stepInto());
  }

  async stepOut(config: CodePaneDebugControlConfig): Promise<void> {
    await this.runStepCommand(config.sessionId, 'running', (driver) => driver.stepOut());
  }

  async evaluate(config: CodePaneDebugEvaluateConfig): Promise<CodePaneDebugEvaluationResult> {
    const activeSession = this.requireActiveSession(config.sessionId);
    return await activeSession.driver.evaluate(config.expression);
  }

  async getSessionDetails(sessionId: string): Promise<CodePaneDebugSessionDetails> {
    return this.sessionStore.getSessionDetails(sessionId) ?? {
      sessionId,
      stackFrames: [],
      scopes: [],
    };
  }

  async setBreakpoint(config: CodePaneSetBreakpointConfig): Promise<void> {
    this.sessionStore.setBreakpoint(config.rootPath, config.breakpoint);
    await this.syncBreakpoints(config.rootPath);
  }

  async removeBreakpoint(config: CodePaneRemoveBreakpointConfig): Promise<void> {
    this.sessionStore.removeBreakpoint(config.rootPath, config.breakpoint);
    await this.syncBreakpoints(config.rootPath);
  }

  private async runStepCommand(
    sessionId: string,
    nextState: CodePaneDebugSession['state'],
    taskFactory: (driver: DebugDriver) => Promise<DebugDriverSnapshot>,
  ): Promise<void> {
    const activeSession = this.requireActiveSession(sessionId);
    this.updateSessionState(sessionId, activeSession.rootPath, {
      state: nextState,
      stopReason: undefined,
    });
    activeSession.runningTask = this.runDriverTask(sessionId, async () => await taskFactory(activeSession.driver));
  }

  private async runDriverTask(
    sessionId: string,
    task: () => Promise<DebugDriverSnapshot>,
  ): Promise<void> {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return;
    }

    try {
      const snapshot = await task();
      if (activeSession.pendingBreakpointSync && snapshot.state === 'paused') {
        await activeSession.driver.applyBreakpoints(this.sessionStore.getBreakpoints(activeSession.rootPath));
        activeSession.pendingBreakpointSync = false;
      }
      this.applySnapshot(activeSession.rootPath, sessionId, snapshot);
    } catch (error) {
      this.applyError(sessionId, activeSession.rootPath, error);
    } finally {
      const refreshedSession = this.activeSessions.get(sessionId);
      if (refreshedSession) {
        refreshedSession.runningTask = null;
      }
    }
  }

  private async syncBreakpoints(rootPath: string): Promise<void> {
    const breakpoints = this.sessionStore.getBreakpoints(rootPath);
    await Promise.all(Array.from(this.activeSessions.entries()).map(async ([sessionId, activeSession]) => {
      if (activeSession.rootPath !== rootPath) {
        return;
      }

      const storedSession = this.sessionStore.getSession(sessionId);
      if (storedSession?.session.state === 'running') {
        activeSession.pendingBreakpointSync = true;
        return;
      }

      await activeSession.driver.applyBreakpoints(breakpoints);
    }));
  }

  private handleDriverTermination(sessionId: string, result: { exitCode: number | null; error?: string }): void {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return;
    }

    this.activeSessions.delete(sessionId);
    if (result.error) {
      this.applyError(sessionId, activeSession.rootPath, result.error);
      return;
    }

    this.markSessionStopped(sessionId, 'stopped', result.exitCode ?? undefined);
  }

  private markSessionStopped(
    sessionId: string,
    state: Extract<CodePaneDebugSession['state'], 'stopped' | 'error'>,
    exitCode?: number,
  ): void {
    const storedSession = this.sessionStore.getSession(sessionId);
    if (!storedSession) {
      return;
    }

    const nextSession = this.sessionStore.updateSession(sessionId, {
      state,
      endedAt: this.now(),
      stopReason: state === 'stopped' ? 'terminated' : storedSession.session.stopReason,
      ...(exitCode !== undefined ? { error: undefined } : {}),
    });
    if (!nextSession) {
      return;
    }

    this.emitSession(storedSession.rootPath, nextSession);
  }

  private applySnapshot(
    rootPath: string,
    sessionId: string,
    snapshot: DebugDriverSnapshot,
  ): CodePaneDebugSession | null {
    const nextSession = this.sessionStore.updateSession(sessionId, {
      state: snapshot.state,
      stopReason: snapshot.stopReason,
      error: snapshot.error,
      currentFrame: snapshot.currentFrame,
      ...(snapshot.state === 'stopped' || snapshot.state === 'error'
        ? { endedAt: this.now() }
        : {}),
    });
    if (!nextSession) {
      return null;
    }

    this.sessionStore.setSessionDetails(sessionId, {
      sessionId,
      stackFrames: snapshot.stackFrames,
      scopes: snapshot.scopes,
    });
    this.emitSession(rootPath, nextSession);

    if (snapshot.state === 'stopped' || snapshot.state === 'error') {
      this.activeSessions.delete(sessionId);
    }

    return nextSession;
  }

  private applyError(sessionId: string, rootPath: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const nextSession = this.sessionStore.updateSession(sessionId, {
      state: 'error',
      error: message,
      endedAt: this.now(),
    });
    if (!nextSession) {
      return;
    }

    this.emitSession(rootPath, nextSession);
    this.activeSessions.delete(sessionId);
  }

  private updateSessionState(
    sessionId: string,
    rootPath: string,
    patch: Partial<CodePaneDebugSession>,
  ): void {
    const nextSession = this.sessionStore.updateSession(sessionId, patch);
    if (!nextSession) {
      return;
    }

    this.emitSession(rootPath, nextSession);
  }

  private emitSession(rootPath: string, session: CodePaneDebugSession): void {
    this.emitSessionChanged({
      rootPath,
      session,
    });
  }

  private requireActiveSession(sessionId: string): ActiveDebugSession {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      throw new Error(`Unknown debug session: ${sessionId}`);
    }

    return activeSession;
  }
}

function createDefaultDebugDriver(context: Parameters<DebugDriverFactory>[0]): DebugDriver {
  switch (context.target.languageId) {
    case 'python':
      return new PythonPdbDriver(context);
    case 'java':
      return new JavaJdbDriver(context);
    case 'go':
      return new GoDlvDriver(context);
    default:
      throw new Error(`No debug driver is available for language ${context.target.languageId}`);
  }
}
