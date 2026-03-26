export const APP_ERROR_EVENT = 'app-error';

export interface AppErrorEventDetail {
  message: string;
}

export function dispatchAppError(message: string): void {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return;
  }

  window.dispatchEvent(new CustomEvent<AppErrorEventDetail>(APP_ERROR_EVENT, {
    detail: {
      message: trimmedMessage,
    },
  }));
}
