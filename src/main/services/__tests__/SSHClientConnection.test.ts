import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SSHSessionConfig } from '../../types/process';
import { SSHClientConnection } from '../ssh/SSHClientConnection';

function createSSHConfig(overrides: Partial<SSHSessionConfig> = {}): SSHSessionConfig {
  return {
    profileId: 'profile-1',
    host: '10.0.0.21',
    port: 22,
    user: 'root',
    authType: 'password',
    privateKeys: [],
    password: 'secret',
    keepaliveInterval: 30,
    keepaliveCountMax: 3,
    readyTimeout: null,
    verifyHostKeys: true,
    agentForward: false,
    reuseSession: true,
    forwardedPorts: [],
    ...overrides,
  };
}

describe('SSHClientConnection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens shells with terminal environment hints for remote prompt compatibility', async () => {
    vi.stubEnv('LANG', 'zh_CN.UTF-8');

    const stream = { id: 'shell-stream' };
    const shell = vi.fn((
      _window: unknown,
      _options: { env?: Record<string, string> },
      callback: (error?: Error, stream?: unknown) => void,
    ) => {
      callback(undefined, stream as any);
      return {};
    });
    const connection = new SSHClientConnection(createSSHConfig());

    (connection as any).ready = true;
    (connection as any).client = { shell };

    await expect(connection.openShell({
      cols: 140,
      rows: 40,
      x11: true,
    })).resolves.toBe(stream);

    expect(shell).toHaveBeenCalledWith(
      expect.objectContaining({
        term: 'xterm-256color',
        cols: 140,
        rows: 40,
      }),
      expect.objectContaining({
        env: expect.objectContaining({
          COLORTERM: 'truecolor',
          TERM_PROGRAM: 'Copilot-Terminal',
          LANG: 'zh_CN.UTF-8',
          LC_CTYPE: expect.any(String),
        }),
        x11: expect.objectContaining({
          protocol: 'MIT-MAGIC-COOKIE-1',
        }),
      }),
      expect.any(Function),
    );
  });
});
