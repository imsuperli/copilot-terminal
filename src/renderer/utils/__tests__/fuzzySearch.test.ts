import { describe, expect, it } from 'vitest';
import { fuzzyMatch, highlightMatches } from '../fuzzySearch';

describe('fuzzySearch', () => {
  it('matches query characters in order', () => {
    expect(fuzzyMatch('hnr', 'd-honor-copilot')).toBe(true);
    expect(fuzzyMatch('roh', 'd-honor-copilot')).toBe(false);
  });

  it('keeps adjacent matched characters in one highlighted segment', () => {
    expect(highlightMatches('d-honor-copilot', 'honor')).toEqual([
      { text: 'd-', highlight: false },
      { text: 'honor', highlight: true },
      { text: '-copilot', highlight: false },
    ]);
  });

  it('still separates non-adjacent fuzzy matches', () => {
    expect(highlightMatches('d-honor-copilot', 'hr')).toEqual([
      { text: 'd-', highlight: false },
      { text: 'h', highlight: true },
      { text: 'ono', highlight: false },
      { text: 'r', highlight: true },
      { text: '-copilot', highlight: false },
    ]);
  });
});
