import React, { useState, useRef, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { LayoutNode, SplitNode, Pane } from '../types/window';
import { TerminalPane } from './TerminalPane';
import { BrowserPane } from './BrowserPane';
import { getPaneCount } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { isBrowserPane } from '../../shared/utils/terminalCapabilities';
import { DEFAULT_BROWSER_URL } from '../utils/browserPane';
import { setBrowserDropDragActive } from '../utils/browserDropDragState';
import { DragItemTypes, PaneDropZone } from './dnd';
import type { BrowserDropDragItem, BrowserPaneDragItem, BrowserToolDragItem, PaneDropResult } from './dnd';

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
  const [{ isDragging }, drag, preview] = useDrag<BrowserPaneDragItem, unknown, { isDragging: boolean }>(() => ({
    type: DragItemTypes.BROWSER_PANE,
    item: () => {
      onActivate();
      setBrowserDropDragActive(true);

      return {
        type: DragItemTypes.BROWSER_PANE,
        windowId,
        paneId: pane.id,
        url: pane.browser?.url ?? DEFAULT_BROWSER_URL,
      };
    },
    end: () => {
      setBrowserDropDragActive(false);
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [onActivate, windowId, pane.browser?.url, pane.id]);

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  return (
    <BrowserPane
      windowId={windowId}
      pane={pane}
      isActive={isActive}
      onActivate={onActivate}
      onClose={onClose}
      dragHandleRef={drag}
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
