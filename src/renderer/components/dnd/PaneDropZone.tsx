import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDrop } from 'react-dnd';
import {
  BrowserPaneDragItem,
  BrowserToolDragItem,
  DragItemTypes,
  PaneDropPosition,
  PaneDropResult,
} from './types';

type BrowserDragItem = BrowserPaneDragItem | BrowserToolDragItem;

interface PaneDropZoneProps {
  targetWindowId: string;
  targetPaneId: string;
  onDrop: (item: BrowserDragItem, result: PaneDropResult) => void;
  children: React.ReactNode;
  className?: string;
}

const positionStyles: Record<PaneDropPosition, React.CSSProperties> = {
  left: { left: 0, top: 0, width: '50%', height: '100%' },
  right: { right: 0, top: 0, width: '50%', height: '100%' },
  top: { left: 0, top: 0, width: '100%', height: '50%' },
  bottom: { left: 0, bottom: 0, width: '100%', height: '50%' },
};

function calcPaneDropPosition(clientX: number, clientY: number, rect: DOMRect): PaneDropPosition {
  const relX = (clientX - rect.left) / rect.width - 0.5;
  const relY = (clientY - rect.top) / rect.height - 0.5;

  if (Math.abs(relX) > Math.abs(relY)) {
    return relX < 0 ? 'left' : 'right';
  }

  return relY < 0 ? 'top' : 'bottom';
}

export const PaneDropZone: React.FC<PaneDropZoneProps> = ({
  targetWindowId,
  targetPaneId,
  onDrop,
  children,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverPosition, setHoverPosition] = useState<PaneDropPosition | null>(null);

  const canAcceptItem = useCallback((item: BrowserDragItem) => {
    if (item.windowId !== targetWindowId) {
      return false;
    }

    if (item.type === DragItemTypes.BROWSER_PANE && item.paneId === targetPaneId) {
      return false;
    }

    return true;
  }, [targetPaneId, targetWindowId]);

  const handleHover = useCallback((item: BrowserDragItem, monitor: any) => {
    if (!canAcceptItem(item)) {
      setHoverPosition(null);
      return;
    }

    const clientOffset = monitor.getClientOffset();
    if (!clientOffset || !ref.current) {
      return;
    }

    const rect = ref.current.getBoundingClientRect();
    setHoverPosition(calcPaneDropPosition(clientOffset.x, clientOffset.y, rect));
  }, [canAcceptItem]);

  const [{ isOver, canDrop }, drop] = useDrop<BrowserDragItem, PaneDropResult, { isOver: boolean; canDrop: boolean }>({
    accept: [DragItemTypes.BROWSER_TOOL, DragItemTypes.BROWSER_PANE],
    canDrop: canAcceptItem,
    hover: handleHover,
    drop: (item, monitor) => {
      if (!ref.current) {
        return;
      }

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        return;
      }

      const rect = ref.current.getBoundingClientRect();
      const position = calcPaneDropPosition(clientOffset.x, clientOffset.y, rect);
      const result: PaneDropResult = {
        position,
        targetPaneId,
        targetWindowId,
      };
      onDrop(item, result);
      return result;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });

  useEffect(() => {
    if (!isOver) {
      setHoverPosition(null);
    }
  }, [isOver]);

  drop(ref);

  const showIndicator = isOver && canDrop && hoverPosition;

  return (
    <div ref={ref} className={`relative h-full w-full ${className}`}>
      {children}
      {showIndicator && hoverPosition && (
        <div
          style={{
            position: 'absolute',
            ...positionStyles[hoverPosition],
            backgroundColor: 'rgba(39, 39, 42, 0.22)',
            border: 'none',
            borderRadius: '0',
            boxShadow: 'none',
            pointerEvents: 'none',
            zIndex: 20,
            transition: 'all 120ms ease',
          }}
        />
      )}
    </div>
  );
};

PaneDropZone.displayName = 'PaneDropZone';
