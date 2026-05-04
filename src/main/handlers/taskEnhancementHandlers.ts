import { ipcMain } from 'electron';
import type {
  ListAggregatedSessionsQuery,
  ListTaskArtifactsQuery,
  SaveTaskArtifactRequest,
} from '../../shared/types/electron-api';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';

export function registerTaskEnhancementHandlers(ctx: HandlerContext) {
  ipcMain.handle('list-aggregated-sessions', async (_event, query: ListAggregatedSessionsQuery | undefined) => {
    try {
      if (!ctx.sessionAggregationService) {
        throw new Error('SessionAggregationService not initialized');
      }

      return successResponse(await ctx.sessionAggregationService.listSessions(query?.cwd, query?.limit));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-aggregated-session-detail', async (_event, payload: { entryId: string }) => {
    try {
      if (!ctx.sessionAggregationService) {
        throw new Error('SessionAggregationService not initialized');
      }

      return successResponse(await ctx.sessionAggregationService.getSessionDetail(payload.entryId));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('restore-aggregated-session', async (_event, request: { entryId: string }) => {
    try {
      if (!ctx.sessionAggregationService) {
        throw new Error('SessionAggregationService not initialized');
      }

      return successResponse(await ctx.sessionAggregationService.restoreSession(request.entryId));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('save-task-artifact', async (_event, request: SaveTaskArtifactRequest) => {
    try {
      if (!ctx.taskArtifactService) {
        throw new Error('TaskArtifactService not initialized');
      }

      return successResponse(await ctx.taskArtifactService.saveArtifact(request));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('list-task-artifacts', async (_event, query: ListTaskArtifactsQuery | undefined) => {
    try {
      if (!ctx.taskArtifactService) {
        throw new Error('TaskArtifactService not initialized');
      }

      return successResponse(await ctx.taskArtifactService.listArtifacts(query));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('delete-task-artifact', async (_event, payload: { artifactId: string }) => {
    try {
      if (!ctx.taskArtifactService) {
        throw new Error('TaskArtifactService not initialized');
      }

      await ctx.taskArtifactService.deleteArtifact(payload.artifactId);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('list-browser-sync-profiles', async () => {
    try {
      if (!ctx.browserSyncService) {
        throw new Error('BrowserSyncService not initialized');
      }

      return successResponse(await ctx.browserSyncService.listProfiles());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-browser-sync-state', async () => {
    try {
      if (!ctx.browserSyncService) {
        throw new Error('BrowserSyncService not initialized');
      }

      return successResponse(await ctx.browserSyncService.getState());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('sync-browser-profile', async (_event, payload: { profileId: string }) => {
    try {
      if (!ctx.browserSyncService) {
        throw new Error('BrowserSyncService not initialized');
      }

      return successResponse(await ctx.browserSyncService.syncProfile(payload.profileId));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-mcp-server-snapshots', async () => {
    try {
      if (!ctx.mcpCapabilityService) {
        throw new Error('McpCapabilityService not initialized');
      }

      return successResponse(ctx.mcpCapabilityService.listServerSnapshots());
    } catch (error) {
      return errorResponse(error);
    }
  });
}
