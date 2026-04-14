import { describe, expect, it } from 'vitest';
import { formatThinkingElapsed } from '../ThinkingStatusBar';

describe('ThinkingStatusBar', () => {
  it('formats seconds without minutes at 60s or below', () => {
    expect(formatThinkingElapsed(0)).toBe('0s');
    expect(formatThinkingElapsed(9)).toBe('9s');
    expect(formatThinkingElapsed(60)).toBe('60s');
  });

  it('shows minutes only after exceeding 60 seconds', () => {
    expect(formatThinkingElapsed(61)).toBe('1m 1s');
    expect(formatThinkingElapsed(3599)).toBe('59m 59s');
    expect(formatThinkingElapsed(3600)).toBe('60m 0s');
  });

  it('shows hours only after exceeding 60 minutes', () => {
    expect(formatThinkingElapsed(3601)).toBe('1h 0m 1s');
    expect(formatThinkingElapsed(7265)).toBe('2h 1m 5s');
  });
});
