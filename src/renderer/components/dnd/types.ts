/**
 * 拖拽相关类型定义
 */

/** 拖拽项类型常量 */
export const DragItemTypes = {
  /** 窗口卡片（主界面 CardGrid 中的 WindowCard） */
  WINDOW_CARD: 'WINDOW_CARD',
  /** 组卡片（主界面 CardGrid 中的 GroupCard） */
  GROUP_CARD: 'GROUP_CARD',
} as const;

/** WindowCard 拖拽数据 */
export interface WindowCardDragItem {
  type: typeof DragItemTypes.WINDOW_CARD;
  windowId: string;
  windowName: string;
  /** 拖拽来源：cardGrid=主界面卡片, sidebar=侧边栏, groupLayout=组布局内 */
  source: 'cardGrid' | 'sidebar' | 'groupLayout';
  /** 如果窗口属于某个组，记录组 ID */
  sourceGroupId?: string;
}

/** DropZone 放置位置（用于确定分割方向） */
export type DropPosition = 'left' | 'right' | 'top' | 'bottom' | 'center';

/** DropZone 放置结果 */
export interface DropResult {
  /** 放置位置 */
  position: DropPosition;
  /** 目标窗口 ID（拖到某个窗口上时） */
  targetWindowId?: string;
  /** 目标组 ID（拖到某个组上时） */
  targetGroupId?: string;
}
