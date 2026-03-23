import { describe, expect, it } from 'vitest';
import { extractLatestOsc7RemoteCwd } from '../sshCwdTracking';

describe('extractLatestOsc7RemoteCwd', () => {
  it('parses OSC 7 file URI cwd markers', () => {
    expect(extractLatestOsc7RemoteCwd('\u001b]7;file://host/srv/app\u0007')).toBe('/srv/app');
  });

  it('parses terminal title cwd markers used by common ssh prompts', () => {
    expect(extractLatestOsc7RemoteCwd('\u001b]0;root@prod: /srv/app/current\u0007')).toBe('/srv/app/current');
    expect(extractLatestOsc7RemoteCwd('\u001b]2;root@prod: ~/releases\u0007')).toBe('~/releases');
  });

  it('parses OSC 633 cwd markers when shell integration is present', () => {
    expect(extractLatestOsc7RemoteCwd('\u001b]633;P;Cwd=/srv/app/releases\u0007')).toBe('/srv/app/releases');
  });
});
