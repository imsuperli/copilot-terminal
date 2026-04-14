import { promises as fsPromises } from 'fs';
import path from 'path';
import fg from 'fast-glob';
import type {
  CodePaneExternalLibraryRoot,
  CodePaneExternalLibrarySection,
  CodePaneProjectCommand,
  CodePaneProjectContribution,
  CodePaneProjectDetailCard,
  CodePaneProjectStatusItem,
  CodePaneProjectTreeSection,
  CodePaneRunTargetKind,
} from '../../../../shared/types/electron-api';

export interface LanguageProjectCommandDefinition {
  id: string;
  title: string;
  detail?: string;
  languageId: string;
  kind?: CodePaneProjectCommand['kind'];
  runKind?: CodePaneRunTargetKind;
  actionType?: 'run' | 'refresh-model' | 'set-python-interpreter';
  interpreterPath?: string | null;
  command?: string;
  args?: string[];
  workingDirectory?: string;
}

export interface LanguageProjectCommandGroupDefinition {
  id: string;
  title: string;
  commands: LanguageProjectCommandDefinition[];
}

export interface LanguageProjectAdapter {
  readonly languageId: string;
  getExternalLibrarySection(workspaceRoot: string): Promise<CodePaneExternalLibrarySection | null>;
  getProjectContribution(workspaceRoot: string): Promise<CodePaneProjectContribution | null>;
  resolveProjectCommand(workspaceRoot: string, commandId: string): Promise<LanguageProjectCommandDefinition | null>;
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

export async function readTextFile(targetPath: string): Promise<string | null> {
  try {
    return await fsPromises.readFile(targetPath, 'utf8');
  } catch {
    return null;
  }
}

export const DEFAULT_WORKSPACE_IGNORE_PATTERNS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/target/**',
  '**/dist/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  '**/vendor/**',
];

export async function findWorkspaceFiles(
  workspaceRoot: string,
  patterns: string[],
  ignore: string[] = [],
): Promise<string[]> {
  return await fg(patterns, {
    cwd: workspaceRoot,
    absolute: true,
    onlyFiles: true,
    unique: true,
    ignore: [...DEFAULT_WORKSPACE_IGNORE_PATTERNS, ...ignore],
  });
}

export function formatWorkspaceRelativePath(workspaceRoot: string, targetPath: string): string {
  const relativePath = path.relative(workspaceRoot, targetPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return path.basename(targetPath);
  }

  return relativePath.split(path.sep).join('/');
}

export function createProjectContribution(
  id: string,
  languageId: string,
  title: string,
  options: {
    statusItems?: CodePaneProjectStatusItem[];
    commandGroups?: LanguageProjectCommandGroupDefinition[];
    detailCards?: CodePaneProjectDetailCard[];
    treeSections?: CodePaneProjectTreeSection[];
  },
): CodePaneProjectContribution {
  return {
    id,
    title,
    languageId,
    ...(options.statusItems && options.statusItems.length > 0 ? { statusItems: options.statusItems } : {}),
    ...(options.commandGroups && options.commandGroups.length > 0 ? {
      commandGroups: options.commandGroups.map((group) => ({
        id: group.id,
        title: group.title,
        commands: group.commands.map((command) => ({
          id: command.id,
          title: command.title,
          ...(command.detail ? { detail: command.detail } : {}),
          ...(command.kind ? { kind: command.kind } : {}),
        })),
      })),
    } : {}),
    ...(options.detailCards && options.detailCards.length > 0 ? { detailCards: options.detailCards } : {}),
    ...(options.treeSections && options.treeSections.length > 0 ? { treeSections: options.treeSections } : {}),
  };
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
