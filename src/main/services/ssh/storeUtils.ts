import fs from 'fs-extra';
import path from 'path';

export function resolveSSHDataFilePath(fileName: string, customPath?: string): string {
  if (customPath) {
    return customPath;
  }

  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), fileName);
}

export async function readJsonFileOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  if (!await fs.pathExists(filePath)) {
    return fallback;
  }

  return await fs.readJson(filePath) as T;
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
