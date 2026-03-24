import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardGrid } from '../CardGrid';
import { useWindowStore } from '../../stores/windowStore';
import { SSHProfile } from '../../../shared/types/ssh';
import { Window, WindowStatus } from '../../types/window';
import { getStatusColorValue } from '../../utils/statusHelpers';

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

function renderCardGrid(props: ComponentProps<typeof CardGrid>) {
  return render(
    <DndProvider backend={HTML5Backend}>
      <CardGrid {...props} />
    </DndProvider>,
  );
}

describe('CardGrid SSH profile cards', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      mruList: [],
      groupMruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
      customCategories: [],
      terminalSidebarFilter: 'all',
    });
    vi.clearAllMocks();
  });

  it('renders SSH profile cards and forwards connect actions', async () => {
    const user = userEvent.setup();
    const onConnectSSHProfile = vi.fn();
    const profile = createSSHProfile();

    renderCardGrid({
      sshEnabled: true,
      sshProfiles: [profile],
      sshCredentialStates: {
        [profile.id]: {
          hasPassword: true,
          hasPassphrase: false,
        },
      },
      onConnectSSHProfile,
    });

    expect(screen.getByText('Prod Bastion')).toBeInTheDocument();
    expect(screen.getByText(/root@10.0.0.21:22/)).toBeInTheDocument();
    expect(screen.getByText('已保存密码')).toBeInTheDocument();
    expect(screen.queryByText('密码')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '启动' }));

    expect(onConnectSSHProfile).toHaveBeenCalledWith(profile);
  });

  it('surfaces ssh routing metadata on profile cards', () => {
    const profile = createSSHProfile({
      jumpHostProfileId: 'jump-1',
      socksProxyHost: '127.0.0.1',
      forwardedPorts: [
        {
          id: 'forward-1',
          type: 'local',
          localHost: '127.0.0.1',
          localPort: 15432,
          remoteHost: '10.0.0.22',
          remotePort: 5432,
        },
        {
          id: 'forward-2',
          type: 'remote',
          remoteHost: '0.0.0.0',
          remotePort: 18080,
          localHost: '127.0.0.1',
          localPort: 8080,
        },
      ],
    });

    renderCardGrid({
      sshEnabled: true,
      sshProfiles: [profile],
    });

    expect(screen.getByText('跳板机')).toBeInTheDocument();
    expect(screen.getByText('SOCKS 代理')).toBeInTheDocument();
    expect(screen.getByText('2 个转发')).toBeInTheDocument();
  });

  it('does not render the in-use badge and keeps profile deletion available', () => {
    const profile = createSSHProfile();

    renderCardGrid({
      sshEnabled: true,
      sshProfiles: [profile],
    });

    expect(screen.getByRole('button', { name: '删除 SSH 配置' })).toBeEnabled();
    expect(screen.queryByText(/已被 .* 个窗口使用/)).not.toBeInTheDocument();
  });

  it('binds a standalone SSH runtime window back onto the SSH profile card', async () => {
    const user = userEvent.setup();
    const profile = createSSHProfile();
    const runtimeWindow = createStandaloneSSHWindow(profile);
    const onConnectSSHProfile = vi.fn();
    const onEnterTerminal = vi.fn();

    useWindowStore.setState({
      windows: [runtimeWindow],
    });

    renderCardGrid({
      sshEnabled: true,
      sshProfiles: [profile],
      onConnectSSHProfile,
      onEnterTerminal,
    });

    expect(screen.queryByText('Hidden runtime window')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
    expect(screen.queryByText('运行中')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Prod Bastion root@10.0.0.21:22' }));

    expect(onConnectSSHProfile).not.toHaveBeenCalled();
    expect(onEnterTerminal).toHaveBeenCalledWith(runtimeWindow);
  });

  it('uses the paused status color for bound SSH cards', () => {
    const profile = createSSHProfile();
    const runtimeWindow = createStandaloneSSHWindow(profile, {
      layout: {
        type: 'pane',
        id: 'layout-ssh-pane-1',
        pane: {
          id: 'ssh-pane-1',
          cwd: '/srv/app',
          command: '/bin/zsh',
          status: WindowStatus.Paused,
          pid: null,
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
    });

    useWindowStore.setState({
      windows: [runtimeWindow],
    });

    renderCardGrid({
      sshEnabled: true,
      sshProfiles: [profile],
    });

    expect(screen.getByRole('button', { name: 'Prod Bastion root@10.0.0.21:22' })).toHaveStyle({
      borderTop: `2px solid ${getStatusColorValue(WindowStatus.Paused)}`,
    });
  });
});
