import fs from 'fs-extra';
import {
  SSHCredentialState,
  SSHVaultEntry,
  SSHVaultStorageMode,
} from '../../../shared/types/ssh';
import {
  normalizeOptionalString,
  readJsonFileOrDefault,
  resolveSSHDataFilePath,
  writeJsonFileAtomic,
} from './storeUtils';

interface PersistedSSHVaultEntry {
  profileId: string;
  secret: string;
  updatedAt: string;
}

interface PersistedSSHVaultFile {
  version: 1;
  storageMode: SSHVaultStorageMode;
  entries: PersistedSSHVaultEntry[];
}

export interface ISSHSecureStorage {
  readonly mode: SSHVaultStorageMode;
  encryptString(plaintext: string): string;
  decryptString(ciphertext: string): string;
}

export interface ISSHVaultService {
  get(profileId: string): Promise<SSHVaultEntry | null>;
  set(profileId: string, entry: Omit<SSHVaultEntry, 'profileId' | 'updatedAt'>): Promise<SSHVaultEntry>;
  patch(profileId: string, patch: Partial<Omit<SSHVaultEntry, 'profileId' | 'updatedAt'>>): Promise<SSHVaultEntry | null>;
  remove(profileId: string): Promise<void>;
  getCredentialState(profileId: string): Promise<SSHCredentialState>;
  setPassword(profileId: string, password: string): Promise<void>;
  clearPassword(profileId: string): Promise<void>;
  setPrivateKeyPassphrase(profileId: string, keyPath: string, passphrase: string): Promise<void>;
  clearPrivateKeyPassphrase(profileId: string, keyPath: string): Promise<void>;
}

export interface SSHVaultServiceOptions {
  filePath?: string;
  secureStorage?: ISSHSecureStorage;
  now?: () => string;
}

const DEFAULT_VAULT_FILE_NAME = 'ssh-vault.json';

export class PlainTextSSHSecureStorage implements ISSHSecureStorage {
  readonly mode = 'plain-text-fallback' as const;

  encryptString(plaintext: string): string {
    return plaintext;
  }

  decryptString(ciphertext: string): string {
    return ciphertext;
  }
}

export class ElectronSafeSSHSecureStorage implements ISSHSecureStorage {
  readonly mode = 'electron-safe-storage' as const;

  encryptString(plaintext: string): string {
    const { safeStorage } = require('electron') as typeof import('electron');
    if (!safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('Electron safeStorage is unavailable');
    }

    return safeStorage.encryptString(plaintext).toString('base64');
  }

  decryptString(ciphertext: string): string {
    const { safeStorage } = require('electron') as typeof import('electron');
    if (!safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('Electron safeStorage is unavailable');
    }

    return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
  }
}

export function createDefaultSSHSecureStorage(): ISSHSecureStorage {
  try {
    const { safeStorage } = require('electron') as typeof import('electron');
    if (safeStorage?.isEncryptionAvailable?.()) {
      return new ElectronSafeSSHSecureStorage();
    }
  } catch {
    // Ignore module resolution failures and use the plain-text fallback.
  }

  return new PlainTextSSHSecureStorage();
}

export class SSHVaultService implements ISSHVaultService {
  private readonly filePath: string;
  private readonly secureStorage: ISSHSecureStorage;
  private readonly now: () => string;

  constructor(options: SSHVaultServiceOptions = {}) {
    this.filePath = resolveSSHDataFilePath(DEFAULT_VAULT_FILE_NAME, options.filePath);
    this.secureStorage = options.secureStorage ?? createDefaultSSHSecureStorage();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async get(profileId: string): Promise<SSHVaultEntry | null> {
    const normalizedProfileId = requireNonEmptyString(profileId, 'SSH vault profileId');
    const data = await this.readData();
    return data.entries.find((entry) => entry.profileId === normalizedProfileId) ?? null;
  }

  async set(
    profileId: string,
    entry: Omit<SSHVaultEntry, 'profileId' | 'updatedAt'>,
  ): Promise<SSHVaultEntry> {
    const normalizedProfileId = requireNonEmptyString(profileId, 'SSH vault profileId');
    const nextEntry = normalizeVaultEntry({
      profileId: normalizedProfileId,
      password: entry.password,
      privateKeyPassphrases: entry.privateKeyPassphrases,
      updatedAt: this.now(),
    });

    if (!hasSecrets(nextEntry)) {
      throw new Error('SSH vault entry must contain at least one secret');
    }

    const data = await this.readData();
    const index = data.entries.findIndex((item) => item.profileId === normalizedProfileId);

    if (index >= 0) {
      data.entries[index] = nextEntry;
    } else {
      data.entries.push(nextEntry);
    }

    await this.writeData(data.entries);
    return nextEntry;
  }

  async patch(
    profileId: string,
    patch: Partial<Omit<SSHVaultEntry, 'profileId' | 'updatedAt'>>,
  ): Promise<SSHVaultEntry | null> {
    const normalizedProfileId = requireNonEmptyString(profileId, 'SSH vault profileId');
    const current = await this.get(normalizedProfileId);
    const hasPasswordPatch = Object.prototype.hasOwnProperty.call(patch, 'password');
    const hasPassphrasePatch = Object.prototype.hasOwnProperty.call(patch, 'privateKeyPassphrases');

    const nextEntry = normalizeVaultEntry({
      profileId: normalizedProfileId,
      password: hasPasswordPatch ? patch.password : current?.password,
      privateKeyPassphrases: hasPassphrasePatch ? patch.privateKeyPassphrases : current?.privateKeyPassphrases,
      updatedAt: this.now(),
    });

    if (!hasSecrets(nextEntry)) {
      await this.remove(normalizedProfileId);
      return null;
    }

    const data = await this.readData();
    const index = data.entries.findIndex((item) => item.profileId === normalizedProfileId);

    if (index >= 0) {
      data.entries[index] = nextEntry;
    } else {
      data.entries.push(nextEntry);
    }

    await this.writeData(data.entries);
    return nextEntry;
  }

  async remove(profileId: string): Promise<void> {
    const normalizedProfileId = requireNonEmptyString(profileId, 'SSH vault profileId');
    const data = await this.readData();
    const nextEntries = data.entries.filter((entry) => entry.profileId !== normalizedProfileId);

    if (nextEntries.length === data.entries.length) {
      return;
    }

    await this.writeData(nextEntries);
  }

  async getCredentialState(profileId: string): Promise<SSHCredentialState> {
    const entry = await this.get(profileId);
    return {
      hasPassword: Boolean(entry?.password),
      hasPassphrase: Boolean(entry?.privateKeyPassphrases && Object.keys(entry.privateKeyPassphrases).length > 0),
    };
  }

  async setPassword(profileId: string, password: string): Promise<void> {
    const normalizedPassword = password;
    if (!normalizedPassword) {
      throw new Error('SSH password cannot be empty');
    }

    const current = await this.get(profileId);
    await this.set(profileId, {
      password: normalizedPassword,
      privateKeyPassphrases: current?.privateKeyPassphrases,
    });
  }

  async clearPassword(profileId: string): Promise<void> {
    const current = await this.get(profileId);
    if (!current) {
      return;
    }

    await this.patch(profileId, {
      password: undefined,
      privateKeyPassphrases: current.privateKeyPassphrases,
    });
  }

  async setPrivateKeyPassphrase(profileId: string, keyPath: string, passphrase: string): Promise<void> {
    const normalizedKeyPath = requireNonEmptyString(keyPath, 'SSH private key path');
    if (!passphrase) {
      throw new Error('SSH private key passphrase cannot be empty');
    }

    const current = await this.get(profileId);
    await this.set(profileId, {
      password: current?.password,
      privateKeyPassphrases: {
        ...(current?.privateKeyPassphrases ?? {}),
        [normalizedKeyPath]: passphrase,
      },
    });
  }

  async clearPrivateKeyPassphrase(profileId: string, keyPath: string): Promise<void> {
    const normalizedKeyPath = requireNonEmptyString(keyPath, 'SSH private key path');
    const current = await this.get(profileId);

    if (!current?.privateKeyPassphrases?.[normalizedKeyPath]) {
      return;
    }

    const nextPassphrases = { ...current.privateKeyPassphrases };
    delete nextPassphrases[normalizedKeyPath];

    await this.patch(profileId, {
      password: current.password,
      privateKeyPassphrases: nextPassphrases,
    });
  }

  private async readData(): Promise<{ storageMode: SSHVaultStorageMode; entries: SSHVaultEntry[] }> {
    const data = await readJsonFileOrDefault<PersistedSSHVaultFile>(this.filePath, {
      version: 1,
      storageMode: this.secureStorage.mode,
      entries: [],
    });

    if (!Array.isArray(data.entries)) {
      throw new Error('SSH vault store is corrupted: entries must be an array');
    }

    const storageMode = data.storageMode ?? this.secureStorage.mode;
    return {
      storageMode,
      entries: data.entries.map((entry) => this.deserializeEntry(entry, storageMode)),
    };
  }

  private async writeData(entries: SSHVaultEntry[]): Promise<void> {
    if (entries.length === 0) {
      await fs.remove(this.filePath);
      return;
    }

    const payload: PersistedSSHVaultFile = {
      version: 1,
      storageMode: this.secureStorage.mode,
      entries: entries.map((entry) => ({
        profileId: entry.profileId,
        updatedAt: entry.updatedAt,
        secret: this.secureStorage.encryptString(JSON.stringify({
          password: entry.password,
          privateKeyPassphrases: entry.privateKeyPassphrases,
        })),
      })),
    };

    await writeJsonFileAtomic(this.filePath, payload, { privateFile: true });
  }

  private deserializeEntry(entry: PersistedSSHVaultEntry, storageMode: SSHVaultStorageMode): SSHVaultEntry {
    const profileId = requireNonEmptyString(entry.profileId, 'SSH vault profileId');
    const updatedAt = requireNonEmptyString(entry.updatedAt, 'SSH vault updatedAt');
    const secret = requireNonEmptyString(entry.secret, 'SSH vault secret');
    const serialized = storageMode === 'plain-text-fallback'
      ? secret
      : this.decryptSecret(secret, storageMode);
    const parsed = JSON.parse(serialized) as Partial<SSHVaultEntry>;

    return normalizeVaultEntry({
      profileId,
      password: parsed.password,
      privateKeyPassphrases: parsed.privateKeyPassphrases,
      updatedAt,
    });
  }

  private decryptSecret(secret: string, storageMode: SSHVaultStorageMode): string {
    if (storageMode === this.secureStorage.mode) {
      return this.secureStorage.decryptString(secret);
    }

    return new ElectronSafeSSHSecureStorage().decryptString(secret);
  }
}

function normalizeVaultEntry(entry: SSHVaultEntry): SSHVaultEntry {
  const privateKeyPassphrases = Object.fromEntries(
    Object.entries(entry.privateKeyPassphrases ?? {})
      .map(([keyPath, passphrase]) => [normalizeOptionalString(keyPath), passphrase] as const)
      .filter(([keyPath, passphrase]) => Boolean(keyPath) && typeof passphrase === 'string' && passphrase.length > 0)
      .map(([keyPath, passphrase]) => [keyPath as string, passphrase]),
  ) as Record<string, string>;

  return {
    profileId: requireNonEmptyString(entry.profileId, 'SSH vault profileId'),
    ...(typeof entry.password === 'string' && entry.password.length > 0 ? { password: entry.password } : {}),
    ...(Object.keys(privateKeyPassphrases).length > 0 ? { privateKeyPassphrases } : {}),
    updatedAt: requireNonEmptyString(entry.updatedAt, 'SSH vault updatedAt'),
  };
}

function hasSecrets(entry: SSHVaultEntry): boolean {
  return Boolean(entry.password)
    || Boolean(entry.privateKeyPassphrases && Object.keys(entry.privateKeyPassphrases).length > 0);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}
