import type {
  CodePaneGitCheckoutConfig,
  CodePaneGitCherryPickConfig,
  CodePaneGitCommitConfig,
  CodePaneGitCommitResult,
  CodePaneGitDiscardConfig,
  CodePaneGitRebaseControlConfig,
  CodePaneGitResolveConflictConfig,
  CodePaneGitStageConfig,
  CodePaneGitStashConfig,
  CodePaneGitStashResult,
} from '../../../shared/types/electron-api';
import {
  execFileAsync,
  getRepoRelativePath,
  resolveRepoContext,
} from './codeGitUtils';

function getPathspecArgs(targetPaths: string[]): string[] {
  const normalizedPaths = Array.from(new Set(targetPaths.map((candidatePath) => candidatePath.trim()).filter(Boolean)));
  if (normalizedPaths.length === 0) {
    return [];
  }

  return normalizedPaths.flatMap((targetPath) => ['--', targetPath]);
}

export class CodeGitOperationService {
  async stage(config: CodePaneGitStageConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const pathspecArgs = this.getRepoPathspecArgs(repoContext, config.paths);
    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'add', ...pathspecArgs],
      { encoding: 'utf-8' },
    );
  }

  async unstage(config: CodePaneGitStageConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const pathspecArgs = this.getRepoPathspecArgs(repoContext, config.paths);
    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'restore', '--staged', ...pathspecArgs],
      { encoding: 'utf-8' },
    );
  }

  async discard(config: CodePaneGitDiscardConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const pathspecArgs = this.getRepoPathspecArgs(repoContext, config.paths);
    const restoreArgs = config.restoreStaged
      ? ['restore', '--source=HEAD', '--staged', '--worktree']
      : ['restore', '--worktree'];

    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, ...restoreArgs, ...pathspecArgs],
      { encoding: 'utf-8' },
    );
  }

  async commit(config: CodePaneGitCommitConfig): Promise<CodePaneGitCommitResult> {
    const repoContext = await requireRepoContext(config.rootPath);
    if (config.includeAll) {
      await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'add', '-A'],
        { encoding: 'utf-8' },
      );
    }

    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'commit', ...(config.amend ? ['--amend'] : []), '-m', config.message],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );

    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'log', '-1', '--pretty=format:%H%x1f%s'],
      { encoding: 'utf-8' },
    );
    const [commitSha = '', summary = ''] = (stdout as string).split('\x1f');
    return {
      commitSha,
      shortSha: commitSha.slice(0, 7),
      summary,
    };
  }

  async stash(config: CodePaneGitStashConfig): Promise<CodePaneGitStashResult> {
    const repoContext = await requireRepoContext(config.rootPath);
    await execFileAsync(
      'git',
      [
        '-C',
        repoContext.repoRootPath,
        'stash',
        'push',
        ...(config.includeUntracked ? ['--include-untracked'] : []),
        ...(config.message ? ['-m', config.message] : []),
      ],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );

    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'stash', 'list', '-1', '--pretty=format:%gd%x1f%s'],
      { encoding: 'utf-8' },
    );
    const [reference = 'stash@{0}', message = config.message ?? 'WIP'] = (stdout as string).split('\x1f');
    return {
      reference,
      message,
    };
  }

  async checkout(config: CodePaneGitCheckoutConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const args = config.createBranch
      ? ['-C', repoContext.repoRootPath, 'switch', '-c', config.branchName, ...(config.startPoint ? [config.startPoint] : [])]
      : ['-C', repoContext.repoRootPath, 'switch', config.branchName];
    await execFileAsync('git', args, { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
  }

  async cherryPick(config: CodePaneGitCherryPickConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'cherry-pick', config.commitSha],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );
  }

  async controlRebase(config: CodePaneGitRebaseControlConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'rebase', config.action === 'continue' ? '--continue' : '--abort'],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );
  }

  async resolveConflict(config: CodePaneGitResolveConflictConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const relativeFilePath = getRepoRelativePath(repoContext, config.filePath);
    if (!relativeFilePath) {
      throw new Error('Conflict target path is outside the repository root');
    }

    if (config.strategy === 'ours' || config.strategy === 'theirs') {
      await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'checkout', `--${config.strategy}`, '--', relativeFilePath],
        { encoding: 'utf-8' },
      );
    }

    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'add', '--', relativeFilePath],
      { encoding: 'utf-8' },
    );
  }

  private getRepoPathspecArgs(
    repoContext: Awaited<ReturnType<typeof requireRepoContext>>,
    filePaths: string[],
  ): string[] {
    const relativePaths = filePaths
      .map((filePath) => getRepoRelativePath(repoContext, filePath))
      .filter((candidatePath): candidatePath is string => Boolean(candidatePath));
    return getPathspecArgs(relativePaths);
  }
}

async function requireRepoContext(rootPath: string) {
  const repoContext = await resolveRepoContext(rootPath);
  if (!repoContext) {
    throw new Error('Git repository is not available for this code pane');
  }

  return repoContext;
}
