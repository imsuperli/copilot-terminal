import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../stores/windowStore';
import { createSinglePaneWindow } from '../utils/layoutHelpers';
import { notifyWorkspaceSettingsUpdated } from '../utils/settingsEvents';

const { mockCardGrid, mockUseViewSwitcher, mockUseWindowSwitcher, mockUseWorkspaceRestore } = vi.hoisted(() => ({
  mockCardGrid: vi.fn(({ sshEnabled }: { sshEnabled: boolean }) => (
    <div data-testid="ssh-enabled">{String(sshEnabled)}</div>
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

vi.mock('../components/SSHProfileDialog', () => ({
  SSHProfileDialog: () => null,
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

describe('App SSH settings updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const windowOne = createSinglePaneWindow('Window One', 'D:\\repo-one', 'pwsh.exe');
    useWindowStore.setState({
      windows: [windowOne],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      customCategories: [],
      mruList: [windowOne.id],
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
      data: [],
    });
  });

  it('updates SSH visibility when workspace feature settings change', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('ssh-enabled')).toHaveTextContent('true');
    });

    act(() => {
      notifyWorkspaceSettingsUpdated({
        features: { sshEnabled: false },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('ssh-enabled')).toHaveTextContent('false');
    });
  });
});
