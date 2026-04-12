import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { once } from 'events';
import { fileURLToPath } from 'url';
import { ZipFile } from 'yazl';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const marketplaceRoot = path.join(repoRoot, 'plugin-marketplace');
const pluginsRoot = path.join(marketplaceRoot, 'plugins');
const packagesRoot = path.join(marketplaceRoot, 'packages');
const catalogPath = path.join(marketplaceRoot, 'catalog.json');
const platformMatrix = [
  { os: 'darwin', arch: 'x64' },
  { os: 'darwin', arch: 'arm64' },
  { os: 'linux', arch: 'x64' },
  { os: 'linux', arch: 'arm64' },
  { os: 'win32', arch: 'x64' },
  { os: 'win32', arch: 'arm64' },
];
const configuredBaseUrl = normalizeOptionalString(process.env.PLUGIN_MARKETPLACE_BASE_URL);

await fs.mkdir(packagesRoot, { recursive: true });

const pluginDirectoryEntries = (await fs.readdir(pluginsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));

const plugins = [];
for (const directoryEntry of pluginDirectoryEntries) {
  const pluginDirectoryPath = path.join(pluginsRoot, directoryEntry.name);
  const manifestPath = path.join(pluginDirectoryPath, 'plugin.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  validateManifest(manifest, manifestPath);

  const packageFileName = `${manifest.id}-${manifest.version}.zip`;
  const packagePath = path.join(packagesRoot, packageFileName);
  await createZipFromDirectory(pluginDirectoryPath, packagePath);

  const packageBuffer = await fs.readFile(packagePath);
  const sha256 = createHash('sha256').update(packageBuffer).digest('hex');
  const downloadUrl = configuredBaseUrl
    ? new URL(packageFileName, ensureTrailingSlash(configuredBaseUrl)).href
    : posixJoin('packages', packageFileName);

  plugins.push({
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
      sha256,
      size: packageBuffer.byteLength,
    })),
  });
}

await fs.writeFile(catalogPath, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  plugins,
}, null, 2)}\n`, 'utf8');

console.log(`Built ${plugins.length} marketplace plugin package(s).`);
console.log(`Catalog written to ${path.relative(repoRoot, catalogPath)}`);

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
