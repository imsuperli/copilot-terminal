import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import type { PtyWriteMetadata } from '../../shared/types/electron-api';

/**
 * 注册 PTY 通信相关的 IPC handlers
 */
export function registerPtyHandlers(ctx: HandlerContext) {
  const { processManager, tmuxCompatService } = ctx;

  const handlePtyWrite = async ({
    windowId,
    paneId,
    data,
    metadata,
  }: {
    windowId: string;
    paneId?: string;
    data: string;
    metadata?: PtyWriteMetadata;
  }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }

      // 使用 O(1) 索引查找 PID
      let pid = processManager.getPidByPane(windowId, paneId);

      // 如果索引未命中，降级到线性查找（防御性编程）
      if (pid === null) {
        const processes = processManager.listProcesses();
        const found = processes.find(p =>
          p.windowId === windowId && (paneId ? p.paneId === paneId : true)
        );
        if (!found) {
          // 窗口可能处于 Paused 状态（没有 PTY 进程），这是正常的，静默忽略
          return successResponse();
        }
        pid = found.pid;
      }

      processManager.writeToPty(pid, data);
      tmuxCompatService?.notifyPaneInputWritten(windowId, paneId, data, metadata);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  };

  const handlePtyResize = async ({
    windowId,
    paneId,
    cols,
    rows,
  }: {
    windowId: string;
    paneId?: string;
    cols: number;
    rows: number;
  }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }

      // 使用 O(1) 索引查找 PID
      let pid = processManager.getPidByPane(windowId, paneId);

      // 如果索引未命中，降级到线性查找（防御性编程）
      if (pid === null) {
        const processes = processManager.listProcesses();
        const found = processes.find(p =>
          p.windowId === windowId && (paneId ? p.paneId === paneId : true)
        );
        if (!found) {
          // 窗口可能处于 Paused 状态（没有 PTY 进程），这是正常的，静默忽略
          return successResponse();
        }
        pid = found.pid;
      }

      processManager.resizePty(pid, cols, rows);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  };

  // PTY 数据写入（用户输入 → PTY 进程）
  ipcMain.handle('pty-write', async (_event, payload) => handlePtyWrite(payload));

  // PTY resize
  ipcMain.handle('pty-resize', async (_event, payload) => handlePtyResize(payload));

  ipcMain.handle('get-pty-history', async (_event, { paneId }: { paneId: string }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }

      return successResponse(processManager.getPtyHistory(paneId));
    } catch (error) {
      return errorResponse(error);
    }
  });
}
