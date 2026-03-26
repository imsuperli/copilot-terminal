import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';
import { createGroup } from '../../utils/groupLayoutHelpers';
import { WindowStatus, type Window } from '../../types/window';

const TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY = 'copilot-terminal:terminal-sidebar-preferences';

vi.mock('../SidebarWindowItem', () => ({
  SidebarWindowItem: ({ window }: { window: { name: string } }) => <div>{window.name}</div>,
}));

function createRunningWindow(name: string, cwd: string, command: string): Window {
  const window = createSinglePaneWindow(name, cwd, command);
  if (window.layout.type === 'pane') {
    window.layout.pane.status = WindowStatus.Running;
  }
  return window;
}

describe('Terminal Sidebar', () => {
  beforeEach(() => {
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
});
