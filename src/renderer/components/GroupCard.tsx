import React, { useMemo, useCallback } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { FolderOpen, Trash2, Play, Square, Archive, ArchiveRestore, Edit2 } from 'lucide-react';
import { GroupStatusIcons } from './GroupStatusIcons';
import { WindowGroup } from '../../shared/types/window-group';
import { WindowStatus } from '../../shared/types/window';
import { getAllWindowIds } from '../utils/groupLayoutHelpers';
import { useWindowStore } from '../stores/windowStore';
import { getAggregatedStatus } from '../utils/layoutHelpers';
import { getStatusColor, getStatusLabelKey, getStatusColorValue } from '../utils/statusHelpers';
import { formatRelativeTime, useI18n } from '../i18n';
import { getCurrentWindowWorkingDirectory } from '../utils/windowWorkingDirectory';
import { TerminalTypeLogo } from './icons/TerminalTypeLogo';
import {
  idePopupListCardClassName,
  idePopupListCardFooterClassName,
  idePopupTonalButtonClassName,
  idePopupTooltipClassName,
} from './ui/ide-popup';

interface GroupCardProps {
  group: WindowGroup;
  onClick?: (group: WindowGroup) => void;
  onDelete?: (groupId: string) => void;
  onStartAll?: (group: WindowGroup) => void;
  onPauseAll?: (group: WindowGroup) => void;
  onArchive?: (group: WindowGroup) => void;
  onUnarchive?: (group: WindowGroup) => void;
  onEdit?: (group: WindowGroup) => void;
}

/**
 * GroupCard 组件
 * 显示窗口组的关键信息和状态
 *
 * TODO: 等待任务 #1、#2、#3 完成后实现以下功能：
 * - 显示组内窗口数量（文件夹图标 + 数字徽章）
 * - 显示组的聚合状态（基于组内所有窗口的状态）
 * - 支持批量操作（启动/暂停所有窗口）
 * - 显示组的创建时间和最后活跃时间
 */
export const GroupCard = React.memo<GroupCardProps>(({
  group,
  onClick,
  onDelete,
  onStartAll,
  onPauseAll,
  onArchive,
  onUnarchive,
  onEdit
}) => {
  const { t, language } = useI18n();
  const windows = useWindowStore((state) => state.windows);

  // 获取组内窗口数量
  const windowCount = useMemo(() => {
    return getAllWindowIds(group.layout).length;
  }, [group.layout]);

  // 获取组内所有窗口对象
  const windowsInGroup = useMemo(() => {
    const windowIds = getAllWindowIds(group.layout);
    return windows.filter(w => windowIds.includes(w.id));
  }, [group.layout, windows]);

  // 计算组的聚合状态（基于组内所有窗口的状态）
  const aggregatedStatus = useMemo(() => {
    if (windowsInGroup.length === 0) {
      return 'paused';
    }

    // 获取所有窗口的聚合状态
    const statuses = windowsInGroup.map(w => getAggregatedStatus(w.layout));

    // 如果有任何窗口在运行，则组状态为运行中
    if (statuses.some(s => s === 'running')) {
      return 'running';
    }

    // 如果有任何窗口在等待输入，则组状态为等待输入
    if (statuses.some(s => s === 'waiting')) {
      return 'waiting';
    }

    // 如果有任何窗口在恢复中，则组状态为恢复中
    if (statuses.some(s => s === 'restoring')) {
      return 'restoring';
    }

    // 否则为暂停状态
    return 'paused';
  }, [windowsInGroup]);

  // 获取所有窗口的路径
  const windowPaths = useMemo(() => {
    return windowsInGroup.map(w => getCurrentWindowWorkingDirectory(w));
  }, [windowsInGroup]);

  // 格式化最后活跃时间
  const formattedLastActiveTime = useMemo(() => {
    try {
      return formatRelativeTime(group.lastActiveAt, language);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to format time:', error, 'lastActiveAt:', group.lastActiveAt);
      }
      return t('common.unknown');
    }
  }, [language, t, group.lastActiveAt]);

  // 格式化创建时间
  const formattedCreatedTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(group.createdAt));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to format created time:', error, 'createdAt:', group.createdAt);
      }
      return t('common.unknown');
    }
  }, [language, t, group.createdAt]);

  // 阻止按钮点击事件冒泡
  const handleButtonClick = useCallback(
    (e: React.MouseEvent, action: () => void) => {
      e.stopPropagation();
      action();
      (e.currentTarget as HTMLElement).blur();
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(group);
      }
    },
    [onClick, group]
  );
  const tooltipClassName = idePopupTooltipClassName;
  const cardButtonClassName = `${idePopupTonalButtonClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(group)}
      onKeyDown={handleKeyDown}
      aria-label={`组: ${group.name}, ${windowCount} 个窗口`}
      className={`${idePopupListCardClassName} flex h-56 min-w-[280px] flex-col cursor-pointer transition-all duration-200 ease-out hover:bg-[linear-gradient(180deg,color-mix(in_srgb,rgb(var(--card))_88%,transparent)_0%,color-mix(in_srgb,rgb(var(--background))_96%,transparent)_100%)] hover:shadow-[0_24px_48px_rgba(0,0,0,0.18)] hover:scale-[1.02] active:scale-[0.98] active:bg-[rgb(var(--accent))]/30 active:shadow-inner outline-none focus:outline-none focus:ring-0 focus:border-[rgb(var(--border))]`}
      style={{ borderTop: `2px solid ${getStatusColorValue(aggregatedStatus as WindowStatus)}` }}
    >
      {/* 卡片内容 */}
      <div className="flex-1 p-4 space-y-2 flex flex-col min-h-0">
        {/* 第一行：组名称 + 窗口数量徽章 + 状态图标（靠右） */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TerminalTypeLogo
              variant="group"
              size="md"
              badgeContent={windowCount > 99 ? '99+' : windowCount}
              data-testid="group-card-logo"
            />
            <h3 className="text-base font-semibold text-[rgb(var(--foreground))] truncate">
              {group.name}
            </h3>
          </div>
          {/* 组内窗口状态图标（靠右，与 WindowCard 一致） */}
          <GroupStatusIcons group={group} windows={windows} />
        </div>

        {/* 分割线 */}
        <div className="border-t border-[rgb(var(--border))]" />

        {/* 窗口路径列表（默认显示3行，可滚动） */}
        <div
          className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto"
          style={{ maxHeight: '3.75rem' }}
          onWheel={(e) => e.stopPropagation()}
        >
          {windowPaths.map((path, index) => (
            <div key={index} className="flex items-center gap-1.5 min-w-0 group/path">
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={(e) => handleButtonClick(e, () => window.electronAPI?.openFolder(path))}
                      className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity focus:outline-none"
                    >
                      <FolderOpen size={11} className="text-[rgb(var(--muted-foreground))] group-hover/path:text-[rgb(var(--primary))]" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className={tooltipClassName}
                      side="top"
                      sideOffset={5}
                    >
                      {`在资源管理器中打开: ${path}`}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <span className="text-xs text-[rgb(var(--muted-foreground))] truncate opacity-80">
                      {path}
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className={`${tooltipClassName} max-w-xs break-all`}
                      side="top"
                      sideOffset={5}
                    >
                      {path}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          ))}
        </div>

        {/* 时间信息 */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[rgb(var(--muted-foreground))]">
              创建时间
            </span>
            <span className="text-xs text-[rgb(var(--muted-foreground))] flex-shrink-0">
              {formattedCreatedTime}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[rgb(var(--muted-foreground))]">
              最后活跃
            </span>
            <span className="text-xs text-[rgb(var(--muted-foreground))] flex-shrink-0">
              {formattedLastActiveTime}
            </span>
          </div>
        </div>
      </div>

      {/* 底部按钮栏 - 单行布局 */}
      <div className={`${idePopupListCardFooterClassName} flex flex-shrink-0 items-center justify-between gap-1.5 px-4 py-2`}>
        {/* 左侧：启动/暂停按钮 */}
        <div>
          {aggregatedStatus === 'paused' && (
            <button
              onClick={(e) => handleButtonClick(e, () => onStartAll?.(group))}
              className={`flex items-center gap-1.5 pl-2 pr-3 py-1.5 text-xs text-[rgb(var(--primary))] ${cardButtonClassName} focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))] font-semibold whitespace-nowrap`}
            >
              <Play size={14} />
              <span>全部启动</span>
            </button>
          )}
          {(aggregatedStatus === 'running' || aggregatedStatus === 'waiting') && (
            <button
              onClick={(e) => handleButtonClick(e, () => onPauseAll?.(group))}
              className={`flex items-center gap-1.5 pl-2 pr-3 py-1.5 text-xs text-[rgb(var(--error))] ${cardButtonClassName} focus:outline-none focus:ring-2 focus:ring-[rgb(var(--error))] whitespace-nowrap`}
            >
              <Square size={14} fill="currentColor" />
              <span>全部暂停</span>
            </button>
          )}
        </div>

        {/* 右侧：操作按钮组（归档 + 编辑 + 删除） */}
        <div className="flex items-center gap-1.5">
          {!group.archived ? (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={(e) => handleButtonClick(e, () => onArchive?.(group))}
                    className={`flex items-center justify-center w-8 h-8 text-[rgb(var(--foreground))] ${cardButtonClassName} focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]`}
                    aria-label="归档组"
                  >
                    <Archive size={16} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className={tooltipClassName}
                    side="top"
                    sideOffset={5}
                  >
                    归档组
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          ) : (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={(e) => handleButtonClick(e, () => onUnarchive?.(group))}
                    className={`flex items-center justify-center w-8 h-8 text-[rgb(var(--primary))] ${cardButtonClassName} focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]`}
                    aria-label="取消归档"
                  >
                    <ArchiveRestore size={16} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className={tooltipClassName}
                    side="top"
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
                  onClick={(e) => handleButtonClick(e, () => onEdit?.(group))}
                  className={`flex items-center justify-center w-8 h-8 text-[rgb(var(--foreground))] ${cardButtonClassName} focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]`}
                  aria-label="编辑组"
                >
                  <Edit2 size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className={tooltipClassName}
                  side="top"
                  sideOffset={5}
                >
                  编辑组
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>

          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => handleButtonClick(e, () => onDelete?.(group.id))}
                  className={`flex items-center justify-center w-8 h-8 text-[rgb(var(--error))] ${cardButtonClassName} focus:outline-none focus:ring-2 focus:ring-[rgb(var(--error))]`}
                  aria-label="删除组"
                >
                  <Trash2 size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className={tooltipClassName}
                  side="top"
                  sideOffset={5}
                >
                  删除组
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </div>
    </div>
  );
});

GroupCard.displayName = 'GroupCard';
