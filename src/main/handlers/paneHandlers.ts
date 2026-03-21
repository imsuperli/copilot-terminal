import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { TerminalConfig } from '../types/process';
import { successResponse, errorResponse } from './HandlerResponse';

/**
 * 注册窗格管理相关的 IPC handlers
 */
export function registerPaneHandlers(ctx: HandlerContext) {
  const {
    mainWindow,
    processManager,
    statusPoller,
    ptySubscriptionManager,
  } = ctx;

  // 拆分窗格（创建新的 PTY 进程）
  ipcMain.handle('split-pane', async (_event, config: TerminalConfig) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const handle = await processManager.spawnTerminal(config);

      // 订阅 PTY 数据
      const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
        // 使用 setImmediate 让 IPC 发送完全异步化，避免阻塞 PTY 数据流
        if (mainWindow && !mainWindow.isDestroyed()) {
          setImmediate(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('pty-data', {
                windowId: config.windowId,
                paneId: config.paneId,
                data,
                seq: config.paneId ? processManager.getLatestPaneOutputSeq(config.paneId) : undefined,
              });
            }
          });
        }
      });

      // 使用 PtySubscriptionManager 管理订阅
      if (ptySubscriptionManager && config.paneId) {
        ptySubscriptionManager.add(config.paneId, unsubscribe);
      }

      // 注册到状态轮询，确保进程退出时能通知渲染进程
      if (config.windowId && config.paneId) {
        statusPoller?.addPane(config.windowId, config.paneId, handle.pid);
      }

      return successResponse({ pid: handle.pid });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 关闭窗格（终止 PTY 进程）
  ipcMain.handle('close-pane', async (_event, { windowId, paneId }: { windowId: string; paneId: string }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }

      // 清理 PTY 订阅
      if (ptySubscriptionManager) {
        ptySubscriptionManager.remove(paneId);
      }

      statusPoller?.removePane(paneId);

      const processes = processManager.listProcesses();
      const found = processes.find(p => p.windowId === windowId && p.paneId === paneId);
      if (found && found.status !== 'exited') {
        await processManager.killProcess(found.pid);
      }

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}
