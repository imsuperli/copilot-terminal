import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { CanvasActivityEvent, CanvasWorkspace, CanvasWorkspaceTemplate } from '../../shared/types/canvas';
import { Window } from '../../shared/types/window';
import { WindowGroup } from '../../shared/types/window-group';
import { successResponse, errorResponse } from './HandlerResponse';
import { LayoutNode } from '../../shared/types/window';
import { isSessionlessPane } from '../../shared/utils/terminalCapabilities';

function getWindowWorkingDirectory(layout: LayoutNode): string | null {
  if (layout.type === 'pane') {
    if (isSessionlessPane(layout.pane) || layout.pane.backend === 'ssh') {
      return null;
    }

    return layout.pane.cwd || null;
  }

  for (const child of layout.children) {
    const cwd = getWindowWorkingDirectory(child);
    if (cwd) {
      return cwd;
    }
  }

  return null;
}

function haveWatchTargetsChanged(previousWindows: Window[], nextWindows: Window[]): boolean {
  if (previousWindows.length !== nextWindows.length) {
    return true;
  }

  const previousTargets = new Map(
    previousWindows.map((window) => [window.id, getWindowWorkingDirectory(window.layout)])
  );

  for (const window of nextWindows) {
    if (!previousTargets.has(window.id)) {
      return true;
    }

    if (previousTargets.get(window.id) !== getWindowWorkingDirectory(window.layout)) {
      return true;
    }
  }

  return false;
}

export function registerWorkspaceHandlers(ctx: HandlerContext) {
  const {
    workspaceManager,
    autoSaveManager,
    getCurrentWorkspace,
    setCurrentWorkspace,
    syncProjectConfigWatchers,
    languageFeatureService,
  } = ctx;

  // 监听自动保存触发事件
  ipcMain.on(
    'trigger-auto-save',
    async (
      _event,
      windows: Window[],
      groups?: WindowGroup[],
      canvasWorkspaces?: CanvasWorkspace[],
      canvasWorkspaceTemplates?: CanvasWorkspaceTemplate[],
      canvasActivity?: CanvasActivityEvent[],
    ) => {
    try {
      if (!autoSaveManager) {
        console.warn('[WorkspaceHandlers] AutoSaveManager not initialized');
        return;
      }

      if (!workspaceManager) {
        console.warn('[WorkspaceHandlers] WorkspaceManager not initialized');
        return;
      }

      // 🔥 关键修复：使用 getCurrentWorkspace() 获取最新的 currentWorkspace
      // 避免闭包捕获旧值的问题
      const currentWorkspace = getCurrentWorkspace();
      if (!currentWorkspace) {
        console.error('[WorkspaceHandlers] Current workspace not available');
        return;
      }

      // 🔥 数据校验：防止保存 undefined/null 数据（但允许空数组）
      // 空数组是合法的：用户可能删除了所有窗口
      if (windows === undefined || windows === null) {
        console.warn('[WorkspaceHandlers] Rejecting undefined/null windows data');
        return;
      }

      const shouldSyncProjectConfigWatchers = haveWatchTargetsChanged(currentWorkspace.windows, windows);

      // 更新窗口列表和组列表
      currentWorkspace.windows = windows;
      currentWorkspace.groups = groups || [];
      currentWorkspace.canvasWorkspaces = canvasWorkspaces || [];
      currentWorkspace.canvasWorkspaceTemplates = canvasWorkspaceTemplates || [];
      currentWorkspace.canvasActivity = canvasActivity || [];

      // 更新全局 currentWorkspace
      setCurrentWorkspace(currentWorkspace);

      if (shouldSyncProjectConfigWatchers) {
        await syncProjectConfigWatchers?.();
      }

      // 触发自动保存（带防抖）
      autoSaveManager.triggerSave();
    } catch (error) {
      console.error('[WorkspaceHandlers] Failed to trigger auto-save:', error);
    }
    },
  );

  ipcMain.handle('save-workspace', async (
    _event,
    payload: {
      windows: Window[];
      groups?: WindowGroup[];
      canvasWorkspaces?: CanvasWorkspace[];
      canvasWorkspaceTemplates?: CanvasWorkspaceTemplate[];
      canvasActivity?: CanvasActivityEvent[];
    },
  ) => {
    try {
      if (!workspaceManager) throw new Error('WorkspaceManager not initialized');
      const workspace = await workspaceManager.loadWorkspace();
      workspace.windows = payload.windows;
      if (payload.groups) {
        workspace.groups = payload.groups;
      }
      if (payload.canvasWorkspaces) {
        workspace.canvasWorkspaces = payload.canvasWorkspaces;
      }
      if (payload.canvasWorkspaceTemplates) {
        workspace.canvasWorkspaceTemplates = payload.canvasWorkspaceTemplates;
      }
      if (payload.canvasActivity) {
        workspace.canvasActivity = payload.canvasActivity;
      }
      await workspaceManager.saveWorkspace(workspace);
      setCurrentWorkspace(workspace);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('load-workspace', async () => {
    try {
      if (!workspaceManager) throw new Error('WorkspaceManager not initialized');
      const workspace = await workspaceManager.loadWorkspace();
      setCurrentWorkspace(workspace);
      await syncProjectConfigWatchers?.();
      await languageFeatureService?.resetSessions();
      return successResponse(workspace);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('recover-from-backup', async () => {
    try {
      if (!workspaceManager) throw new Error('WorkspaceManager not initialized');
      const workspace = await workspaceManager.loadWorkspace();
      setCurrentWorkspace(workspace);
      await syncProjectConfigWatchers?.();
      await languageFeatureService?.resetSessions();
      return successResponse(workspace);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
