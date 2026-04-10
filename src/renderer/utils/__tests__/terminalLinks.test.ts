import type { Terminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';
import {
  createTerminalLinkHandler,
  createTerminalWebLinkProvider,
  sanitizeTerminalHttpUrl,
} from '../terminalLinks';

interface MockLine {
  text: string;
  isWrapped?: boolean;
}

function createMockTerminal(cols: number, lines: MockLine[]): Pick<Terminal, 'cols' | 'buffer'> {
  return {
    cols,
    buffer: {
      active: {
        getLine: (index: number) => {
          const line = lines[index];
          if (!line) {
            return undefined;
          }

          return {
            isWrapped: Boolean(line.isWrapped),
            getCell: (column: number) => {
              if (column >= cols) {
                return undefined;
              }

              const chars = line.text[column] ?? '';
              return {
                getWidth: () => 1,
                getChars: () => chars,
              };
            },
          };
        },
        getNullCell: () => ({
          getWidth: () => 1,
          getChars: () => '',
        }),
      },
    },
  } as unknown as Pick<Terminal, 'cols' | 'buffer'>;
}

describe('terminalLinks', () => {
  it('sanitizes terminal URLs without accepting non-http protocols', () => {
    expect(sanitizeTerminalHttpUrl('https://example.com/docs).')).toBe('https://example.com/docs');
    expect(sanitizeTerminalHttpUrl('http://example.com/path,')).toBe('http://example.com/path');
    expect(sanitizeTerminalHttpUrl('javascript:alert(1)')).toBeNull();
  });

  it('detects wrapped terminal URLs across multiple buffer lines', () => {
    const terminal = createMockTerminal(10, [
      { text: 'https://ex' },
      { text: 'ample.com/', isWrapped: true },
      { text: 'docs', isWrapped: true },
    ]);
    const provider = createTerminalWebLinkProvider(terminal, vi.fn());
    const callback = vi.fn();

    provider.provideLinks(2, callback);

    const links = callback.mock.calls[0]?.[0];
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe('https://example.com/docs');
    expect(links[0].range).toEqual({
      start: { x: 1, y: 1 },
      end: { x: 4, y: 3 },
    });
  });

  it('routes link activation through the external opener only for sanitized http urls', async () => {
    const openExternalUrl = vi.fn().mockResolvedValue(undefined);
    const handler = createTerminalLinkHandler(openExternalUrl);

    handler.activate(new MouseEvent('mouseup'), 'https://example.com/docs).');
    await Promise.resolve();

    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/docs');

    handler.activate(new MouseEvent('mouseup'), 'file:///etc/hosts');
    await Promise.resolve();

    expect(openExternalUrl).toHaveBeenCalledTimes(1);
  });
});
