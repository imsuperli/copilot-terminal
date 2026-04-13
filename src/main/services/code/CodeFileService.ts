import path from 'path';
import { promises as fsPromises } from 'fs';
import type {
  CodePaneContentMatch,
  CodePaneListDirectoryConfig,
  CodePaneReadFileConfig,
  CodePaneReadFileResult,
  CodePaneSearchContentsConfig,
  CodePaneSearchFilesConfig,
  CodePaneTreeEntry,
  CodePaneWriteFileConfig,
  CodePaneWriteFileResult,
} from '../../../shared/types/electron-api';
import {
  CODE_PANE_BINARY_FILE_ERROR_CODE,
  CODE_PANE_FILE_TOO_LARGE_ERROR_CODE,
  CODE_PANE_SAVE_CONFLICT_ERROR_CODE,
} from '../../../shared/types/electron-api';
import { PathValidator } from '../../utils/pathValidator';
import { CodeProjectIndexService } from './CodeProjectIndexService';
import { CODE_PANE_IGNORED_DIRECTORY_NAMES } from './codePaneFsConstants';

const DEFAULT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_SEARCH_LIMIT = 100;
const MAX_SEARCH_LIMIT = 500;
const DEFAULT_CONTENT_MATCH_LIMIT = 200;
const DEFAULT_CONTENT_MATCHES_PER_FILE = 20;
type RootInfo = {
  rootPath: string;
  rootRealPath: string;
};

type AllowedPathResult = {
  resolvedPath: string;
  rootInfo: RootInfo;
};

type IPCErrorWithCode = Error & {
  ipcErrorCode?: string;
};

function createIpcError(message: string, errorCode: string): IPCErrorWithCode {
  const error = new Error(message) as IPCErrorWithCode;
  error.ipcErrorCode = errorCode;
  return error;
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const relativePath = path.relative(basePath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function detectLanguage(filePath: string): string {
  const baseName = path.basename(filePath).toLowerCase();
  const extension = path.extname(baseName).toLowerCase();

  if (baseName === 'dockerfile') return 'dockerfile';
  if (baseName === '.gitignore') return 'plaintext';
  if (baseName === '.env' || baseName.startsWith('.env.')) return 'shell';

  switch (extension) {
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'typescript';
    case '.js':
      return 'javascript';
    case '.jsx':
      return 'javascript';
    case '.json':
      return 'json';
    case '.css':
    case '.scss':
    case '.less':
      return 'css';
    case '.html':
    case '.htm':
      return 'html';
    case '.md':
      return 'markdown';
    case '.py':
      return 'python';
    case '.sh':
    case '.bash':
    case '.zsh':
      return 'shell';
    case '.yml':
    case '.yaml':
      return 'yaml';
    case '.xml':
      return 'xml';
    case '.java':
      return 'java';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.c':
      return 'c';
    case '.cc':
    case '.cpp':
    case '.cxx':
    case '.h':
    case '.hpp':
      return 'cpp';
    case '.php':
      return 'php';
    case '.sql':
      return 'sql';
    default:
      return 'plaintext';
  }
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

function compareSearchResults(rootPath: string, leftPath: string, rightPath: string, query: string): number {
  const getSearchTuple = (filePath: string) => {
    const relativePath = path.relative(rootPath, filePath).toLowerCase();
    const baseName = path.basename(filePath).toLowerCase();
    const extension = path.extname(baseName);
    const stem = extension ? baseName.slice(0, -extension.length) : baseName;
    const baseIndex = baseName.indexOf(query);
    const relativeIndex = relativePath.indexOf(query);
    const depth = relativePath.split(path.sep).length - 1;

    const tuple = [
      baseName === query ? 0 : 1,
      stem === query ? 0 : 1,
      stem.startsWith(query) ? 0 : 1,
      baseName.startsWith(query) ? 0 : 1,
      baseIndex === -1 ? Number.MAX_SAFE_INTEGER : baseIndex,
      relativeIndex === -1 ? Number.MAX_SAFE_INTEGER : relativeIndex,
      depth,
      baseName.length,
      relativePath.length,
    ] as const;

    return {
      relativePath,
      tuple,
    };
  };

  const leftSearchData = getSearchTuple(leftPath);
  const rightSearchData = getSearchTuple(rightPath);
  const leftTuple = leftSearchData.tuple;
  const rightTuple = rightSearchData.tuple;
  for (let index = 0; index < leftTuple.length - 1; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) {
      return Number(leftTuple[index]) - Number(rightTuple[index]);
    }
  }

  return leftSearchData.relativePath.localeCompare(
    rightSearchData.relativePath,
    undefined,
    { sensitivity: 'base' },
  );
}

function getClampedLimit(limit: number | undefined, fallbackLimit: number): number {
  return Math.max(1, Math.min(limit ?? fallbackLimit, MAX_SEARCH_LIMIT));
}

function trimSearchLine(lineText: string): string {
  const collapsed = lineText.replace(/\s+/g, ' ').trim();
  return collapsed.length > 240 ? `${collapsed.slice(0, 237)}...` : collapsed;
}

export class CodeFileService {
  constructor(
    private readonly projectIndexService: CodeProjectIndexService | null = null,
  ) {}

  async listDirectory(config: CodePaneListDirectoryConfig): Promise<CodePaneTreeEntry[]> {
    if (this.projectIndexService) {
      return await this.projectIndexService.listDirectory(config);
    }

    const rootInfo = await this.resolveRoot(config.rootPath);
    const targetPath = config.targetPath ?? rootInfo.rootPath;
    const resolvedTargetPath = await this.resolveExistingPath(rootInfo, targetPath, 'directory');
    const results = await this.readDirectoryEntries(
      resolvedTargetPath,
      config.includeHidden ?? false,
    );

    return sortTreeEntries(results);
  }

  async readFile(config: CodePaneReadFileConfig): Promise<CodePaneReadFileResult> {
    const rootInfo = await this.resolveRoot(config.rootPath);
    const filePath = await this.resolveExistingPath(rootInfo, config.filePath, 'file');
    return await this.readValidatedFile(filePath);
  }

  async listDirectoryFromAllowedRoots(config: {
    allowedRootPaths: string[];
    targetPath: string;
    includeHidden?: boolean;
  }): Promise<CodePaneTreeEntry[]> {
    const rootInfos = await this.resolveAllowedRoots(config.allowedRootPaths);
    const { resolvedPath } = await this.resolveExistingPathWithinRoots(rootInfos, config.targetPath, 'directory');
    const results = await this.readDirectoryEntries(
      resolvedPath,
      config.includeHidden ?? false,
    );

    return sortTreeEntries(results);
  }

  async readFileFromAllowedRoots(config: {
    allowedRootPaths: string[];
    filePath: string;
  }): Promise<CodePaneReadFileResult> {
    const rootInfos = await this.resolveAllowedRoots(config.allowedRootPaths);
    const { resolvedPath } = await this.resolveExistingPathWithinRoots(rootInfos, config.filePath, 'file');
    return await this.readValidatedFile(resolvedPath);
  }

  async writeFile(config: CodePaneWriteFileConfig): Promise<CodePaneWriteFileResult> {
    const rootInfo = await this.resolveRoot(config.rootPath);
    const filePath = await this.resolveWritablePath(rootInfo, config.filePath);

    let existingStats: Awaited<ReturnType<typeof fsPromises.stat>> | null = null;
    try {
      existingStats = await fsPromises.stat(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    if (config.expectedMtimeMs !== undefined && existingStats && existingStats.mtimeMs !== config.expectedMtimeMs) {
      throw createIpcError('File changed on disk before save completed', CODE_PANE_SAVE_CONFLICT_ERROR_CODE);
    }

    await fsPromises.writeFile(filePath, config.content, 'utf-8');
    const updatedStats = await fsPromises.stat(filePath);

    return {
      mtimeMs: updatedStats.mtimeMs,
    };
  }

  async searchFiles(config: CodePaneSearchFilesConfig): Promise<string[]> {
    if (this.projectIndexService) {
      return await this.projectIndexService.searchFiles(config);
    }

    const rootInfo = await this.resolveRoot(config.rootPath);
    const limit = getClampedLimit(config.limit, DEFAULT_SEARCH_LIMIT);
    const query = config.query.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const results: string[] = [];
    const stack: string[] = [rootInfo.rootPath];

    while (stack.length > 0 && results.length < limit) {
      const directoryPath = stack.pop();
      if (!directoryPath) {
        continue;
      }

      const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) {
          continue;
        }

        const entryPath = path.join(directoryPath, entry.name);
        const stats = await fsPromises.lstat(entryPath);
        if (stats.isSymbolicLink()) {
          continue;
        }

        if (stats.isDirectory()) {
          if (!CODE_PANE_IGNORED_DIRECTORY_NAMES.has(entry.name)) {
            stack.push(entryPath);
          }
          continue;
        }

        if (!stats.isFile()) {
          continue;
        }

        const relativePath = path.relative(rootInfo.rootPath, entryPath).toLowerCase();
        if (entry.name.toLowerCase().includes(query) || relativePath.includes(query)) {
          results.push(entryPath);
          if (results.length >= limit) {
            break;
          }
        }
      }
    }

    return results.sort((left, right) => compareSearchResults(rootInfo.rootPath, left, right, query));
  }

  async searchContents(config: CodePaneSearchContentsConfig): Promise<CodePaneContentMatch[]> {
    const rootInfo = await this.resolveRoot(config.rootPath);
    const limit = getClampedLimit(config.limit, DEFAULT_CONTENT_MATCH_LIMIT);
    const maxMatchesPerFile = getClampedLimit(
      config.maxMatchesPerFile,
      DEFAULT_CONTENT_MATCHES_PER_FILE,
    );
    const query = config.query.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const matches: CodePaneContentMatch[] = [];
    const stack: string[] = [rootInfo.rootPath];

    while (stack.length > 0 && matches.length < limit) {
      const directoryPath = stack.pop();
      if (!directoryPath) {
        continue;
      }

      const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) {
          continue;
        }

        const entryPath = path.join(directoryPath, entry.name);
        const stats = await fsPromises.lstat(entryPath);
        if (stats.isSymbolicLink()) {
          continue;
        }

        if (stats.isDirectory()) {
          if (!CODE_PANE_IGNORED_DIRECTORY_NAMES.has(entry.name)) {
            stack.push(entryPath);
          }
          continue;
        }

        if (!stats.isFile() || stats.size > DEFAULT_MAX_FILE_SIZE_BYTES) {
          continue;
        }

        const buffer = await fsPromises.readFile(entryPath);
        if (looksBinary(buffer)) {
          continue;
        }

        const lines = buffer.toString('utf-8').split(/\r?\n/);
        let fileMatchCount = 0;

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          const lineText = lines[lineIndex] ?? '';
          let searchOffset = 0;
          const lowerLineText = lineText.toLowerCase();

          while (searchOffset < lowerLineText.length) {
            const matchIndex = lowerLineText.indexOf(query, searchOffset);
            if (matchIndex === -1) {
              break;
            }

            matches.push({
              filePath: entryPath,
              lineNumber: lineIndex + 1,
              column: matchIndex + 1,
              lineText: trimSearchLine(lineText),
            });

            fileMatchCount += 1;
            if (matches.length >= limit || fileMatchCount >= maxMatchesPerFile) {
              break;
            }

            searchOffset = matchIndex + Math.max(query.length, 1);
          }

          if (matches.length >= limit || fileMatchCount >= maxMatchesPerFile) {
            break;
          }
        }

        if (matches.length >= limit) {
          break;
        }
      }
    }

    return matches.sort((left, right) => {
      const pathComparison = compareSearchResults(rootInfo.rootPath, left.filePath, right.filePath, query);
      if (pathComparison !== 0) {
        return pathComparison;
      }

      if (left.lineNumber !== right.lineNumber) {
        return left.lineNumber - right.lineNumber;
      }

      return left.column - right.column;
    });
  }

  private async resolveRoot(rootPath: string): Promise<RootInfo> {
    const expandedRootPath = path.resolve(PathValidator.expandHomePath(rootPath));
    const validation = PathValidator.validate(expandedRootPath);
    if (!validation.valid) {
      throw new Error(`Invalid code pane root path: ${validation.reason ?? 'unknown error'}`);
    }

    return {
      rootPath: expandedRootPath,
      rootRealPath: await fsPromises.realpath(expandedRootPath),
    };
  }

  private async resolveAllowedRoots(rootPaths: string[]): Promise<RootInfo[]> {
    const uniqueRootPaths = Array.from(new Set(
      rootPaths.map((rootPath) => path.resolve(PathValidator.expandHomePath(rootPath))),
    ));
    return await Promise.all(uniqueRootPaths.map(async (rootPath) => await this.resolveRoot(rootPath)));
  }

  private async resolveExistingPath(
    rootInfo: RootInfo,
    targetPath: string,
    expectedType: 'file' | 'directory',
  ): Promise<string> {
    const resolvedPath = path.resolve(targetPath);
    if (!path.isAbsolute(targetPath) || !isPathWithin(rootInfo.rootPath, resolvedPath)) {
      throw new Error('Target path is outside the code pane root');
    }

    const stats = await fsPromises.lstat(resolvedPath);
    if (stats.isSymbolicLink()) {
      throw new Error('Symbolic links are not supported in the code pane');
    }

    if (expectedType === 'file' && !stats.isFile()) {
      throw new Error('Target path is not a file');
    }

    if (expectedType === 'directory' && !stats.isDirectory()) {
      throw new Error('Target path is not a directory');
    }

    const realPath = await fsPromises.realpath(resolvedPath);
    if (!isPathWithin(rootInfo.rootRealPath, realPath)) {
      throw new Error('Target path resolves outside the code pane root');
    }

    return resolvedPath;
  }

  private async resolveExistingPathWithinRoots(
    rootInfos: RootInfo[],
    targetPath: string,
    expectedType: 'file' | 'directory',
  ): Promise<AllowedPathResult> {
    const resolvedPath = path.resolve(targetPath);
    if (!path.isAbsolute(targetPath)) {
      throw new Error('Target path is outside the allowed code pane roots');
    }

    const stats = await fsPromises.lstat(resolvedPath);
    if (stats.isSymbolicLink()) {
      throw new Error('Symbolic links are not supported in the code pane');
    }

    if (expectedType === 'file' && !stats.isFile()) {
      throw new Error('Target path is not a file');
    }

    if (expectedType === 'directory' && !stats.isDirectory()) {
      throw new Error('Target path is not a directory');
    }

    const realPath = await fsPromises.realpath(resolvedPath);
    const matchedRootInfo = rootInfos.find((rootInfo) => (
      isPathWithin(rootInfo.rootPath, resolvedPath)
      && isPathWithin(rootInfo.rootRealPath, realPath)
    ));

    if (!matchedRootInfo) {
      throw new Error('Target path is outside the allowed code pane roots');
    }

    return {
      resolvedPath,
      rootInfo: matchedRootInfo,
    };
  }

  private async resolveWritablePath(rootInfo: RootInfo, targetPath: string): Promise<string> {
    const resolvedPath = path.resolve(targetPath);
    if (!path.isAbsolute(targetPath) || !isPathWithin(rootInfo.rootPath, resolvedPath)) {
      throw new Error('Target path is outside the code pane root');
    }

    const parentPath = path.dirname(resolvedPath);
    const parentStats = await fsPromises.lstat(parentPath);
    if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
      throw new Error('Target parent path is not a writable directory');
    }

    const parentRealPath = await fsPromises.realpath(parentPath);
    if (!isPathWithin(rootInfo.rootRealPath, parentRealPath)) {
      throw new Error('Target path resolves outside the code pane root');
    }

    return resolvedPath;
  }

  private async readValidatedFile(filePath: string): Promise<CodePaneReadFileResult> {
    const stats = await fsPromises.stat(filePath);

    if (stats.size > DEFAULT_MAX_FILE_SIZE_BYTES) {
      throw createIpcError('File is too large to open in the code pane', CODE_PANE_FILE_TOO_LARGE_ERROR_CODE);
    }

    const buffer = await fsPromises.readFile(filePath);
    if (looksBinary(buffer)) {
      throw createIpcError('Binary files are not supported in the code pane', CODE_PANE_BINARY_FILE_ERROR_CODE);
    }

    return {
      content: buffer.toString('utf-8'),
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      language: detectLanguage(filePath),
      isBinary: false,
    };
  }

  private async readDirectoryEntries(
    directoryPath: string,
    includeHidden: boolean,
  ): Promise<CodePaneTreeEntry[]> {
    const directoryEntries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
    const entryResults = await Promise.all(directoryEntries.map(async (entry): Promise<CodePaneTreeEntry | null> => {
      if (!includeHidden && entry.name.startsWith('.')) {
        return null;
      }

      if (entry.isDirectory() && CODE_PANE_IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        return null;
      }

      if (entry.isSymbolicLink()) {
        return null;
      }

      if (!entry.isDirectory() && !entry.isFile()) {
        return null;
      }

      const entryPath = path.join(directoryPath, entry.name);
      const stats = await fsPromises.stat(entryPath);
      return {
        path: entryPath,
        name: entry.name,
        type: entry.isDirectory() ? 'directory' as const : 'file' as const,
        size: entry.isFile() ? stats.size : undefined,
        mtimeMs: stats.mtimeMs,
        hasChildren: entry.isDirectory() ? true : undefined,
      };
    }));

    return entryResults.filter((entry): entry is CodePaneTreeEntry => entry !== null);
  }
}

function sortTreeEntries(entries: CodePaneTreeEntry[]): CodePaneTreeEntry[] {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}
