import { SSHProfile } from '../../shared/types/ssh';
import { CanvasWorkspace } from '../../shared/types/canvas';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';
import { WindowGroup } from '../../shared/types/window-group';
import { Window, WindowStatus } from '../types/window';
import { getAllWindowIds } from './groupLayoutHelpers';
import { getAllPanes } from './layoutHelpers';
import { getStandalonePersistableWindows, getStandaloneSSHProfileId } from './sshWindowBindings';
import { isInactiveTerminalPaneStatus } from './windowLifecycle';

type CardCollectionOptions = {
  sshEnabled?: boolean;
  sshProfiles?: SSHProfile[];
};

type CardCollectionContext = {
  groupedWindowIds: Set<string>;
  persistableWindows: Window[];
  sshEnabled: boolean;
  sshProfileIds: Set<string>;
  windowsById: Map<string, Window>;
};

function createCardCollectionContext(
  windows: Window[],
  groups: WindowGroup[],
  options: CardCollectionOptions = {},
): CardCollectionContext {
  const persistableWindows = getStandalonePersistableWindows(windows);

  return {
    groupedWindowIds: new Set(groups.flatMap((group) => getAllWindowIds(group.layout))),
    persistableWindows,
    sshEnabled: options.sshEnabled ?? false,
    sshProfileIds: new Set((options.sshProfiles ?? []).map((profile) => profile.id)),
    windowsById: new Map(persistableWindows.map((window) => [window.id, window])),
  };
}

function shouldRenderWindowCard(
  context: CardCollectionContext,
  window: Window,
): boolean {
  if (window.archived) {
    return true;
  }

  const profileId = getStandaloneSSHProfileId(window);
  if (!profileId) {
    return true;
  }

  return !context.sshEnabled || !context.sshProfileIds.has(profileId);
}

function getVisibleStandaloneWindowsFromContext(
  context: CardCollectionContext,
): Window[] {
  return context.persistableWindows.filter((window) => (
    !context.groupedWindowIds.has(window.id) && shouldRenderWindowCard(context, window)
  ));
}

function groupMatchesWindow(
  context: CardCollectionContext,
  group: WindowGroup,
  matcher: (window: Window) => boolean,
): boolean {
  return getAllWindowIds(group.layout).some((windowId) => {
    const window = context.windowsById.get(windowId);
    return Boolean(window && matcher(window));
  });
}

function getWindowStatusFlags(window: Window): {
  running: boolean;
  waiting: boolean;
  inactive: boolean;
} {
  let running = false;
  let waiting = false;
  let inactive = false;

  for (const pane of getAllPanes(window.layout)) {
    running ||= pane.status === WindowStatus.Running;
    waiting ||= pane.status === WindowStatus.WaitingForInput;
    inactive ||= isInactiveTerminalPaneStatus(pane.status);

    if (running && waiting && inactive) {
      break;
    }
  }

  return {
    running,
    waiting,
    inactive,
  };
}

export function getVisibleStandaloneWindows(
  windows: Window[],
  groups: WindowGroup[],
  options: CardCollectionOptions = {},
): Window[] {
  return getVisibleStandaloneWindowsFromContext(
    createCardCollectionContext(windows, groups, options),
  );
}

export function getSidebarCardCounts(
  windows: Window[],
  groups: WindowGroup[],
  canvasWorkspaces: CanvasWorkspace[],
  options: CardCollectionOptions = {},
) {
  const context = createCardCollectionContext(windows, groups, options);
  const visibleStandaloneWindows = getVisibleStandaloneWindowsFromContext(context);
  const activeVisibleWindows = visibleStandaloneWindows.filter((window) => !window.archived);
  const archivedVisibleWindows = visibleStandaloneWindows.filter((window) => window.archived);
  const activeGroups = groups.filter((group) => !group.archived);
  const archivedGroups = groups.filter((group) => group.archived);
  const activeCanvasWorkspaces = canvasWorkspaces.filter((canvasWorkspace) => !canvasWorkspace.archived);
  const archivedCanvasWorkspaces = canvasWorkspaces.filter((canvasWorkspace) => canvasWorkspace.archived);
  const sshProfileCount = context.sshEnabled ? context.sshProfileIds.size : 0;

  const localGroupCount = activeGroups.filter((group) => (
    groupMatchesWindow(context, group, (window) => getWindowKind(window) !== 'ssh')
  )).length;
  const sshGroupCount = activeGroups.filter((group) => (
    groupMatchesWindow(context, group, (window) => getWindowKind(window) === 'ssh')
  )).length;

  return {
    all: activeCanvasWorkspaces.length + activeGroups.length + activeVisibleWindows.length + sshProfileCount + archivedCanvasWorkspaces.length + archivedGroups.length + archivedVisibleWindows.length,
    active: activeCanvasWorkspaces.length + activeGroups.length + activeVisibleWindows.length + sshProfileCount,
    archived: archivedCanvasWorkspaces.length + archivedGroups.length + archivedVisibleWindows.length,
    canvas: activeCanvasWorkspaces.length,
    local: activeVisibleWindows.filter((window) => getWindowKind(window) !== 'ssh').length + localGroupCount,
    ssh: activeVisibleWindows.filter((window) => getWindowKind(window) === 'ssh').length + sshGroupCount + sshProfileCount,
  };
}

export function getStatusCardCounts(
  windows: Window[],
  groups: WindowGroup[],
  options: CardCollectionOptions = {},
) {
  const context = createCardCollectionContext(windows, groups, options);
  const activeVisibleWindows = getVisibleStandaloneWindowsFromContext(context).filter((window) => !window.archived);
  const statusFlagsByWindowId = new Map<string, ReturnType<typeof getWindowStatusFlags>>();

  const getStatusFlags = (window: Window) => {
    const cachedFlags = statusFlagsByWindowId.get(window.id);
    if (cachedFlags) {
      return cachedFlags;
    }

    const flags = getWindowStatusFlags(window);
    statusFlagsByWindowId.set(window.id, flags);
    return flags;
  };

  const counts = {
    running: 0,
    waiting: 0,
    inactive: 0,
  };

  for (const window of activeVisibleWindows) {
    const flags = getStatusFlags(window);
    if (flags.running) counts.running += 1;
    if (flags.waiting) counts.waiting += 1;
    if (flags.inactive) counts.inactive += 1;
  }

  for (const group of groups) {
    if (group.archived) {
      continue;
    }

    let hasRunning = false;
    let hasWaiting = false;
    let hasInactive = false;

    for (const windowId of getAllWindowIds(group.layout)) {
      const window = context.windowsById.get(windowId);
      if (!window) {
        continue;
      }

      const flags = getStatusFlags(window);
      hasRunning ||= flags.running;
      hasWaiting ||= flags.waiting;
      hasInactive ||= flags.inactive;

      if (hasRunning && hasWaiting && hasInactive) {
        break;
      }
    }

    if (hasRunning) counts.running += 1;
    if (hasWaiting) counts.waiting += 1;
    if (hasInactive) counts.inactive += 1;
  }

  return counts;
}
