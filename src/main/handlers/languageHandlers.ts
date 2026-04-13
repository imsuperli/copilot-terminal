import { ipcMain } from 'electron';
import type {
  CodePaneFormatDocumentConfig,
  CodePaneGetCompletionItemsConfig,
  CodePaneDocumentCloseConfig,
  CodePaneDocumentSyncConfig,
  CodePaneGetDefinitionConfig,
  CodePaneGetDocumentSymbolsConfig,
  CodePaneGetHoverConfig,
  CodePaneGetReferencesConfig,
  CodePaneGetSignatureHelpConfig,
  CodePaneGetWorkspaceSymbolsConfig,
  CodePaneRenameSymbolConfig,
} from '../../shared/types/electron-api';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';

export function registerLanguageHandlers(ctx: HandlerContext) {
  const { languageFeatureService, getCurrentWorkspace } = ctx;

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
}
