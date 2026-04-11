import type { Pane } from '../types/window';
import { NativeTypes } from 'react-dnd-html5-backend';
import {
  DragItemTypes,
  type BrowserDropDragItem,
  type PaneDropResult,
  isBrowserPaneDragItem,
  isBrowserToolDragItem,
  isNativeBrowserUrlDragItem,
} from '../components/dnd';
import {
  DEFAULT_BROWSER_URL,
} from './browserPane';
import { isBrowserPane } from '../../shared/utils/terminalCapabilities';
import { sanitizeBrowserUrl } from '../../shared/utils/browserUrls';

export type BrowserDropAction =
  | {
    type: 'none';
  }
  | {
    type: 'open-in-browser-pane';
    targetPaneId: string;
    url: string;
  }
  | {
    type: 'create-browser-pane';
    targetPaneId: string;
    url: string;
    direction: 'horizontal' | 'vertical';
    insertBefore: boolean;
  }
  | {
    type: 'move-browser-pane';
    paneId: string;
    targetPaneId: string;
    direction: 'horizontal' | 'vertical';
    insertBefore: boolean;
  };

function toSplitDirection(position: PaneDropResult['position']): 'horizontal' | 'vertical' {
  return position === 'left' || position === 'right'
    ? 'horizontal'
    : 'vertical';
}

function shouldInsertBefore(position: PaneDropResult['position']): boolean {
  return position === 'left' || position === 'top';
}

function getBrowserMoveSourcePaneId(item: BrowserDropDragItem): string | null {
  if (isBrowserPaneDragItem(item)) {
    return item.paneId;
  }

  if (isBrowserToolDragItem(item) && item.sourceBrowserPaneId) {
    return item.sourceBrowserPaneId;
  }

  return null;
}

export function extractBrowserDropUrl(item: BrowserDropDragItem): string | null {
  if (isBrowserToolDragItem(item)) {
    return sanitizeBrowserUrl(item.url || DEFAULT_BROWSER_URL);
  }

  if (isNativeBrowserUrlDragItem(item)) {
    const firstUrl = item.urls.find((url) => typeof url === 'string' && url.trim().length > 0);
    return firstUrl ? sanitizeBrowserUrl(firstUrl) : null;
  }

  return null;
}

export function resolveBrowserDropAction(
  item: BrowserDropDragItem,
  result: PaneDropResult,
  targetPane: Pane | undefined,
  currentWindowId: string,
): BrowserDropAction {
  const moveSourcePaneId = getBrowserMoveSourcePaneId(item);
  if (moveSourcePaneId) {
    if (
      !('windowId' in item)
      || item.windowId !== currentWindowId
      || moveSourcePaneId === result.targetPaneId
      || result.position === 'center'
    ) {
      return { type: 'none' };
    }

    return {
      type: 'move-browser-pane',
      paneId: moveSourcePaneId,
      targetPaneId: result.targetPaneId,
      direction: toSplitDirection(result.position),
      insertBefore: shouldInsertBefore(result.position),
    };
  }

  const nextUrl = extractBrowserDropUrl(item);
  if (!nextUrl) {
    return { type: 'none' };
  }

  if (isNativeBrowserUrlDragItem(item) && nextUrl === DEFAULT_BROWSER_URL) {
    return { type: 'none' };
  }

  if (isBrowserToolDragItem(item) && item.windowId !== currentWindowId) {
    return { type: 'none' };
  }

  if (result.position === 'center') {
    if (!targetPane || !isBrowserPane(targetPane)) {
      return { type: 'none' };
    }

    return {
      type: 'open-in-browser-pane',
      targetPaneId: result.targetPaneId,
      url: nextUrl,
    };
  }

  return {
    type: 'create-browser-pane',
    targetPaneId: result.targetPaneId,
    url: nextUrl,
    direction: toSplitDirection(result.position),
    insertBefore: shouldInsertBefore(result.position),
  };
}

export function canBrowserDropTargetAcceptItem(
  item: BrowserDropDragItem,
  targetWindowId: string,
  targetPaneId: string,
): boolean {
  const moveSourcePaneId = getBrowserMoveSourcePaneId(item);
  if (moveSourcePaneId) {
    return 'windowId' in item && item.windowId === targetWindowId && moveSourcePaneId !== targetPaneId;
  }

  if (isBrowserToolDragItem(item)) {
    return item.windowId === targetWindowId;
  }

  const nextUrl = extractBrowserDropUrl(item);
  return nextUrl !== null && nextUrl !== DEFAULT_BROWSER_URL;
}

export function isCenterBrowserDropAllowed(
  item: BrowserDropDragItem,
  targetPaneKind: 'terminal' | 'browser',
): boolean {
  return targetPaneKind === 'browser' && isNativeBrowserUrlDragItem(item);
}

export function isBrowserDropItemType(itemType: unknown): boolean {
  return itemType === DragItemTypes.BROWSER_TOOL
    || itemType === DragItemTypes.BROWSER_PANE
    || itemType === NativeTypes.URL;
}
