import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { ProcessManager } from './services/ProcessManager';
import { StatusPoller } from './services/StatusPoller';
import { ViewSwitcherImpl } from './services/ViewSwitcher';
import { WorkspaceManagerImpl } from './services/WorkspaceManager';
import { AutoSaveManagerImpl } from './services/AutoSaveManager';
import { PtySubscriptionManager } from './services/PtySubscriptionManager';
import { Workspace } from './types/workspace';
import { registerAllHandlers } from './handlers';
import { HandlerContext } from './handlers/HandlerContext';

let mainWindow: BrowserWindow | null = null;
let processManager: ProcessManager | null = null;
let statusPoller: StatusPoller | null = null;
let viewSwitcher: ViewSwitcherImpl | null = null;
let workspaceManager: WorkspaceManagerImpl | null = null;
let autoSaveManager: AutoSaveManagerImpl | null = null;
let ptySubscriptionManager: PtySubscriptionManager | null = null;
let currentWorkspace: Workspace | null = null; // 缓存当前工作区状态

// PTY 输出缓存：paneId -> 输出历史数组
const ptyOutputCache = new Map<string, string[]>();

// 退出标志，防止重复执行退出逻辑
let isQuitting = false;

// 当前视图状态：unified 或 terminal
let currentView: 'unified' | 'terminal' = 'unified';

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
        if (ptySubscriptionManager) {
          ptySubscriptionManager.clear();
        }
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

  // 初始化 PtySubscriptionManager
  ptySubscriptionManager = new PtySubscriptionManager();

  // 创建 handler 上下文并注册所有 IPC handlers
  const handlerContext: HandlerContext = {
    mainWindow,
    processManager,
    statusPoller,
    viewSwitcher,
    workspaceManager,
    autoSaveManager,
    ptySubscriptionManager,
    ptyOutputCache,
    currentWorkspace,
    setCurrentWorkspace: (workspace) => { currentWorkspace = workspace; },
  };
  registerAllHandlers(handlerContext);

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
  // 清理所有资源
  console.log('[Main] Cleaning up resources before exit...');

  // 停止状态轮询
  if (statusPoller) {
    statusPoller.stopPolling();
  }

  // 终止所有 PTY 进程
  if (processManager) {
    const processes = processManager.listProcesses();
    console.log(`[Main] Terminating ${processes.length} PTY processes...`);
    for (const proc of processes) {
      try {
        processManager.killProcess(proc.pid);
      } catch (error) {
        console.error(`[Main] Failed to kill process ${proc.pid}:`, error);
      }
    }
  }

  // 清理缓存
  ptyOutputCache.clear();

  if (process.platform !== 'darwin') {
    app.exit(0); // 使用 app.exit(0) 而不是 app.quit()
  }
});

