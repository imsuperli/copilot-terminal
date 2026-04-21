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
  variant?: 'toolbar' | 'floating';
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
    <div className={isFloating ? 'flex h-auto min-w-0 items-center' : 'flex h-full min-w-0 self-stretch items-stretch'}>
      <div className={isFloating ? 'flex h-full min-w-0 items-center gap-1 overflow-x-auto px-1' : 'flex h-full min-w-0 self-stretch items-stretch overflow-x-auto'}>
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
                  : `group relative flex h-full min-w-[108px] max-w-[164px] items-stretch ${
                    index > 0 ? '-ml-px' : ''
                  } border-x border-[rgb(var(--border))]`
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
                    className={`relative z-[1] flex h-full w-full min-w-0 items-center pl-3 pr-8 text-left focus:outline-none transition-colors ${
                      window.isActive
                        ? 'text-[rgb(var(--foreground))]'
                        : 'text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))]'
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
                  className={`pointer-events-none absolute transition-colors ${
                    isFloating
                      ? `bottom-1 left-3 h-1 w-1 rounded-full ${window.isActive ? 'bg-[rgb(var(--primary))]' : 'bg-transparent'}`
                      : `bottom-0 left-0 right-0 h-0.5 ${window.isActive ? 'bg-[rgb(var(--primary))]' : 'bg-transparent'}`
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
                  className="absolute right-1.5 top-1.5 z-[2] flex h-4 w-4 items-center justify-center text-[12px] font-medium leading-none text-[rgb(var(--muted-foreground))] opacity-0 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:text-[rgb(var(--foreground))]"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
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
