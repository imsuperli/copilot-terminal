import net, { Server, Socket } from 'net';
import type { ForwardedPortConfig } from '../../../shared/types/ssh';

const socksv5 = require('@luminati-io/socksv5');

export interface ForwardedConnectionRequest {
  accept(): Socket;
  reject(): void;
  sourceAddress: string | null;
  sourcePort: number | null;
  targetAddress: string;
  targetPort: number;
}

export interface ActivePortForwardListener {
  config: ForwardedPortConfig;
  dispose(): Promise<void>;
}

export async function startPortForwardListener(
  config: ForwardedPortConfig,
  onConnection: (request: ForwardedConnectionRequest) => void | Promise<void>,
): Promise<ActivePortForwardListener> {
  if (config.type === 'dynamic') {
    const server = socksv5.createServer((info: { dstAddr: string; dstPort: number }, acceptConnection: (granted: boolean) => Socket, rejectConnection: () => void) => {
      void Promise.resolve(onConnection({
        accept: () => acceptConnection(true),
        reject: () => rejectConnection(),
        sourceAddress: null,
        sourcePort: null,
        targetAddress: info.dstAddr,
        targetPort: info.dstPort,
      })).catch(() => {
        rejectConnection();
      });
    }) as Server & { useAuth?: (handler: unknown) => void };

    server.useAuth?.(socksv5.auth.None());
    await listenOnHost(server, config.host, config.port);
    return createListenerHandle(config, server);
  }

  const server = net.createServer((socket) => {
    void Promise.resolve(onConnection({
      accept: () => socket,
      reject: () => socket.destroy(),
      sourceAddress: socket.remoteAddress ?? null,
      sourcePort: socket.remotePort ?? null,
      targetAddress: config.targetAddress,
      targetPort: config.targetPort,
    })).catch((error) => {
      socket.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });

  await listenOnHost(server, config.host, config.port);
  return createListenerHandle(config, server);
}

function createListenerHandle(config: ForwardedPortConfig, server: Server): ActivePortForwardListener {
  return {
    config,
    dispose: async () => {
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
    },
  };
}

async function listenOnHost(server: Server, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleListening = () => {
      cleanup();
      resolve();
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      server.off('listening', handleListening);
      server.off('error', handleError);
    };

    server.once('listening', handleListening);
    server.once('error', handleError);
    server.listen(port, host);
  });
}
