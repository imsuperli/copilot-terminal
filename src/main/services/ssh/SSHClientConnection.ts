import net from 'net';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { Client, utils } from 'ssh2';
import type { ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2';
import type {
  ActiveSSHPortForward,
  ForwardedPortConfig,
  KnownHostEntry,
  SSHPortForwardSource,
  SSHSftpDirectoryListing,
} from '../../../shared/types/ssh';
import type { SSHSessionConfig } from '../../types/process';
import type { ISSHKnownHostsStore } from './SSHKnownHostsStore';
import type { ISSHHostKeyPromptService } from './SSHHostKeyPromptService';
import type { ISSHConnectionPool, SSHConnectionPoolLease } from './SSHConnectionPool';
import { ActivePortForwardListener, startPortForwardListener } from './SSHPortForwarding';
import {
  createHttpProxySocket,
  createProxyCommandSocket,
  createSocksProxySocket,
} from './SSHTransportSockets';
import { resolveSSHAlgorithmPreferences } from './SSHAlgorithmCatalog';
import { SSHSftpSession } from './SSHSftpSession';
import { connectToX11Display, describeX11DisplaySpec } from './X11Socket';

export interface SSHShellOpenOptions {
  cols: number;
  rows: number;
  x11?: boolean;
}

export interface SSHForwardOutOptions {
  targetHost: string;
  targetPort: number;
  sourceHost?: string;
  sourcePort?: number;
}

export interface SSHClientConnectionDependencies {
  knownHostsStore?: ISSHKnownHostsStore | null;
  hostKeyPromptService?: ISSHHostKeyPromptService | null;
  connectionPool?: ISSHConnectionPool | null;
}

export interface ISSHConnection {
  connect(serviceListener?: (data: string) => void): Promise<void>;
  attachServiceListener(listener: (data: string) => void): () => void;
  openShell(options: SSHShellOpenOptions): Promise<ClientChannel>;
  openForwardOut(options: SSHForwardOutOptions): Promise<ClientChannel>;
  listPortForwards(): ActiveSSHPortForward[];
  addPortForward(config: ForwardedPortConfig): Promise<ActiveSSHPortForward>;
  removePortForward(forwardId: string): Promise<void>;
  listSftpDirectory(path?: string): Promise<SSHSftpDirectoryListing>;
  downloadSftpFile(remotePath: string, localPath: string): Promise<void>;
  uploadSftpFiles(remotePath: string, localPaths: string[]): Promise<number>;
  close(): Promise<void>;
  isClosed(): boolean;
}

type ActivePortForwardState = {
  forward: ActiveSSHPortForward;
  listener?: ActivePortForwardListener;
  remoteBind?: {
    host: string;
    port: number;
  };
};

export class SSHClientConnection implements ISSHConnection {
  private readonly ssh: SSHSessionConfig;
  private readonly knownHostsStore: ISSHKnownHostsStore | null;
  private readonly hostKeyPromptService: ISSHHostKeyPromptService | null;
  private readonly connectionPool: ISSHConnectionPool | null;
  private readonly client: Client;
  private readonly serviceListeners = new Set<(data: string) => void>();
  private connectPromise: Promise<void> | null;
  private jumpHostLease: SSHConnectionPoolLease | null;
  private forwardedPortsConfigured: boolean;
  private readonly activePortForwards = new Map<string, ActivePortForwardState>();
  private readonly remotePortForwardKeys = new Map<string, string>();
  private portForwardMutationQueue: Promise<void>;
  private sftpWrapperPromise: Promise<SFTPWrapper> | null;
  private sftpSession: SSHSftpSession | null;
  private ready: boolean;
  private closed: boolean;
  private hostKeyVerificationError: Error | null;

  constructor(ssh: SSHSessionConfig, dependencies: SSHClientConnectionDependencies = {}) {
    this.ssh = ssh;
    this.knownHostsStore = dependencies.knownHostsStore ?? null;
    this.hostKeyPromptService = dependencies.hostKeyPromptService ?? null;
    this.connectionPool = dependencies.connectionPool ?? null;
    this.client = new Client();
    this.connectPromise = null;
    this.jumpHostLease = null;
    this.forwardedPortsConfigured = false;
    this.portForwardMutationQueue = Promise.resolve();
    this.sftpWrapperPromise = null;
    this.sftpSession = null;
    this.ready = false;
    this.closed = false;
    this.hostKeyVerificationError = null;
  }

  async connect(serviceListener?: (data: string) => void): Promise<void> {
    if (this.closed) {
      throw new Error(`SSH connection is already closed for ${this.ssh.user}@${this.ssh.host}`);
    }

    if (serviceListener) {
      this.attachServiceListener(serviceListener);
    }

    if (this.ready) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.performConnect();

    return this.connectPromise;
  }

  attachServiceListener(listener: (data: string) => void): () => void {
    this.serviceListeners.add(listener);

    return () => {
      this.serviceListeners.delete(listener);
    };
  }

  async openShell(options: SSHShellOpenOptions): Promise<ClientChannel> {
    await this.connect();

    return new Promise<ClientChannel>((resolve, reject) => {
      this.client.shell({
        term: 'xterm-256color',
        cols: Math.max(options.cols, 1),
        rows: Math.max(options.rows, 1),
      }, options.x11 ? {
        x11: {
          single: false,
          protocol: 'MIT-MAGIC-COOKIE-1',
          screen: 0,
        },
      } : {}, (error, stream) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stream);
      });
    });
  }

  async openForwardOut(options: SSHForwardOutOptions): Promise<ClientChannel> {
    await this.connect();

    return new Promise<ClientChannel>((resolve, reject) => {
      this.client.forwardOut(
        options.sourceHost ?? '127.0.0.1',
        options.sourcePort ?? 0,
        options.targetHost,
        options.targetPort,
        (error, stream) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(stream);
        },
      );
    });
  }

  listPortForwards(): ActiveSSHPortForward[] {
    return Array.from(this.activePortForwards.values()).map((state) => ({ ...state.forward }));
  }

  async addPortForward(config: ForwardedPortConfig): Promise<ActiveSSHPortForward> {
    await this.connect();

    return this.runPortForwardMutation(async () => {
      const existing = this.activePortForwards.get(config.id);
      if (existing) {
        if (areForwardConfigsEquivalent(existing.forward, config)) {
          return { ...existing.forward };
        }

        throw new Error(`SSH forwarded port id already exists: ${config.id}`);
      }

      const state = await this.activatePortForward(config, 'session');
      this.emitServiceData(`[SSH] Forwarded ${formatForwardedPort(state.forward)}\r\n`);
      return { ...state.forward };
    });
  }

  async removePortForward(forwardId: string): Promise<void> {
    await this.runPortForwardMutation(async () => {
      const state = this.activePortForwards.get(forwardId);
      if (!state) {
        return;
      }

      await this.deactivatePortForward(state);
      this.emitServiceData(`[SSH] Stopped forwarding ${formatForwardedPort(state.forward)}\r\n`);
    });
  }

  async listSftpDirectory(path?: string): Promise<SSHSftpDirectoryListing> {
    const session = await this.getSftpSession();
    return session.listDirectory(path);
  }

  async downloadSftpFile(remotePath: string, localPath: string): Promise<void> {
    const session = await this.getSftpSession();
    await session.downloadFile(remotePath, localPath);
  }

  async uploadSftpFiles(remotePath: string, localPaths: string[]): Promise<number> {
    const session = await this.getSftpSession();
    return session.uploadFiles(remotePath, localPaths);
  }

  async close(): Promise<void> {
    const alreadyClosed = this.closed;

    this.closed = true;
    this.ready = false;
    this.sftpSession = null;
    this.sftpWrapperPromise = null;
    await this.disposeConfiguredPortForwards();

    if (!alreadyClosed) {
      try {
        this.client.end();
      } catch {
        // Ignore teardown races.
      }

      try {
        this.client.destroy();
      } catch {
        // Ignore teardown races.
      }
    }

    await this.releaseJumpHostLease();
  }

  isClosed(): boolean {
    return this.closed;
  }

  private async performConnect(): Promise<void> {
    const knownHosts = await this.loadKnownHosts();
    const connectConfig = await this.buildConnectConfig(knownHosts);

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        this.closed = true;
        this.ready = false;
        reject(error);
      };

      this.client.setNoDelay(true);

      this.client.on('banner', (message) => {
        if (!this.ssh.skipBanner) {
          this.emitServiceData(`${message}\r\n`);
        }
      });

      this.client.on('keyboard-interactive', (_name, instructions, _lang, prompts, finish) => {
        if (!this.ssh.password) {
          rejectOnce(new Error(instructions || 'SSH keyboard-interactive authentication requires a stored secret'));
          finish(prompts.map(() => ''));
          return;
        }

        finish(prompts.map(() => this.ssh.password as string));
      });

      this.client.on('change password', (message) => {
        rejectOnce(new Error(message || 'SSH server requires a password change before login'));
      });

      this.client.on('tcp connection', (details, accept, rejectIncoming) => {
        void this.handleRemoteForwardConnection(details, accept, rejectIncoming);
      });

      this.client.on('x11', (details, accept, rejectIncoming) => {
        void this.handleX11Connection(details, accept, rejectIncoming);
      });

      this.client.on('ready', () => {
        if (settled) {
          return;
        }

        settled = true;
        this.ready = true;
        void this.configureConfiguredPortForwards()
          .finally(() => {
            resolve();
          });
      });

      this.client.on('error', (error) => {
        if (!settled) {
          rejectOnce(this.hostKeyVerificationError ?? error);
        }
      });

      this.client.on('close', () => {
        this.ready = false;
        this.closed = true;

        if (!settled) {
          rejectOnce(this.hostKeyVerificationError ?? new Error(`SSH connection closed before ready for ${this.ssh.host}:${this.ssh.port}`));
        }
      });

      this.client.connect(connectConfig);
    });
  }

  private async buildConnectConfig(knownHosts: KnownHostEntry[]): Promise<ConnectConfig> {
    const algorithms = resolveSSHAlgorithmPreferences(this.ssh.algorithms);
    const connectAlgorithms = {
      kex: algorithms.kex,
      serverHostKey: algorithms.hostKey,
      cipher: algorithms.cipher,
      hmac: algorithms.hmac,
      compress: algorithms.compression,
    } as NonNullable<ConnectConfig['algorithms']>;
    const connectConfig: ConnectConfig = {
      host: this.ssh.host,
      port: this.ssh.port,
      username: this.ssh.user,
      keepaliveInterval: this.ssh.keepaliveInterval > 0 ? this.ssh.keepaliveInterval * 1000 : 0,
      keepaliveCountMax: this.ssh.keepaliveCountMax,
      readyTimeout: this.ssh.readyTimeout ?? undefined,
      agentForward: this.ssh.agentForward,
      tryKeyboard: this.ssh.authType === 'keyboardInteractive',
      algorithms: connectAlgorithms,
      hostVerifier: (key: Buffer, callback?: (verified: boolean) => void) => {
        void this.verifyHostKey(key, knownHosts)
          .then((verified) => {
            if (callback) {
              callback(verified);
              return;
            }

            return verified;
          })
          .catch((error) => {
            this.hostKeyVerificationError = error instanceof Error
              ? error
              : new Error(String(error));

            if (callback) {
              callback(false);
            }
          });

        return callback ? undefined : false;
      },
    };

    const transportSocket = await this.buildTransportSocket();
    if (transportSocket) {
      connectConfig.sock = transportSocket;
    }

    switch (this.ssh.authType) {
      case 'password':
        if (!this.ssh.password) {
          throw new Error('SSH password authentication requires a stored password');
        }
        connectConfig.password = this.ssh.password;
        break;
      case 'publicKey': {
        const keyPath = this.ssh.privateKeys[0];
        if (!keyPath) {
          throw new Error('SSH public key authentication requires at least one private key path');
        }

        connectConfig.privateKey = await fs.readFile(keyPath, 'utf8');
        connectConfig.passphrase = this.ssh.privateKeyPassphrases?.[keyPath];
        break;
      }
      case 'agent': {
        const agent = process.platform === 'win32' ? 'pageant' : process.env.SSH_AUTH_SOCK;
        if (!agent) {
          throw new Error('SSH agent authentication requested but no local agent is available');
        }

        connectConfig.agent = agent;
        break;
      }
      case 'keyboardInteractive':
        connectConfig.tryKeyboard = true;
        break;
      default:
        throw new Error(`Unsupported SSH auth type: ${String(this.ssh.authType)}`);
    }

    return connectConfig;
  }

  private async buildTransportSocket(): Promise<ConnectConfig['sock'] | undefined> {
    if (this.ssh.proxyCommand) {
      this.emitServiceData(`[SSH] Proxy command: ${this.ssh.proxyCommand}\r\n`);
      return createProxyCommandSocket(this.ssh.proxyCommand, {
        host: this.ssh.host,
        port: this.ssh.port,
        user: this.ssh.user,
      });
    }

    if (this.ssh.jumpHost) {
      if (!this.connectionPool) {
        throw new Error(`SSH jump host requires a connection pool for ${this.ssh.host}:${this.ssh.port}`);
      }

      this.emitServiceData(`[SSH] Jump host: ${this.ssh.jumpHost.user}@${this.ssh.jumpHost.host}:${this.ssh.jumpHost.port}\r\n`);
      this.jumpHostLease = await this.connectionPool.acquire(this.ssh.jumpHost, (data) => {
        this.emitServiceData(data);
      });

      try {
        return await this.jumpHostLease.connection.openForwardOut({
          targetHost: this.ssh.host,
          targetPort: this.ssh.port,
        });
      } catch (error) {
        await this.releaseJumpHostLease();
        throw error;
      }
    }

    if (this.ssh.socksProxyHost) {
      this.emitServiceData(`[SSH] SOCKS proxy: ${this.ssh.socksProxyHost}:${this.ssh.socksProxyPort ?? 1080}\r\n`);
      return createSocksProxySocket({
        host: this.ssh.socksProxyHost,
        port: this.ssh.socksProxyPort ?? 1080,
      }, {
        host: this.ssh.host,
        port: this.ssh.port,
      });
    }

    if (this.ssh.httpProxyHost) {
      this.emitServiceData(`[SSH] HTTP proxy: ${this.ssh.httpProxyHost}:${this.ssh.httpProxyPort ?? 8080}\r\n`);
      return createHttpProxySocket({
        host: this.ssh.httpProxyHost,
        port: this.ssh.httpProxyPort ?? 8080,
      }, {
        host: this.ssh.host,
        port: this.ssh.port,
      });
    }

    return undefined;
  }

  private async getSftpSession(): Promise<SSHSftpSession> {
    if (this.sftpSession) {
      return this.sftpSession;
    }

    this.sftpSession = new SSHSftpSession({
      getWrapper: async () => this.getSftpWrapper(),
    });

    return this.sftpSession;
  }

  private async getSftpWrapper(): Promise<SFTPWrapper> {
    await this.connect();

    if (this.closed) {
      throw new Error(`SSH connection is already closed for ${this.ssh.user}@${this.ssh.host}`);
    }

    if (this.sftpWrapperPromise) {
      return this.sftpWrapperPromise;
    }

    this.sftpWrapperPromise = new Promise<SFTPWrapper>((resolve, reject) => {
      this.client.sftp((error, sftp) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(sftp);
      });
    }).catch((error) => {
      this.sftpWrapperPromise = null;
      throw error;
    });

    return this.sftpWrapperPromise;
  }

  private async configureConfiguredPortForwards(): Promise<void> {
    if (this.forwardedPortsConfigured) {
      return;
    }

    this.forwardedPortsConfigured = true;

    for (const forward of this.ssh.forwardedPorts) {
      try {
        const state = await this.activatePortForward(forward, 'profile');
        this.emitServiceData(`[SSH] Forwarded ${formatForwardedPort(state.forward)}\r\n`);
      } catch (error) {
        this.emitServiceData(`[SSH] Failed to forward ${formatForwardedPort(forward)}: ${formatErrorMessage(error)}\r\n`);
      }
    }
  }

  private async activatePortForward(
    config: ForwardedPortConfig,
    source: SSHPortForwardSource,
  ): Promise<ActivePortForwardState> {
    if (config.type === 'remote') {
      return this.startRemotePortForward(config, source);
    }

    return this.startLocalPortForward(config, source);
  }

  private async startLocalPortForward(
    config: ForwardedPortConfig,
    source: SSHPortForwardSource,
  ): Promise<ActivePortForwardState> {
    const listener = await startPortForwardListener(config, async (request) => {
      let channel: ClientChannel | null = null;

      try {
        channel = await this.openForwardOut({
          sourceHost: request.sourceAddress ?? '127.0.0.1',
          sourcePort: request.sourcePort ?? 0,
          targetHost: request.targetAddress,
          targetPort: request.targetPort,
        });
      } catch (error) {
        request.reject();
        this.emitServiceData(`[SSH] Rejected forwarded connection via ${formatForwardedPort(config)}: ${formatErrorMessage(error)}\r\n`);
        return;
      }

      const socket = request.accept();
      this.bridgeChannelToSocket(channel, socket);
    });

    const state: ActivePortForwardState = {
      forward: {
        ...config,
        source,
      },
      listener,
    };

    this.activePortForwards.set(config.id, state);
    return state;
  }

  private async startRemotePortForward(
    config: ForwardedPortConfig,
    source: SSHPortForwardSource,
  ): Promise<ActivePortForwardState> {
    const boundPort = await new Promise<number>((resolve, reject) => {
      this.client.forwardIn(config.host, config.port, (error, port) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port ?? config.port);
      });
    });

    const state: ActivePortForwardState = {
      forward: {
        ...config,
        port: boundPort,
        source,
      },
      remoteBind: {
        host: config.host,
        port: boundPort,
      },
    };

    this.activePortForwards.set(config.id, state);
    this.remotePortForwardKeys.set(getRemoteForwardKey(config.host, boundPort), config.id);
    return state;
  }

  private async handleRemoteForwardConnection(
    details: { srcIP: string; srcPort: number; destIP: string; destPort: number },
    accept: () => ClientChannel,
    reject: () => void,
  ): Promise<void> {
    const forward = this.findRemotePortForward(details.destIP, details.destPort);
    if (!forward) {
      reject();
      this.emitServiceData(`[SSH] Rejected incoming remote forward for ${details.destIP}:${details.destPort}\r\n`);
      return;
    }

    const channel = accept();
    const socket = net.connect(forward.targetPort, forward.targetAddress);
    const rejectChannel = () => {
      try {
        channel.close();
      } catch {
        // Ignore teardown races while rejecting the forwarded channel.
      }
    };

    socket.once('error', (error) => {
      this.emitServiceData(`[SSH] Local target ${forward.targetAddress}:${forward.targetPort} rejected remote forward ${formatForwardedPort(forward)}: ${formatErrorMessage(error)}\r\n`);
      rejectChannel();
    });

    socket.once('connect', () => {
      this.bridgeChannelToSocket(channel, socket);
    });
  }

  private async handleX11Connection(
    details: { srcIP: string; srcPort: number },
    accept: () => ClientChannel,
    reject: () => void,
  ): Promise<void> {
    try {
      const socket = await connectToX11Display();
      const channel = accept();
      this.emitServiceData(`[SSH] Forwarded X11 connection from ${details.srcIP}:${details.srcPort} to ${describeX11DisplaySpec()}\r\n`);
      this.bridgeChannelToSocket(channel, socket);
    } catch (error) {
      reject();
      this.emitServiceData(`[SSH] Failed to connect the local X11 display (${describeX11DisplaySpec()}): ${formatErrorMessage(error)}\r\n`);

      if (process.platform === 'win32') {
        this.emitServiceData('[SSH] Install and start a local X server such as VcXsrv or Xming before enabling X11 forwarding.\r\n');
      }
    }
  }

  private findRemotePortForward(host: string, port: number): ActiveSSHPortForward | null {
    const directId = this.remotePortForwardKeys.get(getRemoteForwardKey(host, port));
    if (directId) {
      const directState = this.activePortForwards.get(directId);
      if (directState) {
        return directState.forward;
      }
    }

    for (const state of this.activePortForwards.values()) {
      const forward = state.forward;
      if (forward.type !== 'remote') {
        continue;
      }

      if (forward.port !== port) {
        continue;
      }

      if (isRemoteForwardWildcard(forward.host) || forward.host === host) {
        return forward;
      }
    }

    return null;
  }

  private async deactivatePortForward(state: ActivePortForwardState): Promise<void> {
    this.activePortForwards.delete(state.forward.id);

    if (state.listener) {
      await state.listener.dispose();
      return;
    }

    if (!state.remoteBind) {
      return;
    }

    const { host, port } = state.remoteBind;
    this.remotePortForwardKeys.delete(getRemoteForwardKey(host, port));
    await new Promise<void>((resolve) => {
      try {
        this.client.unforwardIn(host, port, () => {
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  private bridgeChannelToSocket(channel: ClientChannel, socket: net.Socket): void {
    channel.on('data', (data: Buffer | string) => {
      socket.write(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    });
    channel.stderr?.on('data', (data: Buffer | string) => {
      socket.write(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    });
    channel.on('close', () => {
      socket.destroy();
    });
    channel.on('end', () => {
      socket.end();
    });
    channel.on('error', () => {
      socket.destroy();
    });

    socket.on('data', (data) => {
      channel.write(data);
    });
    socket.on('close', () => {
      channel.close();
    });
    socket.on('end', () => {
      channel.end();
    });
    socket.on('error', () => {
      channel.close();
    });
  }

  private async disposeConfiguredPortForwards(): Promise<void> {
    const activeForwards = Array.from(this.activePortForwards.values());
    this.activePortForwards.clear();
    this.remotePortForwardKeys.clear();

    await Promise.allSettled(activeForwards.map(async (state) => {
      if (state.listener) {
        await state.listener.dispose();
        return;
      }

      if (!state.remoteBind) {
        return;
      }

      await new Promise<void>((resolve) => {
        try {
          this.client.unforwardIn(state.remoteBind!.host, state.remoteBind!.port, () => {
            resolve();
          });
        } catch {
          resolve();
        }
      });
    }));
  }

  private emitServiceData(data: string): void {
    for (const listener of this.serviceListeners) {
      listener(data);
    }
  }

  private async runPortForwardMutation<T>(operation: () => Promise<T>): Promise<T> {
    let releaseQueue = () => {};
    const next = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    const previous = this.portForwardMutationQueue;
    this.portForwardMutationQueue = previous.finally(() => next);

    await previous;

    try {
      return await operation();
    } finally {
      releaseQueue();
    }
  }

  private async releaseJumpHostLease(): Promise<void> {
    if (!this.jumpHostLease) {
      return;
    }

    const lease = this.jumpHostLease;
    this.jumpHostLease = null;
    await lease.release();
  }
  private async verifyHostKey(key: Buffer, knownHosts: KnownHostEntry[]): Promise<boolean> {
    const digest = formatHostKeyDigest(key);
    const algorithm = readHostKeyAlgorithm(key);

    if (!this.ssh.verifyHostKeys) {
      return true;
    }

    const exactMatch = knownHosts.find((entry) => (
      entry.algorithm === algorithm && entry.digest === digest
    ));
    if (exactMatch) {
      return true;
    }

    const storedEntry = knownHosts.find((entry) => entry.algorithm === algorithm);
    const reason = storedEntry ? 'mismatch' : 'unknown';

    this.emitServiceData(`[SSH] Host key fingerprint (${algorithm}): ${digest}\r\n`);
    if (storedEntry) {
      this.emitServiceData(`[SSH] Stored fingerprint: ${storedEntry.digest}\r\n`);
    }

    if (!this.hostKeyPromptService) {
      this.hostKeyVerificationError = new Error('SSH host key verification prompt service is unavailable');
      return false;
    }

    const decision = await this.hostKeyPromptService.confirm({
      host: this.ssh.host,
      port: this.ssh.port,
      algorithm,
      fingerprint: digest,
      reason,
      ...(storedEntry ? { storedFingerprint: storedEntry.digest } : {}),
    });

    if (!decision.trusted) {
      this.hostKeyVerificationError = new Error('SSH host key verification was rejected by the user');
      return false;
    }

    if (decision.persist && this.knownHostsStore) {
      await this.knownHostsStore.upsert({
        host: this.ssh.host,
        port: this.ssh.port,
        algorithm,
        digest,
      });
    }

    return true;
  }

  private async loadKnownHosts(): Promise<KnownHostEntry[]> {
    if (!this.ssh.verifyHostKeys || !this.knownHostsStore) {
      return [];
    }

    const entries = await this.knownHostsStore.list();
    return entries.filter((entry) => entry.host === this.ssh.host && entry.port === this.ssh.port);
  }

}

function formatHostKeyDigest(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64')}`;
}

function readHostKeyAlgorithm(key: Buffer): string {
  const parsed = utils.parseKey(key) as { type?: string } | Array<{ type?: string }> | Error;
  if (Array.isArray(parsed)) {
    return parsed[0]?.type || 'unknown';
  }

  if (parsed instanceof Error) {
    return 'unknown';
  }

  return parsed?.type || 'unknown';
}

function formatForwardedPort(forward: ForwardedPortConfig): string {
  if (forward.type === 'dynamic') {
    return `(dynamic) ${forward.host}:${forward.port}`;
  }

  if (forward.type === 'remote') {
    return `(remote) ${forward.host}:${forward.port} -> (local) ${forward.targetAddress}:${forward.targetPort}`;
  }

  return `(local) ${forward.host}:${forward.port} -> (remote) ${forward.targetAddress}:${forward.targetPort}`;
}

function areForwardConfigsEquivalent(
  left: Pick<ForwardedPortConfig, 'type' | 'host' | 'port' | 'targetAddress' | 'targetPort' | 'description'>,
  right: Pick<ForwardedPortConfig, 'type' | 'host' | 'port' | 'targetAddress' | 'targetPort' | 'description'>,
): boolean {
  return (
    left.type === right.type
    && left.host === right.host
    && left.port === right.port
    && left.targetAddress === right.targetAddress
    && left.targetPort === right.targetPort
    && (left.description ?? '') === (right.description ?? '')
  );
}

function getRemoteForwardKey(host: string, port: number): string {
  return `${host}:${port}`;
}

function isRemoteForwardWildcard(host: string): boolean {
  return host === '' || host === '0.0.0.0' || host === '::' || host === 'localhost';
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
