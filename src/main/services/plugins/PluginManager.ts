import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import type {
  InstalledPluginRecord,
  PluginCapability,
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
import { InstalledPluginResult, PluginInstallerService } from './PluginInstallerService';
import { PluginManifestValidator } from './PluginManifestValidator';
import { PluginRegistryStore } from './PluginRegistryStore';

export interface PluginManagerOptions {
  registryStore: PluginRegistryStore;
  catalogService: PluginCatalogService;
  installerService: PluginInstallerService;
  manifestValidator?: PluginManifestValidator;
}

export interface PluginInstallResult {
  item: PluginListItem;
  replacedPluginIds: string[];
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

  async installMarketplacePlugin(config: InstallMarketplacePluginConfig): Promise<PluginInstallResult> {
    const pluginId = requireNonEmptyString(config.pluginId, 'Plugin id');
    const catalogEntries = await this.catalogService.list({ refresh: true });
    const catalogEntry = catalogEntries.find((entry) => entry.id === pluginId);

    if (!catalogEntry) {
      throw new Error(`Plugin ${pluginId} was not found in the marketplace catalog`);
    }

    return await this.installPluginAndResolveConflicts(
      async () => await this.installerService.installFromMarketplace(catalogEntry, {
        version: config.version,
        enableByDefault: config.enableByDefault,
      }),
      catalogEntry,
    );
  }

  async installLocalPlugin(config: InstallLocalPluginConfig): Promise<PluginInstallResult> {
    const filePath = requireNonEmptyString(config.filePath, 'Plugin file path');
    return await this.installPluginAndResolveConflicts(
      async () => await this.installerService.installFromLocalPath(filePath, {
        enableByDefault: config.enableByDefault,
      }),
    );
  }

  async updatePlugin(config: UpdatePluginConfig): Promise<PluginInstallResult> {
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

    return await this.installPluginAndResolveConflicts(
      async () => await this.installerService.installFromMarketplace(catalogEntry, {
        version: config.version,
        enableByDefault: currentRecord.enabledByDefault,
      }),
      catalogEntry,
    );
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    await this.installerService.uninstall(requireNonEmptyString(pluginId, 'Plugin id'));
  }

  async setEnabledByDefault(pluginId: string, enabled: boolean): Promise<void> {
    await this.registryStore.setEnabledByDefault(pluginId, enabled);
  }

  async setGlobalPluginSettings(pluginId: string, values: Record<string, unknown>): Promise<void> {
    await this.registryStore.setGlobalPluginSettings(pluginId, values);
  }

  async getRegistrySnapshot() {
    return await this.registryStore.readRegistry();
  }

  private async installPluginAndResolveConflicts(
    install: () => Promise<InstalledPluginResult>,
    catalogEntry?: PluginCatalogEntry,
  ): Promise<PluginInstallResult> {
    const { manifest, record } = await install();
    const replacedPluginIds = await this.findConflictingInstalledPluginIds(manifest);

    await Promise.all(replacedPluginIds.map(async (pluginId) => {
      await this.installerService.uninstall(pluginId);
    }));

    return {
      item: await this.buildPluginListItem(manifest.id, record, catalogEntry),
      replacedPluginIds,
    };
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

  private async findConflictingInstalledPluginIds(manifest: PluginManifest): Promise<string[]> {
    const registry = await this.registryStore.readRegistry();
    const conflicts: string[] = [];

    for (const [pluginId, record] of Object.entries(registry.plugins)) {
      if (pluginId === manifest.id || record.status !== 'installed') {
        continue;
      }

      const installedManifest = await this.readInstalledManifest(record.installPath);
      if (!installedManifest) {
        continue;
      }

      if (manifestsConflict(installedManifest, manifest)) {
        conflicts.push(pluginId);
      }
    }

    return conflicts.sort((left, right) => left.localeCompare(right));
  }
}

function manifestsConflict(left: PluginManifest, right: PluginManifest): boolean {
  return left.capabilities.some((leftCapability) => (
    right.capabilities.some((rightCapability) => capabilitiesConflict(leftCapability, rightCapability))
  ));
}

function capabilitiesConflict(left: PluginCapability, right: PluginCapability): boolean {
  if (left.type !== right.type) {
    return false;
  }

  return hasIntersection(left.languages ?? [], right.languages ?? [])
    || hasIntersection(left.fileExtensions ?? [], right.fileExtensions ?? []);
}

function hasIntersection(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) {
    return false;
  }

  const rightValues = new Set(right.map((value) => value.toLowerCase()));
  return left.some((value) => rightValues.has(value.toLowerCase()));
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
