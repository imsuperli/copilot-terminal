import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  SSHZmodemController,
  receiveZmodemOfferToPath,
  sendZmodemFilesFromPaths,
} from '../ssh/SSHZmodemController';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitUntil(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out while waiting for assertion');
}

describe('SSHZmodemController', () => {
  it('preserves split utf8 bytes when passing normal terminal output through the sentry', () => {
    const terminalChunks: string[] = [];

    const controller = new SSHZmodemController({
      emitTerminalData: (data) => {
        terminalChunks.push(data);
      },
      writeToChannel: vi.fn(),
      createSentry: (options) => ({
        consume: () => {
          options.to_terminal(Uint8Array.from([0xe4, 0xbd]));
          options.to_terminal(Uint8Array.from([0xa0]));
        },
      }),
    });

    controller.consume(Buffer.from('ignored'));

    expect(terminalChunks).toEqual(['你']);
  });

  it('closes a send session when the user cancels file selection', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const session = {
      type: 'send' as const,
      on: vi.fn(),
      abort: vi.fn(),
      close,
      send_offer: vi.fn(),
    };

    const controller = new SSHZmodemController({
      emitTerminalData: vi.fn(),
      writeToChannel: vi.fn(),
      selectSendFiles: vi.fn().mockResolvedValue(null),
      createSentry: (options) => ({
        consume: () => {
          options.on_detect({
            confirm: () => session,
            deny: vi.fn(),
            is_valid: () => true,
          });
        },
      }),
    });

    controller.consume(Buffer.from('ignored'));
    await flushPromises();
    await flushPromises();

    expect(close).toHaveBeenCalledOnce();
    expect(session.send_offer).not.toHaveBeenCalled();
  });

  it('saves received files to the chosen path during a receive session', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'synapse-zmodem-'));
    const filePath = path.join(tempDir, 'remote.bin');
    let offerHandler: ((offer: unknown) => void) | null = null;

    const offer = {
      get_details: () => ({ name: 'remote.bin' }),
      accept: vi.fn().mockResolvedValue([
        Uint8Array.from([0x41, 0x42]),
        Uint8Array.from([0x43]),
      ]),
      skip: vi.fn(),
    };

    const session = {
      type: 'receive' as const,
      on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
        if (eventName === 'offer') {
          offerHandler = handler as (offer: unknown) => void;
        }
      }),
      start: vi.fn(() => {
        return offerHandler?.(offer);
      }),
      abort: vi.fn(),
    };

    const controller = new SSHZmodemController({
      emitTerminalData: vi.fn(),
      writeToChannel: vi.fn(),
      chooseSavePath: vi.fn().mockResolvedValue(filePath),
      createSentry: (options) => ({
        consume: () => {
          options.on_detect({
            confirm: () => session,
            deny: vi.fn(),
            is_valid: () => true,
          });
        },
      }),
    });

    controller.consume(Buffer.from('ignored'));
    await flushPromises();
    await flushPromises();

    await waitUntil(() => {
      expect(readFileSync(filePath)).toEqual(Buffer.from([0x41, 0x42, 0x43]));
    });
    expect(offer.accept).toHaveBeenCalled();
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('sendZmodemFilesFromPaths', () => {
  it('streams file content from the accepted offset and preserves metadata', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'synapse-zmodem-'));
    const filePath = path.join(tempDir, 'payload.bin');
    const content = Buffer.alloc(9000);
    for (let index = 0; index < content.length; index += 1) {
      content[index] = index % 251;
    }
    writeFileSync(filePath, content);

    const transferredChunks: Buffer[] = [];
    const transfer = {
      get_offset: vi.fn().mockReturnValue(100),
      send: vi.fn((chunk: Uint8Array) => {
        transferredChunks.push(Buffer.from(chunk));
      }),
      end: vi.fn(async (chunk?: Uint8Array) => {
        if (chunk) {
          transferredChunks.push(Buffer.from(chunk));
        }
      }),
    };

    const session = {
      send_offer: vi.fn().mockResolvedValue(transfer),
    };

    await sendZmodemFilesFromPaths(session as any, [filePath]);

    expect(session.send_offer).toHaveBeenCalledWith(expect.objectContaining({
      name: 'payload.bin',
      size: content.length,
      files_remaining: 1,
      bytes_remaining: content.length,
    }));
    expect(Buffer.concat(transferredChunks)).toEqual(content.subarray(100));
    expect(transfer.send).toHaveBeenCalled();
    expect(transfer.end).toHaveBeenCalledOnce();

    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('receiveZmodemOfferToPath', () => {
  it('writes accepted payloads to disk', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'synapse-zmodem-'));
    const filePath = path.join(tempDir, 'received.bin');
    const offer = {
      accept: vi.fn().mockResolvedValue([
        Uint8Array.from([0x01, 0x02]),
        Uint8Array.from([0x03, 0x04]),
      ]),
    };

    await receiveZmodemOfferToPath(offer as any, filePath);

    expect(readFileSync(filePath)).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]));
    rmSync(tempDir, { recursive: true, force: true });
  });
});
