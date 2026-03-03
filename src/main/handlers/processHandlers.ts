import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { TerminalConfig } from '../types/process';
import { successResponse, errorResponse } from './HandlerResponse';

/**
 * 注册进程管理相关的 IPC handlers
 */
export function registerProcessHandlers(ctx: HandlerContext) {
  const { processManager } = ctx;

  // 创建终端进程
  ipcMain.handle('create-terminal', async (_event, config: TerminalConfig) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const handle = await processManager.spawnTerminal(config);
      return successResponse(handle);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 终止终端进程
  ipcMain.handle('kill-terminal', async (_event, pid: number) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      await processManager.killProcess(pid);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 获取终端状态
  ipcMain.handle('get-terminal-status', async (_event, pid: number) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const status = processManager.getProcessStatus(pid);
      return successResponse(status);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 列出所有终端进程
  ipcMain.handle('list-terminals', async () => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const processes = processManager.listProcesses();
      return successResponse(processes);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
