import { app, ipcMain } from 'electron';
import { readFileSync, existsSync, statSync } from 'fs';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import { scanInstalledIDEs, scanSpecificIDE, getSupportedIDENames, isImageFile } from '../utils/ideScanner';
import { IDEConfig } from '../types/workspace';
import { scanAvailableShellPrograms } from '../utils/shell';

export function registerSettingsHandlers(ctx: HandlerContext) {
  const { workspaceManager, getCurrentWorkspace, setCurrentWorkspace } = ctx;

  // 获取设置
  ipcMain.handle('get-settings', async () => {
    try {
      const workspace = getCurrentWorkspace();
      if (!workspace) {
        throw new Error('Workspace not loaded');
      }
      return successResponse(workspace.settings);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 更新设置
  ipcMain.handle('update-settings', async (_event, settings: any) => {
    try {
      const workspace = getCurrentWorkspace();
      if (!workspace || !workspaceManager) {
        throw new Error('Workspace not loaded');
      }

      const terminalSettings = settings?.terminal
        ? {
            ...workspace.settings.terminal,
            ...settings.terminal,
          }
        : workspace.settings.terminal;

      const tmuxSettings = settings?.tmux
        ? {
            ...workspace.settings.tmux,
            ...settings.tmux,
          }
        : workspace.settings.tmux;

      const updatedWorkspace = {
        ...workspace,
        settings: {
          ...workspace.settings,
          ...settings,
          terminal: terminalSettings,
          tmux: tmuxSettings,
        },
      };

      await workspaceManager.saveWorkspace(updatedWorkspace);
      setCurrentWorkspace(updatedWorkspace);

      return successResponse(updatedWorkspace.settings);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 扫描已安装的 IDE
  ipcMain.handle('scan-ides', async () => {
    try {
      const installedIDEs = scanInstalledIDEs();
      console.log('[IDE_SCAN] Found IDEs:', installedIDEs.map(ide => ({
        id: ide.id,
        name: ide.name,
        path: ide.path,
        source: ide.source,
        version: ide.version,
      })));
      return successResponse(installedIDEs);
    } catch (error) {
      console.error('[IDE_SCAN] Failed to scan IDEs:', error);
      return errorResponse(error);
    }
  });

  // 扫描特定 IDE
  ipcMain.handle('scan-specific-ide', async (_event, ideName: string) => {
    try {
      const path = scanSpecificIDE(ideName);
      return successResponse(path);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 获取支持的 IDE 名称列表
  ipcMain.handle('get-supported-ide-names', async () => {
    try {
      const names = getSupportedIDENames();
      return successResponse(names);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-available-shells', async () => {
    try {
      return successResponse(scanAvailableShellPrograms());
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 更新 IDE 配置
  ipcMain.handle('update-ide-config', async (_event, ideConfig: IDEConfig) => {
    try {
      const workspace = getCurrentWorkspace();
      if (!workspace || !workspaceManager) {
        throw new Error('Workspace not loaded');
      }

      const existingIndex = workspace.settings.ides.findIndex(ide => ide.id === ideConfig.id);

      let updatedIDEs: IDEConfig[];
      if (existingIndex >= 0) {
        // 更新现有 IDE
        updatedIDEs = [...workspace.settings.ides];
        updatedIDEs[existingIndex] = ideConfig;
      } else {
        // 添加新 IDE
        updatedIDEs = [...workspace.settings.ides, ideConfig];
      }

      const updatedWorkspace = {
        ...workspace,
        settings: {
          ...workspace.settings,
          ides: updatedIDEs,
        },
      };

      await workspaceManager.saveWorkspace(updatedWorkspace);
      setCurrentWorkspace(updatedWorkspace);

      return successResponse(updatedIDEs);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 删除 IDE 配置
  ipcMain.handle('delete-ide-config', async (_event, ideId: string) => {
    try {
      const workspace = getCurrentWorkspace();
      if (!workspace || !workspaceManager) {
        throw new Error('Workspace not loaded');
      }

      const updatedIDEs = workspace.settings.ides.filter(ide => ide.id !== ideId);

      const updatedWorkspace = {
        ...workspace,
        settings: {
          ...workspace.settings,
          ides: updatedIDEs,
        },
      };

      await workspaceManager.saveWorkspace(updatedWorkspace);
      setCurrentWorkspace(updatedWorkspace);

      return successResponse(updatedIDEs);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 获取IDE图标数据(base64)
  ipcMain.handle('get-ide-icon', async (_event, iconPath: string) => {
    try {
      if (iconPath.startsWith('data:')) {
        return successResponse(iconPath);
      }

      if (!existsSync(iconPath)) {
        throw new Error(`Icon file not found: ${iconPath}`);
      }

      const iconStat = statSync(iconPath);
      const isMacAppBundle = process.platform === 'darwin' && iconStat.isDirectory() && iconPath.endsWith('.app');

      if (iconStat.isDirectory() && !isMacAppBundle) {
        throw new Error(`Refusing to resolve IDE icon from directory path: ${iconPath}`);
      }

      if (isImageFile(iconPath)) {
        const ext = iconPath.split('.').pop()?.toLowerCase();
        const iconData = readFileSync(iconPath);
        const base64Data = iconData.toString('base64');

        let mimeType = 'image/png';
        if (ext === 'ico') {
          mimeType = 'image/x-icon';
        } else if (ext === 'jpg' || ext === 'jpeg') {
          mimeType = 'image/jpeg';
        } else if (ext === 'svg') {
          mimeType = 'image/svg+xml';
        }

        return successResponse(`data:${mimeType};base64,${base64Data}`);
      }

      const nativeIcon = await app.getFileIcon(iconPath, { size: 'large' });
      if (!nativeIcon.isEmpty()) {
        return successResponse(nativeIcon.toDataURL());
      }

      throw new Error(`Unable to resolve icon for path: ${iconPath}`);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
