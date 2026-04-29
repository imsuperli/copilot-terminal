import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaneDropZone } from '../PaneDropZone';
import { DragItemTypes } from '../types';
import { setActiveBrowserPaneDragItem } from '../../../utils/browserPaneDragState';

vi.mock('react-dnd', () => ({
  useDrop: () => [
    { isOver: false, canDrop: false, itemType: null },
    () => undefined,
  ],
}));

describe('PaneDropZone', () => {
  afterEach(() => {
    setActiveBrowserPaneDragItem(null);
  });

  it('handles browser pane move drops through native drag events', () => {
    const onDrop = vi.fn();

    render(
      <PaneDropZone
        targetWindowId="win-1"
        targetPaneId="pane-target"
        targetPaneKind="terminal"
        onDrop={onDrop}
      >
        <div data-testid="pane-content">content</div>
      </PaneDropZone>,
    );

    const container = screen.getByTestId('pane-content').parentElement as HTMLDivElement | null;
    if (!container) {
      throw new Error('expected pane drop container');
    }

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);

    setActiveBrowserPaneDragItem({
      type: DragItemTypes.BROWSER_PANE,
      windowId: 'win-1',
      paneId: 'pane-source',
      url: 'https://example.com',
    });

    fireEvent.dragOver(container, {
      clientX: 100,
      clientY: 90,
    });

    fireEvent.drop(container, {
      clientX: 100,
      clientY: 90,
    });

    expect(onDrop).toHaveBeenCalledWith(
      {
        type: DragItemTypes.BROWSER_PANE,
        windowId: 'win-1',
        paneId: 'pane-source',
        url: 'https://example.com',
      },
      {
        position: 'bottom',
        targetPaneId: 'pane-target',
        targetWindowId: 'win-1',
      },
    );
  });

  it('renders a visible edge drop indicator while hovering a native browser pane drag', () => {
    render(
      <PaneDropZone
        targetWindowId="win-1"
        targetPaneId="pane-target"
        targetPaneKind="terminal"
        onDrop={vi.fn()}
      >
        <div data-testid="pane-content-indicator">content</div>
      </PaneDropZone>,
    );

    const container = screen.getByTestId('pane-content-indicator').parentElement as HTMLDivElement | null;
    if (!container) {
      throw new Error('expected pane drop container');
    }

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);

    setActiveBrowserPaneDragItem({
      type: DragItemTypes.BROWSER_PANE,
      windowId: 'win-1',
      paneId: 'pane-source',
      url: 'https://example.com',
    });

    fireEvent.dragOver(container, {
      clientX: 12,
      clientY: 50,
    });

    const indicator = container.querySelector('[data-pane-drop-indicator="true"]') as HTMLDivElement | null;
    expect(indicator).not.toBeNull();
    expect(indicator?.dataset.paneDropPosition).not.toBe('center');
    expect(indicator?.style.border).toContain('2px dashed');
  });

  it('handles browser pane move drops through the overlay surface', () => {
    const onDrop = vi.fn();

    render(
      <PaneDropZone
        targetWindowId="win-1"
        targetPaneId="pane-target"
        targetPaneKind="terminal"
        onDrop={onDrop}
      >
        <div data-testid="pane-content-overlay">content</div>
      </PaneDropZone>,
    );

    const container = screen.getByTestId('pane-content-overlay').parentElement as HTMLDivElement | null;
    if (!container) {
      throw new Error('expected pane drop container');
    }

    const overlay = container.querySelector('[data-pane-drop-overlay="true"]') as HTMLDivElement | null;
    if (!overlay) {
      throw new Error('expected pane drop overlay');
    }

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);

    setActiveBrowserPaneDragItem({
      type: DragItemTypes.BROWSER_PANE,
      windowId: 'win-1',
      paneId: 'pane-source',
      url: 'https://example.com',
    });

    fireEvent.dragOver(overlay, {
      clientX: 190,
      clientY: 50,
    });

    fireEvent.drop(overlay, {
      clientX: 190,
      clientY: 50,
    });

    expect(onDrop).toHaveBeenCalledWith(
      {
        type: DragItemTypes.BROWSER_PANE,
        windowId: 'win-1',
        paneId: 'pane-source',
        url: 'https://example.com',
      },
      {
        position: 'bottom',
        targetPaneId: 'pane-target',
        targetWindowId: 'win-1',
      },
    );
  });
});
