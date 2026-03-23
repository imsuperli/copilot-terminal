export const TERMINAL_FONT_FAMILY = [
  '"MesloLGS NF"',
  '"JetBrainsMono Nerd Font"',
  '"Symbols Nerd Font Mono"',
  '"CaskaydiaCove Nerd Font"',
  '"SF Mono"',
  '"Menlo"',
  '"Cascadia Code"',
  '"Fira Code"',
  '"Consolas"',
  '"Courier New"',
  'monospace',
].join(', ');

let terminalFontLoadPromise: Promise<void> | null = null;

export function __resetTerminalFontCacheForTests(): void {
  terminalFontLoadPromise = null;
}

export function ensureTerminalFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) {
    return Promise.resolve();
  }

  if (!terminalFontLoadPromise) {
    const loadAttempts = [
      document.fonts.load('15px "Symbols Nerd Font Mono"', '\ue0b0'),
      document.fonts.load('15px "Symbols Nerd Font Mono"', '\ue0a0'),
    ];

    terminalFontLoadPromise = Promise.race([
      Promise.allSettled(loadAttempts).then(() => undefined),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1500);
      }),
    ]);
  }

  return terminalFontLoadPromise;
}
