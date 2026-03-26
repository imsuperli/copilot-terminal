import { Window } from '../types/window';
import { getAllPanes } from './layoutHelpers';
import { getStandaloneSSHProfileId } from './sshWindowBindings';

export interface SSHCredentialCleanupAvailability {
  profileId: string | null;
  eligible: boolean;
  canClearCredentials: boolean;
  blockingWindowCount: number;
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

  const blockingWindowCount = windows.filter((window) => (
    window.id !== targetWindow.id
      && getAllPanes(window.layout).some((pane) => pane.ssh?.profileId === profileId)
  )).length;

  return {
    profileId,
    eligible: true,
    canClearCredentials: blockingWindowCount === 0,
    blockingWindowCount,
  };
}
