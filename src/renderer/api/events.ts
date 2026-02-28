import { WindowStatus } from '../types/window';

export interface WindowStatusChangedPayload {
  windowId: string;
  status: WindowStatus;
  timestamp: string;
}

/**
 * 订阅窗口状态变化事件
 * @param callback 状态变化回调，接收 windowId 和新状态
 * @returns 取消订阅函数
 */
export function subscribeToWindowStatusChange(
  callback: (windowId: string, status: WindowStatus) => void
): () => void {
  const handler = (_event: unknown, payload: WindowStatusChangedPayload) => {
    callback(payload.windowId, payload.status);
  };

  window.electronAPI.onWindowStatusChanged(handler);

  return () => {
    window.electronAPI.offWindowStatusChanged(handler);
  };
}
