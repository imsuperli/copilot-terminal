import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetTerminalPaneReplaySessionCacheForTests, TerminalPane } from '../TerminalPane';
import { WindowStatus } from '../../types/window';
import { subscribeToPanePtyData } from '../../api/ptyDataBus';
import type { PtyDataPayload } from '../../../shared/types/electron-api';

const { terminalInstances, ptyCallbacks, terminalDataCallbacks } = vi.hoisted(() => ({
  terminalInstances: [] as Array<{
    loadAddon: ReturnType<typeof vi.fn>;
    registerLinkProvider: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    blur: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    paste: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    getSelection: ReturnType<typeof vi.fn>;
    onData: ReturnType<typeof vi.fn>;
    onSelectionChange: ReturnType<typeof vi.fn>;
    attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
    options: Record<string, unknown>;
    cols: number;
    rows: number;
  }>,
  ptyCallbacks: [] as Array<(payload: PtyDataPayload) => void>,
  terminalDataCallbacks: [] as Array<(data: string) => void>,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation((options?: Record<string, unknown>) => {
    const instance = {
      loadAddon: vi.fn(),
      registerLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
      open: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      dispose: vi.fn(),
      write: vi.fn((data: string, callback?: () => void) => {
        if (data.includes('\u001b[c')) {
          terminalDataCallbacks.forEach((terminalDataCallback) => terminalDataCallback('\u001b[?1;2c'));
        }
        callback?.();
      }),
      paste: vi.fn((data: string) => {
        terminalDataCallbacks.forEach((terminalDataCallback) => terminalDataCallback(data));
      }),
      reset: vi.fn(),
      getSelection: vi.fn().mockReturnValue(''),
      onData: vi.fn((callback: (data: string) => void) => {
        terminalDataCallbacks.push(callback);
        return { dispose: vi.fn() };
      }),
      onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
      attachCustomKeyEventHandler: vi.fn(),
      options: { ...(options ?? {}) },
      cols: 120,
      rows: 40,
    };
    terminalInstances.push(instance);
    return instance;
  }),
}));

vi.mock('../../utils/xtermAddonFit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  })),
}));

vi.mock('../../api/ptyDataBus', () => ({
  subscribeToPanePtyData: vi.fn((windowId: string, paneId: string, callback: (payload: PtyDataPayload) => void) => {
    ptyCallbacks.push(callback);
    return vi.fn();
  }),
}));

vi.mock('../../styles/xterm.css', () => ({}));

describe('TerminalPane history replay', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetTerminalPaneReplaySessionCacheForTests();
    terminalInstances.length = 0;
    ptyCallbacks.length = 0;
    terminalDataCallbacks.length = 0;
    vi.mocked(window.electronAPI.getPtyHistory).mockReset();
    vi.mocked(window.electronAPI.ptyWrite).mockReset();
    vi.mocked(window.electronAPI.ptyResize).mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.mocked(window.electronAPI.ptyWrite).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.ptyResize).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.getPtyHistory).mockResolvedValue({
      success: true,
      data: { chunks: ['history-1', 'history-2'], lastSeq: 2 },
    });
  });

  afterEach(() => {
    cleanup();
    if (originalRequestAnimationFrame) {
      vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame);
    }
    if (originalCancelAnimationFrame) {
      vi.stubGlobal('cancelAnimationFrame', originalCancelAnimationFrame);
    }
  });

  it('replays history on mount and subscribes without buffered replay', async () => {
    render(
      <TerminalPane
        windowId="win-1"
        pane={{
          id: 'pane-1',
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1234,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.getPtyHistory).toHaveBeenCalledWith('pane-1');
    });

    expect(subscribeToPanePtyData).toHaveBeenCalledWith(
      'win-1',
      'pane-1',
      expect.any(Function),
      { replayBuffered: false },
    );

    await waitFor(() => {
      expect(terminalInstances[0]?.write.mock.calls[0]?.[0]).toBe('history-1history-2');
    });
  });

  it('deduplicates live output that is already covered by the history snapshot', async () => {
    let resolveHistory: ((value: { success: true; data: { chunks: string[]; lastSeq: number } }) => void) | null = null;

    vi.mocked(window.electronAPI.getPtyHistory).mockImplementation(
      () => new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );

    render(
      <TerminalPane
        windowId="win-1"
        pane={{
          id: 'pane-1',
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1234,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(ptyCallbacks).toHaveLength(1);
    });

    ptyCallbacks[0]?.({ windowId: 'win-1', paneId: 'pane-1', data: 'history-2', seq: 2 });
    resolveHistory?.({
      success: true,
      data: { chunks: ['history-1', 'history-2'], lastSeq: 2 },
    });

    await waitFor(() => {
      expect(terminalInstances[0]?.write.mock.calls[0]?.[0]).toBe('history-1history-2');
    });

    expect(terminalInstances[0]?.write).toHaveBeenCalledTimes(1);
  });

  it('writes startup protocol replies from the initial history replay back into the live PTY', async () => {
    vi.mocked(window.electronAPI.getPtyHistory).mockResolvedValue({
      success: true,
      data: { chunks: ['\u001b[c'], lastSeq: 1 },
    });

    render(
      <TerminalPane
        windowId="win-1"
        pane={{
          id: 'pane-1',
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1234,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(terminalInstances[0]?.write).toHaveBeenCalled();
    });

    expect(window.electronAPI.ptyWrite).toHaveBeenCalledWith(
      'win-1',
      'pane-1',
      '\u001b[?1;2c',
      { source: 'xterm.onData' },
    );
  });

  it('registers terminal link handling and routes OSC 8 activation through electron', async () => {
    render(
      <TerminalPane
        windowId="win-1"
        pane={{
          id: 'pane-1',
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1234,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(terminalInstances[0]?.registerLinkProvider).toHaveBeenCalledTimes(1);
    });

    const linkHandler = terminalInstances[0]?.options.linkHandler as {
      activate: (event: MouseEvent, text: string) => void;
    };

    linkHandler.activate(new MouseEvent('mouseup'), 'https://example.com/docs');

    await waitFor(() => {
      expect(window.electronAPI.openExternalUrl).toHaveBeenCalledWith('https://example.com/docs');
    });
  });

  it('routes right-click paste through xterm instead of direct pty writes', async () => {
    vi.mocked(window.electronAPI.readClipboardText).mockResolvedValue({
      success: true,
      data: 'pasted text',
    });

    const { container } = render(
      <TerminalPane
        windowId="win-1"
        pane={{
          id: 'pane-1',
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1234,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    const terminalContainer = container.querySelector('.overflow-hidden');
    expect(terminalContainer).toBeTruthy();

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    terminalContainer?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);

    await waitFor(() => {
      expect(terminalInstances[0]?.paste).toHaveBeenCalledWith('pasted text');
    });

    expect(window.electronAPI.ptyWrite).toHaveBeenCalledWith(
      'win-1',
      'pane-1',
      'pasted text',
      { source: 'xterm.onData' },
    );
    expect(
      vi.mocked(window.electronAPI.ptyWrite).mock.calls.some(([, , , metadata]) => metadata?.source === 'context-menu-paste'),
    ).toBe(false);
  });

  it('does not replay history again when a placeholder pane receives its first pid', async () => {
    const windowId = 'win-placeholder';
    const paneId = 'pane-placeholder';

    vi.mocked(window.electronAPI.getPtyHistory)
      .mockResolvedValueOnce({
        success: true,
        data: { chunks: [], lastSeq: 0 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { chunks: ['\u001b[c'], lastSeq: 1 },
      });

    const { rerender } = render(
      <TerminalPane
        windowId={windowId}
        pane={{
          id: paneId,
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Restoring,
          pid: null,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        vi.mocked(window.electronAPI.getPtyHistory).mock.calls.filter(([id]) => id === paneId),
      ).toHaveLength(1);
    });

    rerender(
      <TerminalPane
        windowId={windowId}
        pane={{
          id: paneId,
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1234,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        vi.mocked(window.electronAPI.getPtyHistory).mock.calls.filter(([id]) => id === paneId),
      ).toHaveLength(1);
    });

    expect(terminalInstances[0]?.reset).not.toHaveBeenCalled();
    expect(window.electronAPI.ptyWrite).not.toHaveBeenCalledWith(
      windowId,
      paneId,
      '\u001b[?1;2c',
      { source: 'xterm.onData' },
    );
  });

  it('resets and replays a fresh session when a paused pane starts again with a new pid', async () => {
    const windowId = 'win-fresh';
    const paneId = 'pane-fresh';

    vi.mocked(window.electronAPI.getPtyHistory)
      .mockResolvedValueOnce({
        success: true,
        data: { chunks: ['old-output'], lastSeq: 1 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { chunks: ['new-output'], lastSeq: 1 },
      });

    const { rerender } = render(
      <TerminalPane
        windowId={windowId}
        pane={{
          id: paneId,
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1111,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        vi.mocked(window.electronAPI.getPtyHistory).mock.calls.filter(([id]) => id === paneId),
      ).toHaveLength(1);
    });
    await waitFor(() => {
      expect(terminalInstances[0]?.write).toHaveBeenCalledWith('old-output', expect.any(Function));
    });

    rerender(
      <TerminalPane
        windowId={windowId}
        pane={{
          id: paneId,
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Paused,
          pid: null,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(terminalInstances[0]?.reset).toHaveBeenCalledTimes(1);
    });

    rerender(
      <TerminalPane
        windowId={windowId}
        pane={{
          id: paneId,
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 2222,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        vi.mocked(window.electronAPI.getPtyHistory).mock.calls.filter(([id]) => id === paneId),
      ).toHaveLength(2);
    });

    expect(terminalInstances[0]?.reset).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(terminalInstances[0]?.write).toHaveBeenLastCalledWith('new-output', expect.any(Function));
    });
  });

  it('suppresses replay-generated DA replies after the same pane session remounts', async () => {
    const windowId = 'win-remount';
    const paneId = 'pane-remount';

    vi.mocked(window.electronAPI.getPtyHistory).mockResolvedValue({
      success: true,
      data: { chunks: ['\u001b[c'], lastSeq: 1 },
    });

    const { unmount } = render(
      <TerminalPane
        windowId={windowId}
        pane={{
          id: paneId,
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1234,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(terminalInstances[0]?.write).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(window.electronAPI.ptyWrite).toHaveBeenCalledWith(
        windowId,
        paneId,
        '\u001b[?1;2c',
        { source: 'xterm.onData' },
      );
    });

    vi.mocked(window.electronAPI.ptyWrite).mockClear();
    unmount();

    render(
      <TerminalPane
        windowId={windowId}
        pane={{
          id: paneId,
          cwd: 'D:\\tmp',
          command: 'pwsh.exe',
          status: WindowStatus.Running,
          pid: 1234,
        }}
        isActive
        isWindowActive
        onActivate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        vi.mocked(window.electronAPI.getPtyHistory).mock.calls.filter(([id]) => id === paneId),
      ).toHaveLength(2);
    });

    expect(window.electronAPI.ptyWrite).not.toHaveBeenCalledWith(
      windowId,
      paneId,
      '\u001b[?1;2c',
      { source: 'xterm.onData' },
    );
  });
});
