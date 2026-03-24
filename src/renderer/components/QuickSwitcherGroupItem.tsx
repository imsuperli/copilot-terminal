import React, { useMemo } from 'react';
import { Archive } from 'lucide-react';
import { WindowGroup } from '../../shared/types/window-group';
import { highlightMatches } from '../utils/fuzzySearch';
import { useWindowStore } from '../stores/windowStore';
import { getWindowCount, getAllWindowIds } from '../utils/groupLayoutHelpers';
import { getAggregatedStatus } from '../utils/layoutHelpers';
import { WindowStatus } from '../types/window';
import { StatusDot } from './StatusDot';
import { formatRelativeTime, useI18n } from '../i18n';
import { TerminalTypeLogo } from './icons/TerminalTypeLogo';

interface QuickSwitcherGroupItemProps {
  group: WindowGroup;
  isSelected: boolean;
  query: string;
}

/**
 * 获取选中边框颜色（窗口组）
 */
function getSelectedBorderColor(archived: boolean): string {
  if (archived) return 'border-orange-500';
  return 'border-purple-500'; // 窗口组使用紫色
}

/**
 * 快速切换面板窗口组列表项组件
 */
export const QuickSwitcherGroupItem: React.FC<QuickSwitcherGroupItemProps> = ({
  group,
  isSelected,
  query,
}) => {
  const { language, t } = useI18n();
  const windows = useWindowStore((state) => state.windows);

  // 获取组内窗口数量
  const windowCount = useMemo(() => getWindowCount(group.layout), [group.layout]);

  // 获取组内所有窗口的状态
  const windowStatuses = useMemo(() => {
    const windowIds = getAllWindowIds(group.layout);
    return windowIds
      .map((id) => windows.find((w) => w.id === id))
      .filter((w): w is NonNullable<typeof w> => w !== undefined)
      .map((w) => ({
        id: w.id,
        status: getAggregatedStatus(w.layout),
      }));
  }, [group.layout, windows]);

  const borderColor = getSelectedBorderColor(group.archived || false);

  // 高亮匹配
  const nameHighlights = highlightMatches(group.name, query);

  // 格式化相对时间
  const relativeTime = useMemo(() => {
    try {
      return formatRelativeTime(group.lastActiveAt, language);
    } catch {
      return '';
    }
  }, [language, group.lastActiveAt]);

  // 格式化创建时间
  const createdTime = useMemo(() => {
    try {
      const date = new Date(group.createdAt);
      return new Intl.DateTimeFormat(language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return '';
    }
  }, [language, group.createdAt]);

  return (
    <div
      className={`
        px-4 py-3 mx-3 my-2 rounded-lg cursor-pointer
        transition-all duration-150 ease-out
        border-2
        ${isSelected
          ? `${borderColor} bg-zinc-700/50 shadow-lg`
          : 'border-transparent bg-zinc-800/50 hover:bg-zinc-700/30'
        }
      `}
    >
      {/* 左右两列布局 */}
      <div className="flex gap-6">
        {/* 左列：组信息 */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* 组名称 */}
          <div className="flex items-center gap-2 min-w-0">
            <TerminalTypeLogo
              variant="group"
              size="sm"
              badgeContent={windowCount > 9 ? '9+' : windowCount}
              data-testid="quick-switcher-logo-group"
            />
            <div className="min-w-0 truncate text-base font-semibold text-zinc-100">
              {nameHighlights.map((part, index) => (
                <span
                  key={index}
                  className={part.highlight ? 'bg-yellow-500 text-black' : ''}
                >
                  {part.text}
                </span>
              ))}
            </div>
            {group.archived && (
              <Archive size={14} className="text-orange-400 flex-shrink-0" />
            )}
          </div>

          {/* 窗口数量 */}
          <div className="text-sm text-zinc-400">
            {t('quickSwitcher.windowCount', { count: windowCount })}
          </div>
        </div>

        {/* 右列：详细信息 */}
        <div className="flex-shrink-0 space-y-1 text-xs">
          {/* 创建时间 */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">{t('quickSwitcher.createdAt')}</span>
            <span className="text-zinc-300">{createdTime}</span>
          </div>

          {/* 上次运行 */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">{t('quickSwitcher.lastRun')}</span>
            <span className="text-zinc-300">{relativeTime}</span>
          </div>

          {/* 窗口状态 */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">{t('quickSwitcher.windowStatus')}</span>
            <div className="flex items-center gap-1.5">
              {windowStatuses.map((ws, index) => (
                <StatusDot
                  key={ws.id}
                  status={ws.status}
                  size="sm"
                  title={t('quickSwitcher.window', { index: index + 1 })}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

QuickSwitcherGroupItem.displayName = 'QuickSwitcherGroupItem';
