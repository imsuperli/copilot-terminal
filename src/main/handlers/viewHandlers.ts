import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import { SetActivePanePayload, SwitchToCanvasViewPayload, SwitchToTerminalViewPayload } from '../../shared/types/ipc';

export function registerViewHandlers(ctx: HandlerContext) {
  const { viewSwitcher, statusPoller } = ctx;

  ipcMain.handle('switch-to-terminal-view', (_event, { windowId }: SwitchToTerminalViewPayload) => {
    try {
      if (!viewSwitcher) throw new Error('ViewSwitcher not initialized');
      viewSwitcher.switchToTerminalView(windowId);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('switch-to-canvas-view', (_event, { canvasWorkspaceId }: SwitchToCanvasViewPayload) => {
    try {
      if (!viewSwitcher) throw new Error('ViewSwitcher not initialized');
      viewSwitcher.switchToCanvasView(canvasWorkspaceId);
      statusPoller?.clearActivePane();
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('switch-to-unified-view', () => {
    try {
      if (!viewSwitcher) throw new Error('ViewSwitcher not initialized');
      viewSwitcher.switchToUnifiedView();
      statusPoller?.clearActivePane();
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('set-active-pane', (_event, { paneId }: SetActivePanePayload) => {
    try {
      if (!statusPoller) {
        return successResponse();
      }

      if (paneId) {
        statusPoller.setActivePane(paneId);
      } else {
        statusPoller.clearActivePane();
      }

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}
