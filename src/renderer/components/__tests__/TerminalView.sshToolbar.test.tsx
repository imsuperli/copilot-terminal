import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalView } from '../TerminalView';
import { useWindowStore } from '../../stores/windowStore';
import { Window, WindowStatus } from '../../types/window';

const { mockSftpDialog, mockPortForwardDialog } = vi.hoisted(() => ({
  mockSftpDialog: vi.fn(),
  mockPortForwardDialog: vi.fn(),
}));

vi.mock('../Sidebar', () => ({
  Sidebar: () => null,
}));

vi.mock('../QuickSwitcher', () => ({
  QuickSwitcher: () => null,
}));

vi.mock('../SettingsPanel', () => ({
  SettingsPanel: () => null,
}));

vi.mock('react-dnd', () => ({
  useDrag: () => [{ isDragging: false }, () => undefined, () => undefined],
}));

vi.mock('react-dnd-html5-backend', () => ({
  getEmptyImage: () => ({}),
}));

vi.mock('../ProjectLinks', () => ({
  ProjectLinks: () => null,
}));

vi.mock('../SplitLayout', () => ({
  SplitLayout: (props: { activePaneId?: string; onPaneExit?: (paneId: string) => void }) => (
    <div data-testid="split-layout">
      {props.onPaneExit && props.activePaneId ? (
        <button type="button" aria-label="模拟窗格退出" onClick={() => props.onPaneExit?.(props.activePaneId!)}>
          模拟窗格退出
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('../dnd', () => ({
  DragItemTypes: {
    BROWSER_TOOL: 'BROWSER_TOOL',
    BROWSER_PANE: 'BROWSER_PANE',
  },
  DropZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../icons/IDEIcons', () => ({
  IDEIcon: () => <span data-testid="ide-icon" />,
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}));

vi.mock('../../hooks/useIDESettings', () => ({
  useIDESettings: () => ({
    enabledIDEs: [
      { id: 'vscode', name: 'VS Code', icon: '' },
      { id: 'jetbrains', name: 'WebStorm', icon: '' },
    ],
  }),
}));

vi.mock('../../utils/sshConnectionRetry', () => ({
  isSSHPasswordPromptCancelled: () => false,
  runSSHActionWithPasswordRetry: async ({ action }: { action: () => Promise<unknown> }) => action(),
}));

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      switch (key) {
        case 'common.openInIDE':
          return `在 ${vars?.name} 中打开`;
        case 'terminalView.openFolder':
          return '打开文件夹';
        case 'terminalView.openSftp':
          return '打开 SSH 文件面板';
        case 'terminalView.showSshMonitor':
          return '显示 SSH 监控';
        case 'terminalView.hideSshMonitor':
          return '隐藏 SSH 监控';
        case 'terminalView.managePortForwards':
          return '管理 SSH 端口转发';
        case 'terminalView.cloneSshTerminal':
          return '克隆 SSH 终端';
        case 'terminalView.splitHorizontal':
          return '水平分屏';
        case 'terminalView.splitVertical':
          return '垂直分屏';
        case 'terminalView.archive':
          return '归档';
        case 'common.close':
          return '关闭';
        case 'terminalView.stop':
          return '停止';
        case 'terminalView.restart':
          return '重启';
        case 'terminalView.start':
          return '启动';
        case 'terminalView.remoteTabs':
          return '远程终端';
        case 'terminalView.newRemoteTab':
          return '新建远程终端';
        default:
          return key;
      }
    },
    language: 'zh-CN',
    setLanguage: vi.fn(),
  }),
}));

vi.mock('../SSHSftpDialog', () => ({
  SSHSftpDialog: (props: { open: boolean; windowId: string | null; paneId: string | null; initialPath?: string | null }) => {
    mockSftpDialog(props);
    return props.open ? (
      <div data-testid="ssh-sftp-dialog">
        {`${props.windowId}:${props.paneId}:${props.initialPath ?? ''}`}
      </div>
    ) : null;
  },
}));

vi.mock('../SSHSessionStatusBar', () => ({
  SSHSessionStatusBar: (props: { windowId: string | null; paneId: string | null; currentCwd?: string | null; onClose?: () => void }) => (
    <div data-testid="ssh-session-status-bar">
      {`${props.windowId}:${props.paneId}:${props.currentCwd ?? ''}`}
      {props.onClose ? <button type="button" onClick={props.onClose}>关闭监控</button> : null}
    </div>
  ),
}));

vi.mock('../SSHPortForwardDialog', () => ({
  SSHPortForwardDialog: (props: { open: boolean; windowId: string | null; paneId: string | null }) => {
    mockPortForwardDialog(props);
    return props.open ? <div data-testid="ssh-port-forward-dialog">{`${props.windowId}:${props.paneId}`}</div> : null;
  },
}));

function createSSHWindow(options: {
  id?: string;
  paneId?: string;
  name?: string;
  profileId?: string;
  host?: string;
  port?: number;
  user?: string;
  cwd?: string;
  remoteCwd?: string;
  lastActiveAt?: string;
  ephemeral?: boolean;
  sshTabOwnerWindowId?: string;
} = {}): Window {
  const paneId = options.paneId ?? 'pane-ssh-1';
  const runtimeCwd = options.cwd ?? options.remoteCwd ?? '/srv/app';

  return {
    id: options.id ?? 'win-ssh-1',
    name: options.name ?? 'Prod SSH',
    activePaneId: paneId,
    createdAt: new Date().toISOString(),
    lastActiveAt: options.lastActiveAt ?? new Date().toISOString(),
    kind: 'ssh',
    ...(options.ephemeral ? { ephemeral: true } : {}),
    ...(options.sshTabOwnerWindowId ? { sshTabOwnerWindowId: options.sshTabOwnerWindowId } : {}),
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: runtimeCwd,
        command: '',
        status: WindowStatus.Running,
        pid: 2001,
        backend: 'ssh',
        ssh: {
          profileId: options.profileId ?? 'profile-1',
          host: options.host ?? '10.0.0.21',
          port: options.port ?? 22,
          user: options.user ?? 'root',
          authType: 'password',
          remoteCwd: options.remoteCwd ?? runtimeCwd,
          reuseSession: true,
        },
      },
    },
  };
}

function createLocalWindowWithBrowserSibling(): Window {
  return {
    id: 'win-local-1',
    name: 'Local Browser Pair',
    activePaneId: 'pane-local-1',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    layout: {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [
        {
          type: 'pane',
          id: 'pane-local-1',
          pane: {
            id: 'pane-local-1',
            cwd: '/workspace/project',
            command: 'bash',
            status: WindowStatus.Running,
            pid: 3001,
          },
        },
        {
          type: 'pane',
          id: 'browser-1',
          pane: {
            id: 'browser-1',
            cwd: '',
            command: '',
            kind: 'browser',
            status: WindowStatus.Paused,
            pid: null,
            browser: {
              url: 'https://example.com',
            },
          },
        },
      ],
    },
  };
}

describe('TerminalView SSH toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [createSSHWindow()],
      activeWindowId: 'win-ssh-1',
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
  });

  it('hides IDE and local folder actions for ssh panes while keeping ssh tools visible', () => {
    render(
      <TerminalView
        window={createSSHWindow()}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />,
    );

    expect(screen.queryByRole('button', { name: '在 VS Code 中打开' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '在 WebStorm 中打开' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开文件夹' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: '打开 SSH 文件面板' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '显示 SSH 监控' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '管理 SSH 端口转发' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建远程终端' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prod SSH' })).toBeInTheDocument();
    expect(screen.getByText('/srv/app')).toBeInTheDocument();
    expect(screen.queryByText('Prod SSH')).not.toBeInTheDocument();
  });

  it('treats the last terminal pane exit as a window pause even when browser siblings exist', async () => {
    const user = userEvent.setup();
    const localWindow = createLocalWindowWithBrowserSibling();

    useWindowStore.setState({
      windows: [localWindow],
      activeWindowId: localWindow.id,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <TerminalView
        window={localWindow}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />,
    );

    await user.click(screen.getByRole('button', { name: '模拟窗格退出' }));

    await waitFor(() => {
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(localWindow.id);
    });
    expect(window.electronAPI.closePane).not.toHaveBeenCalled();
  });

  it('only shows remote tabs for the same owner family and keeps their original order', () => {
    const ownerWindow = createSSHWindow({
      id: 'win-ssh-1',
      paneId: 'pane-ssh-1',
      name: 'Prod SSH A',
      host: '10.0.0.21',
      remoteCwd: '/srv/app',
      lastActiveAt: '2026-04-09T00:00:01.000Z',
    });
    const activeWindow = createSSHWindow({
      id: 'win-ssh-2',
      paneId: 'pane-ssh-2',
      name: 'Prod SSH B',
      host: '10.0.0.21',
      remoteCwd: '/srv/worker',
      lastActiveAt: '2026-04-09T00:00:03.000Z',
      ephemeral: true,
      sshTabOwnerWindowId: 'win-ssh-1',
    });
    const unrelatedWindow = createSSHWindow({
      id: 'win-ssh-3',
      paneId: 'pane-ssh-3',
      name: 'Prod SSH C',
      host: '10.0.0.21',
      remoteCwd: '/srv/other',
      lastActiveAt: '2026-04-09T00:00:05.000Z',
    });

    useWindowStore.setState({
      windows: [ownerWindow, activeWindow, unrelatedWindow],
      activeWindowId: activeWindow.id,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <TerminalView
        window={activeWindow}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />,
    );

    const remoteTabOrder = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => label === 'Prod SSH A' || label === 'Prod SSH B');

    expect(remoteTabOrder).toEqual(['Prod SSH A', 'Prod SSH B']);
    expect(screen.queryByRole('button', { name: 'Prod SSH C' })).not.toBeInTheDocument();
  });

  it('opens the ssh sftp dialog from the toolbar', async () => {
    const user = userEvent.setup();

    render(
      <TerminalView
        window={createSSHWindow()}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />,
    );

    await user.click(screen.getByRole('button', { name: '打开 SSH 文件面板' }));

    expect(await screen.findByTestId('ssh-sftp-dialog')).toHaveTextContent('win-ssh-1:pane-ssh-1:/srv/app');
    expect(mockSftpDialog).toHaveBeenLastCalledWith(expect.objectContaining({
      open: true,
      windowId: 'win-ssh-1',
      paneId: 'pane-ssh-1',
      initialPath: '/srv/app',
    }));
  });

  it('keeps the ssh session status bar hidden by default', () => {
    render(
      <TerminalView
        window={createSSHWindow()}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />,
    );

    expect(screen.queryByTestId('ssh-session-status-bar')).not.toBeInTheDocument();
  });

  it('toggles the ssh session status bar from the toolbar', async () => {
    const user = userEvent.setup();

    render(
      <TerminalView
        window={createSSHWindow()}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />,
    );

    expect(screen.queryByTestId('ssh-session-status-bar')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '显示 SSH 监控' }));
    expect(screen.getByTestId('ssh-session-status-bar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '隐藏 SSH 监控' }));
    expect(screen.queryByTestId('ssh-session-status-bar')).not.toBeInTheDocument();
  });

  it('clones a remote tab from its context menu', async () => {
    const user = userEvent.setup();
    const onWindowSwitch = vi.fn();
    const activeWindow = createSSHWindow({
      id: 'win-ssh-2',
      paneId: 'pane-ssh-2',
      name: 'Prod SSH B',
      remoteCwd: '/srv/worker',
      ephemeral: true,
      sshTabOwnerWindowId: 'win-ssh-1',
    });

    useWindowStore.setState({
      windows: [
        createSSHWindow({
          id: 'win-ssh-1',
          paneId: 'pane-ssh-1',
          name: 'Prod SSH A',
          remoteCwd: '/srv/app',
        }),
        activeWindow,
      ],
      activeWindowId: activeWindow.id,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    vi.mocked(window.electronAPI.cloneSSHPane).mockResolvedValueOnce({
      success: true,
      data: {
        pid: 3002,
        sessionId: 'ssh-session-2',
      },
    });

    render(
      <TerminalView
        window={activeWindow}
        onReturn={vi.fn()}
        onWindowSwitch={onWindowSwitch}
        isActive
      />,
    );

    await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('button', { name: 'Prod SSH B' }) });
    await user.click(screen.getByText('克隆 SSH 终端'));

    expect(window.electronAPI.cloneSSHPane).toHaveBeenCalledWith(expect.objectContaining({
      sourceWindowId: 'win-ssh-2',
      sourcePaneId: 'pane-ssh-2',
      targetWindowId: expect.any(String),
      targetPaneId: expect.any(String),
      remoteCwd: '/srv/worker',
      sourceSsh: {
        profileId: 'profile-1',
        remoteCwd: '/srv/worker',
      },
    }));

    const clonedWindow = useWindowStore.getState().windows[2];
    expect(clonedWindow).toMatchObject({
      ephemeral: true,
      sshTabOwnerWindowId: 'win-ssh-1',
    });
    expect(onWindowSwitch).toHaveBeenCalledWith(expect.any(String));
    expect(useWindowStore.getState().windows).toHaveLength(3);
  });

  it('closes the active remote tab from its context menu and switches to the adjacent tab', async () => {
    const user = userEvent.setup();
    const onWindowSwitch = vi.fn();
    const ownerWindow = createSSHWindow({
      id: 'win-ssh-1',
      paneId: 'pane-ssh-1',
      name: 'Prod SSH A',
      remoteCwd: '/srv/app',
    });
    const activeWindow = createSSHWindow({
      id: 'win-ssh-2',
      paneId: 'pane-ssh-2',
      name: 'Prod SSH B',
      remoteCwd: '/srv/worker',
      ephemeral: true,
      sshTabOwnerWindowId: 'win-ssh-1',
    });

    useWindowStore.setState({
      windows: [ownerWindow, activeWindow],
      activeWindowId: activeWindow.id,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    vi.mocked(window.electronAPI.closeWindow).mockResolvedValueOnce({ success: true });
    vi.mocked(window.electronAPI.deleteWindow).mockResolvedValueOnce({ success: true });

    render(
      <TerminalView
        window={activeWindow}
        onReturn={vi.fn()}
        onWindowSwitch={onWindowSwitch}
        isActive
      />,
    );

    await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('button', { name: 'Prod SSH B' }) });
    await user.click(screen.getAllByText('关闭')[0]);

    expect(window.electronAPI.closeWindow).toHaveBeenCalledWith('win-ssh-2');
    expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith('win-ssh-2');
    expect(onWindowSwitch).toHaveBeenCalledWith('win-ssh-1');
    expect(useWindowStore.getState().windows.map((window) => window.id)).toEqual(['win-ssh-1']);
  });

  it('destroys an ephemeral ssh clone tab when stopped and hides archive and restart actions', async () => {
    const user = userEvent.setup();
    const onWindowSwitch = vi.fn();
    const ownerWindow = createSSHWindow({
      id: 'win-ssh-1',
      paneId: 'pane-ssh-1',
      name: 'Prod SSH A',
      remoteCwd: '/srv/app',
    });
    const ephemeralWindow = createSSHWindow({
      id: 'win-ssh-2',
      paneId: 'pane-ssh-2',
      name: 'Prod SSH B',
      remoteCwd: '/srv/worker',
      ephemeral: true,
      sshTabOwnerWindowId: 'win-ssh-1',
    });

    useWindowStore.setState({
      windows: [ownerWindow, ephemeralWindow],
      activeWindowId: ephemeralWindow.id,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    vi.mocked(window.electronAPI.closeWindow).mockResolvedValueOnce({ success: true });
    vi.mocked(window.electronAPI.deleteWindow).mockResolvedValueOnce({ success: true });

    render(
      <TerminalView
        window={ephemeralWindow}
        onReturn={vi.fn()}
        onWindowSwitch={onWindowSwitch}
        isActive
      />,
    );

    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重启' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '停止' }));

    await waitFor(() => {
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith('win-ssh-2');
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith('win-ssh-2');
    });

    expect(onWindowSwitch).toHaveBeenCalledWith('win-ssh-1');
    expect(useWindowStore.getState().windows.map((window) => window.id)).toEqual(['win-ssh-1']);
  });

  it('destroys an ephemeral ssh clone tab when its only pane exits', async () => {
    const user = userEvent.setup();
    const onWindowSwitch = vi.fn();
    const onReturn = vi.fn();
    const ownerWindow = createSSHWindow({
      id: 'win-ssh-1',
      paneId: 'pane-ssh-1',
      name: 'Prod SSH A',
      remoteCwd: '/srv/app',
    });
    const ephemeralWindow = createSSHWindow({
      id: 'win-ssh-2',
      paneId: 'pane-ssh-2',
      name: 'Prod SSH B',
      remoteCwd: '/srv/worker',
      ephemeral: true,
      sshTabOwnerWindowId: 'win-ssh-1',
    });

    useWindowStore.setState({
      windows: [ownerWindow, ephemeralWindow],
      activeWindowId: ephemeralWindow.id,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    vi.mocked(window.electronAPI.closeWindow).mockResolvedValueOnce({ success: true });
    vi.mocked(window.electronAPI.deleteWindow).mockResolvedValueOnce({ success: true });

    render(
      <TerminalView
        window={ephemeralWindow}
        onReturn={onReturn}
        onWindowSwitch={onWindowSwitch}
        isActive
      />,
    );

    await user.click(screen.getByRole('button', { name: '模拟窗格退出' }));

    await waitFor(() => {
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith('win-ssh-2');
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith('win-ssh-2');
    });

    expect(window.electronAPI.switchToUnifiedView).not.toHaveBeenCalled();
    expect(onWindowSwitch).toHaveBeenCalledWith('win-ssh-1');
    expect(onReturn).not.toHaveBeenCalled();
    expect(useWindowStore.getState().windows.map((window) => window.id)).toEqual(['win-ssh-1']);
  });

  it('does not leave a placeholder window behind when cloning fails', async () => {
    const user = userEvent.setup();
    const activeWindow = createSSHWindow({
      id: 'win-ssh-1',
      paneId: 'pane-ssh-1',
      name: 'Prod SSH A',
    });

    useWindowStore.setState({
      windows: [activeWindow],
      activeWindowId: activeWindow.id,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    vi.mocked(window.electronAPI.cloneSSHPane).mockResolvedValueOnce({
      success: false,
      error: 'clone failed',
    });

    render(
      <TerminalView
        window={activeWindow}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />,
    );

    await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('button', { name: 'Prod SSH A' }) });
    await user.click(screen.getByText('克隆 SSH 终端'));

    expect(useWindowStore.getState().windows).toHaveLength(1);
  });
});
