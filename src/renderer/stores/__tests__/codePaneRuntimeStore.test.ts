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

  it('increments its public version when request state changes', () => {
    const store = new CodePaneRuntimeStore();
    const initialVersion = store.getVersion();
    const handle = store.beginRequest('search:files', 'File search');

    expect(store.getVersion()).toBe(initialVersion + 1);

    store.finishRequest(handle, 'completed');

    expect(store.getVersion()).toBe(initialVersion + 2);
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

  it('invalidates cached values by prefix', () => {
    const store = new CodePaneRuntimeStore();

    store.setCache('semantic:/a.ts:1', ['a']);
    store.setCache('semantic:/a.ts:2', ['b']);
    store.setCache('document-symbols:/a.ts', ['c']);

    store.invalidateCachePrefix('semantic:/a.ts:');

    expect(store.getCache<string[]>('semantic:/a.ts:1', 1000)).toBeNull();
    expect(store.getCache<string[]>('semantic:/a.ts:2', 1000)).toBeNull();
    expect(store.getCache<string[]>('document-symbols:/a.ts', 1000)).toEqual(['c']);
  });
});
