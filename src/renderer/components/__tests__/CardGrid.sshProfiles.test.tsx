import type { ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    const onDuplicateSSHProfile = vi.fn();
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
      onDuplicateSSHProfile,
    });

    expect(screen.getByText('Prod Bastion')).toBeInTheDocument();
    expect(screen.getByText(/root@10.0.0.21:22/)).toBeInTheDocument();
    expect(screen.getByText('已保存密码')).toBeInTheDocument();
    expect(screen.queryByText('密码')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '启动' }));

    expect(onConnectSSHProfile).toHaveBeenCalledWith(profile);

    await user.click(screen.getByRole('button', { name: '复制 SSH 配置' }));

    expect(onDuplicateSSHProfile).toHaveBeenCalledWith(profile);
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

    expect(screen.getByRole('button', { name: '删除 SSH 卡片' })).toBeEnabled();
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

  it('renders bound SSH profile cards inside a custom category tab', async () => {
    const user = userEvent.setup();
    const profile = createSSHProfile();
    const runtimeWindow = createStandaloneSSHWindow(profile);
    const onEnterTerminal = vi.fn();
    const categoryId = 'category-ssh';

    useWindowStore.setState({
      windows: [runtimeWindow],
      customCategories: [
        {
          id: categoryId,
          name: 'SSH 分类',
          icon: '📁',
          windowIds: [runtimeWindow.id],
          groupIds: [],
          order: 0,
          createdAt: '2026-03-22T10:00:00.000Z',
          updatedAt: '2026-03-22T10:00:00.000Z',
        },
      ],
    });

    renderCardGrid({
      sshEnabled: true,
      sshProfiles: [profile],
      currentTab: categoryId,
      onEnterTerminal,
    });

    expect(screen.getByText('Prod Bastion')).toBeInTheDocument();
    expect(screen.queryByText('Hidden runtime window')).not.toBeInTheDocument();
    expect(screen.queryByText('此分类暂无终端')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Prod Bastion root@10.0.0.21:22' }));

    expect(onEnterTerminal).toHaveBeenCalledWith(runtimeWindow);
  });

  it('archives a bound SSH runtime window from the profile card and shows it in archived view', async () => {
    const user = userEvent.setup();
    const profile = createSSHProfile();
    const runtimeWindow = createStandaloneSSHWindow(profile);
    const closeWindowMock = vi.mocked(window.electronAPI.closeWindow);

    useWindowStore.setState({
      windows: [runtimeWindow],
    });

    const { rerender } = render(
      <DndProvider backend={HTML5Backend}>
        <CardGrid
          sshEnabled
          sshProfiles={[profile]}
          currentTab="active"
        />
      </DndProvider>,
    );

    await user.click(screen.getByRole('button', { name: '归档窗口' }));

    await waitFor(() => {
      expect(closeWindowMock).toHaveBeenCalledWith(runtimeWindow.id);
      expect(useWindowStore.getState().windows[0]?.archived).toBe(true);
    });

    rerender(
      <DndProvider backend={HTML5Backend}>
        <CardGrid
          sshEnabled
          sshProfiles={[profile]}
          currentTab="archived"
        />
      </DndProvider>,
    );

    expect(await screen.findByText('Hidden runtime window')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '取消归档' })).toBeInTheDocument();
  });

  it('deletes a bound SSH card by removing both the runtime window and the SSH profile', async () => {
    const user = userEvent.setup();
    const profile = createSSHProfile();
    const runtimeWindow = createStandaloneSSHWindow(profile);
    const deleteWindowMock = vi.mocked(window.electronAPI.deleteWindow);
    const onDeleteSSHProfile = vi.fn().mockResolvedValue(undefined);

    useWindowStore.setState({
      windows: [runtimeWindow],
    });

    renderCardGrid({
      sshEnabled: true,
      sshProfiles: [profile],
      onDeleteSSHProfile,
    });

    await user.click(screen.getByRole('button', { name: '删除 SSH 卡片' }));

    expect(screen.getByText('确定要删除 SSH 卡片 “Prod Bastion” 吗？此操作会同时删除关联的 1 个终端窗口、SSH 配置和已保存的凭据。')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '删除 SSH 卡片' }));

    await waitFor(() => {
      expect(deleteWindowMock).toHaveBeenCalledWith(runtimeWindow.id);
      expect(onDeleteSSHProfile).toHaveBeenCalledWith(profile);
      expect(useWindowStore.getState().windows).toHaveLength(0);
    });
  });

  it('blocks deleting an SSH card when another window still references the same SSH profile', async () => {
    const user = userEvent.setup();
    const profile = createSSHProfile();
    const runtimeWindow = createStandaloneSSHWindow(profile);
    const siblingWindow = createStandaloneSSHWindow(profile, {
      id: 'ssh-window-2',
      name: 'Sibling runtime window',
      activePaneId: 'ssh-pane-2',
      lastActiveAt: '2026-03-22T10:04:00.000Z',
      layout: {
        type: 'pane',
        id: 'layout-ssh-pane-2',
        pane: {
          id: 'ssh-pane-2',
          cwd: '/srv/app-2',
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
            remoteCwd: '/srv/app-2',
            reuseSession: true,
          },
        },
      },
    });

    useWindowStore.setState({
      windows: [runtimeWindow, siblingWindow],
    });

    renderCardGrid({
      sshEnabled: true,
      sshProfiles: [profile],
    });

    await user.click(screen.getByRole('button', { name: '删除 SSH 卡片' }));

    expect(screen.getByText('当前还有 1 个其他窗口在使用这条 SSH 配置，暂时不能删除该卡片。请先处理这些窗口。')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '删除 SSH 卡片' })).toBeDisabled();
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
