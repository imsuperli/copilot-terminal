import React, { useMemo } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Window } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { getStandaloneSSHWindowsForTarget } from '../utils/sshWindowBindings';
import { isTerminalPane } from '../../shared/utils/terminalCapabilities';
import { AppTooltip } from './ui/AppTooltip';

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
      const activePane = panes.find((pane) => pane.id === window.activePaneId && isTerminalPane(pane))
        ?? panes.find((pane) => isTerminalPane(pane));
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
                className={`group relative flex h-full min-w-[108px] max-w-[164px] items-stretch ${
                  index > 0 ? '-ml-px' : ''
                } border-x border-zinc-700/80`}
              >
                <AppTooltip
                  content={window.primaryText}
                  delayDuration={250}
                >
                  <button
                    type="button"
                    aria-label={window.name}
                    title={window.primaryText}
                    onClick={() => onWindowSelect(window.id)}
                    className={`relative z-[1] flex h-full w-full min-w-0 items-center pl-3 pr-8 text-left focus:outline-none transition-colors ${
                      window.isActive
                        ? 'text-zinc-50'
                        : 'text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[12px] font-medium tracking-[0.01em]">
                        {window.primaryText}
                      </div>
                    </div>
                  </button>
                </AppTooltip>
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 transition-colors ${
                    window.isActive ? 'bg-sky-400' : 'bg-transparent'
                  }`}
                />
                <button
                  type="button"
                  aria-label={`${closeLabel} ${window.primaryText}`}
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onWindowClose(window.id);
                  }}
                  className="absolute right-1.5 top-1.5 z-[2] flex h-4 w-4 items-center justify-center text-[12px] font-medium leading-none text-zinc-500 opacity-0 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:text-zinc-100"
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
