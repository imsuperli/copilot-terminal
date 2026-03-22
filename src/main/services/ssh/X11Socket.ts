import net, { SocketConnectOpts } from 'net';

export function resolveX11DisplaySpec(spec?: string | null): SocketConnectOpts {
  const normalizedSpec = spec?.trim() || process.env.COPILOT_TERMINAL_X11_DISPLAY || process.env.DISPLAY || '';
  const [, parsedHost, parsedDisplay] = /^(.*?):(\d+)(?:\.(\d+))?$/.exec(normalizedSpec) ?? [];

  let host = parsedHost || (process.platform === 'win32' ? 'localhost' : 'unix');
  if (normalizedSpec.startsWith('/')) {
    host = normalizedSpec;
  }

  const display = Number.parseInt(parsedDisplay || '0', 10);
  const port = display < 100 ? display + 6000 : display;

  if (host === 'unix') {
    host = `/tmp/.X11-unix/X${display}`;
  }

  if (host.startsWith('/')) {
    return { path: host };
  }

  return {
    host,
    port,
  };
}

export function connectToX11Display(spec?: string | null): Promise<net.Socket> {
  const connection = net.createConnection(resolveX11DisplaySpec(spec));

  return new Promise<net.Socket>((resolve, reject) => {
    connection.once('connect', () => {
      resolve(connection);
    });
    connection.once('error', (error) => {
      reject(error);
    });
  });
}

export function describeX11DisplaySpec(spec?: string | null): string {
  const resolved = resolveX11DisplaySpec(spec);
  if ('path' in resolved && resolved.path) {
    return resolved.path;
  }

  const tcpResolved = resolved as Exclude<SocketConnectOpts, { path: string }>;
  return `${tcpResolved.host ?? 'localhost'}:${tcpResolved.port ?? 6000}`;
}
