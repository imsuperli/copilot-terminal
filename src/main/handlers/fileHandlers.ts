import { ipcMain, dialog, shell } from 'electron';
import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { HandlerContext } from './HandlerContext';
import { PathValidator } from '../utils/pathValidator';
import { successResponse, errorResponse } from './HandlerResponse';
import { getOpenInIDEArgs } from '../utils/ideScanner';

export function registerFileHandlers(ctx: HandlerContext) {
  const { mainWindow, getCurrentWorkspace } = ctx;

  ipcMain.handle('validate-path', async (_event, pathToValidate: string) => {
    try {
      const result = PathValidator.validate(pathToValidate);
      if (process.env.NODE_ENV === 'development' && !result.valid) {
        console.log(`[PathValidator] Path validation failed: ${pathToValidate}, reason: ${result.reason}`);
      }
      return successResponse(result.valid);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('create-directory', async (_event, pathToCreate: string) => {
    try {
      const result = PathValidator.validateCreatable(pathToCreate);
      if (!result.valid) {
        throw new Error(`工作目录无法创建: ${result.reason}`);
      }

      const safePath = PathValidator.getCreatablePath(pathToCreate);
      if (!safePath) {
        throw new Error('无法解析工作目录路径');
      }

      if (!existsSync(safePath)) {
        mkdirSync(safePath, { recursive: true });
      }

      return successResponse(safePath);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('select-directory', async () => {
    try {
      if (!mainWindow) throw new Error('Main window not available');
      const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
      if (result.canceled || result.filePaths.length === 0) {
        return successResponse(null);
      }
      return successResponse(result.filePaths[0]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('select-executable-file', async () => {
    try {
      if (!mainWindow) throw new Error('Main window not available');

      const dialogOptions: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        title: '选择 Shell 程序',
      };

      if (process.platform === 'win32') {
        dialogOptions.filters = [
          { name: 'Executable Files', extensions: ['exe', 'cmd', 'bat', 'com'] },
          { name: 'All Files', extensions: ['*'] },
        ];
      }

      const result = await dialog.showOpenDialog(mainWindow, dialogOptions);

      if (result.canceled || result.filePaths.length === 0) {
        return successResponse(null);
      }

      return successResponse(result.filePaths[0]);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('open-folder', async (_event, { path }: { path: string }) => {
    try {
      await shell.openPath(path);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('open-in-ide', async (_event, { ide, path }: { ide: string; path: string }) => {
    try {
      const workspace = getCurrentWorkspace();
      if (!workspace) {
        throw new Error('Workspace not loaded');
      }

      // 从设置中查找 IDE 配置
      const ideConfig = workspace.settings.ides.find(i => i.id === ide || i.command === ide);
      if (!ideConfig) {
        throw new Error(`IDE ${ide} not found in settings`);
      }

      if (!ideConfig.enabled) {
        throw new Error(`IDE ${ide} is disabled`);
      }

      let command: string;
      let args: string[];

      // 如果配置了路径，使用路径；否则使用命令
      if (ideConfig.path && existsSync(ideConfig.path)) {
        command = ideConfig.path;
        args = getOpenInIDEArgs(ideConfig, path);
      } else {
        command = ideConfig.command;
        args = getOpenInIDEArgs(ideConfig, path);
      }

      console.log(`Opening ${ideConfig.name} with command: ${command} ${args.join(' ')}`);

      // 启动 IDE - 使用 shell: false 并正确处理参数
      return new Promise((resolve) => {
        const proc = spawn(command, args, {
          detached: true,
          stdio: 'ignore',
          shell: false, // 改为 false，避免 shell 解析问题
          windowsHide: false, // 确保窗口可见
        });

        proc.on('error', (error) => {
          console.error(`Failed to open ${ideConfig.name}:`, error);
          resolve(errorResponse(new Error(`Failed to open ${ideConfig.name}: ${error.message}`)));
        });

        proc.on('spawn', () => {
          console.log(`${ideConfig.name} process spawned successfully`);
        });

        proc.unref();

        // 延迟一点再返回成功，确保进程启动
        setTimeout(() => {
          resolve(successResponse());
        }, 100);
      });
    } catch (error) {
      console.error('open-in-ide error:', error);
      return errorResponse(error);
    }
  });

  ipcMain.handle('open-external-url', async (_event, { url }: { url: string }) => {
    try {
      // 验证 URL 格式
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('Invalid URL: must start with http:// or https://');
      }

      await shell.openExternal(url);

      return successResponse();
    } catch (error) {
      console.error('Failed to open external URL:', error);
      return errorResponse(error);
    }
  });
}
