import React, { useMemo } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { CopyPlus, X } from 'lucide-react';
import { Window } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { getStandaloneSSHWindowsForTarget } from '../utils/sshWindowBindings';
import { isTerminalPane } from '../../shared/utils/terminalCapabilities';
import { getPathLeafLabel } from '../utils/pathDisplay';
import { AppTooltip } from './ui/AppTooltip';
import {
  ideMenuContentClassName,
  ideMenuDangerItemClassName,
  ideMenuItemClassName,
  IdeMenuItemContent,
} from './ui/ide-menu';

interface RemoteWindowTabsProps {
  windows: Window[];
  activeWindowId: string;
  cloneLabel: string;
  closeLabel: string;
  onWindowSelect: (windowId: string) => void;
  onWindowClone: (windowId: string) => void;
  onWindowClose: (windowId: string) => void;
  variant?: 'toolbar' | 'floating' | 'windowHeader';
}

interface RemoteWindowTabItem {
  id: string;
  name: string;
  primaryText: string;
  tooltipText: string;
  isActive: boolean;
}

const RemoteWindowTabsComponent: React.FC<RemoteWindowTabsProps> = ({
  windows,
  activeWindowId,
  cloneLabel,
  closeLabel,
  onWindowSelect,
  onWindowClone,
  onWindowClose,
  variant = 'toolbar',
}) => {
  const isFloating = variant === 'floating';
  const isWindowHeader = variant === 'windowHeader';
  const remoteWindows = useMemo<RemoteWindowTabItem[]>(() => {
    const candidates = getStandaloneSSHWindowsForTarget(windows, activeWindowId);

    return candidates.map((window) => {
      const panes = getAllPanes(window.layout);
      const activePane = panes.find((pane) => pane.id === window.activePaneId && isTerminalPane(pane))
        ?? panes.find((pane) => isTerminalPane(pane));
      const resolvedText = activePane?.cwd
        ?? activePane?.ssh?.remoteCwd
        ?? (activePane?.ssh ? `${activePane.ssh.user}@${activePane.ssh.host}` : '');
      const primaryText = getPathLeafLabel(resolvedText) || resolvedText || window.name;

      return {
        id: window.id,
        name: window.name,
        primaryText,
        tooltipText: resolvedText || window.name,
        isActive: window.id === activeWindowId,
      };
    });
  }, [activeWindowId, windows]);

  if (remoteWindows.length === 0) {
    return null;
  }

  return (
    <div className={isFloating ? 'flex h-auto min-w-0 items-center' : 'flex h-[34px] min-w-0 items-stretch'}>
      <div className={isFloating ? 'flex h-full min-w-0 items-center gap-1 overflow-x-auto px-1' : 'terminal-remote-tab-strip flex h-full min-w-0 items-stretch overflow-x-auto'}>
        {remoteWindows.map((window, index) => (
          <ContextMenu.Root key={window.id}>
            <ContextMenu.Trigger asChild>
              <div
                className={isFloating
                  ? `group relative flex h-8 min-w-[120px] max-w-[200px] items-stretch rounded-lg border transition-colors ${
                    window.isActive
                      ? 'border-[rgb(var(--primary))]/40 bg-[color-mix(in_srgb,rgb(var(--secondary))_86%,transparent)]'
                      : 'border-[rgb(var(--border))]/80 bg-[color-mix(in_srgb,rgb(var(--background))_38%,transparent)] hover:border-[rgb(var(--ring))]/45 hover:bg-[rgb(var(--accent))]'
                  }`
                  : `terminal-remote-tab group ${window.isActive ? 'terminal-remote-tab-active' : 'terminal-remote-tab-inactive'}`
                }
              >
                <AppTooltip
                  content={window.tooltipText}
                  delayDuration={250}
                >
                  <button
                    type="button"
                    aria-label={window.name}
                    onClick={() => onWindowSelect(window.id)}
                    className={`relative z-[1] flex h-full w-full min-w-0 items-center px-3 text-left focus:outline-none transition-colors ${
                      window.isActive
                        ? 'text-[rgb(var(--titlebar-foreground))]'
                        : 'text-[rgb(var(--titlebar-muted))] hover:text-[rgb(var(--titlebar-foreground))]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[12px] font-medium leading-none tracking-[0.01em] ${isFloating ? 'font-mono' : ''}`}>
                        {window.primaryText}
                      </div>
                    </div>
                    {isWindowHeader && (
                      <span className="ml-3 flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none text-inherit opacity-80 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <span aria-hidden="true">&times;</span>
                      </span>
                    )}
                  </button>
                </AppTooltip>
                {isFloating && (
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute transition-colors ${
                      `bottom-1 left-3 h-1 w-1 rounded-full ${window.isActive ? 'bg-[rgb(var(--primary))]' : 'bg-transparent'}`
                    }`}
                  />
                )}
                {isWindowHeader && (
                  <>
                    <button
                      type="button"
                      aria-label={`${closeLabel} ${window.primaryText}`}
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onWindowClose(window.id);
                      }}
                      className="absolute inset-y-0 right-2 z-[2] flex w-5 items-center justify-center rounded-sm text-[13px] leading-none text-[rgb(var(--titlebar-muted))] opacity-0 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:text-[rgb(var(--titlebar-foreground))]"
                    >
                      <span aria-hidden="true">&times;</span>
                    </button>
                    {!window.isActive && !remoteWindows[index + 1]?.isActive && index < remoteWindows.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute right-0 top-1/2 h-3 -translate-y-1/2 border-r"
                        style={{ borderColor: 'var(--appearance-remote-tab-separator-color)' }}
                      />
                    )}
                  </>
                )}
                {isFloating && (
                  <button
                    type="button"
                    aria-label={`${closeLabel} ${window.primaryText}`}
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      onWindowClose(window.id);
                    }}
                    className="absolute right-1.5 top-1/2 z-[2] flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-[11px] font-medium leading-none text-[rgb(var(--muted-foreground))] opacity-0 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:text-[rgb(var(--foreground))]"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                )}
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content
                className={ideMenuContentClassName}
              >
                <ContextMenu.Item
                  className={ideMenuItemClassName}
                  onSelect={() => onWindowClone(window.id)}
                >
                  <IdeMenuItemContent
                    icon={<CopyPlus size={14} />}
                    label={cloneLabel}
                  />
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={ideMenuDangerItemClassName}
                  onSelect={() => onWindowClose(window.id)}
                >
                  <IdeMenuItemContent
                    icon={<X size={14} />}
                    label={closeLabel}
                  />
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ))}
      </div>
    </div>
  );
};

export const RemoteWindowTabs = React.memo(RemoteWindowTabsComponent);
RemoteWindowTabs.displayName = 'RemoteWindowTabs';
