import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerViewHandlers } from '../viewHandlers';
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
  return call?.[1] as (event: unknown, payload?: unknown) => Promise<unknown>;
}

describe('registerViewHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
  });

  it('forwards set-active-pane to StatusPoller', async () => {
    const viewSwitcher = {
      switchToTerminalView: vi.fn(),
      switchToUnifiedView: vi.fn(),
    };
    const statusPoller = {
      setActivePane: vi.fn(),
      clearActivePane: vi.fn(),
    };
    const ctx = {
      viewSwitcher,
      statusPoller,
    } as unknown as HandlerContext;

    registerViewHandlers(ctx);
    const setActivePaneHandler = getRegisteredHandler('set-active-pane');

    const response = await setActivePaneHandler({}, {
      windowId: 'win-1',
      paneId: 'pane-2',
    }) as { success: boolean };

    expect(statusPoller.setActivePane).toHaveBeenCalledWith('pane-2');
    expect(statusPoller.clearActivePane).not.toHaveBeenCalled();
    expect(response).toEqual({ success: true, data: undefined });
  });

  it('clears active pane when switching back to unified view', async () => {
    const viewSwitcher = {
      switchToTerminalView: vi.fn(),
      switchToUnifiedView: vi.fn(),
    };
    const statusPoller = {
      setActivePane: vi.fn(),
      clearActivePane: vi.fn(),
    };
    const ctx = {
      viewSwitcher,
      statusPoller,
    } as unknown as HandlerContext;

    registerViewHandlers(ctx);
    const switchToUnifiedViewHandler = getRegisteredHandler('switch-to-unified-view');

    const response = await switchToUnifiedViewHandler({}) as { success: boolean };

    expect(viewSwitcher.switchToUnifiedView).toHaveBeenCalledTimes(1);
    expect(statusPoller.clearActivePane).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ success: true, data: undefined });
  });

  it('forwards switch-to-canvas-view and clears active pane', async () => {
    const viewSwitcher = {
      switchToTerminalView: vi.fn(),
      switchToCanvasView: vi.fn(),
      switchToUnifiedView: vi.fn(),
    };
    const statusPoller = {
      setActivePane: vi.fn(),
      clearActivePane: vi.fn(),
    };
    const ctx = {
      viewSwitcher,
      statusPoller,
    } as unknown as HandlerContext;

    registerViewHandlers(ctx);
    const switchToCanvasViewHandler = getRegisteredHandler('switch-to-canvas-view');

    const response = await switchToCanvasViewHandler({}, {
      canvasWorkspaceId: 'canvas-1',
    }) as { success: boolean };

    expect(viewSwitcher.switchToCanvasView).toHaveBeenCalledWith('canvas-1');
    expect(statusPoller.clearActivePane).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ success: true, data: undefined });
  });
});
