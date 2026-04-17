import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CODE_PANE_DIRECTORY_CACHE_TTL_MS,
  CODE_PANE_EXTERNAL_LIBRARY_CACHE_TTL_MS,
  CODE_PANE_GIT_BRANCHES_CACHE_TTL_MS,
  CODE_PANE_GIT_GRAPH_CACHE_TTL_MS,
  CODE_PANE_GIT_REBASE_PLAN_CACHE_TTL_MS,
  CODE_PANE_GIT_STATUS_CACHE_TTL_MS,
  dedupeProjectRequest,
  getDirectoryCache,
  getExternalLibraryCache,
  getGitBranchesCache,
  getGitGraphCache,
  getGitRebasePlanCache,
  getGitStatusCache,
  getGitSummaryCache,
  invalidateDirectoryCache,
  invalidateProjectCache,
  resetCodePaneProjectCacheForTests,
  setDirectoryCache,
  setExternalLibraryCache,
  setGitBranchesCache,
  setGitGraphCache,
  setGitRebasePlanCache,
  setGitStatusCache,
  setGitSummaryCache,
} from '../codePaneProjectCache';

describe('codePaneProjectCache', () => {
  beforeEach(() => {
    resetCodePaneProjectCacheForTests();
    vi.useRealTimers();
  });

  it('returns cached external library sections before the TTL expires', () => {
    vi.useFakeTimers();

    setExternalLibraryCache('/workspace/project', [
      {
        id: 'java',
        label: 'External Libraries',
        languageId: 'java',
        roots: [
          {
            id: 'maven',
            label: 'Maven',
            path: '/home/user/.m2/repository',
          },
        ],
      },
    ]);

    expect(getExternalLibraryCache('/workspace/project')).toHaveLength(1);

    vi.advanceTimersByTime(CODE_PANE_EXTERNAL_LIBRARY_CACHE_TTL_MS + 1);
    expect(getExternalLibraryCache('/workspace/project')).toBeNull();
  });

  it('expires git status and graph caches independently by TTL', () => {
    vi.useFakeTimers();

    setGitStatusCache('/workspace/project', [
      {
        path: '/workspace/project/src/index.ts',
        status: 'modified',
        unstaged: true,
        section: 'unstaged',
      },
    ]);
    setGitGraphCache('/workspace/project', [
      {
        sha: 'abcdef1234567890',
        shortSha: 'abcdef1',
        parents: [],
        subject: 'Initial commit',
        author: 'Test User',
        timestamp: 1_710_000_000,
        refs: ['HEAD -> main'],
        isHead: true,
        isMergeCommit: false,
        lane: 0,
        laneCount: 1,
      },
    ]);

    vi.advanceTimersByTime(CODE_PANE_GIT_STATUS_CACHE_TTL_MS + 1);
    expect(getGitStatusCache('/workspace/project')).toBeNull();
    expect(getGitGraphCache('/workspace/project')).toHaveLength(1);

    vi.advanceTimersByTime(CODE_PANE_GIT_GRAPH_CACHE_TTL_MS - CODE_PANE_GIT_STATUS_CACHE_TTL_MS);
    expect(getGitGraphCache('/workspace/project')).toBeNull();
  });

  it('returns cached git branches and rebase plan before their TTLs expire', () => {
    vi.useFakeTimers();

    setGitBranchesCache('/workspace/project', [
      {
        name: 'main',
        refName: 'refs/heads/main',
        shortName: 'main',
        kind: 'local',
        current: true,
        upstream: 'origin/main',
        aheadCount: 0,
        behindCount: 0,
        commitSha: 'abcdef1234567890',
        shortSha: 'abcdef1',
        subject: 'Initial commit',
        timestamp: 1_710_000_000,
        mergedIntoCurrent: false,
      },
    ]);
    setGitRebasePlanCache('/workspace/project', 'origin/main', {
      baseRef: 'origin/main',
      currentBranch: 'main',
      hasMergeCommits: false,
      commits: [],
    });

    expect(getGitBranchesCache('/workspace/project')).toHaveLength(1);
    expect(getGitRebasePlanCache('/workspace/project', 'origin/main')).not.toBeNull();

    vi.advanceTimersByTime(CODE_PANE_GIT_BRANCHES_CACHE_TTL_MS - 1);
    expect(getGitBranchesCache('/workspace/project')).toHaveLength(1);
    expect(getGitRebasePlanCache('/workspace/project', 'origin/main')).not.toBeNull();

    vi.advanceTimersByTime(2);
    expect(getGitBranchesCache('/workspace/project')).toBeNull();
    expect(getGitRebasePlanCache('/workspace/project', 'origin/main')).not.toBeNull();

    vi.advanceTimersByTime(CODE_PANE_GIT_REBASE_PLAN_CACHE_TTL_MS - CODE_PANE_GIT_BRANCHES_CACHE_TTL_MS);
    expect(getGitRebasePlanCache('/workspace/project', 'origin/main')).toBeNull();
  });

  it('deduplicates concurrent project requests with the same key', async () => {
    const factory = vi.fn(async () => 'ok');

    const [first, second] = await Promise.all([
      dedupeProjectRequest('/workspace/project', 'git-snapshot:status', factory),
      dedupeProjectRequest('/workspace/project', 'git-snapshot:status', factory),
    ]);

    expect(first).toBe('ok');
    expect(second).toBe('ok');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('returns cached directory entries before the TTL expires', () => {
    vi.useFakeTimers();

    setDirectoryCache('/workspace/project', '/workspace/project/src', [
      {
        path: '/workspace/project/src/index.ts',
        name: 'index.ts',
        type: 'file',
      },
    ]);

    expect(getDirectoryCache('/workspace/project', '/workspace/project/src')).toEqual([
      {
        path: '/workspace/project/src/index.ts',
        name: 'index.ts',
        type: 'file',
      },
    ]);

    vi.advanceTimersByTime(CODE_PANE_DIRECTORY_CACHE_TTL_MS + 1);
    expect(getDirectoryCache('/workspace/project', '/workspace/project/src')).toBeNull();
  });

  it('invalidates a cached directory subtree without touching sibling directories', () => {
    setDirectoryCache('/workspace/project', '/workspace/project/src', []);
    setDirectoryCache('/workspace/project', '/workspace/project/src/main', []);
    setDirectoryCache('/workspace/project', '/workspace/project/test', []);

    invalidateDirectoryCache('/workspace/project', '/workspace/project/src');

    expect(getDirectoryCache('/workspace/project', '/workspace/project/src')).toBeNull();
    expect(getDirectoryCache('/workspace/project', '/workspace/project/src/main')).toBeNull();
    expect(getDirectoryCache('/workspace/project', '/workspace/project/test')).toEqual([]);
  });

  it('invalidates git cache entries without touching external libraries', () => {
    setExternalLibraryCache('/workspace/project', []);
    setGitStatusCache('/workspace/project', []);
    setGitSummaryCache('/workspace/project', {
      repoRootPath: '/workspace/project',
      currentBranch: 'main',
      upstreamBranch: 'origin/main',
      detachedHead: false,
      headSha: 'abcdef1234567890',
      aheadCount: 0,
      behindCount: 0,
      operation: 'idle',
      hasConflicts: false,
    });

    invalidateProjectCache('/workspace/project', 'git');

    expect(getExternalLibraryCache('/workspace/project')).toEqual([]);
    expect(getGitStatusCache('/workspace/project')).toBeNull();
    expect(getGitSummaryCache('/workspace/project')).toBeNull();
  });

  it('invalidates only lightweight git status caches', () => {
    setGitStatusCache('/workspace/project', []);
    setGitSummaryCache('/workspace/project', {
      repoRootPath: '/workspace/project',
      currentBranch: 'main',
      upstreamBranch: 'origin/main',
      detachedHead: false,
      headSha: 'abcdef1234567890',
      aheadCount: 0,
      behindCount: 0,
      operation: 'idle',
      hasConflicts: false,
    });
    setGitGraphCache('/workspace/project', [
      {
        sha: 'abcdef1234567890',
        parents: [],
        refs: ['HEAD -> main'],
        subject: 'Initial commit',
        author: 'Test User',
        timestamp: 1_710_000_000,
        lane: 0,
        laneCount: 1,
        isHead: true,
        isMergeCommit: false,
        shortSha: 'abcdef1',
      },
    ]);

    invalidateProjectCache('/workspace/project', 'git-status');

    expect(getGitStatusCache('/workspace/project')).toBeNull();
    expect(getGitSummaryCache('/workspace/project')).toBeNull();
    expect(getGitGraphCache('/workspace/project')).toHaveLength(1);
  });

  it('invalidates only git graph caches', () => {
    setGitStatusCache('/workspace/project', []);
    setGitGraphCache('/workspace/project', [
      {
        sha: 'abcdef1234567890',
        parents: [],
        refs: ['HEAD -> main'],
        subject: 'Initial commit',
        author: 'Test User',
        timestamp: 1_710_000_000,
        lane: 0,
        laneCount: 1,
        isHead: true,
        isMergeCommit: false,
        shortSha: 'abcdef1',
      },
    ]);

    invalidateProjectCache('/workspace/project', 'git-graph');

    expect(getGitStatusCache('/workspace/project')).toEqual([]);
    expect(getGitGraphCache('/workspace/project')).toBeNull();
  });

  it('invalidates git branches and rebase caches independently', () => {
    setGitBranchesCache('/workspace/project', []);
    setGitRebasePlanCache('/workspace/project', 'origin/main', {
      baseRef: 'origin/main',
      currentBranch: 'main',
      hasMergeCommits: false,
      commits: [],
    });

    invalidateProjectCache('/workspace/project', 'git-branches');
    expect(getGitBranchesCache('/workspace/project')).toBeNull();
    expect(getGitRebasePlanCache('/workspace/project', 'origin/main')).not.toBeNull();

    invalidateProjectCache('/workspace/project', 'git-rebase');
    expect(getGitRebasePlanCache('/workspace/project', 'origin/main')).toBeNull();
  });

  it('invalidates directory cache entries without touching git snapshots', () => {
    setDirectoryCache('/workspace/project', '/workspace/project/src', []);
    setGitStatusCache('/workspace/project', []);

    invalidateProjectCache('/workspace/project', 'directories');

    expect(getDirectoryCache('/workspace/project', '/workspace/project/src')).toBeNull();
    expect(getGitStatusCache('/workspace/project')).toEqual([]);
  });
});
