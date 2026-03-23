import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetTerminalFontCacheForTests,
  ensureTerminalFontsLoaded,
  TERMINAL_FONT_FAMILY,
} from '../terminalFonts';

describe('terminalFonts', () => {
  beforeEach(() => {
    __resetTerminalFontCacheForTests();
  });

  it('keeps Symbols Nerd Font Mono in the terminal fallback chain', () => {
    expect(TERMINAL_FONT_FAMILY).toContain('"Symbols Nerd Font Mono"');
  });

  it('loads bundled nerd glyphs once when the FontFaceSet API is available', async () => {
    const load = vi.fn().mockResolvedValue([]);

    Object.defineProperty(document, 'fonts', {
      value: { load },
      configurable: true,
    });

    await ensureTerminalFontsLoaded();
    await ensureTerminalFontsLoaded();

    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenNthCalledWith(1, '15px "Symbols Nerd Font Mono"', '\ue0b0');
    expect(load).toHaveBeenNthCalledWith(2, '15px "Symbols Nerd Font Mono"', '\ue0a0');
  });

  it('becomes a no-op when document.fonts is unavailable', async () => {
    Object.defineProperty(document, 'fonts', {
      value: undefined,
      configurable: true,
    });

    await expect(ensureTerminalFontsLoaded()).resolves.toBeUndefined();
  });
});
