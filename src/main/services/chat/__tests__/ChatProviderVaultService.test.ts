import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ISSHSecureStorage,
  PlainTextSSHSecureStorage,
} from '../../ssh/SSHVaultService';
import { ChatProviderVaultService } from '../ChatProviderVaultService';

class MockSecureStorage implements ISSHSecureStorage {
  readonly mode = 'electron-safe-storage' as const;

  encryptString(plaintext: string): string {
    return Buffer.from(`enc:${plaintext}`, 'utf8').toString('base64');
  }

  decryptString(ciphertext: string): string {
    const decoded = Buffer.from(ciphertext, 'base64').toString('utf8');
    return decoded.replace(/^enc:/, '');
  }
}

describe('ChatProviderVaultService', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-terminal-chat-vault-'));
    filePath = path.join(tempDir, 'chat-provider-vault.json');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('stores encrypted provider API keys and hydrates providers on read', async () => {
    const vault = new ChatProviderVaultService({
      filePath,
      secureStorage: new MockSecureStorage(),
      now: () => '2026-04-12T00:00:00.000Z',
    });

    await vault.setApiKey('provider-1', 'sk-ant-test');

    const persisted = await fs.readJson(filePath);
    expect(persisted.storageMode).toBe('electron-safe-storage');
    expect(persisted.entries[0].secret).not.toContain('sk-ant-test');

    expect(await vault.getApiKey('provider-1')).toBe('sk-ant-test');
    expect(await vault.hydrateProviders([
      {
        id: 'provider-1',
        type: 'anthropic',
        name: 'Claude API',
        apiKey: '',
        models: ['claude-sonnet-4-5'],
        defaultModel: 'claude-sonnet-4-5',
      },
    ])).toEqual([
      {
        id: 'provider-1',
        type: 'anthropic',
        name: 'Claude API',
        apiKey: 'sk-ant-test',
        models: ['claude-sonnet-4-5'],
        defaultModel: 'claude-sonnet-4-5',
      },
    ]);
  });

  it('removes provider entries cleanly', async () => {
    const vault = new ChatProviderVaultService({
      filePath,
      secureStorage: new MockSecureStorage(),
      now: () => '2026-04-12T00:00:00.000Z',
    });

    await vault.setApiKey('provider-1', 'sk-ant-test');
    await vault.remove('provider-1');

    expect(await vault.getApiKey('provider-1')).toBeNull();
    expect(await fs.pathExists(filePath)).toBe(false);
  });

  it('reads plain-text fallback secrets after switching storage modes', async () => {
    const fallbackVault = new ChatProviderVaultService({
      filePath,
      secureStorage: new PlainTextSSHSecureStorage(),
      now: () => '2026-04-12T00:00:00.000Z',
    });

    await fallbackVault.setApiKey('provider-1', 'sk-ant-test');

    const encryptedVault = new ChatProviderVaultService({
      filePath,
      secureStorage: new MockSecureStorage(),
      now: () => '2026-04-12T00:00:00.000Z',
    });

    expect(await encryptedVault.getApiKey('provider-1')).toBe('sk-ant-test');
  });

  it('recovers a vault file when multiple JSON payloads were accidentally concatenated', async () => {
    const storage = new MockSecureStorage();
    const olderPayload = {
      version: 1,
      storageMode: storage.mode,
      entries: [
        {
          providerId: 'provider-1',
          secret: storage.encryptString('old-secret'),
          updatedAt: '2026-04-12T00:00:00.000Z',
        },
      ],
    };
    const newerPayload = {
      version: 1,
      storageMode: storage.mode,
      entries: [
        {
          providerId: 'provider-1',
          secret: storage.encryptString('new-secret'),
          updatedAt: '2026-04-12T01:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(filePath, `${JSON.stringify(olderPayload, null, 2)}\n${JSON.stringify(newerPayload, null, 2)}\n`, 'utf8');

    const vault = new ChatProviderVaultService({
      filePath,
      secureStorage: storage,
      now: () => '2026-04-12T02:00:00.000Z',
    });

    expect(await vault.getApiKey('provider-1')).toBe('new-secret');

    const repaired = await fs.readJson(filePath);
    expect(repaired).toEqual(newerPayload);

    const backupFiles = (await fs.readdir(tempDir))
      .filter((entry) => entry.startsWith('chat-provider-vault.json.corrupt.'));
    expect(backupFiles.length).toBe(1);
  });
});
