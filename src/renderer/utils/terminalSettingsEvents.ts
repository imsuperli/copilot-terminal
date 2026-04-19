// 终端字体设置更新事件
const TERMINAL_SETTINGS_UPDATED_EVENT = 'terminal-settings-updated';

export interface TerminalFontSettings {
  fontFamily?: string;
  fontSize?: number;
  themeChanged?: boolean;
}

export function notifyTerminalSettingsUpdated(settings: TerminalFontSettings): void {
  window.dispatchEvent(new CustomEvent(TERMINAL_SETTINGS_UPDATED_EVENT, { detail: settings }));
}

export function onTerminalSettingsUpdated(callback: (settings: TerminalFontSettings) => void): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<TerminalFontSettings>;
    callback(customEvent.detail);
  };

  window.addEventListener(TERMINAL_SETTINGS_UPDATED_EVENT, handler);

  return () => {
    window.removeEventListener(TERMINAL_SETTINGS_UPDATED_EVENT, handler);
  };
}
