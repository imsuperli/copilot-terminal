import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CODE_PANE_EXTERNAL_LIBRARY_CACHE_TTL_MS,
  CODE_PANE_GIT_GRAPH_CACHE_TTL_MS,
  CODE_PANE_GIT_STATUS_CACHE_TTL_MS,
  dedupeProjectRequest,
  getExternalLibraryCache,
  getGitGraphCache,
  getGitStatusCache,
  getGitSummaryCache,
  invalidateProjectCache,
  resetCodePaneProjectCacheForTests,
  setExternalLibraryCache,
  setGitGraphCache,
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
});
