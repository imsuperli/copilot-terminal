import type { Terminal } from '@xterm/xterm';

export interface ImeCompositionState {
  isComposing: boolean;
}

type CompositionHelperLike = {
  updateCompositionElements?: (dontRecurse?: boolean) => void;
};

type RenderServiceLike = {
  _renderRows?: (start: number, end: number) => void;
};

type XtermCoreLike = {
  _compositionHelper?: CompositionHelperLike;
  _renderService?: RenderServiceLike;
};

type TerminalWithInternals = Terminal & {
  _core?: XtermCoreLike;
};

export function installTerminalImeFix(
  terminal: Terminal,
  compositionState: ImeCompositionState,
): () => void {
  const textarea = terminal.textarea;
  if (!textarea) {
    return () => {
      compositionState.isComposing = false;
    };
  }

  const core = (terminal as TerminalWithInternals)._core;
  const renderService = core?._renderService;
  const compositionHelper = core?._compositionHelper;

  let originalRenderRows: ((start: number, end: number) => void) | null = null;
  let originalUpdateCompositionElements: ((dontRecurse?: boolean) => void) | null = null;
  let hasAllowedInitialCompositionAnchorUpdate = false;

  const restoreRenderRows = () => {
    if (renderService && originalRenderRows) {
      renderService._renderRows = originalRenderRows;
    }
    originalRenderRows = null;
  };

  const restoreCompositionHelper = () => {
    if (compositionHelper && originalUpdateCompositionElements) {
      compositionHelper.updateCompositionElements = originalUpdateCompositionElements;
    }
    originalUpdateCompositionElements = null;
    hasAllowedInitialCompositionAnchorUpdate = false;
  };

  const handleCompositionStart = () => {
    compositionState.isComposing = true;
    hasAllowedInitialCompositionAnchorUpdate = false;

    if (renderService?._renderRows && !originalRenderRows) {
      originalRenderRows = renderService._renderRows;
      renderService._renderRows = () => {};
    }

    if (compositionHelper?.updateCompositionElements && !originalUpdateCompositionElements) {
      originalUpdateCompositionElements = compositionHelper.updateCompositionElements.bind(compositionHelper);
      compositionHelper.updateCompositionElements = (dontRecurse?: boolean) => {
        if (!compositionState.isComposing) {
          originalUpdateCompositionElements?.(dontRecurse);
          return;
        }

        if (!hasAllowedInitialCompositionAnchorUpdate) {
          hasAllowedInitialCompositionAnchorUpdate = true;
          originalUpdateCompositionElements?.(dontRecurse);
        }
      };
    }
  };

  const handleCompositionEnd = () => {
    const shouldRefresh = compositionState.isComposing;
    compositionState.isComposing = false;
    restoreCompositionHelper();
    restoreRenderRows();

    if (shouldRefresh) {
      requestAnimationFrame(() => {
        if (typeof terminal.refresh === 'function' && terminal.rows > 0) {
          terminal.refresh(0, terminal.rows - 1);
        }
      });
    }
  };

  textarea.addEventListener('compositionstart', handleCompositionStart);
  textarea.addEventListener('compositionend', handleCompositionEnd);
  textarea.addEventListener('compositioncancel', handleCompositionEnd);
  textarea.addEventListener('blur', handleCompositionEnd);

  return () => {
    textarea.removeEventListener('compositionstart', handleCompositionStart);
    textarea.removeEventListener('compositionend', handleCompositionEnd);
    textarea.removeEventListener('compositioncancel', handleCompositionEnd);
    textarea.removeEventListener('blur', handleCompositionEnd);
    handleCompositionEnd();
  };
}
