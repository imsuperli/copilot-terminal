import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { Window } from '../../shared/types/window';
import { WindowGroup } from '../../shared/types/window-group';
import { successResponse, errorResponse } from './HandlerResponse';
import { LayoutNode } from '../../shared/types/window';

function getWindowWorkingDirectory(layout: LayoutNode): string | null {
  if (layout.type === 'pane') {
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
  const { workspaceManager, autoSaveManager, getCurrentWorkspace, setCurrentWorkspace, syncProjectConfigWatchers } = ctx;

  // 监听自动保存触发事件
  ipcMain.on('trigger-auto-save', async (_event, windows: Window[], groups?: WindowGroup[]) => {
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
  });

  ipcMain.handle('save-workspace', async (_event, windows: Window[]) => {
    try {
      if (!workspaceManager) throw new Error('WorkspaceManager not initialized');
      const workspace = await workspaceManager.loadWorkspace();
      workspace.windows = windows;
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
      return successResponse(workspace);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
