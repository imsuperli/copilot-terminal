import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../stores/windowStore';

const { mockQuickNavPanel, mockUseViewSwitcher, mockUseWindowSwitcher, mockUseWorkspaceRestore } = vi.hoisted(() => ({
  mockQuickNavPanel: vi.fn(({ open }: { open: boolean }) => (
    open ? <div data-testid="quick-nav-state">open</div> : null
  )),
  mockUseViewSwitcher: vi.fn(),
  mockUseWindowSwitcher: vi.fn(),
  mockUseWorkspaceRestore: vi.fn(),
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

vi.mock('../components/CreateGroupDialog', () => ({
  CreateGroupDialog: () => null,
}));

vi.mock('../components/CreateWindowDialog', () => ({
  CreateWindowDialog: () => null,
}));

vi.mock('../components/TerminalView', () => ({
  TerminalView: () => null,
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
  QuickNavPanel: mockQuickNavPanel,
}));

vi.mock('../components/SSHHostKeyPromptDialog', () => ({
  SSHHostKeyPromptDialog: () => null,
}));

vi.mock('../components/SSHPasswordPromptDialog', () => ({
  SSHPasswordPromptDialog: () => null,
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

function pressShift() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
}

async function renderApp() {
  await act(async () => {
    render(<App />);
    await Promise.resolve();
  });
}

describe('App quick navigation shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T00:00:00.000Z'));

    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      customCategories: [],
      mruList: [],
      sidebarExpanded: false,
      sidebarWidth: 280,
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens quick navigation when Shift is double-tapped within 149ms', async () => {
    await renderApp();

    expect(screen.queryByTestId('quick-nav-state')).not.toBeInTheDocument();

    await act(async () => {
      pressShift();
      vi.advanceTimersByTime(149);
      pressShift();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('quick-nav-state')).toHaveTextContent('open');
  });

  it('does not open quick navigation when Shift taps are 150ms apart', async () => {
    await renderApp();

    act(() => {
      pressShift();
      vi.advanceTimersByTime(150);
      pressShift();
    });

    expect(screen.queryByTestId('quick-nav-state')).not.toBeInTheDocument();
  });
});
