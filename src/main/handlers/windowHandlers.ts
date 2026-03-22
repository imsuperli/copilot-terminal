import { ipcMain, dialog } from 'electron';
import { randomUUID } from 'crypto';
import { HandlerContext } from './HandlerContext';
import { PathValidator } from '../utils/pathValidator';
import { resolveShellProgram } from '../utils/shell';
import { scanSubfolders } from '../utils/folderScanner';
import { readProjectConfig } from '../utils/project-config';
import { projectConfigWatcher } from '../services/ProjectConfigWatcher';
import { Pane, WindowStatus } from '../../shared/types/window';
import { successResponse, errorResponse } from './HandlerResponse';
import { getPaneCapabilities } from '../../shared/utils/terminalCapabilities';

/**
 * 注册窗口管理相关的 IPC handlers
 */
export function registerWindowHandlers(ctx: HandlerContext) {
  const {
    mainWindow,
    processManager,
    statusPoller,
    ptySubscriptionManager,
    gitBranchWatcher,
    getCurrentWorkspace,
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

      const command = resolveShellProgram({
        preferredShellProgram: config.command,
        settings: getCurrentWorkspace()?.settings,
      });

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

      // 读取项目配置文件（copilot.json）
      const projectConfig = readProjectConfig(safePath);

      // 创建 Pane 对象（使用安全路径）
      const pane: Pane = {
        id: paneId,
        cwd: safePath,
        command: command,
        status: WindowStatus.Running as WindowStatus,
        pid: handle.pid,
        sessionId: handle.sessionId,
        backend: 'local' as const,
        capabilities: getPaneCapabilities({
          id: paneId,
          cwd: safePath,
          command: command,
          status: WindowStatus.Running as WindowStatus,
          pid: handle.pid,
          sessionId: handle.sessionId,
          backend: 'local' as const,
        }),
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
        projectConfig: projectConfig || undefined,
      };

      // 将新窗格添加到 StatusPoller
      statusPoller?.addWindow(windowId, handle.pid, paneId);

      // 订阅 PTY 数据，推送到渲染进程
      const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
        // 使用 setImmediate 让 IPC 发送完全异步化，避免阻塞 PTY 数据流
        if (mainWindow && !mainWindow.isDestroyed()) {
          setImmediate(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('pty-data', {
                windowId,
                paneId,
                data,
                seq: paneId ? processManager.getLatestPaneOutputSeq(paneId) : undefined,
              });
            }
          });
        }
      });

      // 使用 PtySubscriptionManager 管理订阅
      if (ptySubscriptionManager) {
        ptySubscriptionManager.add(paneId, unsubscribe);
      }

      // 启动项目配置文件监听
      projectConfigWatcher.startWatching(windowId, safePath, (updatedConfig) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project-config-updated', {
            windowId,
            projectConfig: updatedConfig
          });
        }
      }).catch(error => {
        console.error('[WindowHandlers] Failed to start project config watching:', error);
      });

      // 注意：不再自动启动 git 监听，只在窗口激活时才监听

      return successResponse(window);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 启动暂停的窗口（恢复 PTY 进程）
  ipcMain.handle('start-window', async (_event, { windowId, paneId, name, workingDirectory, command }: { windowId: string; paneId?: string; name: string; workingDirectory: string; command?: string }) => {
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

      const shellCommand = resolveShellProgram({
        preferredShellProgram: command,
        settings: getCurrentWorkspace()?.settings,
      });

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

      // 订阅 PTY 数据，推送到渲染进程
      const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
        // 使用 setImmediate 让 IPC 发送完全异步化，避免阻塞 PTY 数据流
        if (mainWindow && !mainWindow.isDestroyed()) {
          setImmediate(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('pty-data', {
                windowId,
                paneId,
                data,
                seq: paneId ? processManager.getLatestPaneOutputSeq(paneId) : undefined,
              });
            }
          });
        }
      });

      // 使用 PtySubscriptionManager 管理订阅
      if (ptySubscriptionManager && paneId) {
        ptySubscriptionManager.add(paneId, unsubscribe);
      }

      // 启动项目配置文件监听（如果还没有启动）
      projectConfigWatcher.startWatching(windowId, safePath, (updatedConfig) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project-config-updated', {
            windowId,
            projectConfig: updatedConfig
          });
        }
      }).catch(error => {
        console.error('[WindowHandlers] Failed to start project config watching:', error);
      });

      // 注意：不再自动启动 git 监听，只在窗口激活时才监听

      return successResponse({
        pid: handle.pid,
        sessionId: handle.sessionId,
        status: WindowStatus.WaitingForInput,
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 检查 PTY 是否有输出（用于判断 PTY 初始化是否完成）
  ipcMain.handle('check-pty-output', async (_event, { windowId, paneId }: { windowId: string; paneId: string }) => {
    try {
      if (!processManager) {
        return successResponse({ hasOutput: false });
      }

      const pid = processManager.getPidByPane(windowId, paneId);
      if (!pid) {
        return successResponse({ hasOutput: false });
      }

      const hasOutput = processManager.hasPtyOutput(pid);
      return successResponse({ hasOutput });
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

      // 停止 git 分支监听
      if (gitBranchWatcher) {
        gitBranchWatcher.unwatch(windowId);
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
        try {
          await processManager.killProcess(proc.pid);
        } catch (error) {
          // 进程已退出，忽略错误
          if (process.env.NODE_ENV === 'development') {
            console.log(`Process ${proc.pid} already exited`);
          }
        }
      }

      // 从 StatusPoller 移除窗口
      statusPoller?.removeWindow(windowId);

      // 删除窗口时停止项目配置监听
      projectConfigWatcher.stopWatching(windowId);

      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 启动窗口的 git 分支监听（仅在窗口激活时调用）
  ipcMain.handle('start-git-watch', async (_event, { windowId, cwd }: { windowId: string; cwd: string }) => {
    try {
      if (!gitBranchWatcher) {
        return successResponse(); // git watcher 不可用，静默返回
      }

      await gitBranchWatcher.watch(windowId, cwd, (gitBranch) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('window-git-branch-changed', {
            windowId,
            gitBranch,
            timestamp: new Date().toISOString(),
          });
        }
      });

      return successResponse();
    } catch (error) {
      console.error('[WindowHandlers] Failed to start git watch:', error);
      return errorResponse(error);
    }
  });

  // 停止窗口的 git 分支监听（在窗口切换时调用）
  ipcMain.handle('stop-git-watch', async (_event, { windowId }: { windowId: string }) => {
    try {
      if (!gitBranchWatcher) {
        return successResponse();
      }

      gitBranchWatcher.unwatch(windowId);

      return successResponse();
    } catch (error) {
      console.error('[WindowHandlers] Failed to stop git watch:', error);
      return errorResponse(error);
    }
  });

  // 选择文件夹并扫描子文件夹
  ipcMain.handle('select-and-scan-folder', async () => {
    try {
      if (!mainWindow) {
        throw new Error('Main window not initialized');
      }

      // 打开文件夹选择对话框
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择要扫描的文件夹',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return successResponse({ folders: [], parentPath: null });
      }

      const parentPath = result.filePaths[0];

      // 扫描子文件夹
      const folders = scanSubfolders(parentPath);

      return successResponse({ folders, parentPath });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
