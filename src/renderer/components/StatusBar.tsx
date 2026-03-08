import React, { useMemo } from 'react';
import { Activity, Keyboard, Pause } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';

/**
 * StatusBar 组件
 * 在侧边栏中显示各状态的窗格数量统计
 */
export const StatusBar = React.memo(function StatusBar() {
  const windows = useWindowStore((state) => state.windows);
  const { t } = useI18n();

  // 缓存状态计数（统计所有未归档窗口中的所有窗格）
  const statusCounts = useMemo(() => {
    const activeWindows = windows.filter(w => !w.archived);

    // 收集所有窗格
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

  return (
    <div
      aria-live="polite"
      aria-label={ariaLabel}
      className="space-y-2"
    >
      {/* 运行中 */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgb(var(--card))] border border-[rgb(var(--border))]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-500" aria-hidden="true" />
          <span className="text-xs text-[rgb(var(--muted-foreground))]">{t('status.running')}</span>
        </div>
        <span className="text-sm font-semibold text-green-500">
          {statusCounts.running}
        </span>
      </div>

      {/* 等待输入 */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgb(var(--card))] border border-[rgb(var(--border))]">
        <div className="flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-blue-500" aria-hidden="true" />
          <span className="text-xs text-[rgb(var(--muted-foreground))]">{t('status.waitingInput')}</span>
        </div>
        <span className="text-sm font-semibold text-blue-500">
          {statusCounts.waiting}
        </span>
      </div>

      {/* 暂停 */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgb(var(--card))] border border-[rgb(var(--border))]">
        <div className="flex items-center gap-2">
          <Pause className="w-4 h-4 text-gray-500" aria-hidden="true" />
          <span className="text-xs text-[rgb(var(--muted-foreground))]">{t('status.paused')}</span>
        </div>
        <span className="text-sm font-semibold text-gray-500">
          {statusCounts.paused}
        </span>
      </div>
    </div>
  );
});
