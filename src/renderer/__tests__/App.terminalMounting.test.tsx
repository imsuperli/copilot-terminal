import { act, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../components/ViewSwitchError', () => ({
  ViewSwitchError: () => null,
}));

vi.mock('../components/CleanupOverlay', () => ({
  CleanupOverlay: () => null,
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
});
