import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';

export function registerViewHandlers(ctx: HandlerContext) {
  const { viewSwitcher } = ctx;

  ipcMain.handle('switch-to-terminal-view', (_event, { windowId }: { windowId: string }) => {
    try {
      if (!viewSwitcher) throw new Error('ViewSwitcher not initialized');
      viewSwitcher.switchToTerminalView(windowId);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('switch-to-unified-view', () => {
    try {
      if (!viewSwitcher) throw new Error('ViewSwitcher not initialized');
      viewSwitcher.switchToUnifiedView();
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}
