import React, { useMemo } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Window } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { getStandaloneSSHWindowsForTarget } from '../utils/sshWindowBindings';

interface RemoteWindowTabsProps {
  windows: Window[];
  activeWindowId: string;
  tabsLabel: string;
  cloneLabel: string;
  closeLabel: string;
  onWindowSelect: (windowId: string) => void;
  onWindowClone: (windowId: string) => void;
  onWindowClose: (windowId: string) => void;
}

interface RemoteWindowTabItem {
  id: string;
  name: string;
  primaryText: string;
  isActive: boolean;
}

export const RemoteWindowTabs: React.FC<RemoteWindowTabsProps> = ({
  windows,
  activeWindowId,
  tabsLabel,
  cloneLabel,
  closeLabel,
  onWindowSelect,
  onWindowClone,
  onWindowClose,
}) => {
  const remoteWindows = useMemo<RemoteWindowTabItem[]>(() => {
    const candidates = getStandaloneSSHWindowsForTarget(windows, activeWindowId);

    return candidates.map((window) => {
      const panes = getAllPanes(window.layout);
      const activePane = panes.find((pane) => pane.id === window.activePaneId) ?? panes[0];
      const resolvedText = activePane?.ssh?.remoteCwd
        ?? activePane?.cwd
        ?? (activePane?.ssh ? `${activePane.ssh.user}@${activePane.ssh.host}` : '');
      const primaryText = resolvedText || window.name;

      return {
        id: window.id,
        name: window.name,
        primaryText,
        isActive: window.id === activeWindowId,
      };
    });
  }, [activeWindowId, windows]);

  if (remoteWindows.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 self-stretch items-stretch gap-3">
      <span className="hidden shrink-0 self-center text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 xl:block">
        {tabsLabel}
      </span>
      <div className="flex min-w-0 self-stretch items-stretch overflow-x-auto border-x border-zinc-800">
        {remoteWindows.map((window, index) => (
          <ContextMenu.Root key={window.id}>
            <ContextMenu.Trigger asChild>
              <button
                type="button"
                aria-label={window.name}
                onClick={() => onWindowSelect(window.id)}
                className={`group flex h-full min-w-[140px] max-w-[220px] items-center px-4 text-left transition-colors ${
                  window.isActive
                    ? 'bg-zinc-800/85 text-zinc-50'
                    : 'text-zinc-300 hover:bg-zinc-800/55'
                } ${index < remoteWindows.length - 1 ? 'border-r border-zinc-800' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">
                    {window.primaryText}
                  </div>
                </div>
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content
                className="z-[12040] min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-lg"
              >
                <ContextMenu.Item
                  className="flex items-center rounded-md px-3 py-2 text-sm text-zinc-100 outline-none transition-colors hover:bg-zinc-800 focus:bg-zinc-800"
                  onSelect={() => onWindowClone(window.id)}
                >
                  {cloneLabel}
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="flex items-center rounded-md px-3 py-2 text-sm text-red-300 outline-none transition-colors hover:bg-red-500/10 focus:bg-red-500/10"
                  onSelect={() => onWindowClose(window.id)}
                >
                  {closeLabel}
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ))}
      </div>
    </div>
  );
};

RemoteWindowTabs.displayName = 'RemoteWindowTabs';
