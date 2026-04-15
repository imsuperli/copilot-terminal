import path from 'path';
import { promises as fsPromises } from 'fs';
import * as yauzl from 'yauzl';
import type {
  CodePaneReadFileResult,
  CodePaneTreeEntry,
} from '../../../shared/types/electron-api';

const JAR_URI_PREFIX = 'jar://';
const JAR_URI_SEPARATOR = '!/';
const MAX_JAR_SOURCE_FILE_SIZE_BYTES = 2 * 1024 * 1024;

type JarEntryRecord = {
  name: string;
  isDirectory: boolean;
  uncompressedSize: number;
  mtimeMs: number;
};

type ParsedJarUri = {
  jarPath: string;
  entryPath: string;
};

export class ExternalJarService {
  private readonly entryCache = new Map<string, JarEntryRecord[]>();

  isJarUri(value: string): boolean {
    return value.startsWith(JAR_URI_PREFIX) && value.includes(JAR_URI_SEPARATOR);
  }

  isJarFilePath(value: string): boolean {
    return value.toLowerCase().endsWith('.jar');
  }

  createJarUri(jarPath: string, entryPath = ''): string {
    const normalizedEntryPath = normalizeJarEntryPath(entryPath);
    return `${JAR_URI_PREFIX}${encodeURIComponent(path.resolve(jarPath))}${JAR_URI_SEPARATOR}${encodeJarEntryPath(normalizedEntryPath)}`;
  }

  parseJarUri(value: string): ParsedJarUri | null {
    if (!this.isJarUri(value)) {
      return null;
    }

    const withoutPrefix = value.slice(JAR_URI_PREFIX.length);
    const separatorIndex = withoutPrefix.indexOf(JAR_URI_SEPARATOR);
    if (separatorIndex < 0) {
      return null;
    }

    const encodedJarPath = withoutPrefix.slice(0, separatorIndex);
    const encodedEntryPath = withoutPrefix.slice(separatorIndex + JAR_URI_SEPARATOR.length);
    const jarPath = path.resolve(decodeURIComponent(encodedJarPath));
    const entryPath = normalizeJarEntryPath(decodeJarEntryPath(encodedEntryPath));

    return {
      jarPath,
      entryPath,
    };
  }

  getJarUriJarPath(value: string): string | null {
    return this.parseJarUri(value)?.jarPath ?? null;
  }

  async resolveBrowsableJarPath(jarPath: string): Promise<string> {
    const sourceJarPath = await resolveSourceJarPath(jarPath);
    return sourceJarPath ?? jarPath;
  }

  async listJarDirectory(jarUri: string): Promise<CodePaneTreeEntry[]> {
    const parsedUri = this.parseJarUri(jarUri);
    if (!parsedUri) {
      throw new Error(`Invalid jar URI: ${jarUri}`);
    }

    await assertJarFile(parsedUri.jarPath);
    const entries = await this.getJarEntries(parsedUri.jarPath);
    const normalizedDirectoryPath = normalizeJarEntryPath(parsedUri.entryPath);
    const directoryPrefix = normalizedDirectoryPath ? `${normalizedDirectoryPath}/` : '';
    const childEntries = new Map<string, CodePaneTreeEntry>();

    for (const entry of entries) {
      const entryName = normalizeJarEntryPath(entry.name);
      if (!entryName || entryName === normalizedDirectoryPath || !entryName.startsWith(directoryPrefix)) {
        continue;
      }

      const remainingPath = entryName.slice(directoryPrefix.length);
      const [childName] = remainingPath.split('/');
      if (!childName || childName === 'META-INF') {
        continue;
      }

      const childEntryPath = directoryPrefix ? `${directoryPrefix}${childName}` : childName;
      const isDirectory = remainingPath.includes('/') || entry.isDirectory;
      const existingEntry = childEntries.get(childName);
      if (existingEntry?.type === 'directory') {
        continue;
      }

      childEntries.set(childName, {
        path: this.createJarUri(parsedUri.jarPath, childEntryPath),
        name: childName,
        type: isDirectory ? 'directory' : 'file',
        size: isDirectory ? undefined : entry.uncompressedSize,
        mtimeMs: entry.mtimeMs,
        hasChildren: isDirectory ? true : undefined,
      });
    }

    return sortTreeEntries(Array.from(childEntries.values()));
  }

  async readJarFile(jarUri: string): Promise<CodePaneReadFileResult> {
    const parsedUri = this.parseJarUri(jarUri);
    if (!parsedUri || !parsedUri.entryPath) {
      throw new Error(`Invalid jar file URI: ${jarUri}`);
    }

    await assertJarFile(parsedUri.jarPath);
    const entries = await this.getJarEntries(parsedUri.jarPath);
    const entry = entries.find((candidate) => (
      !candidate.isDirectory && normalizeJarEntryPath(candidate.name) === parsedUri.entryPath
    ));
    if (!entry) {
      throw new Error(`Jar entry not found: ${parsedUri.entryPath}`);
    }
    if (entry.uncompressedSize > MAX_JAR_SOURCE_FILE_SIZE_BYTES) {
      throw new Error('Jar entry is too large to open in the code pane');
    }
    if (isBinaryJarEntry(entry.name)) {
      throw new Error('Binary jar entries are not supported in the code pane');
    }

    const buffer = await this.readJarEntryBuffer(parsedUri.jarPath, entry.name);
    if (looksBinary(buffer)) {
      throw new Error('Binary jar entries are not supported in the code pane');
    }

    return {
      content: buffer.toString('utf-8'),
      mtimeMs: entry.mtimeMs,
      size: buffer.byteLength,
      language: detectJarEntryLanguage(entry.name),
      isBinary: false,
      readOnly: true,
      documentUri: jarUri,
      displayPath: getJarDisplayPath(parsedUri.jarPath, entry.name),
    };
  }

  private async getJarEntries(jarPath: string): Promise<JarEntryRecord[]> {
    const stats = await fsPromises.stat(jarPath);
    const cacheKey = `${path.resolve(jarPath)}:${stats.mtimeMs}:${stats.size}`;
    const cachedEntries = this.entryCache.get(cacheKey);
    if (cachedEntries) {
      return cachedEntries;
    }

    const entries = await readJarEntries(jarPath);
    this.entryCache.clear();
    this.entryCache.set(cacheKey, entries);
    return entries;
  }

  private async readJarEntryBuffer(jarPath: string, entryName: string): Promise<Buffer> {
    return await withOpenZipFile(jarPath, async (zipFile) => (
      await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];

        const handleEntry = (entry: yauzl.Entry) => {
          if (normalizeJarEntryPath(entry.fileName) !== normalizeJarEntryPath(entryName)) {
            zipFile.readEntry();
            return;
          }

          zipFile.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              reject(error ?? new Error(`Unable to read jar entry: ${entryName}`));
              return;
            }

            stream.on('data', (chunk) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            stream.on('error', reject);
            stream.on('end', () => {
              resolve(Buffer.concat(chunks));
            });
          });
        };

        zipFile.on('entry', handleEntry);
        zipFile.on('end', () => {
          reject(new Error(`Jar entry not found: ${entryName}`));
        });
        zipFile.on('error', reject);
        zipFile.readEntry();
      })
    ));
  }
}

async function resolveSourceJarPath(jarPath: string): Promise<string | null> {
  if (jarPath.toLowerCase().endsWith('-sources.jar')) {
    return jarPath;
  }

  const parsedPath = path.parse(jarPath);
  const sourceJarPath = path.join(parsedPath.dir, `${parsedPath.name}-sources.jar`);
  try {
    const stats = await fsPromises.stat(sourceJarPath);
    return stats.isFile() ? sourceJarPath : null;
  } catch {
    return null;
  }
}

async function assertJarFile(jarPath: string): Promise<void> {
  const stats = await fsPromises.stat(jarPath);
  if (!stats.isFile() || !jarPath.toLowerCase().endsWith('.jar')) {
    throw new Error(`Not a jar file: ${jarPath}`);
  }
}

async function readJarEntries(jarPath: string): Promise<JarEntryRecord[]> {
  return await withOpenZipFile(jarPath, async (zipFile) => (
    await new Promise<JarEntryRecord[]>((resolve, reject) => {
      const entries: JarEntryRecord[] = [];

      zipFile.on('entry', (entry) => {
        entries.push({
          name: entry.fileName,
          isDirectory: entry.fileName.endsWith('/'),
          uncompressedSize: entry.uncompressedSize,
          mtimeMs: entry.getLastModDate().getTime(),
        });
        zipFile.readEntry();
      });
      zipFile.on('end', () => {
        resolve(entries);
      });
      zipFile.on('error', reject);
      zipFile.readEntry();
    })
  ));
}

async function withOpenZipFile<T>(
  jarPath: string,
  callback: (zipFile: yauzl.ZipFile) => Promise<T>,
): Promise<T> {
  const zipFile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(jarPath, { lazyEntries: true, autoClose: false }, (error, openedZipFile) => {
      if (error || !openedZipFile) {
        reject(error ?? new Error(`Unable to open jar: ${jarPath}`));
        return;
      }

      resolve(openedZipFile);
    });
  });

  try {
    return await callback(zipFile);
  } finally {
    zipFile.close();
  }
}

function normalizeJarEntryPath(entryPath: string): string {
  return entryPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function encodeJarEntryPath(entryPath: string): string {
  return normalizeJarEntryPath(entryPath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function decodeJarEntryPath(entryPath: string): string {
  return entryPath
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

function getJarDisplayPath(jarPath: string, entryName: string): string {
  return path.posix.join(
    'External Libraries',
    path.basename(jarPath),
    normalizeJarEntryPath(entryName),
  );
}

function detectJarEntryLanguage(entryName: string): string {
  const extension = path.posix.extname(entryName).toLowerCase();
  switch (extension) {
    case '.java':
      return 'java';
    case '.kt':
      return 'kotlin';
    case '.xml':
      return 'xml';
    case '.properties':
      return 'properties';
    case '.json':
      return 'json';
    case '.yml':
    case '.yaml':
      return 'yaml';
    case '.md':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

function isBinaryJarEntry(entryName: string): boolean {
  const extension = path.posix.extname(entryName).toLowerCase();
  return new Set([
    '.class',
    '.jar',
    '.zip',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.so',
    '.dll',
    '.dylib',
  ]).has(extension);
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === 0) {
      return true;
    }
  }

  return false;
}

function sortTreeEntries(entries: CodePaneTreeEntry[]): CodePaneTreeEntry[] {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}
