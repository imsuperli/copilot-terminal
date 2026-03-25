import { describe, expect, it, vi } from 'vitest';
import { resolveNodePath } from '../node-path';

describe('resolveNodePath', () => {
  it('prefers node from the current PATH when available', () => {
    const result = resolveNodePath({
      currentPath: '/custom/bin:/usr/bin',
      platform: 'darwin',
      env: {},
      isExecutable: (filePath) => filePath === '/custom/bin/node',
      probeShell: vi.fn(),
    });

    expect(result).toBe('/custom/bin/node');
  });

  it('falls back to known macOS node locations before shell probing', () => {
    const probeShell = vi.fn();

    const result = resolveNodePath({
      currentPath: '/usr/bin:/bin',
      platform: 'darwin',
      homeDir: '/Users/tester',
      env: {},
      isExecutable: (filePath) => filePath === '/opt/homebrew/bin/node',
      probeShell,
    });

    expect(result).toBe('/opt/homebrew/bin/node');
    expect(probeShell).not.toHaveBeenCalled();
  });

  it('uses the preferred shell probe when node only exists in shell-managed paths', () => {
    const probeShell = vi.fn((shellPath: string) =>
      shellPath === '/bin/zsh' ? '/Users/tester/.nvm/versions/node/v22.0.0/bin/node' : null
    );

    const result = resolveNodePath({
      currentPath: '/usr/bin:/bin',
      platform: 'darwin',
      preferredShell: '/bin/zsh',
      homeDir: '/Users/tester',
      env: {},
      isExecutable: (filePath) => (
        filePath === '/bin/zsh'
        || filePath === '/Users/tester/.nvm/versions/node/v22.0.0/bin/node'
      ),
      probeShell,
    });

    expect(result).toBe('/Users/tester/.nvm/versions/node/v22.0.0/bin/node');
    expect(probeShell).toHaveBeenCalledWith('/bin/zsh', {});
  });

  it('tries fallback shells when SHELL is missing', () => {
    const probeShell = vi.fn((shellPath: string) =>
      shellPath === '/bin/bash' ? '/Users/tester/.nvm/versions/node/v22.0.0/bin/node' : null
    );

    const result = resolveNodePath({
      currentPath: '/usr/bin:/bin',
      platform: 'darwin',
      homeDir: '/Users/tester',
      env: {},
      isExecutable: (filePath) => (
        filePath === '/bin/zsh'
        || filePath === '/bin/bash'
        || filePath === '/Users/tester/.nvm/versions/node/v22.0.0/bin/node'
      ),
      probeShell,
    });

    expect(result).toBe('/Users/tester/.nvm/versions/node/v22.0.0/bin/node');
    expect(probeShell).toHaveBeenCalledWith('/bin/zsh', {});
    expect(probeShell).toHaveBeenCalledWith('/bin/bash', {});
  });

  it('falls back to plain node when no strategy resolves an executable', () => {
    const result = resolveNodePath({
      currentPath: '/usr/bin:/bin',
      platform: 'darwin',
      env: {},
      isExecutable: () => false,
      probeShell: vi.fn(() => null),
    });

    expect(result).toBe('node');
  });
});
