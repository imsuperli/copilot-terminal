import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';

export function registerViewHandlers(ctx: HandlerContext) {
  const { viewSwitcher } = ctx;

  ipcMain.handle('switch-to-terminal-view', (_event, { windowId }: { windowId: string }) => {
    if (!viewSwitcher) throw new Error('ViewSwitcher not initialized');
    viewSwitcher.switchToTerminalView(windowId);
  });

  ipcMain.handle('switch-to-unified-view', () => {
    if (!viewSwitcher) throw new Error('ViewSwitcher not initialized');
    viewSwitcher.switchToUnifiedView();
  });
}
