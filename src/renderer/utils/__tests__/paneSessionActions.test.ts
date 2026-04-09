import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startPaneForWindow } from '../paneSessionActions';
import { Window, WindowStatus } from '../../types/window';

describe('paneSessionActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts an SSH pane from a minimal persisted binding by resolving the SSH profile', async () => {
    vi.mocked(window.electronAPI.getSSHProfile).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'ssh-profile-1',
        name: 'Termux dev',
        host: '127.0.0.1',
        port: 8022,
        user: 'u0_a123',
        auth: 'agent',
        privateKeys: [],
        keepaliveInterval: 30,
        keepaliveCountMax: 3,
        readyTimeout: null,
        verifyHostKeys: true,
        x11: false,
        skipBanner: false,
        agentForward: false,
        warnOnClose: true,
        reuseSession: true,
        forwardedPorts: [],
        tags: [],
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    });
    vi.mocked(window.electronAPI.startSSHPane).mockResolvedValueOnce({
      success: true,
      data: {
        pid: 1001,
        sessionId: 'ssh-session-1',
        status: WindowStatus.WaitingForInput,
      },
    });

    const pane = {
      id: 'ssh-pane-1',
      cwd: '~/develop/copilot-terminal',
      command: '',
      status: WindowStatus.Paused,
      pid: null,
      backend: 'ssh' as const,
      ssh: {
        profileId: 'ssh-profile-1',
      },
    };

    const targetWindow: Window = {
      id: 'ssh-window-1',
      name: 'Termux dev',
      activePaneId: 'ssh-pane-1',
      createdAt: '2026-04-09T00:00:00.000Z',
      lastActiveAt: '2026-04-09T00:00:00.000Z',
      kind: 'ssh',
      layout: {
        type: 'pane',
        id: 'ssh-pane-1',
        pane,
      },
    };

    const result = await startPaneForWindow(targetWindow, pane);

    expect(window.electronAPI.getSSHProfile).toHaveBeenCalledWith('ssh-profile-1');
    expect(window.electronAPI.startSSHPane).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 'ssh-window-1',
      paneId: 'ssh-pane-1',
      profileId: 'ssh-profile-1',
      remoteCwd: '~/develop/copilot-terminal',
    }));
    expect(result).toEqual({
      pid: 1001,
      sessionId: 'ssh-session-1',
      status: WindowStatus.WaitingForInput,
    });
  });
});
