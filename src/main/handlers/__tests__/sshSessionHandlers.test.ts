import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSSHSessionHandlers } from '../sshSessionHandlers';
import type { HandlerContext } from '../HandlerContext';
import { WindowStatus } from '../../../shared/types/window';

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

function createProfile() {
  return {
    id: 'profile-1',
    name: 'prod-web-01',
    host: '10.0.0.21',
    port: 22,
    user: 'root',
    auth: 'password' as const,
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
    tags: ['prod'],
    createdAt: '2026-03-22T10:00:00.000Z',
    updatedAt: '2026-03-22T10:00:00.000Z',
  };
}

describe('registerSSHSessionHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
  });

  it('creates SSH windows and wires pane output subscriptions', async () => {
    const unsubscribe = vi.fn();
    const processManager = {
      spawnTerminal: vi.fn().mockResolvedValue({ pid: 2201, sessionId: 'ssh-session-1' }),
      subscribePtyData: vi.fn().mockReturnValue(unsubscribe),
      getLatestPaneOutputSeq: vi.fn().mockReturnValue(0),
    };
    const sshProfileStore = {
      get: vi.fn().mockResolvedValue(createProfile()),
    };
    const sshVaultService = {
      get: vi.fn().mockResolvedValue({ profileId: 'profile-1', password: 'secret', updatedAt: '2026-03-22T10:00:00.000Z' }),
    };
    const statusPoller = {
      addPane: vi.fn(),
    };
    const ptySubscriptionManager = {
      add: vi.fn(),
    };
    const mainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
    };

    registerSSHSessionHandlers({
      mainWindow: mainWindow as any,
      processManager: processManager as any,
      statusPoller: statusPoller as any,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: ptySubscriptionManager as any,
      gitBranchWatcher: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: sshProfileStore as any,
      sshVaultService: sshVaultService as any,
      sshKnownHostsStore: null,
    } as HandlerContext);

    const handler = getRegisteredHandler('create-ssh-window');
    const response = await handler({}, {
      profileId: 'profile-1',
      remoteCwd: '/srv/app',
      command: 'bash',
    });

    expect(processManager.spawnTerminal).toHaveBeenCalledWith(expect.objectContaining({
      backend: 'ssh',
      workingDirectory: '/srv/app',
      command: 'bash',
      ssh: expect.objectContaining({
        profileId: 'profile-1',
        password: 'secret',
        reuseSession: true,
        remoteCwd: '/srv/app',
        command: 'bash',
      }),
    }));
    expect(processManager.subscribePtyData).toHaveBeenCalledWith(2201, expect.any(Function));
    expect(ptySubscriptionManager.add).toHaveBeenCalled();
    expect(statusPoller.addPane).toHaveBeenCalled();
    expect(response).toMatchObject({
      success: true,
      data: {
        kind: 'ssh',
        layout: {
          type: 'pane',
          pane: {
            backend: 'ssh',
            status: WindowStatus.WaitingForInput,
            pid: 2201,
            sessionId: 'ssh-session-1',
          },
        },
      },
    });
  });

  it('starts paused SSH panes from profile data', async () => {
    const processManager = {
      spawnTerminal: vi.fn().mockResolvedValue({ pid: 2202, sessionId: 'ssh-session-2' }),
      subscribePtyData: vi.fn().mockReturnValue(vi.fn()),
      getLatestPaneOutputSeq: vi.fn().mockReturnValue(0),
    };
    const sshProfileStore = {
      get: vi.fn().mockResolvedValue(createProfile()),
    };

    registerSSHSessionHandlers({
      mainWindow: null,
      processManager: processManager as any,
      statusPoller: { addPane: vi.fn() } as any,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: { add: vi.fn() } as any,
      gitBranchWatcher: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: sshProfileStore as any,
      sshVaultService: { get: vi.fn().mockResolvedValue(null) } as any,
      sshKnownHostsStore: null,
    } as HandlerContext);

    const handler = getRegisteredHandler('start-ssh-pane');
    const response = await handler({}, {
      windowId: 'win-1',
      paneId: 'pane-1',
      profileId: 'profile-1',
      remoteCwd: '/srv/app',
      command: 'bash',
    });

    expect(response).toEqual({
      success: true,
      data: {
        pid: 2202,
        sessionId: 'ssh-session-2',
        status: WindowStatus.WaitingForInput,
      },
    });
  });

  it('resolves jump host profiles into nested SSH session config', async () => {
    const processManager = {
      spawnTerminal: vi.fn().mockResolvedValue({ pid: 2204, sessionId: 'ssh-session-4' }),
      subscribePtyData: vi.fn().mockReturnValue(vi.fn()),
      getLatestPaneOutputSeq: vi.fn().mockReturnValue(0),
    };
    const sshProfileStore = {
      get: vi.fn().mockImplementation(async (profileId: string) => {
        if (profileId === 'jump-1') {
          return {
            ...createProfile(),
            id: 'jump-1',
            name: 'bastion',
            host: '10.0.0.10',
          };
        }

        return {
          ...createProfile(),
          jumpHostProfileId: 'jump-1',
        };
      }),
    };
    const sshVaultService = {
      get: vi.fn().mockImplementation(async (profileId: string) => {
        if (profileId === 'jump-1') {
          return { profileId, password: 'jump-secret', updatedAt: '2026-03-22T10:00:00.000Z' };
        }

        return { profileId, password: 'target-secret', updatedAt: '2026-03-22T10:00:00.000Z' };
      }),
    };

    registerSSHSessionHandlers({
      mainWindow: null,
      processManager: processManager as any,
      statusPoller: { addPane: vi.fn() } as any,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: { add: vi.fn() } as any,
      gitBranchWatcher: null,
      currentWorkspace: null,
      getCurrentWorkspace: () => null,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: sshProfileStore as any,
      sshVaultService: sshVaultService as any,
      sshKnownHostsStore: null,
    } as HandlerContext);

    const handler = getRegisteredHandler('create-ssh-window');
    await handler({}, {
      profileId: 'profile-1',
    });

    expect(processManager.spawnTerminal).toHaveBeenCalledWith(expect.objectContaining({
      ssh: expect.objectContaining({
        profileId: 'profile-1',
        jumpHostProfileId: 'jump-1',
        jumpHost: expect.objectContaining({
          profileId: 'jump-1',
          host: '10.0.0.10',
          password: 'jump-secret',
        }),
      }),
    }));
  });

  it('clones SSH panes from the current workspace layout', async () => {
    const processManager = {
      spawnTerminal: vi.fn().mockResolvedValue({ pid: 2203, sessionId: 'ssh-session-3' }),
      subscribePtyData: vi.fn().mockReturnValue(vi.fn()),
      getLatestPaneOutputSeq: vi.fn().mockReturnValue(0),
    };
    const sshProfileStore = {
      get: vi.fn().mockResolvedValue(createProfile()),
    };
    const workspace = {
      windows: [
        {
          id: 'win-source',
          name: 'prod-web-01',
          activePaneId: 'pane-source',
          createdAt: '2026-03-22T10:00:00.000Z',
          lastActiveAt: '2026-03-22T10:00:00.000Z',
          layout: {
            type: 'pane',
            id: 'pane-source',
            pane: {
              id: 'pane-source',
              cwd: '/srv/app',
              command: 'bash',
              status: WindowStatus.WaitingForInput,
              pid: 2201,
              backend: 'ssh',
              ssh: {
                profileId: 'profile-1',
                host: '10.0.0.21',
                port: 22,
                user: 'root',
                authType: 'password',
                remoteCwd: '/srv/app',
                reuseSession: true,
              },
            },
          },
        },
      ],
    };

    registerSSHSessionHandlers({
      mainWindow: null,
      processManager: processManager as any,
      statusPoller: { addPane: vi.fn() } as any,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: { add: vi.fn() } as any,
      gitBranchWatcher: null,
      currentWorkspace: workspace as any,
      getCurrentWorkspace: () => workspace as any,
      setCurrentWorkspace: () => undefined,
      sshProfileStore: sshProfileStore as any,
      sshVaultService: { get: vi.fn().mockResolvedValue(null) } as any,
      sshKnownHostsStore: null,
    } as HandlerContext);

    const handler = getRegisteredHandler('clone-ssh-pane');
    const response = await handler({}, {
      sourceWindowId: 'win-source',
      sourcePaneId: 'pane-source',
      targetWindowId: 'win-target',
      targetPaneId: 'pane-target',
    });

    expect(processManager.spawnTerminal).toHaveBeenCalledWith(expect.objectContaining({
      backend: 'ssh',
      windowId: 'win-target',
      paneId: 'pane-target',
      workingDirectory: '/srv/app',
    }));
    expect(response).toEqual({
      success: true,
      data: {
        pid: 2203,
        sessionId: 'ssh-session-3',
      },
    });
  });
});
