import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { ProcessManager } from './services/ProcessManager';
import { TerminalConfig } from './types/process';

let mainWindow: BrowserWindow | null = null;
let processManager: ProcessManager | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: '#0a0a0a',
    title: 'ausome-terminal',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,      // 安全要求
      nodeIntegration: false,       // 安全要求
    },
  });

  // 开发环境加载 dev server,生产环境加载打包文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173'); // Vite dev server
    mainWindow.webContents.openDevTools(); // 开发模式自动打开开发者工具
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 初始化 ProcessManager
  processManager = new ProcessManager();
  
  // 注册 IPC handlers
  registerIPCHandlers();
  
  createWindow();

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
    app.quit();
  }
});

// IPC Handlers 注册
function registerIPCHandlers() {
  // 基础 IPC 通信验证
  ipcMain.handle('ping', () => 'pong');

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
}
