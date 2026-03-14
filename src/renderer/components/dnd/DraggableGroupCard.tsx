/**
 * DraggableGroupCard - 可拖拽的组卡片包装组件
 *
 * 使用 react-dnd 的 useDrag hook 将 GroupCard 变为可拖拽元素。
 * 拖拽时显示半透明效果，拖拽数据包含组 ID 和来源信息。
 */

import React, { useRef } from 'react';
import { useDrag } from 'react-dnd';
import { DragItemTypes, GroupCardDragItem } from './types';

interface DraggableGroupCardProps {
  groupId: string;
  groupName: string;
  children: React.ReactNode;
}

export const DraggableGroupCard: React.FC<DraggableGroupCardProps> = ({
  groupId,
  groupName,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag<GroupCardDragItem, unknown, { isDragging: boolean }>({
    type: DragItemTypes.GROUP_CARD,
    item: {
      type: DragItemTypes.GROUP_CARD,
      groupId,
      groupName,
      source: 'cardGrid',
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

DraggableGroupCard.displayName = 'DraggableGroupCard';
