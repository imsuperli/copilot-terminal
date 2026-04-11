import { SSHProfile } from '../../shared/types/ssh';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';
import { WindowGroup } from '../../shared/types/window-group';
import { Window, WindowStatus } from '../types/window';
import { getAllWindowIds } from './groupLayoutHelpers';
import { getAllPanes } from './layoutHelpers';
import { getPersistableWindows, getStandaloneSSHProfileId } from './sshWindowBindings';

type CardCollectionOptions = {
  sshEnabled?: boolean;
  sshProfiles?: SSHProfile[];
};

type CardCollectionContext = {
  groupedWindowIds: Set<string>;
  persistableWindows: Window[];
  sshEnabled: boolean;
  sshProfileIds: Set<string>;
};

function createCardCollectionContext(
  windows: Window[],
  groups: WindowGroup[],
  options: CardCollectionOptions = {},
): CardCollectionContext {
  return {
    groupedWindowIds: new Set(groups.flatMap((group) => getAllWindowIds(group.layout))),
    persistableWindows: getPersistableWindows(windows),
    sshEnabled: options.sshEnabled ?? false,
    sshProfileIds: new Set((options.sshProfiles ?? []).map((profile) => profile.id)),
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
  const groupWindowIds = new Set(getAllWindowIds(group.layout));
  return context.persistableWindows.some((window) => (
    groupWindowIds.has(window.id) && matcher(window)
  ));
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
  options: CardCollectionOptions = {},
) {
  const context = createCardCollectionContext(windows, groups, options);
  const visibleStandaloneWindows = getVisibleStandaloneWindowsFromContext(context);
  const activeVisibleWindows = visibleStandaloneWindows.filter((window) => !window.archived);
  const archivedVisibleWindows = visibleStandaloneWindows.filter((window) => window.archived);
  const activeGroups = groups.filter((group) => !group.archived);
  const archivedGroups = groups.filter((group) => group.archived);
  const sshProfileCount = context.sshEnabled ? context.sshProfileIds.size : 0;

  const localGroupCount = activeGroups.filter((group) => (
    groupMatchesWindow(context, group, (window) => getWindowKind(window) !== 'ssh')
  )).length;
  const sshGroupCount = activeGroups.filter((group) => (
    groupMatchesWindow(context, group, (window) => getWindowKind(window) === 'ssh')
  )).length;

  return {
    all: activeGroups.length + activeVisibleWindows.length + sshProfileCount + archivedGroups.length + archivedVisibleWindows.length,
    active: activeGroups.length + activeVisibleWindows.length + sshProfileCount,
    archived: archivedGroups.length + archivedVisibleWindows.length,
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

  const countMatches = (targetStatus: WindowStatus) => {
    const standaloneWindowCount = activeVisibleWindows.filter((window) => (
      getAllPanes(window.layout).some((pane) => pane.status === targetStatus)
    )).length;
    const groupCount = groups.filter((group) => (
      !group.archived
      && groupMatchesWindow(context, group, (window) => (
        getAllPanes(window.layout).some((pane) => pane.status === targetStatus)
      ))
    )).length;

    return standaloneWindowCount + groupCount;
  };

  return {
    running: countMatches(WindowStatus.Running),
    waiting: countMatches(WindowStatus.WaitingForInput),
    paused: countMatches(WindowStatus.Paused),
  };
}
