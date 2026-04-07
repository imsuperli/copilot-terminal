import { describe, expect, it } from 'vitest';
import { applyTerminalEnvironmentDefaults } from '../environment';

describe('applyTerminalEnvironmentDefaults', () => {
  it('normalizes LESS flags when less is already the active pager', () => {
    const env = applyTerminalEnvironmentDefaults({
      PAGER: 'less',
      LESS: '-R',
    });

    expect(env.GIT_PAGER).toBeUndefined();
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

  it('does not inject a default git pager when none is configured', () => {
    const env = applyTerminalEnvironmentDefaults({});

    expect(env.GIT_PAGER).toBeUndefined();
    expect(env.LESS).toBeUndefined();
  });
});
