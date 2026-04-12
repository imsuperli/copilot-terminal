import { ipcMain } from 'electron';
import type {
  CodePaneDocumentCloseConfig,
  CodePaneDocumentSyncConfig,
  CodePaneGetDefinitionConfig,
  CodePaneGetDocumentSymbolsConfig,
  CodePaneGetHoverConfig,
  CodePaneGetReferencesConfig,
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
}
