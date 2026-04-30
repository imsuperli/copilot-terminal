import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { LayoutNode, SplitNode, Pane } from '../types/window';
import { TerminalPane } from './TerminalPane';
import { BrowserPane } from './BrowserPane';
import { CodePane } from './CodePane';
import { ChatPane } from './ChatPane';
import { PaneNoteOverlay } from './PaneNoteOverlay';
import { getPaneCount } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { usePaneNoteStore } from '../stores/paneNoteStore';
import { isBrowserPane, isChatPane, isCodePane } from '../../shared/utils/terminalCapabilities';
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
  const removeNote = usePaneNoteStore((state) => state.removeNote);
  const paneIds = getPaneCount(layout) > 0 && layout
    ? new Set(
      (function collectPaneIds(node: LayoutNode): string[] {
        if (node.type === 'pane') {
          return [node.id];
        }

        return node.children.flatMap((child) => collectPaneIds(child));
      })(layout),
    )
    : new Set<string>();

  useEffect(() => {
    const noteEntries = Object.keys(usePaneNoteStore.getState().notes);

    for (const entry of noteEntries) {
      const separatorIndex = entry.indexOf('::');
      if (separatorIndex < 0) {
        continue;
      }

      const entryWindowId = entry.slice(0, separatorIndex);
      const entryPaneId = entry.slice(separatorIndex + 2);
      if (entryWindowId === windowId && !paneIds.has(entryPaneId)) {
        removeNote(windowId, entryPaneId);
      }
    }
  }, [layout, paneIds, removeNote, windowId]);

  // 防御性检查：如果 layout 为 undefined 或 null，返回空
  if (!layout) {
    console.error('[SplitLayout] Layout is undefined or null');
    return <div className="flex h-full items-center justify-center text-[rgb(var(--muted-foreground))]">{t('splitLayout.invalid')}</div>;
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
  const [hoveredDividerIndex, setHoveredDividerIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const childRefs = useRef<Array<HTMLDivElement | null>>([]);
  const sizesRef = useRef<number[]>(sizes);

  // 同步 sizesRef 到最新值
  useEffect(() => {
    sizesRef.current = sizes;
    childRefs.current.forEach((node, index) => {
      if (node) {
        node.style.flexGrow = `${sizes[index] ?? (1 / splitNode.children.length)}`;
      }
    });
  }, [sizes]);

  // 同步外部 sizes 变化
  useEffect(() => {
    sizesRef.current = splitNode.sizes;
    setSizes(splitNode.sizes);
  }, [splitNode.sizes]);

  const applySplitSizePreview = useCallback((nextSizes: number[]) => {
    const leftPane = childRefs.current[resizingIndex];
    const rightPane = childRefs.current[resizingIndex + 1];
    if (leftPane) {
      leftPane.style.flexGrow = `${nextSizes[resizingIndex] ?? 0}`;
    }
    if (rightPane) {
      rightPane.style.flexGrow = `${nextSizes[resizingIndex + 1] ?? 0}`;
    }
  }, [resizingIndex]);

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
      applySplitSizePreview(newSizes);
    };

    const handleMouseUp = () => {
      const nextSizes = sizesRef.current;
      setSizes((currentSizes) => (
        currentSizes.length === nextSizes.length
          && currentSizes.every((currentSize, index) => currentSize === nextSizes[index])
          ? currentSizes
          : [...nextSizes]
      ));
      onSplitResize(windowId, splitPath, nextSizes);
      setIsResizing(false);
      setResizingIndex(-1);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [applySplitSizePreview, isResizing, resizingIndex, onSplitResize, splitNode.direction, splitPath, windowId]);

  const isHorizontal = splitNode.direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} w-full h-full min-h-0 min-w-0 overflow-hidden`}
    >
      {splitNode.children.map((child, index) => (
        <React.Fragment key={child.type === 'pane' ? child.id : `split-${index}`}>
          {/* 子节点 */}
          <div
            ref={(node) => {
              childRefs.current[index] = node;
            }}
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
                bg-transparent
                transition-colors
              `}
              style={{
                backgroundColor: hoveredDividerIndex === index
                  ? 'rgb(var(--border) / calc(var(--appearance-split-divider-track-opacity) + 0.12))'
                  : 'rgb(var(--border) / var(--appearance-split-divider-track-opacity))',
              }}
              onMouseEnter={() => setHoveredDividerIndex(index)}
              onMouseLeave={() => setHoveredDividerIndex((current) => (current === index ? null : current))}
              onMouseDown={handleMouseDown(index)}
            >
              <div
                className={`
                  absolute transition-all duration-150
                  ${isHorizontal
                    ? 'inset-y-0 left-1/2 w-px -translate-x-1/2'
                    : 'inset-x-0 top-1/2 h-px -translate-y-1/2'
                  }
                `}
                style={{
                  backgroundColor: isResizing && resizingIndex === index
                    ? 'rgb(var(--primary))'
                    : hoveredDividerIndex === index
                      ? 'rgb(var(--primary) / 0.72)'
                    : 'rgb(var(--border) / var(--appearance-split-divider-line-opacity))',
                  boxShadow: isResizing && resizingIndex === index
                    ? '0 0 0 1px rgb(var(--primary) / 0.32), 0 0 14px rgb(var(--primary) / 0.42)'
                    : hoveredDividerIndex === index
                      ? '0 0 0 1px rgb(var(--primary) / 0.18), 0 0 12px rgb(var(--primary) / 0.24)'
                    : '0 0 0 1px rgb(var(--background) / 0.28), 0 0 8px rgb(var(--foreground) / var(--appearance-split-divider-glow-opacity))',
                }}
              />
              <div
                aria-hidden="true"
                className={`
                  pointer-events-none absolute transition-opacity duration-150
                  ${isHorizontal
                    ? 'inset-y-0 left-1/2 w-[3px] -translate-x-1/2'
                    : 'inset-x-0 top-1/2 h-[3px] -translate-y-1/2'
                  }
                `}
                style={{
                  backgroundColor: `rgb(var(--primary) / ${isResizing && resizingIndex === index ? '0.38' : hoveredDividerIndex === index ? '0.28' : '0.18'})`,
                  opacity: isResizing && resizingIndex === index ? 1 : hoveredDividerIndex === index ? 1 : undefined,
                }}
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

interface PaneVisualFrameProps {
  windowId?: string;
  paneId?: string;
  isActive: boolean;
  isWindowActive: boolean;
  showPaneNote?: boolean;
  paneNoteRightInset?: number;
  noteDropEnabled?: boolean;
  children: React.ReactNode;
}

const PaneVisualFrame: React.FC<PaneVisualFrameProps> = ({
  windowId,
  paneId,
  isActive,
  isWindowActive,
  showPaneNote = false,
  paneNoteRightInset = 0,
  noteDropEnabled = false,
  children,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const openDraft = usePaneNoteStore((state) => state.openDraft);
  const containerRef = useRef<HTMLDivElement>(null);

  const overlayOpacity = isActive && isWindowActive
    ? 0
    : isHovered
      ? 'var(--appearance-pane-hover-scrim-opacity)'
      : isActive
        ? 'var(--appearance-pane-window-inactive-scrim-opacity)'
        : 'var(--appearance-pane-inactive-scrim-opacity)';

  const [{ isOver: isNoteToolOver }, noteDrop] = useDrop<
    { type: 'PANE_NOTE_TOOL'; windowId: string },
    void,
    { isOver: boolean }
  >(() => ({
    accept: 'PANE_NOTE_TOOL',
    canDrop: () => Boolean(noteDropEnabled && windowId && paneId),
    drop: (_item, monitor) => {
      if (!windowId || !paneId || !noteDropEnabled) {
        return;
      }

      const clientOffset = monitor.getClientOffset();
      const rect = containerRef.current?.getBoundingClientRect();
      const side = clientOffset && rect
        ? (clientOffset.x - rect.left <= rect.width / 2 ? 'left' : 'right')
        : 'right';
      openDraft(windowId, paneId, side);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }), [noteDropEnabled, openDraft, paneId, windowId]);

  noteDrop(containerRef);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 min-w-0 overflow-hidden"
      data-pane-visual-state={
        isActive && isWindowActive
          ? 'active'
          : isHovered
            ? 'hover'
            : isActive
              ? 'window-inactive'
              : 'inactive'
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {showPaneNote && windowId && paneId ? (
        <PaneNoteOverlay
          windowId={windowId}
          paneId={paneId}
          isActive={isActive}
          isWindowActive={isWindowActive}
          isPaneHovered={isHovered}
          avoidTopRightInset={paneNoteRightInset}
        />
      ) : null}
      {noteDropEnabled && isNoteToolOver ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] border border-[rgb(var(--warning)/0.45)] bg-[rgb(var(--warning)/0.08)] shadow-[inset_0_0_0_1px_rgba(251,191,36,0.22)]"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-150"
        style={{
          backgroundColor: 'rgb(var(--background))',
          opacity: overlayOpacity,
        }}
      />
    </div>
  );
};

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
    const showPaneNote = !isBrowserPane(layout.pane) && !isCodePane(layout.pane) && !isChatPane(layout.pane);
    const noteDropEnabled = showPaneNote;
    const paneNoteRightInset = showPaneNote && totalPaneCount > 1 ? 32 : 0;
    const paneContent = (
      <PaneVisualFrame
        windowId={windowId}
        paneId={layout.id}
        isActive={isActive}
        isWindowActive={isWindowActive}
        showPaneNote={showPaneNote}
        paneNoteRightInset={paneNoteRightInset}
        noteDropEnabled={noteDropEnabled}
      >
        {isBrowserPane(layout.pane)
      ? (
        <DraggableBrowserPane
          windowId={windowId}
          pane={layout.pane}
          isActive={isActive}
          onActivate={() => onPaneActivate(layout.id)}
          onClose={totalPaneCount > 1 ? () => onPaneClose(layout.id) : undefined}
        />
      )
      : isCodePane(layout.pane)
        ? (
          <CodePane
            windowId={windowId}
            pane={layout.pane}
            isActive={isActive}
            onActivate={() => onPaneActivate(layout.id)}
            onClose={totalPaneCount > 1 ? () => onPaneClose(layout.id) : undefined}
          />
        )
      : isChatPane(layout.pane)
        ? (
          <ChatPane
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
      )}
      </PaneVisualFrame>
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
