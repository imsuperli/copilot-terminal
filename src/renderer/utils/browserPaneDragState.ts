import type { BrowserPaneDragItem } from '../components/dnd';

let activeBrowserPaneDragItem: BrowserPaneDragItem | null = null;

export function getActiveBrowserPaneDragItem(): BrowserPaneDragItem | null {
  return activeBrowserPaneDragItem;
}

export function setActiveBrowserPaneDragItem(item: BrowserPaneDragItem | null): void {
  activeBrowserPaneDragItem = item;
}
