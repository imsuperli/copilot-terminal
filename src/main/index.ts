import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { existsSync, accessSync, constants } from 'fs';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { ProcessManager } from './services/ProcessManager';
import { TerminalConfig } from './types/process';
import { WindowStatus } from '../renderer/types/window';

let mainWindow: BrowserWindow | null = null;
let processManager: ProcessManager | null = null;
let windowCounter = 0; // 用于生成唯一的窗口编号

// 获取默认 shell，带回退逻辑
function getDefaultShell(): string {
  if (process.platform === 'win32') {
    // 检查 pwsh.exe 是否存在
    try {
      execSync('where pwsh.exe', { stdio: 'ignore' });
      return 'pwsh.exe';
    } catch {
      // 回退到 powershell.exe
      try {
        execSync('where powershell.exe', { stdio: 'ignore' });
        return 'powershell.exe';
      } catch {
        // 最后回退到 cmd.exe
        return 'cmd.exe';
      }
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

      // 生成 UUID 作为窗口 ID
      const windowId = randomUUID();

      // 获取默认 shell
      const defaultShell = getDefaultShell();
      const command = config.command || defaultShell;

      // 创建终端进程
      const handle = await processManager.spawnTerminal({
        workingDirectory: config.workingDirectory,
        command: command,
        windowId: windowId,
      });

      // 验证进程启动成功
      if (!handle.pid || handle.pid <= 0) {
        throw new Error('终端进程启动失败');
      }

      // 使用独立计数器生成窗口编号
      windowCounter++;
      const defaultName = `窗口 #${windowCounter}`;

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
      // TODO: 移除窗口配置（Story 6.x 工作区持久化时实现）
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete window:', error);
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
}
