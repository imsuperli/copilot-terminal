import { execFile } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import type {
  CodePaneGitGraphCommit,
  CodePaneGitGraphConfig,
  CodePaneGitRepositorySummary,
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
  gitDirPath: string;
};

type ParsedGitStatus = {
  entries: CodePaneGitStatusEntry[];
  summary: Omit<CodePaneGitRepositorySummary, 'operation' | 'hasConflicts'>;
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
      return (await this.readRepositoryStatus(repoContext)).entries;
    } catch {
      return [];
    }
  }

  async getRepositorySummary(config: CodePaneGitStatusConfig): Promise<CodePaneGitRepositorySummary | null> {
    const repoContext = await this.resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return null;
    }

    try {
      const [{ summary, entries }, operation] = await Promise.all([
        this.readRepositoryStatus(repoContext),
        this.detectRepositoryOperation(repoContext),
      ]);

      return {
        ...summary,
        operation,
        hasConflicts: entries.some((entry) => entry.conflicted),
      };
    } catch {
      return null;
    }
  }

  async getGraph(config: CodePaneGitGraphConfig): Promise<CodePaneGitGraphCommit[]> {
    const repoContext = await this.resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return [];
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        [
          '-C',
          repoContext.repoRootPath,
          'log',
          '--date-order',
          '--decorate=short',
          `-n${String(Math.max(10, Math.min(config.limit ?? 60, 120)))}`,
          '--all',
          '--pretty=format:%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%ct',
        ],
        { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
      );

      return buildCommitGraph(stdout as string);
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

  private async readRepositoryStatus(repoContext: RepoContext): Promise<ParsedGitStatus> {
    const pathspec = repoContext.repoPrefixFromRoot || '.';
    const [statusOutput, branchOutput] = await Promise.all([
      execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', pathspec],
        { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      ),
      execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'status', '--porcelain=v2', '--branch', '--untracked-files=all', '--', pathspec],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
      ),
    ]);

    return {
      entries: this.parsePorcelainOutput(statusOutput.stdout as Buffer, repoContext),
      summary: parseRepositorySummary(branchOutput.stdout as string, repoContext),
    };
  }

  private async resolveRepoContext(rootPath: string): Promise<RepoContext | null> {
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

  private async detectRepositoryOperation(repoContext: RepoContext): Promise<CodePaneGitRepositorySummary['operation']> {
    if (await fs.pathExists(path.join(repoContext.gitDirPath, 'MERGE_HEAD'))) {
      return 'merge';
    }

    if (
      await fs.pathExists(path.join(repoContext.gitDirPath, 'rebase-merge'))
      || await fs.pathExists(path.join(repoContext.gitDirPath, 'rebase-apply'))
      || await fs.pathExists(path.join(repoContext.gitDirPath, 'REBASE_HEAD'))
    ) {
      return 'rebase';
    }

    if (await fs.pathExists(path.join(repoContext.gitDirPath, 'CHERRY_PICK_HEAD'))) {
      return 'cherry-pick';
    }

    if (await fs.pathExists(path.join(repoContext.gitDirPath, 'REVERT_HEAD'))) {
      return 'revert';
    }

    if (await fs.pathExists(path.join(repoContext.gitDirPath, 'BISECT_LOG'))) {
      return 'bisect';
    }

    return 'idle';
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
          originalPath = statusPath;
          filePath = nextToken;
          index += 1;
        }
      }

      const absoluteFilePath = path.resolve(repoContext.repoRootPath, filePath);
      if (!isPathWithin(repoContext.rootPath, absoluteFilePath)) {
        continue;
      }

      const conflicted = isConflictedStatus(indexStatus, workTreeStatus);
      const staged = !conflicted && indexStatus !== ' ' && indexStatus !== '?';
      const unstaged = !conflicted && workTreeStatus !== ' ' && workTreeStatus !== '?';
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
        staged,
        unstaged,
        conflicted,
        section: conflicted
          ? 'conflicted'
          : status === 'untracked'
            ? 'untracked'
            : staged
              ? 'staged'
              : 'unstaged',
        originalPath: originalPath ? path.resolve(repoContext.repoRootPath, originalPath) : undefined,
      });
    }

    return entries;
  }
}

function parseRepositorySummary(
  output: string,
  repoContext: RepoContext,
): Omit<CodePaneGitRepositorySummary, 'operation' | 'hasConflicts'> {
  let currentBranch: string | undefined;
  let upstreamBranch: string | undefined;
  let detachedHead = false;
  let headSha: string | undefined;
  let aheadCount = 0;
  let behindCount = 0;

  for (const line of output.split('\n')) {
    if (!line.startsWith('# ')) {
      continue;
    }

    const trimmedLine = line.slice(2);
    if (trimmedLine.startsWith('branch.head ')) {
      const value = trimmedLine.slice('branch.head '.length).trim();
      if (value === '(detached)') {
        detachedHead = true;
      } else if (value !== '(unknown)') {
        currentBranch = value;
      }
      continue;
    }

    if (trimmedLine.startsWith('branch.oid ')) {
      const value = trimmedLine.slice('branch.oid '.length).trim();
      if (value && value !== '(initial)') {
        headSha = value;
      }
      continue;
    }

    if (trimmedLine.startsWith('branch.upstream ')) {
      upstreamBranch = trimmedLine.slice('branch.upstream '.length).trim() || undefined;
      continue;
    }

    if (trimmedLine.startsWith('branch.ab ')) {
      const match = trimmedLine.match(/\+(\d+)\s+\-(\d+)/);
      if (match) {
        aheadCount = Number(match[1] ?? 0);
        behindCount = Number(match[2] ?? 0);
      }
    }
  }

  return {
    repoRootPath: repoContext.repoRootPath,
    currentBranch,
    upstreamBranch,
    detachedHead,
    headSha,
    aheadCount,
    behindCount,
  };
}

function isConflictedStatus(indexStatus: string, workTreeStatus: string): boolean {
  return ['U', 'A', 'D'].includes(indexStatus) && ['U', 'A', 'D'].includes(workTreeStatus);
}

function buildCommitGraph(output: string): CodePaneGitGraphCommit[] {
  if (!output.trim()) {
    return [];
  }

  const commits = output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, parents, refs, subject, author, timestamp] = line.split('\u001f');
      return {
        sha,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        refs: refs
          ? refs.split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
          : [],
        subject: subject ?? '',
        author: author ?? '',
        timestamp: Number(timestamp ?? 0),
      };
    });

  const activeLanes: string[] = [];

  return commits.map((commit) => {
    let lane = activeLanes.indexOf(commit.sha);
    if (lane === -1) {
      lane = activeLanes.length;
      activeLanes.push(commit.sha);
    }

    const laneCount = Math.max(activeLanes.length, lane + 1);
    const [firstParent, ...otherParents] = commit.parents;

    if (firstParent) {
      activeLanes[lane] = firstParent;
    } else {
      activeLanes.splice(lane, 1);
    }

    for (const parent of otherParents) {
      if (!activeLanes.includes(parent)) {
        activeLanes.splice(lane + 1, 0, parent);
      }
    }

    for (let index = activeLanes.length - 1; index >= 0; index -= 1) {
      if (activeLanes.indexOf(activeLanes[index]) !== index) {
        activeLanes.splice(index, 1);
      }
    }

    return {
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 7),
      parents: commit.parents,
      subject: commit.subject,
      author: commit.author,
      timestamp: commit.timestamp,
      refs: commit.refs,
      isHead: commit.refs.some((ref) => ref === 'HEAD' || ref.startsWith('HEAD ->')),
      isMergeCommit: commit.parents.length > 1,
      lane,
      laneCount,
    };
  });
}
