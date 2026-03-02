import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu } from 'electron';
import path from 'path';
import { existsSync, accessSync, constants } from 'fs';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { ProcessManager } from './services/ProcessManager';
import { StatusPoller } from './services/StatusPoller';
import { ViewSwitcherImpl } from './services/ViewSwitcher';
import { WorkspaceManagerImpl } from './services/WorkspaceManager';
import { AutoSaveManagerImpl } from './services/AutoSaveManager';
// import { WorkspaceRestorerImpl } from './services/WorkspaceRestorer';
import { TerminalConfig } from './types/process';
import { WindowStatus } from '../renderer/types/window';
import { Window } from '../renderer/types/window';
import { Workspace } from './types/workspace';

let mainWindow: BrowserWindow | null = null;
let processManager: ProcessManager | null = null;
let statusPoller: StatusPoller | null = null;
let viewSwitcher: ViewSwitcherImpl | null = null;
let workspaceManager: WorkspaceManagerImpl | null = null;
let autoSaveManager: AutoSaveManagerImpl | null = null;
// let workspaceRestorer: WorkspaceRestorerImpl | null = null;
let windowCounter = 0; // 用于生成唯一的窗口编号
let currentWorkspace: Workspace | null = null; // 缓存当前工作区状态

// PTY 输出缓存：windowId -> 输出历史数组
const ptyOutputCache = new Map<string, string[]>();
const MAX_CACHE_SIZE = 1000; // 每个窗口最多缓存 1000 条输出

// PTY 数据订阅清理函数：windowId -> 清理函数
const ptyDataUnsubscribers = new Map<string, () => void>();

// 退出标志，防止重复执行退出逻辑
let isQuitting = false;

// 当前视图状态：unified 或 terminal
let currentView: 'unified' | 'terminal' = 'unified';

// 获取默认 shell，带回退逻辑
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: '#0a0a0a',
    title: 'ausome-terminal',
    show: false, // 创建时不显示，等待渲染进程通知
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // 移除菜单栏，但保留窗口控制按钮
  Menu.setApplicationMenu(null);

  // 🎯 等待渲染进程明确通知"我准备好了"
  // 使用淡入效果掩盖任何系统级的白色闪烁
  let rendererReady = false;

  ipcMain.once('renderer-ready', () => {
    rendererReady = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[ELECTRON] Renderer ready, showing window');
      // 1. 先设置窗口为完全透明
      mainWindow.setOpacity(0);

      // 2. 最大化并显示窗口（此时是透明的，用户看不到）
      mainWindow.maximize();
      mainWindow.show();

      // 3. 延迟 50ms 后开始淡入（确保内容完全渲染）
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          // 使用平滑的淡入动画（约 160ms）
          let opacity = 0;
          const fadeInterval = setInterval(() => {
            opacity += 0.05;
            if (opacity >= 1) {
              mainWindow?.setOpacity(1);
              clearInterval(fadeInterval);
            } else {
              mainWindow?.setOpacity(opacity);
            }
          }, 8); // 每 8ms 增加 0.05
        }
      }, 50);
    }
  });

  // 超时保护：如果 5 秒后还没收到 renderer-ready，强制显示窗口
  setTimeout(() => {
    if (!rendererReady && mainWindow && !mainWindow.isDestroyed()) {
      console.log('[ELECTRON] Renderer ready timeout, forcing window show');
      mainWindow.setOpacity(1);
      mainWindow.maximize();
      mainWindow.show();
      // 打开开发者工具以便调试
      mainWindow.webContents.openDevTools();
    }
  }, 5000);

  // 开发环境加载 dev server,生产环境加载打包文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173'); // Vite dev server
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // F12 切换开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools();
        }
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 窗口关闭前处理
  mainWindow.on('close', async (event) => {
    // 如果在终端视图，返回统一视图而不是关闭窗口
    if (currentView === 'terminal' && !isQuitting) {
      event.preventDefault();
      mainWindow?.webContents.send('view-changed', { view: 'unified' });
      currentView = 'unified';
      return;
    }

    // 在统一视图或已经在退出流程中，执行正常关闭
    if (!isQuitting) {
      event.preventDefault();
      isQuitting = true;

      // 顶级安全定时器：3 秒后强制退出
      const safetyTimer = setTimeout(() => {
        console.log('[ELECTRON] Safety timeout reached, forcing exit');
        process.exit(0);
      }, 3000);
      safetyTimer.unref(); // 不阻止进程退出

      try {
        console.log('[ELECTRON] Starting cleanup...');

        // 立即保存工作区
        if (autoSaveManager && currentWorkspace) {
          console.log('[ELECTRON] Saving workspace...');
          await autoSaveManager.saveImmediately();
          console.log('[ELECTRON] Workspace saved');
        }

        // 停止自动保存
        console.log('[ELECTRON] Stopping auto-save...');
        autoSaveManager?.stopAutoSave();

        // 停止状态轮询
        console.log('[ELECTRON] Stopping status polling...');
        statusPoller?.stopPolling();

        // 取消所有 PTY 数据订阅
        console.log('[ELECTRON] Unsubscribing PTY data...');
        for (const [windowId, unsubscribe] of ptyDataUnsubscribers.entries()) {
          unsubscribe();
        }
        ptyDataUnsubscribers.clear();
        ptyOutputCache.clear();
        console.log('[ELECTRON] PTY data unsubscribed');

        // 清理所有 PTY 进程（等待进程完全终止）
        if (processManager) {
          console.log('[ELECTRON] Destroying process manager...');
          await processManager.destroy();
          console.log('[ELECTRON] Process manager destroyed');
        }

        // 等待一小段时间确保所有清理完成
        console.log('[ELECTRON] Waiting for final cleanup...');
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('[ELECTRON] Final cleanup completed');
      } catch (error) {
        console.error('[ELECTRON] Error during cleanup:', error);
      }

      // 销毁窗口
      console.log('[ELECTRON] Destroying window...');
      if (mainWindow) {
        mainWindow.destroy();
      }
      console.log('[ELECTRON] Window destroyed');

      // 清理所有 IPC handlers
      console.log('[ELECTRON] Cleaning up IPC handlers...');
      ipcMain.removeHandler('ping');
      ipcMain.removeHandler('create-window');
      ipcMain.removeHandler('start-window');
      ipcMain.removeHandler('close-window');
      ipcMain.removeHandler('delete-window');
      ipcMain.removeHandler('pty-write');
      ipcMain.removeHandler('pty-resize');
      ipcMain.removeHandler('get-pty-history');
      ipcMain.removeHandler('open-folder');
      ipcMain.removeHandler('save-workspace');
      ipcMain.removeHandler('load-workspace');
      ipcMain.removeHandler('get-window-status');
      ipcMain.removeHandler('create-terminal');
      ipcMain.removeHandler('kill-terminal');
      ipcMain.removeHandler('get-terminal-status');
      ipcMain.removeHandler('list-terminals');
      ipcMain.removeHandler('validate-path');
      ipcMain.removeHandler('select-directory');
      ipcMain.removeHandler('switch-to-terminal-view');
      ipcMain.removeHandler('switch-to-unified-view');
      ipcMain.removeHandler('recover-from-backup');
      console.log('[ELECTRON] IPC handlers cleaned up');

      // 多种方式强制退出
      console.log('[ELECTRON] Exiting process now...');

      // 方式1: 使用 app.exit (Electron 推荐)
      app.exit(0);

      // 方式2: 如果 app.exit 失败，使用 process.exit
      setTimeout(() => {
        console.log('[ELECTRON] app.exit failed, using process.exit...');
        process.exit(0);
      }, 100);

      // 方式3: 最后的保险 - 强制杀死进程
      setTimeout(() => {
        console.log('[ELECTRON] process.exit failed, killing process...');
        process.kill(process.pid, 'SIGKILL');
      }, 200);
    }
  });
}

app.whenReady().then(async () => {
  // 初始化 WorkspaceManager
  workspaceManager = new WorkspaceManagerImpl();

  // 崩溃恢复
  await workspaceManager.recoverFromCrash();

  // 初始化 AutoSaveManager
  autoSaveManager = new AutoSaveManagerImpl();

  // 初始化 ProcessManager
  processManager = new ProcessManager();

  // 注册 IPC handlers
  registerIPCHandlers();

  createWindow();

  // 初始化 StatusPoller（需要 mainWindow 已创建）
  if (mainWindow) {
    statusPoller = new StatusPoller(processManager.getStatusDetector(), mainWindow);
    statusPoller.startPolling();
    viewSwitcher = new ViewSwitcherImpl(mainWindow);

    // 初始化 WorkspaceRestorer
    // workspaceRestorer = new WorkspaceRestorerImpl(processManager, mainWindow);
  }

  // 加载工作区并恢复窗口
  try {
    const workspace = await workspaceManager.loadWorkspace();
    currentWorkspace = workspace;

    // 启动自动保存
    if (autoSaveManager && workspaceManager) {
      autoSaveManager.startAutoSave(workspaceManager, () => {
        // 返回当前工作区状态
        return currentWorkspace || workspaceManager!.loadWorkspace() as any;
      });
    }

    // 恢复工作区窗口（不自动启动 PTY 进程）
    if (mainWindow && workspace.windows.length > 0) {
      mainWindow.webContents.once('did-finish-load', async () => {
        // 通知渲染进程工作区已加载（显示为暂停状态，不启动进程）
        mainWindow?.webContents.send('workspace-loaded', workspace);
        console.log('[Main] Workspace loaded, windows in paused state (not auto-started)');
      });
    }
  } catch (error) {
    console.error('Failed to load workspace:', error);
    // 通知渲染进程加载失败
    if (mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send('workspace-restore-error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  // macOS 特定: 点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.exit(0); // 使用 app.exit(0) 而不是 app.quit()
  }
});

// IPC Handlers 注册
function registerIPCHandlers() {
  // 基础 IPC 通信验证
  ipcMain.handle('ping', () => 'pong');

  // 创建窗口
  ipcMain.handle('create-window', async (_event, config: { name?: string; workingDirectory: string; command?: string }) => {
    try {
      if (!processManager) {
        throw new Error('进程管理器未初始化，请重启应用');
      }

      // 验证工作目录存在且可访问
      if (!existsSync(config.workingDirectory)) {
        throw new Error('工作目录不存在');
      }

      try {
        accessSync(config.workingDirectory, constants.R_OK | constants.X_OK);
      } catch {
        throw new Error('工作目录无访问权限');
      }

      // 生成 UUID 作为窗口 ID 和窗格 ID
      const windowId = randomUUID();
      const paneId = randomUUID();

      // 获取默认 shell
      const defaultShell = getDefaultShell();
      const command = config.command || defaultShell;

      // 创建终端进程
      const handle = await processManager.spawnTerminal({
        workingDirectory: config.workingDirectory,
        command: command,
        windowId: windowId,
        paneId: paneId,
      });

      // 验证进程启动成功
      if (!handle.pid || handle.pid <= 0) {
        throw new Error('终端进程启动失败');
      }

      // 从工作目录路径中提取最后一个文件夹名作为默认窗口名
      const pathParts = config.workingDirectory.replace(/[\\\/]+$/, '').split(/[\\\/]/);
      const folderName = pathParts[pathParts.length - 1] || 'Terminal';
      const defaultName = folderName;

      // 返回符合 Window 接口的对象
      const window = {
        id: windowId,
        name: config.name || defaultName,
        workingDirectory: config.workingDirectory,
        command: command,
        status: WindowStatus.Running as WindowStatus,
        pid: handle.pid,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      // 将新窗口添加到 StatusPoller
      statusPoller?.addWindow(windowId, handle.pid);

      // 初始化输出缓存
      ptyOutputCache.set(windowId, []);

      // 订阅 PTY 数据，推送到渲染进程并缓存
      const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
        // 缓存输出
        const cache = ptyOutputCache.get(windowId);
        if (cache) {
          cache.push(data);
          // 限制缓存大小
          if (cache.length > MAX_CACHE_SIZE) {
            cache.shift();
          }
        }

        // 推送到渲染进程
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pty-data', { windowId, data });
        }
      });

      // 保存清理函数
      ptyDataUnsubscribers.set(windowId, unsubscribe);

      return window;
    } catch (error) {
      const errorMessage = (error as Error).message;
      // 不在生产环境记录敏感路径信息
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create window:', error);
      }
      throw new Error(errorMessage);
    }
  });

  // 启动暂停的窗口（恢复 PTY 进程）
  ipcMain.handle('start-window', async (_event, { windowId, paneId, name, workingDirectory, command }: { windowId: string; paneId?: string; name: string; workingDirectory: string; command: string }) => {
    try {
      if (!processManager) {
        throw new Error('进程管理器未初始化，请重启应用');
      }

      // 验证工作目录存在且可访问
      if (!existsSync(workingDirectory)) {
        throw new Error('工作目录不存在');
      }

      try {
        accessSync(workingDirectory, constants.R_OK | constants.X_OK);
      } catch {
        throw new Error('工作目录无访问权限');
      }

      // 获取默认 shell
      const defaultShell = getDefaultShell();
      const shellCommand = command || defaultShell;

      // 创建终端进程
      const handle = await processManager.spawnTerminal({
        workingDirectory: workingDirectory,
        command: shellCommand,
        windowId: windowId,
        paneId: paneId,
      });

      // 验证进程启动成功
      if (!handle.pid || handle.pid <= 0) {
        throw new Error('终端进程启动失败');
      }

      // 将窗口添加到 StatusPoller
      statusPoller?.addWindow(windowId, handle.pid);

      // 初始化输出缓存（如果还没有）
      if (!ptyOutputCache.has(windowId)) {
        ptyOutputCache.set(windowId, []);
      }

      // 订阅 PTY 数据，推送到渲染进程并缓存
      const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
        // 缓存输出
        const cache = ptyOutputCache.get(windowId);
        if (cache) {
          cache.push(data);
          // 限制缓存大小
          if (cache.length > MAX_CACHE_SIZE) {
            cache.shift();
          }
        }

        // 推送到渲染进程（包含 paneId）
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pty-data', { windowId, paneId, data });
        }
      });

      // 保存清理函数（使用 windowId-paneId 作为键）
      const key = paneId ? `${windowId}-${paneId}` : windowId;
      ptyDataUnsubscribers.set(key, unsubscribe);

      return {
        pid: handle.pid,
        status: WindowStatus.WaitingForInput,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to start window:', error);
      }
      throw new Error(errorMessage);
    }
  });

  // 创建终端进程
  ipcMain.handle('create-terminal', async (_event, config: TerminalConfig) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const handle = await processManager.spawnTerminal(config);
      return { success: true, data: handle };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 终止终端进程
  ipcMain.handle('kill-terminal', async (_event, pid: number) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      await processManager.killProcess(pid);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取终端状态
  ipcMain.handle('get-terminal-status', async (_event, pid: number) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const status = processManager.getProcessStatus(pid);
      return { success: true, data: status };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 列出所有终端进程
  ipcMain.handle('list-terminals', async () => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const processes = processManager.listProcesses();
      return { success: true, data: processes };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
  
  // 验证路径（包含权限检查）
  ipcMain.handle('validate-path', async (_event, pathToValidate: string) => {
    try {
      // 检查路径是否存在
      if (!existsSync(pathToValidate)) {
        return false;
      }

      // 检查是否有读取和执行权限
      try {
        accessSync(pathToValidate, constants.R_OK | constants.X_OK);
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      return false;
    }
  });

  // 关闭窗口（终止进程）
  ipcMain.handle('close-window', async (_event, { windowId }: { windowId: string }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }

      // 取消订阅 PTY 数据
      const unsubscribe = ptyDataUnsubscribers.get(windowId);
      if (unsubscribe) {
        unsubscribe();
        ptyDataUnsubscribers.delete(windowId);
      }

      // 清理输出缓存
      ptyOutputCache.delete(windowId);

      // 查找对应进程并终止
      const processes = processManager.listProcesses();
      const found = processes.find(p => p.windowId === windowId);
      if (found) {
        try {
          await processManager.killProcess(found.pid);
        } catch (error) {
          // 进程已退出，忽略错误
          if (process.env.NODE_ENV === 'development') {
            console.log(`Process ${found.pid} already exited`);
          }
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to close window:', error);
      }
      throw error;
    }
  });

  // 删除窗口（终止进程 + 移除配置）
  ipcMain.handle('delete-window', async (_event, { windowId }: { windowId: string }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      // 查找对应进程并终止
      const processes = processManager.listProcesses();
      const found = processes.find(p => p.windowId === windowId);
      if (found) {
        try {
          await processManager.killProcess(found.pid);
        } catch (error) {
          // 进程已退出，忽略错误
          if (process.env.NODE_ENV === 'development') {
            console.log(`Process ${found.pid} already exited`);
          }
        }
      }

      // 取消订阅 PTY 数据
      const unsubscribe = ptyDataUnsubscribers.get(windowId);
      if (unsubscribe) {
        unsubscribe();
        ptyDataUnsubscribers.delete(windowId);
      }

      // 清理 PTY 输出缓存
      ptyOutputCache.delete(windowId);

      // TODO: 移除窗口配置（Story 6.x 工作区持久化时实现）
      // 从 StatusPoller 移除窗口
      statusPoller?.removeWindow(windowId);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete window:', error);
      }
      throw error;
    }
  });

  // 打开文件夹
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

  // PTY 数据写入（用户输入 → PTY 进程）
  ipcMain.handle('pty-write', async (_event, { windowId, paneId, data }: { windowId: string; paneId?: string; data: string }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const processes = processManager.listProcesses();
      const found = processes.find(p =>
        p.windowId === windowId && (paneId ? p.paneId === paneId : true)
      );
      if (found) {
        processManager.writeToPty(found.pid, data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to write to PTY:', error);
      }
    }
  });

  // PTY resize
  ipcMain.handle('pty-resize', async (_event, { windowId, paneId, cols, rows }: { windowId: string; paneId?: string; cols: number; rows: number }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const processes = processManager.listProcesses();
      const found = processes.find(p =>
        p.windowId === windowId && (paneId ? p.paneId === paneId : true)
      );
      if (found) {
        processManager.resizePty(found.pid, cols, rows);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to resize PTY:', error);
      }
    }
  });

  // 获取 PTY 历史输出
  ipcMain.handle('get-pty-history', async (_event, { windowId }: { windowId: string }) => {
    try {
      const cache = ptyOutputCache.get(windowId);
      return cache || [];
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to get PTY history:', error);
      }
      return [];
    }
  });

  // 拆分窗格（创建新的 PTY 进程）
  ipcMain.handle('split-pane', async (_event, config: TerminalConfig) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const handle = await processManager.spawnTerminal(config);
      return { pid: handle.pid };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to split pane:', error);
      }
      throw error;
    }
  });

  // 关闭窗格（终止 PTY 进程）
  ipcMain.handle('close-pane', async (_event, { windowId, paneId }: { windowId: string; paneId: string }) => {
    try {
      if (!processManager) {
        throw new Error('ProcessManager not initialized');
      }
      const processes = processManager.listProcesses();
      const found = processes.find(p => p.windowId === windowId && p.paneId === paneId);
      if (found) {
        await processManager.killProcess(found.pid);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to close pane:', error);
      }
      throw error;
    }
  });

  // 选择目录
  ipcMain.handle('select-directory', async () => {
    try {
      if (!mainWindow) {
        throw new Error('Main window not available');
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      // 不记录敏感路径信息到控制台
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to select directory:', error);
      }
      return null;
    }
  });

  // 视图切换：切换到终端视图
  ipcMain.handle('switch-to-terminal-view', (_event, { windowId }: { windowId: string }) => {
    if (!viewSwitcher) {
      throw new Error('ViewSwitcher not initialized');
    }
    currentView = 'terminal';
    viewSwitcher.switchToTerminalView(windowId);
  });

  // 视图切换：切换到统一视图
  ipcMain.handle('switch-to-unified-view', () => {
    if (!viewSwitcher) {
      throw new Error('ViewSwitcher not initialized');
    }
    currentView = 'unified';
    viewSwitcher.switchToUnifiedView();
  });

  // 保存工作区
  ipcMain.handle('save-workspace', async (_event, windows: Window[]) => {
    try {
      if (!workspaceManager) {
        throw new Error('WorkspaceManager not initialized');
      }

      const workspace = await workspaceManager.loadWorkspace();
      workspace.windows = windows;
      await workspaceManager.saveWorkspace(workspace);

      // 更新缓存的工作区状态
      currentWorkspace = workspace;

      return { success: true };
    } catch (error) {
      console.error('Failed to save workspace:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 加载工作区
  ipcMain.handle('load-workspace', async () => {
    try {
      if (!workspaceManager) {
        throw new Error('WorkspaceManager not initialized');
      }

      const workspace = await workspaceManager.loadWorkspace();
      currentWorkspace = workspace;
      return { success: true, data: workspace };
    } catch (error) {
      console.error('Failed to load workspace:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 触发自动保存
  ipcMain.on('trigger-auto-save', async (_event, windows?: Window[]) => {
    if (autoSaveManager && workspaceManager) {
      // 如果提供了窗口列表，更新缓存的工作区状态
      if (windows && currentWorkspace) {
        currentWorkspace.windows = windows;
      }
      autoSaveManager.triggerSave();
    }
  });

  // 从备份恢复工作区
  ipcMain.handle('recover-from-backup', async () => {
    try {
      if (!workspaceManager) {
        throw new Error('WorkspaceManager not initialized');
      }

      // 尝试从备份恢复
      const workspace = await workspaceManager.loadWorkspace();
      currentWorkspace = workspace;

      return { success: true, data: workspace };
    } catch (error) {
      console.error('Failed to recover from backup:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
