import { Window } from '../types/window';
import { getAllPanes } from './layoutHelpers';
import { getSSHSessionFamilyWindows, getStandaloneSSHProfileId, isEphemeralSSHCloneWindow } from './sshWindowBindings';

export interface SSHCredentialCleanupAvailability {
  profileId: string | null;
  eligible: boolean;
  canClearCredentials: boolean;
  blockingWindowCount: number;
}

export function windowReferencesSSHProfile(window: Window, profileId: string): boolean {
  return getAllPanes(window.layout).some((pane) => pane.ssh?.profileId === profileId);
}

export function getSSHProfileReferencingWindows(
  windows: Window[],
  profileId: string,
  options?: {
    excludeWindowIds?: Iterable<string>;
    includeArchived?: boolean;
    includeEphemeral?: boolean;
  },
): Window[] {
  const excludedWindowIds = options?.excludeWindowIds ? new Set(options.excludeWindowIds) : null;
  const includeArchived = options?.includeArchived ?? true;
  const includeEphemeral = options?.includeEphemeral ?? true;

  return windows.filter((window) => {
    if (!includeEphemeral && isEphemeralSSHCloneWindow(window)) {
      return false;
    }

    if (!includeArchived && window.archived) {
      return false;
    }

    if (excludedWindowIds?.has(window.id)) {
      return false;
    }

    return windowReferencesSSHProfile(window, profileId);
  });
}

export function getSSHCredentialCleanupAvailability(
  targetWindow: Window,
  windows: Window[],
): SSHCredentialCleanupAvailability {
  const profileId = getStandaloneSSHProfileId(targetWindow);
  if (!profileId) {
    return {
      profileId: null,
      eligible: false,
      canClearCredentials: false,
      blockingWindowCount: 0,
    };
  }

  const excludedWindowIds = targetWindow.ephemeral
    ? [targetWindow.id]
    : getSSHSessionFamilyWindows(windows, targetWindow.id, { includeArchived: true }).map((window) => window.id);
  const blockingWindowCount = getSSHProfileReferencingWindows(windows, profileId, {
    excludeWindowIds: excludedWindowIds,
    includeArchived: false,
    includeEphemeral: false,
  }).length;

  return {
    profileId,
    eligible: true,
    canClearCredentials: blockingWindowCount === 0,
    blockingWindowCount,
  };
}
