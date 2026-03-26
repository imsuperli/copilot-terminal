import React, { useMemo, useCallback, useRef } from 'react';
import { useDrag } from 'react-dnd';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Window, WindowStatus } from '../types/window';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { DragItemTypes, WindowCardDragItem } from './dnd/types';
import { TerminalTypeLogo } from './icons/TerminalTypeLogo';
import { StatusDot } from './StatusDot';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';

interface SidebarWindowItemProps {
  window: Window;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  /** 如果窗口属于某个组，传入组 ID 以支持拖拽移出组 */
  groupId?: string;
}

/**
 * 获取窗口背景颜色（根据状态）
 */
function getWindowBackgroundColor(status: WindowStatus, isActive: boolean): string {
  // 非激活状态：根据窗口状态显示不同的基础背景色和悬停色
  switch (status) {
    case WindowStatus.Running:
      return 'bg-green-900/10 hover:bg-green-900/20'; // 运行中：绿色背景
    case WindowStatus.WaitingForInput:
      return 'bg-blue-900/10 hover:bg-blue-900/20'; // 等待输入：蓝色背景
    case WindowStatus.Paused:
      return 'bg-zinc-800 hover:bg-zinc-700'; // 暂停：灰色背景
    case WindowStatus.Error:
      return 'bg-red-900/10 hover:bg-red-900/20'; // 已退出：红色背景
    default:
      return 'bg-zinc-800 hover:bg-zinc-700';
  }
}

/**
 * 侧边栏窗口列表项组件
 */
export const SidebarWindowItem: React.FC<SidebarWindowItemProps> = ({
  window: terminalWindow,
  isActive,
  isExpanded,
  onClick,
  onContextMenu,
  groupId,
}) => {
  const dragRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag<WindowCardDragItem, unknown, { isDragging: boolean }>({
    type: DragItemTypes.WINDOW_CARD,
    item: {
      type: DragItemTypes.WINDOW_CARD,
      windowId: terminalWindow.id,
      windowName: terminalWindow.name,
      source: 'sidebar',
      sourceGroupId: groupId,
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(dragRef);

  // 获取窗口的聚合状态
  const aggregatedStatus = useMemo(
    () => getAggregatedStatus(terminalWindow.layout),
    [terminalWindow.layout]
  );
  const bgColor = getWindowBackgroundColor(aggregatedStatus, isActive);
  const windowKind = useMemo(() => getWindowKind(terminalWindow), [terminalWindow]);
  const logoVariant = windowKind === 'mixed' ? 'mixed' : windowKind === 'ssh' ? 'ssh' : 'local';

  // 从第一个窗格获取工作目录
  const workingDirectory = useMemo(() => {
    const panes = getAllPanes(terminalWindow.layout);
    return panes.length > 0 ? panes[0].cwd : '';
  }, [terminalWindow.layout]);

  // 处理窗口项点击
  const handleWindowClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
  }, [onClick]);

  // 折叠状态：只显示图标
  if (!isExpanded) {
    return (
      <div ref={dragRef} style={{ opacity: isDragging ? 0.4 : 1 }}>
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <button
                onClick={handleWindowClick}
                onContextMenu={onContextMenu}
                className={`
                  w-full h-10 flex items-center justify-center
                  transition-colors border-l-2
                  ${bgColor}
                  ${isActive ? 'border-l-yellow-500' : 'border-l-transparent'}
                `}
                aria-label={terminalWindow.name}
              >
                <div className="relative">
                  <TerminalTypeLogo variant={logoVariant} size="xs" />
                  <span className="absolute -bottom-1 -right-1">
                    <StatusDot status={aggregatedStatus} size="sm" />
                  </span>
                </div>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700"
                side="right"
                sideOffset={5}
              >
                {`${terminalWindow.name}\n${workingDirectory}`}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
    );
  }

  // 展开状态：显示完整信息
  return (
    <div
      ref={dragRef}
      className="relative group"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <button
        onClick={handleWindowClick}
        onContextMenu={onContextMenu}
        className={`
          w-full px-3 py-2 flex items-start gap-2
          transition-colors text-left rounded border-l-2
          ${bgColor}
          ${isActive ? 'border-l-yellow-500' : 'border-l-transparent'}
        `}
        aria-label={terminalWindow.name}
      >
        <div className="relative mt-0.5 flex-shrink-0">
          <TerminalTypeLogo variant={logoVariant} size="sm" />
          <span className="absolute -bottom-1 -right-1">
            <StatusDot status={aggregatedStatus} size="sm" />
          </span>
        </div>

        {/* 窗口信息 */}
        <div className="flex-1 min-w-0">
          {/* 窗口名称 */}
          <div className="text-sm font-medium text-zinc-100 truncate">
            {terminalWindow.name}
          </div>

          {/* 工作目录 */}
          <div className="text-xs text-zinc-400 truncate">
            {workingDirectory}
          </div>
        </div>
      </button>
    </div>
  );
};

SidebarWindowItem.displayName = 'SidebarWindowItem';
