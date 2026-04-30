import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { PathValidator } from '../pathValidator';

describe('PathValidator', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates an existing directory when the input uses a tilde home path', () => {
    const tempDir = mkdtempSync(path.join(homedir(), 'synapse-path-validator-'));
    tempDirs.push(tempDir);

    const tildePath = tempDir.replace(homedir(), '~');
    const result = PathValidator.validate(tildePath);

    expect(result).toEqual({ valid: true });
    expect(PathValidator.getSafePath(tildePath)).toBe(tempDir);
  });

  it('returns a creatable absolute path when the input uses a tilde home path', () => {
    const baseDir = mkdtempSync(path.join(homedir(), 'synapse-creatable-'));
    tempDirs.push(baseDir);

    const nestedPath = path.join(baseDir, 'nested', 'workspace');
    const tildePath = nestedPath.replace(homedir(), '~');
    const result = PathValidator.validateCreatable(tildePath);

    expect(result).toEqual({ valid: true });
    expect(PathValidator.getCreatablePath(tildePath)).toBe(nestedPath);
  });
});
