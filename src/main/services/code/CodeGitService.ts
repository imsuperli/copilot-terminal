import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import type {
  CodePaneGitStatusConfig,
  CodePaneGitStatusEntry,
  CodePaneReadGitBaseFileConfig,
  CodePaneReadGitBaseFileResult,
} from '../../../shared/types/electron-api';
import { PathValidator } from '../../utils/pathValidator';

const execFileAsync = promisify(execFile);

type RepoContext = {
  rootPath: string;
  repoRootPath: string;
  repoPrefixFromRoot: string;
};

function isPathWithin(basePath: string, targetPath: string): boolean {
  const relativePath = path.relative(basePath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function toGitPath(targetPath: string): string {
  return targetPath.split(path.sep).join('/');
}

export class CodeGitService {
  async getStatus(config: CodePaneGitStatusConfig): Promise<CodePaneGitStatusEntry[]> {
    const repoContext = await this.resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return [];
    }

    try {
      const pathspec = repoContext.repoPrefixFromRoot || '.';
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', pathspec],
        { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      );

      return this.parsePorcelainOutput(stdout as Buffer, repoContext);
    } catch {
      return [];
    }
  }

  async readGitBaseFile(config: CodePaneReadGitBaseFileConfig): Promise<CodePaneReadGitBaseFileResult> {
    const repoContext = await this.resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return {
        content: '',
        existsInHead: false,
      };
    }

    const absoluteFilePath = path.resolve(config.filePath);
    if (!path.isAbsolute(config.filePath) || !isPathWithin(repoContext.rootPath, absoluteFilePath)) {
      throw new Error('Target path is outside the code pane root');
    }

    const relativeFilePath = path.relative(repoContext.repoRootPath, absoluteFilePath);
    if (!relativeFilePath || relativeFilePath.startsWith('..')) {
      throw new Error('Target path is outside the repository root');
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'show', `HEAD:${toGitPath(relativeFilePath)}`],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
      );

      return {
        content: stdout as string,
        existsInHead: true,
      };
    } catch {
      return {
        content: '',
        existsInHead: false,
      };
    }
  }

  private async resolveRepoContext(rootPath: string): Promise<RepoContext | null> {
    const expandedRootPath = path.resolve(PathValidator.expandHomePath(rootPath));
    const validation = PathValidator.validate(expandedRootPath);
    if (!validation.valid) {
      return null;
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', expandedRootPath, 'rev-parse', '--show-toplevel'],
        { encoding: 'utf-8' },
      );

      const repoRootPath = stdout.trim();
      if (!repoRootPath) {
        return null;
      }

      if (!isPathWithin(repoRootPath, expandedRootPath)) {
        return null;
      }

      return {
        rootPath: expandedRootPath,
        repoRootPath,
        repoPrefixFromRoot: toGitPath(path.relative(repoRootPath, expandedRootPath)),
      };
    } catch {
      return null;
    }
  }

  private parsePorcelainOutput(output: Buffer, repoContext: RepoContext): CodePaneGitStatusEntry[] {
    const entries: CodePaneGitStatusEntry[] = [];
    const tokens = output.toString('utf-8').split('\0').filter(Boolean);

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.length < 4) {
        continue;
      }

      const indexStatus = token[0];
      const workTreeStatus = token[1];
      const statusPath = token.slice(3);
      let filePath = statusPath;
      let originalPath: string | undefined;

      if (indexStatus === 'R' || workTreeStatus === 'R' || indexStatus === 'C' || workTreeStatus === 'C') {
        const nextToken = tokens[index + 1];
        if (nextToken) {
          filePath = statusPath;
          originalPath = nextToken;
          index += 1;
        }
      }

      const absoluteFilePath = path.resolve(repoContext.repoRootPath, filePath);
      if (!isPathWithin(repoContext.rootPath, absoluteFilePath)) {
        continue;
      }

      let status: CodePaneGitStatusEntry['status'];
      if (indexStatus === '?' || workTreeStatus === '?') {
        status = 'untracked';
      } else if (indexStatus === 'D' || workTreeStatus === 'D') {
        status = 'deleted';
      } else if (indexStatus === 'R' || workTreeStatus === 'R' || indexStatus === 'C' || workTreeStatus === 'C') {
        status = 'renamed';
      } else if (indexStatus === 'A' || workTreeStatus === 'A') {
        status = 'added';
      } else {
        status = 'modified';
      }

      entries.push({
        path: absoluteFilePath,
        status,
        staged: indexStatus !== ' ' && indexStatus !== '?',
        originalPath: originalPath ? path.resolve(repoContext.repoRootPath, originalPath) : undefined,
      });
    }

    return entries;
  }
}
