import { WindowStatus } from '../types/window';
import type {
  PaneStatusChangedPayload,
  WindowGitBranchChangedPayload,
  WindowStatusChangedPayload,
} from '../../shared/types/electron-api';

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

/**
 * 订阅窗格状态变化事件
 * @param callback 状态变化回调，接收 windowId, paneId 和新状态
 * @returns 取消订阅函数
 */
export function subscribeToPaneStatusChange(
  callback: (windowId: string, paneId: string, status: WindowStatus) => void
): () => void {
  const handler = (_event: unknown, payload: PaneStatusChangedPayload) => {
    callback(payload.windowId, payload.paneId, payload.status);
  };

  window.electronAPI.onPaneStatusChanged(handler);

  return () => {
    window.electronAPI.offPaneStatusChanged(handler);
  };
}

/**
 * 订阅窗口 git 分支变化事件
 * @param callback 分支变化回调，接收 windowId 和新分支名
 * @returns 取消订阅函数
 */
export function subscribeToWindowGitBranchChange(
  callback: (windowId: string, gitBranch: string | undefined) => void
): () => void {
  const handler = (_event: unknown, payload: WindowGitBranchChangedPayload) => {
    callback(payload.windowId, payload.gitBranch);
  };

  window.electronAPI.onWindowGitBranchChanged(handler);

  return () => {
    window.electronAPI.offWindowGitBranchChanged(handler);
  };
}
