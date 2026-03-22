import fs from 'fs/promises';
import { createHash } from 'crypto';
import { Client, ClientChannel, ConnectConfig, utils } from 'ssh2';
import type { KnownHostEntry } from '../../../shared/types/ssh';
import type { SSHSessionConfig } from '../../types/process';
import type { ISSHKnownHostsStore } from './SSHKnownHostsStore';
import type { ISSHHostKeyPromptService } from './SSHHostKeyPromptService';
import type { ISSHConnectionPool, SSHConnectionPoolLease } from './SSHConnectionPool';

export interface SSHShellOpenOptions {
  cols: number;
  rows: number;
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
  openShell(options: SSHShellOpenOptions): Promise<ClientChannel>;
  openForwardOut(options: SSHForwardOutOptions): Promise<ClientChannel>;
  close(): Promise<void>;
  isClosed(): boolean;
}

export class SSHClientConnection implements ISSHConnection {
  private readonly ssh: SSHSessionConfig;
  private readonly knownHostsStore: ISSHKnownHostsStore | null;
  private readonly hostKeyPromptService: ISSHHostKeyPromptService | null;
  private readonly connectionPool: ISSHConnectionPool | null;
  private readonly client: Client;
  private readonly connectListeners = new Set<(data: string) => void>();
  private connectPromise: Promise<void> | null;
  private jumpHostLease: SSHConnectionPoolLease | null;
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
    this.ready = false;
    this.closed = false;
    this.hostKeyVerificationError = null;
  }

  async connect(serviceListener?: (data: string) => void): Promise<void> {
    if (this.closed) {
      throw new Error(`SSH connection is already closed for ${this.ssh.user}@${this.ssh.host}`);
    }

    if (this.ready) {
      return;
    }

    if (serviceListener) {
      this.connectListeners.add(serviceListener);
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.performConnect().finally(() => {
      this.connectListeners.clear();
    });

    return this.connectPromise;
  }

  async openShell(options: SSHShellOpenOptions): Promise<ClientChannel> {
    await this.connect();

    return new Promise<ClientChannel>((resolve, reject) => {
      this.client.shell({
        term: 'xterm-256color',
        cols: Math.max(options.cols, 1),
        rows: Math.max(options.rows, 1),
      }, (error, stream) => {
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

  async close(): Promise<void> {
    const alreadyClosed = this.closed;

    this.closed = true;
    this.ready = false;

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

      this.client.on('ready', () => {
        if (settled) {
          return;
        }

        settled = true;
        this.ready = true;
        resolve();
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
    const connectConfig: ConnectConfig = {
      host: this.ssh.host,
      port: this.ssh.port,
      username: this.ssh.user,
      keepaliveInterval: this.ssh.keepaliveInterval > 0 ? this.ssh.keepaliveInterval * 1000 : 0,
      keepaliveCountMax: this.ssh.keepaliveCountMax,
      readyTimeout: this.ssh.readyTimeout ?? undefined,
      agentForward: this.ssh.agentForward,
      tryKeyboard: this.ssh.authType === 'keyboardInteractive',
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

  private async buildTransportSocket(): Promise<ClientChannel | undefined> {
    if (!this.ssh.jumpHost) {
      return undefined;
    }

    if (!this.connectionPool) {
      throw new Error(`SSH jump host requires a connection pool for ${this.ssh.host}:${this.ssh.port}`);
    }

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

  private emitServiceData(data: string): void {
    for (const listener of this.connectListeners) {
      listener(data);
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
