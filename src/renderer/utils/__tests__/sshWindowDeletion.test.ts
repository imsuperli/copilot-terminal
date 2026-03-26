import { describe, expect, it } from 'vitest';
import { SSHAuthType } from '../../../shared/types/ssh';
import { Pane, Window, WindowStatus } from '../../types/window';
import { getSSHCredentialCleanupAvailability } from '../sshWindowDeletion';

function createPane(id: string, profileId?: string, authType: SSHAuthType = 'password'): Pane {
  return {
    id,
    cwd: profileId ? '~' : '/tmp',
    command: '',
    status: WindowStatus.Paused,
    pid: null,
    backend: profileId ? 'ssh' : 'local',
    ...(profileId ? {
      ssh: {
        profileId,
        host: 'host.example.com',
        port: 22,
        user: 'root',
        authType,
      },
    } : {}),
  };
}

function createWindow(id: string, pane: Pane): Window {
  return {
    id,
    name: `window-${id}`,
    layout: {
      type: 'pane',
      id: pane.id,
      pane,
    },
    activePaneId: pane.id,
    createdAt: '2026-03-26T00:00:00.000Z',
    lastActiveAt: '2026-03-26T00:00:00.000Z',
  };
}

describe('getSSHCredentialCleanupAvailability', () => {
  it('allows credential cleanup for a standalone SSH window with no sibling usage', () => {
    const targetWindow = createWindow('target', createPane('pane-target', 'profile-1'));
    const localWindow = createWindow('local', createPane('pane-local'));

    expect(getSSHCredentialCleanupAvailability(targetWindow, [targetWindow, localWindow])).toEqual({
      profileId: 'profile-1',
      eligible: true,
      canClearCredentials: true,
      blockingWindowCount: 0,
    });
  });

  it('blocks credential cleanup when another window still references the same profile', () => {
    const targetWindow = createWindow('target', createPane('pane-target', 'profile-1'));
    const siblingWindow = createWindow('sibling', createPane('pane-sibling', 'profile-1'));

    expect(getSSHCredentialCleanupAvailability(targetWindow, [targetWindow, siblingWindow])).toEqual({
      profileId: 'profile-1',
      eligible: true,
      canClearCredentials: false,
      blockingWindowCount: 1,
    });
  });

  it('does not offer credential cleanup for mixed or local windows', () => {
    const mixedWindow: Window = {
      id: 'mixed',
      name: 'mixed',
      layout: {
        type: 'split',
        direction: 'horizontal',
        sizes: [0.5, 0.5],
        children: [
          {
            type: 'pane',
            id: 'pane-ssh',
            pane: createPane('pane-ssh', 'profile-1'),
          },
          {
            type: 'pane',
            id: 'pane-local',
            pane: createPane('pane-local'),
          },
        ],
      },
      activePaneId: 'pane-ssh',
      createdAt: '2026-03-26T00:00:00.000Z',
      lastActiveAt: '2026-03-26T00:00:00.000Z',
    };

    expect(getSSHCredentialCleanupAvailability(mixedWindow, [mixedWindow])).toEqual({
      profileId: null,
      eligible: false,
      canClearCredentials: false,
      blockingWindowCount: 0,
    });
  });
});
