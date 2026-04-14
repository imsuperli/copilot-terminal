import path from 'path';
import { execFileSync } from 'child_process';
import { promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeGitBlameService } from '../CodeGitBlameService';
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
});
