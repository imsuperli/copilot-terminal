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

  it('prefers explicit bindings and merges global and workspace settings', async () => {
    await writePlugin(tempDir, registryStore, {
      id: 'acme.java-default',
      enabledByDefault: true,
      capability: {
        languages: ['java'],
        priority: 50,
        runtime: {
          type: 'java',
          entry: 'server/default.jar',
        },
      },
    });

    await writePlugin(tempDir, registryStore, {
      id: 'acme.java-workspace',
      enabledByDefault: false,
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
        languageBindings: {
          java: 'acme.java-workspace',
        },
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
        'trace.server': 'verbose',
        'java.home': '/opt/jdk-21',
      },
    });
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
      workspacePluginSettings: {
        languageBindings: {
          typescript: 'acme.ts-no-takeover',
        },
      },
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
        languageBindings: {
          typescript: 'acme.ts-takeover',
        },
      },
    });

    expect(resolution?.pluginId).toBe('acme.ts-takeover');
    expect(resolution?.capability.takesOverBuiltinLanguageService).toBe(true);
  });

  it('returns null when multiple enabled plugins share the same top priority', async () => {
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
    });

    const resolution = await resolver.resolve({
      rootPath: workspaceRoot,
      filePath,
    });

    expect(resolution).toBeNull();
  });
});

async function writePlugin(
  baseDir: string,
  registryStore: PluginRegistryStore,
  config: {
    id: string;
    enabledByDefault: boolean;
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
  });
}
