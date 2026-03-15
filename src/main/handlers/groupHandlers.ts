import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import { GroupManagerImpl } from '../services/GroupManager';

const groupManager = new GroupManagerImpl();

/**
 * 注册窗口组相关的 IPC handlers
 */
export function registerGroupHandlers(ctx: HandlerContext) {
  const { getCurrentWorkspace, setCurrentWorkspace, autoSaveManager } = ctx;

  function getWorkspaceOrThrow() {
    const ws = getCurrentWorkspace();
    if (!ws) throw new Error('Workspace not initialized');
    return ws;
  }

  function saveAndReturn<T>(ws: ReturnType<typeof getWorkspaceOrThrow>, data?: T) {
    setCurrentWorkspace(ws);
    autoSaveManager?.triggerSave();
    return successResponse(data);
  }

  // 创建窗口组
  ipcMain.handle('create-group', async (_event, name: string, windowIds: string[]) => {
    try {
      const ws = getWorkspaceOrThrow();
      const group = groupManager.createGroup(name, windowIds);
      ws.groups = [...ws.groups, group];
      return saveAndReturn(ws, group);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 删除窗口组
  ipcMain.handle('delete-group', async (_event, groupId: string) => {
    try {
      const ws = getWorkspaceOrThrow();
      ws.groups = groupManager.deleteGroup(groupId, ws.groups);
      return saveAndReturn(ws);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 归档窗口组
  ipcMain.handle('archive-group', async (_event, groupId: string) => {
    try {
      const ws = getWorkspaceOrThrow();
      ws.groups = groupManager.archiveGroup(groupId, ws.groups);
      return saveAndReturn(ws);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 取消归档窗口组
  ipcMain.handle('unarchive-group', async (_event, groupId: string) => {
    try {
      const ws = getWorkspaceOrThrow();
      ws.groups = groupManager.unarchiveGroup(groupId, ws.groups);
      return saveAndReturn(ws);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 重命名窗口组
  ipcMain.handle('rename-group', async (_event, groupId: string, name: string) => {
    try {
      const ws = getWorkspaceOrThrow();
      ws.groups = groupManager.renameGroup(groupId, name, ws.groups);
      return saveAndReturn(ws);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 添加窗口到组
  ipcMain.handle('add-window-to-group', async (
    _event,
    groupId: string,
    windowId: string,
    direction: 'horizontal' | 'vertical',
    targetWindowId: string | null,
  ) => {
    try {
      const ws = getWorkspaceOrThrow();
      ws.groups = groupManager.addWindowToGroup(groupId, windowId, direction, targetWindowId, ws.groups);
      return saveAndReturn(ws);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 从组中移除窗口
  ipcMain.handle('remove-window-from-group', async (_event, groupId: string, windowId: string) => {
    try {
      const ws = getWorkspaceOrThrow();
      const result = groupManager.removeWindowFromGroup(groupId, windowId, ws.groups);
      ws.groups = result.groups;
      return saveAndReturn(ws, { dissolved: result.dissolved });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 更新组分割大小
  ipcMain.handle('update-group-split-sizes', async (
    _event,
    groupId: string,
    splitPath: number[],
    sizes: number[],
  ) => {
    try {
      const ws = getWorkspaceOrThrow();
      ws.groups = groupManager.updateGroupSplitSizes(groupId, splitPath, sizes, ws.groups);
      return saveAndReturn(ws);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
