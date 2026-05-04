import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';
import { createSinglePaneWindow } from '../utils/layoutHelpers';

const { mockTerminalView, mockUseViewSwitcher, mockUseWindowSwitcher, mockUseWorkspaceRestore } = vi.hoisted(() => ({
  mockTerminalView: vi.fn(({ window, isActive }: { window: { id: string }; isActive: boolean }) => (
    <div data-testid={`terminal-${window.id}`} data-active={String(isActive)} />
  )),
  mockUseViewSwitcher: vi.fn(),
  mockUseWindowSwitcher: vi.fn(),
  mockUseWorkspaceRestore: vi.fn(),
}));

vi.mock('../components/TerminalView', () => ({
  TerminalView: mockTerminalView,
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
  CardGrid: () => null,
}));

vi.mock('../components/ArchivedView', () => ({
  ArchivedView: () => null,
}));

vi.mock('../components/AppNotice', () => ({
  AppNotice: () => null,
}));

vi.mock('../components/CleanupOverlay', () => ({
  CleanupOverlay: () => null,
}));

vi.mock('../components/CanvasWorkspaceView', () => ({
  CanvasWorkspaceView: ({ canvasWorkspace }: { canvasWorkspace: { name: string } }) => (
    <div data-testid="canvas-workspace-view">{canvasWorkspace.name}</div>
  ),
}));

vi.mock('../components/QuickNavPanel', () => ({
  QuickNavPanel: () => null,
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

function withSinglePaneStatus<T extends ReturnType<typeof createSinglePaneWindow>>(
  terminalWindow: T,
  status: WindowStatus,
): T {
  if (terminalWindow.layout.type !== 'pane') {
    return terminalWindow;
  }

  return {
    ...terminalWindow,
    layout: {
      ...terminalWindow.layout,
      pane: {
        ...terminalWindow.layout.pane,
        status,
      },
    },
  };
}

describe('App terminal mounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    mockUseViewSwitcher.mockReturnValue({
      currentView: 'terminal',
      switchToTerminalView: vi.fn(),
      switchToUnifiedView: vi.fn(),
      error: null,
    });
    mockUseWindowSwitcher.mockReturnValue({
      switchToWindow: vi.fn(),
    });
    mockUseWorkspaceRestore.mockImplementation(() => {});
  });

  it('mounts only the active terminal view when multiple windows exist', () => {
    const windowOne = createSinglePaneWindow('Window One', 'D:\\repo-one', 'pwsh.exe');
    const windowTwo = createSinglePaneWindow('Window Two', 'D:\\repo-two', 'pwsh.exe');

    useWindowStore.setState({
      windows: [windowOne, windowTwo],
      activeWindowId: windowTwo.id,
      mruList: [windowTwo.id, windowOne.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(<App />);

    expect(screen.getByTestId(`terminal-${windowTwo.id}`)).toHaveAttribute('data-active', 'true');
    expect(screen.queryByTestId(`terminal-${windowOne.id}`)).not.toBeInTheDocument();
  });

  it('keeps the active terminal view mounted but inactive when returning to unified view', () => {
    const windowOne = createSinglePaneWindow('Window One', 'D:\\repo-one', 'pwsh.exe');

    mockUseViewSwitcher.mockReturnValue({
      currentView: 'unified',
      switchToTerminalView: vi.fn(),
      switchToUnifiedView: vi.fn(),
      error: null,
    });

    useWindowStore.setState({
      windows: [windowOne],
      activeWindowId: windowOne.id,
      mruList: [windowOne.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(<App />);

    expect(screen.getByTestId(`terminal-${windowOne.id}`)).toHaveAttribute('data-active', 'false');
  });

  it('unmounts previously opened paused terminal views when switching windows', async () => {
    const windowOne = createSinglePaneWindow('Window One', 'D:\\repo-one', 'pwsh.exe');
    const windowTwo = createSinglePaneWindow('Window Two', 'D:\\repo-two', 'pwsh.exe');

    useWindowStore.setState({
      windows: [windowOne, windowTwo],
      activeWindowId: windowOne.id,
      mruList: [windowOne.id, windowTwo.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(<App />);

    expect(screen.getByTestId(`terminal-${windowOne.id}`)).toHaveAttribute('data-active', 'true');

    act(() => {
      useWindowStore.getState().setActiveWindow(windowTwo.id);
    });

    await waitFor(() => {
      expect(screen.getByTestId(`terminal-${windowTwo.id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`terminal-${windowOne.id}`)).not.toBeInTheDocument();
    });
    expect(screen.getByTestId(`terminal-${windowTwo.id}`)).toHaveAttribute('data-active', 'true');
  });

  it('keeps previously opened running terminal views mounted when switching windows', async () => {
    const windowOne = withSinglePaneStatus(
      createSinglePaneWindow('Window One', 'D:\\repo-one', 'pwsh.exe'),
      WindowStatus.Running,
    );
    const windowTwo = withSinglePaneStatus(
      createSinglePaneWindow('Window Two', 'D:\\repo-two', 'pwsh.exe'),
      WindowStatus.Running,
    );

    useWindowStore.setState({
      windows: [windowOne, windowTwo],
      activeWindowId: windowOne.id,
      mruList: [windowOne.id, windowTwo.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(<App />);

    expect(screen.getByTestId(`terminal-${windowOne.id}`)).toHaveAttribute('data-active', 'true');

    act(() => {
      useWindowStore.getState().setActiveWindow(windowTwo.id);
    });

    await waitFor(() => {
      expect(screen.getByTestId(`terminal-${windowOne.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`terminal-${windowTwo.id}`)).toBeInTheDocument();
    });

    expect(screen.getByTestId(`terminal-${windowOne.id}`)).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId(`terminal-${windowTwo.id}`)).toHaveAttribute('data-active', 'true');
  });

  it('does not suppress the active terminal surface just because another canvas persisted the same window in live mode', () => {
    const windowOne = withSinglePaneStatus(
      createSinglePaneWindow('Window One', 'D:\\repo-one', 'pwsh.exe'),
      WindowStatus.Running,
    );

    useWindowStore.setState({
      windows: [windowOne],
      canvasWorkspaces: [
        {
          id: 'canvas-1',
          name: 'Ops Board',
          createdAt: '2026-05-03T00:00:00.000Z',
          updatedAt: '2026-05-03T00:00:00.000Z',
          blocks: [
            {
              id: 'window-block-1',
              type: 'window',
              windowId: windowOne.id,
              x: 0,
              y: 0,
              width: 360,
              height: 220,
              zIndex: 1,
              displayMode: 'live',
            },
          ],
          viewport: { tx: 0, ty: 0, zoom: 1 },
          nextZIndex: 2,
        },
      ],
      activeWindowId: windowOne.id,
      mruList: [windowOne.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(<App />);

    expect(screen.getByTestId(`terminal-${windowOne.id}`)).toHaveAttribute('data-active', 'true');
  });

  it('clears pane runtime when the main process reports an exited pane', () => {
    const terminalWindow = createSinglePaneWindow('SSH Window', '/srv/app', '');
    const paneId = terminalWindow.activePaneId;

    if (terminalWindow.layout.type !== 'pane') {
      throw new Error('expected single pane layout');
    }

    terminalWindow.layout.pane = {
      ...terminalWindow.layout.pane,
      status: WindowStatus.WaitingForInput,
      pid: 2201,
      sessionId: 'ssh-session-1',
      backend: 'ssh',
      ssh: {
        profileId: 'profile-1',
        host: '10.0.0.21',
        user: 'root',
      },
    };

    useWindowStore.setState({
      windows: [terminalWindow],
      activeWindowId: terminalWindow.id,
      mruList: [terminalWindow.id],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(<App />);

    const handler = vi.mocked(window.electronAPI.onPaneStatusChanged).mock.calls[0]?.[0];
    expect(handler).toBeTypeOf('function');

    act(() => {
      handler?.({}, {
        windowId: terminalWindow.id,
        paneId,
        status: WindowStatus.Error,
        timestamp: new Date().toISOString(),
      });
    });

    expect(useWindowStore.getState().getPaneById(terminalWindow.id, paneId)).toMatchObject({
      status: WindowStatus.Error,
      pid: null,
    });
    expect(useWindowStore.getState().getPaneById(terminalWindow.id, paneId)?.sessionId).toBeUndefined();
  });

  it('returns directly to unified view from canvas title bar home and close actions', async () => {
    const switchToUnifiedView = vi.fn().mockResolvedValue(undefined);

    mockUseViewSwitcher.mockReturnValue({
      currentView: 'canvas',
      activeWindowId: null,
      activeCanvasWorkspaceId: 'canvas-1',
      switchToTerminalView: vi.fn(),
      switchToCanvasView: vi.fn(),
      switchToUnifiedView,
      error: null,
    });

    useWindowStore.setState({
      windows: [],
      canvasWorkspaces: [
        {
          id: 'canvas-1',
          name: 'Ops Board',
          createdAt: '2026-05-03T00:00:00.000Z',
          updatedAt: '2026-05-03T00:00:00.000Z',
          blocks: [],
          viewport: { tx: 0, ty: 0, zoom: 1 },
          nextZIndex: 1,
        },
      ],
      activeCanvasWorkspaceId: 'canvas-1',
      activeWindowId: null,
      activeGroupId: null,
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    render(<App />);

    expect(screen.getByTestId('canvas-workspace-view')).toHaveTextContent('Ops Board');

    fireEvent.click(screen.getByLabelText('Home'));
    await waitFor(() => {
      expect(switchToUnifiedView).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() => {
      expect(switchToUnifiedView).toHaveBeenCalledTimes(2);
    });
  });
});
