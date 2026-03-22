import { EventEmitter } from 'events';
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

describe('SSHPtySession', () => {
  it('requests X11 forwarding when the SSH session config enables it', async () => {
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
    expect(channel.write).toHaveBeenCalledWith("cd '/srv/app'\r");

    session.kill();
    expect(release).toHaveBeenCalled();
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
});
