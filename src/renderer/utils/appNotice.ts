export const APP_NOTICE_EVENT = 'app-notice';
export const APP_ERROR_EVENT = APP_NOTICE_EVENT;

export type AppNoticeLevel = 'error' | 'success';

export interface AppNoticeEventDetail {
  message: string;
  level?: AppNoticeLevel;
}

export type AppErrorEventDetail = AppNoticeEventDetail;

export function dispatchAppError(message: string): void {
  dispatchAppNotice('error', message);
}

export function dispatchAppSuccess(message: string): void {
  dispatchAppNotice('success', message);
}

function dispatchAppNotice(level: AppNoticeLevel, message: string): void {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return;
  }

  window.dispatchEvent(new CustomEvent<AppNoticeEventDetail>(APP_NOTICE_EVENT, {
    detail: {
      message: trimmedMessage,
      level,
    },
  }));
}
