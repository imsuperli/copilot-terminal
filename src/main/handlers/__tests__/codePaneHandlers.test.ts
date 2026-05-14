import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCodePaneHandlers } from '../codePaneHandlers';
import type { HandlerContext } from '../HandlerContext';

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

describe('registerCodePaneHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
  });

  it('prewarms the project language workspace when a root starts watching', async () => {
    const codePaneWatcherService = {
      watchRoot: vi.fn().mockResolvedValue(undefined),
      unwatchRoot: vi.fn().mockResolvedValue(undefined),
    };
    const codeProjectIndexService = {
      watchProjectForPane: vi.fn().mockResolvedValue(undefined),
      unwatchProjectForPane: vi.fn().mockResolvedValue(undefined),
    };
    const languageWorkspaceHostService = {
      prewarmProject: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = {
      codePaneWatcherService,
      codeProjectIndexService,
      languageWorkspaceHostService,
      getCurrentWorkspace: () => null,
      getMainWindow: () => null,
    } as unknown as HandlerContext;

    registerCodePaneHandlers(ctx);
    const watchRootHandler = getRegisteredHandler('code-pane-watch-root');
    const sender = { id: 42 };

    const response = await watchRootHandler({ sender }, {
      paneId: 'pane-code-1',
      rootPath: '/workspace/project',
    }) as { success: boolean };

    expect(codePaneWatcherService.watchRoot).toHaveBeenCalledWith('pane-code-1', '/workspace/project', sender);
    expect(codeProjectIndexService.watchProjectForPane).toHaveBeenCalledWith('pane-code-1', '/workspace/project');
    expect(languageWorkspaceHostService.prewarmProject).toHaveBeenCalledWith('/workspace/project');
    expect(response).toEqual({ success: true, data: undefined });
  });
});
