import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { Window } from '../../renderer/types/window';

export function registerWorkspaceHandlers(ctx: HandlerContext) {
  const { workspaceManager, setCurrentWorkspace } = ctx;

  ipcMain.handle('save-workspace', async (_event, windows: Window[]) => {
    try {
      if (!workspaceManager) throw new Error('WorkspaceManager not initialized');
      const workspace = await workspaceManager.loadWorkspace();
      workspace.windows = windows;
      await workspaceManager.saveWorkspace(workspace);
      setCurrentWorkspace(workspace);
      return { success: true };
    } catch (error) {
      console.error('Failed to save workspace:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('load-workspace', async () => {
    try {
      if (!workspaceManager) throw new Error('WorkspaceManager not initialized');
      const workspace = await workspaceManager.loadWorkspace();
      setCurrentWorkspace(workspace);
      return { success: true, data: workspace };
    } catch (error) {
      console.error('Failed to load workspace:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('recover-from-backup', async () => {
    try {
      if (!workspaceManager) throw new Error('WorkspaceManager not initialized');
      const workspace = await workspaceManager.loadWorkspace();
      setCurrentWorkspace(workspace);
      return { success: true, data: workspace };
    } catch (error) {
      console.error('Failed to recover from backup:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
