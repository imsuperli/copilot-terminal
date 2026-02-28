import React, { useMemo, useCallback } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Window } from '../types/window';
import { getStatusColor, getStatusLabel } from '../utils/statusHelpers';

interface WindowCardProps {
  window: Window;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/**
 * WindowCard 组件
 * 显示单个窗口的关键信息和状态
 */
export const WindowCard = React.memo<WindowCardProps>(({ window, onClick, onContextMenu }) => {
  // 缓存状态色和标签
  const statusColor = useMemo(() => getStatusColor(window.status), [window.status]);
  const statusLabel = useMemo(() => getStatusLabel(window.status), [window.status]);

  // 缓存格式化的时间
  const formattedTime = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(window.lastActiveAt), {
        addSuffix: true,
        locale: zhCN
      });
    } catch {
      return '未知';
    }
  }, [window.lastActiveAt]);

  // 缓存 aria-label
  const ariaLabel = useMemo(
    () => `${window.name}, 状态: ${statusLabel}, 工作目录: ${window.workingDirectory}`,
    [window.name, statusLabel, window.workingDirectory]
  );

  // 稳定的键盘事件处理
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    },
    [onClick]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      className="min-w-[280px] h-40 bg-zinc-800 rounded-lg overflow-hidden cursor-pointer transition-colors hover:bg-zinc-750 active:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {/* 圆弧形彩色顶部线条 */}
      <div
        data-testid="status-bar"
        className={`h-1 rounded-t-lg ${statusColor}`}
      />

      {/* 卡片内容 */}
      <div className="p-4 space-y-2">
        {/* 第一行：窗口名称 + 状态标签 */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100 truncate flex-1">
            {window.name}
          </h3>
          <span className="text-xs text-zinc-400 ml-2 flex-shrink-0">
            {statusLabel}
          </span>
        </div>

        {/* 第二行：工作目录路径 */}
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={500}>
            <Tooltip.Trigger asChild>
              <p
                data-testid="working-directory"
                className="text-sm font-mono text-zinc-400 truncate"
              >
                {window.workingDirectory}
              </p>
            </Tooltip.Trigger>
            <Tooltip.Content
              className="bg-zinc-900 text-zinc-100 px-2 py-1 rounded text-sm max-w-md break-all"
              sideOffset={5}
            >
              {window.workingDirectory}
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>

        {/* 分割线 */}
        <div className="border-t border-zinc-700" />

        {/* 第三行：最新输出摘要 */}
        <p className="text-sm text-zinc-400 truncate">
          {window.lastOutput || '无输出'}
        </p>

        {/* 第四行：使用模型 + 最后活跃时间 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 truncate flex-1">
            {window.model || '未知模型'}
          </span>
          <span className="text-xs text-zinc-400 ml-2 flex-shrink-0">
            {formattedTime}
          </span>
        </div>
      </div>
    </div>
  );
});
