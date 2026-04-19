import React, { useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { WindowGroup } from '../../shared/types/window-group';
import { Window } from '../../shared/types/window';
import { getWindowStatus } from '../../shared/utils/status-utils';
import { getAllWindowIds } from '../utils/groupLayoutHelpers';
import { getAllPanes } from '../utils/layoutHelpers';
import { StatusDot } from './StatusDot';
import { getStatusLabelKey } from '../utils/statusHelpers';
import { useI18n } from '../i18n';
import { idePopupSurfaceClassName } from './ui/ide-popup';

const MAX_ICONS = 5;

export interface GroupStatusIconsProps {
  group: WindowGroup;
  windows: Window[];
}

/**
 * GroupStatusIcons 组件
 * 在 GroupCard 主页卡片中水平展示组内各窗口的状态图标
 * 使用 StatusDot（与 WindowCard 一致的大小和风格）
 */
export const GroupStatusIcons: React.FC<GroupStatusIconsProps> = React.memo(({
  group,
  windows,
}) => {
  const { t } = useI18n();

  const items = useMemo(() => {
    const windowIds = getAllWindowIds(group.layout);
    return windowIds
      .map(id => windows.find(w => w.id === id))
      .filter((w): w is Window => w != null)
      .map(w => ({
        id: w.id,
        name: w.name,
        status: getWindowStatus(w),
        paneCount: getAllPanes(w.layout).length,
      }));
  }, [group.layout, windows]);

  if (items.length === 0) {
    return null;
  }

  const visible = items.slice(0, MAX_ICONS);
  const overflow = items.length - MAX_ICONS;

  return (
    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
      {visible.map((item, index) => (
        <Tooltip.Provider key={item.id}>
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <div className="relative">
                <StatusDot
                  status={item.status}
                  size="sm"
                />
                {item.paneCount > 1 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_92%,transparent)] text-[8px] font-bold leading-none text-[rgb(var(--foreground))]">
                    {item.paneCount}
                  </span>
                )}
              </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className={`${idePopupSurfaceClassName} z-[1100] rounded px-2 py-1 text-xs text-[rgb(var(--foreground))] shadow-xl`}
                side="top"
                sideOffset={5}
              >
                {item.name} - {t(getStatusLabelKey(item.status))}（{item.paneCount} 窗格）
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-[rgb(var(--muted-foreground))] ml-0.5 font-medium">
          +{overflow}
        </span>
      )}
    </div>
  );
});

GroupStatusIcons.displayName = 'GroupStatusIcons';
