import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs-extra';
import type {
  CodePaneGitApplyConflictResolutionConfig,
  CodePaneGitApplyRebasePlanConfig,
  CodePaneGitCheckoutConfig,
  CodePaneGitCherryPickConfig,
  CodePaneGitCommitConfig,
  CodePaneGitDeleteBranchConfig,
  CodePaneGitCommitResult,
  CodePaneGitDiscardConfig,
  CodePaneGitHunkActionConfig,
  CodePaneGitPushConfig,
  CodePaneGitPushResult,
  CodePaneGitRemoveConfig,
  CodePaneGitRenameBranchConfig,
  CodePaneGitRebaseControlConfig,
  CodePaneGitResolveConflictConfig,
  CodePaneGitStageConfig,
  CodePaneGitStashConfig,
  CodePaneGitStashResult,
  CodePaneGitUpdateProjectConfig,
  CodePaneGitUpdateProjectResult,
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

  async remove(config: CodePaneGitRemoveConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const pathspecArgs = this.getRepoPathspecArgs(repoContext, config.paths);
    await execFileAsync(
      'git',
      [
        '-C',
        repoContext.repoRootPath,
        'rm',
        ...(config.cached ? ['--cached'] : []),
        '-r',
        '--ignore-unmatch',
        ...pathspecArgs,
      ],
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

  async stageHunk(config: CodePaneGitHunkActionConfig): Promise<void> {
    await this.applyHunkPatch(config, {
      cached: true,
      reverse: false,
    });
  }

  async unstageHunk(config: CodePaneGitHunkActionConfig): Promise<void> {
    await this.applyHunkPatch(config, {
      cached: true,
      reverse: true,
    });
  }

  async discardHunk(config: CodePaneGitHunkActionConfig): Promise<void> {
    await this.applyHunkPatch(config, {
      cached: false,
      reverse: true,
    });
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

  async push(config: CodePaneGitPushConfig): Promise<CodePaneGitPushResult> {
    const repoContext = await requireRepoContext(config.rootPath);
    const remote = config.remote?.trim() || 'origin';
    const branchName = config.branchName?.trim() || await this.resolveCurrentBranchName(repoContext.repoRootPath);
    if (!branchName) {
      throw new Error('No branch is currently checked out');
    }

    await execFileAsync(
      'git',
      [
        '-C',
        repoContext.repoRootPath,
        'push',
        ...(config.setUpstream ? ['--set-upstream'] : []),
        remote,
        branchName,
      ],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );

    return {
      remote,
      branchName,
    };
  }

  async updateProject(config: CodePaneGitUpdateProjectConfig): Promise<CodePaneGitUpdateProjectResult> {
    const repoContext = await requireRepoContext(config.rootPath);
    const upstreamBranch = await this.resolveCurrentUpstreamBranchName(repoContext.repoRootPath);

    if (upstreamBranch) {
      await execFileAsync(
        'git',
        ['-C', repoContext.repoRootPath, 'pull', '--ff-only'],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
      );
      return {
        mode: 'pull',
      };
    }

    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'fetch', '--all', '--prune'],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );
    return {
      mode: 'fetch',
    };
  }

  async checkout(config: CodePaneGitCheckoutConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const branchName = config.branchName.trim();
    if (!branchName) {
      throw new Error('Branch, tag, or revision is required');
    }

    let args = config.detached
      ? ['-C', repoContext.repoRootPath, 'checkout', '--detach', branchName]
      : config.createBranch
        ? ['-C', repoContext.repoRootPath, 'switch', '-c', branchName, ...(config.startPoint ? [config.startPoint] : [])]
        : ['-C', repoContext.repoRootPath, 'switch', branchName];

    if (!config.detached && config.createBranch && config.preferExisting) {
      const localBranchExists = await this.checkLocalBranchExists(repoContext.repoRootPath, branchName);
      if (localBranchExists) {
        args = ['-C', repoContext.repoRootPath, 'switch', branchName];
      }
    }

    await execFileAsync('git', args, { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
  }

  async renameBranch(config: CodePaneGitRenameBranchConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'branch', '-m', config.branchName, config.nextBranchName],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );
  }

  async deleteBranch(config: CodePaneGitDeleteBranchConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    await execFileAsync(
      'git',
      ['-C', repoContext.repoRootPath, 'branch', config.force ? '-D' : '-d', config.branchName],
      { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
    );
  }

  async applyRebasePlan(config: CodePaneGitApplyRebasePlanConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const todoContent = buildRebaseTodo(config.entries);
    const todoFilePath = path.join(tmpdir(), `code-pane-rebase-plan-${randomUUID()}.txt`);
    const sequenceEditorPath = path.join(tmpdir(), `code-pane-rebase-editor-${randomUUID()}.cjs`);

    await fs.writeFile(todoFilePath, todoContent, 'utf-8');
    await fs.writeFile(sequenceEditorPath, buildSequenceEditorScript(), 'utf-8');

    try {
      const sequenceEditorCommand = `${quoteShellArgument(process.execPath)} ${quoteShellArgument(sequenceEditorPath)}`;
      await execFileAsync(
        'git',
        [
          '-C',
          repoContext.repoRootPath,
          '-c',
          `sequence.editor=${sequenceEditorCommand}`,
          'rebase',
          '-i',
          config.baseRef,
        ],
        {
          encoding: 'utf-8',
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            CODE_PANE_REBASE_TODO_PATH: todoFilePath,
          },
        },
      );
    } finally {
      await Promise.all([
        fs.rm(todoFilePath, { force: true }),
        fs.rm(sequenceEditorPath, { force: true }),
      ]);
    }
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

  async applyConflictResolution(config: CodePaneGitApplyConflictResolutionConfig): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const relativeFilePath = getRepoRelativePath(repoContext, config.filePath);
    if (!relativeFilePath) {
      throw new Error('Conflict target path is outside the repository root');
    }

    await fs.writeFile(config.filePath, config.mergedContent, 'utf-8');
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

  private async applyHunkPatch(
    config: CodePaneGitHunkActionConfig,
    options: {
      cached: boolean;
      reverse: boolean;
    },
  ): Promise<void> {
    const repoContext = await requireRepoContext(config.rootPath);
    const relativeFilePath = getRepoRelativePath(repoContext, config.filePath);
    if (!relativeFilePath) {
      throw new Error('Git hunk target path is outside the repository root');
    }

    if (!config.patch.trim()) {
      throw new Error('Git hunk patch is empty');
    }

    const patchFilePath = path.join(tmpdir(), `code-pane-git-hunk-${randomUUID()}.patch`);
    await fs.writeFile(patchFilePath, config.patch, 'utf-8');
    try {
      await execFileAsync(
        'git',
        [
          '-C',
          repoContext.repoRootPath,
          'apply',
          '--whitespace=nowarn',
          '--recount',
          ...(options.cached ? ['--cached'] : []),
          ...(options.reverse ? ['--reverse'] : []),
          patchFilePath,
        ],
        { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 },
      );
    } finally {
      await fs.rm(patchFilePath, { force: true });
    }
  }

  private async resolveCurrentBranchName(repoRootPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoRootPath, 'branch', '--show-current'],
        { encoding: 'utf-8' },
      );
      return (stdout as string).trim();
    } catch {
      return '';
    }
  }

  private async resolveCurrentUpstreamBranchName(repoRootPath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoRootPath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
        { encoding: 'utf-8' },
      );
      return (stdout as string).trim();
    } catch {
      return '';
    }
  }

  private async checkLocalBranchExists(repoRootPath: string, branchName: string): Promise<boolean> {
    try {
      await execFileAsync(
        'git',
        ['-C', repoRootPath, 'show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
        { encoding: 'utf-8' },
      );
      return true;
    } catch {
      return false;
    }
  }
}

async function requireRepoContext(rootPath: string) {
  const repoContext = await resolveRepoContext(rootPath);
  if (!repoContext) {
    throw new Error('Git repository is not available for this code pane');
  }

  return repoContext;
}

function buildRebaseTodo(entries: CodePaneGitApplyRebasePlanConfig['entries']): string {
  let sawReplayableCommit = false;
  const todoLines: string[] = [];

  for (const entry of entries) {
    if (!entry.commitSha) {
      continue;
    }

    if (entry.action === 'drop') {
      todoLines.push(`drop ${entry.commitSha} ${entry.subject}`);
      continue;
    }

    if ((entry.action === 'squash' || entry.action === 'fixup') && !sawReplayableCommit) {
      throw new Error('The first remaining rebase commit must use pick');
    }

    todoLines.push(`${entry.action} ${entry.commitSha} ${entry.subject}`);
    sawReplayableCommit = true;
  }

  if (!sawReplayableCommit) {
    throw new Error('At least one commit must remain in the rebase plan');
  }

  return `${todoLines.join('\n')}\n`;
}

function buildSequenceEditorScript(): string {
  return [
    "const fs = require('fs');",
    "const todoPath = process.argv[2];",
    "const sourcePath = process.env.CODE_PANE_REBASE_TODO_PATH;",
    "if (!todoPath || !sourcePath) {",
    "  throw new Error('Missing rebase todo editor paths');",
    "}",
    "fs.copyFileSync(sourcePath, todoPath);",
    '',
  ].join('\n');
}

function quoteShellArgument(value: string): string {
  return `\"${value.replace(/([\"\\\\$`])/g, '\\\\$1')}\"`;
}
