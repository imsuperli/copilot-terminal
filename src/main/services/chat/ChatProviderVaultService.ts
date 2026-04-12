import fs from 'fs-extra';
import type { LLMProviderConfig } from '../../../shared/types/chat';
import type { SSHVaultStorageMode } from '../../../shared/types/ssh';
import {
  ElectronSafeSSHSecureStorage,
  type ISSHSecureStorage,
  PlainTextSSHSecureStorage,
  createDefaultSSHSecureStorage,
} from '../ssh/SSHVaultService';
import {
  normalizeOptionalString,
  readJsonFileOrDefault,
  resolveSSHDataFilePath,
  writeJsonFileAtomic,
} from '../ssh/storeUtils';

interface PersistedChatProviderSecretEntry {
  providerId: string;
  secret: string;
  updatedAt: string;
}

interface PersistedChatProviderVaultFile {
  version: 1;
  storageMode: SSHVaultStorageMode;
  entries: PersistedChatProviderSecretEntry[];
}

export interface ChatProviderVaultServiceOptions {
  filePath?: string;
  secureStorage?: ISSHSecureStorage;
  now?: () => string;
}

const DEFAULT_VAULT_FILE_NAME = 'chat-provider-vault.json';

export class ChatProviderVaultService {
  private readonly filePath: string;
  private readonly secureStorage: ISSHSecureStorage;
  private readonly now: () => string;
  private cache: {
    signature: string | null;
    storageMode: SSHVaultStorageMode;
    entries: PersistedChatProviderSecretEntry[];
  } | null;

  constructor(options: ChatProviderVaultServiceOptions = {}) {
    this.filePath = resolveSSHDataFilePath(DEFAULT_VAULT_FILE_NAME, options.filePath);
    this.secureStorage = options.secureStorage ?? createDefaultSSHSecureStorage();
    this.now = options.now ?? (() => new Date().toISOString());
    this.cache = null;
  }

  async getApiKey(providerId: string): Promise<string | null> {
    const normalizedProviderId = requireNonEmptyString(providerId, 'Chat provider id');
    const data = await this.readData();
    const entry = data.entries.find((item) => item.providerId === normalizedProviderId);

    if (!entry) {
      return null;
    }

    return this.deserializeSecret(entry.secret, data.storageMode);
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    const normalizedProviderId = requireNonEmptyString(providerId, 'Chat provider id');
    const normalizedApiKey = requireNonEmptyString(apiKey, 'Chat provider apiKey');
    const data = await this.readData();
    const nextEntry: PersistedChatProviderSecretEntry = {
      providerId: normalizedProviderId,
      secret: this.secureStorage.encryptString(normalizedApiKey),
      updatedAt: this.now(),
    };
    const index = data.entries.findIndex((item) => item.providerId === normalizedProviderId);

    if (index >= 0) {
      data.entries[index] = nextEntry;
    } else {
      data.entries.push(nextEntry);
    }

    await this.writeData(data.entries);
  }

  async remove(providerId: string): Promise<void> {
    const normalizedProviderId = requireNonEmptyString(providerId, 'Chat provider id');
    const data = await this.readData();
    const nextEntries = data.entries.filter((entry) => entry.providerId !== normalizedProviderId);

    if (nextEntries.length === data.entries.length) {
      return;
    }

    await this.writeData(nextEntries);
  }

  async hydrateProviders(providers: readonly LLMProviderConfig[]): Promise<LLMProviderConfig[]> {
    const data = await this.readData();

    return await Promise.all(providers.map(async (provider) => {
      const entry = data.entries.find((item) => item.providerId === provider.id);
      const apiKey = entry
        ? this.deserializeSecret(entry.secret, data.storageMode)
        : provider.apiKey;

      return {
        ...provider,
        apiKey: apiKey ?? '',
      };
    }));
  }

  private async readData(): Promise<{
    storageMode: SSHVaultStorageMode;
    entries: PersistedChatProviderSecretEntry[];
  }> {
    const signature = await this.getFileSignature();
    if (this.cache && this.cache.signature === signature) {
      return {
        storageMode: this.cache.storageMode,
        entries: this.cache.entries.map((entry) => ({ ...entry })),
      };
    }

    const data = await readJsonFileOrDefault<PersistedChatProviderVaultFile>(this.filePath, {
      version: 1,
      storageMode: this.secureStorage.mode,
      entries: [],
    });

    if (!Array.isArray(data.entries)) {
      throw new Error('Chat provider vault is corrupted: entries must be an array');
    }

    const storageMode = data.storageMode ?? this.secureStorage.mode;
    const entries = data.entries.map((entry) => ({
      providerId: requireNonEmptyString(entry.providerId, 'Chat provider id'),
      secret: requireNonEmptyString(entry.secret, 'Chat provider secret'),
      updatedAt: requireNonEmptyString(entry.updatedAt, 'Chat provider updatedAt'),
    }));

    this.cache = {
      signature,
      storageMode,
      entries: entries.map((entry) => ({ ...entry })),
    };

    return {
      storageMode,
      entries,
    };
  }

  private async writeData(entries: PersistedChatProviderSecretEntry[]): Promise<void> {
    if (entries.length === 0) {
      await fs.remove(this.filePath);
      this.cache = {
        signature: null,
        storageMode: this.secureStorage.mode,
        entries: [],
      };
      return;
    }

    const payload: PersistedChatProviderVaultFile = {
      version: 1,
      storageMode: this.secureStorage.mode,
      entries,
    };

    await writeJsonFileAtomic(this.filePath, payload, { privateFile: true });
    this.cache = {
      signature: await this.getFileSignature(),
      storageMode: this.secureStorage.mode,
      entries: entries.map((entry) => ({ ...entry })),
    };
  }

  private deserializeSecret(secret: string, storageMode: SSHVaultStorageMode): string {
    if (storageMode === this.secureStorage.mode) {
      return this.secureStorage.decryptString(secret);
    }

    return createSecureStorageForMode(storageMode).decryptString(secret);
  }

  private async getFileSignature(): Promise<string | null> {
    try {
      const stat = await fs.stat(this.filePath);
      return `${stat.size}:${stat.mtimeMs}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function createSecureStorageForMode(storageMode: SSHVaultStorageMode): ISSHSecureStorage {
  return storageMode === 'plain-text-fallback'
    ? new PlainTextSSHSecureStorage()
    : new ElectronSafeSSHSecureStorage();
}
