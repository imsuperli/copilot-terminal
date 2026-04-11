import React from 'react';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalView } from '../TerminalView';
import { useWindowStore } from '../../stores/windowStore';
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
  SplitLayout: (props: { activePaneId?: string; onPaneClose?: (paneId: string) => void }) => (
    <div data-testid="split-layout">
      {props.onPaneClose && props.activePaneId ? (
        <button type="button" aria-label="close-active-pane" onClick={() => props.onPaneClose?.(props.activePaneId!)}>
          close-active-pane
        </button>
      ) : null}
    </div>
  ),
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

function createBrowserOnlyWindow(kind: Window['kind'] = 'local'): Window {
  const paneId = 'pane-browser-only-1';

  return {
    id: `win-browser-${kind ?? 'local'}`,
    name: `Browser ${kind ?? 'local'}`,
    activePaneId: paneId,
    kind,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
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
  };
}

function createTerminalWithTwoBrowsersWindow(): Window {
  return {
    id: 'win-mixed-browser-only-after-close',
    name: 'Terminal With Browsers',
    activePaneId: 'pane-local-1',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    layout: {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.34, 0.33, 0.33],
      children: [
        {
          type: 'pane',
          id: 'pane-local-1',
          pane: {
            id: 'pane-local-1',
            cwd: '/workspace/project',
            command: 'bash',
            status: WindowStatus.Running,
            pid: 101,
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
            browser: { url: 'https://example.com/1' },
          },
        },
        {
          type: 'pane',
          id: 'browser-2',
          pane: {
            id: 'browser-2',
            cwd: '',
            command: '',
            kind: 'browser',
            status: WindowStatus.Paused,
            pid: null,
            browser: { url: 'https://example.com/2' },
          },
        },
      ],
    },
  };
}

describe('TerminalView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });
  });

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

  it('shows the window identity logo when the active pane is a browser pane', () => {
    render(
      <TerminalView
        window={createBrowserOnlyWindow('local')}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />
    );

    expect(screen.getByTestId('toolbar-window-identity')).toBeInTheDocument();
  });

  it('does not close a terminal pane when that would leave only browser panes', () => {
    const windowWithBrowsers = createTerminalWithTwoBrowsersWindow();
    useWindowStore.setState({
      windows: [windowWithBrowsers],
      activeWindowId: windowWithBrowsers.id,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(
      <TerminalView
        window={windowWithBrowsers}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'close-active-pane' }));

    expect(window.electronAPI.closePane).not.toHaveBeenCalled();
  });

  it('prevents mouse focus on toolbar action buttons', () => {
    render(
      <TerminalView
        window={createLocalWindow()}
        onReturn={vi.fn()}
        onWindowSwitch={vi.fn()}
        isActive
      />
    );

    const archiveButton = screen.getByRole('button', { name: 'terminalView.archive' });
    expect(archiveButton).toHaveAttribute('tabIndex', '-1');

    const mouseDownEvent = createEvent.mouseDown(archiveButton);
    fireEvent(archiveButton, mouseDownEvent);

    expect(mouseDownEvent.defaultPrevented).toBe(true);
  });
});
