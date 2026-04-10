import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RefreshCw, X } from 'lucide-react';
import type { Pane } from '../types/window';
import { AppTooltip } from './ui/AppTooltip';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { DEFAULT_BROWSER_URL, normalizeBrowserInput } from '../utils/browserPane';

const BROWSER_PARTITION = 'persist:copilot-terminal-browser';

function getBrowserPaneUrl(pane: Pane): string {
  return pane.browser?.url || DEFAULT_BROWSER_URL;
}

export interface BrowserPaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
}

export const BrowserPane: React.FC<BrowserPaneProps> = ({
  windowId,
  pane,
  isActive,
  onActivate,
  onClose,
}) => {
  const { t } = useI18n();
  const updatePane = useWindowStore((state) => state.updatePane);
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(() => getBrowserPaneUrl(pane));
  const [currentUrl, setCurrentUrl] = useState(() => getBrowserPaneUrl(pane));
  const [pageTitle, setPageTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const persistedUrl = useMemo(() => getBrowserPaneUrl(pane), [pane]);

  const syncPaneUrl = useCallback((nextUrl: string) => {
    const normalizedUrl = nextUrl || DEFAULT_BROWSER_URL;
    setCurrentUrl(normalizedUrl);
    setInputValue(normalizedUrl);
    if (pane.browser?.url === normalizedUrl) {
      return;
    }

    updatePane(windowId, pane.id, {
      browser: {
        url: normalizedUrl,
      },
    });
  }, [pane.browser?.url, pane.id, updatePane, windowId]);

  const syncNavigationState = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    const nextUrl = webview.getURL?.() || persistedUrl;
    syncPaneUrl(nextUrl);
    setCanGoBack(Boolean(webview.canGoBack?.()));
    setCanGoForward(Boolean(webview.canGoForward?.()));
  }, [persistedUrl, syncPaneUrl]);

  const navigateTo = useCallback((rawValue: string) => {
    const nextUrl = normalizeBrowserInput(rawValue);
    const webview = webviewRef.current;

    syncPaneUrl(nextUrl);

    if (webview) {
      void webview.loadURL(nextUrl).catch((error: unknown) => {
        console.error('Failed to navigate browser pane:', error);
      });
    }
  }, [syncPaneUrl]);

  useEffect(() => {
    const nextUrl = persistedUrl;
    setInputValue(nextUrl);
    setCurrentUrl(nextUrl);
  }, [persistedUrl, pane.id]);

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
    if (!webview) {
      return undefined;
    }

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
    const handlePageTitleUpdated = (event: Event) => {
      const title = (event as Event & { title?: string }).title ?? '';
      setPageTitle(title);
    };

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);
    webview.addEventListener('page-title-updated', handlePageTitleUpdated);

    if ((webview.getURL?.() || DEFAULT_BROWSER_URL) !== persistedUrl) {
      webview.src = persistedUrl;
    } else {
      syncNavigationState();
    }

    return () => {
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
      webview.removeEventListener('page-title-updated', handlePageTitleUpdated);
    };
  }, [pane.id, persistedUrl, syncNavigationState]);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigateTo(inputValue);
  }, [inputValue, navigateTo]);

  const openCurrentUrlExternally = useCallback(() => {
    if (!currentUrl || currentUrl === DEFAULT_BROWSER_URL) {
      return;
    }

    window.electronAPI?.openExternalUrl(currentUrl).catch((error) => {
      console.error('Failed to open external browser URL:', error);
    });
  }, [currentUrl]);

  return (
    <div
      className={`
        relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950
        ${isActive ? 'ring-1 ring-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]' : ''}
      `}
      onMouseDownCapture={onActivate}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/90 px-2 py-1.5">
        <div className="flex items-center gap-1 text-zinc-400">
          <AppTooltip content={t('browserPane.back')} placement="pane-corner">
            <button
              type="button"
              aria-label={t('browserPane.back')}
              disabled={!canGoBack}
              onClick={() => webviewRef.current?.goBack()}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={13} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('browserPane.forward')} placement="pane-corner">
            <button
              type="button"
              aria-label={t('browserPane.forward')}
              disabled={!canGoForward}
              onClick={() => webviewRef.current?.goForward()}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowRight size={13} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('browserPane.refresh')} placement="pane-corner">
            <button
              type="button"
              aria-label={t('browserPane.refresh')}
              onClick={() => webviewRef.current?.reload()}
              className={`flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800 ${isLoading ? 'animate-spin text-sky-300' : ''}`}
            >
              <RefreshCw size={13} />
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

          {onClose && isHovered && (
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

      <div className="flex min-h-0 min-w-0 items-center gap-2 border-b border-zinc-900 bg-zinc-950/80 px-2 py-1 text-[11px] text-zinc-500">
        <span className="truncate">{pageTitle || currentUrl || DEFAULT_BROWSER_URL}</span>
      </div>

      <webview
        ref={(element) => {
          webviewRef.current = element;
        }}
        src={persistedUrl}
        partition={BROWSER_PARTITION}
        className="min-h-0 min-w-0 flex-1 bg-white"
      />
    </div>
  );
};

BrowserPane.displayName = 'BrowserPane';
