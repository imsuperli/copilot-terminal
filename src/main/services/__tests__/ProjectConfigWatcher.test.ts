import fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectConfigWatcher } from '../ProjectConfigWatcher';
import type { FileWatcherService } from '../FileWatcherService';

describe('ProjectConfigWatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reuses the existing watcher when the project path is unchanged', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1,
      size: 10,
    } as fs.Stats);

    const fileWatcher = {} as FileWatcherService;
    const watcher = createProjectConfigWatcher(fileWatcher);
    const onUpdate = vi.fn();

    await watcher.startWatching('window-1', '/repo-a', onUpdate);
    await watcher.startWatching('window-1', '/repo-a', onUpdate);

    expect(watcher.getWatcherCount()).toBe(1);
    expect(watcher.getWatchedProjectPath('window-1')).toBe('/repo-a');
    watcher.stopAll();
  });

  it('recreates the watcher when the project path changes', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs.promises, 'stat')
      .mockResolvedValueOnce({
        isFile: () => true,
        mtimeMs: 1,
        size: 10,
      } as fs.Stats)
      .mockResolvedValueOnce({
        isFile: () => true,
        mtimeMs: 2,
        size: 20,
      } as fs.Stats);

    const fileWatcher = {} as FileWatcherService;
    const watcher = createProjectConfigWatcher(fileWatcher);
    const onUpdate = vi.fn();

    await watcher.startWatching('window-1', '/repo-a', onUpdate);
    await watcher.startWatching('window-1', '/repo-b', onUpdate);

    expect(watcher.getWatcherCount()).toBe(1);
    expect(watcher.getWatchedProjectPath('window-1')).toBe('/repo-b');
    watcher.stopAll();
  });
});
