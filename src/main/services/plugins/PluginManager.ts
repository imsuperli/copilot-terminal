import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import type {
  InstalledPluginRecord,
  PluginCatalogEntry,
  PluginListItem,
  PluginManifest,
} from '../../../shared/types/plugin';
import type {
  InstallLocalPluginConfig,
  InstallMarketplacePluginConfig,
  PluginCatalogQuery,
  UpdatePluginConfig,
} from '../../../shared/types/electron-api';
import { normalizeOptionalString } from '../ssh/storeUtils';
import { PluginCatalogService } from './PluginCatalogService';
import { PluginInstallerService } from './PluginInstallerService';
import { PluginManifestValidator } from './PluginManifestValidator';
import { PluginRegistryStore } from './PluginRegistryStore';

export interface PluginManagerOptions {
  registryStore: PluginRegistryStore;
  catalogService: PluginCatalogService;
  installerService: PluginInstallerService;
  manifestValidator?: PluginManifestValidator;
}

export class PluginManager {
  private readonly registryStore: PluginRegistryStore;
  private readonly catalogService: PluginCatalogService;
  private readonly installerService: PluginInstallerService;
  private readonly manifestValidator: PluginManifestValidator;

  constructor(options: PluginManagerOptions) {
    this.registryStore = options.registryStore;
    this.catalogService = options.catalogService;
    this.installerService = options.installerService;
    this.manifestValidator = options.manifestValidator ?? new PluginManifestValidator();
  }

  async listPlugins(): Promise<PluginListItem[]> {
    const registry = await this.registryStore.readRegistry();
    const catalogEntries = await this.safeListCatalog();
    const catalogByPluginId = new Map(catalogEntries.map((entry) => [entry.id, entry]));

    const items = await Promise.all(
      Object.entries(registry.plugins).map(async ([pluginId, record]) =>
        await this.buildPluginListItem(pluginId, record, catalogByPluginId.get(pluginId)),
      ),
    );

    return items.sort((left, right) => left.name.localeCompare(right.name) || left.publisher.localeCompare(right.publisher));
  }

  async listCatalog(query: PluginCatalogQuery = {}): Promise<PluginCatalogEntry[]> {
    return await this.catalogService.list(query);
  }

  async installMarketplacePlugin(config: InstallMarketplacePluginConfig): Promise<PluginListItem> {
    const pluginId = requireNonEmptyString(config.pluginId, 'Plugin id');
    const catalogEntries = await this.catalogService.list({ refresh: true });
    const catalogEntry = catalogEntries.find((entry) => entry.id === pluginId);

    if (!catalogEntry) {
      throw new Error(`Plugin ${pluginId} was not found in the marketplace catalog`);
    }

    const { record } = await this.installerService.installFromMarketplace(catalogEntry, {
      version: config.version,
      enableByDefault: config.enableByDefault,
    });
    return await this.buildPluginListItem(pluginId, record, catalogEntry);
  }

  async installLocalPlugin(config: InstallLocalPluginConfig): Promise<PluginListItem> {
    const filePath = requireNonEmptyString(config.filePath, 'Plugin file path');
    const { manifest, record } = await this.installerService.installFromLocalPath(filePath, {
      enableByDefault: config.enableByDefault,
    });
    return await this.buildPluginListItem(manifest.id, record);
  }

  async updatePlugin(config: UpdatePluginConfig): Promise<PluginListItem> {
    const pluginId = requireNonEmptyString(config.pluginId, 'Plugin id');
    const currentRecord = await this.registryStore.get(pluginId);
    if (!currentRecord) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    const catalogEntries = await this.catalogService.list({ refresh: true });
    const catalogEntry = catalogEntries.find((entry) => entry.id === pluginId);
    if (!catalogEntry) {
      throw new Error(`Plugin ${pluginId} does not have a marketplace entry`);
    }

    const { record } = await this.installerService.installFromMarketplace(catalogEntry, {
      version: config.version,
      enableByDefault: currentRecord.enabledByDefault,
    });
    return await this.buildPluginListItem(pluginId, record, catalogEntry);
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    await this.installerService.uninstall(requireNonEmptyString(pluginId, 'Plugin id'));
  }

  async setEnabledByDefault(pluginId: string, enabled: boolean): Promise<void> {
    await this.registryStore.setEnabledByDefault(pluginId, enabled);
  }

  async setGlobalLanguageBinding(language: string, pluginId: string | null): Promise<void> {
    await this.registryStore.setGlobalLanguageBinding(language, pluginId);
  }

  async setGlobalPluginSettings(pluginId: string, values: Record<string, unknown>): Promise<void> {
    await this.registryStore.setGlobalPluginSettings(pluginId, values);
  }

  async getRegistrySnapshot() {
    return await this.registryStore.readRegistry();
  }

  private async buildPluginListItem(
    pluginId: string,
    record: InstalledPluginRecord,
    catalogEntry?: PluginCatalogEntry,
  ): Promise<PluginListItem> {
    const manifest = await this.readInstalledManifest(record.installPath);
    const latestVersion = catalogEntry?.latestVersion;
    const installedVersion = manifest?.version ?? record.installedVersion;

    return {
      id: pluginId,
      name: manifest?.name ?? catalogEntry?.name ?? pluginId,
      publisher: manifest?.publisher ?? catalogEntry?.publisher ?? 'unknown',
      version: installedVersion,
      ...(latestVersion ? { latestVersion } : {}),
      ...(catalogEntry?.summary ? { summary: catalogEntry.summary } : {}),
      ...(manifest?.description || catalogEntry?.description
        ? { description: manifest?.description ?? catalogEntry?.description }
        : {}),
      source: record.source,
      categories: manifest?.categories ?? catalogEntry?.categories,
      tags: manifest?.tags ?? catalogEntry?.tags,
      languages: manifest ? this.manifestValidator.getLanguages(manifest) : catalogEntry?.languages,
      installStatus: await this.resolveInstallStatus(record),
      runtimeState: 'idle',
      health: record.lastKnownHealth ?? 'unknown',
      enabledByDefault: record.enabledByDefault,
      updateAvailable: shouldMarkUpdateAvailable(installedVersion, latestVersion),
      installPath: record.installPath,
      ...(manifest ? { manifest } : {}),
    };
  }

  private async readInstalledManifest(installPath: string): Promise<PluginManifest | undefined> {
    const manifestPath = path.join(installPath, 'plugin.json');
    if (!await fs.pathExists(manifestPath)) {
      return undefined;
    }

    return await this.manifestValidator.readFromDirectory(installPath);
  }

  private async resolveInstallStatus(record: InstalledPluginRecord): Promise<PluginListItem['installStatus']> {
    if (record.status === 'error' || !await fs.pathExists(record.installPath)) {
      return 'error';
    }

    return record.status;
  }

  private async safeListCatalog(): Promise<PluginCatalogEntry[]> {
    try {
      return await this.catalogService.list();
    } catch {
      return [];
    }
  }
}

function shouldMarkUpdateAvailable(installedVersion: string | undefined, latestVersion: string | undefined): boolean {
  if (!installedVersion || !latestVersion || installedVersion === latestVersion) {
    return false;
  }

  const installedSemver = semver.valid(installedVersion);
  const latestSemver = semver.valid(latestVersion);
  if (installedSemver && latestSemver) {
    return semver.gt(latestSemver, installedSemver);
  }

  return normalizeOptionalString(installedVersion) !== normalizeOptionalString(latestVersion);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}
