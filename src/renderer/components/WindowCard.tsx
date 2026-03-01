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
 * 根据路径长度动态调整保留的层级数
 * @param path 完整路径
 */
function truncatePath(path: string): string {
  // 统一使用正斜杠分割路径
  const normalizedPath = path.replace(/\/g, '/');
  const segments = normalizedPath.split('/').filter(s => s.length > 0);

  // 检测是否是 Windows 路径（包含盘符）
  const isWindowsPath = /^[A-Za-z]:/.test(path);

  // 如果路径段数较少，直接返回
  if (segments.length <= 4) {
    return path;
  }

  // 根据路径长度动态调整保留的层级数
  const pathLength = path.length;
  let keepSegments = 2; // 默认前后各保留2层

  if (pathLength > 100) {
    keepSegments = 2; // 很长的路径，前后各保留2层
  } else if (pathLength > 70) {
    keepSegments = 2; // 中等长度，前后各保留2层
  } else {
    keepSegments = 3; // 较短路径，前后各保留3层
  }

  // 如果段数不超过保留数的两倍，直接返回
  if (segments.length <= keepSegments * 2) {
    return path;
  }

  // 保留前 keepSegments 段和后 keepSegments 段
  const prefix = segments.slice(0, keepSegments).join('/');
  const suffix = segments.slice(-keepSegments).join('/');

  if (isWindowsPath) {
    // Windows 路径：保持反斜杠格式
    return `${prefix.replace(/\//g, '\\')}\...\${suffix.replace(/\//g, '\\')}`;
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
      className="min-w-[280px] h-56 bg-[rgb(var(--card))] rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:bg-[rgb(var(--card))]/80 hover:shadow-lg active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))] flex flex-col border border-[rgb(var(--border))]"
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
          <h3 className="text-base font-semibold text-[rgb(var(--foreground))] truncate flex-1">
            {window.name}
          </h3>
          <span className="text-xs text-[rgb(var(--muted-foreground))] ml-2 flex-shrink-0">
            {statusLabel}
          </span>
        </div>

        {/* 第二行：工作目录路径（智能截断，支持换行最多2行） */}
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={500}>
            <Tooltip.Trigger asChild>
              <p
                data-testid="working-directory"
                className="text-sm font-mono text-[rgb(var(--muted-foreground))] break-all line-clamp-2 pr-1"
              >
                {truncatedPath}
              </p>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-3 py-2 rounded-lg text-sm max-w-md break-all z-50 shadow-xl border border-[rgb(var(--border))]"
                sideOffset={5}
              >
                {window.workingDirectory}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        {/* 分割线 */}
        <div className="border-t border-[rgb(var(--border))]" />

        {/* 第三行：最新输出摘要 */}
        <p className="text-sm text-[rgb(var(--muted-foreground))] truncate flex-1">
          {window.lastOutput || '无输出'}
        </p>

        {/* 第四行：最后活跃时间 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[rgb(var(--muted-foreground))] truncate flex-1">
            {window.model || '未知模型'}
          </span>
          <span className="text-xs text-[rgb(var(--muted-foreground))] ml-2 flex-shrink-0">
            {formattedTime}
          </span>
        </div>
      </div>

      {/* 底部按钮栏 */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[rgb(var(--secondary))] border-t border-[rgb(var(--border))] flex-shrink-0">
        <button
          onClick={(e) => handleButtonClick(e, onOpenFolder || (() => {}))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[rgb(var(--foreground))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
          aria-label="打开文件夹"
        >
          <FolderOpen size={14} />
          <span>打开文件夹</span>
        </button>
        <button
          onClick={(e) => handleButtonClick(e, onDelete || (() => {}))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[rgb(var(--error))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--error))]"
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
