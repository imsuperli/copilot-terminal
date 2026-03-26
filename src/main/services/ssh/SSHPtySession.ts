import type { ClientChannel } from 'ssh2';
import { StringDecoder } from 'string_decoder';
import { IPty, SSHSessionConfig } from '../../types/process';
import { ActiveSSHPortForward, ForwardedPortConfig, SSHSftpDirectoryListing, SSHSessionMetrics } from '../../../shared/types/ssh';
import type { ISSHConnectionPool, SSHConnectionPoolLease } from './SSHConnectionPool';

export interface SSHPtySessionOptions {
  pid: number;
  ssh: SSHSessionConfig;
  connectionPool: ISSHConnectionPool;
  initialCols?: number;
  initialRows?: number;
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
  private readonly stdoutDecoder: StringDecoder;
  private readonly stderrDecoder: StringDecoder;
  private pendingExit: ExitEvent | null;
  private closed: boolean;
  private shellInitializationTimer: ReturnType<typeof setTimeout> | null;
  private shellInitialized: boolean;

  private constructor(options: SSHPtySessionOptions) {
    this.pid = options.pid;
    this.cols = Math.max(options.initialCols ?? 120, 1);
    this.rows = Math.max(options.initialRows ?? 30, 1);
    this.process = `ssh:${options.ssh.user}@${options.ssh.host}`;
    this.handleFlowControl = false;
    this.ssh = options.ssh;
    this.connectionPool = options.connectionPool;
    this.channel = null;
    this.connectionLease = null;
    this.stdoutDecoder = new StringDecoder('utf8');
    this.stderrDecoder = new StringDecoder('utf8');
    this.pendingExit = null;
    this.closed = false;
    this.shellInitializationTimer = null;
    this.shellInitialized = false;
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
    this.clearShellInitializationTimer();

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

  async getSSHSessionMetrics(path?: string): Promise<SSHSessionMetrics> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    return this.connectionLease.connection.getSessionMetrics(path);
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

  async uploadSftpDirectory(remotePath: string, localDirectoryPath: string): Promise<number> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    return this.connectionLease.connection.uploadSftpDirectory(remotePath, localDirectoryPath);
  }

  async downloadSftpDirectory(remotePath: string, localPath: string): Promise<void> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    await this.connectionLease.connection.downloadSftpDirectory(remotePath, localPath);
  }

  async createSftpDirectory(parentPath: string, name: string): Promise<string> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    return this.connectionLease.connection.createSftpDirectory(parentPath, name);
  }

  async deleteSftpEntry(remotePath: string): Promise<void> {
    if (!this.connectionLease) {
      throw new Error(`SSH connection is not active for ${this.process}`);
    }

    await this.connectionLease.connection.deleteSftpEntry(remotePath);
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
        const decoded = decodeChunk(data, this.stdoutDecoder);
        if (decoded) {
          this.emitData(decoded);
          this.scheduleInitializeRemoteShell(40);
        }
      });
      stream.stderr?.on('data', (data: Buffer | string) => {
        const decoded = decodeChunk(data, this.stderrDecoder);
        if (decoded) {
          this.emitData(decoded);
          this.scheduleInitializeRemoteShell(40);
        }
      });
      stream.on('exit', (code?: number, signal?: number | string) => {
        this.emitExit({
          exitCode: typeof code === 'number' ? code : 0,
          signal: typeof signal === 'number' ? signal : undefined,
        });
      });
      stream.on('close', () => {
        this.clearShellInitializationTimer();
        this.flushDecoder(this.stdoutDecoder);
        this.flushDecoder(this.stderrDecoder);
        this.channel = null;
        void this.releaseConnectionLease();
        this.emitExit(this.pendingExit ?? { exitCode: 0 });
      });

      this.scheduleInitializeRemoteShell(150);
    } catch (error) {
      await this.releaseConnectionLease();
      throw error;
    }
  }

  private scheduleInitializeRemoteShell(delayMs: number): void {
    if (!this.channel || this.shellInitialized || !hasShellInitialization(this.ssh)) {
      return;
    }

    this.clearShellInitializationTimer();
    this.shellInitializationTimer = setTimeout(() => {
      this.shellInitializationTimer = null;
      this.initializeRemoteShell();
    }, delayMs);
  }

  private clearShellInitializationTimer(): void {
    if (!this.shellInitializationTimer) {
      return;
    }

    clearTimeout(this.shellInitializationTimer);
    this.shellInitializationTimer = null;
  }

  private initializeRemoteShell(): void {
    if (!this.channel || this.shellInitialized) {
      return;
    }

    const commands = buildShellInitializationCommands(this.ssh);

    if (commands.length > 0) {
      this.shellInitialized = true;
      this.channel.write(`${commands.join('\r')}\r`);
    }
  }

  private flushDecoder(decoder: StringDecoder): void {
    const remainder = decoder.end();
    if (remainder) {
      this.emitData(remainder);
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

function decodeChunk(value: Buffer | string, decoder: StringDecoder): string {
  return typeof value === 'string' ? value : decoder.write(value);
}

function hasShellInitialization(ssh: SSHSessionConfig): boolean {
  return Boolean(ssh.remoteCwd?.trim() || ssh.command?.trim());
}

function buildShellInitializationCommands(ssh: SSHSessionConfig): string[] {
  const commands: string[] = [];
  const remoteCwd = normalizeRemoteCwdForShellInitialization(ssh.remoteCwd);
  const startupCommand = ssh.command?.trim();

  if (remoteCwd) {
    commands.push(`cd -- ${formatRemoteCdTarget(remoteCwd)}`);
  }

  if (startupCommand) {
    commands.push(startupCommand);
  }

  return commands;
}

function normalizeRemoteCwdForShellInitialization(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  let normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  normalized = unwrapBalancedQuotes(normalized);
  if (!normalized || normalized === '~') {
    return undefined;
  }

  return normalized;
}

function formatRemoteCdTarget(value: string): string {
  const tildeMatch = /^(~[^/]*)(?:\/(.*))?$/.exec(value);
  if (!tildeMatch) {
    return shellEscape(value);
  }

  const [, homeRef, remainder] = tildeMatch;
  if (remainder === undefined) {
    return homeRef;
  }

  if (remainder.length === 0) {
    return `${homeRef}/`;
  }

  return `${homeRef}/${shellDoubleQuote(remainder)}`;
}

function shellDoubleQuote(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function unwrapBalancedQuotes(value: string): string {
  const quote = value[0];
  if ((quote === '\'' || quote === '"') && value[value.length - 1] === quote) {
    return value.slice(1, -1).trim();
  }

  return value;
}
