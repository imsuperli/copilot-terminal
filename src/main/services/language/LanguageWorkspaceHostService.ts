import type {
  CodePaneLanguagePrewarmConfig,
  CodePaneLanguageWorkspaceState,
} from '../../../shared/types/electron-api';
import type { Workspace } from '../../types/workspace';
import type { LanguageFeatureService } from './LanguageFeatureService';
import type { LanguagePluginResolver } from './LanguagePluginResolver';

export interface AttachLanguageWorkspaceConfig extends CodePaneLanguagePrewarmConfig {
  paneId: string;
}

interface HostRecord {
  workspaceKey: string;
  paneIds: Set<string>;
}

export interface LanguageWorkspaceHostServiceOptions {
  languageFeatureService: LanguageFeatureService;
  languagePluginResolver: LanguagePluginResolver;
  getCurrentWorkspace: () => Workspace | null;
}

export class LanguageWorkspaceHostService {
  private readonly languageFeatureService: LanguageFeatureService;
  private readonly languagePluginResolver: LanguagePluginResolver;
  private readonly getCurrentWorkspace: () => Workspace | null;
  private readonly hosts = new Map<string, HostRecord>();
  private readonly paneWorkspaceKeys = new Map<string, string>();
  private readonly inflightPrewarms = new Map<string, Promise<CodePaneLanguageWorkspaceState | null>>();

  constructor(options: LanguageWorkspaceHostServiceOptions) {
    this.languageFeatureService = options.languageFeatureService;
    this.languagePluginResolver = options.languagePluginResolver;
    this.getCurrentWorkspace = options.getCurrentWorkspace;
  }

  async attachPane(config: AttachLanguageWorkspaceConfig): Promise<CodePaneLanguageWorkspaceState | null> {
    const normalizedConfig = await this.normalizeConfig(config);
    const workspaceKey = createWorkspaceKey(normalizedConfig.rootPath, normalizedConfig.language);
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

    const currentState = await this.languageFeatureService.getWorkspaceState(normalizedConfig, this.getCurrentWorkspace());
    if (
      currentState
      && currentState.phase !== 'error'
      && currentState.runtimeState !== 'idle'
      && currentState.runtimeState !== 'stopped'
    ) {
      return currentState;
    }

    return await this.ensurePrewarmed(workspaceKey, normalizedConfig);
  }

  async getState(config: CodePaneLanguagePrewarmConfig): Promise<CodePaneLanguageWorkspaceState | null> {
    return await this.languageFeatureService.getWorkspaceState(config, this.getCurrentWorkspace());
  }

  async prewarmProject(rootPath: string): Promise<void> {
    const workspace = this.getCurrentWorkspace();
    const warmupResolution = await this.languagePluginResolver.resolveWorkspaceWarmup(
      rootPath,
      workspace?.settings.plugins,
    );
    if (!warmupResolution) {
      return;
    }

    await this.ensurePrewarmed(
      createWorkspaceKey(rootPath, warmupResolution.languageId),
      {
        rootPath,
        filePath: `${warmupResolution.projectRoot}/__workspace__.${extensionForLanguage(warmupResolution.languageId)}`,
        language: warmupResolution.languageId,
      },
    );
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

  private async normalizeConfig(config: CodePaneLanguagePrewarmConfig): Promise<CodePaneLanguagePrewarmConfig> {
    if (config.language) {
      return config;
    }

    const currentState = await this.languageFeatureService.getWorkspaceState(config, this.getCurrentWorkspace());
    if (currentState?.languageId) {
      return {
        ...config,
        language: currentState.languageId,
      };
    }

    const warmupResolution = await this.languagePluginResolver.resolveWorkspaceWarmup(
      config.rootPath,
      this.getCurrentWorkspace()?.settings.plugins,
    );
    if (!warmupResolution) {
      return config;
    }

    return {
      ...config,
      filePath: `${warmupResolution.projectRoot}/__workspace__.${extensionForLanguage(warmupResolution.languageId)}`,
      language: warmupResolution.languageId,
    };
  }
}

function createWorkspaceKey(rootPath: string, language?: string): string {
  return `${rootPath}::${language ?? ''}`;
}

function extensionForLanguage(languageId: string): string {
  switch (languageId) {
    case 'java':
      return 'java';
    case 'python':
      return 'py';
    case 'go':
      return 'go';
    case 'javascript':
      return 'js';
    case 'typescript':
      return 'ts';
    default:
      return 'txt';
  }
}
