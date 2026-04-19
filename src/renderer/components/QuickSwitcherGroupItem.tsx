import React, { useMemo } from 'react';
import { Archive } from 'lucide-react';
import { WindowGroup } from '../../shared/types/window-group';
import { WindowStatus } from '../../shared/types/window';
import { highlightMatches } from '../utils/fuzzySearch';
import { useWindowStore } from '../stores/windowStore';
import { getWindowCount, getAllWindowIds } from '../utils/groupLayoutHelpers';
import { getAggregatedStatus } from '../utils/layoutHelpers';
import { StatusDot } from './StatusDot';
import { formatRelativeTime, useI18n } from '../i18n';
import { TerminalTypeLogo } from './icons/TerminalTypeLogo';

interface QuickSwitcherGroupItemProps {
  group: WindowGroup;
  windowCount?: number;
  windowStatuses?: Array<{ id: string; status: WindowStatus }>;
  isSelected: boolean;
  query: string;
}

/**
 * 获取选中边框颜色（窗口组）
 */
function getSelectedBorderColor(archived: boolean): string {
  if (archived) return 'border-amber-500/70';
  return 'border-[rgb(var(--primary))]/72';
}

const quickSwitcherMatchHighlightClassName =
  'rounded-[4px] bg-[rgb(var(--primary))]/14 px-0.5 text-[rgb(var(--foreground))]';

/**
 * 快速切换面板窗口组列表项组件
 */
export const QuickSwitcherGroupItem: React.FC<QuickSwitcherGroupItemProps> = React.memo(({
  group,
  windowCount: precomputedWindowCount,
  windowStatuses: precomputedWindowStatuses,
  isSelected,
  query,
}) => {
  const { language, t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const windowsById = useMemo(() => new Map(windows.map((window) => [window.id, window])), [windows]);

  const windowCount = useMemo(
    () => precomputedWindowCount ?? getWindowCount(group.layout),
    [group.layout, precomputedWindowCount],
  );

  const windowStatuses = useMemo(() => {
    if (precomputedWindowStatuses) {
      return precomputedWindowStatuses;
    }

    const windowIds = getAllWindowIds(group.layout);
    return windowIds
      .map((id) => windowsById.get(id))
      .filter((w): w is NonNullable<typeof w> => w !== undefined)
      .map((w) => ({
        id: w.id,
        status: getAggregatedStatus(w.layout),
      }));
  }, [group.layout, precomputedWindowStatuses, windowsById]);

  const borderColor = getSelectedBorderColor(group.archived || false);
  const nameHighlights = useMemo(() => highlightMatches(group.name, query), [group.name, query]);

  const relativeTime = useMemo(() => {
    try {
      return formatRelativeTime(group.lastActiveAt, language);
    } catch {
      return '';
    }
  }, [language, group.lastActiveAt]);

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
          ? `${borderColor} bg-[rgb(var(--accent))] shadow-lg`
          : 'border-transparent bg-[color-mix(in_srgb,rgb(var(--card))_72%,transparent)] hover:bg-[rgb(var(--accent))]'
        }
      `}
    >
      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <TerminalTypeLogo
              variant="group"
              size="sm"
              badgeContent={windowCount > 9 ? '9+' : windowCount}
              data-testid="quick-switcher-logo-group"
            />
            <div className="min-w-0 truncate text-base font-semibold text-[rgb(var(--foreground))]">
              {nameHighlights.map((part, index) => (
                <span
                  key={index}
                  className={part.highlight ? quickSwitcherMatchHighlightClassName : ''}
                >
                  {part.text}
                </span>
              ))}
            </div>
            {group.archived && (
              <Archive size={14} className="text-amber-400 flex-shrink-0" />
            )}
          </div>

          <div className="text-sm text-[rgb(var(--muted-foreground))]">
            {t('quickSwitcher.windowCount', { count: windowCount })}
          </div>
        </div>

        <div className="flex-shrink-0 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.createdAt')}</span>
            <span className="text-[rgb(var(--foreground))]">{createdTime}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.lastRun')}</span>
            <span className="text-[rgb(var(--foreground))]">{relativeTime}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.windowStatus')}</span>
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
});

QuickSwitcherGroupItem.displayName = 'QuickSwitcherGroupItem';
