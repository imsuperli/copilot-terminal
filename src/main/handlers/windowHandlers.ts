import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { HandlerContext, MAX_CACHE_SIZE } from './HandlerContext';
import { PathValidator } from '../utils/pathValidator';
import { WindowStatus } from '../../renderer/types/window';
import { successResponse, errorResponse } from './HandlerResponse';

/**
 * 获取默认 shell，带回退逻辑
 */
function getDefaultShell(): string {
  if (process.platform === 'win32') {
    // 检查 pwsh.exe 是否存在（PowerShell 7+）
    try {
      execSync('where pwsh.exe', { stdio: 'ignore' });
      return 'pwsh.exe';
    } catch {
      // 直接回退到 cmd.exe，不使用旧版 powershell.exe
      return 'cmd.exe';
    }
  } else if (process.platform === 'darwin') {
    return 'zsh';
  } else {
    // Linux
    return 'bash';
  }
}

/**
 * 注册窗口管理相关的 IPC handlers
 */
export function registerWindowHandlers(ctx: HandlerContext) {
  const {
    mainWindow,
    processManager,
    statusPoller,
    ptySubscriptionManager,
    ptyOutputCache,
  } = ctx;

  // 创建窗口
  ipcMain.handle('create-window', async (_event, config: { name?: string; workingDirectory: string; command?: string }) => {
    try {
      if (!processManager) {
        throw new Error('进程管理器未初始化，请重启应用');
      }

      // 验证工作目录存在且可访问（使用安全验证）
      const pathValidation = PathValidator.validate(config.workingDirectory);
      if (!pathValidation.valid) {
        throw new Error(`工作目录无效: ${pathValidation.reason}`);
      }

      // 使用安全的规范化路径
      const safePath = PathValidator.getSafePath(config.workingDirectory);
      if (!safePath) {
        throw new Error('无法解析工作目录路径');
      }

      // 生成 UUID 作为窗口 ID 和窗格 ID
      const windowId = randomUUID();
      const paneId = randomUUID();

      // 获取默认 shell
      const defaultShell = getDefaultShell();
      const command = config.command || defaultShell;

      // 创建终端进程（使用安全路径）
      const handle = await processManager.spawnTerminal({
        workingDirectory: safePath,
        command: command,
        windowId: windowId,
        paneId: paneId,
      });

      // 验证进程启动成功
      if (!handle.pid || handle.pid <= 0) {
        throw new Error('终端进程启动失败');
      }

      // 从工作目录路径中提取最后一个文件夹名作为默认窗口名
      const pathParts = safePath.replace(/[\\\/]+$/, '').split(/[\\\/]/);
      const folderName = pathParts[pathParts.length - 1] || 'Terminal';
      const defaultName = folderName;

      // 创建 Pane 对象（使用安全路径）
      const pane = {
        id: paneId,
        cwd: safePath,
        command: command,
        status: WindowStatus.Running as WindowStatus,
        pid: handle.pid,
      };

      // 创建布局树（单个窗格）
      const layout = {
        type: 'pane' as const,
        id: paneId,
        pane: pane,
      };

      // 返回符合新 Window 接口的对象
      const window = {
        id: windowId,
        name: config.name || defaultName,
        layout: layout,
        activePaneId: paneId,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      // 将新窗格添加到 StatusPoller
      statusPoller?.addWindow(windowId, handle.pid, paneId);

      // 初始化输出缓存（使用 paneId）
      ptyOutputCache.set(paneId, []);

      // 订阅 PTY 数据，推送到渲染进程并缓存
      const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
        // 缓存输出
        const cache = ptyOutputCache.get(paneId);
        if (cache) {
          cache.push(data);
          // 限制缓存大小
          if (cache.length > MAX_CACHE_SIZE) {
            cache.shift();
          }
        }

        // 推送到渲染进程
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pty-data', { windowId, paneId, data });
        }
      });

      // 使用 PtySubscriptionManager 管理订阅
      if (ptySubscriptionManager) {
        ptySubscriptionManager.add(paneId, unsubscribe);
      }

      return successResponse(window);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 启动暂停的窗口（恢复 PTY 进程）
  ipcMain.handle('start-window', async (_event, { windowId, paneId, name, workingDirectory, command }: { windowId: string; paneId?: string; name: string; workingDirectory: string; command: string }) => {
    try {
      if (!processManager) {
        throw new Error('进程管理器未初始化，请重启应用');
      }

      // 验证工作目录存在且可访问（使用安全验证）
      const pathValidation = PathValidator.validate(workingDirectory);
      if (!pathValidation.valid) {
        throw new Error(`工作目录无效: ${pathValidation.reason}`);
      }

      // 使用安全的规范化路径
      const safePath = PathValidator.getSafePath(workingDirectory);
      if (!safePath) {
        throw new Error('无法解析工作目录路径');
      }

      // 获取默认 shell
      const defaultShell = getDefaultShell();
      const shellCommand = command || defaultShell;

      // 创建终端进程（使用安全路径）
      const handle = await processManager.spawnTerminal({
        workingDirectory: safePath,
        command: shellCommand,
        windowId: windowId,
        paneId: paneId,
      });

      // 验证进程启动成功
      if (!handle.pid || handle.pid <= 0) {
        throw new Error('终端进程启动失败');
      }

      // 将窗格添加到 StatusPoller
      statusPoller?.addWindow(windowId, handle.pid, paneId);

      // 初始化输出缓存（如果还没有，使用 paneId）
      if (paneId && !ptyOutputCache.has(paneId)) {
        ptyOutputCache.set(paneId, []);
      }

      // 订阅 PTY 数据，推送到渲染进程并缓存
      const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
        // 缓存输出
        if (paneId) {
          const cache = ptyOutputCache.get(paneId);
          if (cache) {
            cache.push(data);
            // 限制缓存大小
            if (cache.length > MAX_CACHE_SIZE) {
              cache.shift();
            }
          }
        }

        // 推送到渲染进程（包含 paneId）
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pty-data', { windowId, paneId, data });
        }
      });

      // 使用 PtySubscriptionManager 管理订阅
      if (ptySubscriptionManager && paneId) {
        ptySubscriptionManager.add(paneId, unsubscribe);
      }

      return successResponse({
        pid: handle.pid,
        status: WindowStatus.WaitingForInput,
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 关闭窗口（终止进程）
  ipcMain.handle('close-window', async (_event, { windowId }: { windowId: string }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }

      // 查找对应进程并终止，同时清理缓存
      const processes = processManager.listProcesses();
      const windowProcesses = processes.filter(p => p.windowId === windowId);

      // 使用 PtySubscriptionManager 批量清理窗口的所有订阅
      if (ptySubscriptionManager) {
        ptySubscriptionManager.removeByWindow(windowId, processManager);
      }

      for (const proc of windowProcesses) {
        // 清理每个窗格的输出缓存
        if (proc.paneId) {
          ptyOutputCache.delete(proc.paneId);
        }

        try {
          await processManager.killProcess(proc.pid);
        } catch (error) {
          // 进程已退出，忽略错误
          if (process.env.NODE_ENV === 'development') {
            console.log(`Process ${proc.pid} already exited`);
          }
        }
      }

      // 从 StatusPoller 中移除窗口的所有窗格
      if (statusPoller) {
        statusPoller.removeWindow(windowId);
      }

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 删除窗口（终止进程 + 移除配置）
  ipcMain.handle('delete-window', async (_event, { windowId }: { windowId: string }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      // 查找对应进程并终止，同时清理缓存
      const processes = processManager.listProcesses();
      const windowProcesses = processes.filter(p => p.windowId === windowId);

      // 使用 PtySubscriptionManager 批量清理窗口的所有订阅
      if (ptySubscriptionManager) {
        ptySubscriptionManager.removeByWindow(windowId, processManager);
      }

      for (const proc of windowProcesses) {
        // 清理每个窗格的输出缓存
        if (proc.paneId) {
          ptyOutputCache.delete(proc.paneId);
        }
        try {
          await processManager.killProcess(proc.pid);
        } catch (error) {
          // 进程已退出，忽略错误
          if (process.env.NODE_ENV === 'development') {
            console.log(`Process ${proc.pid} already exited`);
          }
        }
      }

      // TODO: 移除窗口配置（Story 6.x 工作区持久化时实现）
      // 从 StatusPoller 移除窗口
      statusPoller?.removeWindow(windowId);

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });
}
