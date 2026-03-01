import React, { useMemo, useCallback } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { FolderOpen, Trash2 } from 'lucide-react';
import { Window } from '../types/window';
import { getStatusColor, getStatusLabel } from '../utils/statusHelpers';

interface WindowCardProps {
  window: Window;
  onClick?: () => void;
  onOpenFolder?: () => void;
  onDelete?: () => void;
}

/**
 * 智能截断路径，保留完整的文件夹名称，中间用...替代
 * @param path 完整路径
 * @param maxSegments 最大显示的路径段数（前后各保留的段数）
 */
function truncatePath(path: string, maxSegments: number = 3): string {
  // 统一使用正斜杠分割路径
  const normalizedPath = path.replace(/\\/g, '/');
  const segments = normalizedPath.split('/').filter(s => s.length > 0);

  // 如果路径段数不超过限制，直接返回
  if (segments.length <= maxSegments * 2) {
    return path;
  }

  // 保留前 maxSegments 段和后 maxSegments 段
  const prefix = segments.slice(0, maxSegments).join('/');
  const suffix = segments.slice(-maxSegments).join('/');

  // 检测是否是 Windows 路径（包含盘符）
  const isWindowsPath = /^[A-Za-z]:/.test(path);

  if (isWindowsPath) {
    // Windows 路径：保持反斜杠格式
    return `${prefix.replace(/\//g, '\\')}\\...\\${suffix.replace(/\//g, '\\')}`;
  } else {
    // Unix 路径：使用正斜杠
    return `${prefix}/.../${suffix}`;
  }
}

/**
 * WindowCard 组件
 * 显示单个窗口的关键信息和状态
 */
export const WindowCard = React.memo<WindowCardProps>(({
  window,
  onClick,
  onOpenFolder,
  onDelete
}) => {
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
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to format time:', error, 'lastActiveAt:', window.lastActiveAt);
      }
      return '未知';
    }
  }, [window.lastActiveAt]);

  // 缓存截断后的路径
  const truncatedPath = useMemo(
    () => truncatePath(window.workingDirectory),
    [window.workingDirectory]
  );

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

  // 阻止按钮点击事件冒泡
  const handleButtonClick = useCallback(
    (e: React.MouseEvent, action: () => void) => {
      e.stopPropagation();
      action();
    },
    []
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      className="min-w-[280px] h-56 bg-zinc-800 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:bg-zinc-750 hover:shadow-lg active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-blue-500 flex flex-col border border-zinc-700"
    >
      {/* 圆弧形彩色顶部线条 (4px 高度) */}
      <div
        data-testid="status-bar"
        className={`h-1 rounded-t-lg ${statusColor}`}
      />

      {/* 卡片内容 - 占据剩余空间 */}
      <div className="flex-1 p-4 space-y-2 flex flex-col min-h-0">
        {/* 第一行：窗口名称 + 状态标签 */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100 truncate flex-1">
            {window.name}
          </h3>
          <span className="text-xs text-zinc-400 ml-2 flex-shrink-0">
            {statusLabel}
          </span>
        </div>

        {/* 第二行：工作目录路径（智能截断） */}
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={500}>
            <Tooltip.Trigger asChild>
              <p
                data-testid="working-directory"
                className="text-sm font-mono text-zinc-400"
              >
                {truncatedPath}
              </p>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="bg-zinc-900 text-zinc-100 px-3 py-2 rounded-lg text-sm max-w-md break-all z-50 shadow-xl border border-zinc-700"
                sideOffset={5}
              >
                {window.workingDirectory}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        {/* 分割线 */}
        <div className="border-t border-zinc-700" />

        {/* 第三行：最新输出摘要 */}
        <p className="text-sm text-zinc-400 truncate flex-1">
          {window.lastOutput || '无输出'}
        </p>

        {/* 第四行：最后活跃时间 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 truncate flex-1">
            {window.model || '未知模型'}
          </span>
          <span className="text-xs text-zinc-500 ml-2 flex-shrink-0">
            {formattedTime}
          </span>
        </div>
      </div>

      {/* 底部按钮栏 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border-t border-zinc-700 flex-shrink-0">
        <button
          onClick={(e) => handleButtonClick(e, onOpenFolder || (() => {}))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="打开文件夹"
        >
          <FolderOpen size={14} />
          <span>打开文件夹</span>
        </button>
        <button
          onClick={(e) => handleButtonClick(e, onDelete || (() => {}))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label="删除窗口"
        >
          <Trash2 size={14} />
          <span>删除</span>
        </button>
      </div>
    </div>
  );
});

WindowCard.displayName = 'WindowCard';
