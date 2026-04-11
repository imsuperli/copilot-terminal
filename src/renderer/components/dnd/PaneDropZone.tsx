import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import {
  DragItemTypes,
  PaneDropPosition,
  PaneDropResult,
} from './types';
import type { BrowserDropDragItem } from './types';
import {
  canBrowserDropTargetAcceptItem,
  isBrowserDropItemType,
  isCenterBrowserDropAllowed,
} from '../../utils/browserDrop';
import {
  getBrowserDropDragActive,
  subscribeBrowserDropDragActive,
} from '../../utils/browserDropDragState';
import { logBrowserDnd } from '../../utils/browserDndDebug';

interface PaneDropZoneProps {
  targetWindowId: string;
  targetPaneId: string;
  targetPaneKind: 'terminal' | 'browser';
  onDrop: (item: BrowserDropDragItem, result: PaneDropResult) => void;
  children: React.ReactNode;
  className?: string;
}

const positionStyles: Record<PaneDropPosition, React.CSSProperties> = {
  left: { left: 0, top: 0, width: '50%', height: '100%' },
  right: { right: 0, top: 0, width: '50%', height: '100%' },
  top: { left: 0, top: 0, width: '100%', height: '50%' },
  bottom: { left: 0, bottom: 0, width: '100%', height: '50%' },
  center: { left: '25%', top: '25%', width: '50%', height: '50%' },
};

function calcPaneDropPosition(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  allowCenter: boolean,
): PaneDropPosition {
  const relX = (clientX - rect.left) / rect.width - 0.5;
  const relY = (clientY - rect.top) / rect.height - 0.5;

  if (allowCenter && Math.abs(relX) <= 0.22 && Math.abs(relY) <= 0.22) {
    return 'center';
  }

  if (Math.abs(relX) > Math.abs(relY)) {
    return relX < 0 ? 'left' : 'right';
  }

  return relY < 0 ? 'top' : 'bottom';
}

export const PaneDropZone: React.FC<PaneDropZoneProps> = ({
  targetWindowId,
  targetPaneId,
  targetPaneKind,
  onDrop,
  children,
  className = '',
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hoverPosition, setHoverPosition] = useState<PaneDropPosition | null>(null);
  const [isBrowserDropDragActive, setIsBrowserDropDragActive] = useState(() => getBrowserDropDragActive());

  useEffect(() => subscribeBrowserDropDragActive(setIsBrowserDropDragActive), []);

  const canAcceptItem = useCallback((item: BrowserDropDragItem) => {
    return canBrowserDropTargetAcceptItem(item, targetWindowId, targetPaneId);
  }, [targetPaneId, targetWindowId]);

  const handleHover = useCallback((item: BrowserDropDragItem, monitor: any) => {
    if (!canAcceptItem(item)) {
      setHoverPosition(null);
      return;
    }

    const clientOffset = monitor.getClientOffset();
    if (!clientOffset || !overlayRef.current) {
      return;
    }

    const rect = overlayRef.current.getBoundingClientRect();
    setHoverPosition(
      calcPaneDropPosition(
        clientOffset.x,
        clientOffset.y,
        rect,
        isCenterBrowserDropAllowed(item, targetPaneKind),
      ),
    );
  }, [canAcceptItem, targetPaneKind]);

  const [{ isOver, canDrop, itemType }, drop] = useDrop<
  BrowserDropDragItem,
  PaneDropResult,
  { isOver: boolean; canDrop: boolean; itemType: unknown }
  >({
    accept: [DragItemTypes.BROWSER_TOOL, DragItemTypes.BROWSER_PANE, NativeTypes.URL],
    canDrop: canAcceptItem,
    hover: handleHover,
    drop: (item, monitor) => {
      if (!overlayRef.current) {
        return;
      }

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        return;
      }

      const rect = overlayRef.current.getBoundingClientRect();
      const position = calcPaneDropPosition(
        clientOffset.x,
        clientOffset.y,
        rect,
        isCenterBrowserDropAllowed(item, targetPaneKind),
      );
      const result: PaneDropResult = {
        position,
        targetPaneId,
        targetWindowId,
      };
      logBrowserDnd('drop', {
        targetWindowId,
        targetPaneId,
        targetPaneKind,
        position,
        itemType: 'type' in item ? item.type : NativeTypes.URL,
        sourceWindowId: 'windowId' in item ? item.windowId : undefined,
        sourcePaneId: 'paneId' in item ? item.paneId : undefined,
      });
      onDrop(item, result);
      return result;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
      itemType: monitor.getItemType(),
    }),
  });

  useEffect(() => {
    if (!isOver) {
      setHoverPosition(null);
    }
  }, [isOver]);

  drop(overlayRef);

  const showIndicator = isOver && canDrop && hoverPosition;
  const dropOverlayActive = isBrowserDropDragActive || isBrowserDropItemType(itemType);

  return (
    <div className={`relative h-full w-full ${className}`}>
      {children}
      <div
        ref={overlayRef}
        className={`absolute inset-0 z-30 ${dropOverlayActive ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        {showIndicator && hoverPosition && (
          <div
            style={{
              position: 'absolute',
              ...positionStyles[hoverPosition],
              backgroundColor: hoverPosition === 'center'
                ? 'rgba(14, 165, 233, 0.18)'
                : 'rgba(39, 39, 42, 0.22)',
              border: hoverPosition === 'center'
                ? '1px solid rgba(56, 189, 248, 0.55)'
                : 'none',
              borderRadius: hoverPosition === 'center' ? '0.75rem' : '0',
              boxShadow: 'none',
              pointerEvents: 'none',
              zIndex: 20,
              transition: 'all 120ms ease',
            }}
          />
        )}
      </div>
    </div>
  );
};

PaneDropZone.displayName = 'PaneDropZone';
