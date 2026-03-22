import { randomUUID } from 'crypto';
import { KnownHostEntry } from '../../../shared/types/ssh';
import {
  normalizeOptionalString,
  readJsonFileOrDefault,
  resolveSSHDataFilePath,
  writeJsonFileAtomic,
} from './storeUtils';

interface PersistedKnownHostsFile {
  version: 1;
  entries: KnownHostEntry[];
}

export interface KnownHostInput {
  id?: string;
  host: string;
  port: number;
  algorithm: string;
  digest: string;
}

export interface ISSHKnownHostsStore {
  list(): Promise<KnownHostEntry[]>;
  find(host: string, port: number, algorithm: string): Promise<KnownHostEntry | null>;
  upsert(input: KnownHostInput): Promise<KnownHostEntry>;
  remove(id: string): Promise<void>;
}

export interface SSHKnownHostsStoreOptions {
  filePath?: string;
  now?: () => string;
}

const DEFAULT_KNOWN_HOSTS_FILE_NAME = 'ssh-known-hosts.json';

export class SSHKnownHostsStore implements ISSHKnownHostsStore {
  private readonly filePath: string;
  private readonly now: () => string;

  constructor(options: SSHKnownHostsStoreOptions = {}) {
    this.filePath = resolveSSHDataFilePath(DEFAULT_KNOWN_HOSTS_FILE_NAME, options.filePath);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async list(): Promise<KnownHostEntry[]> {
    const data = await this.readData();
    return data.entries;
  }

  async find(host: string, port: number, algorithm: string): Promise<KnownHostEntry | null> {
    const data = await this.readData();
    const normalizedHost = requireNonEmptyString(host, 'SSH known host host');
    const normalizedPort = normalizePort(port, 'SSH known host port');
    const normalizedAlgorithm = requireNonEmptyString(algorithm, 'SSH known host algorithm');

    return data.entries.find((entry) =>
      entry.host === normalizedHost
      && entry.port === normalizedPort
      && entry.algorithm === normalizedAlgorithm,
    ) ?? null;
  }

  async upsert(input: KnownHostInput): Promise<KnownHostEntry> {
    const normalizedInput = normalizeKnownHostInput(input);
    const data = await this.readData();
    const timestamp = this.now();
    const existingIndex = data.entries.findIndex((entry) =>
      entry.id === normalizedInput.id
      || (
        entry.host === normalizedInput.host
        && entry.port === normalizedInput.port
        && entry.algorithm === normalizedInput.algorithm
      )
    );

    if (existingIndex >= 0) {
      const current = data.entries[existingIndex];
      const updated: KnownHostEntry = {
        ...current,
        ...normalizedInput,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: timestamp,
      };

      data.entries[existingIndex] = updated;
      await this.writeData(data.entries);
      return updated;
    }

    const created: KnownHostEntry = {
      ...normalizedInput,
      id: normalizedInput.id ?? randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    data.entries.push(created);
    await this.writeData(data.entries);
    return created;
  }

  async remove(id: string): Promise<void> {
    const entryId = requireNonEmptyString(id, 'SSH known host id');
    const data = await this.readData();
    const nextEntries = data.entries.filter((entry) => entry.id !== entryId);

    if (nextEntries.length === data.entries.length) {
      return;
    }

    await this.writeData(nextEntries);
  }

  private async readData(): Promise<PersistedKnownHostsFile> {
    const data = await readJsonFileOrDefault<PersistedKnownHostsFile>(this.filePath, {
      version: 1,
      entries: [],
    });

    if (!Array.isArray(data.entries)) {
      throw new Error('SSH known hosts store is corrupted: entries must be an array');
    }

    return {
      version: 1,
      entries: data.entries
        .map((entry) => normalizeKnownHostEntry(entry))
        .sort((left, right) => left.host.localeCompare(right.host) || left.port - right.port || left.algorithm.localeCompare(right.algorithm)),
    };
  }

  private async writeData(entries: KnownHostEntry[]): Promise<void> {
    await writeJsonFileAtomic(this.filePath, {
      version: 1,
      entries,
    } satisfies PersistedKnownHostsFile);
  }
}

function normalizeKnownHostEntry(entry: Partial<KnownHostEntry>): KnownHostEntry {
  return {
    id: requireNonEmptyString(entry.id, 'SSH known host id'),
    host: requireNonEmptyString(entry.host, 'SSH known host host'),
    port: normalizePort(entry.port, 'SSH known host port'),
    algorithm: requireNonEmptyString(entry.algorithm, 'SSH known host algorithm'),
    digest: requireNonEmptyString(entry.digest, 'SSH known host digest'),
    createdAt: requireNonEmptyString(entry.createdAt, 'SSH known host createdAt'),
    updatedAt: requireNonEmptyString(entry.updatedAt, 'SSH known host updatedAt'),
  };
}

function normalizeKnownHostInput(input: KnownHostInput): KnownHostInput {
  return {
    ...(normalizeOptionalString(input.id) ? { id: normalizeOptionalString(input.id) } : {}),
    host: requireNonEmptyString(input.host, 'SSH known host host'),
    port: normalizePort(input.port, 'SSH known host port'),
    algorithm: requireNonEmptyString(input.algorithm, 'SSH known host algorithm'),
    digest: requireNonEmptyString(input.digest, 'SSH known host digest'),
  };
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizePort(value: unknown, fieldName: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${fieldName} must be an integer between 1 and 65535`);
  }

  return port;
}
