import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSyncMock = vi.fn();

vi.mock('os', () => ({
  platform: () => 'win32',
}));

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

import { getLatestEnvironmentVariables } from '../environment';

const originalEnv = process.env;

describe('getLatestEnvironmentVariables', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    process.env = {
      BASE_ONLY: 'keep-me',
      JAVA_HOME: 'C:\\ProcessJava',
      PATH: 'C:\\stale-path',
      Path: 'C:\\stale-path',
    };
  });

  it('merges registry environment with correct Unicode and expansion handling', () => {
    execFileSyncMock.mockReturnValue(JSON.stringify({
      system: {
        JAVA_HOME: { type: 'String', value: 'C:\\Java' },
        Path: { type: 'String', value: 'C:\\Windows\\System32;D:\\Program Files\\Tencent\\微信web开发者工具\\dll' },
      },
      user: {
        MY_TOOLS: { type: 'ExpandString', value: '%JAVA_HOME%\\bin' },
        Path: { type: 'String', value: 'C:\\Users\\licheng2\\bin' },
      },
    }));

    const env = getLatestEnvironmentVariables();

    expect(execFileSyncMock).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']),
      expect.objectContaining({ encoding: 'utf8' }),
    );
    expect(env.BASE_ONLY).toBe('keep-me');
    expect(env.JAVA_HOME).toBe('C:\\Java');
    expect(env.MY_TOOLS).toBe('C:\\Java\\bin');
    expect(env.PATH).toBe('C:\\Windows\\System32;D:\\Program Files\\Tencent\\微信web开发者工具\\dll;C:\\Users\\licheng2\\bin');
    expect(env.Path).toBe(env.PATH);
  });

  it('falls back to process.env when registry reading fails', () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error('boom');
    });

    const env = getLatestEnvironmentVariables();

    expect(env).toBe(process.env);
  });
});

afterAll(() => {
  process.env = originalEnv;
});
