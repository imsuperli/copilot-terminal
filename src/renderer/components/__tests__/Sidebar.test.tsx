import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';
import { createGroup } from '../../utils/groupLayoutHelpers';
import { WindowStatus, type Window } from '../../types/window';
import type { CanvasWorkspace } from '../../../shared/types/canvas';

const TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY = 'synapse:terminal-sidebar-preferences';
const mockCreateWindowDialog = vi.fn();

vi.mock('../SidebarWindowItem', () => ({
  SidebarWindowItem: ({ window }: { window: { name: string } }) => <div>{window.name}</div>,
}));

vi.mock('../CreateWindowDialog', () => ({
  CreateWindowDialog: ({
    open,
    sshEnabled,
    onLocalWindowCreated,
  }: {
    open: boolean;
    sshEnabled?: boolean;
    onLocalWindowCreated?: (window: { id: string }) => void;
  }) => {
    mockCreateWindowDialog({ open, sshEnabled, onLocalWindowCreated });

    return open ? <div data-testid="create-window-dialog">{sshEnabled ? 'ssh-enabled' : 'local-only'}</div> : null;
  },
}));

function createWindowWithStatus(name: string, cwd: string, command: string, status: WindowStatus): Window {
  const window = createSinglePaneWindow(name, cwd, command);
  if (window.layout.type === 'pane') {
    window.layout.pane.status = status;
  }
  return window;
}

function createRunningWindow(name: string, cwd: string, command: string): Window {
  return createWindowWithStatus(name, cwd, command, WindowStatus.Running);
}

function updateSinglePaneWindowStatus(window: Window, status: WindowStatus): Window {
  if (window.layout.type !== 'pane') {
    return window;
  }

  return {
    ...window,
    layout: {
      ...window.layout,
      pane: {
        ...window.layout.pane,
        status,
      },
    },
  };
}

function createCanvasWorkspace(overrides: Partial<CanvasWorkspace> = {}): CanvasWorkspace {
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

describe('Terminal Sidebar', () => {
  beforeEach(() => {
    mockCreateWindowDialog.mockClear();
    window.localStorage.clear();
    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      mruList: [],
      groupMruList: [],
      sidebarExpanded: true,
      sidebarWidth: 200,
      terminalSidebarSections: {
        archived: false,
        canvas: true,
        local: true,
        ssh: true,
      },
      terminalSidebarFilter: 'all',
    });
  });

  it('shows both local and remote running terminals when all filter is selected', async () => {
    const user = userEvent.setup();
    const onWindowSelect = vi.fn();

    const localWindow = createRunningWindow('Local Terminal', '/workspace/local', 'bash');
    const sshWindow = {
      ...createRunningWindow('Remote Terminal', '/workspace/remote', 'bash'),
      kind: 'ssh' as const,
    };

    useWindowStore.setState({
      windows: [localWindow, sshWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id, sshWindow.id],
      terminalSidebarFilter: 'local',
    });

    render(
      <Sidebar activeWindowId={localWindow.id} onWindowSelect={onWindowSelect} />,
    );

    expect(screen.getByText('Local Terminal')).toBeInTheDocument();
    expect(screen.queryByText('Remote Terminal')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '终端筛选' }), 'all');

    expect(screen.getByText('Local Terminal')).toBeInTheDocument();
    expect(screen.getByText('Remote Terminal')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY) || '{}')).toMatchObject({
      filter: 'all',
    });
  });

  it('shows only archived running terminals in archived filter, and all filter also includes them', async () => {
    const user = userEvent.setup();
    const onWindowSelect = vi.fn();

    const activeWindow = createRunningWindow('Active Terminal', '/workspace/active', 'bash');
    const archivedRunningWindow = {
      ...createWindowWithStatus('Archived Running Terminal', '/workspace/archived-running', 'bash', WindowStatus.WaitingForInput),
      archived: true,
    };
    const archivedPausedWindow = {
      ...createWindowWithStatus('Archived Paused Terminal', '/workspace/archived-paused', 'bash', WindowStatus.Paused),
      archived: true,
    };

    useWindowStore.setState({
      windows: [activeWindow, archivedRunningWindow, archivedPausedWindow],
      activeWindowId: activeWindow.id,
      mruList: [activeWindow.id, archivedRunningWindow.id, archivedPausedWindow.id],
      terminalSidebarFilter: 'archived',
    });

    render(
      <Sidebar activeWindowId={activeWindow.id} onWindowSelect={onWindowSelect} />,
    );

    expect(screen.getByText('Archived Running Terminal')).toBeInTheDocument();
    expect(screen.queryByText('Archived Paused Terminal')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Terminal')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: '终端筛选' }), 'all');

    expect(screen.getByText('Active Terminal')).toBeInTheDocument();
    expect(screen.getByText('Archived Running Terminal')).toBeInTheDocument();
    expect(screen.queryByText('Archived Paused Terminal')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY) || '{}')).toMatchObject({
      filter: 'all',
    });
  });

  it('renders mixed groups only once when all filter is selected', () => {
    const onWindowSelect = vi.fn();

    const localWindow = createRunningWindow('Local Terminal', '/workspace/local', 'bash');
    const sshWindow = {
      ...createRunningWindow('Remote Terminal', '/workspace/remote', 'bash'),
      kind: 'ssh' as const,
    };
    const mixedGroup = createGroup('Mixed Group', localWindow.id, sshWindow.id);

    useWindowStore.setState({
      windows: [localWindow, sshWindow],
      groups: [mixedGroup],
      activeWindowId: localWindow.id,
      activeGroupId: mixedGroup.id,
      mruList: [localWindow.id, sshWindow.id],
      groupMruList: [mixedGroup.id],
      terminalSidebarFilter: 'all',
    });

    render(
      <Sidebar activeWindowId={localWindow.id} onWindowSelect={onWindowSelect} />,
    );

    expect(screen.getAllByText('Mixed Group')).toHaveLength(1);
  });

  it('keeps terminal order stable when statuses change', () => {
    const onWindowSelect = vi.fn();

    const alphaWindow = createRunningWindow('Alpha Terminal', '/workspace/alpha', 'bash');
    const betaWindow = createWindowWithStatus('Beta Terminal', '/workspace/beta', 'bash', WindowStatus.WaitingForInput);

    useWindowStore.setState({
      windows: [alphaWindow, betaWindow],
      activeWindowId: alphaWindow.id,
      mruList: [alphaWindow.id, betaWindow.id],
      terminalSidebarFilter: 'all',
    });

    const { rerender } = render(
      <Sidebar activeWindowId={alphaWindow.id} onWindowSelect={onWindowSelect} />,
    );

    expect(screen.getByTestId('terminal-sidebar-scroll-region').textContent).toContain('Alpha Terminal');
    expect(screen.getByTestId('terminal-sidebar-scroll-region').textContent).toContain('Beta Terminal');
    expect(screen.getAllByText(/Alpha Terminal|Beta Terminal/).map((node) => node.textContent)).toEqual([
      'Alpha Terminal',
      'Beta Terminal',
    ]);

    act(() => {
      useWindowStore.setState({
        windows: [
          alphaWindow,
          updateSinglePaneWindowStatus(betaWindow, WindowStatus.Running),
        ],
      });
    });

    rerender(
      <Sidebar activeWindowId={alphaWindow.id} onWindowSelect={onWindowSelect} />,
    );

    expect(screen.getAllByText(/Alpha Terminal|Beta Terminal/).map((node) => node.textContent)).toEqual([
      'Alpha Terminal',
      'Beta Terminal',
    ]);
  });

  it('does not show ephemeral ssh clone tabs in the terminal sidebar', () => {
    const onWindowSelect = vi.fn();

    const ownerWindow = {
      ...createRunningWindow('Remote Owner', '/workspace/remote', 'bash'),
      kind: 'ssh' as const,
    };
    const cloneWindow = {
      ...createRunningWindow('Remote Clone', '/workspace/remote-clone', 'bash'),
      kind: 'ssh' as const,
      ephemeral: true,
      sshTabOwnerWindowId: ownerWindow.id,
    };

    useWindowStore.setState({
      windows: [ownerWindow, cloneWindow],
      activeWindowId: cloneWindow.id,
      mruList: [cloneWindow.id, ownerWindow.id],
      terminalSidebarFilter: 'all',
    });

    render(
      <Sidebar activeWindowId={ownerWindow.id} onWindowSelect={onWindowSelect} />,
    );

    expect(screen.getByText('Remote Owner')).toBeInTheDocument();
    expect(screen.queryByText('Remote Clone')).not.toBeInTheDocument();
  });

  it('uses a stable scroll region when expanded and hides scrollbar occupancy when collapsed', () => {
    const onWindowSelect = vi.fn();
    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');

    useWindowStore.setState({
      windows: [localWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id],
      sidebarExpanded: true,
    });

    const { rerender } = render(
      <Sidebar activeWindowId={localWindow.id} onWindowSelect={onWindowSelect} />,
    );

    expect(screen.getByTestId('terminal-sidebar-scroll-region')).toHaveClass(
      'terminal-sidebar-scroll-region-expanded',
    );

    act(() => {
      useWindowStore.setState({
        sidebarExpanded: false,
      });
    });

    rerender(
      <Sidebar activeWindowId={localWindow.id} onWindowSelect={onWindowSelect} />,
    );

    expect(screen.getByTestId('terminal-sidebar-scroll-region')).toHaveClass(
      'terminal-sidebar-scroll-region-collapsed',
    );
  });

  it('opens the create window dialog from the expanded action button', async () => {
    const user = userEvent.setup();
    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');

    useWindowStore.setState({
      windows: [localWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id],
      sidebarExpanded: true,
    });

    render(
      <Sidebar
        activeWindowId={localWindow.id}
        onWindowSelect={vi.fn()}
        sshEnabled
      />,
    );

    await user.click(screen.getByRole('button', { name: '新建终端' }));

    expect(screen.getByTestId('create-window-dialog')).toHaveTextContent('ssh-enabled');
  });

  it('keeps quick actions in the expanded footer without branding copy', () => {
    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');

    useWindowStore.setState({
      windows: [localWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id],
      sidebarExpanded: true,
    });

    render(
      <Sidebar
        activeWindowId={localWindow.id}
        onWindowSelect={vi.fn()}
        showOpenCodePaneAction
        canOpenCodePane
      />,
    );

    expect(screen.queryByAltText('Synapse Logo')).not.toBeInTheDocument();
    expect(screen.queryByText('Synapse')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开代码面板' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建终端' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
  });

  it('keeps the create window action available when the sidebar is collapsed', async () => {
    const user = userEvent.setup();
    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');

    useWindowStore.setState({
      windows: [localWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id],
      sidebarExpanded: false,
    });

    render(
      <Sidebar
        activeWindowId={localWindow.id}
        onWindowSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '新建终端' }));

    expect(screen.getByTestId('create-window-dialog')).toHaveTextContent('local-only');
  });

  it('keeps collapsed footer actions centered with flex layout', () => {
    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');

    useWindowStore.setState({
      windows: [localWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id],
      sidebarExpanded: false,
    });

    render(
      <Sidebar
        activeWindowId={localWindow.id}
        onWindowSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '新建终端' }).className).toContain('flex');
    expect(screen.getByRole('button', { name: '新建终端' }).className).toContain('justify-center');
    expect(screen.getByRole('button', { name: '设置' }).className).toContain('flex');
    expect(screen.getByRole('button', { name: '设置' }).className).toContain('justify-center');
  });

  it('enters the created terminal from the terminal sidebar flow', async () => {
    const user = userEvent.setup();
    const onWindowSelect = vi.fn();
    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');

    useWindowStore.setState({
      windows: [localWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id],
      sidebarExpanded: true,
    });

    render(
      <Sidebar
        activeWindowId={localWindow.id}
        onWindowSelect={onWindowSelect}
      />,
    );

    await user.click(screen.getByRole('button', { name: '新建终端' }));

    expect(screen.getByTestId('create-window-dialog')).toBeInTheDocument();

    const latestDialogProps = mockCreateWindowDialog.mock.calls.at(-1)?.[0] as {
      onLocalWindowCreated?: (window: { id: string }) => void;
    };

    latestDialogProps.onLocalWindowCreated?.({ id: 'window-created-from-sidebar' });

    expect(onWindowSelect).toHaveBeenCalledWith('window-created-from-sidebar');
  });

  it('shows canvas workspaces in the dedicated terminal sidebar filter', async () => {
    const user = userEvent.setup();
    const onCanvasSelect = vi.fn();
    const localWindow = createRunningWindow('Local Terminal', '/workspace/local', 'bash');

    useWindowStore.setState({
      windows: [localWindow],
      canvasWorkspaces: [createCanvasWorkspace()],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id],
      terminalSidebarFilter: 'canvas',
    });

    render(
      <Sidebar
        activeWindowId={localWindow.id}
        activeCanvasWorkspaceId={null}
        onWindowSelect={vi.fn()}
        onCanvasSelect={onCanvasSelect}
      />,
    );

    expect(screen.getByText('Incident Map')).toBeInTheDocument();
    expect(screen.queryByText('Local Terminal')).not.toBeInTheDocument();

    await user.click(screen.getByText('Incident Map'));
    expect(onCanvasSelect).toHaveBeenCalledWith('canvas-1');
  });

  it('renders the open code pane action above new terminal and triggers it', async () => {
    const user = userEvent.setup();
    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');
    const onOpenCodePane = vi.fn();

    useWindowStore.setState({
      windows: [localWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id],
      sidebarExpanded: true,
    });

    render(
      <Sidebar
        activeWindowId={localWindow.id}
        onWindowSelect={vi.fn()}
        onOpenCodePane={onOpenCodePane}
        showOpenCodePaneAction
        canOpenCodePane
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.findIndex((button) => button.getAttribute('aria-label') === '打开代码面板'))
      .toBeLessThan(buttons.findIndex((button) => button.getAttribute('aria-label') === '新建终端'));

    await user.click(screen.getByRole('button', { name: '打开代码面板' }));

    expect(onOpenCodePane).toHaveBeenCalledTimes(1);
  });
});
