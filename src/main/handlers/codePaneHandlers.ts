import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import type {
  CodePaneGitStatusConfig,
  CodePaneListDirectoryConfig,
  CodePaneReadFileConfig,
  CodePaneReadGitBaseFileConfig,
  CodePaneSearchContentsConfig,
  CodePaneSearchFilesConfig,
  CodePaneWatchRootConfig,
  CodePaneWriteFileConfig,
} from '../../shared/types/electron-api';

export function registerCodePaneHandlers(ctx: HandlerContext) {
  const {
    codeFileService,
    codeGitService,
    codePaneWatcherService,
    codeProjectIndexService,
    languageFeatureService,
    getMainWindow,
  } = ctx;

  ipcMain.handle('code-pane-list-directory', async (_event, config: CodePaneListDirectoryConfig) => {
    try {
      if (!codeFileService) {
        throw new Error('CodeFileService not initialized');
      }

      return successResponse(await codeFileService.listDirectory(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-read-file', async (_event, config: CodePaneReadFileConfig) => {
    try {
      if (config.documentUri) {
        if (!languageFeatureService) {
          throw new Error('LanguageFeatureService not initialized');
        }

        const result = await languageFeatureService.readDocument(config, ctx.getCurrentWorkspace());
        if (!result) {
          throw new Error(`Unable to read virtual document: ${config.documentUri}`);
        }
        return successResponse(result);
      }

      if (!codeFileService) {
        throw new Error('CodeFileService not initialized');
      }

      return successResponse(await codeFileService.readFile(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-write-file', async (_event, config: CodePaneWriteFileConfig) => {
    try {
      if (!codeFileService) {
        throw new Error('CodeFileService not initialized');
      }

      return successResponse(await codeFileService.writeFile(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-status', async (_event, config: CodePaneGitStatusConfig) => {
    try {
      if (!codeGitService) {
        throw new Error('CodeGitService not initialized');
      }

      return successResponse(await codeGitService.getStatus(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-read-git-base-file', async (_event, config: CodePaneReadGitBaseFileConfig) => {
    try {
      if (!codeGitService) {
        throw new Error('CodeGitService not initialized');
      }

      return successResponse(await codeGitService.readGitBaseFile(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-watch-root', async (_event, config: CodePaneWatchRootConfig) => {
    try {
      if (!codePaneWatcherService) {
        throw new Error('CodePaneWatcherService not initialized');
      }
      if (!codeProjectIndexService) {
        throw new Error('CodeProjectIndexService not initialized');
      }

      await codePaneWatcherService.watchRoot(config.paneId, config.rootPath);
      void codeProjectIndexService.watchProjectForPane(config.paneId, config.rootPath).catch((error) => {
        console.error('[CodePaneHandlers] Failed to initialize project index:', error);
        const mainWindow = getMainWindow?.();
        if (!mainWindow || mainWindow.isDestroyed()) {
          return;
        }

        mainWindow.webContents.send('code-pane-index-progress', {
          paneId: config.paneId,
          rootPath: config.rootPath,
          state: 'error',
          processedDirectoryCount: 0,
          totalDirectoryCount: 0,
          indexedFileCount: 0,
          reusedPersistedIndex: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-unwatch-root', async (_event, { paneId }: { paneId: string }) => {
    try {
      if (!codePaneWatcherService) {
        throw new Error('CodePaneWatcherService not initialized');
      }
      if (!codeProjectIndexService) {
        throw new Error('CodeProjectIndexService not initialized');
      }

      await Promise.all([
        codePaneWatcherService.unwatchRoot(paneId),
        codeProjectIndexService.unwatchProjectForPane(paneId),
      ]);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-search-files', async (_event, config: CodePaneSearchFilesConfig) => {
    try {
      if (!codeFileService) {
        throw new Error('CodeFileService not initialized');
      }

      return successResponse(await codeFileService.searchFiles(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-search-contents', async (_event, config: CodePaneSearchContentsConfig) => {
    try {
      if (!codeFileService) {
        throw new Error('CodeFileService not initialized');
      }

      return successResponse(await codeFileService.searchContents(config));
    } catch (error) {
      return errorResponse(error);
    }
  });
}
