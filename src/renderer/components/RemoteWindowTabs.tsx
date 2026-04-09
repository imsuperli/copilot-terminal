import React, { useMemo } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Window } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { getStandaloneSSHWindowsForTarget } from '../utils/sshWindowBindings';

interface RemoteWindowTabsProps {
  windows: Window[];
  activeWindowId: string;
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
    <div className="flex h-full min-w-0 self-stretch items-stretch">
      <div className="flex h-full min-w-0 self-stretch items-stretch overflow-x-auto">
        {remoteWindows.map((window, index) => (
          <ContextMenu.Root key={window.id}>
            <ContextMenu.Trigger asChild>
              <div
                className={`group relative flex h-full min-w-[118px] max-w-[176px] items-stretch transition-all duration-150 ${
                  window.isActive
                    ? 'z-[1] text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-12px_18px_rgba(0,0,0,0.24)]'
                    : 'text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:text-zinc-100 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-10px_16px_rgba(0,0,0,0.16)]'
                } ${index > 0 ? '-ml-px' : ''} border-x border-zinc-700/80`}
              >
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-3 top-0 h-px transition-opacity ${
                    window.isActive ? 'bg-white/20 opacity-100' : 'bg-white/8 opacity-70'
                  }`}
                />
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 transition-opacity ${
                    window.isActive
                      ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0)_28%,rgba(0,0,0,0.18)_100%)] opacity-100'
                      : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)_26%,rgba(0,0,0,0.12)_100%)] opacity-100'
                  }`}
                />
                <button
                  type="button"
                  aria-label={window.name}
                  onClick={() => onWindowSelect(window.id)}
                  className="relative z-[1] flex h-full w-full min-w-0 items-center pl-3 pr-8 text-left focus:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-xs font-medium tracking-[0.01em] ${
                      window.isActive ? 'drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]' : ''
                    }`}>
                      {window.primaryText}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`${closeLabel} ${window.primaryText}`}
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onWindowClose(window.id);
                  }}
                  className="absolute right-1 top-1 z-[2] flex h-4 w-4 items-center justify-center rounded-sm text-[13px] font-medium leading-none text-zinc-500 opacity-0 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-black/30 hover:text-zinc-100"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content
                className="z-[12040] min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-lg"
              >
                <ContextMenu.Item
                  className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm text-zinc-100 outline-none transition-colors hover:bg-zinc-800 focus:bg-zinc-800"
                  onSelect={() => onWindowClone(window.id)}
                >
                  {cloneLabel}
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm text-red-300 outline-none transition-colors hover:bg-red-500/10 focus:bg-red-500/10"
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
