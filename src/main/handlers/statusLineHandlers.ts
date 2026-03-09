import { ipcMain } from 'electron';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import { ClaudeCodeConfig } from '../utils/claudeCodeConfig';
import * as path from 'path';
import * as app from 'electron';

export function registerStatusLineHandlers(ctx: HandlerContext) {
  const claudeCodeConfig = new ClaudeCodeConfig();

  // 检查 Claude Code 是否已安装
  ipcMain.handle('statusline-check-claude-installed', async () => {
    try {
      const installed = claudeCodeConfig.isClaudeCodeInstalled();
      return successResponse(installed);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 检查是否已配置
  ipcMain.handle('statusline-check-configured', async () => {
    try {
      const configured = claudeCodeConfig.isConfigured();
      return successResponse(configured);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 配置 Claude Code
  ipcMain.handle('statusline-configure', async () => {
    try {
      // 获取插件路径
      // 生产环境中 getAppPath() 返回 app.asar 路径，
      // 但经 asarUnpack 解包的文件实际在 app.asar.unpacked 目录下
      let appPath = (app as any).app.getAppPath();
      if (appPath.endsWith('app.asar')) {
        appPath = appPath.slice(0, -8) + 'app.asar.unpacked';
      }
      const pluginPath = path.join(appPath, 'dist', 'statusline', 'index.js');

      await claudeCodeConfig.configure(pluginPath);
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 移除配置
  ipcMain.handle('statusline-remove', async () => {
    try {
      await claudeCodeConfig.remove();
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 恢复备份
  ipcMain.handle('statusline-restore', async () => {
    try {
      await claudeCodeConfig.restore();
      return successResponse(true);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
