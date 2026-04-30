import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginCapabilityResolver } from '../PluginCapabilityResolver';
import { PluginRegistryStore } from '../PluginRegistryStore';

describe('PluginCapabilityResolver', () => {
  let tempDir: string;
  let registryStore: PluginRegistryStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-plugin-capability-resolver-'));
    registryStore = new PluginRegistryStore({
      filePath: path.join(tempDir, 'registry.json'),
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('resolves the highest-priority installed capability for a language', async () => {
    const formatterOnePath = path.join(tempDir, 'formatter-one');
    await fs.ensureDir(formatterOnePath);
    await fs.writeJson(path.join(formatterOnePath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.java-format',
      name: 'Java Format',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'formatter',
          languages: ['java'],
          priority: 10,
          runtime: {
            type: 'node',
            entry: 'bin/format.js',
          },
        },
      ],
    });
    await registryStore.upsert('acme.java-format', {
      source: 'sideload',
      installedVersion: '1.0.0',
      installPath: formatterOnePath,
      enabledByDefault: true,
      status: 'installed',
    });

    const formatterTwoPath = path.join(tempDir, 'formatter-two');
    await fs.ensureDir(formatterTwoPath);
    await fs.writeJson(path.join(formatterTwoPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.java-format-fast',
      name: 'Java Format Fast',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'formatter',
          languages: ['java'],
          priority: 20,
          runtime: {
            type: 'binary',
            entry: 'bin/formatter',
          },
        },
      ],
    });
    await registryStore.upsert('acme.java-format-fast', {
      source: 'sideload',
      installedVersion: '1.0.0',
      installPath: formatterTwoPath,
      enabledByDefault: true,
      status: 'installed',
    });

    const resolver = new PluginCapabilityResolver({ registryStore });
    const result = await resolver.resolve({
      type: 'formatter',
      language: 'java',
      filePath: '/workspace/project/src/Main.java',
    });

    expect(result?.pluginId).toBe('acme.java-format-fast');
    expect(result?.capability).toEqual(expect.objectContaining({
      type: 'formatter',
      priority: 20,
    }));
  });

  it('respects workspace plugin disabling', async () => {
    const pluginPath = path.join(tempDir, 'python-tests');
    await fs.ensureDir(pluginPath);
    await fs.writeJson(path.join(pluginPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.pytest-provider',
      name: 'Pytest Provider',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'test-provider',
          languages: ['python'],
          runtime: {
            type: 'python',
            entry: 'provider.py',
          },
        },
      ],
    });
    await registryStore.upsert('acme.pytest-provider', {
      source: 'sideload',
      installedVersion: '1.0.0',
      installPath: pluginPath,
      enabledByDefault: true,
      status: 'installed',
    });

    const resolver = new PluginCapabilityResolver({ registryStore });
    const result = await resolver.resolve({
      type: 'test-provider',
      language: 'python',
      filePath: '/workspace/project/tests/test_app.py',
      workspacePluginSettings: {
        disabledPluginIds: ['acme.pytest-provider'],
      },
    });

    expect(result).toBeNull();
  });

  it('skips plugins with invalid manifests and continues resolving', async () => {
    const brokenPluginPath = path.join(tempDir, 'broken-formatter');
    await fs.ensureDir(brokenPluginPath);
    await fs.writeJson(path.join(brokenPluginPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.broken-formatter',
      name: 'Broken Formatter',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'formatter',
          languages: ['java'],
        },
      ],
    });
    await registryStore.upsert('acme.broken-formatter', {
      source: 'sideload',
      installedVersion: '1.0.0',
      installPath: brokenPluginPath,
      enabledByDefault: true,
      status: 'installed',
    });

    const workingPluginPath = path.join(tempDir, 'working-formatter');
    await fs.ensureDir(workingPluginPath);
    await fs.writeJson(path.join(workingPluginPath, 'plugin.json'), {
      schemaVersion: 1,
      id: 'acme.working-formatter',
      name: 'Working Formatter',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'formatter',
          languages: ['java'],
          priority: 5,
          runtime: {
            type: 'node',
            entry: 'bin/format.js',
          },
        },
      ],
    });
    await registryStore.upsert('acme.working-formatter', {
      source: 'sideload',
      installedVersion: '1.0.0',
      installPath: workingPluginPath,
      enabledByDefault: true,
      status: 'installed',
    });

    const resolver = new PluginCapabilityResolver({ registryStore });
    await expect(resolver.resolve({
      type: 'formatter',
      language: 'java',
      filePath: '/workspace/project/src/Main.java',
    })).resolves.toEqual(expect.objectContaining({
      pluginId: 'acme.working-formatter',
    }));
  });
});
