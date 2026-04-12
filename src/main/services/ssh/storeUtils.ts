import fs from 'fs-extra';
import path from 'path';

interface JsonReadOptions {
  privateFile?: boolean;
}

export function resolveSSHDataFilePath(fileName: string, customPath?: string): string {
  if (customPath) {
    return customPath;
  }

  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), fileName);
}

export async function readJsonFileOrDefault<T>(filePath: string, fallback: T, options?: JsonReadOptions): Promise<T> {
  if (!await fs.pathExists(filePath)) {
    return fallback;
  }

  try {
    return await fs.readJson(filePath) as T;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    const raw = await fs.readFile(filePath, 'utf8');
    const recovered = tryRecoverJsonDocument<T>(raw) ?? fallback;
    const backupPath = await backupCorruptedJsonFile(filePath, raw, options);

    console.warn(`[StoreUtils] Recovered corrupted JSON file at ${filePath}${backupPath ? ` (backup: ${backupPath})` : ''}`);
    await writeJsonFileAtomic(filePath, recovered, { privateFile: options?.privateFile });
    return recovered;
  }
}

export async function writeJsonFileAtomic(
  filePath: string,
  payload: unknown,
  options?: { privateFile?: boolean },
): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(tempPath, payload, { spaces: 2 });
  await fs.rename(tempPath, filePath);

  if (options?.privateFile) {
    await ensurePrivateFilePermissions(filePath);
  }
}

export async function ensurePrivateFilePermissions(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }

  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // Best effort only. Lack of chmod support should not block the store.
  }
}

async function backupCorruptedJsonFile(
  filePath: string,
  rawContent: string,
  options?: JsonReadOptions,
): Promise<string | null> {
  try {
    const backupPath = `${filePath}.corrupt.${Date.now()}`;
    await fs.writeFile(backupPath, rawContent, 'utf8');
    if (options?.privateFile) {
      await ensurePrivateFilePermissions(backupPath);
    }
    return backupPath;
  } catch {
    return null;
  }
}

function tryRecoverJsonDocument<T>(rawContent: string): T | null {
  const documents = extractTopLevelJsonDocuments(rawContent);
  for (let index = documents.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(documents[index]) as T;
    } catch {
      continue;
    }
  }

  return null;
}

function extractTopLevelJsonDocuments(rawContent: string): string[] {
  const documents: string[] = [];
  const content = rawContent.trim();
  let index = 0;

  while (index < content.length) {
    while (index < content.length && /\s/.test(content[index])) {
      index += 1;
    }

    if (index >= content.length) {
      break;
    }

    if (content[index] !== '{' && content[index] !== '[') {
      break;
    }

    const startIndex = index;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let completed = false;

    for (; index < content.length; index += 1) {
      const character = content[index];

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
        } else if (character === '\\') {
          escapeNext = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
        continue;
      }

      if (character === '{' || character === '[') {
        depth += 1;
        continue;
      }

      if (character === '}' || character === ']') {
        depth -= 1;
        if (depth === 0) {
          documents.push(content.slice(startIndex, index + 1));
          index += 1;
          completed = true;
          break;
        }
      }
    }

    if (!completed) {
      break;
    }
  }

  return documents;
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function uniqueBy<T>(items: readonly T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

export function stripUndefinedProperties<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
