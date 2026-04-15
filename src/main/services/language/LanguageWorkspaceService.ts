import type {
  CodePaneLanguageWorkspaceChangedPayload,
  CodePaneLanguageWorkspacePhase,
  CodePaneLanguageWorkspaceState,
} from '../../../shared/types/electron-api';
import type { PluginRuntimeState } from '../../../shared/types/plugin';
import type { ResolvedLanguagePlugin } from './LanguagePluginResolver';

interface ProgressEntry {
  token: string;
  phase: CodePaneLanguageWorkspacePhase;
  title?: string;
  message?: string;
  percentage?: number;
  updatedAtMs: number;
}

export interface LanguageWorkspaceServiceOptions {
  emitState: (payload: CodePaneLanguageWorkspaceChangedPayload) => void;
  now?: () => string;
}

export class LanguageWorkspaceService {
  private readonly emitState: (payload: CodePaneLanguageWorkspaceChangedPayload) => void;
  private readonly now: () => string;
  private readonly states = new Map<string, CodePaneLanguageWorkspaceState>();
  private readonly progressBySession = new Map<string, Map<string, ProgressEntry>>();

  constructor(options: LanguageWorkspaceServiceOptions) {
    this.emitState = options.emitState;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  reset(pluginId?: string): void {
    if (!pluginId) {
      this.states.clear();
      this.progressBySession.clear();
      return;
    }

    for (const key of Array.from(this.states.keys())) {
      if (key.startsWith(`${pluginId}:`)) {
        this.states.delete(key);
      }
    }

    for (const key of Array.from(this.progressBySession.keys())) {
      if (key.startsWith(`${pluginId}:`)) {
        this.progressBySession.delete(key);
      }
    }
  }

  updateRuntimeState(
    resolution: ResolvedLanguagePlugin,
    runtimeState: PluginRuntimeState,
    message?: string,
  ): void {
    if (runtimeState === 'running') {
      this.emitNextState(resolution, {
        runtimeState,
        phase: this.getPrimaryProgress(resolution)?.phase ?? 'ready',
        ...(message ? { message } : {}),
        ...(this.getPrimaryProgressText(resolution) ? { progressText: this.getPrimaryProgressText(resolution) } : {}),
      });
      return;
    }

    if (runtimeState === 'starting') {
      this.emitNextState(resolution, {
        runtimeState,
        phase: 'starting-runtime',
        ...(message ? { message } : {}),
        progressText: undefined,
      });
      return;
    }

    if (runtimeState === 'error') {
      this.emitNextState(resolution, {
        runtimeState,
        phase: 'error',
        ...(message ? { message } : {}),
        progressText: undefined,
      });
      return;
    }

    if (runtimeState === 'stopped') {
      this.progressBySession.delete(this.getSessionKey(resolution));
      this.emitNextState(resolution, {
        runtimeState,
        phase: 'idle',
        ...(message ? { message } : {}),
        progressText: undefined,
      });
      return;
    }

    this.emitNextState(resolution, {
      runtimeState,
      ...(message ? { message } : {}),
    });
  }

  beginProgress(
    resolution: ResolvedLanguagePlugin,
    token: string,
    title?: string,
    message?: string,
    percentage?: number,
  ): void {
    this.getProgressMap(resolution).set(token, {
      token,
      title,
      message,
      percentage,
      phase: classifyProgressPhase(title, message),
      updatedAtMs: Date.now(),
    });

    this.syncFromProgress(resolution);
  }

  reportProgress(
    resolution: ResolvedLanguagePlugin,
    token: string,
    message?: string,
    percentage?: number,
  ): void {
    const progressMap = this.getProgressMap(resolution);
    const existingEntry = progressMap.get(token);
    if (!existingEntry) {
      this.beginProgress(resolution, token, undefined, message, percentage);
      return;
    }

    progressMap.set(token, {
      ...existingEntry,
      ...(message !== undefined ? { message } : {}),
      ...(percentage !== undefined ? { percentage } : {}),
      updatedAtMs: Date.now(),
    });

    this.syncFromProgress(resolution);
  }

  endProgress(
    resolution: ResolvedLanguagePlugin,
    token: string,
    message?: string,
  ): void {
    const progressMap = this.getProgressMap(resolution);
    progressMap.delete(token);
    if (progressMap.size === 0) {
      this.progressBySession.delete(this.getSessionKey(resolution));
    }

    const currentState = this.getState(resolution);
    const runtimeState = currentState?.runtimeState ?? 'running';
    this.emitNextState(resolution, {
      runtimeState,
      phase: runtimeState === 'error' ? 'error' : 'ready',
      ...(message ? { message } : {}),
      progressText: undefined,
    });
  }

  getState(resolution: ResolvedLanguagePlugin): CodePaneLanguageWorkspaceState | null {
    return this.states.get(this.getSessionKey(resolution)) ?? null;
  }

  private syncFromProgress(resolution: ResolvedLanguagePlugin): void {
    const primaryProgress = this.getPrimaryProgress(resolution);
    if (!primaryProgress) {
      const currentState = this.getState(resolution);
      this.emitNextState(resolution, {
        runtimeState: currentState?.runtimeState ?? 'running',
        phase: currentState?.runtimeState === 'error'
          ? 'error'
          : (currentState?.runtimeState === 'idle' || currentState?.runtimeState === 'stopped')
            ? 'idle'
            : 'ready',
        progressText: undefined,
      });
      return;
    }

    this.emitNextState(resolution, {
      runtimeState: this.getState(resolution)?.runtimeState ?? 'starting',
      phase: primaryProgress.phase,
      message: primaryProgress.message ?? primaryProgress.title,
      progressText: formatProgressText(primaryProgress),
    });
  }

  private getPrimaryProgress(resolution: ResolvedLanguagePlugin): ProgressEntry | null {
    const progressMap = this.progressBySession.get(this.getSessionKey(resolution));
    if (!progressMap || progressMap.size === 0) {
      return null;
    }

    return Array.from(progressMap.values())
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)[0] ?? null;
  }

  private getPrimaryProgressText(resolution: ResolvedLanguagePlugin): string | undefined {
    const primaryProgress = this.getPrimaryProgress(resolution);
    return primaryProgress ? formatProgressText(primaryProgress) : undefined;
  }

  private getProgressMap(resolution: ResolvedLanguagePlugin): Map<string, ProgressEntry> {
    const sessionKey = this.getSessionKey(resolution);
    const existingMap = this.progressBySession.get(sessionKey);
    if (existingMap) {
      return existingMap;
    }

    const nextMap = new Map<string, ProgressEntry>();
    this.progressBySession.set(sessionKey, nextMap);
    return nextMap;
  }

  private emitNextState(
    resolution: ResolvedLanguagePlugin,
    updates: Partial<CodePaneLanguageWorkspaceState>,
  ): void {
    const sessionKey = this.getSessionKey(resolution);
    const currentState = this.states.get(sessionKey) ?? createDefaultState(resolution, this.now);
    const nextState: CodePaneLanguageWorkspaceState = {
      ...currentState,
      ...updates,
      timestamp: this.now(),
    };

    this.states.set(sessionKey, nextState);
    this.emitState({
      state: nextState,
    });
  }

  private getSessionKey(resolution: ResolvedLanguagePlugin): string {
    return `${resolution.pluginId}:${resolution.projectRoot}`;
  }
}

function createDefaultState(
  resolution: ResolvedLanguagePlugin,
  now: () => string,
): CodePaneLanguageWorkspaceState {
  return {
    pluginId: resolution.pluginId,
    workspaceRoot: resolution.workspaceRoot,
    projectRoot: resolution.projectRoot,
    languageId: resolution.languageId,
    runtimeState: 'idle',
    phase: 'idle',
    readyFeatures: Object.entries(resolution.capability.features ?? {})
      .filter(([, enabled]) => enabled === true)
      .map(([feature]) => feature),
    timestamp: now(),
  };
}

function classifyProgressPhase(
  title?: string,
  message?: string,
): CodePaneLanguageWorkspacePhase {
  const source = `${title ?? ''} ${message ?? ''}`.toLowerCase();
  if (!source.trim()) {
    return 'starting-runtime';
  }

  if (
    source.includes('import')
    || source.includes('maven')
    || source.includes('gradle')
    || source.includes('classpath')
    || source.includes('build')
    || source.includes('project')
  ) {
    return 'importing-project';
  }

  if (
    source.includes('index')
    || source.includes('analy')
    || source.includes('semantic')
    || source.includes('symbol')
    || source.includes('scan')
    || source.includes('workspace')
  ) {
    return 'indexing-workspace';
  }

  if (
    source.includes('detect')
    || source.includes('interpreter')
    || source.includes('environment')
    || source.includes('venv')
    || source.includes('module')
    || source.includes('package')
  ) {
    return 'detecting-project';
  }

  return 'starting-runtime';
}

function formatProgressText(progress: ProgressEntry): string {
  const summary = progress.message || progress.title || '';
  if (typeof progress.percentage === 'number') {
    return summary ? `${summary} (${Math.round(progress.percentage)}%)` : `${Math.round(progress.percentage)}%`;
  }

  return summary;
}
