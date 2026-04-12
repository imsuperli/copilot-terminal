import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import type {
  CodePaneGitStatusConfig,
  CodePaneListDirectoryConfig,
  CodePaneReadFileConfig,
  CodePaneReadGitBaseFileConfig,
  CodePaneSearchFilesConfig,
  CodePaneWatchRootConfig,
  CodePaneWriteFileConfig,
} from '../../shared/types/electron-api';

export function registerCodePaneHandlers(ctx: HandlerContext) {
  const { codeFileService, codeGitService, codePaneWatcherService } = ctx;

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

      await codePaneWatcherService.watchRoot(config.paneId, config.rootPath);
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

      await codePaneWatcherService.unwatchRoot(paneId);
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
}
