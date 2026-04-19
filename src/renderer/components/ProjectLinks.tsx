import React, { useCallback } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { ProjectLink } from '../../shared/types/project-config';
import { AppTooltip } from './ui/AppTooltip';
import {
  ideMenuContentClassName,
  ideMenuItemClassName,
  IdeMenuItemContent,
} from './ui/ide-menu';

interface ProjectLinksProps {
  links: ProjectLink[];
  variant?: 'card' | 'toolbar';
  maxDisplay?: number;
  onOpenLink?: (e: React.MouseEvent, url: string) => void;
}

/**
 * 项目快捷链接组件
 * 支持两种显示模式：卡片、工具栏
 */
export const ProjectLinks: React.FC<ProjectLinksProps> = ({
  links,
  variant = 'card',
  maxDisplay = 6,
  onOpenLink: externalOnOpenLink,
}) => {
  // 打开外部链接
  const handleOpenLink = useCallback(
    (e: React.MouseEvent, url: string) => {
      if (externalOnOpenLink) {
        externalOnOpenLink(e, url);
        return;
      }

      e.stopPropagation();

      if (!globalThis.electronAPI?.openExternalUrl) {
        console.error('openExternalUrl is not available');
        return;
      }

      globalThis.electronAPI.openExternalUrl(url)
        .catch((error: Error) => {
          console.error('Failed to open URL:', error);
        });
    },
    [externalOnOpenLink]
  );

  if (!links || links.length === 0) {
    return null;
  }

  const visibleLinks = links.slice(0, maxDisplay);
  const hiddenLinks = links.slice(maxDisplay);

  // 卡片模式：显示在卡片底部
  if (variant === 'card') {
    return (
      <>
        {visibleLinks.map((link) => (
          <Tooltip.Provider key={link.name}>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => handleOpenLink(e, link.url)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-[rgb(var(--foreground))] bg-[rgb(var(--secondary))] rounded hover:bg-[rgb(var(--accent))] transition-colors focus:outline-none focus:ring-1 focus:ring-[rgb(var(--ring))] whitespace-nowrap flex-shrink-0"
                >
                  <ExternalLink size={12} />
                  <span className="truncate max-w-[60px]">{link.name}</span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-[rgb(var(--border))] max-w-xs break-all"
                  side="top"
                  sideOffset={5}
                >
                  {link.name}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        ))}

        {/* 如果有隐藏的链接，显示"更多"按钮 */}
        {hiddenLinks.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center w-5 h-5 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors focus:outline-none flex-shrink-0"
                aria-label="更多链接"
              >
                <ChevronDown size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={ideMenuContentClassName}
                sideOffset={5}
                onClick={(e) => e.stopPropagation()}
              >
                {hiddenLinks.map((link) => (
                  <DropdownMenu.Item
                    key={link.name}
                    className={ideMenuItemClassName}
                    onSelect={() => {
                      if (!globalThis.electronAPI?.openExternalUrl) {
                        console.error('openExternalUrl is not available');
                        return;
                      }
                      globalThis.electronAPI.openExternalUrl(link.url)
                        .catch((error: Error) => {
                          console.error('Failed to open URL:', error);
                        });
                    }}
                  >
                    <IdeMenuItemContent
                      icon={<ExternalLink size={14} />}
                      label={link.name}
                    />
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </>
    );
  }

  // 工具栏模式：显示在终端视图顶部工具栏
  if (variant === 'toolbar') {
    return (
      <>
        {visibleLinks.map((link, index) => (
          <React.Fragment key={link.name}>
            {index > 0 && (
              <div className="w-px h-4 bg-zinc-700" />
            )}
            <AppTooltip content={link.name} placement="toolbar-trailing">
              <button
                tabIndex={-1}
                onClick={(e) => handleOpenLink(e, link.url)}
                className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                title={link.name}
              >
                <ExternalLink size={14} />
              </button>
            </AppTooltip>
          </React.Fragment>
        ))}
      </>
    );
  }

  return null;
};

ProjectLinks.displayName = 'ProjectLinks';
