import fs from 'fs/promises';
import { createHash } from 'crypto';
import { Client, ClientChannel, ConnectConfig, utils } from 'ssh2';
import { IPty, SSHSessionConfig } from '../../types/process';
import type { KnownHostEntry } from '../../../shared/types/ssh';
import type { ISSHKnownHostsStore } from './SSHKnownHostsStore';
import type { ISSHHostKeyPromptService } from './SSHHostKeyPromptService';

export interface SSHPtySessionOptions {
  pid: number;
  ssh: SSHSessionConfig;
  knownHostsStore?: ISSHKnownHostsStore | null;
  hostKeyPromptService?: ISSHHostKeyPromptService | null;
}

type ExitEvent = {
  exitCode: number;
  signal?: number;
};

export class SSHPtySession implements IPty {
  static async create(options: SSHPtySessionOptions): Promise<SSHPtySession> {
    const session = new SSHPtySession(options);
    await session.connect();
    return session;
  }

  readonly pid: number;
  cols: number;
  rows: number;
  process: string;
  handleFlowControl: boolean;

  private readonly ssh: SSHSessionConfig;
  private readonly knownHostsStore: ISSHKnownHostsStore | null;
  private readonly hostKeyPromptService: ISSHHostKeyPromptService | null;
  private readonly client: Client;
  private channel: ClientChannel | null;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: ExitEvent) => void>();
  private readonly pendingData: string[] = [];
  private pendingExit: ExitEvent | null;
  private hostKeyVerificationError: Error | null;
  private closed: boolean;

  private constructor(options: SSHPtySessionOptions) {
    this.pid = options.pid;
    this.cols = 120;
    this.rows = 30;
    this.process = `ssh:${options.ssh.user}@${options.ssh.host}`;
    this.handleFlowControl = false;
    this.ssh = options.ssh;
    this.knownHostsStore = options.knownHostsStore ?? null;
    this.hostKeyPromptService = options.hostKeyPromptService ?? null;
    this.client = new Client();
    this.channel = null;
    this.pendingExit = null;
    this.hostKeyVerificationError = null;
    this.closed = false;
  }

  write(data: string): void {
    this.channel?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = Math.max(cols, 1);
    this.rows = Math.max(rows, 1);
    this.channel?.setWindow(this.rows, this.cols, this.rows * 16, this.cols * 8);
  }

  kill(signal?: string): void {
    if (this.closed) {
      return;
    }

    this.closed = true;

    try {
      if (signal && this.channel && typeof this.channel.signal === 'function') {
        this.channel.signal(signal);
      }
    } catch {
      // Ignore remote signal delivery failures and continue closing.
    }

    try {
      this.channel?.end();
    } catch {
      // Ignore channel teardown failures during shutdown.
    }

    try {
      this.client.end();
      this.client.destroy();
    } catch {
      // Ignore client teardown failures during shutdown.
    }

    this.emitExit({ exitCode: 0 });
  }

  onData(listener: (data: string) => void): { dispose(): void } {
    this.dataListeners.add(listener);

    if (this.pendingData.length > 0) {
      const buffered = [...this.pendingData];
      this.pendingData.length = 0;
      setImmediate(() => {
        buffered.forEach((chunk) => listener(chunk));
      });
    }

    return {
      dispose: () => {
        this.dataListeners.delete(listener);
      },
    };
  }

  onExit(listener: (exitCode: ExitEvent) => void): { dispose(): void } {
    this.exitListeners.add(listener);

    if (this.pendingExit) {
      const exitEvent = this.pendingExit;
      setImmediate(() => listener(exitEvent));
    }

    return {
      dispose: () => {
        this.exitListeners.delete(listener);
      },
    };
  }

  private async connect(): Promise<void> {
    const knownHosts = await this.loadKnownHosts();
    const connectConfig = await this.buildConnectConfig(knownHosts);

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error);
      };

      this.client.setNoDelay(true);

      this.client.on('banner', (message) => {
        if (!this.ssh.skipBanner) {
          this.emitData(`${message}\r\n`);
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
        this.client.shell({
          term: 'xterm-256color',
          cols: this.cols,
          rows: this.rows,
        }, (error, stream) => {
          if (error) {
            rejectOnce(error);
            return;
          }

          this.channel = stream;

          stream.on('data', (data: Buffer | string) => {
            this.emitData(toUtf8(data));
          });
          stream.stderr?.on('data', (data: Buffer | string) => {
            this.emitData(toUtf8(data));
          });
          stream.on('exit', (code?: number, signal?: number | string) => {
            this.emitExit({
              exitCode: typeof code === 'number' ? code : 0,
              signal: typeof signal === 'number' ? signal : undefined,
            });
          });
          stream.on('close', () => {
            this.channel = null;
            try {
              this.client.end();
            } catch {
              // Ignore close races.
            }
            this.emitExit(this.pendingExit ?? { exitCode: 0 });
          });

          if (!settled) {
            settled = true;
            resolve();
          }

          this.initializeRemoteShell();
        });
      });

      this.client.on('error', (error) => {
        if (!settled) {
          rejectOnce(this.hostKeyVerificationError ?? error);
          return;
        }

        this.emitData(`[SSH] ${error.message}\r\n`);
        this.emitExit({ exitCode: 1 });
      });

      this.client.on('close', () => {
        this.emitExit(this.pendingExit ?? { exitCode: 0 });
      });

      this.client.connect(connectConfig);
    });
  }

  private async buildConnectConfig(knownHosts: KnownHostEntry[]): Promise<ConnectConfig> {
    const connectConfig: ConnectConfig = {
      host: this.ssh.host,
      port: this.ssh.port,
      username: this.ssh.user,
      // Profile values are stored in seconds to match the UI and OpenSSH config semantics.
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
    const fingerprintLabel = `[SSH] Host key fingerprint (${algorithm}): ${digest}\r\n`;
    this.emitData(fingerprintLabel);
    if (storedEntry) {
      this.emitData(`[SSH] Stored fingerprint: ${storedEntry.digest}\r\n`);
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

  private initializeRemoteShell(): void {
    if (!this.channel) {
      return;
    }

    const commands: string[] = [];
    const remoteCwd = this.ssh.remoteCwd;
    const startupCommand = this.ssh.command;

    if (remoteCwd) {
      commands.push(`cd ${shellEscape(remoteCwd)}`);
    }

    if (startupCommand) {
      commands.push(startupCommand);
    }

    if (commands.length > 0) {
      this.channel.write(`${commands.join('\n')}\n`);
    }
  }

  private emitData(data: string): void {
    if (this.dataListeners.size === 0) {
      this.pendingData.push(data);
      return;
    }

    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  private emitExit(event: ExitEvent): void {
    if (this.pendingExit) {
      return;
    }

    this.pendingExit = event;
    for (const listener of this.exitListeners) {
      listener(event);
    }
  }
}

function toUtf8(value: Buffer | string): string {
  return typeof value === 'string' ? value : value.toString('utf8');
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
