import { ipcMain } from 'electron';
import path from 'path';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import type {
  CodePaneGetExternalLibrarySectionsConfig,
  CodePaneGetProjectContributionConfig,
  CodePaneGitGraphConfig,
  CodePaneGitStatusConfig,
  CodePaneListDirectoryConfig,
  CodePaneListRunTargetsConfig,
  CodePaneListTestsConfig,
  CodePaneReadFileConfig,
  CodePaneReadGitBaseFileConfig,
  CodePaneRerunFailedTestsConfig,
  CodePaneRunProjectCommandConfig,
  CodePaneRunTargetConfig,
  CodePaneRunTestsConfig,
  CodePaneSearchContentsConfig,
  CodePaneSearchFilesConfig,
  CodePaneStopRunTargetConfig,
  CodePaneWatchRootConfig,
  CodePaneWriteFileConfig,
} from '../../shared/types/electron-api';

export function registerCodePaneHandlers(ctx: HandlerContext) {
  const {
    codeFileService,
    codeGitService,
    codePaneWatcherService,
    codeProjectIndexService,
    codeRunProfileService,
    codeTestService,
    languageFeatureService,
    languageProjectContributionService,
    getMainWindow,
  } = ctx;

  ipcMain.handle('code-pane-list-directory', async (_event, config: CodePaneListDirectoryConfig) => {
    try {
      const targetPath = config.targetPath;
      const isExternalLibraryPath = targetPath && languageProjectContributionService
        ? await languageProjectContributionService.hasExternalLibraryPath(config.rootPath, targetPath)
        : false;

      if (!targetPath || (!isExternalLibraryPath && isPathWithin(config.rootPath, targetPath))) {
        if (!codeFileService) {
          throw new Error('CodeFileService not initialized');
        }

        return successResponse(await codeFileService.listDirectory(config));
      }

      if (!languageProjectContributionService) {
        throw new Error('LanguageProjectContributionService not initialized');
      }

      return successResponse(await languageProjectContributionService.listDirectory(config));
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

      const isExternalLibraryPath = languageProjectContributionService
        ? await languageProjectContributionService.hasExternalLibraryPath(config.rootPath, config.filePath)
        : false;

      if (!isExternalLibraryPath && isPathWithin(config.rootPath, config.filePath)) {
        if (!codeFileService) {
          throw new Error('CodeFileService not initialized');
        }

        return successResponse(await codeFileService.readFile(config));
      }

      if (!languageProjectContributionService) {
        throw new Error('LanguageProjectContributionService not initialized');
      }

      return successResponse(await languageProjectContributionService.readFile(config));
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

  ipcMain.handle('code-pane-git-repository-summary', async (_event, config: CodePaneGitStatusConfig) => {
    try {
      if (!codeGitService) {
        throw new Error('CodeGitService not initialized');
      }

      return successResponse(await codeGitService.getRepositorySummary(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-graph', async (_event, config: CodePaneGitGraphConfig) => {
    try {
      if (!codeGitService) {
        throw new Error('CodeGitService not initialized');
      }

      return successResponse(await codeGitService.getGraph(config));
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

  ipcMain.handle('code-pane-get-external-library-sections', async (_event, config: CodePaneGetExternalLibrarySectionsConfig) => {
    try {
      if (!languageProjectContributionService) {
        throw new Error('LanguageProjectContributionService not initialized');
      }

      return successResponse(await languageProjectContributionService.getExternalLibrarySections(config.rootPath));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-project-contribution', async (_event, config: CodePaneGetProjectContributionConfig) => {
    try {
      if (!languageProjectContributionService) {
        throw new Error('LanguageProjectContributionService not initialized');
      }

      return successResponse(await languageProjectContributionService.getProjectContributions(config.rootPath));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-refresh-project-model', async (_event, config: CodePaneGetProjectContributionConfig) => {
    try {
      if (!languageProjectContributionService) {
        throw new Error('LanguageProjectContributionService not initialized');
      }

      return successResponse(await languageProjectContributionService.refreshProjectModel(config.rootPath));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-run-project-command', async (_event, config: CodePaneRunProjectCommandConfig) => {
    try {
      if (!languageProjectContributionService) {
        throw new Error('LanguageProjectContributionService not initialized');
      }

      return successResponse(await languageProjectContributionService.runProjectCommand(config.rootPath, config.commandId));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-list-run-targets', async (_event, config: CodePaneListRunTargetsConfig) => {
    try {
      if (!codeRunProfileService) {
        throw new Error('CodeRunProfileService not initialized');
      }

      return successResponse(await codeRunProfileService.listRunTargets(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-run-target', async (_event, config: CodePaneRunTargetConfig) => {
    try {
      if (!codeRunProfileService) {
        throw new Error('CodeRunProfileService not initialized');
      }

      return successResponse(await codeRunProfileService.runTarget(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-stop-run-target', async (_event, config: CodePaneStopRunTargetConfig) => {
    try {
      if (!codeRunProfileService) {
        throw new Error('CodeRunProfileService not initialized');
      }

      await codeRunProfileService.stopRunTarget(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-list-tests', async (_event, config: CodePaneListTestsConfig) => {
    try {
      if (!codeTestService) {
        throw new Error('CodeTestService not initialized');
      }

      return successResponse(await codeTestService.listTests(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-run-tests', async (_event, config: CodePaneRunTestsConfig) => {
    try {
      if (!codeTestService) {
        throw new Error('CodeTestService not initialized');
      }

      return successResponse(await codeTestService.runTests(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-rerun-failed-tests', async (_event, config: CodePaneRerunFailedTestsConfig) => {
    try {
      if (!codeTestService) {
        throw new Error('CodeTestService not initialized');
      }

      return successResponse(await codeTestService.rerunFailedTests(config.rootPath));
    } catch (error) {
      return errorResponse(error);
    }
  });
}

function isPathWithin(rootPath: string, targetPath: string): boolean {
  const normalizedRootPath = path.resolve(rootPath);
  const normalizedTargetPath = path.resolve(targetPath);
  const relativePath = path.relative(normalizedRootPath, normalizedTargetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}
