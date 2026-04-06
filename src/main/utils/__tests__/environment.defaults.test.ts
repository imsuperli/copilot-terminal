import { describe, expect, it } from 'vitest';
import { applyTerminalEnvironmentDefaults } from '../environment';

describe('applyTerminalEnvironmentDefaults', () => {
  it('adds git-friendly pager defaults when less is the active pager', () => {
    const env = applyTerminalEnvironmentDefaults({
      PAGER: 'less',
      LESS: '-R',
    });

    expect(env.GIT_PAGER).toBe('less -FRX');
    expect(env.LESS).toBe('-RFX');
  });

  it('keeps explicit git pager settings intact', () => {
    const env = applyTerminalEnvironmentDefaults({
      GIT_PAGER: 'cat',
      PAGER: 'less',
      LESS: '-R',
    });

    expect(env.GIT_PAGER).toBe('cat');
    expect(env.LESS).toBe('-R');
  });
});
