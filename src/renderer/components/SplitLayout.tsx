import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LayoutNode, SplitNode, Pane } from '../types/window';
import { TerminalPane } from './TerminalPane';
import { BrowserPane } from './BrowserPane';
import { getPaneCount } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { isBrowserPane } from '../../shared/utils/terminalCapabilities';
import { DEFAULT_BROWSER_URL } from '../utils/browserPane';
import { setBrowserDropDragActive } from '../utils/browserDropDragState';
import { logBrowserDnd } from '../utils/browserDndDebug';
import { setActiveBrowserPaneDragItem } from '../utils/browserPaneDragState';
import {
  endBrowserPanePointerDrag,
  getBrowserPanePointerDragState,
  startBrowserPanePointerDrag,
  updateBrowserPanePointerDragHover,
} from '../utils/browserPanePointerDragState';
import { DragItemTypes, PaneDropZone } from './dnd';
import type { BrowserDropDragItem, BrowserPaneDragItem, PaneDropResult } from './dnd';

export interface SplitLayoutProps {
  windowId: string;
  layout: LayoutNode;
  activePaneId: string;
  isWindowActive: boolean;
  onPaneActivate: (paneId: string) => void;
  onPaneClose: (paneId: string) => void;
  onPaneExit?: (paneId: string) => void;
  onBrowserPaneDrop?: (item: BrowserDropDragItem, result: PaneDropResult) => void;
}

/**
 * SplitLayout 组件
 * 递归渲染布局树，支持嵌套拆分
 */
export const SplitLayout: React.FC<SplitLayoutProps> = ({
  windowId,
  layout,
  activePaneId,
  isWindowActive,
  onPaneActivate,
  onPaneClose,
  onPaneExit,
  onBrowserPaneDrop,
}) => {
  const { t } = useI18n();
  const updateSplitSizes = useWindowStore((state) => state.updateSplitSizes);

  // 防御性检查：如果 layout 为 undefined 或 null，返回空
  if (!layout) {
    console.error('[SplitLayout] Layout is undefined or null');
    return <div className="flex items-center justify-center h-full text-zinc-500">{t('splitLayout.invalid')}</div>;
  }

  const totalPaneCount = getPaneCount(layout);

  // 统一根节点渲染结构，避免单窗格->拆分时已存在窗格被卸载重建
  const rootSplitNode: SplitNode = layout.type === 'split'
    ? layout
    : {
      type: 'split',
      direction: 'horizontal',
      sizes: [1],
      children: [layout],
    };

  return (
    <div className="h-full w-full min-h-0 min-w-0">
      <SplitContainer
        windowId={windowId}
        splitNode={rootSplitNode}
        splitPath={[]}
        activePaneId={activePaneId}
        isWindowActive={isWindowActive}
        totalPaneCount={totalPaneCount}
        onPaneActivate={onPaneActivate}
        onPaneClose={onPaneClose}
        onPaneExit={onPaneExit}
        onBrowserPaneDrop={onBrowserPaneDrop}
        onSplitResize={updateSplitSizes}
      />
    </div>
  );
};

SplitLayout.displayName = 'SplitLayout';

/**
 * SplitContainer 组件
 * 渲染拆分容器，支持调整大小
 */
interface SplitContainerProps {
  windowId: string;
  splitNode: SplitNode;
  splitPath: number[];
  activePaneId: string;
  isWindowActive: boolean;
  totalPaneCount: number;
  onPaneActivate: (paneId: string) => void;
  onPaneClose: (paneId: string) => void;
  onPaneExit?: (paneId: string) => void;
  onBrowserPaneDrop?: (item: BrowserDropDragItem, result: PaneDropResult) => void;
  onSplitResize: (windowId: string, splitPath: number[], sizes: number[]) => void;
}

const SplitContainer: React.FC<SplitContainerProps> = ({
  windowId,
  splitNode,
  splitPath,
  activePaneId,
  isWindowActive,
  totalPaneCount,
  onPaneActivate,
  onPaneClose,
  onPaneExit,
  onBrowserPaneDrop,
  onSplitResize,
}) => {
  const { t } = useI18n();
  const [sizes, setSizes] = useState<number[]>(splitNode.sizes);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingIndex, setResizingIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const sizesRef = useRef<number[]>(sizes);

  // 同步 sizesRef 到最新值
  useEffect(() => {
    sizesRef.current = sizes;
  }, [sizes]);

  // 同步外部 sizes 变化
  useEffect(() => {
    setSizes(splitNode.sizes);
  }, [splitNode.sizes]);

  // 处理拖拽调整大小
  const handleMouseDown = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizingIndex(index);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || resizingIndex === -1) return;

      const rect = containerRef.current.getBoundingClientRect();
      const isHorizontal = splitNode.direction === 'horizontal';
      const totalSize = isHorizontal ? rect.width : rect.height;
      const mousePos = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top;

      // 计算新的大小比例（使用 ref 读取最新 sizes）
      const newSizes = [...sizesRef.current];
      const leftSize = mousePos / totalSize;
      const rightSize = 1 - leftSize;

      // 限制最小大小（10%）
      if (leftSize < 0.1 || rightSize < 0.1) return;

      newSizes[resizingIndex] = leftSize;
      newSizes[resizingIndex + 1] = rightSize;

      sizesRef.current = newSizes;
      setSizes(newSizes);
    };

    const handleMouseUp = () => {
      onSplitResize(windowId, splitPath, sizesRef.current);
      setIsResizing(false);
      setResizingIndex(-1);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizingIndex, onSplitResize, splitNode.direction, splitPath, windowId]);

  const isHorizontal = splitNode.direction === 'horizontal';
  const dividerActiveClassName = 'bg-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.28)]';
  const dividerIdleClassName = 'bg-zinc-500/90 shadow-[0_0_0_1px_rgba(24,24,27,0.65)] group-hover:bg-sky-400 group-hover:shadow-[0_0_0_1px_rgba(56,189,248,0.28)]';

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} w-full h-full min-h-0 min-w-0 overflow-hidden`}
    >
      {splitNode.children.map((child, index) => (
        <React.Fragment key={child.type === 'pane' ? child.id : `split-${index}`}>
          {/* 子节点 */}
          <div
            style={{
              flexBasis: 0,
              flexGrow: sizes[index] ?? (1 / splitNode.children.length),
              flexShrink: 1,
            }}
            className="relative h-full min-h-0 min-w-0 overflow-hidden"
          >
            <LayoutNodeRenderer
              windowId={windowId}
              layout={child}
              splitPath={[...splitPath, index]}
              activePaneId={activePaneId}
              isWindowActive={isWindowActive}
              totalPaneCount={totalPaneCount}
              onPaneActivate={onPaneActivate}
              onPaneClose={onPaneClose}
              onPaneExit={onPaneExit}
              onBrowserPaneDrop={onBrowserPaneDrop}
              onSplitResize={onSplitResize}
            />
          </div>

          {/* 分隔条 */}
          {index < splitNode.children.length - 1 && (
            <div
              role="separator"
              aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
              aria-label={isHorizontal ? t('splitLayout.resizeVertical') : t('splitLayout.resizeHorizontal')}
              className={`
                ${isHorizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}
                group relative flex-shrink-0 select-none
                bg-zinc-950/70 hover:bg-sky-500/10 transition-colors
              `}
              onMouseDown={handleMouseDown(index)}
            >
              <div
                className={`
                  absolute rounded-full transition-all duration-150
                  ${isHorizontal
                    ? 'inset-y-0 left-1/2 w-[2px] -translate-x-1/2'
                    : 'inset-x-0 top-1/2 h-[2px] -translate-y-1/2'
                  }
                  ${isResizing && resizingIndex === index
                    ? `${dividerActiveClassName} ${isHorizontal ? 'w-[3px]' : 'h-[3px]'}`
                    : dividerIdleClassName
                  }
                `}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

interface LayoutNodeRendererProps {
  windowId: string;
  layout: LayoutNode;
  splitPath: number[];
  activePaneId: string;
  isWindowActive: boolean;
  totalPaneCount: number;
  onPaneActivate: (paneId: string) => void;
  onPaneClose: (paneId: string) => void;
  onPaneExit?: (paneId: string) => void;
  onBrowserPaneDrop?: (item: BrowserDropDragItem, result: PaneDropResult) => void;
  onSplitResize: (windowId: string, splitPath: number[], sizes: number[]) => void;
}

interface DraggableBrowserPaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
}

const DraggableBrowserPane: React.FC<DraggableBrowserPaneProps> = ({
  windowId,
  pane,
  isActive,
  onActivate,
  onClose,
}) => {
  const movePaneInWindow = useWindowStore((state) => state.movePaneInWindow);
  const setActivePane = useWindowStore((state) => state.setActivePane);
  const [isDragging, setIsDragging] = useState(false);
  const pendingDragItemRef = useRef<BrowserPaneDragItem | null>(null);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const isPointerDraggingRef = useRef(false);
  const suppressHandleClickRef = useRef(false);
  const lastPointerHoverKeyRef = useRef<string | null>(null);

  const cleanupPointerListeners = useCallback(() => {
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    document.removeEventListener('mouseup', handleDocumentMouseUp);
    document.body.style.removeProperty('user-select');
    document.body.style.removeProperty('cursor');
  }, []);

  function calcPointerDropPosition(
    clientX: number,
    clientY: number,
    rect: DOMRect,
  ): PaneDropResult['position'] {
    const relX = (clientX - rect.left) / rect.width - 0.5;
    const relY = (clientY - rect.top) / rect.height - 0.5;

    if (Math.abs(relX) > Math.abs(relY)) {
      return relX < 0 ? 'left' : 'right';
    }

    return relY < 0 ? 'top' : 'bottom';
  }

  const resolvePointerHoverTarget = useCallback((clientX: number, clientY: number): PaneDropResult | null => {
    const activeItem = pendingDragItemRef.current;
    if (!activeItem) {
      return null;
    }

    const elements = document.elementsFromPoint(clientX, clientY);
    const targetElement = elements.find((element) => (
      element instanceof HTMLElement
      && element.dataset.paneDropZone === 'true'
    )) as HTMLElement | undefined;

    if (!targetElement) {
      return null;
    }

    const targetWindowId = targetElement.dataset.targetWindowId;
    const targetPaneId = targetElement.dataset.targetPaneId;
    if (!targetWindowId || !targetPaneId || targetWindowId !== windowId || targetPaneId === pane.id) {
      return null;
    }

    const rect = targetElement.getBoundingClientRect();
    return {
      position: calcPointerDropPosition(clientX, clientY, rect),
      targetPaneId,
      targetWindowId,
    };
  }, [pane.id, windowId]);

  const finishPointerDrag = useCallback((shouldDrop: boolean) => {
    cleanupPointerListeners();

    const activeItem = pendingDragItemRef.current;
    const pointerState = getBrowserPanePointerDragState();

    if (shouldDrop && isPointerDraggingRef.current && activeItem && pointerState.hover) {
      const { position, targetPaneId } = pointerState.hover;
      const direction = position === 'left' || position === 'right' ? 'horizontal' : 'vertical';
      const insertBefore = position === 'left' || position === 'top';

      logBrowserDnd('pointer drop', {
        windowId,
        paneId: pane.id,
        targetPaneId,
        position,
      });

      movePaneInWindow(windowId, pane.id, targetPaneId, direction, insertBefore);
      setActivePane(windowId, pane.id);
      suppressHandleClickRef.current = true;
    } else if (isPointerDraggingRef.current) {
      logBrowserDnd('pointer drag cancel', {
        windowId,
        paneId: pane.id,
        hover: pointerState.hover,
      });
    }

    pendingDragItemRef.current = null;
    dragStartPointRef.current = null;
    isPointerDraggingRef.current = false;
    lastPointerHoverKeyRef.current = null;
    setIsDragging(false);
    updateBrowserPanePointerDragHover(null);
    endBrowserPanePointerDrag();
    setActiveBrowserPaneDragItem(null);
    setBrowserDropDragActive(false);
  }, [cleanupPointerListeners, movePaneInWindow, pane.id, setActivePane, windowId]);

  const handleDocumentMouseMove = useCallback((event: MouseEvent) => {
    const activeItem = pendingDragItemRef.current;
    const dragStartPoint = dragStartPointRef.current;
    if (!activeItem || !dragStartPoint) {
      return;
    }

    const distance = Math.hypot(event.clientX - dragStartPoint.x, event.clientY - dragStartPoint.y);
    if (!isPointerDraggingRef.current && distance < 4) {
      return;
    }

    if (!isPointerDraggingRef.current) {
      isPointerDraggingRef.current = true;
      setIsDragging(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      setActiveBrowserPaneDragItem(activeItem);
      startBrowserPanePointerDrag(activeItem);
      setBrowserDropDragActive(true);
      logBrowserDnd('pointer drag begin', {
        windowId,
        paneId: pane.id,
        url: activeItem.url,
      });
    }

    const hoverTarget = resolvePointerHoverTarget(event.clientX, event.clientY);
    const nextHoverKey = hoverTarget
      ? `${hoverTarget.targetWindowId}:${hoverTarget.targetPaneId}:${hoverTarget.position}`
      : null;
    if (lastPointerHoverKeyRef.current !== nextHoverKey) {
      lastPointerHoverKeyRef.current = nextHoverKey;
      logBrowserDnd('pointer hover target', {
        windowId,
        paneId: pane.id,
        hover: hoverTarget,
      });
    }
    updateBrowserPanePointerDragHover(hoverTarget);
  }, [pane.id, resolvePointerHoverTarget, windowId]);

  const handleDocumentMouseUp = useCallback(() => {
    finishPointerDrag(true);
  }, [finishPointerDrag]);

  const handleDragHandleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    pendingDragItemRef.current = {
      type: DragItemTypes.BROWSER_PANE,
      windowId,
      paneId: pane.id,
      url: pane.browser?.url ?? DEFAULT_BROWSER_URL,
    };
    dragStartPointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
  }, [handleDocumentMouseMove, handleDocumentMouseUp, pane.browser?.url, pane.id, windowId]);

  const consumeDragHandleClick = useCallback(() => {
    if (!suppressHandleClickRef.current) {
      return false;
    }

    suppressHandleClickRef.current = false;
    return true;
  }, []);

  useEffect(() => {
    return () => {
      finishPointerDrag(false);
    };
  }, [finishPointerDrag]);

  return (
    <BrowserPane
      windowId={windowId}
      pane={pane}
      isActive={isActive}
      onActivate={onActivate}
      onClose={onClose}
      onDragHandleMouseDown={handleDragHandleMouseDown}
      consumeDragHandleClick={consumeDragHandleClick}
      isDragging={isDragging}
    />
  );
};

const LayoutNodeRenderer: React.FC<LayoutNodeRendererProps> = ({
  windowId,
  layout,
  splitPath,
  activePaneId,
  isWindowActive,
  totalPaneCount,
  onPaneActivate,
  onPaneClose,
  onPaneExit,
  onBrowserPaneDrop,
  onSplitResize,
}) => {
  if (layout.type === 'pane') {
    const isActive = layout.id === activePaneId;
    const paneContent = isBrowserPane(layout.pane)
      ? (
        <DraggableBrowserPane
          windowId={windowId}
          pane={layout.pane}
          isActive={isActive}
          onActivate={() => onPaneActivate(layout.id)}
          onClose={totalPaneCount > 1 ? () => onPaneClose(layout.id) : undefined}
        />
      )
      : (
        <TerminalPane
          windowId={windowId}
          pane={layout.pane}
          layoutPaneCount={totalPaneCount}
          isActive={isActive}
          isWindowActive={isWindowActive}
          onActivate={() => onPaneActivate(layout.id)}
          onClose={totalPaneCount > 1 ? () => onPaneClose(layout.id) : undefined}
          onProcessExit={onPaneExit ? () => onPaneExit(layout.id) : undefined}
        />
      );

    if (!onBrowserPaneDrop) {
      return paneContent;
    }

    return (
      <PaneDropZone
        targetWindowId={windowId}
        targetPaneId={layout.id}
        targetPaneKind={isBrowserPane(layout.pane) ? 'browser' : 'terminal'}
        onDrop={onBrowserPaneDrop}
      >
        {paneContent}
      </PaneDropZone>
    );
  }

  return (
    <SplitContainer
      windowId={windowId}
      splitNode={layout}
      splitPath={splitPath}
      activePaneId={activePaneId}
      isWindowActive={isWindowActive}
      totalPaneCount={totalPaneCount}
      onPaneActivate={onPaneActivate}
      onPaneClose={onPaneClose}
      onPaneExit={onPaneExit}
      onBrowserPaneDrop={onBrowserPaneDrop}
      onSplitResize={onSplitResize}
    />
  );
};
