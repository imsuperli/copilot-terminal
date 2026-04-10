import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalView } from '../TerminalView';
import { Window, WindowStatus } from '../../types/window';

vi.mock('../Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock('../QuickSwitcher', () => ({
  QuickSwitcher: () => null,
}));

vi.mock('../SettingsPanel', () => ({
  SettingsPanel: ({ open }: { open: boolean }) => (open ? <div data-testid="settings-panel" /> : null),
}));

vi.mock('../RemoteWindowTabs', () => ({
  RemoteWindowTabs: () => <div data-testid="remote-window-tabs" />,
}));

vi.mock('../SplitLayout', () => ({
  SplitLayout: () => <div data-testid="split-layout" />,
}));

vi.mock('react-dnd', () => ({
  useDrag: () => [{ isDragging: false }, () => undefined, () => undefined],
}));

vi.mock('react-dnd-html5-backend', () => ({
  getEmptyImage: () => ({}),
}));

vi.mock('../dnd', () => ({
  DragItemTypes: {
    BROWSER_TOOL: 'BROWSER_TOOL',
    BROWSER_PANE: 'BROWSER_PANE',
  },
  DropZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ProjectLinks', () => ({
  ProjectLinks: () => null,
}));

vi.mock('../icons/IDEIcons', () => ({
  IDEIcon: () => <span data-testid="ide-icon" />,
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}));

vi.mock('../../hooks/useIDESettings', () => ({
  useIDESettings: () => ({ enabledIDEs: [] }),
}));

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'en-US',
    setLanguage: vi.fn(),
  }),
}));

vi.mock('../SSHPortForwardDialog', () => ({
  SSHPortForwardDialog: () => null,
}));

vi.mock('../SSHSftpDialog', () => ({
  SSHSftpDialog: () => null,
}));

vi.mock('../SSHSessionStatusBar', () => ({
  SSHSessionStatusBar: () => null,
}));

function createLocalWindow(status: WindowStatus = WindowStatus.Running): Window {
  const paneId = 'pane-local-1';

  return {
    id: 'win-local-1',
    name: 'Local Window',
    activePaneId: paneId,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: '/workspace/project',
        command: 'bash',
        status,
        pid: status === WindowStatus.Paused ? null : 101,
      },
    },
  };
}

function createSshWindow(): Window {
  const paneId = 'pane-ssh-1';

  return {
    id: 'win-ssh-1',
    name: 'SSH Window',
    activePaneId: paneId,
    kind: 'ssh',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: '/srv/app',
        command: '',
        status: WindowStatus.Running,
        pid: 202,
        backend: 'ssh',
        ssh: {
          profileId: 'profile-1',
          host: '10.0.0.20',
          user: 'root',
          remoteCwd: '/srv/app',
          reuseSession: true,
        },
      },
    },
  };
}

describe('TerminalView', () => {
  it('renders sidebar and local toolbar actions in normal mode', () => {
    render(
      <TerminalView
        window={createLocalWindow()}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />
    );

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('split-layout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.openFolder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.splitHorizontal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.splitVertical' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.splitBrowser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.stop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.restart' })).toBeInTheDocument();
  });

  it('shows start instead of stop and restart when the active pane is paused', () => {
    render(
      <TerminalView
        window={createLocalWindow(WindowStatus.Paused)}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />
    );

    expect(screen.queryByRole('button', { name: 'terminalView.stop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'terminalView.restart' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.start' })).toBeInTheDocument();
  });

  it('hides the sidebar in embedded mode', () => {
    render(
      <TerminalView
        window={createLocalWindow()}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
        embedded
      />
    );

    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('split-layout')).toBeInTheDocument();
  });

  it('renders ssh-specific toolbar actions for ssh panes', () => {
    render(
      <TerminalView
        window={createSshWindow()}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />
    );

    expect(screen.getByRole('button', { name: 'terminalView.openSftp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.showSshMonitor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'terminalView.managePortForwards' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'terminalView.openFolder' })).not.toBeInTheDocument();
  });
});
