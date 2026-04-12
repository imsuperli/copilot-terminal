import { app, ipcMain } from 'electron';
import { readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import { scanInstalledIDEsAsync, scanSpecificIDE, getSupportedIDENames, isImageFile } from '../utils/ideScanner';
import { IDEConfig } from '../types/workspace';
import { scanAvailableShellPrograms } from '../utils/shell';
import type { ChatSettings, LLMProviderConfig } from '../../shared/types/chat';
import type { Settings, Workspace } from '../types/workspace';

/**
 * 从 macOS .app bundle 的 Info.plist 中提取 .icns 图标路径
 */
function resolveIcnsFromAppBundle(appPath: string): string | null {
  try {
    const plistPath = join(appPath, 'Contents', 'Info.plist');
    if (!existsSync(plistPath)) return null;
    // 用 macOS 自带的 defaults 命令读取 CFBundleIconFile
    const iconFile = execSync(
      `defaults read "${plistPath}" CFBundleIconFile`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    ).trim();
    if (!iconFile) return null;
    // CFBundleIconFile 可能带或不带 .icns 后缀
    const iconName = iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`;
    const icnsPath = join(appPath, 'Contents', 'Resources', iconName);
    return existsSync(icnsPath) ? icnsPath : null;
  } catch {
    return null;
  }
}

export function registerSettingsHandlers(ctx: HandlerContext) {
  const { workspaceManager, getCurrentWorkspace, setCurrentWorkspace } = ctx;

  // 获取设置
  ipcMain.handle('get-settings', async () => {
    try {
      const workspace = getCurrentWorkspace();
      if (!workspace) {
        throw new Error('Workspace not loaded');
      }

      const migratedWorkspace = await migrateInlineChatProviderApiKeys(ctx, workspace);
      if (migratedWorkspace !== workspace) {
        setCurrentWorkspace(migratedWorkspace);
      }

      return successResponse(await hydrateSettingsForResponse(ctx, migratedWorkspace.settings));
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

      const featureSettings = settings?.features
        ? {
            ...workspace.settings.features,
            ...settings.features,
          }
        : workspace.settings.features;

      const pluginSettings = settings?.plugins
        ? {
            ...workspace.settings.plugins,
            ...settings.plugins,
            languageBindings: settings.plugins.languageBindings
              ? {
                  ...workspace.settings.plugins?.languageBindings,
                  ...settings.plugins.languageBindings,
                }
              : workspace.settings.plugins?.languageBindings,
            pluginSettings: settings.plugins.pluginSettings
              ? {
                  ...workspace.settings.plugins?.pluginSettings,
                  ...settings.plugins.pluginSettings,
                }
              : workspace.settings.plugins?.pluginSettings,
          }
        : workspace.settings.plugins;

      const mergedChatSettings = settings?.chat
        ? {
            ...workspace.settings.chat,
            ...settings.chat,
          }
        : workspace.settings.chat;
      const chatSettings = await sanitizeChatSettingsForPersistence(
        ctx,
        mergedChatSettings,
        workspace.settings.chat,
      );

      const updatedWorkspace = {
        ...workspace,
        settings: {
          ...workspace.settings,
          ...settings,
          terminal: terminalSettings,
          tmux: tmuxSettings,
          features: featureSettings,
          plugins: pluginSettings,
          chat: chatSettings,
        },
      };

      await workspaceManager.saveWorkspace(updatedWorkspace);
      setCurrentWorkspace(updatedWorkspace);

      return successResponse(await hydrateSettingsForResponse(ctx, updatedWorkspace.settings));
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 扫描已安装的 IDE
  ipcMain.handle('scan-ides', async () => {
    try {
      const installedIDEs = await scanInstalledIDEsAsync();
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

      // macOS .app bundle：从 Info.plist 提取 .icns 文件，用 sips 转 PNG
      if (isMacAppBundle) {
        const icnsPath = resolveIcnsFromAppBundle(iconPath);
        if (icnsPath) {
          const hash = icnsPath.replace(/[^a-zA-Z0-9]/g, '_');
          const pngPath = join(tmpdir(), `ide-icon-${hash}.png`);
          if (!existsSync(pngPath)) {
            execSync(`sips -s format png "${icnsPath}" --out "${pngPath}" --resampleWidth 256`, { stdio: 'ignore' });
          }
          const pngData = readFileSync(pngPath);
          return successResponse(`data:image/png;base64,${pngData.toString('base64')}`);
        }
      }

      if (isImageFile(iconPath)) {
        const ext = iconPath.split('.').pop()?.toLowerCase();

        // macOS .icns 格式：用 sips 转换为 PNG
        if (ext === 'icns') {
          const hash = iconPath.replace(/[^a-zA-Z0-9]/g, '_');
          const pngPath = join(tmpdir(), `ide-icon-${hash}.png`);
          if (!existsSync(pngPath)) {
            execSync(`sips -s format png "${iconPath}" --out "${pngPath}" --resampleWidth 256`, { stdio: 'ignore' });
          }
          const pngData = readFileSync(pngPath);
          return successResponse(`data:image/png;base64,${pngData.toString('base64')}`);
        }

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

async function hydrateSettingsForResponse(ctx: HandlerContext, settings: Settings): Promise<Settings> {
  return {
    ...settings,
    chat: await hydrateChatSettings(ctx, settings.chat),
  };
}

async function hydrateChatSettings(ctx: HandlerContext, chatSettings: ChatSettings | undefined): Promise<ChatSettings | undefined> {
  if (!chatSettings) {
    return chatSettings;
  }

  const providers = ctx.chatProviderVaultService
    ? await ctx.chatProviderVaultService.hydrateProviders(chatSettings.providers ?? [])
    : chatSettings.providers ?? [];

  return {
    ...chatSettings,
    providers,
  };
}

async function sanitizeChatSettingsForPersistence(
  ctx: HandlerContext,
  chatSettings: ChatSettings | undefined,
  previousChatSettings: ChatSettings | undefined,
): Promise<ChatSettings | undefined> {
  if (!chatSettings) {
    return chatSettings;
  }

  const providers = chatSettings.providers ?? [];

  if (ctx.chatProviderVaultService) {
    const previousProviderIds = new Set((previousChatSettings?.providers ?? []).map((provider) => provider.id));
    const nextProviderIds = new Set(providers.map((provider) => provider.id));

    await Promise.all(providers.map(async (provider) => {
      const apiKey = provider.apiKey.trim();
      if (!apiKey) {
        return;
      }

      await ctx.chatProviderVaultService?.setApiKey(provider.id, apiKey);
    }));

    await Promise.all(
      Array.from(previousProviderIds)
        .filter((providerId) => !nextProviderIds.has(providerId))
        .map((providerId) => ctx.chatProviderVaultService?.remove(providerId)),
    );
  }

  return {
    ...chatSettings,
    providers: providers.map(sanitizeProviderForPersistence),
  };
}

async function migrateInlineChatProviderApiKeys(
  ctx: HandlerContext,
  workspace: Workspace,
): Promise<Workspace> {
  const providers = workspace.settings.chat?.providers ?? [];
  const hasInlineApiKeys = providers.some((provider) => provider.apiKey.trim().length > 0);

  if (!hasInlineApiKeys) {
    return workspace;
  }

  const sanitizedChatSettings = await sanitizeChatSettingsForPersistence(
    ctx,
    workspace.settings.chat,
    workspace.settings.chat,
  );

  const nextWorkspace: Workspace = {
    ...workspace,
    settings: {
      ...workspace.settings,
      chat: sanitizedChatSettings,
    },
  };

  if (ctx.workspaceManager) {
    await ctx.workspaceManager.saveWorkspace(nextWorkspace);
  }

  return nextWorkspace;
}

function sanitizeProviderForPersistence(provider: LLMProviderConfig): LLMProviderConfig {
  return {
    ...provider,
    apiKey: '',
  };
}
