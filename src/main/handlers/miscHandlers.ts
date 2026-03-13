import { app, clipboard, ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { successResponse } from './HandlerResponse';

/**
 * 注册其他杂项 IPC handlers
 */
export function registerMiscHandlers(ctx: HandlerContext) {
  // 基础 IPC 通信验证
  ipcMain.handle('ping', () => successResponse('pong'));

  // 获取应用版本
  ipcMain.handle('get-app-version', () => {
    return successResponse({
      version: app.getVersion(),
      name: app.getName(),
    });
  });

  // 系统剪贴板写入
  ipcMain.handle('clipboard-write-text', (_event, text: string) => {
    clipboard.writeText(text ?? '');
    return successResponse();
  });

  // 系统剪贴板读取
  ipcMain.handle('clipboard-read-text', () => {
    return successResponse(clipboard.readText());
  });
}
