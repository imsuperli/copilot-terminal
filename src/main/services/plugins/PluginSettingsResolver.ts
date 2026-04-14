import fs from 'fs-extra';
import path from 'path';
import type {
  PluginManifest,
  PluginRegistry,
  WorkspacePluginSettings,
} from '../../../shared/types/plugin';

export interface ResolvedPluginSettings {
  globalSettings: Record<string, unknown>;
  workspaceSettings: Record<string, unknown>;
  mergedSettings: Record<string, unknown>;
}

export async function resolvePluginSettings(config: {
  pluginId: string;
  manifest: PluginManifest;
  projectRoot: string;
  registry: PluginRegistry;
  workspacePluginSettings?: WorkspacePluginSettings;
}): Promise<ResolvedPluginSettings> {
  const globalSettings = config.registry.globalPluginSettings?.[config.pluginId] ?? {};
  const workspaceSettings = config.workspacePluginSettings?.pluginSettings?.[config.pluginId] ?? {};
  const defaultSettings = getDefaultPluginSettings(config.manifest);
  const computedDefaults = await getComputedPluginDefaults(
    config.pluginId,
    config.projectRoot,
    {
      ...globalSettings,
      ...workspaceSettings,
    },
  );

  return {
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
