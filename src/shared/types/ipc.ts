/**
 * 视图切换 IPC 命令和事件类型定义
 */

/** switch-to-terminal-view 命令参数 */
export interface SwitchToTerminalViewPayload {
  windowId: string;
}

/** switch-to-canvas-view 命令参数 */
export interface SwitchToCanvasViewPayload {
  canvasWorkspaceId: string;
}

/** set-active-pane 命令参数 */
export interface SetActivePanePayload {
  windowId: string;
  paneId: string | null;
}

/** view-changed 事件数据 */
export interface ViewChangedPayload {
  view: 'unified' | 'terminal' | 'canvas';
  windowId?: string;
  canvasWorkspaceId?: string;
}
