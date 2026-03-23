import { describe, expect, it } from 'vitest';
import {
  applyTerminalInputToSSHCwdTracker,
  createSSHCwdTrackerState,
  extractLatestOsc7RemoteCwd,
  updateSSHCwdTrackerFromRuntimeCwd,
} from '../sshCwdTracking';

describe('sshCwdTracking', () => {
  it('extracts the latest OSC 7 remote cwd from terminal output', () => {
    const data = [
      'prompt',
      '\u001b]7;file://server/srv/app\u0007',
      'next',
      '\u001b]7;file://server/srv/app/releases\u001b\\',
    ].join('');

    expect(extractLatestOsc7RemoteCwd(data)).toBe('/srv/app/releases');
  });

  it('resolves relative cd commands against the tracked remote cwd', () => {
    const state = createSSHCwdTrackerState('/srv/app');
    const { nextState, resolvedCwd } = applyTerminalInputToSSHCwdTracker(state, 'cd releases\r');

    expect(resolvedCwd).toBe('/srv/app/releases');
    expect(nextState.cwd).toBe('/srv/app/releases');
  });

  it('derives the real home directory from runtime cwd updates and expands ~/ paths', () => {
    const state = createSSHCwdTrackerState('~');
    const syncedState = updateSSHCwdTrackerFromRuntimeCwd(state, '/home/root');
    const { resolvedCwd } = applyTerminalInputToSSHCwdTracker(syncedState, 'cd ~/workspace\r');

    expect(resolvedCwd).toBe('/home/root/workspace');
  });

  it('keeps tilde-based cwd tracking when the home path is still unknown', () => {
    const state = createSSHCwdTrackerState('~');
    const { resolvedCwd } = applyTerminalInputToSSHCwdTracker(state, 'cd projects\r');

    expect(resolvedCwd).toBe('~/projects');
  });
});

