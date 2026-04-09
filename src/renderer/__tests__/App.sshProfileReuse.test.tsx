import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SSH_AUTH_FAILED_ERROR_CODE } from '../../shared/types/electron-api';
import { useWindowStore } from '../stores/windowStore';
import { Window, WindowStatus } from '../types/window';

const { mockCardGrid, mockUseViewSwitcher, mockUseWindowSwitcher, mockUseWorkspaceRestore } = vi.hoisted(() => ({
  mockCardGrid: vi.fn((props: { sshProfiles?: Array<{ id: string; name: string }>; onConnectSSHProfile?: (profile: { id: string; name: string }) => void }) => (
    <button
      type="button"
      onClick={() => props.onConnectSSHProfile?.(props.sshProfiles?.[0] as any)}
    >
      连接 SSH
    </button>
  )),
  mockUseViewSwitcher: vi.fn(),
  mockUseWindowSwitcher: vi.fn(),
  mockUseWorkspaceRestore: vi.fn(),
}));

vi.mock('../components/TerminalView', () => ({
  TerminalView: () => null,
}));

vi.mock('../components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: unknown }) => <div>{children as any}</div>,
}));

vi.mock('../components/layout/Sidebar', () => ({
  Sidebar: () => null,
}));

vi.mock('../components/EmptyState', () => ({
  EmptyState: () => null,
}));

vi.mock('../components/CardGrid', () => ({
  CardGrid: mockCardGrid,
}));

vi.mock('../components/GroupView', () => ({
  GroupView: () => null,
}));

vi.mock('../components/ViewSwitchError', () => ({
  ViewSwitchError: () => null,
}));

vi.mock('../components/CleanupOverlay', () => ({
  CleanupOverlay: () => null,
}));

vi.mock('../components/QuickNavPanel', () => ({
  QuickNavPanel: () => null,
}));

vi.mock('../components/CreateGroupDialog', () => ({
  CreateGroupDialog: () => null,
}));

vi.mock('../components/CreateWindowDialog', () => ({
  CreateWindowDialog: () => null,
}));

vi.mock('../components/CustomTitleBar', () => ({
  CustomTitleBar: () => null,
}));

vi.mock('../hooks/useViewSwitcher', () => ({
  useViewSwitcher: mockUseViewSwitcher,
}));

vi.mock('../hooks/useWindowSwitcher', () => ({
  useWindowSwitcher: mockUseWindowSwitcher,
}));

vi.mock('../hooks/useWorkspaceRestore', () => ({
  useWorkspaceRestore: mockUseWorkspaceRestore,
}));

import App from '../App';

function createSSHWindow(profileId: string, overrides: Partial<Window> = {}): Window {
  const paneId = 'pane-ssh-existing';

  return {
    id: 'win-ssh-existing',
    name: 'Prod SSH',
    activePaneId: paneId,
    createdAt: '2026-03-23T08:00:00.000Z',
    lastActiveAt: '2026-03-23T08:10:00.000Z',
    kind: 'ssh',
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: '~',
        command: '',
        status: WindowStatus.Running,
        pid: 2001,
        backend: 'ssh',
        ssh: {
          profileId,
          host: '10.0.0.21',
          port: 22,
          user: 'root',
          authType: 'password',
          reuseSession: true,
        },
      },
    },
    ...overrides,
  };
}

function createNewSSHWindow(profileId: string): Window {
  const paneId = 'pane-ssh-new';

  return {
    id: 'win-ssh-new',
    name: 'Prod SSH',
    activePaneId: paneId,
    createdAt: '2026-03-23T08:20:00.000Z',
    lastActiveAt: '2026-03-23T08:20:00.000Z',
    kind: 'ssh',
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: '~',
        command: '',
        status: WindowStatus.WaitingForInput,
        pid: 3001,
        backend: 'ssh',
        ssh: {
          profileId,
          host: '10.0.0.21',
          port: 22,
          user: 'root',
          authType: 'password',
          reuseSession: true,
        },
      },
    },
  };
}

describe('App SSH profile reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useWindowStore.setState({
      windows: [createSSHWindow('profile-1')],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      customCategories: [],
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    mockUseViewSwitcher.mockReturnValue({
      currentView: 'unified',
      switchToTerminalView: vi.fn(),
      switchToUnifiedView: vi.fn(),
      error: null,
    });
    mockUseWindowSwitcher.mockReturnValue({
      switchToWindow: vi.fn(),
    });
    mockUseWorkspaceRestore.mockImplementation(() => {});

    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        quickNav: { items: [] },
        features: { sshEnabled: true },
      } as any,
    });
    vi.mocked(window.electronAPI.listSSHProfiles).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'profile-1',
          name: 'Prod SSH',
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
          defaultRemoteCwd: '~/workspace/current',
          remoteCommand: 'zsh',
          forwardedPorts: [],
          tags: [],
          createdAt: '2026-03-23T08:00:00.000Z',
          updatedAt: '2026-03-23T08:00:00.000Z',
        },
      ],
    });
  });

  it('reuses an existing ssh window for the same profile instead of creating a new one', async () => {
    const user = userEvent.setup();
    const switchToWindow = vi.fn();
    mockUseWindowSwitcher.mockReturnValue({
      switchToWindow,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '连接 SSH' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '连接 SSH' }));

    expect(switchToWindow).toHaveBeenCalledWith('win-ssh-existing');
    expect(window.electronAPI.createSSHWindow).not.toHaveBeenCalled();
  });

  it('resyncs a paused reusable ssh window to the latest profile defaults before opening it', async () => {
    const user = userEvent.setup();
    const switchToWindow = vi.fn();

    useWindowStore.setState({
      windows: [
        createSSHWindow('profile-1', {
          name: 'Legacy SSH Name',
          layout: {
            type: 'pane',
            id: 'pane-ssh-existing',
            pane: {
              id: 'pane-ssh-existing',
              cwd: '/data/data/com.termux/files/home',
              command: '',
              status: WindowStatus.Paused,
              pid: null,
              backend: 'ssh',
              ssh: {
                profileId: 'profile-1',
              },
            },
          },
        }),
      ],
    });

    mockUseWindowSwitcher.mockReturnValue({
      switchToWindow,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '连接 SSH' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '连接 SSH' }));

    const reusableWindow = useWindowStore.getState().windows[0];
    expect(reusableWindow.name).toBe('Prod SSH');
    if (reusableWindow.layout.type !== 'pane') {
      throw new Error('expected pane layout');
    }
    expect(reusableWindow.layout.pane.cwd).toBe('~/workspace/current');
    expect(reusableWindow.layout.pane.command).toBe('zsh');
    expect(switchToWindow).toHaveBeenCalledWith('win-ssh-existing');
    expect(window.electronAPI.createSSHWindow).not.toHaveBeenCalled();
  });

  it('prompts for a password when starting a password-based ssh profile without a stored secret', async () => {
    const user = userEvent.setup();
    const switchToWindow = vi.fn();

    useWindowStore.setState({
      windows: [],
    });

    mockUseWindowSwitcher.mockReturnValue({
      switchToWindow,
    });

    vi.mocked(window.electronAPI.getSSHCredentialState).mockResolvedValue({
      success: true,
      data: {
        hasPassword: false,
        hasPassphrase: false,
      },
    });
    vi.mocked(window.electronAPI.setSSHPassword).mockResolvedValue({
      success: true,
    });
    vi.mocked(window.electronAPI.createSSHWindow).mockResolvedValue({
      success: true,
      data: createNewSSHWindow('profile-1'),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '连接 SSH' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '连接 SSH' }));

    expect(await screen.findByText('输入 SSH 密码')).toBeInTheDocument();

    await user.type(screen.getByLabelText('密码 / 交互认证密钥'), 'secret');
    await user.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(() => {
      expect(window.electronAPI.setSSHPassword).toHaveBeenCalledWith('profile-1', 'secret');
      expect(window.electronAPI.createSSHWindow).toHaveBeenCalledWith({
        profileId: 'profile-1',
        name: 'Prod SSH',
      });
    });

    expect(switchToWindow).toHaveBeenCalledWith('win-ssh-new');
  });

  it('re-prompts for the password when the server rejects the previous SSH secret', async () => {
    const user = userEvent.setup();
    const switchToWindow = vi.fn();

    useWindowStore.setState({
      windows: [],
    });

    mockUseWindowSwitcher.mockReturnValue({
      switchToWindow,
    });

    vi.mocked(window.electronAPI.getSSHCredentialState).mockResolvedValue({
      success: true,
      data: {
        hasPassword: false,
        hasPassphrase: false,
      },
    });
    vi.mocked(window.electronAPI.setSSHPassword).mockResolvedValue({
      success: true,
    });
    vi.mocked(window.electronAPI.clearSSHPassword).mockResolvedValue({
      success: true,
    });
    vi.mocked(window.electronAPI.createSSHWindow)
      .mockResolvedValueOnce({
        success: false,
        error: 'SSH authentication failed. The password or interactive secret was rejected by the server.',
        errorCode: SSH_AUTH_FAILED_ERROR_CODE,
      })
      .mockResolvedValueOnce({
        success: true,
        data: createNewSSHWindow('profile-1'),
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '连接 SSH' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '连接 SSH' }));

    expect(await screen.findByText('输入 SSH 密码')).toBeInTheDocument();

    await user.type(screen.getByLabelText('密码 / 交互认证密钥'), 'wrong-secret');
    await user.click(screen.getByRole('button', { name: '连接' }));

    expect(await screen.findByText('SSH 认证失败')).toBeInTheDocument();
    expect(screen.getByText('服务器拒绝了上一次认证请求。')).toBeInTheDocument();

    await user.type(screen.getByLabelText('密码 / 交互认证密钥'), 'correct-secret');
    await user.click(screen.getByRole('button', { name: '连接' }));

    await waitFor(() => {
      expect(window.electronAPI.setSSHPassword).toHaveBeenNthCalledWith(1, 'profile-1', 'wrong-secret');
      expect(window.electronAPI.clearSSHPassword).toHaveBeenCalledWith('profile-1');
      expect(window.electronAPI.setSSHPassword).toHaveBeenNthCalledWith(2, 'profile-1', 'correct-secret');
      expect(window.electronAPI.createSSHWindow).toHaveBeenCalledTimes(2);
    });

    expect(switchToWindow).toHaveBeenCalledWith('win-ssh-new');
  });
});
