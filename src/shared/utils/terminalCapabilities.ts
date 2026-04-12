import { Pane, Window } from '../types/window';

export function getPaneKind(pane: Pane): NonNullable<Pane['kind']> {
  return pane.kind ?? 'terminal';
}

export function isBrowserPane(pane: Pane): boolean {
  return getPaneKind(pane) === 'browser';
}

export function isCodePane(pane: Pane): boolean {
  return getPaneKind(pane) === 'code';
}

export function isChatPane(pane: Pane): boolean {
  return getPaneKind(pane) === 'chat';
}

export function isSessionlessPane(pane: Pane): boolean {
  return isBrowserPane(pane) || isCodePane(pane) || isChatPane(pane);
}

export function isTerminalPane(pane: Pane): boolean {
  return !isSessionlessPane(pane);
}

export function getPaneBackend(pane: Pane): NonNullable<Pane['backend']> {
  if (isSessionlessPane(pane)) {
    return 'local';
  }

  return pane.backend ?? 'local';
}

export function getPaneCapabilities(pane: Pane): NonNullable<Pane['capabilities']> {
  if (isSessionlessPane(pane)) {
    return {
      canOpenLocalFolder: false,
      canOpenInIDE: false,
      canWatchGitBranch: false,
      canReconnect: false,
      canOpenSFTP: false,
      canManagePortForwards: false,
      canCloneSession: false,
    };
  }

  if (pane.capabilities) {
    return pane.capabilities;
  }

  if (getPaneBackend(pane) === 'ssh') {
    return {
      canOpenLocalFolder: false,
      canOpenInIDE: false,
      canWatchGitBranch: false,
      canReconnect: true,
      canOpenSFTP: true,
      canManagePortForwards: true,
      canCloneSession: true,
    };
  }

  return {
    canOpenLocalFolder: true,
    canOpenInIDE: true,
    canWatchGitBranch: true,
    canReconnect: false,
    canOpenSFTP: false,
    canManagePortForwards: false,
    canCloneSession: true,
  };
}

export function canPaneOpenLocalFolder(pane: Pane): boolean {
  return getPaneCapabilities(pane).canOpenLocalFolder;
}

export function canPaneOpenInIDE(pane: Pane): boolean {
  return getPaneCapabilities(pane).canOpenInIDE;
}

export function canPaneWatchGitBranch(pane: Pane): boolean {
  return getPaneCapabilities(pane).canWatchGitBranch;
}

export function getWindowKind(window: Window): NonNullable<Window['kind']> {
  if (window.kind) {
    return window.kind;
  }

  const backends = new Set<string>();

  const collect = (node: Window['layout']) => {
    if (node.type === 'pane') {
      if (isSessionlessPane(node.pane)) {
        return;
      }
      backends.add(getPaneBackend(node.pane));
      return;
    }

    node.children.forEach(collect);
  };

  collect(window.layout);

  if (backends.size === 0) {
    return 'local';
  }

  if (backends.size === 1) {
    return backends.has('ssh') ? 'ssh' : 'local';
  }

  return 'mixed';
}
