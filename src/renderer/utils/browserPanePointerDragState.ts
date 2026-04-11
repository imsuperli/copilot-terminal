import type { BrowserPaneDragItem, PaneDropResult } from '../components/dnd';

export interface BrowserPanePointerDragState {
  active: boolean;
  item: BrowserPaneDragItem | null;
  hover: PaneDropResult | null;
}

type BrowserPanePointerDragListener = (state: BrowserPanePointerDragState) => void;

const listeners = new Set<BrowserPanePointerDragListener>();

let state: BrowserPanePointerDragState = {
  active: false,
  item: null,
  hover: null,
};

function notify(): void {
  for (const listener of listeners) {
    listener(state);
  }
}

export function getBrowserPanePointerDragState(): BrowserPanePointerDragState {
  return state;
}

export function startBrowserPanePointerDrag(item: BrowserPaneDragItem): void {
  state = {
    active: true,
    item,
    hover: null,
  };
  notify();
}

export function updateBrowserPanePointerDragHover(hover: PaneDropResult | null): void {
  if (
    state.hover?.targetPaneId === hover?.targetPaneId
    && state.hover?.targetWindowId === hover?.targetWindowId
    && state.hover?.position === hover?.position
  ) {
    return;
  }

  state = {
    ...state,
    hover,
  };
  notify();
}

export function endBrowserPanePointerDrag(): void {
  if (!state.active && !state.item && !state.hover) {
    return;
  }

  state = {
    active: false,
    item: null,
    hover: null,
  };
  notify();
}

export function subscribeBrowserPanePointerDrag(
  listener: BrowserPanePointerDragListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
