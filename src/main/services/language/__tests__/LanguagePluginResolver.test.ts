import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LanguageServerPluginCapability, PluginManifest } from '../../../../shared/types/plugin';
import { LanguagePluginResolver } from '../LanguagePluginResolver';
import { PluginRegistryStore } from '../../plugins/PluginRegistryStore';

describe('LanguagePluginResolver', () => {
  let tempDir: string;
  let registryStore: PluginRegistryStore;
  let resolver: LanguagePluginResolver;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-terminal-language-resolver-'));
    registryStore = new PluginRegistryStore({
      filePath: path.join(tempDir, 'registry.json'),
    });
    resolver = new LanguagePluginResolver({
      registryStore,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('merges global and workspace settings for the selected plugin', async () => {
    await writePlugin(tempDir, registryStore, {
      id: 'acme.java-workspace',
      enabledByDefault: true,
      settingsSchema: {
        'java.import.maven.enabled': {
          type: 'boolean',
          title: 'Enable Maven import',
          scope: 'workspace',
          defaultValue: true,
        },
      },
      capability: {
        languages: ['java'],
        priority: 10,
        projectIndicators: ['pom.xml'],
        runtime: {
          type: 'java',
          entry: 'server/workspace.jar',
        },
      },
    });

    await registryStore.setGlobalPluginSettings('acme.java-workspace', {
      'trace.server': 'verbose',
    });

    const workspaceRoot = path.join(tempDir, 'workspace');
    const projectRoot = path.join(workspaceRoot, 'app');
    const filePath = path.join(projectRoot, 'src', 'Main.java');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(path.join(projectRoot, 'pom.xml'), '<project />');
    await fs.writeFile(filePath, 'class Main {}');

    const resolution = await resolver.resolve({
      rootPath: workspaceRoot,
      filePath,
      workspacePluginSettings: {
        pluginSettings: {
          'acme.java-workspace': {
            'java.home': '/opt/jdk-21',
          },
        },
      },
    });

    expect(resolution).toMatchObject({
      pluginId: 'acme.java-workspace',
      projectRoot,
      languageId: 'java',
      globalSettings: {
        'trace.server': 'verbose',
      },
      workspaceSettings: {
        'java.home': '/opt/jdk-21',
      },
      mergedSettings: {
        'java.import.maven.enabled': true,
        'trace.server': 'verbose',
        'java.home': '/opt/jdk-21',
      },
    });
  });

  it('applies JDTLS defaults and Maven-specific import exclusions for pom projects', async () => {
    await writePlugin(tempDir, registryStore, {
      id: 'official.java-jdtls',
      enabledByDefault: true,
      settingsSchema: {
        'java.configuration.updateBuildConfiguration': {
          type: 'enum',
          title: 'Update build configuration',
          scope: 'workspace',
          defaultValue: 'interactive',
          options: [
            { label: 'disabled', value: 'disabled' },
            { label: 'interactive', value: 'interactive' },
            { label: 'automatic', value: 'automatic' },
          ],
        },
        'java.import.maven.enabled': {
          type: 'boolean',
          title: 'Enable Maven import',
          scope: 'workspace',
          defaultValue: true,
        },
        'java.import.gradle.enabled': {
          type: 'boolean',
          title: 'Enable Gradle import',
          scope: 'workspace',
          defaultValue: true,
        },
      },
      capability: {
        languages: ['java'],
        priority: 60,
        projectIndicators: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'gradlew'],
        runtime: {
          type: 'node',
          entry: 'bin/jdtls-proxy.cjs',
        },
      },
    });

    const workspaceRoot = path.join(tempDir, 'workspace');
    const projectRoot = path.join(workspaceRoot, 'orders-service');
    const filePath = path.join(projectRoot, 'src', 'main', 'java', 'Main.java');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(path.join(projectRoot, 'pom.xml'), '<project />');
    await fs.writeFile(filePath, 'class Main {}');

    const resolution = await resolver.resolve({
      rootPath: workspaceRoot,
      filePath,
    });

    expect(resolution?.mergedSettings).toMatchObject({
      'extendedClientCapabilities.classFileContentsSupport': true,
      'java.configuration.updateBuildConfiguration': 'interactive',
      'java.import.maven.enabled': true,
      'java.import.gradle.enabled': false,
    });
    expect(resolution?.mergedSettings['java.import.exclusions']).toEqual(expect.arrayContaining([
      '**/target/**',
      '**/build/**',
      '**/.git/**',
    ]));
  });

  it('keeps TypeScript on Monaco unless the plugin explicitly takes over builtin language services', async () => {
    const workspaceRoot = path.join(tempDir, 'workspace');
    const filePath = path.join(workspaceRoot, 'src', 'index.ts');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, 'export const value = 1;');

    await writePlugin(tempDir, registryStore, {
      id: 'acme.ts-no-takeover',
      enabledByDefault: true,
      capability: {
        languages: ['typescript'],
        runtime: {
          type: 'node',
          entry: 'server/no-takeover.js',
        },
      },
    });

    let resolution = await resolver.resolve({
      rootPath: workspaceRoot,
      filePath,
    });

    expect(resolution).toBeNull();

    await writePlugin(tempDir, registryStore, {
      id: 'acme.ts-takeover',
      enabledByDefault: false,
      capabilities: [
        {
          type: 'language-server',
          languages: ['typescript'],
          priority: 100,
          runtime: {
            type: 'node',
            entry: 'server/not-usable.js',
          },
        },
        {
          type: 'language-server',
          languages: ['typescript'],
          priority: 10,
          takesOverBuiltinLanguageService: true,
          runtime: {
            type: 'node',
            entry: 'server/takeover.js',
          },
        },
      ],
    });

    resolution = await resolver.resolve({
      rootPath: workspaceRoot,
      filePath,
      workspacePluginSettings: {
        enabledPluginIds: ['acme.ts-takeover'],
      },
    });

    expect(resolution?.pluginId).toBe('acme.ts-takeover');
    expect(resolution?.capability.takesOverBuiltinLanguageService).toBe(true);
  });

  it('prefers the most recently installed plugin when multiple enabled plugins share the same top priority', async () => {
    const workspaceRoot = path.join(tempDir, 'workspace');
    const filePath = path.join(workspaceRoot, 'app.py');
    await fs.ensureDir(workspaceRoot);
    await fs.writeFile(filePath, 'print("hello")');

    await writePlugin(tempDir, registryStore, {
      id: 'acme.python-a',
      enabledByDefault: true,
      capability: {
        languages: ['python'],
        priority: 100,
        runtime: {
          type: 'python',
          entry: 'server/a.py',
        },
      },
      lastCheckedAt: '2026-04-11T00:00:00.000Z',
    });

    await writePlugin(tempDir, registryStore, {
      id: 'acme.python-b',
      enabledByDefault: true,
      capability: {
        languages: ['python'],
        priority: 100,
        runtime: {
          type: 'python',
          entry: 'server/b.py',
        },
      },
      lastCheckedAt: '2026-04-12T00:00:00.000Z',
    });

    const resolution = await resolver.resolve({
      rootPath: workspaceRoot,
      filePath,
    });

    expect(resolution?.pluginId).toBe('acme.python-b');
  });

  it('resolves a single-language workspace warmup candidate from project indicators', async () => {
    await writePlugin(tempDir, registryStore, {
      id: 'official.java-jdtls',
      enabledByDefault: true,
      capability: {
        languages: ['java'],
        priority: 60,
        projectIndicators: ['pom.xml', 'build.gradle'],
        runtime: {
          type: 'node',
          entry: 'bin/jdtls-proxy.cjs',
        },
      },
    });

    const workspaceRoot = path.join(tempDir, 'workspace');
    const projectRoot = path.join(workspaceRoot, 'orders-service');
    await fs.ensureDir(projectRoot);
    await fs.writeFile(path.join(projectRoot, 'pom.xml'), '<project />');

    const warmup = await resolver.resolveWorkspaceWarmup(workspaceRoot);

    expect(warmup).toEqual({
      languageId: 'java',
      projectRoot,
      matchedIndicator: 'pom.xml',
    });
  });

  it('skips workspace warmup when multiple language plugins match the same project root', async () => {
    await writePlugin(tempDir, registryStore, {
      id: 'official.java-jdtls',
      enabledByDefault: true,
      capability: {
        languages: ['java'],
        priority: 60,
        projectIndicators: ['pom.xml'],
        runtime: {
          type: 'node',
          entry: 'bin/jdtls-proxy.cjs',
        },
      },
    });
    await writePlugin(tempDir, registryStore, {
      id: 'official.python-pyright',
      enabledByDefault: true,
      capability: {
        languages: ['python'],
        priority: 60,
        projectIndicators: ['pom.xml'],
        runtime: {
          type: 'node',
          entry: 'bin/pyright-proxy.cjs',
        },
      },
    });

    const workspaceRoot = path.join(tempDir, 'workspace');
    await fs.ensureDir(workspaceRoot);
    await fs.writeFile(path.join(workspaceRoot, 'pom.xml'), '<project />');

    const warmup = await resolver.resolveWorkspaceWarmup(workspaceRoot);

    expect(warmup).toBeNull();
  });
});

async function writePlugin(
  baseDir: string,
  registryStore: PluginRegistryStore,
  config: {
    id: string;
    enabledByDefault: boolean;
    lastCheckedAt?: string;
    settingsSchema?: PluginManifest['settingsSchema'];
    capability?: Partial<LanguageServerPluginCapability> & Pick<LanguageServerPluginCapability, 'languages' | 'runtime'>;
    capabilities?: LanguageServerPluginCapability[];
  },
): Promise<void> {
  const installPath = path.join(baseDir, 'plugins', config.id, '1.0.0');
  const manifest: PluginManifest = {
    schemaVersion: 1,
    id: config.id,
    name: config.id,
    publisher: 'Acme',
    version: '1.0.0',
    engines: {
      app: '>=3.0.0',
    },
    ...(config.settingsSchema ? { settingsSchema: config.settingsSchema } : {}),
    capabilities: config.capabilities ?? [
      {
        type: 'language-server',
        priority: 0,
        ...config.capability,
      },
    ],
  };

  await fs.ensureDir(installPath);
  await fs.writeJson(path.join(installPath, 'plugin.json'), manifest);
  await registryStore.upsert(config.id, {
    source: 'marketplace',
    installedVersion: '1.0.0',
    installPath,
    enabledByDefault: config.enabledByDefault,
    status: 'installed',
    ...(config.lastCheckedAt ? { lastCheckedAt: config.lastCheckedAt } : {}),
  });
}
