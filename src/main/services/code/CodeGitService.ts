import { execFile } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import type {
  CodePaneGitConflictDetails,
  CodePaneGitConflictDetailsConfig,
  CodePaneGitBranchEntry,
  CodePaneGitBranchListConfig,
  CodePaneGitDiffHunk,
  CodePaneGitDiffHunksConfig,
  CodePaneGitDiffHunksResult,
  CodePaneGitGraphCommit,
  CodePaneGitGraphConfig,
  CodePaneGitRebasePlanConfig,
  CodePaneGitRebasePlanResult,
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

  async getBranches(config: CodePaneGitBranchListConfig): Promise<CodePaneGitBranchEntry[]> {
    const repoContext = await this.resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return [];
    }

    try {
      const currentBranch = await this.readCurrentBranchName(repoContext);
      const mergedBranchNames = currentBranch
        ? await this.readMergedBranchNames(repoContext, currentBranch)
        : new Set<string>();
      const { stdout } = await execFileAsync(
        'git',
        [
          '-C',
          repoContext.repoRootPath,
          'for-each-ref',
          '--format=%(refname)\t%(refname:short)\t%(HEAD)\t%(upstream:short)\t%(upstream:track)\t%(objectname)\t%(committerdate:unix)\t%(subject)',
          'refs/heads',
          'refs/remotes',
        ],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
      );

      return parseBranchEntries(stdout as string, mergedBranchNames);
    } catch {
      return [];
    }
  }

  async getRebasePlan(config: CodePaneGitRebasePlanConfig): Promise<CodePaneGitRebasePlanResult> {
    const repoContext = await this.resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return {
        baseRef: config.baseRef?.trim() || '',
        hasMergeCommits: false,
        commits: [],
      };
    }

    const currentBranch = await this.readCurrentBranchName(repoContext);
    const baseRef = (config.baseRef?.trim() || await this.resolveDefaultRebaseBaseRef(repoContext)).trim();
    if (!baseRef) {
      return {
        baseRef: '',
        currentBranch: currentBranch || undefined,
        hasMergeCommits: false,
        commits: [],
      };
    }

    try {
      await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'rev-parse', '--verify', baseRef],
        { encoding: 'utf-8' },
      );
      const [{ stdout: mergeCountOutput }, { stdout: commitOutput }] = await Promise.all([
        execFileAsync(
          'git',
          ['-C', repoContext.repoRootPath, 'rev-list', '--count', '--merges', `${baseRef}..HEAD`],
          { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
        ),
        execFileAsync(
          'git',
          ['-C', repoContext.repoRootPath, 'log', '--reverse', '--format=%H%x1f%s%x1f%an%x1f%ct', '--no-merges', `${baseRef}..HEAD`],
          { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
        ),
      ]);

      return {
        baseRef,
        currentBranch: currentBranch || undefined,
        hasMergeCommits: Number((mergeCountOutput as string).trim() || '0') > 0,
        commits: parseRebasePlanEntries(commitOutput as string),
      };
    } catch {
      return {
        baseRef,
        currentBranch: currentBranch || undefined,
        hasMergeCommits: false,
        commits: [],
      };
    }
  }

  async getDiffHunks(config: CodePaneGitDiffHunksConfig): Promise<CodePaneGitDiffHunksResult> {
    const resolvedFilePath = path.resolve(config.filePath);
    const repoContext = await this.resolveRepoContext(config.rootPath);
    if (!repoContext) {
      return {
        filePath: resolvedFilePath,
        stagedHunks: [],
        unstagedHunks: [],
      };
    }

    if (!path.isAbsolute(config.filePath) || !isPathWithin(repoContext.rootPath, resolvedFilePath)) {
      throw new Error('Target path is outside the code pane root');
    }

    const relativeFilePath = path.relative(repoContext.repoRootPath, resolvedFilePath);
    if (!relativeFilePath || relativeFilePath.startsWith('..')) {
      throw new Error('Target path is outside the repository root');
    }

    const [unstagedPatch, stagedPatch] = await Promise.all([
      this.readDiffOutput(repoContext, relativeFilePath, false),
      this.readDiffOutput(repoContext, relativeFilePath, true),
    ]);

    return {
      filePath: resolvedFilePath,
      stagedHunks: parseGitDiffHunks(stagedPatch, resolvedFilePath, true),
      unstagedHunks: parseGitDiffHunks(unstagedPatch, resolvedFilePath, false),
    };
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

  async getConflictDetails(config: CodePaneGitConflictDetailsConfig): Promise<CodePaneGitConflictDetails> {
    const repoContext = await this.resolveRepoContext(config.rootPath);
    if (!repoContext) {
      throw new Error('Git repository is not available for this code pane');
    }

    const absoluteFilePath = path.resolve(config.filePath);
    if (!path.isAbsolute(config.filePath) || !isPathWithin(repoContext.rootPath, absoluteFilePath)) {
      throw new Error('Target path is outside the code pane root');
    }

    const relativeFilePath = path.relative(repoContext.repoRootPath, absoluteFilePath);
    if (!relativeFilePath || relativeFilePath.startsWith('..')) {
      throw new Error('Target path is outside the repository root');
    }

    const gitRelativePath = toGitPath(relativeFilePath);
    const [baseContent, oursContent, theirsContent, mergedContent] = await Promise.all([
      readConflictStageContent(repoContext.repoRootPath, 1, gitRelativePath),
      readConflictStageContent(repoContext.repoRootPath, 2, gitRelativePath),
      readConflictStageContent(repoContext.repoRootPath, 3, gitRelativePath),
      readWorkingTreeContent(absoluteFilePath),
    ]);

    return {
      filePath: absoluteFilePath,
      relativePath: relativeFilePath,
      baseContent,
      oursContent,
      theirsContent,
      mergedContent,
      language: detectLanguageFromFilePath(absoluteFilePath),
    };
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

  private async readCurrentBranchName(repoContext: RepoContext): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'branch', '--show-current'],
        { encoding: 'utf-8' },
      );
      return (stdout as string).trim();
    } catch {
      return '';
    }
  }

  private async readMergedBranchNames(repoContext: RepoContext, currentBranch: string): Promise<Set<string>> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'branch', '--format=%(refname:short)', '--merged', currentBranch],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
      );
      return new Set(
        (stdout as string)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      );
    } catch {
      return new Set<string>();
    }
  }

  private async resolveDefaultRebaseBaseRef(repoContext: RepoContext): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
        { encoding: 'utf-8' },
      );
      const upstreamRef = (stdout as string).trim();
      if (upstreamRef) {
        return upstreamRef;
      }
    } catch {
      // fall through to local default branches
    }

    for (const candidateRef of ['origin/main', 'origin/master', 'main', 'master']) {
      try {
        await execFileAsync(
          'git',
          ['-C', repoContext.repoRootPath, 'rev-parse', '--verify', candidateRef],
          { encoding: 'utf-8' },
        );
        return candidateRef;
      } catch {
        // try next candidate
      }
    }

    return '';
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

  private async readDiffOutput(
    repoContext: RepoContext,
    relativeFilePath: string,
    staged: boolean,
  ): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        [
          '-C',
          repoContext.repoRootPath,
          'diff',
          '--no-color',
          '--no-ext-diff',
          '--unified=3',
          ...(staged ? ['--cached'] : []),
          '--',
          toGitPath(relativeFilePath),
        ],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
      );

      return stdout as string;
    } catch {
      return '';
    }
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

function parseTrackCounts(trackSummary: string | undefined): { aheadCount: number; behindCount: number } {
  if (!trackSummary) {
    return {
      aheadCount: 0,
      behindCount: 0,
    };
  }

  const aheadMatch = trackSummary.match(/ahead (\d+)/);
  const behindMatch = trackSummary.match(/behind (\d+)/);
  return {
    aheadCount: Number(aheadMatch?.[1] ?? 0),
    behindCount: Number(behindMatch?.[1] ?? 0),
  };
}

function parseBranchEntries(output: string, mergedBranchNames: Set<string>): CodePaneGitBranchEntry[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [refName = '', shortName = '', headMarker = '', upstream = '', trackSummary = '', commitSha = '', timestamp = '0', subject = ''] = line.split('\t');
      if (!refName || shortName.endsWith('/HEAD')) {
        return [];
      }

      const kind = refName.startsWith('refs/remotes/') ? 'remote' : 'local';
      const trackCounts = parseTrackCounts(trackSummary);
      return [{
        name: shortName,
        refName,
        shortName,
        kind,
        current: headMarker === '*',
        upstream: upstream || undefined,
        aheadCount: trackCounts.aheadCount,
        behindCount: trackCounts.behindCount,
        commitSha,
        shortSha: commitSha.slice(0, 7),
        subject,
        timestamp: Number(timestamp || '0'),
        mergedIntoCurrent: kind === 'local' && mergedBranchNames.has(shortName),
      } satisfies CodePaneGitBranchEntry];
    })
    .sort((left, right) => {
      if (left.current !== right.current) {
        return left.current ? -1 : 1;
      }
      if (left.kind !== right.kind) {
        return left.kind === 'local' ? -1 : 1;
      }
      return left.shortName.localeCompare(right.shortName, undefined, { sensitivity: 'base' });
    });
}

async function readConflictStageContent(
  repoRootPath: string,
  stage: 1 | 2 | 3,
  relativeFilePath: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRootPath, 'show', `:${stage}:${relativeFilePath}`],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout as string;
  } catch {
    return '';
  }
}

async function readWorkingTreeContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function detectLanguageFromFilePath(filePath: string): string {
  const baseName = path.basename(filePath).toLowerCase();
  const extension = path.extname(baseName).toLowerCase();

  if (baseName === 'dockerfile') return 'dockerfile';
  if (baseName === '.gitignore') return 'plaintext';
  if (baseName === '.env' || baseName.startsWith('.env.')) return 'shell';

  switch (extension) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
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
    default:
      return 'plaintext';
  }
}

function parseRebasePlanEntries(output: string): CodePaneGitRebasePlanResult['commits'] {
  if (!output.trim()) {
    return [];
  }

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [commitSha = '', subject = '', author = '', timestamp = '0'] = line.split('\u001f');
      return {
        commitSha,
        shortSha: commitSha.slice(0, 7),
        subject,
        author,
        timestamp: Number(timestamp || '0'),
        action: 'pick',
      };
    });
}

function parseGitDiffHunks(
  output: string,
  filePath: string,
  staged: boolean,
): CodePaneGitDiffHunk[] {
  if (!output.trim()) {
    return [];
  }

  const lines = output.split(/\r?\n/);
  const fileHeaderLines: string[] = [];
  const hunks: CodePaneGitDiffHunk[] = [];
  let currentHeader: string | null = null;
  let currentPatchLines: string[] = [];
  let currentLines: CodePaneGitDiffHunk['lines'] = [];
  let oldLineNumber = 0;
  let newLineNumber = 0;

  const flushCurrentHunk = () => {
    if (!currentHeader) {
      return;
    }

    hunks.push({
      id: `${filePath}:${staged ? 'staged' : 'unstaged'}:${hunks.length + 1}`,
      filePath,
      staged,
      header: currentHeader,
      patch: `${currentPatchLines.join('\n')}\n`,
      lines: currentLines,
    });
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (lineIndex === lines.length - 1 && line === '') {
      continue;
    }

    if (!currentHeader) {
      if (line.startsWith('@@')) {
        currentHeader = line;
        currentPatchLines = [...fileHeaderLines, line];
        currentLines = [];
        const headerMatch = line.match(/^@@\s+\-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
        oldLineNumber = Number(headerMatch?.[1] ?? 0);
        newLineNumber = Number(headerMatch?.[3] ?? 0);
        continue;
      }

      if (line) {
        fileHeaderLines.push(line);
      }
      continue;
    }

    if (line.startsWith('@@')) {
      flushCurrentHunk();
      currentHeader = line;
      currentPatchLines = [...fileHeaderLines, line];
      currentLines = [];
      const headerMatch = line.match(/^@@\s+\-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      oldLineNumber = Number(headerMatch?.[1] ?? 0);
      newLineNumber = Number(headerMatch?.[3] ?? 0);
      continue;
    }

    currentPatchLines.push(line);
    if (line.startsWith('\\')) {
      continue;
    }

    if (line.startsWith('+')) {
      currentLines.push({
        type: 'add',
        text: line.slice(1),
        newLineNumber,
      });
      newLineNumber += 1;
      continue;
    }

    if (line.startsWith('-')) {
      currentLines.push({
        type: 'delete',
        text: line.slice(1),
        oldLineNumber,
      });
      oldLineNumber += 1;
      continue;
    }

    const contextText = line.startsWith(' ') ? line.slice(1) : line;
    currentLines.push({
      type: 'context',
      text: contextText,
      oldLineNumber,
      newLineNumber,
    });
    oldLineNumber += 1;
    newLineNumber += 1;
  }

  flushCurrentHunk();
  return hunks;
}
