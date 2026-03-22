import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPaneHandlers } from '../paneHandlers';
import type { HandlerContext } from '../HandlerContext';
import type { TerminalConfig } from '../../types/process';

const { mockIpcHandle } = vi.hoisted(() => ({
  mockIpcHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

function getRegisteredHandler(channel: string) {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  expect(call, `IPC handler ${channel} should be registered`).toBeTruthy();
  return call?.[1] as (event: unknown, payload: unknown) => Promise<unknown>;
}

describe('registerPaneHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
  });

  it('registers split-pane created PTY with StatusPoller', async () => {
    const unsubscribe = vi.fn();
    const processManager = {
      spawnTerminal: vi.fn().mockResolvedValue({ pid: 321, sessionId: 'session-321' }),
      subscribePtyData: vi.fn().mockReturnValue(unsubscribe),
      listProcesses: vi.fn().mockReturnValue([]),
      killProcess: vi.fn(),
    };
    const statusPoller = {
      addPane: vi.fn(),
      removePane: vi.fn(),
    };
    const ptySubscriptionManager = {
      add: vi.fn(),
      remove: vi.fn(),
    };
    const mainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
    };
    const ctx = {
      mainWindow,
      processManager,
      statusPoller,
      ptySubscriptionManager,
    } as unknown as HandlerContext;

    registerPaneHandlers(ctx);
    const splitPaneHandler = getRegisteredHandler('split-pane');
    const config: TerminalConfig = {
      workingDirectory: 'D:\\repo',
      windowId: 'win-1',
      paneId: 'pane-2',
      command: 'pwsh.exe',
    };

    const response = await splitPaneHandler({}, config) as { success: boolean; data?: { pid: number; sessionId: string } };

    expect(processManager.spawnTerminal).toHaveBeenCalledWith(config);
    expect(statusPoller.addPane).toHaveBeenCalledWith('win-1', 'pane-2', 321);
    expect(processManager.subscribePtyData).toHaveBeenCalledWith(321, expect.any(Function));
    expect(ptySubscriptionManager.add).toHaveBeenCalledWith('pane-2', unsubscribe);
    expect(response).toEqual({
      success: true,
      data: { pid: 321, sessionId: 'session-321' },
    });
  });

  it('removes closed pane from StatusPoller', async () => {
    const processManager = {
      spawnTerminal: vi.fn(),
      subscribePtyData: vi.fn(),
      listProcesses: vi.fn().mockReturnValue([
        {
          windowId: 'win-1',
          paneId: 'pane-2',
          pid: 321,
        },
      ]),
      killProcess: vi.fn().mockResolvedValue(undefined),
    };
    const statusPoller = {
      addPane: vi.fn(),
      removePane: vi.fn(),
    };
    const ptySubscriptionManager = {
      add: vi.fn(),
      remove: vi.fn(),
    };
    const ctx = {
      mainWindow: null,
      processManager,
      statusPoller,
      ptySubscriptionManager,
    } as unknown as HandlerContext;

    registerPaneHandlers(ctx);
    const closePaneHandler = getRegisteredHandler('close-pane');

    const response = await closePaneHandler({}, {
      windowId: 'win-1',
      paneId: 'pane-2',
    }) as { success: boolean };

    expect(ptySubscriptionManager.remove).toHaveBeenCalledWith('pane-2');
    expect(statusPoller.removePane).toHaveBeenCalledWith('pane-2');
    expect(processManager.killProcess).toHaveBeenCalledWith(321);
    expect(response).toEqual({ success: true, data: undefined });
  });
});
