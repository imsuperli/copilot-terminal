import fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectConfigWatcher } from '../ProjectConfigWatcher';
import type { FileWatcherService } from '../FileWatcherService';

describe('ProjectConfigWatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses the existing watcher when the project path is unchanged', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const unwatch = vi.fn();
    const fileWatcher = {
      watch: vi.fn().mockResolvedValue(unwatch),
    } as unknown as FileWatcherService;

    const watcher = createProjectConfigWatcher(fileWatcher);
    const onUpdate = vi.fn();

    await watcher.startWatching('window-1', '/repo-a', onUpdate);
    await watcher.startWatching('window-1', '/repo-a', onUpdate);

    expect(fileWatcher.watch).toHaveBeenCalledTimes(1);
    expect(unwatch).not.toHaveBeenCalled();
    expect(watcher.getWatcherCount()).toBe(1);
  });

  it('recreates the watcher when the project path changes', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const firstUnwatch = vi.fn();
    const secondUnwatch = vi.fn();
    const fileWatcher = {
      watch: vi.fn()
        .mockResolvedValueOnce(firstUnwatch)
        .mockResolvedValueOnce(secondUnwatch),
    } as unknown as FileWatcherService;

    const watcher = createProjectConfigWatcher(fileWatcher);
    const onUpdate = vi.fn();

    await watcher.startWatching('window-1', '/repo-a', onUpdate);
    await watcher.startWatching('window-1', '/repo-b', onUpdate);

    expect(fileWatcher.watch).toHaveBeenCalledTimes(2);
    expect(firstUnwatch).toHaveBeenCalledTimes(1);
    expect(secondUnwatch).not.toHaveBeenCalled();
    expect(watcher.getWatcherCount()).toBe(1);
    expect(watcher.getWatchedProjectPath('window-1')).toBe('/repo-b');
  });
});
