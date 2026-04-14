import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { PathValidator } from '../../utils/pathValidator';

export const execFileAsync = promisify(execFile);

export interface RepoContext {
  rootPath: string;
  repoRootPath: string;
  repoPrefixFromRoot: string;
  gitDirPath: string;
}

export function isPathWithin(basePath: string, targetPath: string): boolean {
  const relativePath = path.relative(basePath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function toGitPath(targetPath: string): string {
  return targetPath.split(path.sep).join('/');
}

export async function resolveRepoContext(rootPath: string): Promise<RepoContext | null> {
  const expandedRootPath = path.resolve(PathValidator.expandHomePath(rootPath));
  const validation = PathValidator.validate(expandedRootPath);
  if (!validation.valid) {
    return null;
  }

  try {
    const [{ stdout: repoRootStdout }, { stdout: gitDirStdout }] = await Promise.all([
      execFileAsync(
        'git',
        ['-C', expandedRootPath, 'rev-parse', '--show-toplevel'],
        { encoding: 'utf-8' },
      ),
      execFileAsync(
        'git',
        ['-C', expandedRootPath, 'rev-parse', '--absolute-git-dir'],
        { encoding: 'utf-8' },
      ),
    ]);

    const repoRootPath = repoRootStdout.trim();
    const gitDirPath = gitDirStdout.trim();
    if (!repoRootPath || !gitDirPath) {
      return null;
    }

    if (!isPathWithin(repoRootPath, expandedRootPath)) {
      return null;
    }

    return {
      rootPath: expandedRootPath,
      repoRootPath,
      repoPrefixFromRoot: toGitPath(path.relative(repoRootPath, expandedRootPath)),
      gitDirPath,
    };
  } catch {
    return null;
  }
}

export function getRepoRelativePath(repoContext: RepoContext, targetPath: string): string | null {
  const absoluteFilePath = path.resolve(targetPath);
  if (!path.isAbsolute(targetPath) || !isPathWithin(repoContext.rootPath, absoluteFilePath)) {
    return null;
  }

  const relativeFilePath = path.relative(repoContext.repoRootPath, absoluteFilePath);
  if (!relativeFilePath || relativeFilePath.startsWith('..')) {
    return null;
  }

  return relativeFilePath;
}
