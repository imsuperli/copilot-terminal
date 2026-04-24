import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useWindowStore } from '../../stores/windowStore';
import { useWindowSwitcher } from '../useWindowSwitcher';
import { WindowStatus } from '../../types/window';

describe('useWindowSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [
        {
          id: 'window-1',
          name: 'Window 1',
          activePaneId: 'pane-1',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          layout: {
            type: 'pane',
            id: 'pane-1',
            pane: {
              id: 'pane-1',
              cwd: 'D:/repo',
              command: 'pwsh.exe',
              status: WindowStatus.Paused,
            },
          },
        },
      ],
      activeWindowId: null,
    });
  });

  it('switches to terminal view before startWindow resolves', async () => {
    let resolveStartWindow: ((value: {
      success: true;
      data: { pid: number; sessionId: string; status: WindowStatus };
    }) => void) | null = null;

    const startWindowSpy = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveStartWindow = resolve;
    }));
    (window.electronAPI as any).startWindow = startWindowSpy;
    const onSwitchView = vi.fn();
    const { result } = renderHook(() => useWindowSwitcher(onSwitchView));

    await act(async () => {
      await result.current.switchToWindow('window-1');
    });

    expect(startWindowSpy).toHaveBeenCalledTimes(1);
    expect(onSwitchView).toHaveBeenCalledWith('window-1');
    expect(useWindowStore.getState().activeWindowId).toBe('window-1');
    expect(useWindowStore.getState().getPaneById('window-1', 'pane-1')?.status).toBe(WindowStatus.Restoring);
    expect(useWindowStore.getState().getPaneById('window-1', 'pane-1')?.pid).toBeUndefined();

    await act(async () => {
      resolveStartWindow?.({
        success: true,
        data: { pid: 1234, sessionId: 'session-1234', status: WindowStatus.WaitingForInput },
      });
    });

    await waitFor(() => {
      expect(useWindowStore.getState().getPaneById('window-1', 'pane-1')).toMatchObject({
        status: WindowStatus.WaitingForInput,
        pid: 1234,
        sessionId: 'session-1234',
      });
    });
  });

  it('keeps the terminal view active and restores pane state if background start fails', async () => {
    const startWindowSpy = vi.fn().mockRejectedValue(new Error('spawn failed'));
    (window.electronAPI as any).startWindow = startWindowSpy;

    const onSwitchView = vi.fn();
    const { result } = renderHook(() => useWindowSwitcher(onSwitchView));

    await act(async () => {
      await result.current.switchToWindow('window-1');
    });

    expect(onSwitchView).toHaveBeenCalledWith('window-1');
    expect(useWindowStore.getState().activeWindowId).toBe('window-1');

    await waitFor(() => {
      expect(useWindowStore.getState().getPaneById('window-1', 'pane-1')).toMatchObject({
        status: WindowStatus.Error,
      });
    });
  });
});
