import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useWindowStore } from '../stores/windowStore';
import { createSinglePaneWindow } from '../utils/layoutHelpers';

const { mockTerminalView, mockUseViewSwitcher, mockUseWindowSwitcher, mockUseWorkspaceRestore } = vi.hoisted(() => ({
  mockTerminalView: vi.fn(() => null),
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

    expect(mockTerminalView).toHaveBeenCalledTimes(1);
    expect(mockTerminalView.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        window: expect.objectContaining({ id: windowTwo.id }),
        isActive: true,
      }),
    );
  });
});
