import React, { useState, useRef, useEffect } from 'react';
import { LayoutNode, SplitNode } from '../types/window';
import { TerminalPane } from './TerminalPane';
import { getPaneCount } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';

export interface SplitLayoutProps {
  windowId: string;
  layout: LayoutNode;
  activePaneId: string;
  isWindowActive: boolean;
  onPaneActivate: (paneId: string) => void;
  onPaneClose: (paneId: string) => void;
  onPaneExit?: (paneId: string) => void;
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
    <div className="h-full w-full">
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
  onSplitResize,
}) => {
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

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} w-full h-full`}
    >
      {splitNode.children.map((child, index) => (
        <React.Fragment key={child.type === 'pane' ? child.id : `split-${index}`}>
          {/* 子节点 */}
          <div
            style={{
              [isHorizontal ? 'width' : 'height']: `${(sizes[index] ?? (1 / splitNode.children.length)) * 100}%`,
            }}
            className="relative h-full"
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
              onSplitResize={onSplitResize}
            />
          </div>

          {/* 分隔条 */}
          {index < splitNode.children.length - 1 && (
            <div
              className={`
                ${isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
                bg-transparent hover:bg-blue-500 transition-colors flex-shrink-0
                ${isResizing && resizingIndex === index ? 'bg-blue-500' : ''}
              `}
              onMouseDown={handleMouseDown(index)}
            />
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
  onSplitResize: (windowId: string, splitPath: number[], sizes: number[]) => void;
}

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
  onSplitResize,
}) => {
  if (layout.type === 'pane') {
    const isActive = layout.id === activePaneId;
    return (
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
      onSplitResize={onSplitResize}
    />
  );
};
