import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginCatalogService } from '../PluginCatalogService';
import { PluginInstallerService } from '../PluginInstallerService';
import { PluginManager } from '../PluginManager';
import { PluginRegistryStore } from '../PluginRegistryStore';

describe('PluginManager', () => {
  let tempDir: string;
  let registryStore: PluginRegistryStore;
  let installerService: PluginInstallerService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-terminal-plugin-manager-'));
    registryStore = new PluginRegistryStore({
      filePath: path.join(tempDir, 'registry.json'),
    });
    installerService = new PluginInstallerService({
      baseDir: path.join(tempDir, 'plugin-data'),
      registryStore,
      now: () => '2026-04-12T00:00:00.000Z',
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('installs a wrapped local plugin package and surfaces catalog metadata on list', async () => {
    const packageRoot = path.join(tempDir, 'packages-src');
    const wrappedPluginRoot = path.join(packageRoot, 'java-language-plugin');
    await fs.ensureDir(wrappedPluginRoot);
    await fs.writeJson(path.join(wrappedPluginRoot, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.java-language',
      name: 'Java Language Support',
      publisher: 'Acme',
      version: '1.0.0',
      description: 'Java language tooling',
      categories: ['language'],
      tags: ['java'],
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'language-server',
          languages: ['java'],
          runtime: {
            type: 'java',
            entry: 'server/jdtls.jar',
          },
        },
      ],
    });
    await fs.ensureDir(path.join(wrappedPluginRoot, 'server'));
    await fs.writeFile(path.join(wrappedPluginRoot, 'server', 'jdtls.jar'), 'stub');

    const catalogService = {
      list: vi.fn(async () => [
        {
          id: 'acme.java-language',
          name: 'Java Language Support',
          publisher: 'Acme',
          latestVersion: '1.2.0',
          summary: 'Marketplace summary',
          languages: ['java'],
          platforms: [],
        },
      ]),
    } as unknown as PluginCatalogService;

    const manager = new PluginManager({
      registryStore,
      installerService,
      catalogService,
    });

    const installed = await manager.installLocalPlugin({
      filePath: packageRoot,
    });

    expect(installed.replacedPluginIds).toEqual([]);
    expect(installed.item.id).toBe('acme.java-language');
    expect(installed.item.enabledByDefault).toBe(true);
    expect(installed.item.version).toBe('1.0.0');

    const installedManifestPath = path.join(
      tempDir,
      'plugin-data',
      'packages',
      'acme.java-language',
      '1.0.0',
      'plugin.json',
    );
    expect(await fs.pathExists(installedManifestPath)).toBe(true);

    const listed = await manager.listPlugins();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 'acme.java-language',
      latestVersion: '1.2.0',
      languages: ['java'],
      summary: 'Marketplace summary',
      updateAvailable: true,
      enabledByDefault: true,
    });
  });

  it('replaces installed plugins that provide the same language-server capability', async () => {
    const existingPluginPath = path.join(tempDir, 'plugin-data', 'packages', 'acme.java-language', '1.0.0');
    await fs.ensureDir(existingPluginPath);
    await fs.writeJson(path.join(existingPluginPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.java-language',
      name: 'Java Language Support',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'language-server',
          languages: ['java'],
          runtime: {
            type: 'java',
            entry: 'server/jdtls.jar',
          },
        },
      ],
    });
    await registryStore.upsert('acme.java-language', {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: existingPluginPath,
      enabledByDefault: true,
      status: 'installed',
    });
    await registryStore.setGlobalPluginSettings('acme.java-language', {
      'trace.server': 'verbose',
    });

    const replacementRoot = path.join(tempDir, 'packages-src-replacement');
    await fs.ensureDir(replacementRoot);
    await fs.writeJson(path.join(replacementRoot, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.alt-java-language',
      name: 'Alternative Java Support',
      publisher: 'Acme',
      version: '2.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'language-server',
          languages: ['java'],
          runtime: {
            type: 'java',
            entry: 'server/alt-jdtls.jar',
          },
        },
      ],
    });
    await fs.ensureDir(path.join(replacementRoot, 'server'));
    await fs.writeFile(path.join(replacementRoot, 'server', 'alt-jdtls.jar'), 'stub');

    const manager = new PluginManager({
      registryStore,
      installerService,
      catalogService: {
        list: vi.fn(async () => []),
      } as unknown as PluginCatalogService,
    });

    const installed = await manager.installLocalPlugin({
      filePath: replacementRoot,
    });

    expect(installed.replacedPluginIds).toEqual(['acme.java-language']);

    const listed = await manager.listPlugins();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 'acme.alt-java-language',
      version: '2.0.0',
    });

    const registry = await registryStore.readRegistry();
    expect(Object.keys(registry.plugins)).toEqual(['acme.alt-java-language']);
    expect(registry.globalPluginSettings).toEqual({});
    expect(await fs.pathExists(existingPluginPath)).toBe(false);
  });
});
