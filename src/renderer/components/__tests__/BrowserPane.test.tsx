import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { act, createEvent, fireEvent, render } from '@testing-library/react';
import { BrowserPane, __resetBrowserPaneWebviewCacheForTests } from '../BrowserPane';
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
  partitionSetCount: number;
  markReady: (url?: string) => void;
};

function decorateWebViewElement(element: HTMLElement): MockWebViewElement {
  let ready = false;
  let currentUrl = DEFAULT_BROWSER_URL;

  const webview = element as MockWebViewElement;
  const originalSetAttribute = element.setAttribute.bind(element);

  webview.preReadyGetUrlAttempts = 0;
  webview.insertCssCalls = [];
  webview.partitionSetCount = 0;
  webview.setAttribute = ((qualifiedName: string, value: string) => {
    if (qualifiedName === 'partition') {
      webview.partitionSetCount += 1;
    }

    originalSetAttribute(qualifiedName, value);
  }) as typeof webview.setAttribute;
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
    id: `pane-browser-${Math.random().toString(36).slice(2, 10)}`,
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
    vi.useFakeTimers();
    updatePane.mockReset();
    __resetBrowserPaneWebviewCacheForTests();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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

  it('syncs navigation state after dom-ready without throwing', async () => {
    const pane = createBrowserPane();
    const { container } = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={pane}
          isActive={false}
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    const webview = container.querySelector('webview') as MockWebViewElement | null;
    if (!webview) {
      throw new Error('expected webview element');
    }

    await act(async () => {
      webview.markReady('https://example.com/docs');
      fireEvent(webview, new Event('dom-ready'));
      await vi.runAllTimersAsync();
    });

    expect(updatePane).toHaveBeenCalledWith('win-1', pane.id, {
      browser: {
        url: 'https://example.com/docs',
      },
    });
    expect(webview.insertCssCalls).toHaveLength(0);
  });

  it('applies a dark theme to the blank page after dom-ready', async () => {
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

    await act(async () => {
      webview.markReady(DEFAULT_BROWSER_URL);
      fireEvent(webview, new Event('dom-ready'));
      await vi.runAllTimersAsync();
    });

    expect(webview.insertCssCalls).toHaveLength(1);
    expect(webview.insertCssCalls[0]).toContain('background: #09090b');
  });

  it('creates a fresh webview guest when the pane is remounted', async () => {
    const pane = createBrowserPane();
    const firstRender = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={pane}
          isActive={false}
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    const firstWebview = firstRender.container.querySelector('webview') as MockWebViewElement | null;
    if (!firstWebview) {
      throw new Error('expected first webview element');
    }

    await act(async () => {
      firstWebview.markReady('https://example.com/preserved');
      fireEvent(firstWebview, new Event('dom-ready'));
      await vi.runAllTimersAsync();
    });
    firstRender.unmount();

    const secondRender = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={pane}
          isActive={false}
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    const secondWebview = secondRender.container.querySelector('webview') as MockWebViewElement | null;
    expect(secondWebview).not.toBe(firstWebview);
    expect(secondWebview?.partitionSetCount).toBe(1);
  });

  it('sizes the webview to fill the browser pane host', () => {
    const { container } = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={createBrowserPane('https://example.com')}
          isActive={false}
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    const webview = container.querySelector('webview') as MockWebViewElement | null;
    if (!webview) {
      throw new Error('expected webview element');
    }

    expect(webview.className).toContain('h-full');
    expect(webview.className).toContain('w-full');
    expect(webview.style.display).toBe('block');
    expect(webview.style.width).toBe('100%');
    expect(webview.style.height).toBe('100%');
  });

  it('prevents mouse focus on browser toolbar buttons', () => {
    const { container } = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={createBrowserPane('https://example.com')}
          isActive={false}
          onActivate={vi.fn()}
        />
      </I18nProvider>,
    );

    const toolbarButtons = container.querySelectorAll('button');
    const openExternalButton = toolbarButtons[3] as HTMLButtonElement | undefined;
    expect(openExternalButton).toBeDefined();
    expect(openExternalButton).toHaveAttribute('tabIndex', '-1');

    const mouseDownEvent = createEvent.mouseDown(openExternalButton!);
    fireEvent(openExternalButton!, mouseDownEvent);

    expect(mouseDownEvent.defaultPrevented).toBe(true);
  });

  it('does not activate on drag-handle mouse down before a drag starts', () => {
    const onActivate = vi.fn();
    const { container } = render(
      <I18nProvider>
        <BrowserPane
          windowId="win-1"
          pane={createBrowserPane('https://example.com')}
          isActive={false}
          onActivate={onActivate}
        />
      </I18nProvider>,
    );

    const dragHandle = container.querySelector('[data-browser-drag-handle="true"]') as HTMLDivElement | null;
    if (!dragHandle) {
      throw new Error('expected drag handle');
    }

    fireEvent.mouseDown(dragHandle);

    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.click(dragHandle);

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

});
