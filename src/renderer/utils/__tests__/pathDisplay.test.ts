import { describe, expect, it } from 'vitest';
import { getDecodedPathLeafLabel, getPathLeafLabel } from '../pathDisplay';

describe('pathDisplay', () => {
  it('returns the plain path leaf label', () => {
    expect(getPathLeafLabel('/workspace/project/src/index.ts')).toBe('index.ts');
  });

  it('decodes encoded virtual document leaf labels', () => {
    expect(getDecodedPathLeafLabel('External Libraries/slf4j-api/%3Corg.slf4j%28Logger.java')).toBe('<org.slf4j(Logger.java');
  });

  it('decodes jar entry leaf labels', () => {
    expect(getDecodedPathLeafLabel('jar:file:///tmp/demo.jar!/org/example/App.class')).toBe('App.class');
  });
});
