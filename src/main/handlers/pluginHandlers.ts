import { ipcMain } from 'electron';
import type { Settings } from '../../shared/types/workspace';
import {
  SetPluginEnabledConfig,
  SetPluginSettingsConfig,
  UninstallPluginConfig,
} from '../../shared/types/electron-api';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';

export function registerPluginHandlers(ctx: HandlerContext) {
  const {
    pluginManager,
    languageFeatureService,
  } = ctx;

  ipcMain.handle('list-plugins', async (_event, config) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      await reconcileConflictingPlugins(ctx);
      return successResponse(await pluginManager.listPlugins(config ?? {}));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('get-plugin-registry', async () => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      await reconcileConflictingPlugins(ctx);
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

      const result = await pluginManager.installMarketplacePlugin(config);
      await clearWorkspacePluginReferences(ctx, result.replacedPluginIds);
      await languageFeatureService?.resetSessions();
      return successResponse(result.item);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('install-local-plugin', async (_event, config) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      const result = await pluginManager.installLocalPlugin(config);
      await clearWorkspacePluginReferences(ctx, result.replacedPluginIds);
      await languageFeatureService?.resetSessions();
      return successResponse(result.item);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('update-plugin', async (_event, config) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      const result = await pluginManager.updatePlugin(config);
      await clearWorkspacePluginReferences(ctx, result.replacedPluginIds);
      await languageFeatureService?.resetSessions();
      return successResponse(result.item);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle('uninstall-plugin', async (_event, config: UninstallPluginConfig) => {
    try {
      if (!pluginManager) {
        throw new Error('PluginManager not initialized');
      }

      const previousPluginSettings = ctx.getCurrentWorkspace()?.settings.plugins;
      await clearWorkspacePluginReferences(ctx, [config.pluginId]);
      try {
        await pluginManager.uninstallPlugin(config.pluginId);
      } catch (error) {
        await restoreWorkspacePluginSettings(ctx, previousPluginSettings);
        throw error;
      }
      await languageFeatureService?.resetSessions();
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
        await languageFeatureService?.resetSessions();
        const workspace = ctx.getCurrentWorkspace();
        if (!workspace) {
          throw new Error('Workspace not loaded');
        }
        return successResponse(workspace.settings);
      }

      const settings = await updateWorkspacePluginSettings(ctx, (currentSettings) => {
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
      });

      await languageFeatureService?.resetSessions();
      return successResponse(settings);
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
        await languageFeatureService?.resetSessions(config.pluginId);
        const workspace = ctx.getCurrentWorkspace();
        if (!workspace) {
          throw new Error('Workspace not loaded');
        }
        return successResponse(workspace.settings);
      }

      const settings = await updateWorkspacePluginSettings(ctx, (currentSettings) => ({
        ...currentSettings,
        pluginSettings: buildWorkspacePluginSettingsSnapshot(currentSettings.pluginSettings, config.pluginId, config.values),
      }));

      await languageFeatureService?.resetSessions(config.pluginId);
      return successResponse(settings);
    } catch (error) {
      return errorResponse(error);
    }
  });
}

async function updateWorkspacePluginSettings(
  ctx: HandlerContext,
  update: (currentSettings: NonNullable<Settings['plugins']>) => NonNullable<Settings['plugins']>,
): Promise<Settings> {
  const workspace = ctx.getCurrentWorkspace();
  if (!workspace || !ctx.workspaceManager) {
    throw new Error('Workspace not loaded');
  }

  const currentPluginSettings: NonNullable<Settings['plugins']> = {
    ...(workspace.settings.plugins ?? {}),
  };
  const nextPluginSettings = update(currentPluginSettings);
  return await persistWorkspacePluginSettings(ctx, nextPluginSettings);
}

async function clearWorkspacePluginReferences(ctx: HandlerContext, pluginIds: string[]): Promise<Settings | null> {
  const normalizedPluginIds = Array.from(new Set(pluginIds.filter((pluginId) => typeof pluginId === 'string' && pluginId.length > 0)));
  if (normalizedPluginIds.length === 0) {
    return null;
  }

  const workspace = ctx.getCurrentWorkspace();
  if (!workspace || !ctx.workspaceManager) {
    return null;
  }

  const currentPluginSettings = workspace.settings.plugins;
  const nextPluginSettings = removePluginReferencesFromWorkspaceSettings(currentPluginSettings, normalizedPluginIds);

  if (nextPluginSettings === currentPluginSettings) {
    return workspace.settings;
  }

  return await persistWorkspacePluginSettings(ctx, nextPluginSettings);
}

async function reconcileConflictingPlugins(ctx: HandlerContext): Promise<void> {
  if (!ctx.pluginManager) {
    throw new Error('PluginManager not initialized');
  }

  const removedPluginIds = await ctx.pluginManager.reconcileConflictingPlugins();
  if (removedPluginIds.length === 0) {
    return;
  }

  await clearWorkspacePluginReferences(ctx, removedPluginIds);
  await ctx.languageFeatureService?.resetSessions();
}

async function restoreWorkspacePluginSettings(ctx: HandlerContext, pluginSettings: Settings['plugins']): Promise<void> {
  if (!ctx.getCurrentWorkspace() || !ctx.workspaceManager) {
    return;
  }

  try {
    await persistWorkspacePluginSettings(ctx, pluginSettings);
  } catch (restoreError) {
    console.error('Failed to restore workspace plugin settings after uninstall failure:', restoreError);
  }
}

async function persistWorkspacePluginSettings(ctx: HandlerContext, pluginSettings: Settings['plugins']): Promise<Settings> {
  const workspace = ctx.getCurrentWorkspace();
  if (!workspace || !ctx.workspaceManager) {
    throw new Error('Workspace not loaded');
  }

  const updatedWorkspace = {
    ...workspace,
    settings: {
      ...workspace.settings,
      plugins: pluginSettings,
    },
  };

  await ctx.workspaceManager.saveWorkspace(updatedWorkspace);
  ctx.setCurrentWorkspace(updatedWorkspace);
  return updatedWorkspace.settings;
}

function removePluginReferencesFromWorkspaceSettings(
  settings: Settings['plugins'],
  pluginIds: string[],
): Settings['plugins'] {
  if (!settings) {
    return settings;
  }

  const pluginIdSet = new Set(pluginIds);
  const enabledPluginIds = (settings.enabledPluginIds ?? []).filter((pluginId) => !pluginIdSet.has(pluginId));
  const disabledPluginIds = (settings.disabledPluginIds ?? []).filter((pluginId) => !pluginIdSet.has(pluginId));
  const pluginSettings = Object.fromEntries(
    Object.entries(settings.pluginSettings ?? {}).filter(([pluginId]) => !pluginIdSet.has(pluginId)),
  );

  const hasChanged = enabledPluginIds.length !== (settings.enabledPluginIds ?? []).length
    || disabledPluginIds.length !== (settings.disabledPluginIds ?? []).length
    || Object.keys(pluginSettings).length !== Object.keys(settings.pluginSettings ?? {}).length;

  if (!hasChanged) {
    return settings;
  }

  const nextSettings: NonNullable<Settings['plugins']> = {
    ...(enabledPluginIds.length > 0 ? { enabledPluginIds } : {}),
    ...(disabledPluginIds.length > 0 ? { disabledPluginIds } : {}),
    ...(Object.keys(pluginSettings).length > 0 ? { pluginSettings } : {}),
  };

  return Object.keys(nextSettings).length > 0 ? nextSettings : undefined;
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
