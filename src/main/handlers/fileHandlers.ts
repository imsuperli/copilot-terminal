import { ipcMain, dialog, shell } from 'electron';
import { HandlerContext } from './HandlerContext';
import { PathValidator } from '../utils/pathValidator';
import { successResponse, errorResponse } from './HandlerResponse';

export function registerFileHandlers(ctx: HandlerContext) {
  const { mainWindow } = ctx;

  ipcMain.handle('validate-path', async (_event, pathToValidate: string) => {
    try {
      const result = PathValidator.validate(pathToValidate);
      if (process.env.NODE_ENV === 'development' && !result.valid) {
        console.log(`[PathValidator] Path validation failed: ${pathToValidate}, reason: ${result.reason}`);
      }
      return successResponse(result.valid);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('select-directory', async () => {
    try {
      if (!mainWindow) throw new Error('Main window not available');
      const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
      if (result.canceled || result.filePaths.length === 0) {
        return successResponse(null);
      }
      return successResponse(result.filePaths[0]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('open-folder', async (_event, { path }: { path: string }) => {
    try {
      await shell.openPath(path);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}
