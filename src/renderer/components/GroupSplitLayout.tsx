import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GroupLayoutNode, GroupSplitNode } from '../../shared/types/window-group';
import { Window } from '../types/window';
import { TerminalView } from './TerminalView';
import { getWindowCount } from '../utils/groupLayoutHelpers';
import { useWindowStore } from '../stores/windowStore';
import { useI18n } from '../i18n';
import { DraggableWindowCard, DropZone } from './dnd';
import type { WindowCardDragItem, DropResult } from './dnd';

export interface GroupSplitLayoutProps {
  groupId: string;
  layout: GroupLayoutNode;
  activeWindowId: string;
  isGroupActive: boolean;
  onWindowActivate: (windowId: string) => void;
  onWindowSwitch: (windowId: string) => void;
  onReturn: () => void;
  /** 拖拽窗口到组内某个窗口旁边时的回调 */
  onWindowDrop?: (dragItem: WindowCardDragItem, dropResult: DropResult) => void;
}

/**
 * GroupSplitLayout 组件
 * 递归渲染组布局树，每个 WindowNode 渲染一个 TerminalView
 */
export const GroupSplitLayout: React.FC<GroupSplitLayoutProps> = ({
  groupId,
  layout,
  activeWindowId,
  isGroupActive,
  onWindowActivate,
  onWindowSwitch,
  onReturn,
  onWindowDrop,
}) => {
  const { t } = useI18n();
  const updateGroupSplitSizes = useWindowStore((state) => state.updateGroupSplitSizes);

  if (!layout) {
    return <div className="flex items-center justify-center h-full text-zinc-500">布局无效</div>;
  }

  const totalWindowCount = getWindowCount(layout);

  const rootSplitNode: GroupSplitNode = layout.type === 'split'
    ? layout
    : {
      type: 'split',
      direction: 'horizontal',
      sizes: [1],
      children: [layout],
    };

  return (
    <div className="h-full w-full">
      <GroupSplitContainer
        groupId={groupId}
        splitNode={rootSplitNode}
        splitPath={[]}
        activeWindowId={activeWindowId}
        isGroupActive={isGroupActive}
        totalWindowCount={totalWindowCount}
        onWindowActivate={onWindowActivate}
        onWindowSwitch={onWindowSwitch}
        onReturn={onReturn}
        onSplitResize={updateGroupSplitSizes}
        onWindowDrop={onWindowDrop}
      />
    </div>
  );
};

GroupSplitLayout.displayName = 'GroupSplitLayout';

interface GroupSplitContainerProps {
  groupId: string;
  splitNode: GroupSplitNode;
  splitPath: number[];
  activeWindowId: string;
  isGroupActive: boolean;
  totalWindowCount: number;
  onWindowActivate: (windowId: string) => void;
  onWindowSwitch: (windowId: string) => void;
  onReturn: () => void;
  onSplitResize: (groupId: string, splitPath: number[], sizes: number[]) => void;
  onWindowDrop?: (dragItem: WindowCardDragItem, dropResult: DropResult) => void;
}

const GroupSplitContainer: React.FC<GroupSplitContainerProps> = ({
  groupId,
  splitNode,
  splitPath,
  activeWindowId,
  isGroupActive,
  totalWindowCount,
  onWindowActivate,
  onWindowSwitch,
  onReturn,
  onSplitResize,
  onWindowDrop,
}) => {
  const [sizes, setSizes] = useState<number[]>(splitNode.sizes);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingIndex, setResizingIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const sizesRef = useRef<number[]>(sizes);

  useEffect(() => {
    sizesRef.current = sizes;
  }, [sizes]);

  useEffect(() => {
    setSizes(splitNode.sizes);
  }, [splitNode.sizes]);

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

      const newSizes = [...sizesRef.current];
      const leftSize = mousePos / totalSize;
      const rightSize = 1 - leftSize;

      if (leftSize < 0.1 || rightSize < 0.1) return;

      newSizes[resizingIndex] = leftSize;
      newSizes[resizingIndex + 1] = rightSize;

      sizesRef.current = newSizes;
      setSizes(newSizes);
    };

    const handleMouseUp = () => {
      onSplitResize(groupId, splitPath, sizesRef.current);
      setIsResizing(false);
      setResizingIndex(-1);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizingIndex, onSplitResize, splitNode.direction, splitPath, groupId]);

  const isHorizontal = splitNode.direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} w-full h-full`}
    >
      {splitNode.children.map((child, index) => (
        <React.Fragment key={child.type === 'window' ? child.id : `split-${index}`}>
          <div
            style={{
              [isHorizontal ? 'width' : 'height']: `${(sizes[index] ?? (1 / splitNode.children.length)) * 100}%`,
            }}
            className="relative h-full w-full"
          >
            <GroupLayoutNodeRenderer
              groupId={groupId}
              layout={child}
              splitPath={[...splitPath, index]}
              activeWindowId={activeWindowId}
              isGroupActive={isGroupActive}
              totalWindowCount={totalWindowCount}
              onWindowActivate={onWindowActivate}
              onWindowSwitch={onWindowSwitch}
              onReturn={onReturn}
              onSplitResize={onSplitResize}
              onWindowDrop={onWindowDrop}
            />
          </div>

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

interface GroupLayoutNodeRendererProps {
  groupId: string;
  layout: GroupLayoutNode;
  splitPath: number[];
  activeWindowId: string;
  isGroupActive: boolean;
  totalWindowCount: number;
  onWindowActivate: (windowId: string) => void;
  onWindowSwitch: (windowId: string) => void;
  onReturn: () => void;
  onSplitResize: (groupId: string, splitPath: number[], sizes: number[]) => void;
  onWindowDrop?: (dragItem: WindowCardDragItem, dropResult: DropResult) => void;
}

const GroupLayoutNodeRenderer: React.FC<GroupLayoutNodeRendererProps> = ({
  groupId,
  layout,
  splitPath,
  activeWindowId,
  isGroupActive,
  totalWindowCount,
  onWindowActivate,
  onWindowSwitch,
  onReturn,
  onSplitResize,
  onWindowDrop,
}) => {
  if (layout.type === 'window') {
    return (
      <GroupWindowPane
        groupId={groupId}
        windowId={layout.id}
        isActive={isGroupActive && layout.id === activeWindowId}
        onActivate={() => onWindowActivate(layout.id)}
        onWindowSwitch={onWindowSwitch}
        onReturn={onReturn}
        onWindowDrop={onWindowDrop}
      />
    );
  }

  return (
    <GroupSplitContainer
      groupId={groupId}
      splitNode={layout}
      splitPath={splitPath}
      activeWindowId={activeWindowId}
      isGroupActive={isGroupActive}
      totalWindowCount={totalWindowCount}
      onWindowActivate={onWindowActivate}
      onWindowSwitch={onWindowSwitch}
      onReturn={onReturn}
      onSplitResize={onSplitResize}
      onWindowDrop={onWindowDrop}
    />
  );
};

/**
 * 组内窗口面板
 * 渲染一个嵌入式的 TerminalView（不含 Sidebar）
 * 支持拖拽：可以被拖出组，也可以作为拖拽目标接收其他窗口
 */
interface GroupWindowPaneProps {
  groupId: string;
  windowId: string;
  isActive: boolean;
  onActivate: () => void;
  onWindowSwitch: (windowId: string) => void;
  onReturn: () => void;
  onWindowDrop?: (dragItem: WindowCardDragItem, dropResult: DropResult) => void;
}

const GroupWindowPane: React.FC<GroupWindowPaneProps> = ({
  groupId,
  windowId,
  isActive,
  onActivate,
  onWindowSwitch,
  onReturn,
  onWindowDrop,
}) => {
  const terminalWindow = useWindowStore((state) => state.getWindowById(windowId));

  const handleDrop = useCallback(
    (dragItem: WindowCardDragItem, dropResult: DropResult) => {
      onWindowDrop?.({
        ...dragItem,
      }, {
        ...dropResult,
        targetWindowId: windowId,
        targetGroupId: groupId,
      });
    },
    [windowId, groupId, onWindowDrop]
  );

  if (!terminalWindow) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 bg-zinc-900">
        窗口不存在
      </div>
    );
  }

  return (
    <DraggableWindowCard
      windowId={windowId}
      windowName={terminalWindow.name}
      source="groupLayout"
      sourceGroupId={groupId}
    >
      <DropZone
        targetWindowId={windowId}
        targetGroupId={groupId}
        onDrop={handleDrop}
        className="h-full w-full"
      >
        <div
          className={`h-full w-full border ${isActive ? 'border-blue-500/50' : 'border-zinc-800'}`}
          onMouseDown={onActivate}
        >
          <TerminalView
            window={terminalWindow}
            onReturn={onReturn}
            onWindowSwitch={onWindowSwitch}
            isActive={isActive}
            embedded={true}
          />
        </div>
      </DropZone>
    </DraggableWindowCard>
  );
};
