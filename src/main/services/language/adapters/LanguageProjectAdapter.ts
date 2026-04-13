import { promises as fsPromises } from 'fs';
import path from 'path';
import type {
  CodePaneExternalLibraryRoot,
  CodePaneExternalLibrarySection,
} from '../../../../shared/types/electron-api';

export interface LanguageProjectAdapter {
  readonly languageId: string;
  getExternalLibrarySection(workspaceRoot: string): Promise<CodePaneExternalLibrarySection | null>;
}

export function createExternalLibrarySection(
  id: string,
  languageId: string,
  roots: CodePaneExternalLibraryRoot[],
): CodePaneExternalLibrarySection | null {
  const deduplicatedRoots = deduplicateRoots(roots);
  if (deduplicatedRoots.length === 0) {
    return null;
  }

  return {
    id,
    label: 'External Libraries',
    languageId,
    roots: deduplicatedRoots,
  };
}

export function createExternalLibraryRoot(
  id: string,
  label: string,
  rootPath: string,
  description?: string,
): CodePaneExternalLibraryRoot {
  return {
    id,
    label,
    path: path.resolve(rootPath),
    ...(description ? { description } : {}),
  };
}

export async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    const stats = await fsPromises.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stats = await fsPromises.stat(targetPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function hasProjectIndicators(workspaceRoot: string, indicatorNames: string[]): Promise<boolean> {
  const checks = await Promise.all(indicatorNames.map(async (indicatorName) => (
    await directoryExists(path.join(workspaceRoot, indicatorName))
      || await fileExists(path.join(workspaceRoot, indicatorName))
  )));

  return checks.some(Boolean);
}

export async function hasTopLevelExtension(workspaceRoot: string, extension: string): Promise<boolean> {
  try {
    const entries = await fsPromises.readdir(workspaceRoot, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension.toLowerCase()));
  } catch {
    return false;
  }
}

export async function listDirectoryNames(directoryPath: string): Promise<string[]> {
  try {
    const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function deduplicateRoots(roots: CodePaneExternalLibraryRoot[]): CodePaneExternalLibraryRoot[] {
  const seenPaths = new Set<string>();
  const deduplicatedRoots: CodePaneExternalLibraryRoot[] = [];

  for (const root of roots) {
    const normalizedPath = normalizePath(root.path);
    if (!normalizedPath || seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    deduplicatedRoots.push({
      ...root,
      path: normalizedPath,
    });
  }

  return deduplicatedRoots;
}

function normalizePath(value: string): string {
  return path.resolve(value);
}
