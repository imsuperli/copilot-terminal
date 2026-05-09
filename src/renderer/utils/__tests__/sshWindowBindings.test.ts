import { describe, expect, it } from 'vitest';
import { Window, WindowStatus } from '../../types/window';
import {
  buildStandaloneSSHWindowMap,
  getStandaloneSidebarWindows,
  getStandaloneSSHWindowsForTarget,
  getStandaloneWindows,
  getOwnedEphemeralSSHWindowIds,
  getSSHSessionOwnerWindowId,
  resolveStandaloneSSHWindowSwitchTarget,
} from '../sshWindowBindings';

function createSSHWindow(id: string, options: {
  ephemeral?: boolean;
  ownerWindowId?: string;
} = {}): Window {
  return {
    id,
    name: id,
    activePaneId: `${id}-pane`,
    createdAt: '2026-04-27T00:00:00.000Z',
    lastActiveAt: '2026-04-27T00:00:00.000Z',
    kind: 'ssh',
    ...(options.ephemeral ? { ephemeral: true } : {}),
    ...(options.ownerWindowId ? { sshTabOwnerWindowId: options.ownerWindowId } : {}),
    layout: {
      type: 'pane',
      id: `${id}-layout`,
      pane: {
        id: `${id}-pane`,
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

describe('sshWindowBindings owner resolution', () => {
  it('resolves an ephemeral clone tab to its owner window id', () => {
    const cloneWindow = createSSHWindow('clone', {
      ephemeral: true,
      ownerWindowId: 'owner',
    });

    expect(getSSHSessionOwnerWindowId(cloneWindow)).toBe('owner');
  });

  it('finds ephemeral clone tabs owned by a standalone ssh window', () => {
    const ownerWindow = createSSHWindow('owner');
    const ownedClone = createSSHWindow('clone-1', {
      ephemeral: true,
      ownerWindowId: ownerWindow.id,
    });
    const unrelatedClone = createSSHWindow('clone-2', {
      ephemeral: true,
      ownerWindowId: 'someone-else',
    });

    expect(getOwnedEphemeralSSHWindowIds([ownerWindow, ownedClone, unrelatedClone], ownerWindow.id)).toEqual(['clone-1']);
  });

  it('includes ssh clone tabs in standalone runtime navigation while excluding canvas-owned windows', () => {
    const ownerWindow = createSSHWindow('owner');
    const cloneWindow = createSSHWindow('clone', {
      ephemeral: true,
      ownerWindowId: ownerWindow.id,
    });
    const canvasOwnedWindow: Window = {
      ...createSSHWindow('canvas-owned'),
      ownerType: 'canvas-owned',
      ownerCanvasWorkspaceId: 'canvas-1',
    };

    expect(getStandaloneWindows([ownerWindow, cloneWindow, canvasOwnedWindow]).map((window) => window.id)).toEqual([
      'owner',
      'clone',
    ]);
  });

  it('returns a single sidebar representative for one ssh clone family and prefers the active clone', () => {
    const ownerWindow = createSSHWindow('owner');
    const cloneWindow = createSSHWindow('clone', {
      ephemeral: true,
      ownerWindowId: ownerWindow.id,
    });

    expect(getStandaloneSidebarWindows(
      [ownerWindow, cloneWindow],
      cloneWindow.id,
      [cloneWindow.id, ownerWindow.id],
    ).map((window) => window.id)).toEqual(['clone']);
  });

  it('keeps separate sidebar representatives for independent ssh windows on the same target', () => {
    const firstWindow = createSSHWindow('first');
    const secondWindow = createSSHWindow('second');

    expect(getStandaloneSidebarWindows(
      [firstWindow, secondWindow],
      secondWindow.id,
      [secondWindow.id, firstWindow.id],
    ).map((window) => window.id)).toEqual(['first', 'second']);
  });

  it('restores the most recent standalone ssh tab without crossing into canvas-owned windows', () => {
    const ownerWindow = createSSHWindow('owner');
    const cloneWindow = createSSHWindow('clone', {
      ephemeral: true,
      ownerWindowId: ownerWindow.id,
    });
    const canvasOwnedWindow: Window = {
      ...createSSHWindow('canvas-owned'),
      ownerType: 'canvas-owned',
      ownerCanvasWorkspaceId: 'canvas-1',
    };

    expect(resolveStandaloneSSHWindowSwitchTarget(
      [ownerWindow, cloneWindow, canvasOwnedWindow],
      ownerWindow.id,
      ['canvas-owned', 'clone', 'owner'],
    )).toBe('clone');
  });

  it('does not let canvas-owned ssh windows represent standalone ssh profile runtime', () => {
    const ownerWindow = createSSHWindow('owner');
    const canvasOwnedWindow: Window = {
      ...createSSHWindow('canvas-owned'),
      ownerType: 'canvas-owned',
      ownerCanvasWorkspaceId: 'canvas-1',
      lastActiveAt: '2026-04-27T01:00:00.000Z',
    };

    expect(buildStandaloneSSHWindowMap([ownerWindow, canvasOwnedWindow])['profile-1']?.id).toBe('owner');
  });

  it('keeps canvas-owned ssh windows out of standalone remote tab families', () => {
    const ownerWindow = createSSHWindow('owner');
    const secondStandaloneWindow = createSSHWindow('second-standalone');
    const canvasOwnedWindow: Window = {
      ...createSSHWindow('canvas-owned'),
      ownerType: 'canvas-owned',
      ownerCanvasWorkspaceId: 'canvas-1',
    };

    expect(getStandaloneSSHWindowsForTarget(
      [ownerWindow, secondStandaloneWindow, canvasOwnedWindow],
      ownerWindow.id,
    ).map((window) => window.id)).toEqual(['owner', 'second-standalone']);
    expect(getStandaloneSSHWindowsForTarget(
      [ownerWindow, secondStandaloneWindow, canvasOwnedWindow],
      canvasOwnedWindow.id,
    )).toEqual([]);
  });
});
