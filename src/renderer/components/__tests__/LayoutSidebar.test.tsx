import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../layout/Sidebar';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';
import { WindowStatus, type Window } from '../../types/window';

vi.mock('../StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}));

vi.mock('../CreateWindowDialog', () => ({
  CreateWindowDialog: () => null,
}));

vi.mock('../BatchCreateWindowDialog', () => ({
  BatchCreateWindowDialog: () => null,
}));

vi.mock('../SettingsPanel', () => ({
  SettingsPanel: () => null,
}));

vi.mock('../QuickNavPanel', () => ({
  QuickNavPanel: () => null,
}));

vi.mock('../AboutPanel', () => ({
  AboutPanel: () => null,
}));

vi.mock('../dnd/CategoryDropZone', () => ({
  CategoryDropZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function createWindowWithStatus(name: string, status: WindowStatus): Window {
  const window = createSinglePaneWindow(name, `/workspace/${name}`, 'bash');
  if (window.layout.type === 'pane') {
    window.layout.pane.status = status;
    window.layout.pane.pid = status === WindowStatus.Completed ? null : 1000;
  }
  return window;
}

describe('Layout Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      groups: [],
      customCategories: [],
      activeWindowId: null,
      activeGroupId: null,
      mruList: [],
      groupMruList: [],
    });
  });

  it('deletes active window records when clearing the workspace tab', async () => {
    const user = userEvent.setup();
    const activeWindow = createWindowWithStatus('active-a', WindowStatus.Running);
    const otherWindow = {
      ...createWindowWithStatus('archived-a', WindowStatus.Completed),
      archived: true,
    };

    useWindowStore.setState({
      windows: [activeWindow, otherWindow],
    });

    render(
      <Sidebar
        currentTab="active"
        searchQuery=""
        onSearchChange={vi.fn()}
        onTabChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '清空工作区' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(activeWindow.id);
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith(activeWindow.id);
    });

    const storedWindows = useWindowStore.getState().windows;
    expect(storedWindows.map((window) => window.id)).toEqual([otherWindow.id]);
  });
});
