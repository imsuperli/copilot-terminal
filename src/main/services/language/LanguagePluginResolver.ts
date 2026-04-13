import fs from 'fs-extra';
import path from 'path';
import type {
  InstalledPluginRecord,
  LanguageServerPluginCapability,
  PluginManifest,
  PluginRegistry,
  WorkspacePluginSettings,
} from '../../../shared/types/plugin';
import { normalizeOptionalString } from '../ssh/storeUtils';
import { PluginManifestValidator } from '../plugins/PluginManifestValidator';
import { PluginRegistryStore } from '../plugins/PluginRegistryStore';
import { ProjectRootResolver } from './ProjectRootResolver';

export interface ResolveLanguagePluginConfig {
  rootPath: string;
  filePath: string;
  language?: string;
  workspacePluginSettings?: WorkspacePluginSettings;
}

export interface InstalledLanguagePlugin {
  pluginId: string;
  record: InstalledPluginRecord;
  manifest: PluginManifest;
  capabilities: LanguageServerPluginCapability[];
}

export interface ResolvedLanguagePlugin {
  pluginId: string;
  record: InstalledPluginRecord;
  manifest: PluginManifest;
  capability: LanguageServerPluginCapability;
  workspaceRoot: string;
  projectRoot: string;
  languageId: string;
  registry: PluginRegistry;
  globalSettings: Record<string, unknown>;
  workspaceSettings: Record<string, unknown>;
  mergedSettings: Record<string, unknown>;
}

export interface LanguagePluginResolverOptions {
  registryStore: PluginRegistryStore;
  manifestValidator?: PluginManifestValidator;
  projectRootResolver?: ProjectRootResolver;
}

export class LanguagePluginResolver {
  private readonly registryStore: PluginRegistryStore;
  private readonly manifestValidator: PluginManifestValidator;
  private readonly projectRootResolver: ProjectRootResolver;
  private readonly pluginCache = new Map<string, InstalledLanguagePlugin>();

  constructor(options: LanguagePluginResolverOptions) {
    this.registryStore = options.registryStore;
    this.manifestValidator = options.manifestValidator ?? new PluginManifestValidator();
    this.projectRootResolver = options.projectRootResolver ?? new ProjectRootResolver();
  }

  invalidate(): void {
    this.pluginCache.clear();
  }

  async resolve(config: ResolveLanguagePluginConfig): Promise<ResolvedLanguagePlugin | null> {
    const registry = await this.registryStore.readRegistry();
    const workspacePluginSettings = config.workspacePluginSettings ?? {};
    const normalizedLanguageId = normalizeLanguageId(config.language ?? inferLanguageFromPath(config.filePath));
    const installedPlugins = await this.readInstalledLanguagePlugins(registry);
    const matchingPlugins = installedPlugins
      .map((plugin) => ({
        plugin,
        capabilities: plugin.capabilities.filter((capability) => capabilityMatches(capability, normalizedLanguageId, config.filePath)),
      }))
      .filter((entry) => entry.capabilities.length > 0);

    if (matchingPlugins.length === 0) {
      return null;
    }

    const enabledPlugins = matchingPlugins.filter(({ plugin }) => (
      isPluginEnabled(plugin.record, plugin.pluginId, workspacePluginSettings)
    ));

    if (enabledPlugins.length === 0) {
      return null;
    }

    const builtinProtectedLanguage = isBuiltinProtectedLanguage(normalizedLanguageId);
    const candidates = builtinProtectedLanguage
      ? enabledPlugins
        .map(({ plugin, capabilities }) => ({
          plugin,
          capabilities: getUsableCapabilities(capabilities, normalizedLanguageId),
        }))
        .filter(({ capabilities }) => capabilities.length > 0)
      : enabledPlugins;

    if (candidates.length === 0) {
      return null;
    }

    const rankedCandidates = candidates
      .map(({ plugin, capabilities }) => ({
        plugin,
        capability: chooseCapability(capabilities),
      }))
      .sort((left, right) => (
        (right.capability.priority ?? 0) - (left.capability.priority ?? 0)
        || compareInstalledPluginRecency(left.plugin.record, right.plugin.record)
        || left.plugin.pluginId.localeCompare(right.plugin.pluginId)
      ));

    return await this.createResolution({
      plugin: rankedCandidates[0].plugin,
      capability: rankedCandidates[0].capability,
      languageId: normalizedLanguageId,
      config,
      registry,
      workspacePluginSettings,
    });
  }

  private async createResolution(args: {
    plugin: InstalledLanguagePlugin;
    capability: LanguageServerPluginCapability;
    languageId: string;
    config: ResolveLanguagePluginConfig;
    registry: PluginRegistry;
    workspacePluginSettings: WorkspacePluginSettings;
  }): Promise<ResolvedLanguagePlugin> {
    const projectRoot = await this.projectRootResolver.resolve({
      workspaceRoot: args.config.rootPath,
      filePath: args.config.filePath,
      projectIndicators: args.capability.projectIndicators,
    });

    const globalSettings = args.registry.globalPluginSettings?.[args.plugin.pluginId] ?? {};
    const workspaceSettings = args.workspacePluginSettings.pluginSettings?.[args.plugin.pluginId] ?? {};
    const defaultSettings = getDefaultPluginSettings(args.plugin.manifest);
    const computedDefaults = await getComputedPluginDefaults(
      args.plugin.pluginId,
      projectRoot,
      {
        ...globalSettings,
        ...workspaceSettings,
      },
    );

    return {
      pluginId: args.plugin.pluginId,
      record: args.plugin.record,
      manifest: args.plugin.manifest,
      capability: args.capability,
      workspaceRoot: args.config.rootPath,
      projectRoot,
      languageId: args.languageId,
      registry: args.registry,
      globalSettings,
      workspaceSettings,
      mergedSettings: {
        ...defaultSettings,
        ...computedDefaults,
        ...globalSettings,
        ...workspaceSettings,
      },
    };
  }

  private async readInstalledLanguagePlugins(registry: PluginRegistry): Promise<InstalledLanguagePlugin[]> {
    const activePluginIds = new Set(Object.keys(registry.plugins));

    for (const cachedPluginId of Array.from(this.pluginCache.keys())) {
      if (!activePluginIds.has(cachedPluginId)) {
        this.pluginCache.delete(cachedPluginId);
      }
    }

    const plugins = await Promise.all(Object.entries(registry.plugins).map(async ([pluginId, record]) => {
      if (record.status !== 'installed') {
        return null;
      }

      const manifestPath = path.join(record.installPath, 'plugin.json');
      if (!await fs.pathExists(manifestPath)) {
        return null;
      }

      const cached = this.pluginCache.get(pluginId);
      if (cached && cached.record.installPath === record.installPath && cached.record.installedVersion === record.installedVersion) {
        return cached;
      }

      const manifest = await this.manifestValidator.readFromDirectory(record.installPath);
      const plugin: InstalledLanguagePlugin = {
        pluginId,
        record,
        manifest,
        capabilities: manifest.capabilities.filter((capability): capability is LanguageServerPluginCapability => capability.type === 'language-server'),
      };

      this.pluginCache.set(pluginId, plugin);
      return plugin.capabilities.length > 0 ? plugin : null;
    }));

    return plugins.filter((plugin): plugin is InstalledLanguagePlugin => Boolean(plugin));
  }
}

function capabilityMatches(
  capability: LanguageServerPluginCapability,
  languageId: string,
  filePath: string,
): boolean {
  const normalizedLanguageId = normalizeLanguageId(languageId);
  if ((capability.languages ?? []).map(normalizeLanguageId).includes(normalizedLanguageId)) {
    return true;
  }

  const fileExtension = normalizeOptionalString(path.extname(filePath))?.toLowerCase();
  if (!fileExtension) {
    return false;
  }

  return (capability.fileExtensions ?? []).some((extension) => extension.toLowerCase() === fileExtension);
}

function chooseCapability(capabilities: LanguageServerPluginCapability[]): LanguageServerPluginCapability {
  return [...capabilities].sort((left, right) => (
    (right.priority ?? 0) - (left.priority ?? 0)
  ))[0];
}

function canUseCapabilityForLanguage(capability: LanguageServerPluginCapability, languageId: string): boolean {
  if (!isBuiltinProtectedLanguage(languageId)) {
    return true;
  }

  return capability.takesOverBuiltinLanguageService === true;
}

function getUsableCapabilities(
  capabilities: LanguageServerPluginCapability[],
  languageId: string,
): LanguageServerPluginCapability[] {
  return capabilities.filter((capability) => canUseCapabilityForLanguage(capability, languageId));
}

function isWorkspaceDisabled(pluginId: string, workspacePluginSettings: WorkspacePluginSettings): boolean {
  return (workspacePluginSettings.disabledPluginIds ?? []).includes(pluginId);
}

function isPluginEnabled(
  record: InstalledPluginRecord,
  pluginId: string,
  workspacePluginSettings: WorkspacePluginSettings,
): boolean {
  if ((workspacePluginSettings.disabledPluginIds ?? []).includes(pluginId)) {
    return false;
  }

  if ((workspacePluginSettings.enabledPluginIds ?? []).includes(pluginId)) {
    return true;
  }

  return record.enabledByDefault === true;
}

function compareInstalledPluginRecency(left: InstalledPluginRecord, right: InstalledPluginRecord): number {
  return getInstalledPluginTimestamp(right) - getInstalledPluginTimestamp(left);
}

function getInstalledPluginTimestamp(record: InstalledPluginRecord): number {
  const timestamp = Date.parse(record.lastCheckedAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function isBuiltinProtectedLanguage(languageId: string): boolean {
  return languageId === 'javascript' || languageId === 'typescript';
}

function inferLanguageFromPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'javascript';
    case '.py':
      return 'python';
    case '.java':
      return 'java';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.json':
      return 'json';
    default:
      return 'plaintext';
  }
}

function getDefaultPluginSettings(manifest: PluginManifest): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(manifest.settingsSchema ?? {})
      .filter(([, entry]) => entry.defaultValue !== undefined)
      .map(([key, entry]) => [key, entry.defaultValue]),
  );
}

async function getComputedPluginDefaults(
  pluginId: string,
  projectRoot: string,
  currentSettings: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (pluginId !== 'official.java-jdtls') {
    return {};
  }

  const defaults: Record<string, unknown> = {};

  if (currentSettings['extendedClientCapabilities.classFileContentsSupport'] === undefined) {
    defaults['extendedClientCapabilities.classFileContentsSupport'] = true;
  }

  if (currentSettings['java.import.exclusions'] === undefined) {
    defaults['java.import.exclusions'] = [
      '**/.git/**',
      '**/.idea/**',
      '**/.gradle/**',
      '**/.settings/**',
      '**/.mvn/**',
      '**/node_modules/**',
      '**/target/**',
      '**/build/**',
      '**/out/**',
      '**/dist/**',
    ];
  }

  const [hasPom, hasBuildGradle, hasBuildGradleKts, hasSettingsGradle, hasGradlew] = await Promise.all([
    fs.pathExists(path.join(projectRoot, 'pom.xml')),
    fs.pathExists(path.join(projectRoot, 'build.gradle')),
    fs.pathExists(path.join(projectRoot, 'build.gradle.kts')),
    fs.pathExists(path.join(projectRoot, 'settings.gradle')),
    fs.pathExists(path.join(projectRoot, 'gradlew')),
  ]);
  const hasGradle = hasBuildGradle || hasBuildGradleKts || hasSettingsGradle || hasGradlew;

  if (hasPom && !hasGradle && currentSettings['java.import.gradle.enabled'] === undefined) {
    defaults['java.import.gradle.enabled'] = false;
  }

  if (hasGradle && !hasPom && currentSettings['java.import.maven.enabled'] === undefined) {
    defaults['java.import.maven.enabled'] = false;
  }

  return defaults;
}

function normalizeLanguageId(languageId: string): string {
  switch (languageId) {
    case 'javascriptreact':
      return 'javascript';
    case 'typescriptreact':
      return 'typescript';
    case 'shellscript':
      return 'shell';
    default:
      return languageId;
  }
}
