import React, { useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { WindowGroup, GroupLayoutNode } from '../../shared/types/window-group';
import { Window, WindowStatus } from '../types/window';
import { getGroupStatus, getWindowStatus } from '../../shared/utils/status-utils';
import { StatusIconWithBadge } from './StatusIconWithBadge';
import { getStatusLabelKey } from '../utils/statusHelpers';
import { useI18n } from '../i18n';

export interface GroupStatusIconProps {
  group: WindowGroup;
  windows: Window[];
}

/**
 * 递归计算布局树中的窗口数量
 */
function countWindowsInLayout(layout: GroupLayoutNode): number {
  if (layout.type === 'window') {
    return 1;
  }
  if (layout.type === 'split' && Array.isArray(layout.children)) {
    return layout.children.reduce((sum, child) => sum + countWindowsInLayout(child), 0);
  }
  return 0;
}

/**
 * 递归提取布局树中的所有窗口 ID
 */
function getWindowIdsFromLayout(layout: GroupLayoutNode): string[] {
  if (layout.type === 'window') {
    return [layout.id];
  }
  if (layout.type === 'split' && Array.isArray(layout.children)) {
    return layout.children.flatMap(child => getWindowIdsFromLayout(child));
  }
  return [];
}

/**
 * GroupStatusIcon 组件
 * 用于 GroupView Sidebar 场景，显示窗口组的聚合状态图标和窗口数量角标
 */
export const GroupStatusIcon: React.FC<GroupStatusIconProps> = ({ group, windows }) => {
  const { t } = useI18n();
  const status = getGroupStatus(group, windows);
  const count = countWindowsInLayout(group.layout);

  // 计算状态分布用于 tooltip
  const tooltipText = useMemo(() => {
    const windowIds = getWindowIdsFromLayout(group.layout);
    const groupWindows = windows.filter(w => windowIds.includes(w.id));

    const statusCounts = new Map<WindowStatus, number>();
    for (const w of groupWindows) {
      const s = getWindowStatus(w);
      statusCounts.set(s, (statusCounts.get(s) || 0) + 1);
    }

    const parts: string[] = [];
    for (const [s, c] of statusCounts) {
      parts.push(`${c} ${t(getStatusLabelKey(s))}`);
    }

    return `${group.name}\n${parts.join(', ')}`;
  }, [group, windows, t]);

  return (
    <Tooltip.Provider>
      <Tooltip.Root delayDuration={300}>
        <Tooltip.Trigger asChild>
          <div>
            <StatusIconWithBadge
              status={status}
              count={count}
              size="small"
            />
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-[1100] whitespace-pre-line rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_94%,transparent)] px-2 py-1 text-xs text-[rgb(var(--foreground))] shadow-xl backdrop-blur"
            side="right"
            sideOffset={5}
          >
            {tooltipText}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

GroupStatusIcon.displayName = 'GroupStatusIcon';
