import { Pane, Window } from '../types/window';
import { getAllPanes } from './layoutHelpers';

function getPaneSSHTargetKey(pane: Pane): string | null {
  const ssh = pane.ssh;
  if (pane.backend !== 'ssh' || !ssh?.profileId) {
    return null;
  }

  const jumpHostProfileId = ssh.jumpHostProfileId?.trim() ?? '';
  const proxyCommand = ssh.proxyCommand?.trim() ?? '';
  const scopeSuffix = `|jump:${jumpHostProfileId}|proxy:${proxyCommand}`;
  const host = ssh.host?.trim().toLowerCase();

  if (host) {
    const user = ssh.user?.trim() ?? '';
    const port = ssh.port ?? 22;

    return `target:${user}@${host}:${port}${scopeSuffix}`;
  }

  return `profile:${ssh.profileId}${scopeSuffix}`;
}

export function getStandaloneSSHProfileId(window: Window): string | null {
  const panes = getAllPanes(window.layout);
  if (panes.length === 0) {
    return null;
  }

  let profileId: string | null = null;

  for (const pane of panes) {
    const paneProfileId = pane.ssh?.profileId;
    if (pane.backend !== 'ssh' || !paneProfileId) {
      return null;
    }

    if (profileId && paneProfileId !== profileId) {
      return null;
    }

    profileId = paneProfileId;
  }

  return profileId;
}

export function getStandaloneSSHTargetKey(window: Window): string | null {
  const panes = getAllPanes(window.layout);
  if (panes.length === 0) {
    return null;
  }

  let targetKey: string | null = null;

  for (const pane of panes) {
    const paneTargetKey = getPaneSSHTargetKey(pane);
    if (!paneTargetKey) {
      return null;
    }

    if (targetKey && paneTargetKey !== targetKey) {
      return null;
    }

    targetKey = paneTargetKey;
  }

  return targetKey;
}

export function buildStandaloneSSHWindowMap(
  windows: Window[],
  profileIds?: Iterable<string>,
): Record<string, Window> {
  const allowedProfileIds = profileIds ? new Set(profileIds) : null;
  const nextMap: Record<string, Window> = {};

  for (const window of windows) {
    if (window.archived) {
      continue;
    }

    const profileId = getStandaloneSSHProfileId(window);
    if (!profileId) {
      continue;
    }

    if (allowedProfileIds && !allowedProfileIds.has(profileId)) {
      continue;
    }

    const existing = nextMap[profileId];
    if (!existing) {
      nextMap[profileId] = window;
      continue;
    }

    const existingTime = new Date(existing.lastActiveAt).getTime();
    const currentTime = new Date(window.lastActiveAt).getTime();
    if (currentTime >= existingTime) {
      nextMap[profileId] = window;
    }
  }

  return nextMap;
}
