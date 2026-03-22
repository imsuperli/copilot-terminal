import net from 'net';
import { spawn } from 'child_process';
import { Duplex } from 'stream';

export interface ProxyTarget {
  host: string;
  port: number;
  user?: string;
}

export interface ProxyEndpoint {
  host: string;
  port: number;
}

export function replaceOpenSSHProxyTokens(command: string, target: ProxyTarget): string {
  return command.replace(/%[%hprn]/g, (token) => {
    switch (token) {
      case '%%':
        return '%';
      case '%h':
      case '%n':
        return target.host;
      case '%p':
        return String(target.port);
      case '%r':
        return target.user ?? '';
      default:
        return token;
    }
  });
}

export async function createProxyCommandSocket(command: string, target: ProxyTarget): Promise<Duplex> {
  const resolvedCommand = replaceOpenSSHProxyTokens(command, target);
  const shell = process.platform === 'win32'
    ? process.env.ComSpec || 'cmd.exe'
    : process.env.SHELL || '/bin/sh';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', resolvedCommand]
    : ['-lc', resolvedCommand];
  const child = spawn(shell, args, {
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
  });

  const stdin = child.stdin;
  const stdout = child.stdout;
  if (!stdin || !stdout) {
    throw new Error(`SSH ProxyCommand did not expose stdio pipes: ${resolvedCommand}`);
  }

  const socket = Duplex.from({
    writable: stdin,
    readable: stdout,
  });

  child.on('error', (error) => {
    socket.destroy(error);
  });

  child.on('exit', (code, signal) => {
    if (socket.destroyed) {
      return;
    }

    if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') {
      socket.end();
      return;
    }

    socket.destroy(new Error(`SSH ProxyCommand exited unexpectedly: ${resolvedCommand} (${code ?? signal ?? 'unknown'})`));
  });

  socket.on('close', () => {
    if (!child.killed) {
      child.kill();
    }
  });

  return socket;
}

export async function createSocksProxySocket(proxy: ProxyEndpoint, target: ProxyTarget): Promise<net.Socket> {
  const socket = await connectTcpSocket(proxy.host, proxy.port);

  socket.write(Buffer.from([0x05, 0x01, 0x00]));

  const authResponse = await readSocketBytes(socket, 2);
  if (authResponse[0] !== 0x05 || authResponse[1] !== 0x00) {
    socket.destroy();
    throw new Error(`SSH SOCKS proxy does not allow unauthenticated connections: ${proxy.host}:${proxy.port}`);
  }

  socket.write(buildSocksConnectRequest(target));

  const replyHeader = await readSocketBytes(socket, 4);
  if (replyHeader[0] !== 0x05 || replyHeader[1] !== 0x00) {
    socket.destroy();
    throw new Error(`SSH SOCKS proxy failed to connect to ${target.host}:${target.port} (reply ${replyHeader[1] ?? -1})`);
  }

  const atyp = replyHeader[3];
  let remainingLength = 0;
  if (atyp === 0x01) {
    remainingLength = 4 + 2;
  } else if (atyp === 0x04) {
    remainingLength = 16 + 2;
  } else if (atyp === 0x03) {
    const domainLengthBuffer = await readSocketBytes(socket, 1);
    remainingLength = domainLengthBuffer[0] + 2;
  } else {
    socket.destroy();
    throw new Error(`SSH SOCKS proxy returned an unsupported address type: ${atyp}`);
  }

  await readSocketBytes(socket, remainingLength);
  return socket;
}

export async function createHttpProxySocket(proxy: ProxyEndpoint, target: ProxyTarget): Promise<net.Socket> {
  const socket = await connectTcpSocket(proxy.host, proxy.port);
  const authority = `${target.host}:${target.port}`;
  const request = [
    `CONNECT ${authority} HTTP/1.1`,
    `Host: ${authority}`,
    'Proxy-Connection: Keep-Alive',
    'Connection: Keep-Alive',
    '',
    '',
  ].join('\r\n');

  socket.write(request);

  const response = await readSocketUntil(socket, '\r\n\r\n');
  const [statusLine] = response.toString('utf8').split('\r\n');
  const statusMatch = statusLine.match(/^HTTP\/1\.[01]\s+(\d{3})\b/);
  if (!statusMatch || statusMatch[1] !== '200') {
    socket.destroy();
    throw new Error(`SSH HTTP proxy failed to connect to ${authority}: ${statusLine || 'empty response'}`);
  }

  return socket;
}

async function connectTcpSocket(host: string, port: number): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect(port, host);
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleConnect = () => {
      cleanup();
      resolve(socket);
    };
    const cleanup = () => {
      socket.off('error', handleError);
      socket.off('connect', handleConnect);
    };

    socket.once('error', handleError);
    socket.once('connect', handleConnect);
  });
}

export function buildSocksConnectRequest(target: ProxyTarget): Buffer {
  const addressType = net.isIP(target.host);
  let addressBuffer: Buffer;
  let atyp: number;

  if (addressType === 4) {
    atyp = 0x01;
    addressBuffer = Buffer.from(target.host.split('.').map((octet) => Number(octet)));
  } else if (addressType === 6) {
    atyp = 0x04;
    addressBuffer = ipv6ToBuffer(target.host);
  } else {
    const hostBuffer = Buffer.from(target.host, 'utf8');
    if (hostBuffer.length > 255) {
      throw new Error(`SSH SOCKS proxy target host is too long: ${target.host}`);
    }

    atyp = 0x03;
    addressBuffer = Buffer.concat([Buffer.from([hostBuffer.length]), hostBuffer]);
  }

  const portBuffer = Buffer.alloc(2);
  portBuffer.writeUInt16BE(target.port, 0);

  return Buffer.concat([
    Buffer.from([0x05, 0x01, 0x00, atyp]),
    addressBuffer,
    portBuffer,
  ]);
}

async function readSocketBytes(socket: net.Socket, length: number): Promise<Buffer> {
  let buffer = Buffer.alloc(0);

  while (buffer.length < length) {
    const chunk = socket.read(length - buffer.length) as Buffer | null;
    if (chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      continue;
    }

    await waitForReadable(socket);
  }

  return buffer;
}

async function readSocketUntil(socket: net.Socket, delimiter: string): Promise<Buffer> {
  const delimiterBuffer = Buffer.from(delimiter, 'utf8');
  let buffer = Buffer.alloc(0);

  while (true) {
    const delimiterIndex = buffer.indexOf(delimiterBuffer);
    if (delimiterIndex !== -1) {
      const endIndex = delimiterIndex + delimiterBuffer.length;
      const extra = buffer.subarray(endIndex);
      if (extra.length > 0) {
        socket.unshift(extra);
      }
      return buffer.subarray(0, endIndex);
    }

    const chunk = socket.read() as Buffer | null;
    if (chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      continue;
    }

    await waitForReadable(socket);
  }
}

async function waitForReadable(socket: net.Socket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off('readable', handleReadable);
      socket.off('error', handleError);
      socket.off('close', handleClose);
      socket.off('end', handleClose);
    };

    const handleReadable = () => {
      cleanup();
      resolve();
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const handleClose = () => {
      cleanup();
      reject(new Error('Socket closed during SSH proxy negotiation'));
    };

    socket.once('readable', handleReadable);
    socket.once('error', handleError);
    socket.once('close', handleClose);
    socket.once('end', handleClose);
  });
}

function ipv6ToBuffer(value: string): Buffer {
  const [headText, tailText = ''] = value.split('::');
  const head = headText ? headText.split(':').filter(Boolean) : [];
  const tail = tailText ? tailText.split(':').filter(Boolean) : [];
  const missingGroups = 8 - (head.length + tail.length);
  const groups = [
    ...head,
    ...Array.from({ length: Math.max(missingGroups, 0) }, () => '0'),
    ...tail,
  ];

  if (groups.length !== 8) {
    throw new Error(`Invalid IPv6 address for SSH SOCKS proxy target: ${value}`);
  }

  const buffer = Buffer.alloc(16);
  groups.forEach((group, index) => {
    const normalized = group.includes('.') ? ipv4MappedGroupPair(group) : [group];
    normalized.forEach((segment, segmentIndex) => {
      buffer.writeUInt16BE(parseInt(segment, 16), (index + segmentIndex) * 2);
    });
  });
  return buffer;
}

function ipv4MappedGroupPair(value: string): string[] {
  const octets = value.split('.').map((octet) => Number(octet));
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    throw new Error(`Invalid IPv4-mapped IPv6 segment: ${value}`);
  }

  return [
    ((octets[0] << 8) | octets[1]).toString(16),
    ((octets[2] << 8) | octets[3]).toString(16),
  ];
}
