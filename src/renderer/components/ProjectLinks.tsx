import React, { useCallback, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Popover from '@radix-ui/react-popover';
import { ExternalLink } from 'lucide-react';
import { ProjectLink } from '../../shared/types/project-config';

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
  // 控制更多菜单的显示
  const [showMore, setShowMore] = useState(false);
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
      <Popover.Root open={showMore && hiddenLinks.length > 0} onOpenChange={setShowMore}>
        <Popover.Trigger asChild>
          <div
            className="flex items-center gap-1"
            onMouseEnter={() => hiddenLinks.length > 0 && setShowMore(true)}
            onMouseLeave={() => setShowMore(false)}
          >
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
                      className="bg-[rgb(var(--card))] text-[rgb(var(--foreground))] px-2 py-1 rounded text-xs z-50 shadow-xl border border-[rgb(var(--border))] max-w-xs break-all"
                      sideOffset={5}
                    >
                      {link.name}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            ))}
          </div>
        </Popover.Trigger>

        {/* Popover 内容：显示隐藏的链接 */}
        {hiddenLinks.length > 0 && (
          <Popover.Portal>
            <Popover.Content
              className="bg-[rgb(var(--card))] rounded-lg shadow-xl border border-[rgb(var(--border))] p-1 z-50 min-w-[150px]"
              sideOffset={5}
              onMouseEnter={() => setShowMore(true)}
              onMouseLeave={() => setShowMore(false)}
              onClick={(e) => e.stopPropagation()}
            >
              {hiddenLinks.map((link) => (
                <button
                  key={link.name}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-[rgb(var(--foreground))] rounded hover:bg-[rgb(var(--accent))] cursor-pointer outline-none w-full"
                  onClick={(e) => {
                    handleOpenLink(e, link.url);
                    setShowMore(false);
                  }}
                >
                  <ExternalLink size={14} />
                  <span className="truncate">{link.name}</span>
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
    );
  }

  // 工具栏模式：显示在终端视图顶部工具栏
  if (variant === 'toolbar') {
    return (
      <>
        {displayLinks.map((link, index) => (
          <React.Fragment key={link.name}>
            {index > 0 && (
              <div className="w-px h-4 bg-zinc-700" />
            )}
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={(e) => handleOpenLink(e, link.url)}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                    title={link.name}
                  >
                    <ExternalLink size={14} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                    sideOffset={5}
                  >
                    {link.name}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </React.Fragment>
        ))}
      </>
    );
  }

  return null;
};

ProjectLinks.displayName = 'ProjectLinks';
