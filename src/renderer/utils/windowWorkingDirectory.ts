import { Pane, Window } from '../types/window';
import { findPaneNode, getAllPanes } from './layoutHelpers';
import { isTerminalPane } from '../../shared/utils/terminalCapabilities';

/**
 * 优先返回当前激活的 terminal pane，缺失时回退到第一个 terminal pane。
 */
export function getCurrentWindowTerminalPane(window: Window): Pane | null {
  const activePane = findPaneNode(window.layout, window.activePaneId)?.pane;
  if (activePane && isTerminalPane(activePane)) {
    return activePane;
  }

  return getAllPanes(window.layout).find((pane) => isTerminalPane(pane)) ?? null;
}

/**
 * 优先返回当前激活 terminal pane 的工作目录，缺失时回退到第一个 terminal pane。
 */
export function getCurrentWindowWorkingDirectory(window: Window): string {
  return getCurrentWindowTerminalPane(window)?.cwd || '';
}
