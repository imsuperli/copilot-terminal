import React, { useMemo } from 'react';
import { Activity, Pause, CheckCircle, XCircle } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { WindowStatus } from '../types/window';

/**
 * StatusBar 组件
 * 在侧边栏中显示各状态的窗口数量统计
 */
export const StatusBar = React.memo(function StatusBar() {
  const windows = useWindowStore((state) => state.windows);

  // 缓存状态计数
  const statusCounts = useMemo(() => ({
    running: windows.filter((w) => w.status === WindowStatus.Running).length,
    waiting: windows.filter((w) => w.status === WindowStatus.WaitingForInput).length,
    completed: windows.filter((w) => w.status === WindowStatus.Completed).length,
    error: windows.filter((w) => w.status === WindowStatus.Error).length,
  }), [windows]);

  // 缓存 aria-label
  const ariaLabel = useMemo(
    () =>
      `窗口状态统计：运行中 ${statusCounts.running} 个，等待输入 ${statusCounts.waiting} 个，已完成 ${statusCounts.completed} 个，出错 ${statusCounts.error} 个`,
    [statusCounts]
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
          <Activity className="w-4 h-4 text-[rgb(var(--success))]" aria-hidden="true" />
          <span className="text-xs text-[rgb(var(--muted-foreground))]">运行中</span>
        </div>
        <span className="text-sm font-semibold text-[rgb(var(--success))]">
          {statusCounts.running}
        </span>
      </div>

      {/* 等待输入 */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgb(var(--card))] border border-[rgb(var(--border))]">
        <div className="flex items-center gap-2">
          <Pause className="w-4 h-4 text-[rgb(var(--info))]" aria-hidden="true" />
          <span className="text-xs text-[rgb(var(--muted-foreground))]">等待输入</span>
        </div>
        <span className="text-sm font-semibold text-[rgb(var(--info))]">
          {statusCounts.waiting}
        </span>
      </div>

      {/* 已完成 */}
      {statusCounts.completed > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgb(var(--card))] border border-[rgb(var(--border))]">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[rgb(var(--muted-foreground))]" aria-hidden="true" />
            <span className="text-xs text-[rgb(var(--muted-foreground))]">已完成</span>
          </div>
          <span className="text-sm font-semibold text-[rgb(var(--muted-foreground))]">
            {statusCounts.completed}
          </span>
        </div>
      )}

      {/* 出错 */}
      {statusCounts.error > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgb(var(--card))] border border-[rgb(var(--border))]">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-[rgb(var(--error))]" aria-hidden="true" />
            <span className="text-xs text-[rgb(var(--muted-foreground))]">出错</span>
          </div>
          <span className="text-sm font-semibold text-[rgb(var(--error))]">
            {statusCounts.error}
          </span>
        </div>
      )}
    </div>
  );
});


