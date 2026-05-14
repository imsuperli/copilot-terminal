import { EventEmitter } from 'events';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodePaneWatcherService } from '../CodePaneWatcherService';

type MockWatcher = {
  close: ReturnType<typeof vi.fn>;
  emit: (event: string, changedPath: string) => void;
  on: (event: string, handler: (changedPath: string) => void) => MockWatcher;
};

function createMockWatcher(): MockWatcher {
  const handlers = new Map<string, (changedPath: string) => void>();
  const watcher: MockWatcher = {
    close: vi.fn().mockResolvedValue(undefined),
    emit: (event: string, changedPath: string) => {
      handlers.get(event)?.(changedPath);
    },
    on(event: string, handler: (changedPath: string) => void) {
      handlers.set(event, handler);
      return watcher;
    },
  };

  return watcher;
}

function createMockWebContents(id: number) {
  const emitter = new EventEmitter() as EventEmitter & {
    id: number;
    send: ReturnType<typeof vi.fn>;
    isDestroyed: () => boolean;
  };
  let destroyed = false;

  emitter.id = id;
  emitter.send = vi.fn();
  emitter.isDestroyed = () => destroyed;

  return {
    webContents: emitter,
    destroy: () => {
      destroyed = true;
      emitter.emit('destroyed');
    },
  };
}

describe('CodePaneWatcherService', () => {
  let tempRootPath: string;
  let mockWatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWatch = vi.fn();
  });

  beforeEach(async () => {
    tempRootPath = await fsPromises.mkdtemp(path.join(tmpdir(), 'code-pane-watcher-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fsPromises.rm(tempRootPath, { recursive: true, force: true });
  });

  it('routes file-system changes only to subscribed renderer webContents', async () => {
    const watcher = createMockWatcher();
    const mainWindowSend = vi.fn();
    const indexChanges = vi.fn().mockResolvedValue(undefined);

    mockWatch.mockReturnValue(watcher);

    const service = new CodePaneWatcherService(
      () => ({
        isDestroyed: () => false,
        webContents: {
          send: mainWindowSend,
        },
      }) as any,
      indexChanges,
      async () => ({
        watch: mockWatch,
      }),
    );
    const targetA = createMockWebContents(101);
    const targetB = createMockWebContents(202);

    await service.watchRoot('pane-a', tempRootPath, targetA.webContents as any);
    await service.watchRoot('pane-b', tempRootPath, targetA.webContents as any);
    await service.watchRoot('pane-c', tempRootPath, targetB.webContents as any);

    const changedFilePath = path.join(tempRootPath, 'docs', 'readme.md');
    watcher.emit('change', changedFilePath);
    await vi.advanceTimersByTimeAsync(100);

    expect(targetA.webContents.send).toHaveBeenCalledTimes(1);
    expect(targetA.webContents.send).toHaveBeenCalledWith('code-pane-fs-changed', {
      rootPath: tempRootPath,
      changes: [
        {
          type: 'change',
          path: changedFilePath,
        },
      ],
    });
    expect(targetB.webContents.send).toHaveBeenCalledTimes(1);
    expect(mainWindowSend).not.toHaveBeenCalled();
    expect(indexChanges).toHaveBeenCalledWith(tempRootPath, [
      {
        type: 'change',
        path: changedFilePath,
      },
    ]);

    await service.destroy();
  });

  it('retargets an existing pane subscription to the latest renderer webContents', async () => {
    const watcher = createMockWatcher();
    mockWatch.mockReturnValue(watcher);

    const service = new CodePaneWatcherService(
      () => null,
      vi.fn(),
      async () => ({
        watch: mockWatch.mockReturnValue(watcher),
      }),
    );
    const originalTarget = createMockWebContents(301);
    const replacementTarget = createMockWebContents(302);

    await service.watchRoot('pane-a', tempRootPath, originalTarget.webContents as any);
    await service.watchRoot('pane-a', tempRootPath, replacementTarget.webContents as any);

    watcher.emit('change', path.join(tempRootPath, 'app.py'));
    await vi.advanceTimersByTimeAsync(100);

    expect(originalTarget.webContents.send).not.toHaveBeenCalled();
    expect(replacementTarget.webContents.send).toHaveBeenCalledTimes(1);

    await service.destroy();
  });

  it('removes pane subscriptions when their renderer is destroyed', async () => {
    const watcher = createMockWatcher();
    mockWatch.mockReturnValue(watcher);

    const service = new CodePaneWatcherService(
      () => null,
      vi.fn(),
      async () => ({
        watch: mockWatch.mockReturnValue(watcher),
      }),
    );
    const target = createMockWebContents(401);

    await service.watchRoot('pane-a', tempRootPath, target.webContents as any);
    target.destroy();
    await vi.runAllTimersAsync();

    expect(watcher.close).toHaveBeenCalledTimes(1);

    await service.destroy();
  });
});
