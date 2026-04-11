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
  /** 从组中移除窗口 */
  onRemoveFromGroup?: (windowId: string) => void;
  /** 停止并从组中移除窗口 */
  onStopAndRemoveFromGroup?: (windowId: string) => void;
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
  onRemoveFromGroup,
  onStopAndRemoveFromGroup,
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
        onRemoveFromGroup={onRemoveFromGroup}
        onStopAndRemoveFromGroup={onStopAndRemoveFromGroup}
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
  onRemoveFromGroup?: (windowId: string) => void;
  onStopAndRemoveFromGroup?: (windowId: string) => void;
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
  onRemoveFromGroup,
  onStopAndRemoveFromGroup,
}) => {
  const { t } = useI18n();
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
  const dividerActiveClassName = 'bg-[rgb(var(--primary))] shadow-[0_0_0_1px_rgba(168,170,88,0.28)]';
  const dividerIdleClassName = 'bg-zinc-500/90 shadow-[0_0_0_1px_rgba(24,24,27,0.65)] group-hover:bg-[rgb(var(--primary))] group-hover:shadow-[0_0_0_1px_rgba(168,170,88,0.28)]';

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} w-full h-full min-h-0 min-w-0 overflow-hidden`}
    >
      {splitNode.children.map((child, index) => (
        <React.Fragment key={child.type === 'window' ? child.id : `split-${index}`}>
          <div
            style={{
              [isHorizontal ? 'width' : 'height']: `${(sizes[index] ?? (1 / splitNode.children.length)) * 100}%`,
            }}
            className="relative h-full min-h-0 min-w-0 overflow-hidden"
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
              onRemoveFromGroup={onRemoveFromGroup}
              onStopAndRemoveFromGroup={onStopAndRemoveFromGroup}
            />
          </div>

          {index < splitNode.children.length - 1 && (
            <div
              role="separator"
              aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
              aria-label={isHorizontal ? t('splitLayout.resizeVertical') : t('splitLayout.resizeHorizontal')}
              className={`
                ${isHorizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}
                group relative flex-shrink-0 select-none
                bg-zinc-950/70 hover:bg-[rgb(var(--primary))]/10 transition-colors
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
  onRemoveFromGroup?: (windowId: string) => void;
  onStopAndRemoveFromGroup?: (windowId: string) => void;
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
  onRemoveFromGroup,
  onStopAndRemoveFromGroup,
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
        onRemoveFromGroup={onRemoveFromGroup}
        onStopAndRemoveFromGroup={onStopAndRemoveFromGroup}
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
      onRemoveFromGroup={onRemoveFromGroup}
      onStopAndRemoveFromGroup={onStopAndRemoveFromGroup}
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
  onRemoveFromGroup?: (windowId: string) => void;
  onStopAndRemoveFromGroup?: (windowId: string) => void;
}

const GroupWindowPane: React.FC<GroupWindowPaneProps> = ({
  groupId,
  windowId,
  isActive,
  onActivate,
  onWindowSwitch,
  onReturn,
  onWindowDrop,
  onRemoveFromGroup,
  onStopAndRemoveFromGroup,
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
        className="h-full w-full min-h-0 min-w-0"
      >
        <div
          className={`h-full w-full min-h-0 min-w-0 overflow-hidden bg-zinc-900 ${
            isActive ? 'ring-1 ring-inset ring-[rgb(var(--primary))]/50' : ''
          }`}
          onMouseDown={onActivate}
        >
          <TerminalView
            window={terminalWindow}
            onReturn={onReturn}
            onWindowSwitch={onWindowSwitch}
            isActive={isActive}
            embedded={true}
            groupId={groupId}
            onRemoveFromGroup={onRemoveFromGroup}
            onStopAndRemoveFromGroup={onStopAndRemoveFromGroup}
          />
        </div>
      </DropZone>
    </DraggableWindowCard>
  );
};
