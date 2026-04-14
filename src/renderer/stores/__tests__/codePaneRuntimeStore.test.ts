import { describe, expect, it, vi } from 'vitest';
import { CodePaneRuntimeStore } from '../codePaneRuntimeStore';

describe('CodePaneRuntimeStore', () => {
  it('tracks the latest version for a request key', () => {
    const store = new CodePaneRuntimeStore();

    const firstVersion = store.markLatest('search:files');
    const secondVersion = store.markLatest('search:files');

    expect(store.isLatest('search:files', firstVersion)).toBe(false);
    expect(store.isLatest('search:files', secondVersion)).toBe(true);
  });

  it('stores request lifecycle entries with durations', () => {
    const store = new CodePaneRuntimeStore();
    const handle = store.beginRequest('workspace-symbols', 'Workspace symbols', 'query=service');

    store.finishRequest(handle, 'completed');

    expect(store.getRunningRequests()).toEqual([]);
    expect(store.getRecentRequests()[0]).toEqual(expect.objectContaining({
      key: 'workspace-symbols',
      label: 'Workspace symbols',
      meta: 'query=service',
      status: 'completed',
    }));
    expect(store.getRecentRequests()[0]?.durationMs).toBeTypeOf('number');
  });

  it('expires cached values after the configured TTL', () => {
    vi.useFakeTimers();
    const store = new CodePaneRuntimeStore();

    store.setCache('files:todo', ['a.ts']);
    expect(store.getCache<string[]>('files:todo', 1000)).toEqual(['a.ts']);

    vi.advanceTimersByTime(1001);
    expect(store.getCache<string[]>('files:todo', 1000)).toBeNull();
    vi.useRealTimers();
  });
});
