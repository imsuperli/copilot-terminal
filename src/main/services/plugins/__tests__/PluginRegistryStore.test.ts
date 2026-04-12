import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginRegistryStore } from '../PluginRegistryStore';

describe('PluginRegistryStore', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-terminal-plugin-registry-'));
    filePath = path.join(tempDir, 'registry.json');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('normalizes persisted plugin keys and nested setting keys', async () => {
    await fs.writeJson(filePath, {
      schemaVersion: 1,
      plugins: {
        ' acme.java-language ': {
          source: 'marketplace',
          installedVersion: '1.0.0',
          installPath: '/tmp/acme-java-language',
          enabledByDefault: true,
          status: 'installed',
        },
      },
      globalLanguageBindings: {
        ' java ': ' acme.java-language ',
      },
      globalPluginSettings: {
        ' acme.java-language ': {
          ' trace.server ': 'verbose',
          ' ': 'ignored',
        },
      },
    });

    const store = new PluginRegistryStore({ filePath });
    const registry = await store.readRegistry();

    expect(Object.keys(registry.plugins)).toEqual(['acme.java-language']);
    expect(registry.globalLanguageBindings).toEqual({
      java: 'acme.java-language',
    });
    expect(registry.globalPluginSettings).toEqual({
      'acme.java-language': {
        'trace.server': 'verbose',
      },
    });
  });

  it('removes global bindings and settings when uninstalling a plugin', async () => {
    const store = new PluginRegistryStore({ filePath });

    await store.upsert('acme.java-language', {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: '/tmp/acme-java-language',
      enabledByDefault: true,
      status: 'installed',
    });
    await store.setGlobalLanguageBinding('java', 'acme.java-language');
    await store.setGlobalPluginSettings('acme.java-language', {
      'trace.server': 'verbose',
    });

    await store.remove('acme.java-language');

    const registry = await store.readRegistry();
    expect(registry.plugins).toEqual({});
    expect(registry.globalLanguageBindings).toEqual({});
    expect(registry.globalPluginSettings).toEqual({});
  });

  it('replaces global plugin settings snapshots and clears them when empty', async () => {
    const store = new PluginRegistryStore({ filePath });

    await store.upsert('acme.java-language', {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: '/tmp/acme-java-language',
      enabledByDefault: true,
      status: 'installed',
    });
    await store.setGlobalPluginSettings('acme.java-language', {
      'java.home': '/opt/jdk-21',
      'trace.server': 'verbose',
    });
    await store.setGlobalPluginSettings('acme.java-language', {
      'java.home': '/opt/jdk-22',
    });

    let registry = await store.readRegistry();
    expect(registry.globalPluginSettings).toEqual({
      'acme.java-language': {
        'java.home': '/opt/jdk-22',
      },
    });

    await store.setGlobalPluginSettings('acme.java-language', {});
    registry = await store.readRegistry();
    expect(registry.globalPluginSettings).toEqual({});
  });
});
