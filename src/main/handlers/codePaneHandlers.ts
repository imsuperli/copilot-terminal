import { ipcMain } from 'electron';
import path from 'path';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import type {
  CodePaneApplyRefactorConfig,
  CodePaneDebugControlConfig,
  CodePaneDebugEvaluateConfig,
  CodePaneDebugStartConfig,
  CodePaneGetExternalLibrarySectionsConfig,
  CodePaneGitApplyConflictResolutionConfig,
  CodePaneGetDebugSessionDetailsConfig,
  CodePaneGetExceptionBreakpointsConfig,
  CodePaneListDebugSessionsConfig,
  CodePaneGetProjectContributionConfig,
  CodePaneGitBlameConfig,
  CodePaneGitApplyRebasePlanConfig,
  CodePaneGitBranchListConfig,
  CodePaneGitCheckoutConfig,
  CodePaneGitCherryPickConfig,
  CodePaneGitConflictDetailsConfig,
  CodePaneGitCommitConfig,
  CodePaneGitDeleteBranchConfig,
  CodePaneGitDiscardConfig,
  CodePaneGitDiffHunksConfig,
  CodePaneGitGraphConfig,
  CodePaneGitHistoryConfig,
  CodePaneGitHunkActionConfig,
  CodePaneGitRenameBranchConfig,
  CodePaneGitRebaseControlConfig,
  CodePaneGitRebasePlanConfig,
  CodePaneGitResolveConflictConfig,
  CodePaneGitStageConfig,
  CodePaneGitStashConfig,
  CodePaneGitStatusConfig,
  CodePaneListDirectoryConfig,
  CodePaneListRunTargetsConfig,
  CodePaneListTestsConfig,
  CodePanePrepareRefactorConfig,
  CodePaneReadFileConfig,
  CodePaneReadGitBaseFileConfig,
  CodePaneRerunFailedTestsConfig,
  CodePaneRunProjectCommandConfig,
  CodePaneRunTargetConfig,
  CodePaneRunTestsConfig,
  CodePaneRemoveBreakpointConfig,
  CodePaneSearchContentsConfig,
  CodePaneSearchFilesConfig,
  CodePaneSetExceptionBreakpointsConfig,
  CodePaneSetBreakpointConfig,
  CodePaneStopRunTargetConfig,
  CodePaneWatchRootConfig,
  CodePaneWriteFileConfig,
} from '../../shared/types/electron-api';

export function registerCodePaneHandlers(ctx: HandlerContext) {
  const {
    codeFileService,
    codeGitBlameService,
    codeGitHistoryService,
    codeGitOperationService,
    codeGitService,
    codePaneWatcherService,
    codeProjectIndexService,
    codeRefactorService,
    codeRunProfileService,
    codeTestService,
    debugAdapterSupervisor,
    languageFeatureService,
    languageProjectContributionService,
    languageWorkspaceHostService,
    getCurrentWorkspace,
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

  ipcMain.handle('code-pane-git-diff-hunks', async (_event, config: CodePaneGitDiffHunksConfig) => {
    try {
      if (!codeGitService) {
        throw new Error('CodeGitService not initialized');
      }

      return successResponse(await codeGitService.getDiffHunks(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-stage', async (_event, config: CodePaneGitStageConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.stage(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-unstage', async (_event, config: CodePaneGitStageConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.unstage(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-discard', async (_event, config: CodePaneGitDiscardConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.discard(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-stage-hunk', async (_event, config: CodePaneGitHunkActionConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.stageHunk(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-unstage-hunk', async (_event, config: CodePaneGitHunkActionConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.unstageHunk(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-discard-hunk', async (_event, config: CodePaneGitHunkActionConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.discardHunk(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-commit', async (_event, config: CodePaneGitCommitConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      return successResponse(await codeGitOperationService.commit(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-stash', async (_event, config: CodePaneGitStashConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      return successResponse(await codeGitOperationService.stash(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-checkout', async (_event, config: CodePaneGitCheckoutConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.checkout(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-branches', async (_event, config: CodePaneGitBranchListConfig) => {
    try {
      if (!codeGitService) {
        throw new Error('CodeGitService not initialized');
      }

      return successResponse(await codeGitService.getBranches(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-rename-branch', async (_event, config: CodePaneGitRenameBranchConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.renameBranch(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-delete-branch', async (_event, config: CodePaneGitDeleteBranchConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.deleteBranch(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-rebase-plan', async (_event, config: CodePaneGitRebasePlanConfig) => {
    try {
      if (!codeGitService) {
        throw new Error('CodeGitService not initialized');
      }

      return successResponse(await codeGitService.getRebasePlan(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-apply-rebase-plan', async (_event, config: CodePaneGitApplyRebasePlanConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.applyRebasePlan(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-cherry-pick', async (_event, config: CodePaneGitCherryPickConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.cherryPick(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-rebase-control', async (_event, config: CodePaneGitRebaseControlConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.controlRebase(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-resolve-conflict', async (_event, config: CodePaneGitResolveConflictConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.resolveConflict(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-conflict-details', async (_event, config: CodePaneGitConflictDetailsConfig) => {
    try {
      if (!codeGitService) {
        throw new Error('CodeGitService not initialized');
      }

      return successResponse(await codeGitService.getConflictDetails(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-apply-conflict-resolution', async (_event, config: CodePaneGitApplyConflictResolutionConfig) => {
    try {
      if (!codeGitOperationService) {
        throw new Error('CodeGitOperationService not initialized');
      }

      await codeGitOperationService.applyConflictResolution(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-history', async (_event, config: CodePaneGitHistoryConfig) => {
    try {
      if (!codeGitHistoryService) {
        throw new Error('CodeGitHistoryService not initialized');
      }

      return successResponse(await codeGitHistoryService.getHistory(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-git-blame', async (_event, config: CodePaneGitBlameConfig) => {
    try {
      if (!codeGitBlameService) {
        throw new Error('CodeGitBlameService not initialized');
      }

      return successResponse(await codeGitBlameService.getBlame(config));
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

  ipcMain.handle('code-pane-prepare-refactor', async (_event, config: CodePanePrepareRefactorConfig) => {
    try {
      if (!codeRefactorService) {
        throw new Error('CodeRefactorService not initialized');
      }

      return successResponse(await codeRefactorService.prepareRefactor(config, ctx.getCurrentWorkspace()));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-apply-refactor', async (_event, config: CodePaneApplyRefactorConfig) => {
    try {
      if (!codeRefactorService) {
        throw new Error('CodeRefactorService not initialized');
      }

      return successResponse(await codeRefactorService.applyRefactor(config));
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
      void languageWorkspaceHostService?.prewarmProject(config.rootPath).catch((error) => {
        console.warn('[CodePaneHandlers] Failed to prewarm language workspace:', error);
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

  ipcMain.handle('code-pane-debug-start', async (_event, config: CodePaneDebugStartConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      return successResponse(await debugAdapterSupervisor.startSession(config, getCurrentWorkspace()?.settings.plugins));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-debug-stop', async (_event, config: CodePaneDebugControlConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.stopSession(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-debug-pause', async (_event, config: CodePaneDebugControlConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.pauseSession(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-debug-continue', async (_event, config: CodePaneDebugControlConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.continueSession(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-debug-step-over', async (_event, config: CodePaneDebugControlConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.stepOver(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-debug-step-into', async (_event, config: CodePaneDebugControlConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.stepInto(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-debug-step-out', async (_event, config: CodePaneDebugControlConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.stepOut(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-debug-session-details', async (_event, config: CodePaneGetDebugSessionDetailsConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      return successResponse(await debugAdapterSupervisor.getSessionDetails(config.sessionId));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-list-debug-sessions', async (_event, config: CodePaneListDebugSessionsConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      return successResponse(await debugAdapterSupervisor.listSessions(config.rootPath));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-debug-evaluate', async (_event, config: CodePaneDebugEvaluateConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      return successResponse(await debugAdapterSupervisor.evaluate(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-set-breakpoint', async (_event, config: CodePaneSetBreakpointConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.setBreakpoint(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-remove-breakpoint', async (_event, config: CodePaneRemoveBreakpointConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.removeBreakpoint(config);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-get-exception-breakpoints', async (_event, config: CodePaneGetExceptionBreakpointsConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      return successResponse(await debugAdapterSupervisor.getExceptionBreakpoints(config.rootPath));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('code-pane-set-exception-breakpoints', async (_event, config: CodePaneSetExceptionBreakpointsConfig) => {
    try {
      if (!debugAdapterSupervisor) {
        throw new Error('DebugAdapterSupervisor not initialized');
      }

      await debugAdapterSupervisor.setExceptionBreakpoints(config.rootPath, config.breakpoints);
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

      return successResponse(await codeTestService.listTests(config, getCurrentWorkspace()?.settings.plugins));
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
