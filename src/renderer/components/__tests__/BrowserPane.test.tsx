import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { BrowserPane } from '../BrowserPane';
import { I18nProvider } from '../../i18n';
import type { Pane } from '../../types/window';
import { WindowStatus } from '../../types/window';
import { DEFAULT_BROWSER_URL } from '../../../shared/utils/browserUrls';

const updatePane = vi.fn();
const WEBVIEW_READY_ERROR = 'The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.';

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector: (state: { updatePane: typeof updatePane }) => unknown) =>
    selector({ updatePane }),
}));

vi.mock('../ui/AppTooltip', () => ({
  AppTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

type MockWebViewElement = HTMLWebViewElement & {
  preReadyGetUrlAttempts: number;
  insertCssCalls: string[];
  markReady: (url?: string) => void;
};

function decorateWebViewElement(element: HTMLElement): MockWebViewElement {
  let ready = false;
  let currentUrl = DEFAULT_BROWSER_URL;

  const webview = element as MockWebViewElement;

  webview.preReadyGetUrlAttempts = 0;
  webview.insertCssCalls = [];
  webview.markReady = (url: string = webview.getAttribute('src') ?? DEFAULT_BROWSER_URL) => {
    ready = true;
    currentUrl = url;
  };
  webview.loadURL = async (url: string) => {
    if (!ready) {
      throw new Error(WEBVIEW_READY_ERROR);
    }

    currentUrl = url;
    webview.setAttribute('src', url);
  };
  webview.insertCSS = async (css: string) => {
    if (!ready) {
      throw new Error(WEBVIEW_READY_ERROR);
    }

    webview.insertCssCalls.push(css);
    return 'css-key';
  };
  webview.getURL = () => {
    if (!ready) {
      webview.preReadyGetUrlAttempts += 1;
      throw new Error(WEBVIEW_READY_ERROR);
    }

    return currentUrl;
  };
  webview.canGoBack = () => {
    if (!ready) {
      throw new Error(WEBVIEW_READY_ERROR);
    }

    return false;
  };
  webview.canGoForward = () => {
    if (!ready) {
      throw new Error(WEBVIEW_READY_ERROR);
    }

    return false;
  };
  webview.goBack = () => {
    if (!ready) {
      throw new Error(WEBVIEW_READY_ERROR);
    }
  };
  webview.goForward = () => {
    if (!ready) {
      throw new Error(WEBVIEW_READY_ERROR);
    }
  };
  webview.reload = () => {
    if (!ready) {
      throw new Error(WEBVIEW_READY_ERROR);
    }
  };

  return webview;
}

function createBrowserPane(url: string = DEFAULT_BROWSER_URL): Pane {
  return {
    id: 'pane-browser-1',
    cwd: '',
    command: '',
    status: WindowStatus.Paused,
    pid: null,
    kind: 'browser',
    browser: {
      url,
    },
  };
}

describe('BrowserPane', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() !== 'webview') {
        return element;
      }

      return decorateWebViewElement(element as HTMLElement);
    }) as typeof document.createElement);
  });

  afterAll(() => {
    createElementSpy.mockRestore();
  });

  beforeEach(() => {
    updatePane.mockReset();
  });

  it('does not call ready-only webview APIs before dom-ready', () => {
    const { container } = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={createBrowserPane()}
          isActive={false}
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    const webview = container.querySelector('webview') as MockWebViewElement | null;
    expect(webview).not.toBeNull();
    expect(webview?.preReadyGetUrlAttempts).toBe(0);
  });

  it('syncs navigation state after dom-ready without throwing', () => {
    const { container } = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={createBrowserPane()}
          isActive={false}
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    const webview = container.querySelector('webview') as MockWebViewElement | null;
    if (!webview) {
      throw new Error('expected webview element');
    }

    webview.markReady('https://example.com/docs');
    fireEvent(webview, new Event('dom-ready'));

    expect(updatePane).toHaveBeenCalledWith('win-1', 'pane-browser-1', {
      browser: {
        url: 'https://example.com/docs',
      },
    });
    expect(webview.insertCssCalls).toHaveLength(0);
  });

  it('applies a dark theme to the blank page after dom-ready', () => {
    const { container } = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={createBrowserPane()}
          isActive={false}
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    const webview = container.querySelector('webview') as MockWebViewElement | null;
    if (!webview) {
      throw new Error('expected webview element');
    }

    webview.markReady(DEFAULT_BROWSER_URL);
    fireEvent(webview, new Event('dom-ready'));

    expect(webview.insertCssCalls).toHaveLength(1);
    expect(webview.insertCssCalls[0]).toContain('background: #09090b');
  });
});
