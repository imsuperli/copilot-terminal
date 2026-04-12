import { ipcMain } from 'electron';
import type { Settings } from '../../shared/types/workspace';
import {
  SetPluginEnabledConfig,
  SetPluginLanguageBindingConfig,
  SetPluginSettingsConfig,
  UninstallPluginConfig,
} from '../../shared/types/electron-api';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';

export function registerPluginHandlers(ctx: HandlerContext) {
  const { pluginManager, workspaceManager, getCurrentWorkspace, setCurrentWorkspace } = ctx;

  ipcMain.handle('list-plugins', async () => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      return successResponse(await pluginManager.listPlugins());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-plugin-registry', async () => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      return successResponse(await pluginManager.getRegistrySnapshot());
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('list-plugin-catalog', async (_event, query) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      return successResponse(await pluginManager.listCatalog(query ?? {}));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('install-marketplace-plugin', async (_event, config) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      return successResponse(await pluginManager.installMarketplacePlugin(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('install-local-plugin', async (_event, config) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      return successResponse(await pluginManager.installLocalPlugin(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('update-plugin', async (_event, config) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      return successResponse(await pluginManager.updatePlugin(config));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('uninstall-plugin', async (_event, config: UninstallPluginConfig) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      const workspace = getCurrentWorkspace();
      if (workspace && isPluginReferencedByWorkspace(workspace.settings, config.pluginId)) {
        throw new Error(`Plugin ${config.pluginId} is still referenced by the current workspace`);
      }

      await pluginManager.uninstallPlugin(config.pluginId);
      return successResponse();
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('set-plugin-enabled', async (_event, config: SetPluginEnabledConfig) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      if ((config.scope ?? 'workspace') === 'global') {
        if (config.enabled === null) {
          throw new Error('Global plugin enable state cannot be inherited');
        }

        await pluginManager.setEnabledByDefault(config.pluginId, config.enabled);
        const workspace = getCurrentWorkspace();
        if (!workspace) {
          throw new Error('Workspace not loaded');
        }
        return successResponse(workspace.settings);
      }

      return successResponse(await updateWorkspacePluginSettings(ctx, (currentSettings) => {
        const enabledPluginIds = new Set(currentSettings.enabledPluginIds ?? []);
        const disabledPluginIds = new Set(currentSettings.disabledPluginIds ?? []);

        if (config.enabled === null) {
          enabledPluginIds.delete(config.pluginId);
          disabledPluginIds.delete(config.pluginId);
        } else if (config.enabled) {
          enabledPluginIds.add(config.pluginId);
          disabledPluginIds.delete(config.pluginId);
        } else {
          disabledPluginIds.add(config.pluginId);
          enabledPluginIds.delete(config.pluginId);
        }

        return {
          ...currentSettings,
          enabledPluginIds: Array.from(enabledPluginIds).sort((left, right) => left.localeCompare(right)),
          disabledPluginIds: Array.from(disabledPluginIds).sort((left, right) => left.localeCompare(right)),
        };
      }));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('set-plugin-language-binding', async (_event, config: SetPluginLanguageBindingConfig) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      if ((config.scope ?? 'workspace') === 'global') {
        await pluginManager.setGlobalLanguageBinding(config.language, config.pluginId);
        const workspace = getCurrentWorkspace();
        if (!workspace) {
          throw new Error('Workspace not loaded');
        }
        return successResponse(workspace.settings);
      }

      return successResponse(await updateWorkspacePluginSettings(ctx, (currentSettings) => {
        const languageBindings = {
          ...(currentSettings.languageBindings ?? {}),
        };

        if (!config.pluginId) {
          delete languageBindings[config.language];
        } else {
          languageBindings[config.language] = config.pluginId;
        }

        return {
          ...currentSettings,
          languageBindings,
        };
      }));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('set-plugin-settings', async (_event, config: SetPluginSettingsConfig) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      if ((config.scope ?? 'workspace') === 'global') {
        await pluginManager.setGlobalPluginSettings(config.pluginId, config.values);
        const workspace = getCurrentWorkspace();
        if (!workspace) {
          throw new Error('Workspace not loaded');
        }
        return successResponse(workspace.settings);
      }

      return successResponse(await updateWorkspacePluginSettings(ctx, (currentSettings) => ({
        ...currentSettings,
        pluginSettings: buildWorkspacePluginSettingsSnapshot(currentSettings.pluginSettings, config.pluginId, config.values),
      })));
    } catch (error) {
      return errorResponse(error);
    }
  });
}

async function updateWorkspacePluginSettings(
  ctx: HandlerContext,
  update: (currentSettings: NonNullable<Settings['plugins']>) => NonNullable<Settings['plugins']>,
): Promise<Settings> {
  const { workspaceManager, getCurrentWorkspace, setCurrentWorkspace } = ctx;
  const workspace = getCurrentWorkspace();
  if (!workspace || !workspaceManager) {
    throw new Error('Workspace not loaded');
  }

  const currentPluginSettings: NonNullable<Settings['plugins']> = {
    ...(workspace.settings.plugins ?? {}),
  };
  const nextPluginSettings = update(currentPluginSettings);
  const updatedWorkspace = {
    ...workspace,
    settings: {
      ...workspace.settings,
      plugins: nextPluginSettings,
    },
  };

  await workspaceManager.saveWorkspace(updatedWorkspace);
  setCurrentWorkspace(updatedWorkspace);
  return updatedWorkspace.settings;
}

function isPluginReferencedByWorkspace(settings: Settings, pluginId: string): boolean {
  const workspacePluginSettings = settings.plugins;
  if (!workspacePluginSettings) {
    return false;
  }

  return (workspacePluginSettings.enabledPluginIds ?? []).includes(pluginId)
    || (workspacePluginSettings.disabledPluginIds ?? []).includes(pluginId)
    || Object.values(workspacePluginSettings.languageBindings ?? {}).includes(pluginId)
    || Object.prototype.hasOwnProperty.call(workspacePluginSettings.pluginSettings ?? {}, pluginId);
}

function buildWorkspacePluginSettingsSnapshot(
  currentSettings: Record<string, Record<string, unknown>> | undefined,
  pluginId: string,
  values: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const nextSettings = {
    ...(currentSettings ?? {}),
  };
  const normalizedValues = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(normalizedValues).length === 0) {
    delete nextSettings[pluginId];
  } else {
    nextSettings[pluginId] = normalizedValues;
  }

  return nextSettings;
}
