import { ipcMain } from 'electron';
import { HandlerContext, MAX_CACHE_SIZE } from './HandlerContext';
import { TerminalConfig } from '../types/process';
import { successResponse, errorResponse } from './HandlerResponse';

/**
 * 注册窗格管理相关的 IPC handlers
 */
export function registerPaneHandlers(ctx: HandlerContext) {
  const {
    mainWindow,
    processManager,
    ptySubscriptionManager,
    ptyOutputCache,
  } = ctx;

  // 拆分窗格（创建新的 PTY 进程）
  ipcMain.handle('split-pane', async (_event, config: TerminalConfig) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const handle = await processManager.spawnTerminal(config);

      // 初始化输出缓存
      if (config.paneId) {
        ptyOutputCache.set(config.paneId, []);
      }

      // 订阅 PTY 数据（修复：之前缺少这部分逻辑）
      const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
        // 缓存输出
        if (config.paneId) {
          const cache = ptyOutputCache.get(config.paneId);
          if (cache) {
            cache.push(data);
            // 限制缓存大小
            if (cache.length > MAX_CACHE_SIZE) {
              cache.shift();
            }
          }
        }

        // 推送到渲染进程
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pty-data', {
            windowId: config.windowId,
            paneId: config.paneId,
            data
          });
        }
      });

      // 使用 PtySubscriptionManager 管理订阅
      if (ptySubscriptionManager && config.paneId) {
        ptySubscriptionManager.add(config.paneId, unsubscribe);
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

      // 清理输出缓存
      ptyOutputCache.delete(paneId);

      // 清理 PTY 订阅（修复：之前缺少这部分逻辑）
      if (ptySubscriptionManager) {
        ptySubscriptionManager.remove(paneId);
      }

      const processes = processManager.listProcesses();
      const found = processes.find(p => p.windowId === windowId && p.paneId === paneId);
      if (found) {
        await processManager.killProcess(found.pid);
      }

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}
