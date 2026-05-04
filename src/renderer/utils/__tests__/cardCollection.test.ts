import { describe, expect, it } from 'vitest';
import { SSHProfile } from '../../../shared/types/ssh';
import type { CanvasWorkspace } from '../../../shared/types/canvas';
import { Window, WindowStatus, type Pane } from '../../types/window';
import { createGroup } from '../groupLayoutHelpers';
import { createSinglePaneWindow, splitPane } from '../layoutHelpers';
import { getSidebarCardCounts, getStatusCardCounts } from '../cardCollection';

function makeWindow(status: WindowStatus, overrides: Partial<Window> = {}): Window {
  const window = createSinglePaneWindow(`window-${status}`, '/workspace', 'bash');

  if (window.layout.type === 'pane') {
    window.layout.pane.status = status;
  }

  return {
    ...window,
    ...overrides,
  };
}

function makeSplitWindow(
  firstStatus: WindowStatus,
  secondStatus: WindowStatus,
  overrides: Partial<Window> = {},
): Window {
  const baseWindow = makeWindow(firstStatus, overrides);
  const extraPane: Pane = {
    id: `${baseWindow.id}-extra-pane`,
    cwd: '/workspace',
    command: 'bash',
    status: secondStatus,
    pid: null,
  };

  return {
    ...baseWindow,
    layout: splitPane(baseWindow.layout, baseWindow.activePaneId, 'horizontal', extraPane) ?? baseWindow.layout,
  };
}

function makeSSHProfile(overrides: Partial<SSHProfile> = {}): SSHProfile {
  return {
    id: 'ssh-profile-1',
    name: 'Prod',
    host: '10.0.0.21',
    port: 22,
    user: 'root',
    auth: 'password',
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
    remoteCommand: '',
    defaultRemoteCwd: '/srv/app',
    tags: [],
    createdAt: '2026-04-11T00:00:00.000Z',
    updatedAt: '2026-04-11T00:00:00.000Z',
    ...overrides,
  };
}

function makeStandaloneSSHWindow(profileId: string, status: WindowStatus, overrides: Partial<Window> = {}): Window {
  const window = makeWindow(status, { kind: 'ssh', ...overrides });

  if (window.layout.type === 'pane') {
    window.layout.pane.backend = 'ssh';
    window.layout.pane.ssh = {
      profileId,
      host: '10.0.0.21',
      port: 22,
      user: 'root',
      authType: 'password',
      remoteCwd: '/srv/app',
      reuseSession: true,
    };
  }

  return window;
}

function makeCanvasWorkspace(overrides: Partial<CanvasWorkspace> = {}): CanvasWorkspace {
  return {
    id: 'canvas-1',
    name: 'Incident Map',
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    blocks: [],
    viewport: { tx: 0, ty: 0, zoom: 1 },
    nextZIndex: 1,
    ...overrides,
  };
}

describe('cardCollection', () => {
  it('matches builtin tab counts with CardGrid-style card visibility', () => {
    const profile = makeSSHProfile();
    const localWindow = makeWindow(WindowStatus.Running, { id: 'local-window' });
    const hiddenSSHWindowA = makeStandaloneSSHWindow(profile.id, WindowStatus.Running, { id: 'hidden-ssh-a' });
    const hiddenSSHWindowB = makeStandaloneSSHWindow(profile.id, WindowStatus.WaitingForInput, { id: 'hidden-ssh-b' });
    const groupLocalWindow = makeWindow(WindowStatus.Running, { id: 'group-local-window' });
    const groupSSHWindow = makeStandaloneSSHWindow(profile.id, WindowStatus.Running, { id: 'group-ssh-window' });
    const archivedWindow = makeWindow(WindowStatus.Paused, { id: 'archived-window', archived: true });
    const archivedGroupWindowA = makeWindow(WindowStatus.Paused, { id: 'archived-group-window-a', archived: true });
    const archivedGroupWindowB = makeWindow(WindowStatus.Completed, { id: 'archived-group-window-b', archived: true });

    const activeGroup = createGroup('Mixed Group', groupLocalWindow.id, groupSSHWindow.id);
    const archivedGroup = {
      ...createGroup('Archived Group', archivedGroupWindowA.id, archivedGroupWindowB.id),
      archived: true,
    };

    const counts = getSidebarCardCounts(
      [
        localWindow,
        hiddenSSHWindowA,
        hiddenSSHWindowB,
        groupLocalWindow,
        groupSSHWindow,
        archivedWindow,
        archivedGroupWindowA,
        archivedGroupWindowB,
      ],
      [activeGroup, archivedGroup],
      [
        makeCanvasWorkspace({ id: 'canvas-active' }),
        makeCanvasWorkspace({ id: 'canvas-archived', archived: true }),
      ],
      { sshEnabled: true, sshProfiles: [profile] },
    );

    expect(counts).toEqual({
      all: 7,
      active: 4,
      archived: 3,
      canvas: 1,
      local: 2,
      ssh: 2,
    });
  });

  it('counts status tabs by rendered cards rather than pane totals', () => {
    const profile = makeSSHProfile();
    const runningWindow = makeWindow(WindowStatus.Running, { id: 'running-window' });
    const waitingWindow = makeSplitWindow(WindowStatus.WaitingForInput, WindowStatus.WaitingForInput, { id: 'waiting-window' });
    const pausedWindow = makeWindow(WindowStatus.Paused, { id: 'paused-window' });
    const completedWindow = makeWindow(WindowStatus.Completed, { id: 'completed-window' });
    const hiddenSSHWindow = makeStandaloneSSHWindow(profile.id, WindowStatus.WaitingForInput, { id: 'hidden-ssh-window' });
    const pausedGroup = createGroup('Paused Group', pausedWindow.id, completedWindow.id);

    const counts = getStatusCardCounts(
      [
        runningWindow,
        waitingWindow,
        pausedWindow,
        completedWindow,
        hiddenSSHWindow,
      ],
      [pausedGroup],
      { sshEnabled: true, sshProfiles: [profile] },
    );

    expect(counts).toEqual({
      running: 1,
      waiting: 1,
      inactive: 1,
    });
  });
});
