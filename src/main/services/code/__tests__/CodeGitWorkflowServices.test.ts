import path from 'path';
import { execFileSync } from 'child_process';
import { promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeGitBlameService } from '../CodeGitBlameService';
import { CodeGitService } from '../CodeGitService';
import { CodeGitHistoryService } from '../CodeGitHistoryService';
import { CodeGitOperationService } from '../CodeGitOperationService';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const describeGit = hasGit ? describe : describe.skip;

describeGit('Code Git workflow services', () => {
  const operationService = new CodeGitOperationService();
  const gitService = new CodeGitService();
  const historyService = new CodeGitHistoryService();
  const blameService = new CodeGitBlameService();
  let repoRootPath: string;

  beforeEach(async () => {
    repoRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-git-workflow-'));
    execFileSync('git', ['init'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRootPath, stdio: 'ignore' });

    await fsPromises.writeFile(path.join(repoRootPath, 'tracked.ts'), 'export const value = 1;\n', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoRootPath, stdio: 'ignore' });
  });

  afterEach(async () => {
    await fsPromises.rm(repoRootPath, { recursive: true, force: true });
  });

  it('stages, unstages, discards, and commits through the operation service', async () => {
    const trackedFilePath = path.join(repoRootPath, 'tracked.ts');
    await fsPromises.writeFile(trackedFilePath, 'export const value = 2;\n', 'utf-8');

    await operationService.stage({
      rootPath: repoRootPath,
      paths: [trackedFilePath],
    });
    expect(execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    })).toContain('tracked.ts');

    await operationService.unstage({
      rootPath: repoRootPath,
      paths: [trackedFilePath],
    });
    expect(execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    }).trim()).toBe('');

    await operationService.stage({
      rootPath: repoRootPath,
      paths: [trackedFilePath],
    });
    const commitResult = await operationService.commit({
      rootPath: repoRootPath,
      message: 'Update tracked file',
      includeAll: false,
    });
    expect(commitResult.summary).toBe('Update tracked file');

    await fsPromises.writeFile(trackedFilePath, 'export const value = 3;\n', 'utf-8');
    await operationService.discard({
      rootPath: repoRootPath,
      paths: [trackedFilePath],
    });
    expect(await fsPromises.readFile(trackedFilePath, 'utf-8')).toBe('export const value = 2;\n');
  });

  it('stages, unstages, and discards a single git hunk', async () => {
    const trackedFilePath = path.join(repoRootPath, 'tracked.ts');
    const baseLines = Array.from({ length: 20 }, (_item, index) => `export const value${index + 1} = ${index + 1};`);
    await fsPromises.writeFile(trackedFilePath, `${baseLines.join('\n')}\n`, 'utf-8');
    execFileSync('git', ['add', 'tracked.ts'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'multiline base'], { cwd: repoRootPath, stdio: 'ignore' });

    const nextLines = [...baseLines];
    nextLines[0] = 'export const value1 = 101;';
    nextLines[19] = 'export const value20 = 2000;';
    await fsPromises.writeFile(trackedFilePath, `${nextLines.join('\n')}\n`, 'utf-8');

    const initialHunks = await gitService.getDiffHunks({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
    });
    const firstHunk = initialHunks.unstagedHunks[0];
    expect(firstHunk?.patch).toContain('value1 = 101');

    await operationService.stageHunk({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
      patch: firstHunk?.patch ?? '',
    });
    const cachedAfterStage = execFileSync('git', ['diff', '--cached', '--', 'tracked.ts'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    });
    expect(cachedAfterStage).toContain('value1 = 101');
    expect(cachedAfterStage).not.toContain('value20 = 2000');

    const stagedHunks = await gitService.getDiffHunks({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
    });
    const stagedFirstHunk = stagedHunks.stagedHunks[0];
    await operationService.unstageHunk({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
      patch: stagedFirstHunk?.patch ?? '',
    });
    expect(execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    }).trim()).toBe('');

    const unstagedHunks = await gitService.getDiffHunks({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
    });
    const secondHunk = unstagedHunks.unstagedHunks.find((hunk) => hunk.patch.includes('value20 = 2000'));
    await operationService.discardHunk({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
      patch: secondHunk?.patch ?? '',
    });

    const finalContent = await fsPromises.readFile(trackedFilePath, 'utf-8');
    expect(finalContent).toContain('export const value1 = 101;');
    expect(finalContent).toContain('export const value20 = 20;');
  });

  it('returns file history and blame details', async () => {
    const trackedFilePath = path.join(repoRootPath, 'tracked.ts');
    await fsPromises.writeFile(trackedFilePath, 'export const value = 2;\n', 'utf-8');
    execFileSync('git', ['commit', '-am', 'update tracked'], { cwd: repoRootPath, stdio: 'ignore' });

    const history = await historyService.getHistory({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
      limit: 5,
    });
    expect(history.scope).toBe('file');
    expect(history.entries[0]?.subject).toBe('update tracked');

    const blame = await blameService.getBlame({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
    });
    expect(blame[0]).toMatchObject({
      author: 'Test User',
      summary: 'update tracked',
      lineNumber: 1,
    });
  });

  it('renames and deletes branches, then applies an interactive rebase plan', async () => {
    const trackedFilePath = path.join(repoRootPath, 'tracked.ts');
    const initialBranchName = execFileSync('git', ['branch', '--show-current'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    }).trim();

    execFileSync('git', ['checkout', '-b', 'feature/rebase'], { cwd: repoRootPath, stdio: 'ignore' });
    await fsPromises.writeFile(trackedFilePath, 'export const value = 2;\n', 'utf-8');
    execFileSync('git', ['commit', '-am', 'feature commit 1'], { cwd: repoRootPath, stdio: 'ignore' });
    await fsPromises.writeFile(trackedFilePath, 'export const value = 3;\n', 'utf-8');
    execFileSync('git', ['commit', '-am', 'feature commit 2'], { cwd: repoRootPath, stdio: 'ignore' });

    await operationService.renameBranch({
      rootPath: repoRootPath,
      branchName: 'feature/rebase',
      nextBranchName: 'feature/rewritten',
    });
    expect(execFileSync('git', ['branch', '--show-current'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    }).trim()).toBe('feature/rewritten');

    execFileSync('git', ['checkout', initialBranchName], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['branch', 'temp/delete'], { cwd: repoRootPath, stdio: 'ignore' });
    await operationService.deleteBranch({
      rootPath: repoRootPath,
      branchName: 'temp/delete',
    });
    expect(execFileSync('git', ['branch', '--list', 'temp/delete'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    }).trim()).toBe('');

    execFileSync('git', ['checkout', 'feature/rewritten'], { cwd: repoRootPath, stdio: 'ignore' });
    const rebasePlan = await gitService.getRebasePlan({
      rootPath: repoRootPath,
      baseRef: initialBranchName,
    });
    await operationService.applyRebasePlan({
      rootPath: repoRootPath,
      baseRef: initialBranchName,
      entries: [
        {
          ...rebasePlan.commits[0],
          action: 'pick',
        },
        {
          ...rebasePlan.commits[1],
          action: 'fixup',
        },
      ],
    });

    expect(execFileSync('git', ['rev-list', '--count', `${initialBranchName}..HEAD`], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    }).trim()).toBe('1');
  });
});
