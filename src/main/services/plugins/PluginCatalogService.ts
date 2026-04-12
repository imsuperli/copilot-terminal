import fs from 'fs-extra';
import { pathToFileURL } from 'url';
import type {
  PluginCatalog,
  PluginCatalogEntry,
  PluginCatalogPlatformAsset,
  PluginPlatformArch,
  PluginPlatformOS,
} from '../../../shared/types/plugin';
import type { PluginCatalogQuery } from '../../../shared/types/electron-api';
import { normalizeOptionalString, uniqueStrings, writeJsonFileAtomic } from '../ssh/storeUtils';

export interface PluginCatalogServiceOptions {
  cachePath: string;
  catalogUrl?: string;
  fallbackCatalogPath?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_OFFICIAL_PLUGIN_CATALOG_URL = 'https://plugin.notta.top/catalog.json';

export class PluginCatalogService {
  private readonly cachePath: string;
  private readonly catalogUrl: string | null;
  private readonly fallbackCatalogPath: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PluginCatalogServiceOptions) {
    this.cachePath = options.cachePath;
    this.catalogUrl = normalizeOptionalString(options.catalogUrl ?? process.env.CODE_PLUGIN_CATALOG_URL ?? DEFAULT_OFFICIAL_PLUGIN_CATALOG_URL) ?? null;
    this.fallbackCatalogPath = normalizeOptionalString(options.fallbackCatalogPath) ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async list(query: PluginCatalogQuery = {}): Promise<PluginCatalogEntry[]> {
    const cachedCatalog = await this.readCatalogFile(this.cachePath);
    if (!query.refresh && cachedCatalog) {
      return this.filterCatalogEntriesForCurrentPlatform(cachedCatalog.plugins);
    }

    try {
      const remoteCatalog = await this.fetchRemoteCatalog();
      if (remoteCatalog) {
        await writeJsonFileAtomic(this.cachePath, remoteCatalog);
        return this.filterCatalogEntriesForCurrentPlatform(remoteCatalog.plugins);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[PluginCatalogService] Failed to fetch remote plugin catalog from ${this.catalogUrl ?? '<disabled>'}:`,
          error,
        );
      }
    }

    if (cachedCatalog) {
      return this.filterCatalogEntriesForCurrentPlatform(cachedCatalog.plugins);
    }

    const fallbackCatalog = this.fallbackCatalogPath
      ? await this.readCatalogFile(this.fallbackCatalogPath)
      : null;

    return this.filterCatalogEntriesForCurrentPlatform(fallbackCatalog?.plugins ?? []);
  }

  private async fetchRemoteCatalog(): Promise<PluginCatalog | null> {
    if (!this.catalogUrl) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await this.fetchImpl(this.catalogUrl, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Plugin catalog request failed with status ${response.status}`);
      }

      return resolveCatalogAssetUrls(
        normalizePluginCatalog(await response.json()),
        this.catalogUrl,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readCatalogFile(filePath: string): Promise<PluginCatalog | null> {
    if (!await fs.pathExists(filePath)) {
      return null;
    }

    return resolveCatalogAssetUrls(
      normalizePluginCatalog(await fs.readJson(filePath)),
      pathToFileURL(filePath).href,
    );
  }

  private filterCatalogEntriesForCurrentPlatform(entries: readonly PluginCatalogEntry[]): PluginCatalogEntry[] {
    const currentOs = normalizePlatformOs(process.platform);
    const currentArch = normalizePlatformArch(process.arch);

    return entries
      .map((entry) => ({
        ...entry,
        platforms: entry.platforms.filter((asset) => asset.os === currentOs && asset.arch === currentArch),
      }))
      .filter((entry) => entry.platforms.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name) || left.publisher.localeCompare(right.publisher));
  }
}

function normalizePluginCatalog(value: unknown): PluginCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Plugin catalog must be an object');
  }

  const candidate = value as Partial<PluginCatalog>;
  return {
    schemaVersion: 1,
    generatedAt: requireNonEmptyString(candidate.generatedAt, 'Plugin catalog generatedAt'),
    plugins: Array.isArray(candidate.plugins)
      ? candidate.plugins.map((entry, index) => normalizePluginCatalogEntry(entry, index))
      : [],
  };
}

function normalizePluginCatalogEntry(value: unknown, index: number): PluginCatalogEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Plugin catalog entry[${index}] must be an object`);
  }

  const candidate = value as Partial<PluginCatalogEntry>;
  return {
    id: requireNonEmptyString(candidate.id, `Plugin catalog entry[${index}] id`),
    name: requireNonEmptyString(candidate.name, `Plugin catalog entry[${index}] name`),
    publisher: requireNonEmptyString(candidate.publisher, `Plugin catalog entry[${index}] publisher`),
    latestVersion: requireNonEmptyString(candidate.latestVersion, `Plugin catalog entry[${index}] latestVersion`),
    ...(normalizeOptionalString(candidate.summary) ? { summary: normalizeOptionalString(candidate.summary) } : {}),
    ...(normalizeOptionalString(candidate.description) ? { description: normalizeOptionalString(candidate.description) } : {}),
    ...(normalizeOptionalString(candidate.homepage) ? { homepage: normalizeOptionalString(candidate.homepage) } : {}),
    ...(normalizeOptionalString(candidate.license) ? { license: normalizeOptionalString(candidate.license) } : {}),
    ...(Array.isArray(candidate.categories) ? { categories: uniqueStrings(candidate.categories) as PluginCatalogEntry['categories'] } : {}),
    ...(Array.isArray(candidate.tags) ? { tags: uniqueStrings(candidate.tags) } : {}),
    ...(Array.isArray(candidate.languages) ? { languages: uniqueStrings(candidate.languages) } : {}),
    platforms: Array.isArray(candidate.platforms)
      ? candidate.platforms.map((platform, platformIndex) => normalizePluginCatalogPlatformAsset(platform, index, platformIndex))
      : [],
  };
}

function normalizePluginCatalogPlatformAsset(value: unknown, entryIndex: number, platformIndex: number): PluginCatalogPlatformAsset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Plugin catalog entry[${entryIndex}] platform[${platformIndex}] must be an object`);
  }

  const candidate = value as Partial<PluginCatalogPlatformAsset>;
  return {
    os: normalizePlatformOs(candidate.os),
    arch: normalizePlatformArch(candidate.arch),
    downloadUrl: requireNonEmptyString(candidate.downloadUrl, `Plugin catalog entry[${entryIndex}] platform[${platformIndex}] downloadUrl`),
    sha256: requireNonEmptyString(candidate.sha256, `Plugin catalog entry[${entryIndex}] platform[${platformIndex}] sha256`),
    ...(typeof candidate.size === 'number' && candidate.size > 0 ? { size: candidate.size } : {}),
  };
}

function normalizePlatformOs(value: unknown): PluginPlatformOS {
  if (value === 'darwin' || value === 'linux' || value === 'win32') {
    return value;
  }

  if (value === 'android') {
    return 'linux';
  }

  throw new Error(`Unsupported plugin platform os: ${String(value ?? '')}`);
}

function normalizePlatformArch(value: unknown): PluginPlatformArch {
  if (value === 'x64' || value === 'arm64') {
    return value;
  }

  throw new Error(`Unsupported plugin platform arch: ${String(value ?? '')}`);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function resolveCatalogAssetUrls(catalog: PluginCatalog, catalogRef: string): PluginCatalog {
  const baseUrl = new URL('.', catalogRef);

  return {
    ...catalog,
    plugins: catalog.plugins.map((entry) => ({
      ...entry,
      platforms: entry.platforms.map((asset) => ({
        ...asset,
        downloadUrl: new URL(asset.downloadUrl, baseUrl).href,
      })),
    })),
  };
}
