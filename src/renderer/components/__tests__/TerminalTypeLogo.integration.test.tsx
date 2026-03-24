import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WindowCard } from '../WindowCard';
import { QuickSwitcherGroupItem } from '../QuickSwitcherGroupItem';
import { SSHProfileCard } from '../SSHProfileCard';
import { useWindowStore } from '../../stores/windowStore';
import type { Window } from '../../types/window';
import { WindowStatus } from '../../types/window';
import type { WindowGroup } from '../../../shared/types/window-group';
import type { SSHProfile } from '../../../shared/types/ssh';

function createWindow(overrides: Partial<Window> = {}): Window {
  return {
    id: 'window-1',
    name: 'Mixed Terminal',
    activePaneId: 'pane-local',
    createdAt: '2026-03-24T08:00:00.000Z',
    lastActiveAt: '2026-03-24T08:00:00.000Z',
    layout: {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        {
          type: 'pane',
          id: 'layout-pane-local',
          pane: {
            id: 'pane-local',
            cwd: '/workspace/app',
            command: '/bin/zsh',
            status: WindowStatus.Running,
            pid: 1001,
            backend: 'local',
          },
        },
        {
          type: 'pane',
          id: 'layout-pane-ssh',
          pane: {
            id: 'pane-ssh',
            cwd: '/srv/app',
            command: '/bin/zsh',
            status: WindowStatus.WaitingForInput,
            pid: 1002,
            backend: 'ssh',
            ssh: {
              profileId: 'ssh-profile-1',
              host: '10.0.0.8',
              port: 22,
              user: 'root',
              authType: 'password',
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

function createGroup(windowId: string): WindowGroup {
  return {
    id: 'group-1',
    name: 'Ops Split Workspace',
    activeWindowId: windowId,
    createdAt: '2026-03-24T08:00:00.000Z',
    lastActiveAt: '2026-03-24T08:00:00.000Z',
    layout: {
      type: 'window',
      id: windowId,
    },
  };
}

function createSSHProfile(): SSHProfile {
  return {
    id: 'ssh-profile-1',
    name: 'Prod Bastion',
    host: '10.0.0.8',
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
    createdAt: '2026-03-24T08:00:00.000Z',
    updatedAt: '2026-03-24T08:00:00.000Z',
  };
}

describe('terminal type logo integration', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      mruList: [],
      groupMruList: [],
      sidebarExpanded: false,
      sidebarWidth: 220,
      customCategories: [],
      terminalSidebarFilter: 'all',
    });
  });

  it('renders the mixed logo on window cards when local and ssh panes coexist', async () => {
    const terminalWindow = createWindow();

    render(<WindowCard window={terminalWindow} />);

    await waitFor(() => {
      expect(screen.getByTestId('window-card-logo-mixed')).toHaveAttribute('data-terminal-type-logo', 'mixed');
    });
  });

  it('renders the group logo in the quick switcher group item', () => {
    const terminalWindow = createWindow();
    const group = createGroup(terminalWindow.id);

    useWindowStore.setState({
      windows: [terminalWindow],
      groups: [group],
    });

    render(<QuickSwitcherGroupItem group={group} isSelected={false} query="" />);

    expect(screen.getByTestId('quick-switcher-logo-group')).toHaveAttribute('data-terminal-type-logo', 'group');
  });

  it('renders the remote logo on ssh profile cards', () => {
    render(<SSHProfileCard profile={createSSHProfile()} />);

    expect(screen.getByTestId('ssh-profile-card-logo')).toHaveAttribute('data-terminal-type-logo', 'ssh');
  });
});
