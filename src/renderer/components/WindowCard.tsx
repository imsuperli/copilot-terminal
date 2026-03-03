import React, { useMemo, useCallback } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { FolderOpen, Trash2, Play, Pause, Loader2, Archive, ArchiveRestore } from 'lucide-react';
import { Window, WindowStatus } from '../types/window';
import { getStatusColor, getStatusLabel } from '../utils/statusHelpers';
import { getAllPanes, getAggregatedStatus, getPaneCount } from '../utils/layoutHelpers';
import { StatusDot } from './StatusDot';

interface WindowCardProps {
  window: Window;
  onClick?: () => void;
  onOpenFolder?: () => void;
  onDelete?: () => void;
  onStart?: () => void;
  onPause?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
}

/**
 * 智能截断路径，保留完整的文件夹名称，中间用...替代
 * 根据路径长度动态调整保留的层级数
 * @param path 完整路径
 */
function truncatePath(path: string): string {
  // 统一使用正斜杠分割路径
  const normalizedPath = path.replace(/\\/g, '/');
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
    return `${prefix.replace(/\//g, '\\\\')}\\...\\${suffix.replace(/\//g, '\\\\')}`;
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
  onDelete,
  onStart,
  onPause,
  onArchive,
  onUnarchive
}) => {
  // 获取窗口的聚合状态和窗格信息
  const aggregatedStatus = useMemo(() => getAggregatedStatus(window.layout), [window.layout]);
  const paneCount = useMemo(() => getPaneCount(window.layout), [window.layout]);
  const panes = useMemo(() => getAllPanes(window.layout), [window.layout]);

  // 获取第一个窗格的工作目录作为显示
  const workingDirectory = useMemo(() => panes[0]?.cwd || '', [panes]);

  // 缓存状态色和标签
  const statusColor = useMemo(() => getStatusColor(aggregatedStatus), [aggregatedStatus]);
  const statusLabel = useMemo(() => getStatusLabel(aggregatedStatus), [aggregatedStatus]);

  // 缓存格式化的上次运行时间（移除"不到"、"大约"等字样）
  const formattedLastActiveTime = useMemo(() => {
    try {
      const timeStr = formatDistanceToNow(new Date(window.lastActiveAt), {
        addSuffix: true,
        locale: zhCN
      });
      // 移除"不到"、"大约"等字样
      return timeStr.replace(/不到|大约/g, '').trim();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to format time:', error, 'lastActiveAt:', window.lastActiveAt);
      }
      return '未知';
    }
  }, [window.lastActiveAt]);

  // 缓存格式化的创建时间
  const formattedCreatedTime = useMemo(() => {
    try {
      const timeStr = formatDistanceToNow(new Date(window.createdAt), {
        addSuffix: true,
        locale: zhCN
      });
      // 移除"不到"、"大约"等字样
      return timeStr.replace(/不到|大约/g, '').trim();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to format created time:', error, 'createdAt:', window.createdAt);
      }
      return '未知';
    }
  }, [window.createdAt]);

  // 缓存截断后的路径
  const truncatedPath = useMemo(
    () => workingDirectory ? truncatePath(workingDirectory) : '',
    [workingDirectory]
  );

  // 缓存 aria-label
  const ariaLabel = useMemo(
    () => `${window.name}, 状态: ${statusLabel}, 工作目录: ${workingDirectory}, ${paneCount} 个窗格`,
    [window.name, statusLabel, workingDirectory, paneCount]
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
      className="min-w-[280px] h-56 bg-[rgb(var(--card))] rounded-lg overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:bg-[rgb(var(--card))]/80 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] active:bg-[rgb(var(--accent))]/30 active:shadow-inner outline-none focus:outline-none focus:ring-0 focus:border-[rgb(var(--border))] flex flex-col border border-[rgb(var(--border))] relative"
    >
      {/* 启动中加载遮罩 */}
      {aggregatedStatus === WindowStatus.Restoring && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3 rounded-lg transition-opacity duration-200">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <div className="text-white text-sm font-medium">正在启动终端...</div>
          <div className="text-zinc-400 text-xs">请稍候</div>
        </div>
      )}

      {/* 圆弧形彩色顶部线条 (4px 高度) */}
      <div
        data-testid="status-bar"
        className={`h-1 rounded-t-lg ${statusColor}`}
      />

      {/* 卡片内容 - 占据剩余空间 */}
      <div className="flex-1 p-4 space-y-2 flex flex-col min-h-0">
        {/* 第一行：窗口名称 + 窗格数量 + 状态 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h3 className="text-base font-semibold text-[rgb(var(--foreground))] truncate">
              {window.name}
            </h3>
            {paneCount > 1 && (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded flex-shrink-0">
                {paneCount} 个窗格
              </span>
            )}
          </div>
          {/* 始终显示每个窗格的状态圆点 */}
          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
            {panes.map((pane, index) => (
              <Tooltip.Provider key={pane.id}>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <div>
                      <StatusDot
                        status={pane.status}
                        size="sm"
                      />
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-50 shadow-xl border border-[rgb(var(--border))]"
                      sideOffset={5}
                    >
                      窗格 {index + 1}: {getStatusLabel(pane.status)}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            ))}
          </div>
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
                {workingDirectory}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        {/* 分割线 */}
        <div className="border-t border-[rgb(var(--border))]" />

        {/* 第三行：时间信息 */}
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[rgb(var(--muted-foreground))]">
              创建时间:
            </span>
            <span className="text-xs text-[rgb(var(--muted-foreground))] flex-shrink-0">
              {formattedCreatedTime}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[rgb(var(--muted-foreground))]">
              上次运行:
            </span>
            <span className="text-xs text-[rgb(var(--muted-foreground))] flex-shrink-0">
              {formattedLastActiveTime}
            </span>
          </div>
        </div>
      </div>

      {/* 底部按钮栏 */}
      <div className="flex items-center gap-1.5 px-4 py-3 bg-[rgb(var(--secondary))] border-t border-[rgb(var(--border))] flex-shrink-0">
        {/* 启动/暂停按钮 */}
        {aggregatedStatus === WindowStatus.Paused && (
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => handleButtonClick(e, onStart || (() => {}))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[rgb(var(--primary))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))] font-semibold whitespace-nowrap"
                  aria-label="启动窗口"
                >
                  <Play size={14} />
                  <span>启动</span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-50 shadow-xl border border-[rgb(var(--border))]"
                  sideOffset={5}
                >
                  启动窗口
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        )}
        {aggregatedStatus === WindowStatus.Restoring && (
          <button
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[rgb(var(--muted-foreground))] bg-[rgb(var(--card))] rounded cursor-not-allowed opacity-60 whitespace-nowrap"
            aria-label="启动中"
          >
            <Loader2 size={14} className="animate-spin" />
            <span>启动中</span>
          </button>
        )}
        {(aggregatedStatus === WindowStatus.Running || aggregatedStatus === WindowStatus.WaitingForInput) && (
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => handleButtonClick(e, onPause || (() => {}))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[rgb(var(--foreground))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))] whitespace-nowrap"
                  aria-label="暂停窗口"
                >
                  <Pause size={14} />
                  <span>暂停</span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-50 shadow-xl border border-[rgb(var(--border))]"
                  sideOffset={5}
                >
                  暂停窗口
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        )}

        {/* 图标按钮组 */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => handleButtonClick(e, onOpenFolder || (() => {}))}
                  className="flex items-center justify-center w-8 h-8 text-[rgb(var(--foreground))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                  aria-label="打开文件夹"
                >
                  <FolderOpen size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-50 shadow-xl border border-[rgb(var(--border))]"
                  sideOffset={5}
                >
                  打开文件夹
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>

          {!window.archived ? (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={(e) => handleButtonClick(e, onArchive || (() => {}))}
                    className="flex items-center justify-center w-8 h-8 text-[rgb(var(--foreground))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                    aria-label="归档窗口"
                  >
                    <Archive size={16} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-50 shadow-xl border border-[rgb(var(--border))]"
                    sideOffset={5}
                  >
                    归档
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          ) : (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={(e) => handleButtonClick(e, onUnarchive || (() => {}))}
                    className="flex items-center justify-center w-8 h-8 text-[rgb(var(--primary))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                    aria-label="取消归档"
                  >
                    <ArchiveRestore size={16} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-50 shadow-xl border border-[rgb(var(--border))]"
                    sideOffset={5}
                  >
                    取消归档
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          )}

          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => handleButtonClick(e, onDelete || (() => {}))}
                  className="flex items-center justify-center w-8 h-8 text-[rgb(var(--error))] bg-[rgb(var(--card))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-2 focus:ring-[rgb(var(--error))]"
                  aria-label="删除窗口"
                >
                  <Trash2 size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-50 shadow-xl border border-[rgb(var(--border))]"
                  sideOffset={5}
                >
                  删除
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </div>
    </div>
  );
});

WindowCard.displayName = 'WindowCard';
