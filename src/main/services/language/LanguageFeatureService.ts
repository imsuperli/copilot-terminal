import path from 'path';
import type {
  CodePaneDocumentCloseConfig,
  CodePaneDocumentSyncConfig,
  CodePaneDocumentSymbol,
  CodePaneGetDefinitionConfig,
  CodePaneGetDocumentSymbolsConfig,
  CodePaneGetHoverConfig,
  CodePaneGetReferencesConfig,
  CodePaneHoverResult,
  CodePaneLocation,
  CodePaneReadFileConfig,
  CodePaneReadFileResult,
  CodePaneReference,
} from '../../../shared/types/electron-api';
import type { Workspace } from '../../types/workspace';
import { CodeFileService } from '../code/CodeFileService';
import { LanguagePluginResolver, type ResolvedLanguagePlugin } from './LanguagePluginResolver';
import { LanguageServerSupervisor } from './LanguageServerSupervisor';

const TRANSIENT_DOCUMENT_OWNER_PREFIX = '__language-request__';

export interface LanguageFeatureServiceOptions {
  codeFileService: CodeFileService;
  resolver: LanguagePluginResolver;
  supervisor: LanguageServerSupervisor;
}

export class LanguageFeatureService {
  private readonly codeFileService: CodeFileService;
  private readonly resolver: LanguagePluginResolver;
  private readonly supervisor: LanguageServerSupervisor;

  constructor(options: LanguageFeatureServiceOptions) {
    this.codeFileService = options.codeFileService;
    this.resolver = options.resolver;
    this.supervisor = options.supervisor;
  }

  async openDocument(config: CodePaneDocumentSyncConfig, workspace: Workspace | null): Promise<void> {
    const resolution = await this.resolve(config.rootPath, config.filePath, config.language, workspace);
    if (!resolution) {
      return;
    }

    await this.supervisor.syncDocument(resolution, {
      ownerId: createOwnerId(config.paneId, config.filePath),
      rootPath: config.rootPath,
      filePath: config.filePath,
      languageId: config.language ?? resolution.languageId,
      content: config.content,
    }, 'open');
  }

  async changeDocument(config: CodePaneDocumentSyncConfig, workspace: Workspace | null): Promise<void> {
    const resolution = await this.resolve(config.rootPath, config.filePath, config.language, workspace);
    if (!resolution) {
      return;
    }

    await this.supervisor.syncDocument(resolution, {
      ownerId: createOwnerId(config.paneId, config.filePath),
      rootPath: config.rootPath,
      filePath: config.filePath,
      languageId: config.language ?? resolution.languageId,
      content: config.content,
    }, 'change');
  }

  async saveDocument(config: CodePaneDocumentSyncConfig, workspace: Workspace | null): Promise<void> {
    const resolution = await this.resolve(config.rootPath, config.filePath, config.language, workspace);
    if (!resolution) {
      return;
    }

    await this.supervisor.syncDocument(resolution, {
      ownerId: createOwnerId(config.paneId, config.filePath),
      rootPath: config.rootPath,
      filePath: config.filePath,
      languageId: config.language ?? resolution.languageId,
      content: config.content,
    }, 'save');
  }

  async closeDocument(config: CodePaneDocumentCloseConfig, workspace: Workspace | null): Promise<void> {
    const resolution = await this.resolve(config.rootPath, config.filePath, undefined, workspace);
    if (!resolution) {
      return;
    }

    await this.supervisor.closeDocument(
      resolution,
      createOwnerId(config.paneId, config.filePath),
      config.filePath,
    );
  }

  async getDefinition(config: CodePaneGetDefinitionConfig, workspace: Workspace | null): Promise<CodePaneLocation[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getDefinition(resolution, config.filePath, config.position)
    ));
  }

  async getHover(config: CodePaneGetHoverConfig, workspace: Workspace | null): Promise<CodePaneHoverResult | null> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, null, async (resolution) => (
      await this.supervisor.getHover(resolution, config.filePath, config.position)
    ));
  }

  async getReferences(config: CodePaneGetReferencesConfig, workspace: Workspace | null): Promise<CodePaneReference[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getReferences(resolution, config.filePath, config.position)
    ));
  }

  async getDocumentSymbols(config: CodePaneGetDocumentSymbolsConfig, workspace: Workspace | null): Promise<CodePaneDocumentSymbol[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getDocumentSymbols(resolution, config.filePath)
    ));
  }

  async readDocument(config: CodePaneReadFileConfig, workspace: Workspace | null): Promise<CodePaneReadFileResult | null> {
    if (!config.documentUri) {
      return await this.codeFileService.readFile(config);
    }

    const resolution = await this.resolveVirtualDocument(config.rootPath, workspace);
    if (!resolution) {
      return null;
    }

    return await this.supervisor.readVirtualDocument(resolution, config.documentUri);
  }

  async resetSessions(pluginId?: string): Promise<void> {
    this.resolver.invalidate();
    await this.supervisor.resetSessions(pluginId);
  }

  private async withResolvedDocument<T>(
    rootPath: string,
    filePath: string,
    language: string | undefined,
    workspace: Workspace | null,
    fallback: T,
    callback: (resolution: ResolvedLanguagePlugin) => Promise<T>,
  ): Promise<T> {
    const resolution = await this.resolve(rootPath, filePath, language, workspace);
    if (!resolution) {
      return fallback;
    }

    if (this.supervisor.hasDocument(resolution, filePath)) {
      return await callback(resolution);
    }

    const readResponse = await this.codeFileService.readFile({
      rootPath,
      filePath,
    });
    if (readResponse.isBinary) {
      return fallback;
    }

    const transientOwnerId = `${TRANSIENT_DOCUMENT_OWNER_PREFIX}:${filePath}`;
    await this.supervisor.syncDocument(resolution, {
      ownerId: transientOwnerId,
      rootPath,
      filePath,
      languageId: language ?? readResponse.language,
      content: readResponse.content,
    }, 'open');

    try {
      return await callback(resolution);
    } finally {
      await this.supervisor.closeDocument(resolution, transientOwnerId, filePath);
    }
  }

  private async resolve(
    rootPath: string,
    filePath: string,
    language: string | undefined,
    workspace: Workspace | null,
  ): Promise<ResolvedLanguagePlugin | null> {
    return await this.resolver.resolve({
      rootPath,
      filePath,
      language,
      workspacePluginSettings: workspace?.settings.plugins,
    });
  }

  private async resolveVirtualDocument(
    rootPath: string,
    workspace: Workspace | null,
  ): Promise<ResolvedLanguagePlugin | null> {
    return await this.resolver.resolve({
      rootPath,
      filePath: path.join(rootPath, '__virtual__.java'),
      language: 'java',
      workspacePluginSettings: workspace?.settings.plugins,
    });
  }
}

function createOwnerId(paneId: string, filePath: string): string {
  return `${paneId}:${filePath}`;
}
