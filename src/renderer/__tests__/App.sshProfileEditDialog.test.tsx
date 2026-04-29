import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../stores/windowStore';
import { createSinglePaneWindow } from '../utils/layoutHelpers';

const { mockCardGrid, mockCreateWindowDialog, mockUseViewSwitcher, mockUseWindowSwitcher, mockUseWorkspaceRestore } = vi.hoisted(() => ({
  mockCardGrid: vi.fn((props: { sshProfiles?: Array<{ id: string; name: string }>; onEditSSHProfile?: (profile: { id: string; name: string }) => void }) => (
    <button
      type="button"
      onClick={() => props.onEditSSHProfile?.(props.sshProfiles?.[0] as any)}
    >
      编辑 SSH
    </button>
  )),
  mockCreateWindowDialog: vi.fn(() => null),
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

vi.mock('../components/CreateWindowDialog', () => ({
  CreateWindowDialog: mockCreateWindowDialog,
}));

vi.mock('../components/GroupView', () => ({
  GroupView: () => null,
}));

vi.mock('../components/AppNotice', () => ({
  AppNotice: () => null,
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

describe('App SSH profile editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const windowOne = createSinglePaneWindow('Window One', '/repo-one', 'zsh');
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
      data: [
        {
          id: 'profile-1',
          name: 'Prod SSH',
          host: '10.0.0.21',
          port: 22,
          user: 'root',
          auth: 'password',
          privateKeys: [],
          keepaliveInterval: 30,
          keepaliveCountMax: 3,
          readyTimeout: null,
          verifyHostKeys: true,
          x11: false,
          skipBanner: false,
          agentForward: false,
          warnOnClose: true,
          reuseSession: true,
          forwardedPorts: [],
          tags: [],
          createdAt: '2026-03-23T08:00:00.000Z',
          updatedAt: '2026-03-23T08:00:00.000Z',
        },
      ],
    });
    vi.mocked(window.electronAPI.getSSHCredentialState).mockResolvedValue({
      success: true,
      data: { hasPassword: true, hasPassphrase: false },
    });
  });

  it('opens the new create window dialog in ssh edit mode when editing a profile', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '编辑 SSH' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '编辑 SSH' }));

    await waitFor(() => {
      const lastProps = mockCreateWindowDialog.mock.calls.at(-1)?.[0];
      expect(lastProps).toEqual(expect.objectContaining({
        open: true,
        sshEnabled: true,
        editingSSHProfile: expect.objectContaining({
          id: 'profile-1',
          name: 'Prod SSH',
        }),
        sshCredentialState: { hasPassword: true, hasPassphrase: false },
      }));
    });
  });
});
