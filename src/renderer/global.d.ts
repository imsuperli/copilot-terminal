import type { ElectronAPI } from '../shared/types/electron-api';

declare global {
  interface HTMLWebViewElement extends HTMLElement {
    src: string;
    loadURL(url: string): Promise<void>;
    insertCSS(css: string): Promise<string>;
    getURL(): string;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
  }

  interface Window {
    electronAPI: ElectronAPI
  }

  var electronAPI: ElectronAPI

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement> & {
        src?: string;
        partition?: string;
      };
    }
  }
}

export {};
