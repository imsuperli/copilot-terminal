import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SplitLayout } from '../SplitLayout';
import { LayoutNode, Pane, WindowStatus } from '../../types/window';
import { useWindowStore } from '../../stores/windowStore';
import { __resetPaneNoteStoreForTests, getPaneNote, usePaneNoteStore } from '../../stores/paneNoteStore';

vi.mock('react-dnd', () => ({
  useDrop: () => [{ isOver: false }, () => undefined],
}));

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
    __resetPaneNoteStoreForTests();
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

  it('dims inactive panes and reduces the scrim on hover', () => {
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

    const paneA = screen.getByTestId('pane-pane-a');
    const paneB = screen.getByTestId('pane-pane-b');
    const paneAFrame = paneA.parentElement as HTMLElement;
    const paneBFrame = paneB.parentElement as HTMLElement;
    const paneAOverlay = Array.from(paneAFrame.querySelectorAll('[aria-hidden="true"]')).at(-1) as HTMLElement;
    const paneBOverlay = Array.from(paneBFrame.querySelectorAll('[aria-hidden="true"]')).at(-1) as HTMLElement;

    expect(paneAFrame.dataset.paneVisualState).toBe('active');
    expect(paneAOverlay.style.opacity).toBe('0');
    expect(paneBFrame.dataset.paneVisualState).toBe('inactive');
    expect(paneBOverlay.style.opacity).toBe('var(--appearance-pane-inactive-scrim-opacity)');

    fireEvent.mouseEnter(paneBFrame);

    expect(paneBFrame.dataset.paneVisualState).toBe('hover');
    expect(paneBOverlay.style.opacity).toBe('var(--appearance-pane-hover-scrim-opacity)');
  });

  it('dims the active pane when its window is not active', () => {
    const layout: LayoutNode = createPaneNode('pane-a');

    render(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="pane-a"
        isWindowActive={false}
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const pane = screen.getByTestId('pane-pane-a');
    const frame = pane.parentElement as HTMLElement;
    const overlay = Array.from(frame.querySelectorAll('[aria-hidden="true"]')).at(-1) as HTMLElement;

    expect(frame.dataset.paneVisualState).toBe('window-inactive');
    expect(overlay.style.opacity).toBe('var(--appearance-pane-window-inactive-scrim-opacity)');
  });

  it('creates a pane note, collapses when inactive, and expands on hover', async () => {
    const layout: LayoutNode = createPaneNode('pane-a');

    const { rerender } = render(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="pane-a"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const pane = screen.getByTestId('pane-pane-a');
    const frame = pane.parentElement as HTMLElement;

    usePaneNoteStore.getState().openDraft('win-1', 'pane-a');

    const textarea = await screen.findByPlaceholderText('记录这个窗格当前在做什么');
    fireEvent.change(textarea, { target: { value: 'Investigating deploy failure' } });
    fireEvent.blur(textarea);

    expect(getPaneNote('win-1', 'pane-a')).toEqual({
      text: 'Investigating deploy failure',
      pinned: false,
      side: 'right',
    });

    fireEvent.mouseLeave(frame);

    rerender(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="other-pane"
        isWindowActive={false}
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '展开便签' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑便签' })).not.toBeInTheDocument();

    fireEvent.mouseEnter(frame);

    expect(screen.getByText('Investigating deploy failure')).toBeInTheDocument();
  });

  it('collapses a note when the pane becomes inactive', async () => {
    const layout: LayoutNode = createPaneNode('pane-a');

    const { rerender } = render(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="pane-a"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const pane = screen.getByTestId('pane-pane-a');
    const frame = pane.parentElement as HTMLElement;

    usePaneNoteStore.getState().openDraft('win-1', 'pane-a');

    const textarea = await screen.findByPlaceholderText('记录这个窗格当前在做什么');
    fireEvent.change(textarea, { target: { value: 'Pinned note' } });
    fireEvent.blur(textarea);

    fireEvent.mouseLeave(frame);

    rerender(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="other-pane"
        isWindowActive={false}
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '展开便签' })).toBeInTheDocument();
    expect(getPaneNote('win-1', 'pane-a')).toEqual({
      text: 'Pinned note',
      pinned: false,
      side: 'right',
    });
  });

  it('cleans up pane notes when a pane is removed from the layout', async () => {
    const layout: LayoutNode = createPaneNode('pane-a');

    const { rerender } = render(
      <SplitLayout
        windowId="win-1"
        layout={layout}
        activePaneId="pane-a"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    const pane = screen.getByTestId('pane-pane-a');

    usePaneNoteStore.getState().openDraft('win-1', 'pane-a');

    const textarea = await screen.findByPlaceholderText('记录这个窗格当前在做什么');
    fireEvent.change(textarea, { target: { value: 'Temporary note' } });
    fireEvent.blur(textarea);

    expect(getPaneNote('win-1', 'pane-a')).toEqual({
      text: 'Temporary note',
      pinned: false,
      side: 'right',
    });

    rerender(
      <SplitLayout
        windowId="win-1"
        layout={createPaneNode('pane-b')}
        activePaneId="pane-b"
        isWindowActive
        onPaneActivate={vi.fn()}
        onPaneClose={vi.fn()}
      />
    );

    expect(getPaneNote('win-1', 'pane-a')).toBeUndefined();
  });

  it('allows dragging a pane note between top-right and top-left snap positions', async () => {
    const layout: LayoutNode = createPaneNode('pane-a');

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

    const pane = screen.getByTestId('pane-pane-a');
    const frame = pane.parentElement as HTMLElement;
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      top: 0,
      right: 400,
      bottom: 300,
      left: 0,
      toJSON: () => ({}),
    });

    usePaneNoteStore.getState().openDraft('win-1', 'pane-a');

    const textarea = await screen.findByPlaceholderText('记录这个窗格当前在做什么');
    fireEvent.change(textarea, { target: { value: 'Move me' } });
    fireEvent.blur(textarea);

    const noteCard = screen.getByText('Move me').closest('[data-pane-note-side] > div:last-child') as HTMLElement | null;
    if (!noteCard) {
      throw new Error('expected pane note card');
    }
    fireEvent.pointerDown(noteCard, { button: 0, pointerId: 1, clientX: 360, clientY: 12 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 40, clientY: 12 });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 40, clientY: 12 });

    expect(getPaneNote('win-1', 'pane-a')).toEqual({
      text: 'Move me',
      pinned: false,
      side: 'left',
    });

    const overlay = screen.getByText('Move me').closest('[data-pane-note-side]') as HTMLElement;
    expect(overlay.dataset.paneNoteSide).toBe('left');
  });

  it('pastes clipboard text on right click without opening a menu', async () => {
    const layout: LayoutNode = createPaneNode('pane-a');
    vi.mocked(window.electronAPI.readClipboardText).mockResolvedValue({
      success: true,
      data: 'clipboard note',
    } as any);

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

    usePaneNoteStore.getState().openDraft('win-1', 'pane-a');
    const textarea = await screen.findByPlaceholderText('记录这个窗格当前在做什么');
    fireEvent.contextMenu(textarea);

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('clipboard note');
    });
  });

  it('removes a pane note when the delete button is clicked', async () => {
    const layout: LayoutNode = createPaneNode('pane-a');

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

    usePaneNoteStore.getState().openDraft('win-1', 'pane-a');

    const textarea = await screen.findByPlaceholderText('记录这个窗格当前在做什么');
    fireEvent.change(textarea, { target: { value: 'Delete me' } });
    fireEvent.blur(textarea);

    fireEvent.click(screen.getByRole('button', { name: '删除便签' }));

    expect(getPaneNote('win-1', 'pane-a')).toBeUndefined();
    expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
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
    expect(separator).toHaveStyle({
      backgroundColor: 'rgb(var(--border) / var(--appearance-split-divider-track-opacity))',
    });

    const dividerIndicator = separator.firstElementChild;
    expect(dividerIndicator).not.toBeNull();
    expect(dividerIndicator?.className).toContain('w-px');
    expect(dividerIndicator?.className).toContain('transition-all');

    const dividerGlow = dividerIndicator?.nextElementSibling;
    expect(dividerGlow).not.toBeNull();
    expect(dividerGlow?.className).toContain('w-[3px]');
  });

  it('brightens the separator on hover before resizing starts', () => {
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
    const dividerIndicator = separator.firstElementChild as HTMLElement;
    const dividerGlow = dividerIndicator.nextElementSibling as HTMLElement;

    fireEvent.mouseEnter(separator);

    expect(separator).toHaveStyle({
      backgroundColor: 'rgb(var(--border) / calc(var(--appearance-split-divider-track-opacity) + 0.12))',
    });
    expect(dividerIndicator.style.backgroundColor).toBe('rgb(var(--primary) / 0.72)');
    expect(dividerGlow.style.opacity).toBe('1');
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
