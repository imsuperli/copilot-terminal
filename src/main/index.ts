import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { ProcessManager } from './services/ProcessManager';
import { StatusPoller } from './services/StatusPoller';
import { ViewSwitcherImpl } from './services/ViewSwitcher';
import { WorkspaceManagerImpl } from './services/WorkspaceManager';
import { AutoSaveManagerImpl } from './services/AutoSaveManager';
import { PtySubscriptionManager } from './services/PtySubscriptionManager';
import { ShutdownManager, ShutdownContext } from './services/ShutdownManager';
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
let shutdownManager: ShutdownManager | null = null;
let currentWorkspace: Workspace | null = null; // 缓存当前工作区状态

// PTY 输出缓存：paneId -> 输出历史数组
const ptyOutputCache = new Map<string, string[]>();

// 退出标志，防止重复执行退出逻辑
let isQuitting = false;

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
    // 检查当前视图状态（从 ViewSwitcher 获取）
    const currentViewState = viewSwitcher?.getCurrentView() || 'unified';

    // 如果在终端视图，返回统一视图而不是关闭窗口
    if (currentViewState === 'terminal' && !isQuitting) {
      event.preventDefault();
      viewSwitcher?.switchToUnifiedView();
      return;
    }

    // 在统一视图或已经在退出流程中，执行正常关闭
    if (!isQuitting) {
      event.preventDefault();
      isQuitting = true;

      // 使用 ShutdownManager 处理退出
      if (shutdownManager) {
        const shutdownContext: ShutdownContext = {
          mainWindow,
          processManager,
          statusPoller,
          autoSaveManager,
          ptySubscriptionManager,
          ptyOutputCache,
          currentWorkspace,
        };

        await shutdownManager.shutdown(shutdownContext);
      } else {
        // 如果 ShutdownManager 未初始化，直接退出
        console.error('[ELECTRON] ShutdownManager not initialized, forcing exit');
        process.exit(1);
      }
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

  // 初始化 ShutdownManager
  shutdownManager = new ShutdownManager();

  createWindow();

  // 初始化 StatusPoller 和 ViewSwitcher（需要 mainWindow 已创建）
  if (mainWindow) {
    statusPoller = new StatusPoller(processManager.getStatusDetector(), mainWindow);
    statusPoller.startPolling();
    viewSwitcher = new ViewSwitcherImpl(mainWindow);

    // 初始化 WorkspaceRestorer
    // workspaceRestorer = new WorkspaceRestorerImpl(processManager, mainWindow);
  }

  // 创建 handler 上下文并注册所有 IPC handlers（必须在所有服务初始化后）
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

  // 加载工作区并恢复窗口
  try {
    const workspace = await workspaceManager.loadWorkspace();
    currentWorkspace = workspace;

    // 启动自动保存
    if (autoSaveManager && workspaceManager) {
      autoSaveManager.startAutoSave(workspaceManager, () => {
        // 返回当前工作区状态（必须同步返回，所以依赖缓存的 currentWorkspace）
        if (!currentWorkspace) {
          throw new Error('Current workspace not available');
        }
        return currentWorkspace;
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

