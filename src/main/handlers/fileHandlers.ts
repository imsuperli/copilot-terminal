import { ipcMain, dialog } from 'electron';
import { HandlerContext } from './HandlerContext';
import { PathValidator } from '../utils/pathValidator';

export function registerFileHandlers(ctx: HandlerContext) {
  const { mainWindow } = ctx;

  ipcMain.handle('validate-path', async (_event, pathToValidate: string) => {
    const result = PathValidator.validate(pathToValidate);
    if (process.env.NODE_ENV === 'development' && !result.valid) {
      console.log(`[PathValidator] Path validation failed: ${pathToValidate}, reason: ${result.reason}`);
    }
    return result.valid;
  });

  ipcMain.handle('select-directory', async () => {
    try {
      if (!mainWindow) throw new Error('Main window not available');
      const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to select directory:', error);
      }
      return null;
    }
  });

  ipcMain.handle('open-folder', async (_event, { path }: { path: string }) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(path);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to open folder:', error);
      }
      throw error;
    }
  });
}
