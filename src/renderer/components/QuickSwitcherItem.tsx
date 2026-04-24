import React, { useMemo } from 'react';
import { Folder, ExternalLink } from 'lucide-react';
import { Pane, Window, WindowStatus } from '../types/window';
import { highlightMatches } from '../utils/fuzzySearch';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { StatusDot } from './StatusDot';
import { IDEIcon } from './icons/IDEIcons';
import { TerminalTypeLogo } from './icons/TerminalTypeLogo';
import { useIDESettings } from '../hooks/useIDESettings';
import { formatRelativeTime, useI18n, TranslationParams, TranslationKey } from '../i18n';
import { canPaneOpenInIDE, canPaneOpenLocalFolder, getWindowKind } from '../../shared/utils/terminalCapabilities';
import { getCurrentWindowTerminalPane, getCurrentWindowWorkingDirectory } from '../utils/windowWorkingDirectory';
import { isInactiveTerminalPaneStatus } from '../utils/windowLifecycle';
import {
  idePopupIconButtonClassName,
} from './ui/ide-popup';

interface QuickSwitcherItemProps {
  window: Window;
  displayName?: string;
  secondaryText?: string;
  status?: WindowStatus;
  panes?: Pane[];
  windowKind?: NonNullable<Window['kind']>;
  activePane?: Pane | null;
  workingDirectory?: string;
  isSelected: boolean;
  query: string;
}

/**
 * 获取状态标签
 */
function getStatusLabel(status: WindowStatus, t: (key: TranslationKey, params?: TranslationParams) => string): string {
  switch (status) {
    case WindowStatus.Running:
      return t('status.running');
    case WindowStatus.WaitingForInput:
      return t('status.waitingInput');
    case WindowStatus.Completed:
      return t('status.notStarted');
    case WindowStatus.Restoring:
      return t('status.restoring');
    default:
      return isInactiveTerminalPaneStatus(status) ? t('status.notStarted') : t('common.unknown');
  }
}

function getSelectedBorderColor(status: WindowStatus, archived: boolean): string {
  if (archived) return 'border-amber-500/70';

  switch (status) {
    case WindowStatus.Running:
      return 'border-emerald-500/70';
    case WindowStatus.WaitingForInput:
      return 'border-[rgb(var(--primary))]/75';
    case WindowStatus.Completed:
      return 'border-[rgb(var(--border))]';
    default:
      return isInactiveTerminalPaneStatus(status) ? 'border-[rgb(var(--border))]' : 'border-[rgb(var(--border))]';
  }
}

const quickSwitcherMatchHighlightClassName =
  'rounded-[4px] bg-[rgb(var(--primary))]/14 px-0.5 text-[rgb(var(--foreground))]';
const quickSwitcherInlineIconButtonClassName = `${idePopupIconButtonClassName} h-4 w-4 border-transparent bg-[color-mix(in_srgb,rgb(var(--secondary))_72%,transparent)]`;

/**
 * 快速切换面板列表项组件
 */
export const QuickSwitcherItem: React.FC<QuickSwitcherItemProps> = React.memo(({
  window: terminalWindow,
  displayName,
  secondaryText,
  status,
  panes: precomputedPanes,
  windowKind: precomputedWindowKind,
  activePane: precomputedActivePane,
  workingDirectory: precomputedWorkingDirectory,
  isSelected,
  query,
}) => {
  const { enabledIDEs } = useIDESettings();
  const { language, t } = useI18n();

  const aggregatedStatus = useMemo(
    () => status ?? getAggregatedStatus(terminalWindow.layout),
    [status, terminalWindow.layout],
  );
  const panes = useMemo(
    () => precomputedPanes ?? getAllPanes(terminalWindow.layout),
    [precomputedPanes, terminalWindow.layout],
  );
  const windowKind = useMemo(
    () => precomputedWindowKind ?? getWindowKind(terminalWindow),
    [precomputedWindowKind, terminalWindow],
  );
  const activePane = useMemo(
    () => precomputedActivePane ?? getCurrentWindowTerminalPane(terminalWindow),
    [precomputedActivePane, terminalWindow],
  );
  const resolvedDisplayName = displayName ?? terminalWindow.name;
  const workingDirectory = useMemo(
    () => precomputedWorkingDirectory ?? getCurrentWindowWorkingDirectory(terminalWindow),
    [precomputedWorkingDirectory, terminalWindow],
  );
  const resolvedSecondaryText = secondaryText ?? workingDirectory ?? '';
  const borderColor = getSelectedBorderColor(aggregatedStatus, terminalWindow.archived || false);
  const projectLinks = terminalWindow.projectConfig?.links ?? [];
  const canOpenFolder = Boolean(workingDirectory && activePane && canPaneOpenLocalFolder(activePane));
  const canOpenInIDEFromWindow = Boolean(enabledIDEs.length > 0 && activePane && canPaneOpenInIDE(activePane));

  const relativeTime = useMemo(() => {
    try {
      return formatRelativeTime(terminalWindow.lastActiveAt, language);
    } catch {
      return '';
    }
  }, [language, terminalWindow.lastActiveAt]);

  const createdTime = useMemo(() => {
    try {
      const date = new Date(terminalWindow.createdAt);
      return new Intl.DateTimeFormat(language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return '';
    }
  }, [language, terminalWindow.createdAt]);

  const nameHighlights = useMemo(() => highlightMatches(resolvedDisplayName, query), [resolvedDisplayName, query]);
  const secondaryHighlights = useMemo(() => highlightMatches(resolvedSecondaryText, query), [resolvedSecondaryText, query]);

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canOpenFolder && workingDirectory && window.electronAPI?.openFolder) {
      window.electronAPI.openFolder(workingDirectory);
    }
  };

  const handleOpenLink = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    if (window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(url).catch((error: Error) => {
        console.error('Failed to open URL:', error);
      });
    }
  };

  const handleOpenInIDE = (e: React.MouseEvent, ide: string) => {
    e.stopPropagation();
    if (canOpenInIDEFromWindow && workingDirectory && window.electronAPI?.openInIDE) {
      window.electronAPI.openInIDE(ide, workingDirectory)
        .then((response) => {
          if (!response.success) {
            console.error(`Failed to open in ${ide}:`, response.error);
          }
        })
        .catch((error: Error) => {
          console.error(`Failed to open in ${ide}:`, error);
        });
    }
  };

  return (
    <div
      className={`
        px-4 py-3 mx-3 my-2 rounded-lg cursor-pointer
        transition-all duration-150 ease-out
        border-2
        ${isSelected
          ? `${borderColor} bg-[rgb(var(--accent))] shadow-lg`
          : 'border-transparent bg-[color-mix(in_srgb,rgb(var(--card))_72%,transparent)] hover:bg-[rgb(var(--accent))]'
        }
      `}
    >
      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <TerminalTypeLogo
              variant={windowKind === 'mixed' ? 'mixed' : windowKind === 'ssh' ? 'ssh' : 'local'}
              size="md"
              data-testid={`quick-switcher-logo-${windowKind}`}
            />
            <div className="min-w-0 truncate text-base font-semibold text-[rgb(var(--foreground))]">
              {nameHighlights.map((part, index) => (
                <span
                  key={index}
                  className={part.highlight ? quickSwitcherMatchHighlightClassName : ''}
                >
                  {part.text}
                </span>
              ))}
            </div>
            {canOpenFolder && workingDirectory && (
              <button
                onClick={handleOpenFolder}
                className="group flex-shrink-0 rounded p-1 transition-colors hover:bg-[color-mix(in_srgb,rgb(var(--secondary))_72%,transparent)]"
                title={t('quickSwitcher.openFolderTitle', { path: workingDirectory })}
              >
                <Folder size={16} className="text-[rgb(var(--muted-foreground))] group-hover:text-[rgb(var(--foreground))]" />
              </button>
            )}
          </div>

          <div className="truncate text-sm text-[rgb(var(--muted-foreground))]">
            {secondaryHighlights.map((part, index) => (
              <span
                key={index}
                className={part.highlight ? quickSwitcherMatchHighlightClassName : ''}
              >
                {part.text}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.createdAt')}</span>
            <span className="text-[rgb(var(--foreground))]">{createdTime}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.lastRun')}</span>
            <span className="text-[rgb(var(--foreground))]">{relativeTime}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.paneStatus')}</span>
            <div className="flex items-center gap-1.5">
              {panes.map((pane, index) => (
                <StatusDot
                  key={pane.id}
                  status={pane.status}
                  size="sm"
                  title={t('quickSwitcher.pane', { index: index + 1, status: getStatusLabel(pane.status, t) })}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {projectLinks.length > 0 && (
              <div className="flex items-center gap-1">
                {projectLinks.slice(0, 4).map((link) => (
                  <button
                    key={link.name}
                    onClick={(e) => handleOpenLink(e, link.url)}
                    className={`${quickSwitcherInlineIconButtonClassName} cursor-pointer`}
                    title={link.name}
                  >
                    <ExternalLink size={10} />
                  </button>
                ))}
              </div>
            )}

            {projectLinks.length > 0 && canOpenInIDEFromWindow && (
              <div className="h-3 w-px bg-[rgb(var(--border))]" />
            )}

            {canOpenInIDEFromWindow && (
              <div className="flex items-center gap-1">
                {enabledIDEs.slice(0, 3).map((ide) => (
                  <button
                    key={ide.id}
                    onClick={(e) => handleOpenInIDE(e, ide.id)}
                    className="flex items-center justify-center w-4 h-4 hover:opacity-70 transition-opacity cursor-pointer"
                    title={t('common.openInIDE', { name: ide.name })}
                  >
                    <IDEIcon icon={ide.icon || ''} size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

QuickSwitcherItem.displayName = 'QuickSwitcherItem';
