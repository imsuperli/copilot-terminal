import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import fs from 'fs/promises';
import { once } from 'events';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import extractZip from 'extract-zip';
import { ZipFile } from 'yazl';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const marketplaceRoot = path.join(repoRoot, 'plugin-marketplace');
const pluginsRoot = path.join(marketplaceRoot, 'plugins');
const releaseRoot = path.join(repoRoot, 'release', 'plugin-marketplace');
const packagesRoot = path.join(releaseRoot, 'packages');
const tempRoot = path.join(releaseRoot, '.tmp');
const cacheRoot = path.join(repoRoot, '.npm-cache', 'plugin-marketplace-release');
const cacheDownloadsRoot = path.join(cacheRoot, 'downloads');
const cacheExtractRoot = path.join(cacheRoot, 'extract');
const catalogPath = path.join(releaseRoot, 'catalog.json');
const metadataPath = path.join(releaseRoot, 'sources.json');
const configuredBaseUrl = normalizeOptionalString(process.env.PLUGIN_MARKETPLACE_BASE_URL);
const jdtlsDownloadUrl = normalizeOptionalString(process.env.JDTLS_DOWNLOAD_URL)
  ?? 'https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz';
const refreshLatestUpstreams = process.env.PLUGIN_MARKETPLACE_REFRESH_LATEST === '1';
const SEGMENTED_DOWNLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;
const SEGMENTED_DOWNLOAD_MAX_PARTS = 8;
const SEGMENTED_DOWNLOAD_MIN_PART_SIZE = 2 * 1024 * 1024;

const platformMatrix = [
  { os: 'darwin', arch: 'x64' },
  { os: 'darwin', arch: 'arm64' },
  { os: 'linux', arch: 'x64' },
  { os: 'linux', arch: 'arm64' },
  { os: 'win32', arch: 'x64' },
  { os: 'win32', arch: 'arm64' },
];

await fs.rm(releaseRoot, { recursive: true, force: true });
await fs.mkdir(packagesRoot, { recursive: true });
await fs.mkdir(tempRoot, { recursive: true });
await fs.mkdir(cacheDownloadsRoot, { recursive: true });
await fs.mkdir(cacheExtractRoot, { recursive: true });

const pluginDirectoryEntries = (await fs.readdir(pluginsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));

const manifestsById = new Map();
for (const directoryEntry of pluginDirectoryEntries) {
  const pluginDirectoryPath = path.join(pluginsRoot, directoryEntry.name);
  const manifestPath = path.join(pluginDirectoryPath, 'plugin.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  validateManifest(manifest, manifestPath);
  manifestsById.set(manifest.id, {
    manifest,
    directoryPath: pluginDirectoryPath,
  });
}

const catalogPlugins = [];
const sources = [];

const pyrightSource = manifestsById.get('official.python-pyright');
if (!pyrightSource) {
  throw new Error('Missing official.python-pyright plugin source');
}

const pyrightBuild = await buildPyrightRelease(pyrightSource.directoryPath, pyrightSource.manifest);
catalogPlugins.push(pyrightBuild.catalogEntry);
sources.push(pyrightBuild.sourceMetadata);

const javaSource = manifestsById.get('official.java-jdtls');
if (!javaSource) {
  throw new Error('Missing official.java-jdtls plugin source');
}

const javaBuild = await buildJavaRelease(javaSource.directoryPath, javaSource.manifest);
catalogPlugins.push(javaBuild.catalogEntry);
sources.push(javaBuild.sourceMetadata);

await fs.writeFile(catalogPath, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  plugins: catalogPlugins.sort((left, right) => left.name.localeCompare(right.name) || left.publisher.localeCompare(right.publisher)),
}, null, 2)}\n`, 'utf8');

await fs.writeFile(metadataPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  sources,
}, null, 2)}\n`, 'utf8');

console.log(`Built ${catalogPlugins.length} release marketplace plugin package(s).`);
console.log(`Catalog written to ${path.relative(repoRoot, catalogPath)}`);
console.log(`Source metadata written to ${path.relative(repoRoot, metadataPath)}`);

async function buildPyrightRelease(pluginDirectoryPath, manifest) {
  const latest = await fetchJson('https://registry.npmjs.org/pyright/latest');
  const version = requireNonEmptyString(latest.version, 'Pyright version');
  const tarballUrl = requireNonEmptyString(latest.dist?.tarball, 'Pyright dist.tarball');
  const integrity = normalizeOptionalString(latest.dist?.integrity);
  const archivePath = path.join(cacheDownloadsRoot, `pyright-${version}.tgz`);
  const pyrightArchive = await downloadFile({
    url: tarballUrl,
    targetPath: archivePath,
    expectedIntegrity: integrity,
  });
  const extractDirectoryPath = path.join(cacheExtractRoot, `pyright-${version}`);
  await extractArchiveIfNeeded({
    archivePath,
    targetDirectoryPath: extractDirectoryPath,
  });

  const stageDirectoryPath = path.join(tempRoot, `${manifest.id}-stage`);
  await prepareStageDirectory(pluginDirectoryPath, stageDirectoryPath);
  await fs.mkdir(path.join(stageDirectoryPath, 'vendor', 'pyright'), { recursive: true });
  await fs.cp(
    path.join(extractDirectoryPath, 'package'),
    path.join(stageDirectoryPath, 'vendor', 'pyright', 'package'),
    { recursive: true },
  );

  const packageFileName = `${manifest.id}-${manifest.version}.zip`;
  const packagePath = path.join(packagesRoot, packageFileName);
  await createZipFromDirectory(stageDirectoryPath, packagePath);
  const packageSha256 = await sha256OfFile(packagePath);
  const packageStats = await fs.stat(packagePath);
  const downloadUrl = configuredBaseUrl
    ? new URL(packageFileName, ensureTrailingSlash(configuredBaseUrl)).href
    : posixJoin('packages', packageFileName);

  return {
    catalogEntry: {
      id: manifest.id,
      name: manifest.name,
      publisher: manifest.publisher,
      latestVersion: manifest.version,
      ...(manifest.description ? { summary: manifest.description } : {}),
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
      ...(manifest.license ? { license: manifest.license } : {}),
      ...(manifest.categories?.length ? { categories: manifest.categories } : {}),
      ...(manifest.tags?.length ? { tags: manifest.tags } : {}),
      ...(getManifestLanguages(manifest).length ? { languages: getManifestLanguages(manifest) } : {}),
      platforms: platformMatrix.map((platform) => ({
        ...platform,
        downloadUrl,
        sha256: packageSha256,
        size: packageStats.size,
      })),
    },
    sourceMetadata: {
      pluginId: manifest.id,
      pluginVersion: manifest.version,
      sources: [
        {
          type: 'npm',
          packageName: 'pyright',
          version,
          tarballUrl,
          integrity,
          archiveSha256: pyrightArchive.sha256,
        },
      ],
      packages: [
        {
          fileName: packageFileName,
          sha256: packageSha256,
          size: packageStats.size,
          platforms: platformMatrix,
        },
      ],
    },
  };
}

async function buildJavaRelease(pluginDirectoryPath, manifest) {
  const jdtlsArchivePath = path.join(cacheDownloadsRoot, 'jdt-language-server-latest.tar.gz');
  const jdtlsArchive = await downloadFile({
    url: jdtlsDownloadUrl,
    targetPath: jdtlsArchivePath,
    refresh: refreshLatestUpstreams,
  });
  const jdtlsExtractDirectoryPath = path.join(cacheExtractRoot, `jdtls-${jdtlsArchive.sha256.slice(0, 12)}`);
  await extractArchiveIfNeeded({
    archivePath: jdtlsArchivePath,
    targetDirectoryPath: jdtlsExtractDirectoryPath,
  });

  const baseSourceArtifacts = [
    {
      type: 'http',
      name: 'eclipse-jdtls',
      url: jdtlsDownloadUrl,
      archiveSha256: jdtlsArchive.sha256,
      lastModified: jdtlsArchive.lastModified,
      etag: jdtlsArchive.etag,
    },
  ];

  const stageDirectoryPath = path.join(tempRoot, `${manifest.id}-stage`);
  await prepareStageDirectory(pluginDirectoryPath, stageDirectoryPath);
  await fs.mkdir(path.join(stageDirectoryPath, 'vendor'), { recursive: true });
  await fs.cp(jdtlsExtractDirectoryPath, path.join(stageDirectoryPath, 'vendor', 'jdtls'), { recursive: true });

  const packageFileName = `${manifest.id}-${manifest.version}.zip`;
  const packagePath = path.join(packagesRoot, packageFileName);
  await createZipFromDirectory(stageDirectoryPath, packagePath);
  const packageSha256 = await sha256OfFile(packagePath);
  const packageStats = await fs.stat(packagePath);
  const downloadUrl = configuredBaseUrl
    ? new URL(packageFileName, ensureTrailingSlash(configuredBaseUrl)).href
    : posixJoin('packages', packageFileName);

  return {
    catalogEntry: {
      id: manifest.id,
      name: manifest.name,
      publisher: manifest.publisher,
      latestVersion: manifest.version,
      ...(manifest.description ? { summary: manifest.description } : {}),
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
      ...(manifest.license ? { license: manifest.license } : {}),
      ...(manifest.categories?.length ? { categories: manifest.categories } : {}),
      ...(manifest.tags?.length ? { tags: manifest.tags } : {}),
      ...(getManifestLanguages(manifest).length ? { languages: getManifestLanguages(manifest) } : {}),
      platforms: platformMatrix.map((platform) => ({
        ...platform,
        downloadUrl,
        sha256: packageSha256,
        size: packageStats.size,
      })),
    },
    sourceMetadata: {
      pluginId: manifest.id,
      pluginVersion: manifest.version,
      sources: baseSourceArtifacts,
      packages: [
        {
          fileName: packageFileName,
          sha256: packageSha256,
          size: packageStats.size,
          platforms: platformMatrix,
        },
      ],
    },
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function downloadFile({ url, targetPath, expectedSha256, expectedIntegrity, refresh = false }) {
  if (!refresh && await fileExists(targetPath)) {
    await verifyDownloadedFile(targetPath, { expectedSha256, expectedIntegrity });
    return await readDownloadedFileMetadata(targetPath);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const remoteMetadata = await probeRemoteFile(url);

  if (
    remoteMetadata?.acceptRanges
    && typeof remoteMetadata.size === 'number'
    && remoteMetadata.size >= SEGMENTED_DOWNLOAD_THRESHOLD_BYTES
  ) {
    try {
      await downloadFileInSegments({
        url,
        targetPath: tempPath,
        fileSize: remoteMetadata.size,
      });
    } catch {
      await fs.rm(tempPath, { force: true });
      await downloadFileSequentially(url, tempPath);
    }
  } else {
    await downloadFileSequentially(url, tempPath);
  }

  await fs.rename(tempPath, targetPath);
  await verifyDownloadedFile(targetPath, { expectedSha256, expectedIntegrity });

  const metadata = await readDownloadedFileMetadata(targetPath);
  metadata.lastModified = remoteMetadata?.lastModified ?? null;
  metadata.etag = remoteMetadata?.etag ?? null;
  return metadata;
}

async function verifyDownloadedFile(filePath, { expectedSha256, expectedIntegrity }) {
  const sha256 = await sha256OfFile(filePath);
  if (expectedSha256 && sha256 !== expectedSha256.toLowerCase()) {
    throw new Error(`Checksum verification failed for ${filePath}`);
  }

  if (expectedIntegrity) {
    const [algorithm, expectedBase64] = expectedIntegrity.split('-', 2);
    if (!algorithm || !expectedBase64) {
      throw new Error(`Unsupported integrity value: ${expectedIntegrity}`);
    }

    const actualDigest = await hashFile(filePath, algorithm);
    if (actualDigest !== expectedBase64) {
      throw new Error(`Integrity verification failed for ${filePath}`);
    }
  }
}

async function readDownloadedFileMetadata(filePath) {
  const stat = await fs.stat(filePath);
  return {
    path: filePath,
    size: stat.size,
    sha256: await sha256OfFile(filePath),
    lastModified: null,
    etag: null,
  };
}

async function extractArchiveIfNeeded({ archivePath, targetDirectoryPath }) {
  if (await fileExists(targetDirectoryPath)) {
    return;
  }

  await fs.rm(targetDirectoryPath, { recursive: true, force: true });
  await fs.mkdir(targetDirectoryPath, { recursive: true });

  if (archivePath.endsWith('.zip')) {
    await extractZip(archivePath, { dir: targetDirectoryPath });
    return;
  }

  if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    await execFileAsync('tar', ['-xzf', archivePath, '-C', targetDirectoryPath]);
    return;
  }

  throw new Error(`Unsupported archive format: ${archivePath}`);
}

async function probeRemoteFile(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      return null;
    }

    const contentLength = response.headers.get('content-length');
    return {
      size: contentLength ? Number.parseInt(contentLength, 10) : null,
      acceptRanges: normalizeOptionalString(response.headers.get('accept-ranges')) === 'bytes',
      lastModified: normalizeOptionalString(response.headers.get('last-modified')),
      etag: normalizeOptionalString(response.headers.get('etag')),
    };
  } catch {
    return null;
  }
}

async function downloadFileSequentially(url, targetPath) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/octet-stream',
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(targetPath),
  );
}

async function downloadFileInSegments({ url, targetPath, fileSize }) {
  const partCount = Math.max(
    2,
    Math.min(
      SEGMENTED_DOWNLOAD_MAX_PARTS,
      Math.ceil(fileSize / SEGMENTED_DOWNLOAD_MIN_PART_SIZE),
    ),
  );
  const partSize = Math.ceil(fileSize / partCount);
  const partPaths = Array.from({ length: partCount }, (_, index) => `${targetPath}.part${index}`);

  try {
    await Promise.all(partPaths.map(async (partPath, index) => {
      const start = index * partSize;
      const end = Math.min(fileSize - 1, ((index + 1) * partSize) - 1);
      if (start > end) {
        await fs.writeFile(partPath, '');
        return;
      }

      const response = await fetch(url, {
        headers: {
          accept: 'application/octet-stream',
          range: `bytes=${start}-${end}`,
        },
      });
      if (response.status !== 206 || !response.body) {
        throw new Error(`Range request failed for ${url}: ${response.status} ${response.statusText}`);
      }

      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(partPath),
      );
    }));

    await concatenateFiles(partPaths, targetPath);
  } finally {
    await Promise.all(partPaths.map(async (partPath) => {
      await fs.rm(partPath, { force: true });
    }));
  }
}

async function concatenateFiles(inputPaths, outputPath) {
  const outputStream = createWriteStream(outputPath);

  try {
    for (const inputPath of inputPaths) {
      await new Promise((resolve, reject) => {
        const inputStream = createReadStream(inputPath);
        inputStream.on('error', reject);
        outputStream.on('error', reject);
        inputStream.on('end', resolve);
        inputStream.pipe(outputStream, { end: false });
      });
    }
  } finally {
    outputStream.end();
  }

  await once(outputStream, 'close');
}

async function prepareStageDirectory(sourceDirectoryPath, stageDirectoryPath) {
  await fs.rm(stageDirectoryPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(stageDirectoryPath), { recursive: true });
  await fs.cp(sourceDirectoryPath, stageDirectoryPath, { recursive: true });
}

async function createZipFromDirectory(sourceDirectoryPath, targetZipPath) {
  await fs.rm(targetZipPath, { force: true });

  const zipFile = new ZipFile();
  const outputStream = createWriteStream(targetZipPath);
  zipFile.outputStream.pipe(outputStream);

  const files = await collectFiles(sourceDirectoryPath);
  for (const filePath of files) {
    zipFile.addFile(filePath, path.relative(sourceDirectoryPath, filePath).replaceAll(path.sep, '/'));
  }

  zipFile.end();
  await once(outputStream, 'close');
}

async function collectFiles(directoryPath) {
  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true });
  const filePaths = await Promise.all(directoryEntries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (directoryEntry) => {
      const entryPath = path.join(directoryPath, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        return await collectFiles(entryPath);
      }

      if (!directoryEntry.isFile()) {
        return [];
      }

      return [entryPath];
    }));

  return filePaths.flat();
}

async function sha256OfFile(filePath) {
  return await hashFile(filePath, 'sha256');
}

async function hashFile(filePath, algorithm) {
  const hash = createHash(algorithm);
  const handle = await fs.open(filePath, 'r');

  try {
    const stream = handle.createReadStream();
    for await (const chunk of stream) {
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }

  return hash.digest(algorithm === 'sha256' ? 'hex' : 'base64');
}

function getManifestLanguages(manifest) {
  return Array.from(new Set((manifest.capabilities ?? [])
    .flatMap((capability) => Array.isArray(capability.languages) ? capability.languages : [])))
    .sort((left, right) => left.localeCompare(right));
}

function validateManifest(manifest, manifestPath) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`Invalid plugin manifest at ${manifestPath}`);
  }

  for (const key of ['schemaVersion', 'id', 'name', 'publisher', 'version', 'engines', 'capabilities']) {
    if (manifest[key] === undefined || manifest[key] === null || manifest[key] === '') {
      throw new Error(`Plugin manifest ${manifestPath} is missing ${key}`);
    }
  }

  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    throw new Error(`Plugin manifest ${manifestPath} must declare at least one capability`);
  }
}

function requireNonEmptyString(value, fieldName) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function posixJoin(...segments) {
  return segments.join('/').replace(/\/+/g, '/');
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
