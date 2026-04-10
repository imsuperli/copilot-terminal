import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, GripVertical, RefreshCw, X } from 'lucide-react';
import type { Pane } from '../types/window';
import { AppTooltip } from './ui/AppTooltip';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { DEFAULT_BROWSER_URL, normalizeBrowserInput } from '../utils/browserPane';
import { isAllowedBrowserUrl, sanitizeBrowserUrl } from '../../shared/utils/browserUrls';

const BROWSER_PARTITION = 'persist:copilot-terminal-browser';
const BROWSER_WEBVIEW_CLASSNAME = 'min-h-0 min-w-0 flex-1 bg-zinc-950';
const BROWSER_WEBVIEW_CACHE_TTL_MS = 2_000;
const BLANK_PAGE_THEME_CSS = `
  :root { color-scheme: dark; }
  html, body {
    background: #09090b !important;
    color: #d4d4d8 !important;
  }
`;

type CachedBrowserWebviewEntry = {
  element: HTMLWebViewElement;
  isReady: boolean;
  disposeTimer: number | null;
};

const cachedBrowserWebviews = new Map<string, CachedBrowserWebviewEntry>();
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

function clearBrowserWebviewDisposeTimer(entry: CachedBrowserWebviewEntry): void {
  if (entry.disposeTimer === null) {
    return;
  }

  window.clearTimeout(entry.disposeTimer);
  entry.disposeTimer = null;
}

function destroyCachedBrowserWebview(paneId: string): void {
  const entry = cachedBrowserWebviews.get(paneId);
  if (!entry) {
    return;
  }

  clearBrowserWebviewDisposeTimer(entry);
  entry.element.remove();
  cachedBrowserWebviews.delete(paneId);
}

function scheduleCachedBrowserWebviewDispose(paneId: string): void {
  const entry = cachedBrowserWebviews.get(paneId);
  if (!entry) {
    return;
  }

  clearBrowserWebviewDisposeTimer(entry);
  entry.disposeTimer = window.setTimeout(() => {
    destroyCachedBrowserWebview(paneId);
  }, BROWSER_WEBVIEW_CACHE_TTL_MS);
}

function getOrCreateCachedBrowserWebview(paneId: string, initialUrl: string): CachedBrowserWebviewEntry {
  const existingEntry = cachedBrowserWebviews.get(paneId);
  if (existingEntry) {
    clearBrowserWebviewDisposeTimer(existingEntry);
    return existingEntry;
  }

  const element = document.createElement('webview') as HTMLWebViewElement;
  element.className = BROWSER_WEBVIEW_CLASSNAME;
  element.setAttribute('partition', BROWSER_PARTITION);
  element.setAttribute('src', initialUrl);

  const entry: CachedBrowserWebviewEntry = {
    element,
    isReady: false,
    disposeTimer: null,
  };
  cachedBrowserWebviews.set(paneId, entry);
  return entry;
}

export function __resetBrowserPaneWebviewCacheForTests(): void {
  cachedBrowserWebviews.forEach((_entry, paneId) => {
    destroyCachedBrowserWebview(paneId);
  });
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
  isDragging?: boolean;
}

export const BrowserPane: React.FC<BrowserPaneProps> = ({
  windowId,
  pane,
  isActive,
  onActivate,
  onClose,
  dragHandleRef,
  isDragging = false,
}) => {
  const { t } = useI18n();
  const updatePane = useWindowStore((state) => state.updatePane);
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const webviewHostRef = useRef<HTMLDivElement | null>(null);
  const cachedWebviewEntryRef = useRef<CachedBrowserWebviewEntry | null>(null);
  const webviewReadyRef = useRef(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(() => getBrowserPaneUrl(pane));
  const [currentUrl, setCurrentUrl] = useState(() => getBrowserPaneUrl(pane));
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isWebviewReady, setIsWebviewReady] = useState(false);

  const persistedUrl = useMemo(() => getBrowserPaneUrl(pane), [pane]);
  const persistedUrlRef = useRef(persistedUrl);

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
    if (!webview || !webviewReadyRef.current) {
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

    const entry = getOrCreateCachedBrowserWebview(pane.id, persistedUrl);
    const webview = entry.element;
    cachedWebviewEntryRef.current = entry;
    webviewRef.current = webview;

    webview.className = BROWSER_WEBVIEW_CLASSNAME;
    webview.setAttribute('partition', BROWSER_PARTITION);
    if (!webview.getAttribute('src')) {
      webview.setAttribute('src', persistedUrl);
    }

    if (webview.parentElement !== host) {
      host.replaceChildren(webview);
    }

    return () => {
      const parkingLot = ensureBrowserWebviewParkingLot();
      if (parkingLot && webview.parentElement !== parkingLot) {
        parkingLot.appendChild(webview);
      }
      scheduleCachedBrowserWebviewDispose(pane.id);
      cachedWebviewEntryRef.current = null;
      webviewRef.current = null;
    };
  }, [pane.id]);

  useEffect(() => {
    if (!isActive) {
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
    const cachedEntry = cachedWebviewEntryRef.current;
    if (!webview || !cachedEntry) {
      return undefined;
    }

    setWebviewReady(cachedEntry.isReady);
    if (!cachedEntry.isReady) {
      resetNavigationState();
    }

    const handleDomReady = () => {
      cachedEntry.isReady = true;
      setWebviewReady(true);
      applyBlankPageTheme();
      syncNavigationState();
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

    if (cachedEntry.isReady) {
      applyBlankPageTheme();
      syncNavigationState();
    }

    return () => {
      setWebviewReady(false);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
    };
  }, [applyBlankPageTheme, pane.id, resetNavigationState, setWebviewReady, syncNavigationState]);

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

  return (
    <div
      className={`
        relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-zinc-800 bg-zinc-950
      `}
      style={{ opacity: isDragging ? 0.45 : 1 }}
      onMouseDownCapture={onActivate}
    >
      <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/90 px-2 py-1.5">
        <div
          ref={dragHandleRef ?? undefined}
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 active:cursor-grabbing"
          aria-label={t('browserPane.move')}
          title={t('browserPane.move')}
        >
          <GripVertical size={12} />
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          <AppTooltip content={t('browserPane.back')} placement="pane-corner">
            <button
              type="button"
              aria-label={t('browserPane.back')}
              disabled={!isWebviewReady || !canGoBack}
              onClick={goBack}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={15} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('browserPane.forward')} placement="pane-corner">
            <button
              type="button"
              aria-label={t('browserPane.forward')}
              disabled={!isWebviewReady || !canGoForward}
              onClick={goForward}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowRight size={15} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('browserPane.refresh')} placement="pane-corner">
            <button
              type="button"
              aria-label={t('browserPane.refresh')}
              disabled={!isWebviewReady}
              onClick={reloadPage}
              className={`flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 ${isLoading ? 'animate-spin text-sky-300' : ''}`}
            >
              <RefreshCw size={15} />
            </button>
          </AppTooltip>
        </div>

        <form className="min-w-0 flex-1" onSubmit={handleSubmit}>
          <label className="flex h-7 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-zinc-300 focus-within:border-sky-400/60">
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
              aria-label={t('browserPane.openExternal')}
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
                aria-label={t('terminalPane.close')}
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

      <div ref={webviewHostRef} className="min-h-0 min-w-0 flex-1 bg-zinc-950" />
    </div>
  );
};

BrowserPane.displayName = 'BrowserPane';
