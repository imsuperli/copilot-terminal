import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPtyDataForwarder } from '../ptyDataForwarder';

describe('createPtyDataForwarder', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('coalesces same-pane payloads within the same tick', async () => {
    const send = vi.fn();
    const mainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send },
    } as any;

    const forward = createPtyDataForwarder(() => mainWindow);

    forward({ windowId: 'win-1', paneId: 'pane-1', data: 'hel', seq: 1 });
    forward({ windowId: 'win-1', paneId: 'pane-1', data: 'lo', seq: 2 });

    expect(send).not.toHaveBeenCalled();

    await new Promise((resolve) => setImmediate(resolve));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('pty-data', {
      windowId: 'win-1',
      paneId: 'pane-1',
      data: 'hello',
      seq: 2,
    });
  });

  it('keeps different panes isolated when flushing', async () => {
    const send = vi.fn();
    const mainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: { send },
    } as any;

    const forward = createPtyDataForwarder(() => mainWindow);

    forward({ windowId: 'win-1', paneId: 'pane-1', data: 'left', seq: 1 });
    forward({ windowId: 'win-1', paneId: 'pane-2', data: 'right', seq: 3 });

    await new Promise((resolve) => setImmediate(resolve));

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, 'pty-data', {
      windowId: 'win-1',
      paneId: 'pane-1',
      data: 'left',
      seq: 1,
    });
    expect(send).toHaveBeenNthCalledWith(2, 'pty-data', {
      windowId: 'win-1',
      paneId: 'pane-2',
      data: 'right',
      seq: 3,
    });
  });
});
