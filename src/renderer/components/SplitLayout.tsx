import React, { useState, useRef, useEffect } from 'react';
import { LayoutNode, SplitNode } from '../types/window';
import { TerminalPane } from './TerminalPane';
import { getPaneCount } from '../utils/layoutHelpers';

export interface SplitLayoutProps {
  windowId: string;
  layout: LayoutNode;
  activePaneId: string;
  onPaneActivate: (paneId: string) => void;
  onPaneClose: (paneId: string) => void;
}

/**
 * SplitLayout 组件
 * 递归渲染布局树，支持嵌套拆分
 */
export const SplitLayout: React.FC<SplitLayoutProps> = ({
  windowId,
  layout,
  activePaneId,
  onPaneActivate,
  onPaneClose,
}) => {
  // 防御性检查：如果 layout 为 undefined 或 null，返回空
  if (!layout) {
    console.error('[SplitLayout] Layout is undefined or null');
    return <div className="flex items-center justify-center h-full text-zinc-500">布局数据无效</div>;
  }

  // 计算窗格总数
  const totalPaneCount = getPaneCount(layout);

  // 如果是窗格节点，直接渲染 TerminalPane
  if (layout.type === 'pane') {
    return (
      <TerminalPane
        windowId={windowId}
        pane={layout.pane}
        isActive={layout.id === activePaneId}
        onActivate={() => onPaneActivate(layout.id)}
        onClose={() => onPaneClose(layout.id)}
      />
    );
  }

  // 如果是拆分节点，递归渲染子节点
  return (
    <SplitContainer
      windowId={windowId}
      splitNode={layout}
      activePaneId={activePaneId}
      onPaneActivate={onPaneActivate}
      onPaneClose={onPaneClose}
    />
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
  activePaneId: string;
  onPaneActivate: (paneId: string) => void;
  onPaneClose: (paneId: string) => void;
}

const SplitContainer: React.FC<SplitContainerProps> = ({
  windowId,
  splitNode,
  activePaneId,
  onPaneActivate,
  onPaneClose,
}) => {
  const [sizes, setSizes] = useState<number[]>(splitNode.sizes);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingIndex, setResizingIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

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

      // 计算新的大小比例
      const newSizes = [...sizes];
      const leftSize = mousePos / totalSize;
      const rightSize = 1 - leftSize;

      // 限制最小大小（10%）
      if (leftSize < 0.1 || rightSize < 0.1) return;

      newSizes[resizingIndex] = leftSize;
      newSizes[resizingIndex + 1] = rightSize;

      setSizes(newSizes);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizingIndex(-1);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizingIndex, sizes, splitNode.direction]);

  const isHorizontal = splitNode.direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} w-full h-full`}
    >
      {splitNode.children.map((child, index) => (
        <React.Fragment key={index}>
          {/* 子节点 */}
          <div
            style={{
              [isHorizontal ? 'width' : 'height']: `${sizes[index] * 100}%`,
            }}
            className="relative"
          >
            <SplitLayout
              windowId={windowId}
              layout={child}
              activePaneId={activePaneId}
              onPaneActivate={onPaneActivate}
              onPaneClose={onPaneClose}
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
