import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTerminalImeFix, type ImeCompositionState } from '../terminalImeFix';

describe('installTerminalImeFix', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    if (originalRequestAnimationFrame) {
      vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame);
    }
    vi.restoreAllMocks();
  });

  it('blocks render churn during composition and restores xterm internals afterwards', () => {
    const textarea = document.createElement('textarea');
    const originalRenderRows = vi.fn();
    const originalUpdateCompositionElements = vi.fn();
    const refresh = vi.fn();
    const compositionState: ImeCompositionState = { isComposing: false };

    const terminal = {
      textarea,
      rows: 24,
      refresh,
      _core: {
        _renderService: {
          _renderRows: originalRenderRows,
        },
        _compositionHelper: {
          updateCompositionElements: originalUpdateCompositionElements,
        },
      },
    } as any;

    const dispose = installTerminalImeFix(terminal, compositionState);

    textarea.dispatchEvent(new Event('compositionstart'));

    expect(compositionState.isComposing).toBe(true);

    terminal._core._renderService._renderRows(0, 10);
    terminal._core._compositionHelper.updateCompositionElements();
    terminal._core._compositionHelper.updateCompositionElements();

    expect(originalRenderRows).not.toHaveBeenCalled();
    expect(originalUpdateCompositionElements).toHaveBeenCalledTimes(1);

    textarea.dispatchEvent(new Event('compositionend'));

    expect(compositionState.isComposing).toBe(false);

    terminal._core._renderService._renderRows(0, 10);
    terminal._core._compositionHelper.updateCompositionElements();

    expect(originalRenderRows).toHaveBeenCalledTimes(1);
    expect(originalUpdateCompositionElements).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledWith(0, 23);

    dispose();
  });
});
