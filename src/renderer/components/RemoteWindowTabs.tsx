import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Window } from '../types/window';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { getStandaloneSSHTargetKey } from '../utils/sshWindowBindings';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';
import { StatusDot } from './StatusDot';

interface RemoteWindowTabsProps {
  windows: Window[];
  activeWindowId: string;
  createLabel: string;
  tabsLabel: string;
  onWindowSelect: (windowId: string) => void;
  onCreate: () => void;
}

interface RemoteWindowTabItem {
  id: string;
  name: string;
  secondaryText: string;
  isActive: boolean;
  status: ReturnType<typeof getAggregatedStatus>;
}

export const RemoteWindowTabs: React.FC<RemoteWindowTabsProps> = ({
  windows,
  activeWindowId,
  createLabel,
  tabsLabel,
  onWindowSelect,
  onCreate,
}) => {
  const remoteWindows = useMemo<RemoteWindowTabItem[]>(() => {
    const activeWindow = windows.find((window) => window.id === activeWindowId);
    const activeTargetKey = activeWindow ? getStandaloneSSHTargetKey(activeWindow) : null;
    const candidates = windows
      .filter((window) => {
        if (window.archived || getWindowKind(window) !== 'ssh') {
          return false;
        }

        if (window.id === activeWindowId) {
          return true;
        }

        if (!activeTargetKey) {
          return false;
        }

        return getStandaloneSSHTargetKey(window) === activeTargetKey;
      })
      .sort((left, right) => {
        if (left.id === activeWindowId) {
          return -1;
        }

        if (right.id === activeWindowId) {
          return 1;
        }

        return new Date(right.lastActiveAt).getTime() - new Date(left.lastActiveAt).getTime();
      });

    return candidates.map((window) => {
      const panes = getAllPanes(window.layout);
      const activePane = panes.find((pane) => pane.id === window.activePaneId) ?? panes[0];
      const secondaryText = activePane?.ssh?.remoteCwd
        ?? activePane?.cwd
        ?? (activePane?.ssh ? `${activePane.ssh.user}@${activePane.ssh.host}` : '');

      return {
        id: window.id,
        name: window.name,
        secondaryText,
        isActive: window.id === activeWindowId,
        status: getAggregatedStatus(window.layout),
      };
    });
  }, [activeWindowId, windows]);

  if (remoteWindows.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 xl:block">
        {tabsLabel}
      </span>
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 pt-1">
        {remoteWindows.map((window) => (
          <button
            key={window.id}
            type="button"
            aria-label={window.name}
            onClick={() => onWindowSelect(window.id)}
            className={`group flex h-8 min-w-[140px] max-w-[220px] items-center gap-2 rounded-lg border px-3 text-left transition-colors ${
              window.isActive
                ? 'border-amber-400/70 bg-amber-500/12 text-zinc-50'
                : 'border-zinc-700 bg-zinc-800/90 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800'
            }`}
          >
            <StatusDot status={window.status} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{window.name}</div>
              <div className="truncate text-[10px] text-zinc-500 group-hover:text-zinc-400">
                {window.secondaryText}
              </div>
            </div>
          </button>
        ))}

        <button
          type="button"
          aria-label={createLabel}
          onClick={onCreate}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-emerald-500/60 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
        >
          <Plus size={14} />
          <span>{createLabel}</span>
        </button>
      </div>
    </div>
  );
};

RemoteWindowTabs.displayName = 'RemoteWindowTabs';
