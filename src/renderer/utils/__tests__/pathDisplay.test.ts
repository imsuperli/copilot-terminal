import { describe, expect, it } from 'vitest';
import { getPathLeafLabel } from '../pathDisplay';

describe('getPathLeafLabel', () => {
  it('returns the last folder name for nested posix paths', () => {
    expect(getPathLeafLabel('/srv/app/releases')).toBe('releases');
    expect(getPathLeafLabel('/srv/app/releases/')).toBe('releases');
  });

  it('preserves root-like labels', () => {
    expect(getPathLeafLabel('/')).toBe('/');
    expect(getPathLeafLabel('~')).toBe('~');
  });

  it('supports tilde and windows-style paths', () => {
    expect(getPathLeafLabel('~/workspace/current')).toBe('current');
    expect(getPathLeafLabel('C:\\Users\\me\\repo')).toBe('repo');
  });
});
