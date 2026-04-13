import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, GripVertical, RefreshCw, X } from 'lucide-react';
import type { Pane } from '../types/window';
import { AppTooltip } from './ui/AppTooltip';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { DEFAULT_BROWSER_URL, normalizeBrowserInput } from '../utils/browserPane';
import {
  getBrowserDropDragActive,
  subscribeBrowserDropDragActive,
} from '../utils/browserDropDragState';
import { logBrowserDnd } from '../utils/browserDndDebug';
import { isAllowedBrowserUrl, sanitizeBrowserUrl } from '../../shared/utils/browserUrls';
import { preventMouseButtonFocus } from '../utils/buttonFocus';

const BROWSER_PARTITION = 'persist:copilot-terminal-browser';
const BROWSER_WEBVIEW_CLASSNAME = 'block min-h-0 min-w-0 bg-zinc-950';
const BLANK_PAGE_THEME_CSS = `
  :root { color-scheme: dark; }
  html, body {
    background: #09090b !important;
    color: #d4d4d8 !important;
  }
`;

let browserWebviewParkingLot: HTMLDivElement | null = null;

function getBrowserPaneUrl(pane: Pane): string {
  return sanitizeBrowserUrl(pane.browser?.url || DEFAULT_BROWSER_URL);
}

function ensureBrowserWebviewParkingLot(): HTMLDivElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  if (browserWebviewParkingLot && document.body.contains(browserWebviewParkingLot)) {
    return browserWebviewParkingLot;
  }

  const parkingLot = document.createElement('div');
  parkingLot.dataset.browserWebviewParkingLot = 'true';
  Object.assign(parkingLot.style, {
    position: 'fixed',
    left: '-10000px',
    top: '-10000px',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(parkingLot);
  browserWebviewParkingLot = parkingLot;
  return parkingLot;
}

export function __resetBrowserPaneWebviewCacheForTests(): void {
  browserWebviewParkingLot?.remove();
  browserWebviewParkingLot = null;
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
  const webviewHostRef = useRef<HTMLDivElement | null>(null);
  const restoreReadyTimerRef = useRef<number | null>(null);
  const webviewReadyRef = useRef(false);
  const [isBrowserDropDragActive, setIsBrowserDropDragActive] = useState(() => getBrowserDropDragActive());
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

  const syncWebviewBounds = useCallback(() => {
    const webview = webviewRef.current;
    const host = webviewHostRef.current;
    if (!webview || !host || webview.parentElement !== host) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const nextWidth = Math.max(0, Math.round(rect.width));
    const nextHeight = Math.max(0, Math.round(rect.height));
    if (nextWidth === 0 || nextHeight === 0) {
      return;
    }

    Object.assign(webview.style, {
      display: 'block',
      position: 'absolute',
      inset: '0px',
      width: `${nextWidth}px`,
      height: `${nextHeight}px`,
    });
  }, []);

  useEffect(() => subscribeBrowserDropDragActive(setIsBrowserDropDragActive), []);

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

        await webview.insertCSS(BLANK_PAGE_THEME_CSS);
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
        webview.src = nextUrl;
        return;
      }

      void webview.loadURL(nextUrl).catch((error: unknown) => {
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

  useLayoutEffect(() => {
    const host = webviewHostRef.current;
    if (!host) {
      return undefined;
    }

    const webview = document.createElement('webview') as HTMLWebViewElement;
    webviewRef.current = webview;

    webview.className = BROWSER_WEBVIEW_CLASSNAME;
    webview.setAttribute('partition', BROWSER_PARTITION);
    webview.setAttribute('src', persistedUrl);
    host.replaceChildren(webview);
    syncWebviewBounds();

    return () => {
      clearRestoreReadyTimer();
      setWebviewReady(false);
      resetNavigationState();
      webview.remove();
      webviewRef.current = null;
    };
  }, [clearRestoreReadyTimer, pane.id, persistedUrl, resetNavigationState, setWebviewReady, syncWebviewBounds]);

  useEffect(() => {
    const host = webviewHostRef.current;
    if (!host) {
      return undefined;
    }

    const handleWindowResize = () => {
      syncWebviewBounds();
    };
    const resizeObserver = new ResizeObserver(() => {
      syncWebviewBounds();
    });

    resizeObserver.observe(host);
    window.addEventListener('resize', handleWindowResize);

    const animationFrameId = window.requestAnimationFrame(() => {
      syncWebviewBounds();
    });
    const delayedSyncTimer = window.setTimeout(() => {
      syncWebviewBounds();
    }, 80);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(delayedSyncTimer);
    };
  }, [pane.id, syncWebviewBounds]);

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
      if (currentWebviewUrl !== persistedUrl) {
        void webview.loadURL(persistedUrl).catch((error: unknown) => {
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

  useLayoutEffect(() => {
    const webview = webviewRef.current;
    const host = webviewHostRef.current;

    if (!webview || !host) {
      return;
    }

    if (isBrowserDropDragActive) {
      const parkingLot = ensureBrowserWebviewParkingLot();
      if (parkingLot && webview.parentElement !== parkingLot) {
        parkingLot.appendChild(webview);
        logBrowserDnd('webview parked for drag', {
          windowId,
          paneId: pane.id,
        });
      }
      return;
    }

    if (webview.parentElement !== host) {
      host.replaceChildren(webview);
      syncWebviewBounds();
      logBrowserDnd('webview restored after drag', {
        windowId,
        paneId: pane.id,
      });
    }
  }, [isBrowserDropDragActive, pane.id, syncWebviewBounds, windowId]);

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

  return (
    <div
      className={`
        relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-zinc-800 bg-zinc-950
      `}
      style={{ opacity: isDragging ? 0.45 : 1 }}
      onMouseDownCapture={handleMouseDownCapture}
    >
      <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/90 px-2 py-1.5">
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
          className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 active:cursor-grabbing"
          aria-label={t('browserPane.move')}
          title={t('browserPane.move')}
        >
          <GripVertical size={16} />
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          <AppTooltip content={t('browserPane.back')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('browserPane.back')}
              disabled={!isWebviewReady || !canGoBack}
              onMouseDown={preventMouseButtonFocus}
              onClick={goBack}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
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
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
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
              className={`flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 ${isLoading ? 'animate-spin text-[rgb(var(--primary))]' : ''}`}
            >
              <RefreshCw size={15} />
            </button>
          </AppTooltip>
        </div>

        <form className="min-w-0 flex-1" onSubmit={handleSubmit}>
          <label className="flex h-7 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-zinc-300 focus-within:border-[rgb(var(--ring))]/60">
            <Globe size={13} className="shrink-0 text-zinc-500" />
            <input
              ref={addressInputRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              aria-label={t('browserPane.address')}
              placeholder={t('browserPane.addressPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-zinc-500"
            />
          </label>
        </form>

        <div className="flex items-center gap-1 text-zinc-400">
          <AppTooltip content={t('browserPane.openExternal')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('browserPane.openExternal')}
              onMouseDown={preventMouseButtonFocus}
              onClick={openCurrentUrlExternally}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800"
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
                className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 hover:bg-red-600 hover:text-zinc-50"
              >
                <X size={13} />
              </button>
            </AppTooltip>
          )}
        </div>
      </div>

      <div
        ref={webviewHostRef}
        data-browser-webview-host="true"
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-zinc-950"
      />
    </div>
  );
};

BrowserPane.displayName = 'BrowserPane';
