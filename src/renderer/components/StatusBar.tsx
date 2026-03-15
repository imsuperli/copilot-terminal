import React, { useMemo } from 'react';
import { Activity, Keyboard, Pause } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';

export type StatusFilterTab = 'status:running' | 'status:waiting' | 'status:paused';

interface StatusBarProps {
  currentTab?: string;
  onTabChange?: (tab: string) => void;
}

/**
 * StatusBar 组件
 * 在侧边栏中显示各状态的窗格数量统计，点击可按状态筛选
 */
export const StatusBar = React.memo(function StatusBar({ currentTab, onTabChange }: StatusBarProps) {
  const windows = useWindowStore((state) => state.windows);
  const { t } = useI18n();

  // 缓存状态计数（统计所有未归档窗口中的所有窗格）
  const statusCounts = useMemo(() => {
    const activeWindows = windows.filter(w => !w.archived);
    const allPanes = activeWindows.flatMap(w => getAllPanes(w.layout));

    return {
      running: allPanes.filter(p => p.status === WindowStatus.Running).length,
      waiting: allPanes.filter(p => p.status === WindowStatus.WaitingForInput).length,
      paused: allPanes.filter(p => p.status === WindowStatus.Paused).length,
    };
  }, [windows]);

  // 缓存 aria-label
  const ariaLabel = useMemo(
    () =>
      t('statusBar.ariaLabel', {
        running: statusCounts.running,
        waiting: statusCounts.waiting,
        paused: statusCounts.paused,
      }),
    [statusCounts, t]
  );

  const handleClick = (tab: StatusFilterTab) => {
    // 再次点击取消筛选，回到活跃终端
    onTabChange?.(currentTab === tab ? 'active' : tab);
  };

  const items: { tab: StatusFilterTab; icon: typeof Activity; colorClass: string; activeClass: string; label: string; count: number }[] = [
    { tab: 'status:running', icon: Activity, colorClass: 'text-green-500', activeClass: 'bg-green-500/10 border-green-500/50', label: t('status.running'), count: statusCounts.running },
    { tab: 'status:waiting', icon: Keyboard, colorClass: 'text-blue-500', activeClass: 'bg-blue-500/10 border-blue-500/50', label: t('status.waitingInput'), count: statusCounts.waiting },
    { tab: 'status:paused', icon: Pause, colorClass: 'text-gray-500', activeClass: 'bg-gray-500/10 border-gray-500/50', label: t('status.paused'), count: statusCounts.paused },
  ];

  return (
    <div
      aria-live="polite"
      aria-label={ariaLabel}
      className="space-y-2"
    >
      {items.map(({ tab, icon: Icon, colorClass, activeClass, label, count }) => {
        const isActive = currentTab === tab;
        return (
          <button
            key={tab}
            onClick={() => handleClick(tab)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
              isActive
                ? activeClass
                : 'bg-[rgb(var(--card))] border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${colorClass}`} aria-hidden="true" />
              <span className="text-xs text-[rgb(var(--muted-foreground))]">{label}</span>
            </div>
            <span className={`text-sm font-semibold ${colorClass}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
});
