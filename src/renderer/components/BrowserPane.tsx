import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, GripVertical, RefreshCw, X } from 'lucide-react';
import type { Pane } from '../types/window';
import { AppTooltip } from './ui/AppTooltip';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { DEFAULT_BROWSER_URL, normalizeBrowserInput } from '../utils/browserPane';
import { logBrowserDnd } from '../utils/browserDndDebug';
import { isAllowedBrowserUrl, sanitizeBrowserUrl } from '../../shared/utils/browserUrls';
import { preventMouseButtonFocus } from '../utils/buttonFocus';
import {
  idePopupIconButtonClassName,
  idePopupInputClassName,
  idePopupSubtlePanelClassName,
} from './ui/ide-popup';

const BROWSER_PARTITION = 'persist:copilot-terminal-browser';
const BROWSER_WEBVIEW_CLASSNAME = 'min-h-0 min-w-0 flex-1 bg-[var(--appearance-pane-background-strong)]';

function normalizeRgbChannels(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').replace(/,\s*/g, ', ').trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes(',')) {
    return normalized;
  }

  const parts = normalized.split(' ').filter(Boolean);
  return parts.length >= 3 ? parts.slice(0, 3).join(', ') : null;
}

function readResolvedCssColor(
  propertyName: 'color' | 'backgroundColor',
  cssValue: string,
): string | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.pointerEvents = 'none';
  probe.style.opacity = '0';
  probe.style[propertyName] = cssValue;
  document.body.appendChild(probe);

  const resolved = window.getComputedStyle(probe)[propertyName];
  probe.remove();

  if (!resolved || resolved.includes('var(')) {
    return null;
  }

  return resolved.trim();
}

function resolveBlankPageBackground(style: CSSStyleDeclaration): string {
  const resolved = readResolvedCssColor('backgroundColor', 'var(--appearance-pane-background-strong)');
  if (resolved) {
    return resolved;
  }

  const rawPaneBackground = style.getPropertyValue('--appearance-pane-background-strong').trim();
  const terminalBackgroundRgb = normalizeRgbChannels(style.getPropertyValue('--terminal-background-rgb'));
  if (rawPaneBackground && terminalBackgroundRgb && rawPaneBackground.includes('--terminal-background-rgb')) {
    const alphaMatch = rawPaneBackground.match(/,\s*([0-9.]+)\)$/);
    const alpha = alphaMatch?.[1] ?? '1';
    return `rgba(${terminalBackgroundRgb}, ${alpha})`;
  }

  const fallbackBackgroundRgb = normalizeRgbChannels(style.getPropertyValue('--background'));
  return fallbackBackgroundRgb ? `rgb(${fallbackBackgroundRgb})` : 'rgb(9, 9, 11)';
}

function resolveBlankPageForeground(style: CSSStyleDeclaration): string {
  const resolved = readResolvedCssColor('color', 'rgb(var(--foreground))');
  if (resolved) {
    return resolved;
  }

  const foregroundRgb = normalizeRgbChannels(style.getPropertyValue('--foreground'));
  return foregroundRgb ? `rgb(${foregroundRgb})` : 'rgb(212, 212, 216)';
}

function getColorSchemeFromColor(color: string): 'light' | 'dark' {
  const channels = color.match(/\d+(?:\.\d+)?/g);
  if (!channels || channels.length < 3) {
    return 'dark';
  }

  const [r, g, b] = channels.slice(0, 3).map(Number);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance >= 0.72 ? 'light' : 'dark';
}

function resolveBlankPageThemeCss(): string {
  if (typeof window === 'undefined') {
    return `
      :root { color-scheme: dark; }
      html, body {
        background: #09090b !important;
        color: #d4d4d8 !important;
      }
    `;
  }

  const style = window.getComputedStyle(document.documentElement);
  const background = resolveBlankPageBackground(style);
  const foreground = resolveBlankPageForeground(style);
  const colorScheme = getColorSchemeFromColor(background);

  return `
    :root { color-scheme: ${colorScheme}; }
    html, body {
      background: ${background} !important;
      color: ${foreground} !important;
    }
  `;
}

function getBrowserPaneUrl(pane: Pane): string {
  return sanitizeBrowserUrl(pane.browser?.url || DEFAULT_BROWSER_URL);
}

export function __resetBrowserPaneWebviewCacheForTests(): void {
  // No-op. BrowserPane no longer moves webviews into a shared parking lot.
}

export interface BrowserPaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
  dragHandleRef?: ((node: HTMLDivElement | null) => void) | null;
  onDragHandleMouseDown?: ((event: React.MouseEvent<HTMLDivElement>) => void) | null;
  consumeDragHandleClick?: (() => boolean) | null;
  isDragging?: boolean;
}

export const BrowserPane: React.FC<BrowserPaneProps> = ({
  windowId,
  pane,
  isActive,
  onActivate,
  onClose,
  dragHandleRef,
  onDragHandleMouseDown,
  consumeDragHandleClick,
  isDragging = false,
}) => {
  const { t } = useI18n();
  const updatePane = useWindowStore((state) => state.updatePane);
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const restoreReadyTimerRef = useRef<number | null>(null);
  const webviewReadyRef = useRef(false);
  const pendingNavigationUrlRef = useRef<string | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const skipNextAutoFocusRef = useRef(false);
  const [inputValue, setInputValue] = useState(() => getBrowserPaneUrl(pane));
  const [currentUrl, setCurrentUrl] = useState(() => getBrowserPaneUrl(pane));
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isWebviewReady, setIsWebviewReady] = useState(false);

  const persistedUrl = useMemo(() => getBrowserPaneUrl(pane), [pane]);
  const persistedUrlRef = useRef(persistedUrl);

  const clearRestoreReadyTimer = useCallback(() => {
    if (restoreReadyTimerRef.current === null) {
      return;
    }

    window.clearTimeout(restoreReadyTimerRef.current);
    restoreReadyTimerRef.current = null;
  }, []);

  const setWebviewReady = useCallback((ready: boolean) => {
    webviewReadyRef.current = ready;
    setIsWebviewReady((currentReady) => (currentReady === ready ? currentReady : ready));
  }, []);

  const resetNavigationState = useCallback(() => {
    setCanGoBack(false);
    setCanGoForward(false);
    setIsLoading(false);
  }, []);

  const applyBlankPageTheme = useCallback((url?: string) => {
    const webview = webviewRef.current;
    if (!webview || !webviewReadyRef.current) {
      return;
    }

    const applyTheme = async () => {
      try {
        const currentWebviewUrl = url ?? webview.getURL?.() ?? DEFAULT_BROWSER_URL;
        if (currentWebviewUrl !== DEFAULT_BROWSER_URL) {
          return;
        }

        await webview.insertCSS(resolveBlankPageThemeCss());
      } catch (error) {
        console.error('Failed to apply blank browser pane theme:', error);
      }
    };

    void applyTheme();
  }, []);

  const syncPaneUrl = useCallback((nextUrl: string) => {
    const normalizedUrl = sanitizeBrowserUrl(nextUrl || DEFAULT_BROWSER_URL);
    const previousUrl = persistedUrlRef.current;

    setCurrentUrl(normalizedUrl);
    setInputValue(normalizedUrl);
    if (previousUrl === normalizedUrl) {
      return;
    }

    persistedUrlRef.current = normalizedUrl;
    updatePane(windowId, pane.id, {
      browser: {
        url: normalizedUrl,
      },
    });
  }, [pane.id, updatePane, windowId]);

  const syncNavigationState = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !webviewReadyRef.current || !document.contains(webview)) {
      return;
    }

    try {
      const nextUrl = webview.getURL?.() || persistedUrlRef.current;
      pendingNavigationUrlRef.current = null;
      syncPaneUrl(nextUrl);
      setCanGoBack(Boolean(webview.canGoBack?.()));
      setCanGoForward(Boolean(webview.canGoForward?.()));
    } catch (error) {
      console.error('Failed to sync browser pane navigation state:', error);
    }
  }, [syncPaneUrl]);

  const restoreReadyWebviewState = useCallback((webview: HTMLWebViewElement) => {
    clearRestoreReadyTimer();
    restoreReadyTimerRef.current = window.setTimeout(() => {
      if (webviewRef.current !== webview || !document.contains(webview)) {
        return;
      }

      setWebviewReady(true);
      applyBlankPageTheme();
      syncNavigationState();
    }, 0);
  }, [applyBlankPageTheme, clearRestoreReadyTimer, setWebviewReady, syncNavigationState]);

  const navigateTo = useCallback((rawValue: string) => {
    const nextUrl = normalizeBrowserInput(rawValue);
    const webview = webviewRef.current;

    syncPaneUrl(nextUrl);

    if (webview) {
      if (!webviewReadyRef.current) {
        pendingNavigationUrlRef.current = nextUrl;
        webview.src = nextUrl;
        return;
      }

      pendingNavigationUrlRef.current = nextUrl;
      void webview.loadURL(nextUrl).catch((error: unknown) => {
        if (
          error instanceof Error
          && error.message.includes('ERR_ABORTED')
          && pendingNavigationUrlRef.current !== nextUrl
        ) {
          return;
        }
        pendingNavigationUrlRef.current = null;
        console.error('Failed to navigate browser pane:', error);
      });
    }
  }, [syncPaneUrl]);

  const goBack = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !webviewReadyRef.current) {
      return;
    }

    try {
      webview.goBack();
    } catch (error) {
      console.error('Failed to navigate back in browser pane:', error);
    }
  }, []);

  const goForward = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !webviewReadyRef.current) {
      return;
    }

    try {
      webview.goForward();
    } catch (error) {
      console.error('Failed to navigate forward in browser pane:', error);
    }
  }, []);

  const reloadPage = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !webviewReadyRef.current) {
      return;
    }

    try {
      webview.reload();
    } catch (error) {
      console.error('Failed to reload browser pane:', error);
    }
  }, []);

  useEffect(() => {
    const nextUrl = persistedUrl;
    persistedUrlRef.current = nextUrl;
    setInputValue(nextUrl);
    setCurrentUrl(nextUrl);
  }, [persistedUrl, pane.id]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    if (skipNextAutoFocusRef.current) {
      skipNextAutoFocusRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      addressInputRef.current?.focus();
      addressInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isActive, pane.id]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return undefined;
    }

    clearRestoreReadyTimer();
    setWebviewReady(false);
    resetNavigationState();

    const handleDomReady = () => {
      restoreReadyWebviewState(webview);
    };
    const handleDidStartLoading = () => {
      setIsLoading(true);
    };
    const handleDidStopLoading = () => {
      setIsLoading(false);
      syncNavigationState();
    };
    const handleDidNavigate = () => {
      syncNavigationState();
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);

    return () => {
      clearRestoreReadyTimer();
      setWebviewReady(false);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
    };
  }, [clearRestoreReadyTimer, pane.id, resetNavigationState, restoreReadyWebviewState, setWebviewReady]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    if (!isWebviewReady) {
      if (webview.getAttribute('src') !== persistedUrl) {
        webview.src = persistedUrl;
      }
      return;
    }

    try {
      const currentWebviewUrl = webview.getURL?.() || DEFAULT_BROWSER_URL;
      if (pendingNavigationUrlRef.current === persistedUrl) {
        return;
      }
      if (currentWebviewUrl !== persistedUrl) {
        pendingNavigationUrlRef.current = persistedUrl;
        void webview.loadURL(persistedUrl).catch((error: unknown) => {
          if (
            error instanceof Error
            && error.message.includes('ERR_ABORTED')
            && pendingNavigationUrlRef.current !== persistedUrl
          ) {
            return;
          }
          pendingNavigationUrlRef.current = null;
          console.error('Failed to sync browser pane URL:', error);
        });
        return;
      }
    } catch (error) {
      console.error('Failed to inspect browser pane URL:', error);
      return;
    }

    syncNavigationState();
  }, [isWebviewReady, persistedUrl, syncNavigationState]);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigateTo(inputValue);
  }, [inputValue, navigateTo]);

  const openCurrentUrlExternally = useCallback(() => {
    if (!currentUrl || currentUrl === DEFAULT_BROWSER_URL || !isAllowedBrowserUrl(currentUrl)) {
      return;
    }

    window.electronAPI?.openExternalUrl(currentUrl).catch((error) => {
      console.error('Failed to open external browser URL:', error);
    });
  }, [currentUrl]);

  const handleRootMouseDownCapture = useCallback(() => {
    skipNextAutoFocusRef.current = true;
    onActivate();
  }, [onActivate]);

  const handleMouseDownCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-browser-drag-handle="true"]')) {
      return;
    }

    handleRootMouseDownCapture();
  }, [handleRootMouseDownCapture]);

  const handleDragHandleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Drag activation already happens in the react-dnd source begin callback.
    // Avoid mutating pane active state here so the native dragstart is not interrupted.
    skipNextAutoFocusRef.current = true;
    logBrowserDnd('handle mousedown', {
      windowId,
      paneId: pane.id,
      isActive,
    });
    onDragHandleMouseDown?.(event);
  }, [isActive, onDragHandleMouseDown, pane.id, windowId]);

  const handleDragHandleClick = useCallback(() => {
    if (consumeDragHandleClick?.()) {
      logBrowserDnd('handle click suppressed after pointer drag', {
        windowId,
        paneId: pane.id,
      });
      return;
    }

    logBrowserDnd('handle click activate', {
      windowId,
      paneId: pane.id,
    });
    onActivate();
  }, [consumeDragHandleClick, onActivate, pane.id, windowId]);
  const browserToolbarButtonClassName =
    'flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-40';
  const browserCloseButtonClassName =
    'flex h-6 w-6 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--muted-foreground))] transition-colors hover:border-red-500/40 hover:bg-red-500/14 hover:text-red-100';

  return (
    <div
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-[rgb(var(--border))] bg-[linear-gradient(180deg,var(--appearance-pane-background-strong)_0%,var(--appearance-pane-background)_100%)] backdrop-blur-[10px]`}
      style={{ opacity: isDragging ? 0.45 : 1 }}
      onMouseDownCapture={handleMouseDownCapture}
    >
      <div className={`flex items-center gap-1 border-b border-[rgb(var(--border))] px-2 py-1.5 ${idePopupSubtlePanelClassName}`}>
        <div
          data-browser-drag-handle="true"
          ref={dragHandleRef ?? undefined}
          onMouseDown={handleDragHandleMouseDown}
          onClick={handleDragHandleClick}
          onDragStart={() => {
            logBrowserDnd('native dragstart', {
              windowId,
              paneId: pane.id,
            });
          }}
          onDragEnd={() => {
            logBrowserDnd('native dragend', {
              windowId,
              paneId: pane.id,
            });
          }}
          className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))] active:cursor-grabbing"
          aria-label={t('browserPane.move')}
          title={t('browserPane.move')}
        >
          <GripVertical size={16} />
        </div>

        <div className="flex items-center gap-1 text-[rgb(var(--muted-foreground))]">
          <AppTooltip content={t('browserPane.back')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('browserPane.back')}
              disabled={!isWebviewReady || !canGoBack}
              onMouseDown={preventMouseButtonFocus}
              onClick={goBack}
              className={browserToolbarButtonClassName}
            >
              <ArrowLeft size={15} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('browserPane.forward')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('browserPane.forward')}
              disabled={!isWebviewReady || !canGoForward}
              onMouseDown={preventMouseButtonFocus}
              onClick={goForward}
              className={browserToolbarButtonClassName}
            >
              <ArrowRight size={15} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('browserPane.refresh')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('browserPane.refresh')}
              disabled={!isWebviewReady}
              onMouseDown={preventMouseButtonFocus}
              onClick={reloadPage}
              className={`${browserToolbarButtonClassName} ${isLoading ? 'animate-spin text-[rgb(var(--primary))]' : ''}`}
            >
              <RefreshCw size={15} />
            </button>
          </AppTooltip>
        </div>

        <form className="min-w-0 flex-1" onSubmit={handleSubmit}>
          <label className={`${idePopupInputClassName} flex h-7 items-center gap-2 rounded-md px-2 py-0 text-[rgb(var(--foreground))] focus-within:border-[rgb(var(--ring))]/60 focus-within:ring-0`}>
            <Globe size={13} className="shrink-0 text-[rgb(var(--muted-foreground))]" />
            <input
              ref={addressInputRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              aria-label={t('browserPane.address')}
              placeholder={t('browserPane.addressPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[rgb(var(--muted-foreground))]"
            />
          </label>
        </form>

        <div className="flex items-center gap-1 text-[rgb(var(--muted-foreground))]">
          <AppTooltip content={t('browserPane.openExternal')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('browserPane.openExternal')}
              onMouseDown={preventMouseButtonFocus}
              onClick={openCurrentUrlExternally}
              className={browserToolbarButtonClassName}
            >
              <ExternalLink size={13} />
            </button>
          </AppTooltip>

          {onClose && (
            <AppTooltip content={t('terminalPane.close')} placement="pane-corner">
              <button
                type="button"
                tabIndex={-1}
                aria-label={t('terminalPane.close')}
                onMouseDown={preventMouseButtonFocus}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
                className={`${browserCloseButtonClassName} ${idePopupIconButtonClassName}`}
              >
                <X size={13} />
              </button>
            </AppTooltip>
          )}
        </div>
      </div>

      <webview
        ref={(element) => {
          webviewRef.current = element;
        }}
        src={persistedUrl}
        partition={BROWSER_PARTITION}
        className={BROWSER_WEBVIEW_CLASSNAME}
      />
    </div>
  );
};

BrowserPane.displayName = 'BrowserPane';
