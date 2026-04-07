import React from 'react';
import { render, screen } from '@testing-library/react';
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

vi.mock('../ProjectLinks', () => ({
  ProjectLinks: () => null,
}));

vi.mock('../SplitLayout', () => ({
  SplitLayout: () => <div data-testid="split-layout" />,
}));

vi.mock('../dnd', () => ({
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
        case 'terminalView.splitHorizontal':
          return '水平分屏';
        case 'terminalView.splitVertical':
          return '垂直分屏';
        case 'terminalView.archive':
          return '归档';
        case 'terminalView.stop':
          return '停止';
        case 'terminalView.restart':
          return '重启';
        case 'terminalView.start':
          return '启动';
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

function createSSHWindow(): Window {
  const paneId = 'pane-ssh-1';

  return {
    id: 'win-ssh-1',
    name: 'Prod SSH',
    activePaneId: paneId,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
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
});
