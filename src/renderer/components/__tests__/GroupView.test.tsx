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
        pid: status === WindowStatus.Completed ? null : 1000,
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
    expect(windows.every((window) => window.layout.type === 'pane' && window.layout.pane.status === WindowStatus.Completed)).toBe(true);
    expect(useWindowStore.getState().groups).toEqual([group]);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('archives persistable group windows after destroying sessions, even when an ephemeral ssh clone is present', async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    const ownerWindow = createWindow('win-a', WindowStatus.Running);
    const cloneWindow = {
      ...createWindow('win-b', WindowStatus.Running),
      ephemeral: true,
      kind: 'ssh' as const,
    };
    const group = createGroup([ownerWindow.id, cloneWindow.id]);

    useWindowStore.setState({
      windows: [ownerWindow, cloneWindow],
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

    await user.click(screen.getByRole('button', { name: '归档组' }));

    await waitFor(() => {
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(ownerWindow.id);
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith(ownerWindow.id);
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(cloneWindow.id);
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith(cloneWindow.id);
    });

    const storedOwner = useWindowStore.getState().windows.find((window) => window.id === ownerWindow.id);
    expect(storedOwner?.archived).toBe(true);
    expect(useWindowStore.getState().windows.some((window) => window.id === cloneWindow.id)).toBe(false);
    expect(useWindowStore.getState().groups).toHaveLength(0);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('destroys grouped ssh owner sessions while also removing owned ephemeral clone tabs', async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    const ownerWindow = {
      ...createWindow('win-a', WindowStatus.Running),
      kind: 'ssh' as const,
      layout: {
        type: 'pane' as const,
        id: 'pane-win-a',
        pane: {
          id: 'pane-win-a',
          cwd: '/srv/app',
          command: '',
          status: WindowStatus.Running,
          pid: 1000,
          backend: 'ssh' as const,
          ssh: {
            profileId: 'profile-1',
          },
        },
      },
    };
    const groupedWindow = createWindow('win-b', WindowStatus.Running);
    const cloneWindow = {
      ...createWindow('win-clone', WindowStatus.Running),
      ephemeral: true,
      kind: 'ssh' as const,
      sshTabOwnerWindowId: ownerWindow.id,
      layout: {
        type: 'pane' as const,
        id: 'pane-win-clone',
        pane: {
          id: 'pane-win-clone',
          cwd: '/srv/clone',
          command: '',
          status: WindowStatus.Running,
          pid: 1001,
          backend: 'ssh' as const,
          ssh: {
            profileId: 'profile-1',
          },
        },
      },
    };
    const group = createGroup([ownerWindow.id, groupedWindow.id]);

    useWindowStore.setState({
      windows: [ownerWindow, groupedWindow, cloneWindow],
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
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(ownerWindow.id);
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith(ownerWindow.id);
      expect(window.electronAPI.closeWindow).toHaveBeenCalledWith(cloneWindow.id);
      expect(window.electronAPI.deleteWindow).toHaveBeenCalledWith(cloneWindow.id);
    });

    const storedOwner = useWindowStore.getState().windows.find((window) => window.id === ownerWindow.id);
    expect(storedOwner).toBeDefined();
    expect(storedOwner?.layout.type).toBe('pane');
    if (storedOwner?.layout.type === 'pane') {
      expect(storedOwner.layout.pane.status).toBe(WindowStatus.Completed);
      expect(storedOwner.layout.pane.pid).toBeNull();
    }
    expect(useWindowStore.getState().windows.some((window) => window.id === cloneWindow.id)).toBe(false);
    expect(useWindowStore.getState().groups).toEqual([group]);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
