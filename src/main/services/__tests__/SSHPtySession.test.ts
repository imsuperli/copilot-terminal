import { EventEmitter } from 'events';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { SSHPtySession } from '../ssh/SSHPtySession';

function createMockChannel() {
  const channel = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    write: ReturnType<typeof vi.fn>;
    setWindow: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    signal: ReturnType<typeof vi.fn>;
  };

  channel.stderr = new EventEmitter();
  channel.write = vi.fn();
  channel.setWindow = vi.fn();
  channel.end = vi.fn();
  channel.signal = vi.fn();

  return channel;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitUntil(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out while waiting for assertion');
}

describe('SSHPtySession', () => {
  it('requests X11 forwarding when the SSH session config enables it', async () => {
    vi.useFakeTimers();
    const channel = createMockChannel();
    const openShell = vi.fn().mockResolvedValue(channel);
    const release = vi.fn().mockResolvedValue(undefined);

    const session = await SSHPtySession.create({
      pid: 2201,
      ssh: {
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
        x11: true,
        remoteCwd: '/srv/app',
      },
      connectionPool: {
        acquire: vi.fn().mockResolvedValue({
          connection: {
            openShell,
            listPortForwards: vi.fn().mockReturnValue([]),
            addPortForward: vi.fn(),
            removePortForward: vi.fn(),
            listSftpDirectory: vi.fn(),
            downloadSftpFile: vi.fn(),
            uploadSftpFiles: vi.fn(),
          },
          release,
        }),
      } as any,
    });

    expect(openShell).toHaveBeenCalledWith(expect.objectContaining({
      x11: true,
      cols: 120,
      rows: 30,
    }));
    channel.emit('data', 'Last login\r\n');
    await vi.advanceTimersByTimeAsync(40);
    expect(channel.write).toHaveBeenCalledWith(
      "cd -- '/srv/app'\r",
    );

    session.kill();
    expect(release).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('preserves tilde expansion when initializing the remote cwd', async () => {
    vi.useFakeTimers();
    const channel = createMockChannel();
    const openShell = vi.fn().mockResolvedValue(channel);

    await SSHPtySession.create({
      pid: 2203,
      ssh: {
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
        remoteCwd: '~/workspace with spaces',
      },
      connectionPool: {
        acquire: vi.fn().mockResolvedValue({
          connection: {
            openShell,
            listPortForwards: vi.fn().mockReturnValue([]),
            addPortForward: vi.fn(),
            removePortForward: vi.fn(),
            listSftpDirectory: vi.fn(),
            downloadSftpFile: vi.fn(),
            uploadSftpFiles: vi.fn(),
          },
          release: vi.fn().mockResolvedValue(undefined),
        }),
      } as any,
    });

    channel.emit('data', 'Welcome\r\n');
    await vi.advanceTimersByTimeAsync(40);

    expect(channel.write).toHaveBeenCalledWith(
      "cd -- ~/\"workspace with spaces\"\r",
    );
    vi.useRealTimers();
  });

  it('skips an explicit cd when the configured remote cwd resolves to the SSH home directory', async () => {
    vi.useFakeTimers();
    const channel = createMockChannel();
    const openShell = vi.fn().mockResolvedValue(channel);

    await SSHPtySession.create({
      pid: 2204,
      ssh: {
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
        remoteCwd: "'~'",
      },
      connectionPool: {
        acquire: vi.fn().mockResolvedValue({
          connection: {
            openShell,
            listPortForwards: vi.fn().mockReturnValue([]),
            addPortForward: vi.fn(),
            removePortForward: vi.fn(),
            listSftpDirectory: vi.fn(),
            downloadSftpFile: vi.fn(),
            uploadSftpFiles: vi.fn(),
          },
          release: vi.fn().mockResolvedValue(undefined),
        }),
      } as any,
    });

    channel.emit('data', 'Welcome\r\n');
    await vi.advanceTimersByTimeAsync(40);

    expect(channel.write).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('always applies configured remote cwd directly when initializing the shell', async () => {
    vi.useFakeTimers();
    const channel = createMockChannel();
    const openShell = vi.fn().mockResolvedValue(channel);

    await SSHPtySession.create({
      pid: 2207,
      ssh: {
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
        remoteCwd: '~/de/de/win/de/co/de/co',
      },
      connectionPool: {
        acquire: vi.fn().mockResolvedValue({
          connection: {
            openShell,
            listPortForwards: vi.fn().mockReturnValue([]),
            addPortForward: vi.fn(),
            removePortForward: vi.fn(),
            listSftpDirectory: vi.fn(),
            downloadSftpFile: vi.fn(),
            uploadSftpFiles: vi.fn(),
          },
          release: vi.fn().mockResolvedValue(undefined),
        }),
      } as any,
    });

    channel.emit('data', 'Welcome\r\n');
    await vi.advanceTimersByTimeAsync(40);

    expect(channel.write).toHaveBeenCalledWith(
      "cd -- ~/\"de/de/win/de/co/de/co\"\r",
    );
    vi.useRealTimers();
  });

  it('decodes split utf8 chunks without garbling the terminal output', async () => {
    const channel = createMockChannel();
    const openShell = vi.fn().mockResolvedValue(channel);

    const session = await SSHPtySession.create({
      pid: 2202,
      ssh: {
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
      },
      connectionPool: {
        acquire: vi.fn().mockResolvedValue({
          connection: {
            openShell,
            listPortForwards: vi.fn().mockReturnValue([]),
            addPortForward: vi.fn(),
            removePortForward: vi.fn(),
            listSftpDirectory: vi.fn(),
            downloadSftpFile: vi.fn(),
            uploadSftpFiles: vi.fn(),
          },
          release: vi.fn().mockResolvedValue(undefined),
        }),
      } as any,
    });

    const chunks: string[] = [];
    session.onData((data) => {
      chunks.push(data);
    });

    channel.emit('data', Buffer.from([0xe4, 0xbd]));
    channel.emit('data', Buffer.from([0xa0]));

    expect(chunks).toEqual(['你']);
  });

  it('waits for the shell channel to close before reporting exit', async () => {
    const channel = createMockChannel();
    const openShell = vi.fn().mockResolvedValue(channel);

    const session = await SSHPtySession.create({
      pid: 2205,
      ssh: {
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
      },
      connectionPool: {
        acquire: vi.fn().mockResolvedValue({
          connection: {
            openShell,
            listPortForwards: vi.fn().mockReturnValue([]),
            addPortForward: vi.fn(),
            removePortForward: vi.fn(),
            listSftpDirectory: vi.fn(),
            downloadSftpFile: vi.fn(),
            uploadSftpFiles: vi.fn(),
          },
          release: vi.fn().mockResolvedValue(undefined),
        }),
      } as any,
    });

    const onExit = vi.fn();
    session.onExit(onExit);

    channel.emit('exit', 7);
    await flushPromises();
    expect(onExit).not.toHaveBeenCalled();

    channel.emit('close');
    await waitUntil(() => {
      expect(onExit).toHaveBeenCalledOnce();
    });
    expect(onExit).toHaveBeenCalledWith({ exitCode: 7, signal: undefined });
  });

  it('reopens the shell when it closes right after a successful zmodem receive', async () => {
    const firstChannel = createMockChannel();
    const recoveredChannel = createMockChannel();
    const openShell = vi.fn()
      .mockResolvedValueOnce(firstChannel)
      .mockResolvedValueOnce(recoveredChannel);
    const release = vi.fn().mockResolvedValue(undefined);
    const tempDir = mkdtempSync(path.join(tmpdir(), 'synapse-ssh-zmodem-'));
    const filePath = path.join(tempDir, 'download.bin');
    let offerHandler: ((offer: unknown) => void) | null = null;
    let detectionCount = 0;
    const accept = vi.fn().mockResolvedValue([Uint8Array.from([0x61])]);

    const session = await SSHPtySession.create({
      pid: 2206,
      ssh: {
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
      },
      zmodemDialogs: {
        selectSendFiles: vi.fn(),
        chooseSavePath: vi.fn().mockResolvedValue(filePath),
      },
      createZmodemSentry: (options) => ({
        consume: (input) => {
          if (detectionCount === 0) {
            detectionCount += 1;
            options.on_detect({
              confirm: () => ({
                type: 'receive' as const,
                on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
                  if (eventName === 'offer') {
                    offerHandler = handler as (offer: unknown) => void;
                  }
                }),
                start: vi.fn(() => {
                  offerHandler?.({
                    get_details: () => ({ name: 'download.bin' }),
                    accept,
                    skip: vi.fn(),
                  });
                }),
                abort: vi.fn(),
              }),
              deny: vi.fn(),
              is_valid: () => true,
            });
            return;
          }

          options.to_terminal(input);
        },
      }),
      connectionPool: {
        acquire: vi.fn().mockResolvedValue({
          connection: {
            openShell,
            listPortForwards: vi.fn().mockReturnValue([]),
            addPortForward: vi.fn(),
            removePortForward: vi.fn(),
            listSftpDirectory: vi.fn(),
            downloadSftpFile: vi.fn(),
            uploadSftpFiles: vi.fn(),
          },
          release,
        }),
      } as any,
    });

    const onExit = vi.fn();
    session.onExit(onExit);

    firstChannel.emit('data', Buffer.from('zmodem-start'));
    await waitUntil(() => {
      expect(accept).toHaveBeenCalledOnce();
    });

    firstChannel.emit('exit', 0);
    firstChannel.emit('close');
    await waitUntil(() => {
      expect(openShell).toHaveBeenCalledTimes(2);
    });
    await flushPromises();
    expect(onExit).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();

    session.write('pwd\r');
    expect(recoveredChannel.write).toHaveBeenCalledWith('pwd\r');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('retries with a dedicated SSH connection when a reused connection hits a channel-open limit', async () => {
    const retriedChannel = createMockChannel();
    const sharedRelease = vi.fn().mockResolvedValue(undefined);
    const dedicatedRelease = vi.fn().mockResolvedValue(undefined);
    const sharedConnection = {
      openShell: vi.fn().mockRejectedValue(new Error('(SSH) Channel open failure: open failed')),
      listPortForwards: vi.fn().mockReturnValue([]),
      addPortForward: vi.fn(),
      removePortForward: vi.fn(),
      listSftpDirectory: vi.fn(),
      downloadSftpFile: vi.fn(),
      uploadSftpFiles: vi.fn(),
    };
    const dedicatedConnection = {
      openShell: vi.fn().mockResolvedValue(retriedChannel),
      listPortForwards: vi.fn().mockReturnValue([]),
      addPortForward: vi.fn(),
      removePortForward: vi.fn(),
      listSftpDirectory: vi.fn(),
      downloadSftpFile: vi.fn(),
      uploadSftpFiles: vi.fn(),
    };
    const acquire = vi.fn()
      .mockResolvedValueOnce({
        connection: sharedConnection,
        release: sharedRelease,
      })
      .mockResolvedValueOnce({
        connection: dedicatedConnection,
        release: dedicatedRelease,
      });

    const session = await SSHPtySession.create({
      pid: 2208,
      ssh: {
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
      },
      connectionPool: {
        acquire,
      } as any,
    });

    expect(acquire).toHaveBeenNthCalledWith(1, expect.objectContaining({
      reuseSession: true,
    }), expect.any(Function));
    expect(acquire).toHaveBeenNthCalledWith(2, expect.objectContaining({
      reuseSession: false,
    }), expect.any(Function));
    expect(sharedRelease).toHaveBeenCalledOnce();
    expect(dedicatedConnection.openShell).toHaveBeenCalledOnce();

    session.kill();
    expect(dedicatedRelease).toHaveBeenCalledOnce();
  });
});
