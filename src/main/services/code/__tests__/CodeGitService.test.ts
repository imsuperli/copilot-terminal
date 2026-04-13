import path from 'path';
import { execFileSync } from 'child_process';
import { promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodeGitService } from '../CodeGitService';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const describeGit = hasGit ? describe : describe.skip;

describeGit('CodeGitService', () => {
  const service = new CodeGitService();
  let repoRootPath: string;
  let initialBranchName: string;

  beforeEach(async () => {
    repoRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-git-service-'));
    execFileSync('git', ['init'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRootPath, stdio: 'ignore' });

    await fsPromises.writeFile(path.join(repoRootPath, 'tracked.ts'), 'export const version = 1;\n', 'utf-8');
    execFileSync('git', ['add', '.'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoRootPath, stdio: 'ignore' });
    initialBranchName = execFileSync('git', ['branch', '--show-current'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    }).trim();
  });

  afterEach(async () => {
    await fsPromises.rm(repoRootPath, { recursive: true, force: true });
  });

  it('returns working tree status entries and HEAD content', async () => {
    const trackedFilePath = path.join(repoRootPath, 'tracked.ts');
    const untrackedFilePath = path.join(repoRootPath, 'draft.ts');
    await fsPromises.writeFile(trackedFilePath, 'export const version = 2;\n', 'utf-8');
    execFileSync('git', ['add', 'tracked.ts'], { cwd: repoRootPath, stdio: 'ignore' });
    await fsPromises.writeFile(trackedFilePath, 'export const version = 3;\n', 'utf-8');
    await fsPromises.writeFile(untrackedFilePath, 'export const draft = true;\n', 'utf-8');

    const statusEntries = await service.getStatus({ rootPath: repoRootPath });
    expect(statusEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: trackedFilePath,
        status: 'modified',
        staged: true,
        unstaged: true,
      }),
      expect.objectContaining({
        path: untrackedFilePath,
        status: 'untracked',
        section: 'untracked',
      }),
    ]));

    const headFile = await service.readGitBaseFile({
      rootPath: repoRootPath,
      filePath: trackedFilePath,
    });
    expect(headFile.existsInHead).toBe(true);
    expect(headFile.content).toContain('version = 1');

    const missingHeadFile = await service.readGitBaseFile({
      rootPath: repoRootPath,
      filePath: untrackedFilePath,
    });
    expect(missingHeadFile).toEqual({
      content: '',
      existsInHead: false,
    });
  });

  it('returns repository summary and detects repository operations', async () => {
    const initialSummary = await service.getRepositorySummary({ rootPath: repoRootPath });
    expect(initialSummary).toMatchObject({
      repoRootPath,
      currentBranch: initialBranchName,
      operation: 'idle',
      hasConflicts: false,
    });

    const gitDirPath = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: repoRootPath,
      encoding: 'utf-8',
    }).trim();
    await fsPromises.writeFile(path.join(gitDirPath, 'MERGE_HEAD'), 'abcdef1234567890\n', 'utf-8');

    const mergeSummary = await service.getRepositorySummary({ rootPath: repoRootPath });
    expect(mergeSummary).toMatchObject({
      currentBranch: initialBranchName,
      operation: 'merge',
    });
  });

  it('builds a recent commit graph with merge commits', async () => {
    await fsPromises.writeFile(path.join(repoRootPath, 'tracked.ts'), 'export const version = 2;\n', 'utf-8');
    execFileSync('git', ['checkout', '-b', 'feature/scm'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['commit', '-am', 'feature work'], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['checkout', initialBranchName], { cwd: repoRootPath, stdio: 'ignore' });
    execFileSync('git', ['merge', '--no-ff', 'feature/scm', '-m', 'merge feature'], {
      cwd: repoRootPath,
      stdio: 'ignore',
    });

    const graph = await service.getGraph({ rootPath: repoRootPath, limit: 10 });
    expect(graph[0]).toMatchObject({
      subject: 'merge feature',
      isHead: true,
      isMergeCommit: true,
    });
    expect(graph[0]?.refs.join(' ')).toContain(initialBranchName);
    expect(graph.some((commit) => commit.subject === 'feature work')).toBe(true);
  });
});
