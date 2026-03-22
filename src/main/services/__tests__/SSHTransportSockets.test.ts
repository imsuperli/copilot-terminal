import net from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSocksConnectRequest,
  createHttpProxySocket,
  createProxyCommandSocket,
  replaceOpenSSHProxyTokens,
} from '../ssh/SSHTransportSockets';

const servers = new Set<net.Server>();

afterEach(async () => {
  await Promise.all(Array.from(servers).map((server) => closeServer(server)));
  servers.clear();
});

describe('SSHTransportSockets', () => {
  it('replaces OpenSSH proxy command tokens', () => {
    expect(replaceOpenSSHProxyTokens('nc %h %p && echo %r %% %n', {
      host: 'db.internal',
      port: 2222,
      user: 'root',
    })).toBe('nc db.internal 2222 && echo root % db.internal');
  });

  it('creates proxy command sockets through a shell command', async () => {
    const socket = await createProxyCommandSocket('node -e "process.stdin.pipe(process.stdout)"', {
      host: 'ignored',
      port: 22,
      user: 'root',
    });

    const echoed = await waitForSingleChunk(socket, () => {
      socket.write('ping');
    });

    expect(echoed.toString('utf8')).toBe('ping');
    socket.end();
  });

  it('builds SOCKS5 CONNECT requests for domain targets', () => {
    const request = buildSocksConnectRequest({
      host: 'target.internal',
      port: 22,
    });

    expect(request[0]).toBe(0x05);
    expect(request[1]).toBe(0x01);
    expect(request[2]).toBe(0x00);
    expect(request[3]).toBe(0x03);
    expect(request[4]).toBe('target.internal'.length);
    expect(request.subarray(5, 5 + 'target.internal'.length).toString('utf8')).toBe('target.internal');
    expect(request.readUInt16BE(request.length - 2)).toBe(22);
  });

  it('negotiates HTTP CONNECT proxy connections', async () => {
    const server = net.createServer((socket) => {
      let buffered = '';
      socket.on('data', (chunk) => {
        buffered += chunk.toString('utf8');
        if (!buffered.includes('\r\n\r\n')) {
          return;
        }

        expect(buffered).toContain('CONNECT app.internal:2222 HTTP/1.1');
        expect(buffered).toContain('Host: app.internal:2222');
        socket.removeAllListeners('data');
        socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
        socket.on('data', (payload) => {
          socket.write(payload);
        });
      });
    });
    const port = await listenServer(server);

    const socket = await createHttpProxySocket({ host: '127.0.0.1', port }, {
      host: 'app.internal',
      port: 2222,
    });

    const echoed = await waitForSingleChunk(socket, () => {
      socket.write('http-data');
    });

    expect(echoed.toString('utf8')).toBe('http-data');
    socket.destroy();
  });
});

async function listenServer(server: net.Server): Promise<number> {
  servers.add(server);

  return new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve test server address'));
        return;
      }

      resolve(address.port);
    });
    server.once('error', reject);
  });
}

async function closeServer(server: net.Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function waitForSingleChunk(socket: NodeJS.ReadWriteStream, write: () => void): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const handleData = (chunk: Buffer | string) => {
      cleanup();
      resolve(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off('data', handleData);
      socket.off('error', handleError);
    };

    socket.on('data', handleData);
    socket.on('error', handleError);
    write();
  });
}
