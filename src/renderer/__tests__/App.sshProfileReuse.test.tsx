import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowStore } from '../stores/windowStore';
import { Window, WindowStatus } from '../types/window';

const { mockCardGrid, mockUseViewSwitcher, mockUseWindowSwitcher, mockUseWorkspaceRestore } = vi.hoisted(() => ({
  mockCardGrid: vi.fn((props: { sshProfiles?: Array<{ id: string; name: string }>; onConnectSSHProfile?: (profile: { id: string; name: string }) => void }) => (
    <button
      type="button"
      onClick={() => props.onConnectSSHProfile?.(props.sshProfiles?.[0] as any)}
    >
      连接 SSH
    </button>
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

function createSSHWindow(profileId: string): Window {
  const paneId = 'pane-ssh-existing';

  return {
    id: 'win-ssh-existing',
    name: 'Prod SSH',
    activePaneId: paneId,
    createdAt: '2026-03-23T08:00:00.000Z',
    lastActiveAt: '2026-03-23T08:10:00.000Z',
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
          profileId,
          host: '10.0.0.21',
          port: 22,
          user: 'root',
          authType: 'password',
          reuseSession: true,
        },
      },
    },
  };
}

describe('App SSH profile reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useWindowStore.setState({
      windows: [createSSHWindow('profile-1')],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      customCategories: [],
      mruList: [],
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
  });

  it('reuses an existing ssh window for the same profile instead of creating a new one', async () => {
    const user = userEvent.setup();
    const switchToWindow = vi.fn();
    mockUseWindowSwitcher.mockReturnValue({
      switchToWindow,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '连接 SSH' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '连接 SSH' }));

    expect(switchToWindow).toHaveBeenCalledWith('win-ssh-existing');
    expect(window.electronAPI.createSSHWindow).not.toHaveBeenCalled();
  });
});
