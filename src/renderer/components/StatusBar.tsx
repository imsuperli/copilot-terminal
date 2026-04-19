import React, { useMemo } from 'react';
import { Activity, Keyboard, Pause } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { useI18n } from '../i18n';
import { SSHProfile } from '../../shared/types/ssh';
import { getStatusCardCounts } from '../utils/cardCollection';

export type StatusFilterTab = 'status:running' | 'status:waiting' | 'status:paused';

interface StatusBarProps {
  currentTab?: string;
  onTabChange?: (tab: string) => void;
  sshEnabled?: boolean;
  sshProfiles?: SSHProfile[];
}

/**
 * StatusBar 组件
 * 在侧边栏中显示各状态的卡片数量统计，点击可按状态筛选
 */
export const StatusBar = React.memo(function StatusBar({
  currentTab,
  onTabChange,
  sshEnabled = false,
  sshProfiles = [],
}: StatusBarProps) {
  const windows = useWindowStore((state) => state.windows);
  const groups = useWindowStore((state) => state.groups);
  const { t } = useI18n();

  // 计数逻辑与 CardGrid 保持一致，避免状态数字与实际列表不匹配。
  const statusCounts = useMemo(() => {
    return getStatusCardCounts(windows, groups, {
      sshEnabled,
      sshProfiles,
    });
  }, [groups, sshEnabled, sshProfiles, windows]);

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

  const pausedToneClassName = 'text-[rgb(var(--muted-foreground))]';
  const pausedActiveClassName =
    'bg-[color-mix(in_srgb,rgb(var(--secondary))_84%,transparent)] border-[rgb(var(--border))]';
  const idleButtonClassName = `border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_76%,transparent)] hover:bg-[rgb(var(--accent))]`;
  const items: { tab: StatusFilterTab; icon: typeof Activity; colorClass: string; activeClass: string; label: string; count: number }[] = [
    { tab: 'status:running', icon: Activity, colorClass: 'text-green-500', activeClass: 'bg-green-500/10 border-green-500/50', label: t('status.running'), count: statusCounts.running },
    { tab: 'status:waiting', icon: Keyboard, colorClass: 'text-[rgb(var(--primary))]', activeClass: 'bg-[rgb(var(--primary))]/10 border-[rgb(var(--primary))]/40', label: t('status.waitingInput'), count: statusCounts.waiting },
    { tab: 'status:paused', icon: Pause, colorClass: pausedToneClassName, activeClass: pausedActiveClassName, label: t('status.paused'), count: statusCounts.paused },
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
                : idleButtonClassName
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
