import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const { ensureExecutableBits } = require('../../../scripts/after-pack.js') as {
  ensureExecutableBits: (resourcesDir: string, platform: string) => void;
};

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-after-pack-'));
  tempDirs.push(dir);
  return dir;
}

function writeFileWithMode(filePath: string, mode: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'test');
  fs.chmodSync(filePath, mode);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('after-pack executable permissions', () => {
  it('marks shim binaries and node-pty spawn-helper as executable on macOS', () => {
    const tempDir = createTempDir();
    const resourcesDir = path.join(tempDir, 'Synapse.app', 'Contents', 'Resources');
    const tmuxPath = path.join(resourcesDir, 'app.asar.unpacked', 'resources', 'bin', 'tmux');
    const helperPath = path.join(
      resourcesDir,
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
      'prebuilds',
      'darwin-arm64',
      'spawn-helper',
    );

    writeFileWithMode(tmuxPath, 0o600);
    writeFileWithMode(helperPath, 0o600);

    ensureExecutableBits(resourcesDir, 'darwin');

    expect(fs.statSync(tmuxPath).mode & 0o777).toBe(0o755);
    expect(fs.statSync(helperPath).mode & 0o777).toBe(0o755);
  });

  it('does not chmod js or cmd shim files', () => {
    const tempDir = createTempDir();
    const resourcesDir = path.join(tempDir, 'resources');
    const jsShimPath = path.join(resourcesDir, 'app.asar.unpacked', 'resources', 'bin', 'tmux-shim.js');
    const cmdShimPath = path.join(resourcesDir, 'app.asar.unpacked', 'resources', 'bin', 'tmux.cmd');

    writeFileWithMode(jsShimPath, 0o600);
    writeFileWithMode(cmdShimPath, 0o600);

    ensureExecutableBits(resourcesDir, 'linux');

    expect(fs.statSync(jsShimPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(cmdShimPath).mode & 0o777).toBe(0o600);
  });
});
