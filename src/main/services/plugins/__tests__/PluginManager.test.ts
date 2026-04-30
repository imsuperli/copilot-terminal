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
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-plugin-manager-'));
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

  it('lists installed plugins without fetching the remote catalog by default', async () => {
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
      languages: ['java'],
      updateAvailable: false,
      enabledByDefault: true,
    });
    expect(catalogService.list).not.toHaveBeenCalled();

    const listedWithCatalog = await manager.listPlugins({ includeCatalog: true });
    expect(listedWithCatalog).toHaveLength(1);
    expect(listedWithCatalog[0]).toMatchObject({
      id: 'acme.java-language',
      latestVersion: '1.2.0',
      summary: 'Marketplace summary',
      updateAvailable: true,
    });
    expect(catalogService.list).toHaveBeenCalledTimes(1);
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

  it('reconciles legacy duplicate plugins by keeping the most recently installed plugin for each language key', async () => {
    const olderPluginPath = path.join(tempDir, 'plugin-data', 'packages', 'acme.java-old', '1.0.0');
    await fs.ensureDir(path.join(olderPluginPath, 'server'));
    await fs.writeJson(path.join(olderPluginPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.java-old',
      name: 'Old Java Support',
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
            entry: 'server/old.jar',
          },
        },
      ],
    });
    await registryStore.upsert('acme.java-old', {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: olderPluginPath,
      enabledByDefault: true,
      status: 'installed',
      lastCheckedAt: '2026-04-11T00:00:00.000Z',
    });

    const newerPluginPath = path.join(tempDir, 'plugin-data', 'packages', 'acme.java-new', '1.0.0');
    await fs.ensureDir(path.join(newerPluginPath, 'server'));
    await fs.writeJson(path.join(newerPluginPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.java-new',
      name: 'New Java Support',
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
            entry: 'server/new.jar',
          },
        },
      ],
    });
    await registryStore.upsert('acme.java-new', {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: newerPluginPath,
      enabledByDefault: true,
      status: 'installed',
      lastCheckedAt: '2026-04-12T00:00:00.000Z',
    });

    const manager = new PluginManager({
      registryStore,
      installerService,
      catalogService: {
        list: vi.fn(async () => []),
      } as unknown as PluginCatalogService,
    });

    const removedPluginIds = await manager.reconcileConflictingPlugins();

    expect(removedPluginIds).toEqual(['acme.java-old']);
    expect(await fs.pathExists(olderPluginPath)).toBe(false);
    expect(await fs.pathExists(newerPluginPath)).toBe(true);

    const registry = await registryStore.readRegistry();
    expect(Object.keys(registry.plugins)).toEqual(['acme.java-new']);
  });

  it('keeps the newest non-conflicting set when a legacy plugin spans multiple languages', async () => {
    const javaOnlyPath = path.join(tempDir, 'plugin-data', 'packages', 'acme.java-only', '1.0.0');
    await fs.ensureDir(path.join(javaOnlyPath, 'server'));
    await fs.writeJson(path.join(javaOnlyPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.java-only',
      name: 'Java Only',
      publisher: 'Acme',
      version: '1.0.0',
      engines: { app: '>=3.0.0' },
      capabilities: [
        {
          type: 'language-server',
          languages: ['java'],
          runtime: { type: 'java', entry: 'server/java.jar' },
        },
      ],
    });
    await registryStore.upsert('acme.java-only', {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: javaOnlyPath,
      enabledByDefault: true,
      status: 'installed',
      lastCheckedAt: '2026-04-10T00:00:00.000Z',
    });

    const bridgePath = path.join(tempDir, 'plugin-data', 'packages', 'acme.java-python', '1.0.0');
    await fs.ensureDir(path.join(bridgePath, 'server'));
    await fs.writeJson(path.join(bridgePath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.java-python',
      name: 'Java Python',
      publisher: 'Acme',
      version: '1.0.0',
      engines: { app: '>=3.0.0' },
      capabilities: [
        {
          type: 'language-server',
          languages: ['java', 'python'],
          runtime: { type: 'node', entry: 'server/bridge.js' },
        },
      ],
    });
    await registryStore.upsert('acme.java-python', {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: bridgePath,
      enabledByDefault: true,
      status: 'installed',
      lastCheckedAt: '2026-04-11T00:00:00.000Z',
    });

    const pythonOnlyPath = path.join(tempDir, 'plugin-data', 'packages', 'acme.python-only', '1.0.0');
    await fs.ensureDir(path.join(pythonOnlyPath, 'server'));
    await fs.writeJson(path.join(pythonOnlyPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.python-only',
      name: 'Python Only',
      publisher: 'Acme',
      version: '1.0.0',
      engines: { app: '>=3.0.0' },
      capabilities: [
        {
          type: 'language-server',
          languages: ['python'],
          runtime: { type: 'python', entry: 'server/python.py' },
        },
      ],
    });
    await registryStore.upsert('acme.python-only', {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: pythonOnlyPath,
      enabledByDefault: true,
      status: 'installed',
      lastCheckedAt: '2026-04-12T00:00:00.000Z',
    });

    const manager = new PluginManager({
      registryStore,
      installerService,
      catalogService: {
        list: vi.fn(async () => []),
      } as unknown as PluginCatalogService,
    });

    const removedPluginIds = await manager.reconcileConflictingPlugins();

    expect(removedPluginIds).toEqual(['acme.java-python']);

    const registry = await registryStore.readRegistry();
    expect(Object.keys(registry.plugins).sort()).toEqual(['acme.java-only', 'acme.python-only']);
  });
});
