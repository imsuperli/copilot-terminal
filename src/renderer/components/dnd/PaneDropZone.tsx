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
import { getActiveBrowserPaneDragItem } from '../../utils/browserPaneDragState';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lastNativeHoverPositionRef = useRef<PaneDropPosition | null>(null);
  const [hoverPosition, setHoverPosition] = useState<PaneDropPosition | null>(null);
  const [isBrowserDropDragActive, setIsBrowserDropDragActive] = useState(() => getBrowserDropDragActive());
  const [isNativeBrowserPaneOver, setIsNativeBrowserPaneOver] = useState(false);

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
    const boundsElement = containerRef.current;
    if (!clientOffset || !boundsElement) {
      return;
    }

    const rect = boundsElement.getBoundingClientRect();
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
    accept: [DragItemTypes.BROWSER_TOOL, NativeTypes.URL],
    canDrop: canAcceptItem,
    hover: handleHover,
    drop: (item, monitor) => {
      const boundsElement = containerRef.current;
      if (!boundsElement) {
        return;
      }

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        return;
      }

      const rect = boundsElement.getBoundingClientRect();
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

  drop(containerRef);

  const updateNativeBrowserPaneHover = useCallback((clientX: number, clientY: number): PaneDropPosition | null => {
    const item = getActiveBrowserPaneDragItem();
    const boundsElement = containerRef.current;
    if (!item || !boundsElement || !canAcceptItem(item)) {
      return null;
    }

    const rect = boundsElement.getBoundingClientRect();
    return calcPaneDropPosition(
      clientX,
      clientY,
      rect,
      isCenterBrowserDropAllowed(item, targetPaneKind),
    );
  }, [canAcceptItem, targetPaneKind]);

  const handleNativeDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const position = updateNativeBrowserPaneHover(event.clientX, event.clientY);
    if (!position) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsNativeBrowserPaneOver(true);
    setHoverPosition(position);

    if (lastNativeHoverPositionRef.current !== position) {
      lastNativeHoverPositionRef.current = position;
      const item = getActiveBrowserPaneDragItem();
      logBrowserDnd('native target enter', {
        targetWindowId,
        targetPaneId,
        position,
        sourceWindowId: item?.windowId,
        sourcePaneId: item?.paneId,
      });
    }
  }, [targetPaneId, targetWindowId, updateNativeBrowserPaneHover]);

  const handleNativeDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const position = updateNativeBrowserPaneHover(event.clientX, event.clientY);
    if (!position) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsNativeBrowserPaneOver(true);

    if (hoverPosition !== position) {
      setHoverPosition(position);
    }

    if (lastNativeHoverPositionRef.current !== position) {
      lastNativeHoverPositionRef.current = position;
      const item = getActiveBrowserPaneDragItem();
      logBrowserDnd('native target over', {
        targetWindowId,
        targetPaneId,
        position,
        sourceWindowId: item?.windowId,
        sourcePaneId: item?.paneId,
      });
    }
  }, [hoverPosition, targetPaneId, targetWindowId, updateNativeBrowserPaneHover]);

  const handleNativeDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && containerRef.current?.contains(nextTarget)) {
      return;
    }

    lastNativeHoverPositionRef.current = null;
    setIsNativeBrowserPaneOver(false);
    setHoverPosition(null);
  }, []);

  const handleNativeDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const item = getActiveBrowserPaneDragItem();
    const position = updateNativeBrowserPaneHover(event.clientX, event.clientY);
    if (!item || !position) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const result: PaneDropResult = {
      position,
      targetPaneId,
      targetWindowId,
    };

    lastNativeHoverPositionRef.current = null;
    setIsNativeBrowserPaneOver(false);
    setHoverPosition(null);
    logBrowserDnd('native drop', {
      targetWindowId,
      targetPaneId,
      position,
      sourceWindowId: item.windowId,
      sourcePaneId: item.paneId,
    });
    onDrop(item, result);
  }, [onDrop, targetPaneId, targetWindowId, updateNativeBrowserPaneHover]);

  const showIndicator = Boolean(
    hoverPosition && ((isOver && canDrop) || isNativeBrowserPaneOver),
  );
  const dropOverlayActive = isBrowserDropDragActive || isBrowserDropItemType(itemType);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full ${className}`}
      onDragEnter={handleNativeDragEnter}
      onDragOver={handleNativeDragOver}
      onDragLeave={handleNativeDragLeave}
      onDrop={handleNativeDrop}
    >
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
