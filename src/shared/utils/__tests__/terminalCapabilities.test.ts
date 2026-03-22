import { describe, expect, it } from 'vitest';
import { type Pane, type Window, WindowStatus } from '../../types/window';
import {
  canPaneOpenInIDE,
  canPaneOpenLocalFolder,
  canPaneWatchGitBranch,
  getPaneBackend,
  getPaneCapabilities,
  getWindowKind,
} from '../terminalCapabilities';

function createPane(overrides: Partial<Pane> = {}): Pane {
  return {
    id: 'pane-1',
    cwd: '/workspace',
    command: 'zsh',
    status: WindowStatus.Paused,
    pid: null,
    ...overrides,
  };
}

function createWindow(panes: Pane[]): Window {
  const children = panes.map((pane) => ({
    type: 'pane' as const,
    id: pane.id,
    pane,
  }));

  return {
    id: 'window-1',
    name: 'Test Window',
    layout: children.length === 1
      ? children[0]
      : {
          type: 'split' as const,
          direction: 'horizontal' as const,
          sizes: panes.map(() => 1 / panes.length),
          children,
        },
    activePaneId: panes[0]?.id ?? '',
    createdAt: '2026-03-22T00:00:00.000Z',
    lastActiveAt: '2026-03-22T00:00:00.000Z',
  };
}

describe('terminalCapabilities', () => {
  it('defaults panes without explicit backend to local', () => {
    const pane = createPane();

    expect(getPaneBackend(pane)).toBe('local');
    expect(canPaneOpenLocalFolder(pane)).toBe(true);
    expect(canPaneOpenInIDE(pane)).toBe(true);
    expect(canPaneWatchGitBranch(pane)).toBe(true);
  });

  it('returns SSH capabilities for ssh panes', () => {
    const pane = createPane({
      backend: 'ssh',
    });

    expect(getPaneBackend(pane)).toBe('ssh');
    expect(getPaneCapabilities(pane)).toMatchObject({
      canOpenLocalFolder: false,
      canOpenInIDE: false,
      canWatchGitBranch: false,
      canReconnect: true,
      canOpenSFTP: true,
      canManagePortForwards: true,
      canCloneSession: true,
    });
  });

  it('prefers explicit pane capabilities over backend defaults', () => {
    const pane = createPane({
      backend: 'ssh',
      capabilities: {
        canOpenLocalFolder: true,
        canOpenInIDE: false,
        canWatchGitBranch: false,
        canReconnect: true,
        canOpenSFTP: false,
        canManagePortForwards: false,
        canCloneSession: true,
      },
    });

    expect(canPaneOpenLocalFolder(pane)).toBe(true);
  });

  it('infers window kind from pane backends', () => {
    const localWindow = createWindow([createPane()]);
    const sshWindow = createWindow([createPane({ id: 'ssh-pane', backend: 'ssh' })]);
    const mixedWindow = createWindow([
      createPane({ id: 'pane-local' }),
      createPane({ id: 'pane-ssh', backend: 'ssh' }),
    ]);

    expect(getWindowKind(localWindow)).toBe('local');
    expect(getWindowKind(sshWindow)).toBe('ssh');
    expect(getWindowKind(mixedWindow)).toBe('mixed');
  });
});
