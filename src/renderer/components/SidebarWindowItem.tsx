import React, { useMemo, useCallback, useRef } from 'react';
import { useDrag } from 'react-dnd';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Window, WindowStatus } from '../types/window';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { DragItemTypes, WindowCardDragItem } from './dnd/types';
import { TerminalTypeLogo } from './icons/TerminalTypeLogo';
import { StatusDot } from './StatusDot';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';
import { getCurrentWindowWorkingDirectory } from '../utils/windowWorkingDirectory';
import { isInactiveTerminalPaneStatus } from '../utils/windowLifecycle';

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
  if (isActive) {
    return 'border-[rgb(var(--border))] bg-[rgb(var(--accent))]';
  }

  switch (status) {
    case WindowStatus.Running:
      return 'border-[rgb(var(--appearance-running-accent-rgb))/0.25] bg-[rgb(var(--appearance-running-accent-rgb))/0.08] hover:bg-[rgb(var(--appearance-running-accent-rgb))/0.14]';
    case WindowStatus.WaitingForInput:
      return 'border-[rgb(var(--primary))]/25 bg-[rgb(var(--primary))]/10 hover:bg-[rgb(var(--primary))]/16';
    case WindowStatus.Completed:
      return 'border-[rgb(var(--border))]/70 bg-[color-mix(in_srgb,rgb(var(--card))_74%,transparent)] hover:bg-[rgb(var(--accent))]';
    case WindowStatus.Error:
      return 'border-[rgb(var(--error)/0.25)] bg-[rgb(var(--error)/0.08)] hover:bg-[rgb(var(--error)/0.14)]';
    default:
      return isInactiveTerminalPaneStatus(status)
        ? 'border-[rgb(var(--border))]/70 bg-[color-mix(in_srgb,rgb(var(--card))_74%,transparent)] hover:bg-[rgb(var(--accent))]'
        : 'border-[rgb(var(--border))]/70 bg-[color-mix(in_srgb,rgb(var(--card))_74%,transparent)] hover:bg-[rgb(var(--accent))]';
  }
}

const sidebarTooltipClassName =
  'z-[1100] rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_94%,transparent)] px-2 py-1 text-xs text-[rgb(var(--foreground))] shadow-xl backdrop-blur';

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
    return getCurrentWindowWorkingDirectory(terminalWindow);
  }, [terminalWindow]);

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
                  flex h-10 w-full items-center justify-center border transition-colors
                  ${bgColor}
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
                className={sidebarTooltipClassName}
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
          flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors
          ${bgColor}
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
          <div className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
            {terminalWindow.name}
          </div>

          {/* 工作目录 */}
          <div className="truncate text-xs text-[rgb(var(--muted-foreground))]">
            {workingDirectory}
          </div>
        </div>
      </button>
    </div>
  );
};

SidebarWindowItem.displayName = 'SidebarWindowItem';
