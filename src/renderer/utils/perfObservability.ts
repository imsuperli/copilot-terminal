import { WindowStatus } from '../types/window';

const pendingTerminalSwitchStarts = new Map<string, number>();
let lastLoggedMountedObservationKey: string | null = null;

export interface MountedTerminalObservationSnapshot {
  currentView: 'unified' | 'terminal';
  activeWindowId: string | null;
  activeGroupId: string | null;
  mountedWindowIds: string[];
  hiddenMountedWindowIds: string[];
  hiddenRunningWindowIds: string[];
  mountedWindowCount: number;
  hiddenMountedWindowCount: number;
  hiddenRunningWindowCount: number;
  mountedTerminalPaneCount: number;
  hiddenMountedTerminalPaneCount: number;
}

function parseRecordKeyMap(recordKeys: string[]): Map<string, string> {
  return new Map(
    recordKeys.map((recordKey) => {
      const separatorIndex = recordKey.lastIndexOf(':');
      return [
        recordKey.slice(0, separatorIndex),
        recordKey.slice(separatorIndex + 1),
      ] as const;
    }),
  );
}

function isMountedWindowHidden(
  windowId: string,
  currentView: MountedTerminalObservationSnapshot['currentView'],
  activeWindowId: string | null,
  activeGroupId: string | null,
): boolean {
  if (currentView !== 'terminal') {
    return true;
  }

  if (activeGroupId) {
    return true;
  }

  return activeWindowId !== windowId;
}

function isRunningMountedStatus(status: string | undefined): boolean {
  return status === WindowStatus.Running
    || status === WindowStatus.WaitingForInput
    || status === WindowStatus.Restoring;
}

function shouldLogMountedObservation(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function createMountedTerminalObservationSnapshot(input: {
  currentView: 'unified' | 'terminal';
  activeWindowId: string | null;
  activeGroupId: string | null;
  mountedWindowIds: string[];
  mountedWindowStatusKeys: string[];
  mountedWindowTerminalPaneCountKeys: string[];
}): MountedTerminalObservationSnapshot {
  const statusByWindowId = parseRecordKeyMap(input.mountedWindowStatusKeys);
  const terminalPaneCountByWindowId = parseRecordKeyMap(input.mountedWindowTerminalPaneCountKeys);
  const hiddenMountedWindowIds = input.mountedWindowIds.filter((windowId) => (
    isMountedWindowHidden(windowId, input.currentView, input.activeWindowId, input.activeGroupId)
  ));
  const hiddenRunningWindowIds = hiddenMountedWindowIds.filter((windowId) => (
    isRunningMountedStatus(statusByWindowId.get(windowId))
  ));
  const mountedTerminalPaneCount = input.mountedWindowIds.reduce((total, windowId) => (
    total + Number(terminalPaneCountByWindowId.get(windowId) ?? 0)
  ), 0);
  const hiddenMountedTerminalPaneCount = hiddenMountedWindowIds.reduce((total, windowId) => (
    total + Number(terminalPaneCountByWindowId.get(windowId) ?? 0)
  ), 0);

  return {
    currentView: input.currentView,
    activeWindowId: input.activeWindowId,
    activeGroupId: input.activeGroupId,
    mountedWindowIds: input.mountedWindowIds,
    hiddenMountedWindowIds,
    hiddenRunningWindowIds,
    mountedWindowCount: input.mountedWindowIds.length,
    hiddenMountedWindowCount: hiddenMountedWindowIds.length,
    hiddenRunningWindowCount: hiddenRunningWindowIds.length,
    mountedTerminalPaneCount,
    hiddenMountedTerminalPaneCount,
  };
}

export function logMountedTerminalObservation(snapshot: MountedTerminalObservationSnapshot): void {
  if (!shouldLogMountedObservation()) {
    return;
  }

  const observationKey = [
    snapshot.currentView,
    snapshot.activeWindowId ?? '',
    snapshot.activeGroupId ?? '',
    snapshot.mountedWindowIds.join(','),
    snapshot.hiddenRunningWindowIds.join(','),
    snapshot.mountedTerminalPaneCount,
    snapshot.hiddenMountedTerminalPaneCount,
  ].join('|');

  if (observationKey === lastLoggedMountedObservationKey) {
    return;
  }

  lastLoggedMountedObservationKey = observationKey;

  console.log(
    `[Perf] Mounted terminal surfaces=${snapshot.mountedWindowCount} hidden=${snapshot.hiddenMountedWindowCount} hiddenRunning=${snapshot.hiddenRunningWindowCount} mountedTerminalPanes=${snapshot.mountedTerminalPaneCount} hiddenTerminalPanes=${snapshot.hiddenMountedTerminalPaneCount}`,
  );
}

export function markTerminalSwitchStart(windowId: string): void {
  pendingTerminalSwitchStarts.set(windowId, performance.now());
}

export function markTerminalSwitchVisible(windowId: string): number | null {
  const startedAt = pendingTerminalSwitchStarts.get(windowId);
  if (startedAt === undefined) {
    return null;
  }

  pendingTerminalSwitchStarts.delete(windowId);
  const durationMs = performance.now() - startedAt;

  if (shouldLogMountedObservation()) {
    console.log(`[Perf] Terminal surface visible window=${windowId} duration=${durationMs.toFixed(1)}ms`);
  }

  return durationMs;
}

export function __resetPerfObservabilityForTests(): void {
  pendingTerminalSwitchStarts.clear();
  lastLoggedMountedObservationKey = null;
}
