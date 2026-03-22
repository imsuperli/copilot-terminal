import { ClientChannel } from 'ssh2';
import { IPty, SSHSessionConfig } from '../../types/process';
import { ActiveSSHPortForward, ForwardedPortConfig, SSHSftpDirectoryListing } from '../../../shared/types/ssh';
import type { ISSHConnectionPool, SSHConnectionPoolLease } from './SSHConnectionPool';

export interface SSHPtySessionOptions {
  pid: number;
  ssh: SSHSessionConfig;
  connectionPool: ISSHConnectionPool;
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
  private readonly connectionPool: ISSHConnectionPool;
  private channel: ClientChannel | null;
  private connectionLease: SSHConnectionPoolLease | null;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: ExitEvent) => void>();
  private readonly pendingData: string[] = [];
  private pendingExit: ExitEvent | null;
  private closed: boolean;

  private constructor(options: SSHPtySessionOptions) {
    this.pid = options.pid;
    this.cols = 120;
    this.rows = 30;
    this.process = `ssh:${options.ssh.user}@${options.ssh.host}`;
    this.handleFlowControl = false;
    this.ssh = options.ssh;
    this.connectionPool = options.connectionPool;
    this.channel = null;
    this.connectionLease = null;
    this.pendingExit = null;
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

    void this.releaseConnectionLease();
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

  listPortForwards(): ActiveSSHPortForward[] {
    return this.connectionLease?.connection.listPortForwards() ?? [];
  }

  async addPortForward(config: ForwardedPortConfig): Promise<ActiveSSHPortForward> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    return this.connectionLease.connection.addPortForward(config);
  }

  async removePortForward(forwardId: string): Promise<void> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    await this.connectionLease.connection.removePortForward(forwardId);
  }

  async listSftpDirectory(path?: string): Promise<SSHSftpDirectoryListing> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    return this.connectionLease.connection.listSftpDirectory(path);
  }

  async downloadSftpFile(remotePath: string, localPath: string): Promise<void> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    await this.connectionLease.connection.downloadSftpFile(remotePath, localPath);
  }

  async uploadSftpFiles(remotePath: string, localPaths: string[]): Promise<number> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    return this.connectionLease.connection.uploadSftpFiles(remotePath, localPaths);
  }

  private async connect(): Promise<void> {
    this.connectionLease = await this.connectionPool.acquire(this.ssh, (data) => {
      this.emitData(data);
    });

    try {
      const stream = await this.connectionLease.connection.openShell({
        cols: this.cols,
        rows: this.rows,
        x11: this.ssh.x11,
      });

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
        void this.releaseConnectionLease();
        this.emitExit(this.pendingExit ?? { exitCode: 0 });
      });

      this.initializeRemoteShell();
    } catch (error) {
      await this.releaseConnectionLease();
      throw error;
    }
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

  private async releaseConnectionLease(): Promise<void> {
    if (!this.connectionLease) {
      return;
    }

    const lease = this.connectionLease;
    this.connectionLease = null;
    await lease.release();
  }
}

function toUtf8(value: Buffer | string): string {
  return typeof value === 'string' ? value : value.toString('utf8');
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
