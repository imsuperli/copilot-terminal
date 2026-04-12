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
      enableByDefault: true,
    });

    expect(installed.id).toBe('acme.java-language');
    expect(installed.enabledByDefault).toBe(true);
    expect(installed.version).toBe('1.0.0');

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
});
