import fs from 'fs-extra';
import path from 'path';
import type {
  InstalledPluginRecord,
  PluginRegistry,
} from '../../../shared/types/plugin';
import {
  normalizeOptionalString,
  readJsonFileOrDefault,
  writeJsonFileAtomic,
} from '../ssh/storeUtils';

export interface PluginRegistryStoreOptions {
  filePath: string;
}

export class PluginRegistryStore {
  private readonly filePath: string;

  constructor(options: PluginRegistryStoreOptions) {
    this.filePath = options.filePath;
  }

  async readRegistry(): Promise<PluginRegistry> {
    const data = await readJsonFileOrDefault<PluginRegistry>(this.filePath, {
      schemaVersion: 1,
      plugins: {},
      globalLanguageBindings: {},
      globalPluginSettings: {},
    });

    return normalizePluginRegistry(data);
  }

  async list(): Promise<Record<string, InstalledPluginRecord>> {
    const data = await this.readRegistry();
    return data.plugins;
  }

  async get(pluginId: string): Promise<InstalledPluginRecord | null> {
    const data = await this.readRegistry();
    return data.plugins[pluginId] ?? null;
  }

  async upsert(pluginId: string, record: InstalledPluginRecord): Promise<void> {
    const normalizedPluginId = requireNonEmptyString(pluginId, 'Plugin id');
    const data = await this.readRegistry();
    data.plugins[normalizedPluginId] = normalizeInstalledPluginRecord(record);
    await this.writeRegistry(data);
  }

  async remove(pluginId: string): Promise<void> {
    const normalizedPluginId = requireNonEmptyString(pluginId, 'Plugin id');
    const data = await this.readRegistry();
    delete data.plugins[normalizedPluginId];

    if (data.globalLanguageBindings) {
      data.globalLanguageBindings = Object.fromEntries(
        Object.entries(data.globalLanguageBindings).filter(([, value]) => value !== normalizedPluginId),
      );
    }

    if (data.globalPluginSettings) {
      delete data.globalPluginSettings[normalizedPluginId];
    }

    await this.writeRegistry(data);
  }

  async setEnabledByDefault(pluginId: string, enabled: boolean): Promise<InstalledPluginRecord> {
    const normalizedPluginId = requireNonEmptyString(pluginId, 'Plugin id');
    const data = await this.readRegistry();
    const record = data.plugins[normalizedPluginId];
    if (!record) {
      throw new Error(`Plugin ${normalizedPluginId} is not installed`);
    }

    const nextRecord: InstalledPluginRecord = {
      ...record,
      enabledByDefault: enabled,
    };
    data.plugins[normalizedPluginId] = nextRecord;
    await this.writeRegistry(data);
    return nextRecord;
  }

  async setGlobalLanguageBinding(language: string, pluginId: string | null): Promise<Record<string, string>> {
    const normalizedLanguage = requireNonEmptyString(language, 'Language id');
    const normalizedPluginId = normalizeOptionalString(pluginId);
    const data = await this.readRegistry();
    const nextBindings = {
      ...(data.globalLanguageBindings ?? {}),
    };

    if (!normalizedPluginId) {
      delete nextBindings[normalizedLanguage];
    } else {
      nextBindings[normalizedLanguage] = normalizedPluginId;
    }

    data.globalLanguageBindings = nextBindings;
    await this.writeRegistry(data);
    return nextBindings;
  }

  async setGlobalPluginSettings(pluginId: string, values: Record<string, unknown>): Promise<Record<string, Record<string, unknown>>> {
    const normalizedPluginId = requireNonEmptyString(pluginId, 'Plugin id');
    const nextValues = normalizePluginSettingValues(values);
    const data = await this.readRegistry();
    const nextSettings = {
      ...(data.globalPluginSettings ?? {}),
    };

    if (Object.keys(nextValues).length === 0) {
      delete nextSettings[normalizedPluginId];
    } else {
      nextSettings[normalizedPluginId] = {
        ...(nextSettings[normalizedPluginId] ?? {}),
        ...nextValues,
      };
    }

    data.globalPluginSettings = nextSettings;
    await this.writeRegistry(data);
    return nextSettings;
  }

  private async writeRegistry(registry: PluginRegistry): Promise<void> {
    const normalized = normalizePluginRegistry(registry);
    await fs.ensureDir(path.dirname(this.filePath));
    await writeJsonFileAtomic(this.filePath, normalized);
  }
}

function normalizePluginRegistry(value: PluginRegistry): PluginRegistry {
  const plugins = value.plugins && typeof value.plugins === 'object'
    ? Object.fromEntries(
        Object.entries(value.plugins)
          .map(([pluginId, record]) => [normalizeOptionalString(pluginId), record] as const)
          .filter(([pluginId]) => Boolean(pluginId))
          .map(([pluginId, record]) => [pluginId, normalizeInstalledPluginRecord(record)]),
      )
    : {};

  const globalLanguageBindings = value.globalLanguageBindings && typeof value.globalLanguageBindings === 'object'
    ? Object.fromEntries(
        Object.entries(value.globalLanguageBindings)
          .map(([language, pluginId]) => [
            normalizeOptionalString(language),
            normalizeOptionalString(pluginId),
          ] as const)
          .filter(([language, pluginId]) => Boolean(language) && Boolean(pluginId)),
      )
    : {};

  const globalPluginSettings = value.globalPluginSettings && typeof value.globalPluginSettings === 'object'
    ? Object.fromEntries(
        Object.entries(value.globalPluginSettings)
          .map(([pluginId, settings]) => [normalizeOptionalString(pluginId), settings] as const)
          .filter(([pluginId, settings]) => Boolean(pluginId) && settings && typeof settings === 'object' && !Array.isArray(settings))
          .map(([pluginId, settings]) => [pluginId, normalizePluginSettingValues(settings as Record<string, unknown>)]),
      )
    : {};

  return {
    schemaVersion: 1,
    plugins,
    globalLanguageBindings,
    globalPluginSettings,
  };
}

function normalizeInstalledPluginRecord(value: InstalledPluginRecord): InstalledPluginRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Installed plugin record is invalid');
  }

  return {
    source: normalizePluginSource(value.source),
    installedVersion: requireNonEmptyString(value.installedVersion, 'Installed plugin version'),
    installPath: requireNonEmptyString(value.installPath, 'Installed plugin installPath'),
    enabledByDefault: value.enabledByDefault === true,
    status: normalizeInstallStatus(value.status),
    ...(normalizeOptionalString(value.lastCheckedAt) ? { lastCheckedAt: normalizeOptionalString(value.lastCheckedAt) } : {}),
    ...(normalizePluginHealth(value.lastKnownHealth) ? { lastKnownHealth: normalizePluginHealth(value.lastKnownHealth) } : {}),
    ...(normalizeOptionalString(value.lastError) ? { lastError: normalizeOptionalString(value.lastError) } : {}),
  };
}

function normalizePluginSource(value: InstalledPluginRecord['source']): InstalledPluginRecord['source'] {
  return value === 'builtin' || value === 'marketplace' || value === 'sideload'
    ? value
    : 'sideload';
}

function normalizeInstallStatus(value: InstalledPluginRecord['status']): InstalledPluginRecord['status'] {
  return value === 'not-installed' || value === 'installing' || value === 'installed' || value === 'updating' || value === 'error'
    ? value
    : 'installed';
}

function normalizePluginHealth(value: InstalledPluginRecord['lastKnownHealth']): InstalledPluginRecord['lastKnownHealth'] | undefined {
  return value === 'unknown' || value === 'ok' || value === 'warning' || value === 'error'
    ? value
    : undefined;
}

function normalizePluginSettingValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [normalizeOptionalString(key), value] as const)
      .filter(([key]) => Boolean(key)),
  );
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}
