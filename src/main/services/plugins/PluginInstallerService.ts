import { createHash, randomUUID } from 'crypto';
import fs from 'fs-extra';
import extractZip from 'extract-zip';
import path from 'path';
import type {
  InstalledPluginRecord,
  PluginCatalogEntry,
  PluginManifest,
  PluginSource,
} from '../../../shared/types/plugin';
import { normalizeOptionalString } from '../ssh/storeUtils';
import { PluginManifestValidator } from './PluginManifestValidator';
import { PluginRegistryStore } from './PluginRegistryStore';

export interface PluginInstallerServiceOptions {
  baseDir: string;
  registryStore: PluginRegistryStore;
  manifestValidator?: PluginManifestValidator;
  fetchImpl?: typeof fetch;
  now?: () => string;
}

export interface InstalledPluginResult {
  manifest: PluginManifest;
  record: InstalledPluginRecord;
}

export class PluginInstallerService {
  private readonly baseDir: string;
  private readonly registryStore: PluginRegistryStore;
  private readonly manifestValidator: PluginManifestValidator;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => string;

  constructor(options: PluginInstallerServiceOptions) {
    this.baseDir = options.baseDir;
    this.registryStore = options.registryStore;
    this.manifestValidator = options.manifestValidator ?? new PluginManifestValidator();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async installFromMarketplace(
    entry: PluginCatalogEntry,
    options: { version?: string; enableByDefault?: boolean } = {},
  ): Promise<InstalledPluginResult> {
    const requestedVersion = normalizeOptionalString(options.version) ?? entry.latestVersion;
    if (requestedVersion !== entry.latestVersion) {
      throw new Error(`Plugin ${entry.id} version ${requestedVersion} is not available in the current catalog`);
    }

    const asset = entry.platforms[0];
    if (!asset) {
      throw new Error(`Plugin ${entry.id} is not available for the current platform`);
    }

    const downloadedPackagePath = await this.downloadMarketplaceAsset(entry.id, requestedVersion, asset.downloadUrl, asset.sha256);
    try {
      return await this.installFromPackagePath(downloadedPackagePath, {
        source: 'marketplace',
        enableByDefault: options.enableByDefault,
      });
    } finally {
      await fs.remove(downloadedPackagePath);
    }
  }

  async installFromLocalPath(
    filePath: string,
    options: { enableByDefault?: boolean } = {},
  ): Promise<InstalledPluginResult> {
    return await this.installFromPackagePath(filePath, {
      source: 'sideload',
      enableByDefault: options.enableByDefault,
    });
  }

  async uninstall(pluginId: string): Promise<void> {
    const record = await this.registryStore.get(pluginId);
    if (!record) {
      return;
    }

    await fs.remove(path.join(this.getPackagesDirectoryPath(), pluginId));
    await this.registryStore.remove(pluginId);
  }

  private async installFromPackagePath(
    packagePath: string,
    options: { source: PluginSource; enableByDefault?: boolean },
  ): Promise<InstalledPluginResult> {
    const stats = await fs.stat(packagePath);
    const extractedDirectoryPath = stats.isDirectory()
      ? packagePath
      : await this.extractPackageToTemporaryDirectory(packagePath);
    const pluginDirectoryPath = await this.resolvePluginDirectory(extractedDirectoryPath);

    try {
      return await this.installFromDirectory(pluginDirectoryPath, options);
    } finally {
      if (!stats.isDirectory()) {
        await fs.remove(extractedDirectoryPath);
      }
    }
  }

  private async installFromDirectory(
    directoryPath: string,
    options: { source: PluginSource; enableByDefault?: boolean },
  ): Promise<InstalledPluginResult> {
    const manifest = await this.manifestValidator.readFromDirectory(directoryPath);
    const currentRecord = await this.registryStore.get(manifest.id);
    const pluginInstallPath = path.join(this.getPackagesDirectoryPath(), manifest.id, manifest.version);
    const stagingPath = `${pluginInstallPath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;

    await fs.ensureDir(path.dirname(stagingPath));
    await fs.remove(stagingPath);
    await fs.copy(directoryPath, stagingPath, { overwrite: true, errorOnExist: false });
    await fs.remove(pluginInstallPath);
    await fs.move(stagingPath, pluginInstallPath, { overwrite: true });

    const record: InstalledPluginRecord = {
      source: options.source,
      installedVersion: manifest.version,
      installPath: pluginInstallPath,
      enabledByDefault: options.enableByDefault ?? currentRecord?.enabledByDefault ?? false,
      status: 'installed',
      lastCheckedAt: this.now(),
      lastKnownHealth: currentRecord?.lastKnownHealth ?? 'unknown',
    };

    await this.registryStore.upsert(manifest.id, record);
    return { manifest, record };
  }

  private async downloadMarketplaceAsset(
    pluginId: string,
    version: string,
    downloadUrl: string,
    expectedSha256: string,
  ): Promise<string> {
    const downloadDirectoryPath = this.getDownloadsDirectoryPath();
    await fs.ensureDir(downloadDirectoryPath);
    const targetPath = path.join(downloadDirectoryPath, `${sanitizeFileSegment(pluginId)}-${sanitizeFileSegment(version)}-${randomUUID()}.zip`);

    const normalizedUrl = normalizeOptionalString(downloadUrl);
    if (!normalizedUrl) {
      throw new Error(`Marketplace asset URL is invalid for plugin ${pluginId}`);
    }

    if (normalizedUrl.startsWith('file://')) {
      const localFilePath = decodeURIComponent(new URL(normalizedUrl).pathname);
      const fileBuffer = await fs.readFile(localFilePath);
      verifySha256(fileBuffer, expectedSha256, pluginId);
      await fs.writeFile(targetPath, fileBuffer);
      return targetPath;
    }

    const response = await this.fetchImpl(normalizedUrl, {
      headers: {
        accept: 'application/octet-stream',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to download plugin ${pluginId}: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    verifySha256(buffer, expectedSha256, pluginId);
    await fs.writeFile(targetPath, buffer);
    return targetPath;
  }

  private async extractPackageToTemporaryDirectory(packagePath: string): Promise<string> {
    const extension = path.extname(packagePath).toLowerCase();
    if (extension !== '.zip') {
      throw new Error('Plugin package must be a directory or a .zip archive');
    }

    const targetDirectoryPath = path.join(this.getDownloadsDirectoryPath(), `extract-${process.pid}-${Date.now()}-${randomUUID()}`);
    await fs.ensureDir(targetDirectoryPath);
    await extractZip(packagePath, { dir: targetDirectoryPath });
    return targetDirectoryPath;
  }

  private async resolvePluginDirectory(directoryPath: string): Promise<string> {
    if (await fs.pathExists(path.join(directoryPath, 'plugin.json'))) {
      return directoryPath;
    }

    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const childDirectories = entries.filter((entry) => entry.isDirectory());
    if (childDirectories.length !== 1) {
      throw new Error('Plugin package must contain plugin.json at the archive root or in a single top-level directory');
    }

    const nestedDirectoryPath = path.join(directoryPath, childDirectories[0].name);
    if (!await fs.pathExists(path.join(nestedDirectoryPath, 'plugin.json'))) {
      throw new Error('Plugin package must contain plugin.json at the archive root or in a single top-level directory');
    }

    return nestedDirectoryPath;
  }

  private getPackagesDirectoryPath(): string {
    return path.join(this.baseDir, 'packages');
  }

  private getDownloadsDirectoryPath(): string {
    return path.join(this.baseDir, 'downloads');
  }
}

function verifySha256(buffer: Buffer, expectedSha256: string, pluginId: string): void {
  const normalizedExpectedHash = normalizeOptionalString(expectedSha256)?.toLowerCase();
  if (!normalizedExpectedHash) {
    throw new Error(`Plugin ${pluginId} marketplace asset is missing a valid sha256 checksum`);
  }

  const actualHash = createHash('sha256').update(buffer).digest('hex');
  if (actualHash !== normalizedExpectedHash) {
    throw new Error(`Plugin ${pluginId} checksum verification failed`);
  }
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-');
}
