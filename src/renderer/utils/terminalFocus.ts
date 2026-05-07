export const ACTIVE_TERMINAL_FOCUS_REQUEST_EVENT = 'synapse:request-active-terminal-focus';

export interface ActiveTerminalFocusRequestDetail {
  windowId: string;
  paneId?: string | null;
  defer?: boolean;
}

export function requestActiveTerminalFocus(detail: ActiveTerminalFocusRequestDetail): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<ActiveTerminalFocusRequestDetail>(
    ACTIVE_TERMINAL_FOCUS_REQUEST_EVENT,
    { detail },
  ));
}

export function matchesActiveTerminalFocusRequest(
  detail: ActiveTerminalFocusRequestDetail | null | undefined,
  windowId: string,
  paneId: string,
): boolean {
  if (!detail) {
    return false;
  }

  if (detail.windowId !== windowId) {
    return false;
  }

  return !detail.paneId || detail.paneId === paneId;
}
