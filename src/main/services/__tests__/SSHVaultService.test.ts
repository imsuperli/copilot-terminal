import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ISSHSecureStorage } from '../ssh/SSHVaultService';
import { SSHVaultService } from '../ssh/SSHVaultService';

class MockSecureStorage implements ISSHSecureStorage {
  readonly mode = 'electron-safe-storage' as const;
  encryptCalls = 0;
  decryptCalls = 0;

  encryptString(plaintext: string): string {
    this.encryptCalls += 1;
    return Buffer.from(`enc:${plaintext}`, 'utf8').toString('base64');
  }

  decryptString(ciphertext: string): string {
    this.decryptCalls += 1;
    const decoded = Buffer.from(ciphertext, 'base64').toString('utf8');
    return decoded.replace(/^enc:/, '');
  }
}

describe('SSHVaultService', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-terminal-ssh-vault-'));
    filePath = path.join(tempDir, 'ssh-vault.json');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('stores encrypted secrets and reads them back', async () => {
    const secureStorage = new MockSecureStorage();
    const vault = new SSHVaultService({
      filePath,
      secureStorage,
      now: () => '2026-03-22T10:00:00.000Z',
    });

    await vault.set('profile-1', {
      password: 'super-secret',
      privateKeyPassphrases: {
        '/keys/id_ed25519': 'key-secret',
      },
    });

    const persisted = await fs.readJson(filePath);
    expect(persisted.storageMode).toBe('electron-safe-storage');
    expect(persisted.entries[0].secret).not.toContain('super-secret');
    expect(persisted.entries[0].hasPassword).toBe(true);
    expect(persisted.entries[0].hasPassphrase).toBe(true);

    expect(await vault.get('profile-1')).toEqual({
      profileId: 'profile-1',
      password: 'super-secret',
      privateKeyPassphrases: {
        '/keys/id_ed25519': 'key-secret',
      },
      updatedAt: '2026-03-22T10:00:00.000Z',
    });
    expect(secureStorage.decryptCalls).toBe(0);
  });

  it('reports credential state and supports secret-specific updates', async () => {
    const vault = new SSHVaultService({
      filePath,
      secureStorage: new MockSecureStorage(),
      now: () => '2026-03-22T10:00:00.000Z',
    });

    await vault.setPassword('profile-1', 'super-secret');
    await vault.setPrivateKeyPassphrase('profile-1', '/keys/id_ed25519', 'key-secret');

    expect(await vault.getCredentialState('profile-1')).toEqual({
      hasPassword: true,
      hasPassphrase: true,
    });

    await vault.clearPassword('profile-1');

    expect(await vault.get('profile-1')).toEqual({
      profileId: 'profile-1',
      privateKeyPassphrases: {
        '/keys/id_ed25519': 'key-secret',
      },
      updatedAt: '2026-03-22T10:00:00.000Z',
    });

    await vault.clearPrivateKeyPassphrase('profile-1', '/keys/id_ed25519');
    expect(await vault.get('profile-1')).toBeNull();
    expect(await vault.getCredentialState('profile-1')).toEqual({
      hasPassword: false,
      hasPassphrase: false,
    });
  });

  it('reads credential state from persisted metadata without decrypting secrets', async () => {
    const writerStorage = new MockSecureStorage();
    const writer = new SSHVaultService({
      filePath,
      secureStorage: writerStorage,
      now: () => '2026-03-22T10:00:00.000Z',
    });

    await writer.set('profile-1', {
      password: 'super-secret',
      privateKeyPassphrases: {
        '/keys/id_ed25519': 'key-secret',
      },
    });

    const readerStorage = new MockSecureStorage();
    const reader = new SSHVaultService({
      filePath,
      secureStorage: readerStorage,
      now: () => '2026-03-22T10:00:00.000Z',
    });

    expect(await reader.getCredentialState('profile-1')).toEqual({
      hasPassword: true,
      hasPassphrase: true,
    });
    expect(readerStorage.decryptCalls).toBe(0);
  });

  it('caches decrypted entries for repeated reads', async () => {
    const writer = new SSHVaultService({
      filePath,
      secureStorage: new MockSecureStorage(),
      now: () => '2026-03-22T10:00:00.000Z',
    });

    await writer.setPassword('profile-1', 'super-secret');

    const readerStorage = new MockSecureStorage();
    const reader = new SSHVaultService({
      filePath,
      secureStorage: readerStorage,
      now: () => '2026-03-22T10:00:00.000Z',
    });

    expect(await reader.get('profile-1')).toEqual({
      profileId: 'profile-1',
      password: 'super-secret',
      updatedAt: '2026-03-22T10:00:00.000Z',
    });
    expect(await reader.get('profile-1')).toEqual({
      profileId: 'profile-1',
      password: 'super-secret',
      updatedAt: '2026-03-22T10:00:00.000Z',
    });
    expect(readerStorage.decryptCalls).toBe(1);
  });
});
