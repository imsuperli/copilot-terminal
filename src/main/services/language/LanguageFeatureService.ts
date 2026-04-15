import path from 'path';
import type {
  CodePaneCallHierarchyDirection,
  CodePaneCodeAction,
  CodePaneCompletionItem,
  CodePaneDiagnostic,
  CodePaneDocumentCloseConfig,
  CodePaneDocumentHighlight,
  CodePaneGetCallHierarchyConfig,
  CodePaneInlayHint,
  CodePaneDocumentSyncConfig,
  CodePaneDocumentSymbol,
  CodePaneFormatDocumentConfig,
  CodePaneLintDocumentConfig,
  CodePaneGetCodeActionsConfig,
  CodePaneGetCompletionItemsConfig,
  CodePaneGetDefinitionConfig,
  CodePaneGetDocumentHighlightsConfig,
  CodePaneGetInlayHintsConfig,
  CodePaneGetDocumentSymbolsConfig,
  CodePaneGetHoverConfig,
  CodePaneGetImplementationsConfig,
  CodePaneGetReferencesConfig,
  CodePaneGetSemanticTokenLegendConfig,
  CodePaneGetSemanticTokensConfig,
  CodePaneGetSignatureHelpConfig,
  CodePaneGetTypeHierarchyConfig,
  CodePaneGetWorkspaceSymbolsConfig,
  CodePaneHierarchyItem,
  CodePaneHierarchyResult,
  CodePaneHoverResult,
  CodePaneLocation,
  CodePaneReadFileConfig,
  CodePaneReadFileResult,
  CodePaneReference,
  CodePaneRenameSymbolConfig,
  CodePaneRunCodeActionConfig,
  CodePaneSemanticTokensLegend,
  CodePaneSemanticTokensResult,
  CodePaneSignatureHelpResult,
  CodePaneTextEdit,
  CodePaneTypeHierarchyDirection,
  CodePaneWorkspaceSymbol,
  CodePaneResolveCallHierarchyConfig,
  CodePaneResolveTypeHierarchyConfig,
} from '../../../shared/types/electron-api';
import type { Workspace } from '../../types/workspace';
import { CodeFileService } from '../code/CodeFileService';
import { PluginCapabilityRuntimeService } from '../plugins/PluginCapabilityRuntimeService';
import { LanguagePluginResolver, type ResolvedLanguagePlugin } from './LanguagePluginResolver';
import { LanguageServerSupervisor } from './LanguageServerSupervisor';

const TRANSIENT_DOCUMENT_OWNER_PREFIX = '__language-request__';

export interface LanguageFeatureServiceOptions {
  codeFileService: CodeFileService;
  resolver: LanguagePluginResolver;
  supervisor: LanguageServerSupervisor;
  pluginRuntimeService?: PluginCapabilityRuntimeService;
}

export class LanguageFeatureService {
  private readonly codeFileService: CodeFileService;
  private readonly resolver: LanguagePluginResolver;
  private readonly supervisor: LanguageServerSupervisor;
  private readonly pluginRuntimeService?: PluginCapabilityRuntimeService;
  private nextTransientOwnerSequence = 1;

  constructor(options: LanguageFeatureServiceOptions) {
    this.codeFileService = options.codeFileService;
    this.resolver = options.resolver;
    this.supervisor = options.supervisor;
    this.pluginRuntimeService = options.pluginRuntimeService;
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

  async getDocumentHighlights(
    config: CodePaneGetDocumentHighlightsConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneDocumentHighlight[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getDocumentHighlights(resolution, config.filePath, config.position)
    ));
  }

  async getDocumentSymbols(config: CodePaneGetDocumentSymbolsConfig, workspace: Workspace | null): Promise<CodePaneDocumentSymbol[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getDocumentSymbols(resolution, config.filePath)
    ));
  }

  async getInlayHints(config: CodePaneGetInlayHintsConfig, workspace: Workspace | null): Promise<CodePaneInlayHint[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getInlayHints(resolution, config.filePath, config.range)
    ));
  }

  async getCallHierarchy(
    config: CodePaneGetCallHierarchyConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneHierarchyResult> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, {
      root: null,
      items: [],
    }, async (resolution) => (
      await this.supervisor.getCallHierarchy(resolution, config.filePath, config.position, config.direction)
    ));
  }

  async resolveCallHierarchy(
    config: CodePaneResolveCallHierarchyConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneHierarchyItem[]> {
    return await this.resolveHierarchyChildren(
      config.rootPath,
      config.item,
      config.language,
      workspace,
      config.direction,
      async (resolution, item, direction) => await this.supervisor.resolveCallHierarchy(resolution, item, direction),
    );
  }

  async getTypeHierarchy(
    config: CodePaneGetTypeHierarchyConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneHierarchyResult> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, {
      root: null,
      items: [],
    }, async (resolution) => (
      await this.supervisor.getTypeHierarchy(resolution, config.filePath, config.position, config.direction)
    ));
  }

  async resolveTypeHierarchy(
    config: CodePaneResolveTypeHierarchyConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneHierarchyItem[]> {
    return await this.resolveHierarchyChildren(
      config.rootPath,
      config.item,
      config.language,
      workspace,
      config.direction,
      async (resolution, item, direction) => await this.supervisor.resolveTypeHierarchy(resolution, item, direction),
    );
  }

  async getSemanticTokenLegend(
    config: CodePaneGetSemanticTokenLegendConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneSemanticTokensLegend | null> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, null, async (resolution) => (
      await this.supervisor.getSemanticTokenLegend(resolution)
    ));
  }

  async getSemanticTokens(
    config: CodePaneGetSemanticTokensConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneSemanticTokensResult | null> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, null, async (resolution) => (
      await this.supervisor.getSemanticTokens(resolution, config.filePath)
    ));
  }

  async getImplementations(
    config: CodePaneGetImplementationsConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneLocation[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getImplementations(resolution, config.filePath, config.position)
    ));
  }

  async getCompletionItems(config: CodePaneGetCompletionItemsConfig, workspace: Workspace | null): Promise<CodePaneCompletionItem[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getCompletionItems(resolution, config.filePath, config.position, {
        triggerCharacter: config.triggerCharacter,
        triggerKind: config.triggerKind,
      })
    ));
  }

  async getSignatureHelp(config: CodePaneGetSignatureHelpConfig, workspace: Workspace | null): Promise<CodePaneSignatureHelpResult | null> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, null, async (resolution) => (
      await this.supervisor.getSignatureHelp(resolution, config.filePath, config.position, {
        triggerCharacter: config.triggerCharacter,
      })
    ));
  }

  async renameSymbol(config: CodePaneRenameSymbolConfig, workspace: Workspace | null): Promise<CodePaneTextEdit[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.renameSymbol(resolution, config.filePath, config.position, config.newName)
    ));
  }

  async formatDocument(config: CodePaneFormatDocumentConfig, workspace: Workspace | null): Promise<CodePaneTextEdit[]> {
    if (this.pluginRuntimeService) {
      const pluginEdits = await this.pluginRuntimeService.formatDocument({
        ...config,
        workspacePluginSettings: workspace?.settings.plugins,
      });
      if (pluginEdits) {
        return pluginEdits;
      }
    }

    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.formatDocument(resolution, config.filePath, {
        tabSize: config.tabSize,
        insertSpaces: config.insertSpaces,
      })
    ));
  }

  async lintDocument(config: CodePaneLintDocumentConfig, workspace: Workspace | null): Promise<CodePaneDiagnostic[]> {
    if (!this.pluginRuntimeService) {
      return [];
    }

    return await this.pluginRuntimeService.lintDocument({
      ...config,
      workspacePluginSettings: workspace?.settings.plugins,
    }) ?? [];
  }

  async getWorkspaceSymbols(config: CodePaneGetWorkspaceSymbolsConfig, workspace: Workspace | null): Promise<CodePaneWorkspaceSymbol[]> {
    const resolution = await this.resolveWorkspace(config.rootPath, workspace);
    if (!resolution) {
      return [];
    }

    return await this.supervisor.getWorkspaceSymbols(resolution, config.query, config.limit);
  }

  async getCodeActions(
    config: CodePaneGetCodeActionsConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneCodeAction[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.getCodeActions(resolution, config.filePath, config.range)
    ));
  }

  async runCodeAction(
    config: CodePaneRunCodeActionConfig,
    workspace: Workspace | null,
  ): Promise<CodePaneTextEdit[]> {
    return await this.withResolvedDocument(config.rootPath, config.filePath, config.language, workspace, [], async (resolution) => (
      await this.supervisor.runCodeAction(resolution, config.filePath, config.actionId)
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
    await this.pluginRuntimeService?.resetSessions(pluginId);
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
    const isVirtualDocument = isVirtualDocumentUri(filePath);
    const resolution = isVirtualDocument
      ? await this.resolveVirtualDocument(rootPath, workspace)
      : await this.resolve(rootPath, filePath, language, workspace);
    if (!resolution) {
      return fallback;
    }

    const transientOwnerId = `${TRANSIENT_DOCUMENT_OWNER_PREFIX}:${filePath}:${this.nextTransientOwnerSequence++}`;
    const didAttachToTrackedDocument = this.supervisor.attachDocumentOwner(
      resolution,
      transientOwnerId,
      rootPath,
      filePath,
    );
    if (!didAttachToTrackedDocument) {
      const readResponse = isVirtualDocument
        ? await this.supervisor.readVirtualDocument(resolution, filePath)
        : await this.codeFileService.readFile({
          rootPath,
          filePath,
        });
      if (!readResponse) {
        return fallback;
      }
      if (readResponse.isBinary) {
        return fallback;
      }

      await this.supervisor.syncDocument(resolution, {
        ownerId: transientOwnerId,
        rootPath,
        filePath,
        languageId: language ?? readResponse.language,
        content: readResponse.content,
      }, 'open');
    }

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

  private async resolveWorkspace(
    rootPath: string,
    workspace: Workspace | null,
  ): Promise<ResolvedLanguagePlugin | null> {
    return await this.resolver.resolve({
      rootPath,
      filePath: path.join(rootPath, '__workspace__.txt'),
      workspacePluginSettings: workspace?.settings.plugins,
    });
  }

  private async resolveHierarchyChildren<TDirection extends CodePaneCallHierarchyDirection | CodePaneTypeHierarchyDirection>(
    rootPath: string,
    item: CodePaneHierarchyItem,
    language: string | undefined,
    workspace: Workspace | null,
    direction: TDirection,
    callback: (
      resolution: ResolvedLanguagePlugin,
      hierarchyItem: CodePaneHierarchyItem,
      hierarchyDirection: TDirection,
    ) => Promise<CodePaneHierarchyItem[]>,
  ): Promise<CodePaneHierarchyItem[]> {
    return await this.withResolvedDocument(rootPath, item.filePath, language ?? item.language, workspace, [], async (resolution) => (
      await callback(resolution, item, direction)
    ));
  }
}

function createOwnerId(paneId: string, filePath: string): string {
  return `${paneId}:${filePath}`;
}

function isVirtualDocumentUri(filePath: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(filePath) && !filePath.toLowerCase().startsWith('file://');
}
