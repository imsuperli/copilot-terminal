/**
 * DraggableWindowCard - 可拖拽的窗口卡片包装组件
 *
 * 使用 react-dnd 的 useDrag hook 将 WindowCard 变为可拖拽元素。
 * 拖拽时显示半透明效果，拖拽数据包含窗口 ID 和来源信息。
 */

import React, { useRef } from 'react';
import { useDrag } from 'react-dnd';
import { DragItemTypes, WindowCardDragItem } from './types';

interface DraggableWindowCardProps {
  windowId: string;
  windowName: string;
  /** 拖拽来源 */
  source: WindowCardDragItem['source'];
  /** 如果窗口属于某个组 */
  sourceGroupId?: string;
  /** 子元素（被包装的 WindowCard） */
  children: React.ReactNode;
}

export const DraggableWindowCard: React.FC<DraggableWindowCardProps> = ({
  windowId,
  windowName,
  source,
  sourceGroupId,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag<WindowCardDragItem, unknown, { isDragging: boolean }>({
    type: DragItemTypes.WINDOW_CARD,
    item: {
      type: DragItemTypes.WINDOW_CARD,
      windowId,
      windowName,
      source,
      sourceGroupId,
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(ref);

  return (
    <div
      ref={ref}
      className="h-full w-full"
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
      }}
    >
      {children}
    </div>
  );
};

DraggableWindowCard.displayName = 'DraggableWindowCard';
