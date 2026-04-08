import { describe, expect, it } from 'vitest';
import {
  applyTerminalInputToSSHCwdTracker,
  createSSHCwdTrackerState,
  extractLatestOsc7RemoteCwd,
} from '../sshCwdTracking';

describe('extractLatestOsc7RemoteCwd', () => {
  it('parses OSC 7 file URI cwd markers', () => {
    expect(extractLatestOsc7RemoteCwd('\u001b]7;file://host/srv/app\u0007')).toBe('/srv/app');
  });

  it('parses terminal title cwd markers used by common ssh prompts', () => {
    expect(extractLatestOsc7RemoteCwd('\u001b]0;root@prod: /srv/app/current\u0007')).toBe('/srv/app/current');
    expect(extractLatestOsc7RemoteCwd('\u001b]2;root@prod: ~/releases\u0007')).toBeNull();
  });

  it('ignores home-relative terminal title paths because they are display strings, not authoritative cwd markers', () => {
    expect(extractLatestOsc7RemoteCwd('\u001b]0;u0_a123@phone: ~/de/de/win/de/co/de/co\u0007')).toBeNull();
  });

  it('parses OSC 633 cwd markers when shell integration is present', () => {
    expect(extractLatestOsc7RemoteCwd('\u001b]633;P;Cwd=/srv/app/releases\u0007')).toBe('/srv/app/releases');
  });

  it('returns null immediately for plain output with no OSC markers', () => {
    expect(extractLatestOsc7RemoteCwd('plain stdout without cwd markers')).toBeNull();
  });
});

describe('applyTerminalInputToSSHCwdTracker', () => {
  it('appends simple printable input without changing cwd resolution behavior', () => {
    const state = createSSHCwdTrackerState('/srv/app');

    const result = applyTerminalInputToSSHCwdTracker(state, 'cd releases');

    expect(result.resolvedCwd).toBeNull();
    expect(result.nextState.commandBuffer).toBe('cd releases');
    expect(result.nextState.cwd).toBe('/srv/app');
  });
});
