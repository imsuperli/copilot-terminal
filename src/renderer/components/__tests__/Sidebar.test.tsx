import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';

vi.mock('../SidebarWindowItem', () => ({
  SidebarWindowItem: ({ window }: { window: { name: string } }) => <div>{window.name}</div>,
}));

describe('Terminal Sidebar', () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      mruList: [],
      groupMruList: [],
      sidebarExpanded: true,
      sidebarWidth: 200,
      hideGroupedWindows: false,
      terminalSidebarSections: {
        archived: false,
        local: true,
        ssh: true,
      },
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

    await user.click(within(sidebarB).getByRole('button', { name: /本地终端/i }));

    expect(within(sidebarA).getByText('Local Terminal')).toBeInTheDocument();
    expect(within(sidebarB).getByText('Local Terminal')).toBeInTheDocument();
  });
});
