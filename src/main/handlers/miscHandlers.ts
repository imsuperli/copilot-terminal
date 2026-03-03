import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';

/**
 * 注册其他杂项 IPC handlers
 */
export function registerMiscHandlers(ctx: HandlerContext) {
  // 基础 IPC 通信验证
  ipcMain.handle('ping', () => 'pong');
}
