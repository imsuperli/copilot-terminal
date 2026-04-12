import path from 'path';
import { promises as fsPromises } from 'fs';
import type {
  CodePaneListDirectoryConfig,
  CodePaneReadFileConfig,
  CodePaneReadFileResult,
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

const DEFAULT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_SEARCH_LIMIT = 100;
const MAX_SEARCH_LIMIT = 500;
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
]);

type RootInfo = {
  rootPath: string;
  rootRealPath: string;
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

export class CodeFileService {
  async listDirectory(config: CodePaneListDirectoryConfig): Promise<CodePaneTreeEntry[]> {
    const rootInfo = await this.resolveRoot(config.rootPath);
    const targetPath = config.targetPath ?? rootInfo.rootPath;
    const resolvedTargetPath = await this.resolveExistingPath(rootInfo, targetPath, 'directory');
    const directoryEntries = await fsPromises.readdir(resolvedTargetPath, { withFileTypes: true });
    const includeHidden = config.includeHidden ?? false;

    const results: CodePaneTreeEntry[] = [];

    for (const entry of directoryEntries) {
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(resolvedTargetPath, entry.name);
      const stats = await fsPromises.lstat(entryPath);
      if (stats.isSymbolicLink()) {
        continue;
      }

      if (!stats.isFile() && !stats.isDirectory()) {
        continue;
      }

      results.push({
        path: entryPath,
        name: entry.name,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.isFile() ? stats.size : undefined,
        mtimeMs: stats.mtimeMs,
        hasChildren: stats.isDirectory() ? true : undefined,
      });
    }

    results.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });

    return results;
  }

  async readFile(config: CodePaneReadFileConfig): Promise<CodePaneReadFileResult> {
    const rootInfo = await this.resolveRoot(config.rootPath);
    const filePath = await this.resolveExistingPath(rootInfo, config.filePath, 'file');
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
    const rootInfo = await this.resolveRoot(config.rootPath);
    const limit = Math.max(1, Math.min(config.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT));
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
          if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
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

    return results.sort((left, right) => (
      path.basename(left).localeCompare(path.basename(right), undefined, { sensitivity: 'base' })
    ));
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
}
