import { Window } from '../types/window';
import { findPaneNode, getAllPanes } from './layoutHelpers';

/**
 * 优先返回当前激活窗格的工作目录，缺失时回退到第一个窗格。
 */
export function getCurrentWindowWorkingDirectory(window: Window): string {
  const activePane = findPaneNode(window.layout, window.activePaneId)?.pane;
  if (activePane?.cwd) {
    return activePane.cwd;
  }

  return getAllPanes(window.layout)[0]?.cwd || '';
}
