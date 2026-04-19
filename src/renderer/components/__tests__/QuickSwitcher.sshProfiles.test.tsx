import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickSwitcher } from '../QuickSwitcher';
import { useWindowStore } from '../../stores/windowStore';
import type { SSHProfile } from '../../../shared/types/ssh';
import { Window, WindowStatus } from '../../types/window';

function createSSHProfile(overrides: Partial<SSHProfile> = {}): SSHProfile {
  return {
    id: 'ssh-profile-1',
    name: 'Prod Bastion',
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
    tags: ['prod'],
    createdAt: '2026-03-22T10:00:00.000Z',
    updatedAt: '2026-03-22T10:00:00.000Z',
    ...overrides,
  };
}

function createStandaloneSSHWindow(profile: SSHProfile, overrides: Partial<Window> = {}): Window {
  return {
    id: 'ssh-window-1',
    name: 'Hidden runtime window',
    kind: 'ssh',
    activePaneId: 'ssh-pane-1',
    createdAt: '2026-03-22T10:05:00.000Z',
    lastActiveAt: '2026-03-22T10:05:00.000Z',
    layout: {
      type: 'pane',
      id: 'layout-ssh-pane-1',
      pane: {
        id: 'ssh-pane-1',
        cwd: '/srv/app',
        command: '/bin/zsh',
        status: WindowStatus.Running,
        pid: 1234,
        backend: 'ssh',
        ssh: {
          profileId: profile.id,
          host: profile.host,
          port: profile.port,
          user: profile.user,
          authType: profile.auth,
          remoteCwd: '/srv/app',
          reuseSession: true,
        },
      },
    },
    ...overrides,
  };
}

describe('QuickSwitcher SSH profile bindings', () => {
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
    vi.clearAllMocks();
  });

  it('shows the SSH profile card name and summary for a standalone SSH runtime window', async () => {
    const profile = createSSHProfile();
    const runtimeWindow = createStandaloneSSHWindow(profile);

    useWindowStore.setState({
      windows: [runtimeWindow],
      groups: [],
    });

    render(
      <QuickSwitcher
        isOpen
        currentWindowId={runtimeWindow.id}
        onClose={() => {}}
        onSelect={() => {}}
        sshProfiles={[profile]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Prod Bastion')).toBeInTheDocument();
    });

    expect(screen.queryByText('Hidden runtime window')).not.toBeInTheDocument();
    expect(screen.getByText('root@10.0.0.21:22 | /srv/app')).toBeInTheDocument();
  });

  it('matches standalone SSH runtime windows by SSH profile name when filtering', async () => {
    const user = userEvent.setup();
    const profile = createSSHProfile({ name: 'Release Bastion' });
    const runtimeWindow = createStandaloneSSHWindow(profile);

    useWindowStore.setState({
      windows: [runtimeWindow],
      groups: [],
    });

    render(
      <QuickSwitcher
        isOpen
        currentWindowId={runtimeWindow.id}
        onClose={() => {}}
        onSelect={() => {}}
        sshProfiles={[profile]}
      />,
    );

    await user.type(screen.getByRole('textbox'), 'release');

    await waitFor(() => {
      expect(
        screen.getAllByText((_, element) => element?.textContent === 'Release Bastion').length
      ).toBeGreaterThan(0);
    });
  });

  it('does not select or close when there are no filtered results', async () => {
    const user = userEvent.setup();
    const profile = createSSHProfile();
    const runtimeWindow = createStandaloneSSHWindow(profile);
    const onSelect = vi.fn();
    const onClose = vi.fn();

    useWindowStore.setState({
      windows: [runtimeWindow],
      groups: [],
    });

    render(
      <QuickSwitcher
        isOpen
        currentWindowId={runtimeWindow.id}
        onClose={onClose}
        onSelect={onSelect}
        sshProfiles={[profile]}
      />,
    );

    await user.type(screen.getByRole('textbox'), 'missing-target');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(
      screen.getByText(/No matching windows or groups found|没有找到匹配的窗口或窗口组/),
    ).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
