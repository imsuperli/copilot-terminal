import type { LayoutNode, Pane } from '../types/window';
import { WindowStatus } from '../types/window';
import { findPanePath, getPaneCount } from './layoutHelpers';

export const DEFAULT_BROWSER_URL = 'about:blank';
const DEFAULT_SEARCH_BASE_URL = 'https://duckduckgo.com/?q=';

function hasExplicitProtocol(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
}

function isLikelyLocalAddress(value: string): boolean {
  return /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})(:\d+)?(\/.*)?$/i.test(value);
}

function isLikelyWebHost(value: string): boolean {
  return /^[^\s/]+\.[^\s/]+(?::\d+)?(?:\/.*)?$/i.test(value) || isLikelyLocalAddress(value);
}

export function normalizeBrowserInput(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) {
    return DEFAULT_BROWSER_URL;
  }

  if (hasExplicitProtocol(value)) {
    try {
      return new URL(value).toString();
    } catch {
      return `${DEFAULT_SEARCH_BASE_URL}${encodeURIComponent(value)}`;
    }
  }

  if (isLikelyWebHost(value)) {
    const protocol = isLikelyLocalAddress(value) ? 'http://' : 'https://';
    try {
      return new URL(`${protocol}${value}`).toString();
    } catch {
      return `${DEFAULT_SEARCH_BASE_URL}${encodeURIComponent(value)}`;
    }
  }

  return `${DEFAULT_SEARCH_BASE_URL}${encodeURIComponent(value)}`;
}

export function createBrowserPaneDraft(paneId: string, url: string = DEFAULT_BROWSER_URL): Pane {
  return {
    id: paneId,
    kind: 'browser',
    cwd: '',
    command: '',
    status: WindowStatus.Paused,
    pid: null,
    browser: {
      url,
    },
  };
}

function getOppositeDirection(direction: 'horizontal' | 'vertical'): 'horizontal' | 'vertical' {
  return direction === 'horizontal' ? 'vertical' : 'horizontal';
}

export function getSmartBrowserSplitDirection(
  layout: LayoutNode,
  activePaneId: string,
): 'horizontal' | 'vertical' {
  const paneCount = getPaneCount(layout);
  if (paneCount <= 1) {
    return 'horizontal';
  }

  const path = findPanePath(layout, activePaneId);
  const nearestParent = path?.[path.length - 1]?.node;
  if (!nearestParent) {
    return paneCount >= 3 ? 'vertical' : 'horizontal';
  }

  if (paneCount >= 3) {
    return getOppositeDirection(nearestParent.direction);
  }

  return nearestParent.direction === 'horizontal' ? 'vertical' : 'horizontal';
}
