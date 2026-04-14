import fs from 'fs-extra';
import path from 'path';
import type {
  InstalledPluginRecord,
  PluginCapability,
  PluginCapabilityType,
  PluginManifest,
  WorkspacePluginSettings,
} from '../../../shared/types/plugin';
import { PluginManifestValidator } from './PluginManifestValidator';
import { PluginRegistryStore } from './PluginRegistryStore';

export interface ResolvePluginCapabilityConfig {
  type: PluginCapabilityType;
  language?: string;
  filePath?: string;
  workspacePluginSettings?: WorkspacePluginSettings;
}

export interface ResolvedPluginCapability {
  pluginId: string;
  record: InstalledPluginRecord;
  manifest: PluginManifest;
  capability: PluginCapability;
}

export interface PluginCapabilityResolverOptions {
  registryStore: PluginRegistryStore;
  manifestValidator?: PluginManifestValidator;
}

export class PluginCapabilityResolver {
  private readonly registryStore: PluginRegistryStore;
  private readonly manifestValidator: PluginManifestValidator;

  constructor(options: PluginCapabilityResolverOptions) {
    this.registryStore = options.registryStore;
    this.manifestValidator = options.manifestValidator ?? new PluginManifestValidator();
  }

  async resolve(config: ResolvePluginCapabilityConfig): Promise<ResolvedPluginCapability | null> {
    const matches = await this.list(config);
    return matches[0] ?? null;
  }

  async list(config: ResolvePluginCapabilityConfig): Promise<ResolvedPluginCapability[]> {
    const registry = await this.registryStore.readRegistry();
    const resolutions = await Promise.all(Object.entries(registry.plugins).map(async ([pluginId, record]) => {
      if (record.status !== 'installed' || !isPluginEnabled(pluginId, record, config.workspacePluginSettings)) {
        return [];
      }

      const manifestPath = path.join(record.installPath, 'plugin.json');
      if (!await fs.pathExists(manifestPath)) {
        return [];
      }

      const manifest = await this.safeReadManifest(record.installPath);
      if (!manifest) {
        return [];
      }

      return manifest.capabilities
        .filter((capability) => capability.type === config.type)
        .filter((capability) => capabilityMatches(capability, config))
        .map((capability) => ({
          pluginId,
          record,
          manifest,
          capability,
        }));
    }));

    return resolutions.flat().sort((left, right) => (
      (right.capability.priority ?? 0) - (left.capability.priority ?? 0)
      || left.pluginId.localeCompare(right.pluginId)
    ));
  }

  private async safeReadManifest(installPath: string): Promise<PluginManifest | null> {
    try {
      return await this.manifestValidator.readFromDirectory(installPath);
    } catch {
      return null;
    }
  }
}

function capabilityMatches(capability: PluginCapability, config: ResolvePluginCapabilityConfig): boolean {
  if (capability.type !== config.type) {
    return false;
  }

  const normalizedLanguage = config.language?.trim().toLowerCase();
  if (normalizedLanguage && (capability.languages ?? []).some((language) => language.toLowerCase() === normalizedLanguage)) {
    return true;
  }

  const fileExtension = config.filePath ? path.extname(config.filePath).toLowerCase() : '';
  if (fileExtension && (capability.fileExtensions ?? []).some((extension) => extension.toLowerCase() === fileExtension)) {
    return true;
  }

  return !normalizedLanguage && !fileExtension;
}

function isPluginEnabled(
  pluginId: string,
  record: InstalledPluginRecord,
  workspacePluginSettings?: WorkspacePluginSettings,
): boolean {
  if ((workspacePluginSettings?.disabledPluginIds ?? []).includes(pluginId)) {
    return false;
  }

  if ((workspacePluginSettings?.enabledPluginIds ?? []).includes(pluginId)) {
    return true;
  }

  return record.enabledByDefault === true;
}
