import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock('os', () => ({
  platform: () => 'darwin',
  default: {
    platform: () => 'darwin',
  },
}));

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
  default: {
    execFileSync: execFileSyncMock,
  },
}));

import { getLatestEnvironmentVariables } from '../environment';

const originalEnv = process.env;

describe('getLatestEnvironmentVariables on Unix', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    process.env = {
      BASE_ONLY: 'keep-me',
      PATH: '/usr/bin:/bin',
      SHELL: '/bin/zsh',
      PWD: '/tmp/project',
      SHLVL: '1',
    };
  });

  it('hydrates the spawn environment from the preferred login shell', () => {
    execFileSyncMock.mockImplementation((command: string, args: string[]) => {
      expect(command).toBe('/custom/zsh');
      expect(args).toEqual(['-i', '-l', '-c', 'env -0']);
      return Buffer.from([
        'PATH=/opt/homebrew/bin:/Users/test/.nvm/versions/node/v22.0.0/bin:/usr/bin:/bin',
        'NVM_BIN=/Users/test/.nvm/versions/node/v22.0.0/bin',
        'BASE_ONLY=from-shell',
        'PWD=/Users/test',
        'SHLVL=2',
        '',
      ].join('\0'));
    });

    const env = getLatestEnvironmentVariables({
      preferredShellProgram: '/custom/zsh',
    });

    expect(env.PATH).toBe('/opt/homebrew/bin:/Users/test/.nvm/versions/node/v22.0.0/bin:/usr/bin:/bin');
    expect(env.NVM_BIN).toBe('/Users/test/.nvm/versions/node/v22.0.0/bin');
    expect(env.BASE_ONLY).toBe('from-shell');
    expect(env.PWD).toBeUndefined();
    expect(env.SHLVL).toBeUndefined();
  });

  it('tries a less strict shell invocation when the interactive login probe fails', () => {
    execFileSyncMock
      .mockImplementationOnce(() => {
        throw new Error('interactive login shell failed');
      })
      .mockImplementationOnce(() => Buffer.from('PATH=/opt/homebrew/bin:/usr/bin:/bin\0'));

    const env = getLatestEnvironmentVariables({
      preferredShellProgram: '/bin/zsh',
    });

    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      '/bin/zsh',
      ['-i', '-l', '-c', 'env -0'],
      expect.objectContaining({ env: process.env, timeout: 5000 }),
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      '/bin/zsh',
      ['-l', '-c', 'env -0'],
      expect.objectContaining({ env: process.env, timeout: 5000 }),
    );
    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin:/bin');
  });

  it('falls back to process.env when shell probing cannot produce a usable environment', () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error('boom');
    });

    const env = getLatestEnvironmentVariables({
      preferredShellProgram: '/custom/zsh',
    });

    expect(env).toBe(process.env);
  });
});

afterAll(() => {
  process.env = originalEnv;
});
