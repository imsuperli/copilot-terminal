import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupView } from '../GroupView';
import { useWindowStore } from '../../stores/windowStore';
import { Window, WindowStatus } from '../../types/window';
import { WindowGroup } from '../../../shared/types/window-group';
import { CUSTOM_TITLEBAR_ACTIONS_SLOT_ID } from '../CustomTitleBar';

vi.mock('../Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock('../GroupSplitLayout', () => ({
  GroupSplitLayout: () => <div data-testid="group-split-layout" />,
}));

vi.mock('../QuickSwitcher', () => ({
  QuickSwitcher: () => null,
}));

vi.mock('../SettingsPanel', () => ({
  SettingsPanel: () => null,
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}));

function createWindow(id: string, status: WindowStatus = WindowStatus.Running): Window {
  const paneId = `pane-${id}`;

  return {
    id,
    name: `Window ${id}`,
    activePaneId: paneId,
    createdAt: '2026-04-23T00:00:00.000Z',
    lastActiveAt: '2026-04-23T00:00:00.000Z',
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: `/workspace/${id}`,
        command: 'bash',
        status,
        pid: status === WindowStatus.Paused ? null : 1000,
        backend: 'local',
      },
    },
  };
}

function createGroup(windowIds: string[]): WindowGroup {
  return {
    id: 'group-1',
    name: 'Group 1',
    layout: {
      type: 'split',
      direction: 'horizontal',
      sizes: windowIds.map(() => 1 / windowIds.length),
      children: windowIds.map((id) => ({ type: 'window' as const, id })),
    },
    activeWindowId: windowIds[0],
    createdAt: '2026-04-23T00:00:00.000Z',
    lastActiveAt: '2026-04-23T00:00:00.000Z',
  };
}

describe('GroupView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `<div id="${CUSTOM_TITLEBAR_ACTIONS_SLOT_ID}"></div>`;
    useWindowStore.setState({
      windows: [],
      groups: [],
      customCategories: [],
      activeWindowId: null,
      activeGroupId: null,
      groupMruList: [],
    });
  });

  it('destroys every window resource in the group without removing window cards', async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    const runningWindow = createWindow('win-a', WindowStatus.Running);
    const waitingWindow = createWindow('win-b', WindowStatus.WaitingForInput);
    const group = createGroup([runningWindow.id, waitingWindow.id]);

    useWindowStore.setState({
      windows: [runningWindow, waitingWindow],
      groups: [group],
      activeGroupId: group.id,
    });

    render(
      <GroupView
        group={group}
        onReturn={onReturn}
        onWindowSwitch={vi.fn()}
        isActive
      />,
    );

    await user.click(screen.getByRole('button', { name: '销毁全部' }));

    await waitFor(() => {
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(runningWindow.id);
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith(runningWindow.id);
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(waitingWindow.id);
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith(waitingWindow.id);
    });

    const windows = useWindowStore.getState().windows;
    expect(windows.map((window) => window.id)).toEqual([runningWindow.id, waitingWindow.id]);
    expect(windows.every((window) => window.layout.type === 'pane' && window.layout.pane.status === WindowStatus.Paused)).toBe(true);
    expect(useWindowStore.getState().groups).toEqual([group]);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
