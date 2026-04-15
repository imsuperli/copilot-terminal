import type {
  CodePaneLanguagePrewarmConfig,
  CodePaneLanguageWorkspaceState,
} from '../../../shared/types/electron-api';
import type { Workspace } from '../../types/workspace';
import type { LanguageFeatureService } from './LanguageFeatureService';

export interface AttachLanguageWorkspaceConfig extends CodePaneLanguagePrewarmConfig {
  paneId: string;
}

interface HostRecord {
  workspaceKey: string;
  paneIds: Set<string>;
}

export interface LanguageWorkspaceHostServiceOptions {
  languageFeatureService: LanguageFeatureService;
  getCurrentWorkspace: () => Workspace | null;
}

export class LanguageWorkspaceHostService {
  private readonly languageFeatureService: LanguageFeatureService;
  private readonly getCurrentWorkspace: () => Workspace | null;
  private readonly hosts = new Map<string, HostRecord>();
  private readonly paneWorkspaceKeys = new Map<string, string>();
  private readonly inflightPrewarms = new Map<string, Promise<CodePaneLanguageWorkspaceState | null>>();

  constructor(options: LanguageWorkspaceHostServiceOptions) {
    this.languageFeatureService = options.languageFeatureService;
    this.getCurrentWorkspace = options.getCurrentWorkspace;
  }

  async attachPane(config: AttachLanguageWorkspaceConfig): Promise<CodePaneLanguageWorkspaceState | null> {
    const workspaceKey = createWorkspaceKey(config.rootPath, config.language);
    const existingWorkspaceKey = this.paneWorkspaceKeys.get(config.paneId);
    if (existingWorkspaceKey && existingWorkspaceKey !== workspaceKey) {
      this.detachPane(config.paneId);
    }

    let host = this.hosts.get(workspaceKey);
    if (!host) {
      host = {
        workspaceKey,
        paneIds: new Set<string>(),
      };
      this.hosts.set(workspaceKey, host);
    }

    host.paneIds.add(config.paneId);
    this.paneWorkspaceKeys.set(config.paneId, workspaceKey);

    const currentState = await this.languageFeatureService.getWorkspaceState(config, this.getCurrentWorkspace());
    if (
      currentState
      && currentState.phase !== 'error'
      && currentState.runtimeState !== 'idle'
      && currentState.runtimeState !== 'stopped'
    ) {
      return currentState;
    }

    return await this.ensurePrewarmed(workspaceKey, config);
  }

  async getState(config: CodePaneLanguagePrewarmConfig): Promise<CodePaneLanguageWorkspaceState | null> {
    return await this.languageFeatureService.getWorkspaceState(config, this.getCurrentWorkspace());
  }

  detachPane(paneId: string): void {
    const workspaceKey = this.paneWorkspaceKeys.get(paneId);
    if (!workspaceKey) {
      return;
    }

    this.paneWorkspaceKeys.delete(paneId);
    const host = this.hosts.get(workspaceKey);
    if (!host) {
      return;
    }

    host.paneIds.delete(paneId);
    if (host.paneIds.size === 0) {
      this.hosts.delete(workspaceKey);
    }
  }

  private async ensurePrewarmed(
    workspaceKey: string,
    config: CodePaneLanguagePrewarmConfig,
  ): Promise<CodePaneLanguageWorkspaceState | null> {
    const existingPrewarm = this.inflightPrewarms.get(workspaceKey);
    if (existingPrewarm) {
      return await existingPrewarm;
    }

    const prewarmPromise = (async () => {
      await this.languageFeatureService.prewarmWorkspace(config, this.getCurrentWorkspace());
      return await this.languageFeatureService.getWorkspaceState(config, this.getCurrentWorkspace());
    })().finally(() => {
      this.inflightPrewarms.delete(workspaceKey);
    });

    this.inflightPrewarms.set(workspaceKey, prewarmPromise);
    return await prewarmPromise;
  }
}

function createWorkspaceKey(rootPath: string, language?: string): string {
  return `${rootPath}::${language ?? ''}`;
}
