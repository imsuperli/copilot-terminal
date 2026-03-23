import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron';
import path from 'path';
import { ProcessManager } from './services/ProcessManager';
import { StatusPoller } from './services/StatusPoller';
import { ViewSwitcherImpl } from './services/ViewSwitcher';
import { WorkspaceManagerImpl } from './services/WorkspaceManager';
import { AutoSaveManagerImpl } from './services/AutoSaveManager';
import { PtySubscriptionManager } from './services/PtySubscriptionManager';
import { ShutdownManager, ShutdownContext } from './services/ShutdownManager';
import { FileWatcherService } from './services/FileWatcherService';
import { GitBranchWatcher } from './services/GitBranchWatcher';
import { initProjectConfigWatcher, projectConfigWatcher } from './services/ProjectConfigWatcher';
import { Workspace } from './types/workspace';
import { registerAllHandlers } from './handlers';
import { HandlerContext } from './handlers/HandlerContext';
import { TmuxCompatService } from './services/TmuxCompatService';
import { SSHProfileStore } from './services/ssh/SSHProfileStore';
import { SSHVaultService } from './services/ssh/SSHVaultService';
import { SSHKnownHostsStore } from './services/ssh/SSHKnownHostsStore';
import { ElectronSSHHostKeyPromptService } from './services/ssh/SSHHostKeyPromptService';
import { LayoutNode, Pane } from '../shared/types/window';

let mainWindow: BrowserWindow | null = null;
let processManager: ProcessManager | null = null;
let statusPoller: StatusPoller | null = null;
let viewSwitcher: ViewSwitcherImpl | null = null;
let workspaceManager: WorkspaceManagerImpl | null = null;
let autoSaveManager: AutoSaveManagerImpl | null = null;
let ptySubscriptionManager: PtySubscriptionManager | null = null;
let shutdownManager: ShutdownManager | null = null;
let fileWatcherService: FileWatcherService | null = null;
let gitBranchWatcher: GitBranchWatcher | null = null;
let tmuxCompatService: TmuxCompatService | null = null;
let sshProfileStore: SSHProfileStore | null = null;
let sshVaultService: SSHVaultService | null = null;
let sshKnownHostsStore: SSHKnownHostsStore | null = null;
let sshHostKeyPromptService: ElectronSSHHostKeyPromptService | null = null;
let currentWorkspace: Workspace | null = null; // 缓存当前工作区状态

// 退出标志，防止重复执行退出逻辑
let isQuitting = false;

function getAllPanesFromLayout(layout: LayoutNode): Pane[] {
  if (layout.type === 'pane') {
    return [layout.pane];
  }

  return layout.children.flatMap((child) => getAllPanesFromLayout(child));
}

function getWindowWorkingDirectory(window: Workspace['windows'][number]): string | null {
  const panes = getAllPanesFromLayout(window.layout);
  const localPane = panes.find((pane) => pane.backend !== 'ssh' && pane.cwd);
  return localPane?.cwd || null;
}

function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/index.js');

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: '#0a0a0a',
    title: 'Copilot-Terminal',
    icon: path.join(__dirname, '../../resources/icon.png'),
    show: false, // 创建时不显示，等待渲染进程通知
    frame: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // macOS: 创建标准菜单栏（恢复 ⌘Q/⌘H/⌘M 等系统快捷键）
  // Windows/Linux: 移除菜单栏
  if (process.platform === 'darwin') {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { role: 'close' },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    Menu.setApplicationMenu(null);
  }

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
    }
  }, 5000);

  // 开发环境加载 dev server，优先读取环境变量，避免 localhost 在不同系统下解析差异
  if (process.env.NODE_ENV === 'development') {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
    mainWindow.loadURL(devServerUrl);
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
    // macOS: 关闭窗口只隐藏，不退出（除非用户通过 ⌘Q 触发退出）
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }

    // Windows/Linux: 检查当前视图状态
    const currentViewState = viewSwitcher?.getCurrentView() || 'unified';

    // 如果在终端视图（包括单窗口和组视图），返回统一视图而不是关闭窗口
    if (currentViewState === 'terminal' && !isQuitting) {
      event.preventDefault();
      // 通知渲染进程返回统一视图（会同时清除 activeWindowId 和 activeGroupId）
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
          fileWatcherService,
          gitBranchWatcher,
          tmuxCompatService,
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
  // 强制使用暗色主题（包括标题栏）
  nativeTheme.themeSource = 'dark';

  // 初始化 WorkspaceManager
  workspaceManager = new WorkspaceManagerImpl();

  // 崩溃恢复
  await workspaceManager.recoverFromCrash();

  // 初始化 AutoSaveManager
  autoSaveManager = new AutoSaveManagerImpl();

  // 初始化 SSH 基础设施
  sshProfileStore = new SSHProfileStore();
  sshVaultService = new SSHVaultService();
  sshKnownHostsStore = new SSHKnownHostsStore();
  sshHostKeyPromptService = new ElectronSSHHostKeyPromptService({
    getMainWindow: () => mainWindow,
  });

  // 初始化 ProcessManager
  processManager = new ProcessManager(() => currentWorkspace?.settings ?? null);
  processManager.setSSHKnownHostsStore(sshKnownHostsStore);
  processManager.setSSHHostKeyPromptService(sshHostKeyPromptService);

  processManager.warmupConPtyDll().catch((error) => {
    console.error('[Main] ConPTY DLL warmup failed:', error);
  });

  // 初始化 TmuxCompatService（内部会创建 TmuxRpcServer）
  tmuxCompatService = new TmuxCompatService({
    processManager: processManager as any,
    getWindowStore: () => currentWorkspace ?? { windows: [] },
    updateWindowStore: (updater: (state: any) => void) => {
      if (currentWorkspace) {
        updater(currentWorkspace);
      }
    },
    onPaneProcessStarted: ({ windowId, paneId, pid }) => {
      statusPoller?.addPane(windowId, paneId, pid);
    },
    onPaneProcessStopped: ({ paneId }) => {
      statusPoller?.removePane(paneId);
    },
    onPaneData: ({ windowId, paneId, data, seq }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty-data', {
          windowId,
          paneId,
          data,
          seq,
        });
      }
    },
    debug: process.env.AUSOME_TMUX_DEBUG === '1',
  });

  // 将 tmuxCompatService 注入 ProcessManager（解决循环依赖）
  processManager.setTmuxCompatService(tmuxCompatService);

  // 监听 TmuxCompatService 事件并转发到渲染进程
  tmuxCompatService.on('pane-title-changed', (data: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tmux:pane-title-changed', data);
    }
  });

  tmuxCompatService.on('pane-style-changed', (data: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tmux:pane-style-changed', data);
    }
  });

  tmuxCompatService.on('window-synced', (data: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tmux:window-synced', data);
    }
  });

  tmuxCompatService.on('window-removed', (data: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tmux:window-removed', data);
    }
  });

  // 初始化 PtySubscriptionManager
  ptySubscriptionManager = new PtySubscriptionManager();

  // 初始化 ShutdownManager
  shutdownManager = new ShutdownManager();

  // 初始化 FileWatcherService（通用文件监听服务）
  fileWatcherService = new FileWatcherService();

  // 初始化 ProjectConfigWatcher（基于 FileWatcherService）
  initProjectConfigWatcher(fileWatcherService);

  const syncProjectConfigWatchers = async () => {
    if (!currentWorkspace) {
      return;
    }

    const activeWindowIds = new Set(currentWorkspace.windows.map((window) => window.id));
    const windowsToWatch = currentWorkspace.windows.map((window) => ({
      id: window.id,
      cwd: getWindowWorkingDirectory(window),
    }));

    for (const watchedWindowId of projectConfigWatcher.getWatchedWindowIds()) {
      if (!activeWindowIds.has(watchedWindowId)) {
        projectConfigWatcher.stopWatching(watchedWindowId);
      }
    }

    for (const { id, cwd } of windowsToWatch) {
      if (!activeWindowIds.has(id) || !cwd) {
        projectConfigWatcher.stopWatching(id);
        continue;
      }

      await projectConfigWatcher.startWatching(id, cwd, (updatedConfig) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project-config-updated', {
            windowId: id,
            projectConfig: updatedConfig,
          });
        }
      });
    }
  };

  createWindow();

  // 初始化 StatusPoller、ViewSwitcher 和 GitBranchWatcher（需要 mainWindow 已创建）
  if (mainWindow) {
    statusPoller = new StatusPoller(processManager.getStatusDetector(), mainWindow);
    statusPoller.startPolling();
    viewSwitcher = new ViewSwitcherImpl(mainWindow);

    // 初始化 GitBranchWatcher（基于 FileWatcherService）
    gitBranchWatcher = new GitBranchWatcher(fileWatcherService);

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
    gitBranchWatcher,
    tmuxCompatService,
    sshProfileStore,
    sshVaultService,
    sshKnownHostsStore,
    currentWorkspace,
    getCurrentWorkspace: () => currentWorkspace,
    setCurrentWorkspace: (workspace) => { currentWorkspace = workspace; },
    syncProjectConfigWatchers,
  };
  registerAllHandlers(handlerContext);

  // 加载工作区并恢复窗口
  try {
    const workspace = await workspaceManager.loadWorkspace();
    currentWorkspace = workspace;
    await syncProjectConfigWatchers();

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
        // 注意：不再为所有窗口启动 git 监听，只在窗口激活时才监听
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

  // macOS 特定: 点击 Dock 图标时重新显示或创建窗口
  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// macOS: ⌘Q 触发 before-quit，标记退出状态以便 close 事件不再隐藏窗口
app.on('before-quit', () => {
  isQuitting = true;
});

// 所有窗口关闭时退出应用 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 使用 ShutdownManager 进行完整的资源清理
    if (shutdownManager && !isQuitting) {
      isQuitting = true;
      console.log('[Main] Window closed, starting shutdown...');

      shutdownManager.shutdown({
        mainWindow,
        processManager,
        statusPoller,
        autoSaveManager,
        ptySubscriptionManager,
        fileWatcherService,
        gitBranchWatcher,
        tmuxCompatService,
        currentWorkspace,
      }).catch(error => {
        console.error('[Main] Shutdown failed:', error);
        process.exit(1);
      });
    } else {
      // 如果 ShutdownManager 未初始化，直接退出
      app.exit(0);
    }
  }
});
