import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GroupSplitLayout } from '../GroupSplitLayout';
import { useWindowStore } from '../../stores/windowStore';
import { Window, WindowStatus } from '../../types/window';
import { GroupLayoutNode } from '../../../shared/types/window-group';

vi.mock('../TerminalView', () => ({
  TerminalView: ({ window }: { window: Window }) => (
    <div data-testid={`terminal-view-${window.id}`} />
  ),
}));

vi.mock('../dnd', () => ({
  DraggableWindowCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropZone: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

function createWindow(id: string): Window {
  const paneId = `pane-${id}`;

  return {
    id,
    name: `Window ${id}`,
    activePaneId: paneId,
    createdAt: '2026-04-11T00:00:00.000Z',
    lastActiveAt: '2026-04-11T00:00:00.000Z',
    layout: {
      type: 'pane',
      id: paneId,
      pane: {
        id: paneId,
        cwd: `/workspace/${id}`,
        command: 'bash',
        status: WindowStatus.Running,
        pid: 1000,
        backend: 'local',
      },
    },
  };
}

function createGroupLayout(): GroupLayoutNode {
  return {
    type: 'split',
    direction: 'horizontal',
    sizes: [0.5, 0.5],
    children: [
      { type: 'window', id: 'win-a' },
      { type: 'window', id: 'win-b' },
    ],
  };
}

describe('GroupSplitLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWindowStore.setState({
      windows: [],
      groups: [],
      customCategories: [],
      activeWindowId: null,
      activeGroupId: null,
    });
  });

  it('renders group separators with the same visible affordance as split panes', () => {
    const layout = createGroupLayout();

    useWindowStore.setState({
      windows: [createWindow('win-a'), createWindow('win-b')],
      groups: [{
        id: 'group-1',
        name: 'Group 1',
        layout,
        activeWindowId: 'win-a',
        createdAt: '2026-04-11T00:00:00.000Z',
        lastActiveAt: '2026-04-11T00:00:00.000Z',
      }],
    });

    render(
      <GroupSplitLayout
        groupId="group-1"
        layout={layout}
        activeWindowId="win-a"
        isGroupActive
        onWindowActivate={vi.fn()}
        onWindowSwitch={vi.fn()}
        onReturn={vi.fn()}
      />
    );

    const separator = screen.getByRole('separator', { name: '调整垂直分割线' });
    expect(separator.className).toContain('w-2');
    expect(separator.className).toContain('bg-transparent');

    const dividerIndicator = separator.firstElementChild;
    expect(dividerIndicator).not.toBeNull();
    expect(dividerIndicator?.className).toContain('w-px');
    expect(dividerIndicator?.className).toContain('bg-[rgb(var(--border))]/80');
    expect(dividerIndicator?.className).not.toContain('shadow-');
  });

  it('highlights the active group window without adding an outer border', () => {
    const layout = createGroupLayout();

    useWindowStore.setState({
      windows: [createWindow('win-a'), createWindow('win-b')],
      groups: [{
        id: 'group-1',
        name: 'Group 1',
        layout,
        activeWindowId: 'win-a',
        createdAt: '2026-04-11T00:00:00.000Z',
        lastActiveAt: '2026-04-11T00:00:00.000Z',
      }],
    });

    render(
      <GroupSplitLayout
        groupId="group-1"
        layout={layout}
        activeWindowId="win-a"
        isGroupActive
        onWindowActivate={vi.fn()}
        onWindowSwitch={vi.fn()}
        onReturn={vi.fn()}
      />
    );

    const activeWindowShell = screen.getByTestId('terminal-view-win-a').parentElement;
    expect(activeWindowShell).not.toBeNull();
    expect(activeWindowShell?.className).toContain('ring-1');
    expect(activeWindowShell?.className).toContain('ring-inset');
    expect(activeWindowShell?.className).not.toContain('border-zinc-800');
    expect(activeWindowShell?.className).not.toContain('border-[rgb(var(--primary))]/50');
  });

  it('persists resized group split sizes back to the store on drag end', () => {
    const layout = createGroupLayout();

    useWindowStore.setState({
      windows: [createWindow('win-a'), createWindow('win-b')],
      groups: [{
        id: 'group-1',
        name: 'Group 1',
        layout,
        activeWindowId: 'win-a',
        createdAt: '2026-04-11T00:00:00.000Z',
        lastActiveAt: '2026-04-11T00:00:00.000Z',
      }],
    });

    const { container } = render(
      <GroupSplitLayout
        groupId="group-1"
        layout={layout}
        activeWindowId="win-a"
        isGroupActive
        onWindowActivate={vi.fn()}
        onWindowSwitch={vi.fn()}
        onReturn={vi.fn()}
      />
    );

    const splitContainer = container.querySelector('.flex-row.w-full.h-full') as HTMLDivElement | null;
    if (!splitContainer) {
      throw new Error('expected group split container');
    }

    vi.spyOn(splitContainer, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 400,
      right: 1000,
      width: 1000,
      height: 400,
      toJSON: () => ({}),
    });

    const divider = screen.getByRole('separator', { name: '调整垂直分割线' });
    fireEvent.mouseDown(divider, { clientX: 500, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 300, clientY: 0 });
    fireEvent.mouseUp(document);

    const storedLayout = useWindowStore.getState().groups[0]?.layout;
    expect(storedLayout).toMatchObject({
      type: 'split',
      sizes: [0.3, 0.7],
    });
  });
});
