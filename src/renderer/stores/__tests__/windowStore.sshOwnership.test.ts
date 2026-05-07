import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../windowStore';
import { Window, WindowStatus } from '../../types/window';

function createSshWindow(id: string, options: {
  ephemeral?: boolean;
  ownerWindowId?: string;
} = {}): Window {
  const paneId = `${id}-pane`;

  return {
    id,
    name: id,
    activePaneId: paneId,
    kind: 'ssh',
    createdAt: '2026-05-07T00:00:00.000Z',
    lastActiveAt: '2026-05-07T00:00:00.000Z',
    ...(options.ephemeral ? { ephemeral: true } : {}),
    ...(options.ownerWindowId ? { sshTabOwnerWindowId: options.ownerWindowId } : {}),
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: '/srv/app',
        command: '',
        status: WindowStatus.Running,
        pid: 1001,
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
  };
}

describe('windowStore ssh ownership reassignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      groups: [],
      customCategories: [],
      activeWindowId: null,
      activeGroupId: null,
      groupMruList: [],
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
  });

  it('promotes a surviving ssh clone tab to the new owner when removing the old owner window', () => {
    const ownerWindow = createSshWindow('ssh-owner');
    const cloneWindowA = createSshWindow('ssh-clone-a', {
      ephemeral: true,
      ownerWindowId: ownerWindow.id,
    });
    const cloneWindowB = createSshWindow('ssh-clone-b', {
      ephemeral: true,
      ownerWindowId: ownerWindow.id,
    });

    useWindowStore.setState({
      windows: [ownerWindow, cloneWindowA, cloneWindowB],
      activeWindowId: ownerWindow.id,
      mruList: [ownerWindow.id, cloneWindowA.id, cloneWindowB.id],
    });

    useWindowStore.getState().removeWindow(ownerWindow.id);

    const state = useWindowStore.getState();
    expect(state.windows.map((window) => window.id)).toEqual(['ssh-clone-a', 'ssh-clone-b']);
    expect(state.windows[0].sshTabOwnerWindowId).toBe('ssh-clone-a');
    expect(state.windows[1].sshTabOwnerWindowId).toBe('ssh-clone-a');
  });
});
