/**
 * DropZone - 拖拽目标区域组件
 *
 * 当窗口卡片被拖拽到此区域时，根据鼠标位置显示分割方向提示（左/右/上/下/中心），
 * 并在放置时返回放置位置信息。
 */

import React, { useRef, useState, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { DragItemTypes, WindowCardDragItem, DropPosition, DropResult } from './types';
import { edgeDropIndicatorPositionStyles, getDropIndicatorVisualStyle } from './dropIndicatorStyles';

interface DropZoneProps {
  /** 目标窗口 ID（拖到某个窗口卡片上时） */
  targetWindowId?: string;
  /** 目标组 ID */
  targetGroupId?: string;
  /** 目标画布工作区 ID */
  targetCanvasWorkspaceId?: string;
  /** 放置回调 */
  onDrop: (item: WindowCardDragItem, result: DropResult) => void;
  /** 是否禁用（例如拖拽自身时） */
  disabled?: boolean;
  /** 子元素 */
  children: React.ReactNode;
  /** 额外的 className */
  className?: string;
}

/** 根据鼠标在目标区域内的相对位置，计算放置方向 */
function calcDropPosition(
  clientX: number,
  clientY: number,
  rect: DOMRect
): DropPosition {
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;

  // 中心区域（20%-80%）视为 center
  const edgeThreshold = 0.25;

  if (relX < edgeThreshold) return 'left';
  if (relX > 1 - edgeThreshold) return 'right';
  if (relY < edgeThreshold) return 'top';
  if (relY > 1 - edgeThreshold) return 'bottom';
  return 'center';
}

export const DropZone: React.FC<DropZoneProps> = ({
  targetWindowId,
  targetGroupId,
  targetCanvasWorkspaceId,
  onDrop,
  disabled = false,
  children,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverPosition, setHoverPosition] = useState<DropPosition | null>(null);

  const handleHover = useCallback(
    (item: WindowCardDragItem, monitor: any) => {
      if (disabled) return;
      // 不允许拖到自身
      if (item.windowId === targetWindowId) {
        setHoverPosition(null);
        return;
      }

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset || !ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const position = calcDropPosition(clientOffset.x, clientOffset.y, rect);
      setHoverPosition(position);
    },
    [disabled, targetWindowId]
  );

  const [{ isOver, canDrop }, drop] = useDrop<WindowCardDragItem, DropResult, { isOver: boolean; canDrop: boolean }>({
    accept: DragItemTypes.WINDOW_CARD,
    canDrop: (item) => {
      if (disabled) return false;
      // 不允许拖到自身
      if (item.windowId === targetWindowId) return false;
      return true;
    },
    hover: handleHover,
    drop: (item, monitor) => {
      if (!ref.current) return;

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const rect = ref.current.getBoundingClientRect();
      const position = calcDropPosition(clientOffset.x, clientOffset.y, rect);

      const result: DropResult = {
        position,
        targetWindowId,
        targetGroupId,
        targetCanvasWorkspaceId,
      };

      onDrop(item, result);
      return result;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  // 当不再 hover 时清除位置
  React.useEffect(() => {
    if (!isOver) {
      setHoverPosition(null);
    }
  }, [isOver]);

  drop(ref);

  const showIndicator = isOver && canDrop && hoverPosition;

  return (
    <div ref={ref} className={`relative ${className}`} style={{ position: 'relative' }}>
      {children}

      {/* 放置方向高亮指示器 */}
      {showIndicator && (
        <div
          style={{
            position: 'absolute',
            ...(hoverPosition === 'center'
              ? { left: 0, top: 0, width: '100%', height: '100%' }
              : edgeDropIndicatorPositionStyles[hoverPosition]),
            ...getDropIndicatorVisualStyle(hoverPosition),
          }}
        />
      )}
    </div>
  );
};

DropZone.displayName = 'DropZone';
