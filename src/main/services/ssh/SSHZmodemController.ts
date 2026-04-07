import { createReadStream } from 'fs';
import { stat, writeFile } from 'fs/promises';
import { basename } from 'path';
import { StringDecoder } from 'string_decoder';
import type { ZmodemDialogHandlers } from '../../types/process';

type ZmodemOctets = ArrayLike<number>;

export type ZmodemSentryOptions = {
  to_terminal: (octets: ZmodemOctets) => void;
  sender: (octets: ZmodemOctets) => void;
  on_detect: (detection: ZmodemDetection) => void;
  on_retract: () => void;
};

export type ZmodemSentry = {
  consume: (input: Uint8Array) => void;
};

export type ZmodemDetection = {
  confirm: () => ZmodemSession;
  deny: () => void;
  is_valid: () => boolean;
};

type ZmodemSession = ZmodemSendSession | ZmodemReceiveSession;

type ZmodemSessionBase = {
  type: 'send' | 'receive';
  on: (eventName: 'offer' | 'session_end', handler: (...args: unknown[]) => void) => unknown;
  abort?: () => void;
};

export type ZmodemSendSession = ZmodemSessionBase & {
  type: 'send';
  send_offer: (params: ZmodemOfferParams) => Promise<ZmodemTransfer | undefined>;
  close: () => Promise<void>;
};

export type ZmodemReceiveSession = ZmodemSessionBase & {
  type: 'receive';
  start: () => Promise<unknown> | unknown;
};

export type ZmodemTransfer = {
  get_offset: () => number;
  send: (payload: Uint8Array) => void;
  end: (payload?: Uint8Array) => Promise<void>;
};

export type ZmodemOffer = {
  get_details: () => { name?: string };
  accept: (options?: {
    on_input?: 'spool_uint8array' | 'spool_array' | ((payload: Uint8Array) => void);
  }) => Promise<Uint8Array[]>;
  skip: () => Promise<void> | void;
};

type ZmodemOfferParams = {
  name: string;
  size: number;
  mtime: Date;
  mode: number;
  files_remaining: number;
  bytes_remaining: number;
};

type ZmodemModule = {
  Sentry: new (options: ZmodemSentryOptions) => ZmodemSentry;
};

const Zmodem = require('zmodem.js') as ZmodemModule;

export interface SSHZmodemControllerOptions extends ZmodemDialogHandlers {
  emitTerminalData: (data: string) => void;
  writeToChannel: (data: Buffer) => void;
  createSentry?: (options: ZmodemSentryOptions) => ZmodemSentry;
  logger?: Pick<Console, 'error'>;
  now?: () => number;
  receiveCloseRecoveryWindowMs?: number;
}

export class SSHZmodemController {
  private readonly decoder = new StringDecoder('utf8');
  private readonly sentry: ZmodemSentry;
  private readonly logger: Pick<Console, 'error'>;
  private readonly now: () => number;
  private readonly receiveCloseRecoveryWindowMs: number;
  private activeSession: ZmodemSession | null = null;
  private lastSuccessfulReceiveAt: number | null = null;
  private destroyed = false;

  constructor(private readonly options: SSHZmodemControllerOptions) {
    this.logger = options.logger ?? console;
    this.now = options.now ?? (() => Date.now());
    this.receiveCloseRecoveryWindowMs = Math.max(options.receiveCloseRecoveryWindowMs ?? 1000, 0);

    const createSentry = options.createSentry ?? ((sentryOptions: ZmodemSentryOptions) => new Zmodem.Sentry(sentryOptions));
    this.sentry = createSentry({
      to_terminal: (octets) => this.emitTerminalBytes(octets),
      sender: (octets) => this.options.writeToChannel(Buffer.from(octets)),
      on_detect: (detection) => {
        void this.handleDetection(detection);
      },
      on_retract: () => {
        // 误判回退时继续按普通终端流处理即可。
      },
    });
  }

  consume(chunk: Buffer | string): void {
    if (this.destroyed) {
      return;
    }

    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    if (buffer.length === 0) {
      return;
    }

    this.sentry.consume(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  }

  flush(): void {
    if (this.destroyed) {
      return;
    }

    const remainder = this.decoder.end();
    if (remainder) {
      this.options.emitTerminalData(remainder);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    try {
      this.activeSession?.abort?.();
    } catch {
      // 关闭 SSH 会话时无需再传播协议层异常。
    }

    const remainder = this.decoder.end();
    if (remainder) {
      this.options.emitTerminalData(remainder);
    }

    this.destroyed = true;
    this.activeSession = null;
    this.lastSuccessfulReceiveAt = null;
  }

  shouldRecoverShellAfterUnexpectedClose(): boolean {
    if (this.destroyed || this.lastSuccessfulReceiveAt === null) {
      return false;
    }

    return (this.now() - this.lastSuccessfulReceiveAt) <= this.receiveCloseRecoveryWindowMs;
  }

  private emitTerminalBytes(octets: ZmodemOctets): void {
    const decoded = this.decoder.write(Buffer.from(octets));
    if (decoded) {
      this.options.emitTerminalData(decoded);
    }
  }

  private async handleDetection(detection: ZmodemDetection): Promise<void> {
    if (this.destroyed || !detection.is_valid()) {
      detection.deny();
      return;
    }

    const session = detection.confirm();
    this.activeSession = session;
    session.on('session_end', () => {
      if (this.activeSession === session) {
        this.activeSession = null;
      }
    });

    try {
      if (session.type === 'send') {
        await this.handleSendSession(session);
        return;
      }

      this.handleReceiveSession(session);
    } catch (error) {
      this.handleTransferError(session, error);
    }
  }

  private async handleSendSession(session: ZmodemSendSession): Promise<void> {
    const filePaths = await this.options.selectSendFiles?.() ?? null;
    if (!filePaths || filePaths.length === 0) {
      await closeSessionQuietly(session);
      return;
    }

    await sendZmodemFilesFromPaths(session, filePaths);
    await closeSessionQuietly(session);
  }

  private handleReceiveSession(session: ZmodemReceiveSession): void {
    session.on('offer', (offer: unknown) => {
      return this.handleReceiveOffer(session, offer as ZmodemOffer);
    });

    try {
      const startResult = session.start();
      Promise.resolve(startResult).catch((error) => {
        this.handleTransferError(session, error);
      });
    } catch (error) {
      this.handleTransferError(session, error);
    }
  }

  private async handleReceiveOffer(session: ZmodemReceiveSession, offer: ZmodemOffer): Promise<void> {
    const suggestedName = offer.get_details().name?.trim() || 'download';
    const filePath = await this.options.chooseSavePath?.(suggestedName) ?? null;
    if (!filePath) {
      await Promise.resolve(offer.skip());
      return;
    }

    try {
      await receiveZmodemOfferToPath(offer, filePath);
      this.lastSuccessfulReceiveAt = this.now();
    } catch (error) {
      this.handleTransferError(session, error);
    }
  }

  private handleTransferError(session: ZmodemSession, error: unknown): void {
    this.logger.error('[SSHZmodemController] Transfer failed:', error);

    try {
      session.abort?.();
    } catch {
      // 传输失败时 abort 只是兜底，不应再引发额外异常。
    }
  }
}

export async function sendZmodemFilesFromPaths(
  session: ZmodemSendSession,
  filePaths: string[],
): Promise<void> {
  const fileEntries = await Promise.all(filePaths.map(async (filePath) => {
    const fileStat = await stat(filePath);
    return {
      filePath,
      name: basename(filePath),
      size: fileStat.size,
      mtime: fileStat.mtime,
      mode: fileStat.mode,
    };
  }));

  let bytesRemaining = fileEntries.reduce((total, entry) => total + entry.size, 0);

  for (let index = 0; index < fileEntries.length; index += 1) {
    const entry = fileEntries[index];
    const transfer = await session.send_offer({
      name: entry.name,
      size: entry.size,
      mtime: entry.mtime,
      mode: entry.mode,
      files_remaining: fileEntries.length - index,
      bytes_remaining: bytesRemaining,
    });

    bytesRemaining -= entry.size;

    if (!transfer) {
      continue;
    }

    await streamFileToTransfer(entry.filePath, entry.size, transfer);
  }
}

export async function receiveZmodemOfferToPath(offer: ZmodemOffer, filePath: string): Promise<void> {
  const payloads = await offer.accept();
  const buffers = payloads.map((payload) => Buffer.from(payload));
  await writeFile(filePath, Buffer.concat(buffers));
}

async function streamFileToTransfer(
  filePath: string,
  fileSize: number,
  transfer: ZmodemTransfer,
): Promise<void> {
  const offset = Math.max(transfer.get_offset(), 0);
  if (offset >= fileSize) {
    await transfer.end();
    return;
  }

  const stream = createReadStream(filePath, {
    start: offset,
    highWaterMark: 8192,
  });

  let pendingChunk: Buffer | null = null;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (pendingChunk) {
      transfer.send(toUint8Array(pendingChunk));
    }
    pendingChunk = buffer;
  }

  if (pendingChunk) {
    await transfer.end(toUint8Array(pendingChunk));
    return;
  }

  await transfer.end();
}

async function closeSessionQuietly(session: ZmodemSendSession): Promise<void> {
  try {
    await session.close();
  } catch {
    session.abort?.();
  }
}

function toUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
