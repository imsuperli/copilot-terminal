import { ipcMain } from 'electron';
import type {
  AttachCodePaneLanguageWorkspaceConfig,
  CodePaneGetCallHierarchyConfig,
  CodePaneGetCodeActionsConfig,
  CodePaneFormatDocumentConfig,
  CodePaneLintDocumentConfig,
  CodePaneGetCompletionItemsConfig,
  CodePaneDocumentCloseConfig,
  CodePaneDocumentSyncConfig,
  CodePaneLanguagePrewarmConfig,
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
  CodePaneResolveCallHierarchyConfig,
  CodePaneResolveTypeHierarchyConfig,
  CodePaneGetWorkspaceSymbolsConfig,
  CodePaneRenameSymbolConfig,
  CodePaneRunCodeActionConfig,
} from '../../shared/types/electron-api';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';

export function registerLanguageHandlers(ctx: HandlerContext) {
  const { languageFeatureService, languageWorkspaceHostService, getCurrentWorkspace } = ctx;

  ipcMain.handle('code-pane-did-open-document', async (_event, config: CodePaneDocumentSyncConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      await languageFeatureService.openDocument(config, getCurrentWorkspace());
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-did-change-document', async (_event, config: CodePaneDocumentSyncConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      await languageFeatureService.changeDocument(config, getCurrentWorkspace());
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-did-save-document', async (_event, config: CodePaneDocumentSyncConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      await languageFeatureService.saveDocument(config, getCurrentWorkspace());
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-did-close-document', async (_event, config: CodePaneDocumentCloseConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      await languageFeatureService.closeDocument(config, getCurrentWorkspace());
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-prewarm-language-workspace', async (_event, config: CodePaneLanguagePrewarmConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      await languageFeatureService.prewarmWorkspace(config, getCurrentWorkspace());
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-attach-language-workspace', async (
    _event,
    config: AttachCodePaneLanguageWorkspaceConfig,
  ) => {
    try {
      if (!languageWorkspaceHostService) {
        throw new Error('LanguageWorkspaceHostService not initialized');
      }

      return successResponse(await languageWorkspaceHostService.attachPane(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-language-workspace-state', async (_event, config: CodePaneLanguagePrewarmConfig) => {
    try {
      if (!languageWorkspaceHostService) {
        throw new Error('LanguageWorkspaceHostService not initialized');
      }

      return successResponse(await languageWorkspaceHostService.getState(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-detach-language-workspace', async (_event, { paneId }: { paneId: string }) => {
    try {
      if (!languageWorkspaceHostService) {
        throw new Error('LanguageWorkspaceHostService not initialized');
      }

      languageWorkspaceHostService.detachPane(paneId);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-definition', async (_event, config: CodePaneGetDefinitionConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getDefinition(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-hover', async (_event, config: CodePaneGetHoverConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getHover(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-references', async (_event, config: CodePaneGetReferencesConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getReferences(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-document-highlights', async (
    _event,
    config: CodePaneGetDocumentHighlightsConfig,
  ) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getDocumentHighlights(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-document-symbols', async (_event, config: CodePaneGetDocumentSymbolsConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getDocumentSymbols(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-inlay-hints', async (_event, config: CodePaneGetInlayHintsConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getInlayHints(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-call-hierarchy', async (_event, config: CodePaneGetCallHierarchyConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getCallHierarchy(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-resolve-call-hierarchy', async (_event, config: CodePaneResolveCallHierarchyConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.resolveCallHierarchy(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-type-hierarchy', async (_event, config: CodePaneGetTypeHierarchyConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getTypeHierarchy(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-resolve-type-hierarchy', async (_event, config: CodePaneResolveTypeHierarchyConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.resolveTypeHierarchy(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-semantic-token-legend', async (_event, config: CodePaneGetSemanticTokenLegendConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getSemanticTokenLegend(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-semantic-tokens', async (_event, config: CodePaneGetSemanticTokensConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getSemanticTokens(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-implementations', async (_event, config: CodePaneGetImplementationsConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getImplementations(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-completion-items', async (_event, config: CodePaneGetCompletionItemsConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getCompletionItems(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-signature-help', async (_event, config: CodePaneGetSignatureHelpConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getSignatureHelp(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-rename-symbol', async (_event, config: CodePaneRenameSymbolConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.renameSymbol(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-format-document', async (_event, config: CodePaneFormatDocumentConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.formatDocument(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-lint-document', async (_event, config: CodePaneLintDocumentConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.lintDocument(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-workspace-symbols', async (_event, config: CodePaneGetWorkspaceSymbolsConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getWorkspaceSymbols(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-code-actions', async (_event, config: CodePaneGetCodeActionsConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.getCodeActions(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-run-code-action', async (_event, config: CodePaneRunCodeActionConfig) => {
    try {
      if (!languageFeatureService) {
        throw new Error('LanguageFeatureService not initialized');
      }

      return successResponse(await languageFeatureService.runCodeAction(config, getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });
}
