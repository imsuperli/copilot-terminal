import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock('os', () => ({
  platform: () => 'win32',
  default: {
    platform: () => 'win32',
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

describe('getLatestEnvironmentVariables', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    process.env = {
      BASE_ONLY: 'keep-me',
      JAVA_HOME: 'C:\\ProcessJava',
      SystemRoot: 'C:\\Windows',
      SystemDrive: 'C:',
      ProgramData: 'C:\\ProgramData',
      ALLUSERSPROFILE: 'C:\\ProgramData',
      PUBLIC: 'C:\\Users\\Public',
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      ProgramW6432: 'C:\\Program Files',
      CommonProgramFiles: 'C:\\Program Files\\Common Files',
      'CommonProgramFiles(x86)': 'C:\\Program Files (x86)\\Common Files',
      CommonProgramW6432: 'C:\\Program Files\\Common Files',
      COMPUTERNAME: 'DEVBOX',
      SESSIONNAME: 'Console',
      PATH: 'C:\\stale-path',
      Path: 'C:\\stale-path',
    };
  });

  it('builds a registry-first environment and backfills required Windows runtime variables', () => {
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
    expect(env.BASE_ONLY).toBeUndefined();
    expect(env.JAVA_HOME).toBe('C:\\Java');
    expect(env.MY_TOOLS).toBe('C:\\Java\\bin');
    expect(env.SystemRoot).toBe('C:\\Windows');
    expect(env.ProgramData).toBe('C:\\ProgramData');
    expect(env.PUBLIC).toBe('C:\\Users\\Public');
    expect(env.ProgramFiles).toBe('C:\\Program Files');
    expect(env.COMPUTERNAME).toBe('DEVBOX');
    expect(env.SESSIONNAME).toBe('Console');
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
