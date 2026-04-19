import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SplitLayout } from '../SplitLayout';
import { LayoutNode, Pane, WindowStatus } from '../../types/window';
import { useWindowStore } from '../../stores/windowStore';

const mountCounts: Record<string, number> = {};
const unmountCounts: Record<string, number> = {};
const receivedProps: Array<{ paneId: string; isWindowActive: boolean }> = [];

vi.mock('../TerminalPane', () => ({
  TerminalPane: ({
    pane,
    isWindowActive,
  }: {
    pane: Pane;
    isWindowActive: boolean;
  }) => {
    React.useEffect(() => {
      mountCounts[pane.id] = (mountCounts[pane.id] ?? 0) + 1;
      return () => {
        unmountCounts[pane.id] = (unmountCounts[pane.id] ?? 0) + 1;
      };
    }, [pane.id]);

    receivedProps.push({
      paneId: pane.id,
      isWindowActive,
    });

    return <div data-testid={`pane-${pane.id}`} />;
  },
}));

vi.mock('../ChatPane', () => ({
  ChatPane: ({ pane }: { pane: Pane }) => <div data-testid={`chat-pane-${pane.id}`} />,
}));

function createPaneNode(paneId: string): LayoutNode {
  return {
    type: 'pane',
    id: paneId,
    pane: {
      id: paneId,
      cwd: 'D:\\',
      command: 'pwsh.exe',
      status: WindowStatus.Running,
      pid: 1000,
    },
  };
}

describe('SplitLayout', () => {
  beforeEach(() => {
    Object.keys(mountCounts).forEach((key) => delete mountCounts[key]);
    Object.keys(unmountCounts).forEach((key) => delete unmountCounts[key]);
    receivedProps.length = 0;
  });

  it('passes isWindowActive to panes in split layout', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [createPaneNode('pane-a'), createPaneNode('pane-b')],
    };

    render(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="pane-a"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const latestByPane = new Map<string, boolean>();
    receivedProps.forEach((entry) => {
      latestByPane.set(entry.paneId, entry.isWindowActive);
    });

    expect(latestByPane.get('pane-a')).toBe(true);
    expect(latestByPane.get('pane-b')).toBe(true);
  });

  it('keeps existing pane mounted when root changes from single pane to split', () => {
    const paneA = createPaneNode('pane-a');

    const { rerender } = render(
      <SplitLayout
        windowId="win-1"
        layout={paneA}
        activePaneId="pane-a"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const splitLayout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [paneA, createPaneNode('pane-b')],
    };

    rerender(
      <SplitLayout
        windowId="win-1"
        layout={splitLayout}
        activePaneId="pane-a"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    expect(mountCounts['pane-a']).toBe(1);
    expect(unmountCounts['pane-a'] ?? 0).toBe(0);
    expect(mountCounts['pane-b']).toBe(1);
  });

  it('keeps surviving pane mounted when a nested split collapses to one child', () => {
    const initialLayout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
      children: [
        createPaneNode('pane-left'),
        {
          type: 'split',
          direction: 'vertical',
          sizes: [0.5, 0.5],
          children: [createPaneNode('pane-top'), createPaneNode('pane-bottom')],
        },
      ],
    };

    const { rerender } = render(
      <SplitLayout
        windowId="win-1"
        layout={initialLayout}
        activePaneId="pane-bottom"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const nextLayout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.3, 0.7],
      children: [
        createPaneNode('pane-left'),
        {
          type: 'split',
          direction: 'vertical',
          sizes: [1],
          children: [createPaneNode('pane-bottom')],
        },
      ],
    };

    rerender(
      <SplitLayout
        windowId="win-1"
        layout={nextLayout}
        activePaneId="pane-bottom"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    expect(mountCounts['pane-bottom']).toBe(1);
    expect(unmountCounts['pane-bottom'] ?? 0).toBe(0);
  });

  it('keeps an existing pane mounted when only its pid changes', () => {
    const initialLayout: LayoutNode = createPaneNode('pane-stable');
    if (initialLayout.type !== 'pane') {
      throw new Error('expected pane layout');
    }

    const { rerender } = render(
      <SplitLayout
        windowId="win-1"
        layout={initialLayout}
        activePaneId="pane-stable"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const nextLayout: LayoutNode = {
      type: 'pane',
      id: 'pane-stable',
      pane: {
        ...initialLayout.pane,
        pid: 2002,
      },
    };

    rerender(
      <SplitLayout
        windowId="win-1"
        layout={nextLayout}
        activePaneId="pane-stable"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    expect(mountCounts['pane-stable']).toBe(1);
    expect(unmountCounts['pane-stable'] ?? 0).toBe(0);
  });

  it('persists resized split sizes back to the store on drag end', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [createPaneNode('pane-a'), createPaneNode('pane-b')],
    };

    useWindowStore.setState({
      windows: [
        {
          id: 'win-1',
          name: 'Split Window',
          layout,
          activePaneId: 'pane-a',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        },
      ],
      activeWindowId: 'win-1',
      mruList: ['win-1'],
      sidebarExpanded: false,
      sidebarWidth: 200,
    });

    const { container } = render(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="pane-a"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const splitContainer = container.querySelector('.flex-row.w-full.h-full') as HTMLDivElement | null;
    if (!splitContainer) {
      throw new Error('expected split container');
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

    const divider = container.querySelector('.cursor-col-resize');
    if (!divider) {
      throw new Error('expected split divider');
    }

    fireEvent.mouseDown(divider, { clientX: 500, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 300, clientY: 0 });
    fireEvent.mouseUp(document);

    const storedLayout = useWindowStore.getState().windows[0]?.layout;
    expect(storedLayout).toMatchObject({
      type: 'split',
      sizes: [0.3, 0.7],
    });
  });

  it('renders a visible separator for split panes', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      sizes: [0.5, 0.5],
      children: [createPaneNode('pane-a'), createPaneNode('pane-b')],
    };

    render(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="pane-a"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const separator = screen.getByRole('separator', { name: '调整垂直分割线' });
    expect(separator.className).toContain('w-2');
    expect(separator.className).toContain('bg-transparent');

    const dividerIndicator = separator.firstElementChild;
    expect(dividerIndicator).not.toBeNull();
    expect(dividerIndicator?.className).toContain('w-px');
    expect(dividerIndicator?.className).toContain('bg-[rgb(var(--border)/0.85)]');
    expect(dividerIndicator?.className).not.toContain('shadow-');
  });

  it('renders chat panes through the shared layout renderer', () => {
    const layout: LayoutNode = {
      type: 'pane',
      id: 'chat-pane-1',
      pane: {
        id: 'chat-pane-1',
        cwd: '',
        command: '',
        kind: 'chat',
        status: WindowStatus.Paused,
        pid: null,
        chat: {
          messages: [],
          linkedPaneId: 'pane-a',
        },
      },
    };

    render(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="chat-pane-1"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('chat-pane-chat-pane-1')).toBeInTheDocument();
  });
});
