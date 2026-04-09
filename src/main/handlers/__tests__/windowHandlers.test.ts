import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerWindowHandlers } from '../windowHandlers';
import type { HandlerContext } from '../HandlerContext';

const { mockIpcHandle, mockProjectConfigStopWatching } = vi.hoisted(() => ({
  mockIpcHandle: vi.fn(),
  mockProjectConfigStopWatching: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

vi.mock('../../services/ProjectConfigWatcher', () => ({
  projectConfigWatcher: {
    startWatching: vi.fn(),
    stopWatching: mockProjectConfigStopWatching,
  },
}));

function getRegisteredHandler(channel: string) {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  expect(call, `IPC handler ${channel} should be registered`).toBeTruthy();
  return call?.[1] as (event: unknown, payload: unknown) => Promise<unknown>;
}

describe('registerWindowHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
    mockProjectConfigStopWatching.mockReset();
  });

  it('unwatches git branches when deleting a window', async () => {
    const processManager = {
      listProcesses: vi.fn().mockReturnValue([
        { windowId: 'win-1', paneId: 'pane-1', pid: 321 },
      ]),
      killProcess: vi.fn().mockResolvedValue(undefined),
      subscribePtyData: vi.fn(),
      spawnTerminal: vi.fn(),
      getPidByPane: vi.fn(),
      hasPtyOutput: vi.fn(),
    };
    const statusPoller = {
      removeWindow: vi.fn(),
    };
    const ptySubscriptionManager = {
      removeByWindow: vi.fn(),
    };
    const gitBranchWatcher = {
      unwatch: vi.fn(),
    };
    const ctx = {
      mainWindow: null,
      processManager,
      statusPoller,
      ptySubscriptionManager,
      gitBranchWatcher,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: vi.fn(),
    } as unknown as HandlerContext;

    registerWindowHandlers(ctx);
    const deleteWindowHandler = getRegisteredHandler('delete-window');

    const response = await deleteWindowHandler({}, {
      windowId: 'win-1',
    }) as { success: boolean };

    expect(ptySubscriptionManager.removeByWindow).toHaveBeenCalledWith('win-1', processManager);
    expect(processManager.killProcess).toHaveBeenCalledWith(321);
    expect(statusPoller.removeWindow).toHaveBeenCalledWith('win-1');
    expect(gitBranchWatcher.unwatch).toHaveBeenCalledWith('win-1');
    expect(mockProjectConfigStopWatching).toHaveBeenCalledWith('win-1');
    expect(response).toEqual({ success: true, data: undefined });
  });
});
