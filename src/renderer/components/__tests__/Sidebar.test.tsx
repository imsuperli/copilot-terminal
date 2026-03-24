import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';

const TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY = 'copilot-terminal:terminal-sidebar-preferences';

vi.mock('../SidebarWindowItem', () => ({
  SidebarWindowItem: ({ window }: { window: { name: string } }) => <div>{window.name}</div>,
}));

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

  it('keeps category collapse state shared across mounted terminal sidebars', async () => {
    const user = userEvent.setup();
    const onWindowSelect = vi.fn();

    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');
    const sshWindowA = {
      ...createSinglePaneWindow('Remote A', '/workspace/remote-a', 'bash'),
      kind: 'ssh' as const,
    };
    const sshWindowB = {
      ...createSinglePaneWindow('Remote B', '/workspace/remote-b', 'bash'),
      kind: 'ssh' as const,
    };

    useWindowStore.setState({
      windows: [localWindow, sshWindowA, sshWindowB],
      activeWindowId: sshWindowA.id,
      mruList: [sshWindowA.id, sshWindowB.id, localWindow.id],
    });

    render(
      <>
        <div data-testid="sidebar-a">
          <Sidebar activeWindowId={sshWindowA.id} onWindowSelect={onWindowSelect} />
        </div>
        <div data-testid="sidebar-b">
          <Sidebar activeWindowId={sshWindowB.id} onWindowSelect={onWindowSelect} />
        </div>
      </>,
    );

    const sidebarA = screen.getByTestId('sidebar-a');
    const sidebarB = screen.getByTestId('sidebar-b');

    expect(within(sidebarA).getByText('Local Terminal')).toBeInTheDocument();
    expect(within(sidebarB).getByText('Local Terminal')).toBeInTheDocument();

    await user.click(within(sidebarA).getByRole('button', { name: /本地终端/i }));

    expect(within(sidebarA).queryByText('Local Terminal')).not.toBeInTheDocument();
    expect(within(sidebarB).queryByText('Local Terminal')).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY) || '{}')).toMatchObject({
      sections: {
        local: false,
      },
    });

    await user.click(within(sidebarB).getByRole('button', { name: /本地终端/i }));

    expect(within(sidebarA).getByText('Local Terminal')).toBeInTheDocument();
    expect(within(sidebarB).getByText('Local Terminal')).toBeInTheDocument();
  });

  it('filters sections and persists the selected filter', async () => {
    const user = userEvent.setup();
    const onWindowSelect = vi.fn();

    const localWindow = createSinglePaneWindow('Local Terminal', '/workspace/local', 'bash');
    const sshWindow = {
      ...createSinglePaneWindow('Remote Terminal', '/workspace/remote', 'bash'),
      kind: 'ssh' as const,
    };
    const archivedWindow = {
      ...createSinglePaneWindow('Archived Terminal', '/workspace/archive', 'bash'),
      archived: true,
    };

    useWindowStore.setState({
      windows: [localWindow, sshWindow, archivedWindow],
      activeWindowId: localWindow.id,
      mruList: [localWindow.id, sshWindow.id, archivedWindow.id],
    });

    render(
      <Sidebar activeWindowId={localWindow.id} onWindowSelect={onWindowSelect} />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: '终端筛选' }), 'archived');
    await user.click(screen.getByRole('button', { name: /归档终端/i }));

    expect(screen.queryByText('Local Terminal')).not.toBeInTheDocument();
    expect(screen.queryByText('Remote Terminal')).not.toBeInTheDocument();
    expect(screen.getByText('Archived Terminal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /本地终端/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /远程终端/i })).not.toBeInTheDocument();

    expect(JSON.parse(window.localStorage.getItem(TERMINAL_SIDEBAR_PREFERENCES_STORAGE_KEY) || '{}')).toMatchObject({
      filter: 'archived',
    });
  });
});
