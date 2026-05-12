import { LayoutNode, Pane, Window, WindowStatus } from '../types/window';
import { isSessionlessPane, isTerminalPane } from '../../shared/utils/terminalCapabilities';

export function isLegacyPausedStatus(status: WindowStatus): boolean {
  return status === WindowStatus.Paused;
}

export function isLiveTerminalPaneStatus(status: WindowStatus): boolean {
  return status === WindowStatus.Running || status === WindowStatus.WaitingForInput || status === WindowStatus.Restoring;
}

export function isInactiveTerminalPaneStatus(status: WindowStatus): boolean {
  return status === WindowStatus.Completed || status === WindowStatus.Error || isLegacyPausedStatus(status);
}

export function hasLiveTerminalSession(pane: Pane): boolean {
  if (isSessionlessPane(pane)) {
    return false;
  }

  if (!isLiveTerminalPaneStatus(pane.status)) {
    return false;
  }

  return pane.pid !== null;
}

export function canStartPaneSession(pane: Pane): boolean {
  return isTerminalPane(pane) && !hasLiveTerminalSession(pane);
}

export function getStartablePanes(window: Window): Pane[] {
  return getAllPanesFromLayout(window.layout).filter((pane) => canStartPaneSession(pane));
}

export function hasAnyLiveTerminalSession(window: Window): boolean {
  return getAllPanesFromLayout(window.layout).some((pane) => hasLiveTerminalSession(pane));
}

export function getInactiveWindowStatus(panes: Pane[]): WindowStatus {
  if (panes.some((pane) => pane.status === WindowStatus.Error)) {
    return WindowStatus.Error;
  }

  return WindowStatus.Completed;
}

export function isWindowStartable(window: Window): boolean {
  return getStartablePanes(window).length > 0;
}

function getAllPanesFromLayout(layout: LayoutNode): Pane[] {
  if (layout.type === 'pane') {
    return [layout.pane];
  }

  return layout.children.flatMap((child) => getAllPanesFromLayout(child));
}
