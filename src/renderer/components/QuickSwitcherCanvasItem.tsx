import React, { useMemo } from 'react';
import { Orbit, StickyNote } from 'lucide-react';
import type { CanvasWorkspace } from '../../shared/types/canvas';
import { highlightMatches } from '../utils/fuzzySearch';
import { formatRelativeTime, useI18n } from '../i18n';

interface QuickSwitcherCanvasItemProps {
  canvasWorkspace: CanvasWorkspace;
  isSelected: boolean;
  query: string;
}

const quickSwitcherMatchHighlightClassName =
  'rounded-[4px] bg-[rgb(var(--primary))]/14 px-0.5 text-[rgb(var(--foreground))]';

export const QuickSwitcherCanvasItem: React.FC<QuickSwitcherCanvasItemProps> = React.memo(({
  canvasWorkspace,
  isSelected,
  query,
}) => {
  const { language, t } = useI18n();
  const windowBlockCount = useMemo(
    () => canvasWorkspace.blocks.filter((block) => block.type === 'window').length,
    [canvasWorkspace.blocks],
  );
  const noteBlockCount = useMemo(
    () => canvasWorkspace.blocks.filter((block) => block.type === 'note').length,
    [canvasWorkspace.blocks],
  );
  const nameHighlights = useMemo(
    () => highlightMatches(canvasWorkspace.name, query),
    [canvasWorkspace.name, query],
  );
  const workingDirectoryHighlights = useMemo(
    () => highlightMatches(canvasWorkspace.workingDirectory ?? '', query),
    [canvasWorkspace.workingDirectory, query],
  );
  const updatedAt = useMemo(() => {
    try {
      return formatRelativeTime(canvasWorkspace.updatedAt, language);
    } catch {
      return '';
    }
  }, [canvasWorkspace.updatedAt, language]);
  const createdTime = useMemo(() => {
    try {
      const date = new Date(canvasWorkspace.createdAt);
      return new Intl.DateTimeFormat(language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return '';
    }
  }, [canvasWorkspace.createdAt, language]);

  return (
    <div
      className={`
        px-4 py-3 mx-3 my-2 rounded-lg cursor-pointer
        transition-all duration-150 ease-out
        border-2
        ${isSelected
          ? 'border-[rgb(var(--primary))]/72 bg-[rgb(var(--accent))] shadow-lg'
          : 'border-transparent bg-[color-mix(in_srgb,rgb(var(--card))_72%,transparent)] hover:bg-[rgb(var(--accent))]'
        }
      `}
    >
      <div className="flex gap-6">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--primary))]/22 bg-[linear-gradient(180deg,rgb(var(--primary))/0.14_0%,color-mix(in_srgb,rgb(var(--card))_72%,transparent)_100%)] text-[rgb(var(--foreground))]">
              <Orbit size={18} />
            </span>
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
          </div>

          <div className="truncate text-sm text-[rgb(var(--muted-foreground))]">
            {workingDirectoryHighlights.length > 0
              ? workingDirectoryHighlights.map((part, index) => (
                <span
                  key={index}
                  className={part.highlight ? quickSwitcherMatchHighlightClassName : ''}
                >
                  {part.text}
                </span>
              ))
              : canvasWorkspace.workingDirectory || t('canvas.cardSubtitle')}
          </div>
        </div>

        <div className="flex-shrink-0 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.createdAt')}</span>
            <span className="text-[rgb(var(--foreground))]">{createdTime}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.canvasUpdatedAt')}</span>
            <span className="text-[rgb(var(--foreground))]">{updatedAt}</span>
          </div>

          <div className="flex items-center gap-2 text-[rgb(var(--muted-foreground))]">
            <Orbit size={12} />
            <span>{t('quickSwitcher.canvasBlockCount', { count: canvasWorkspace.blocks.length })}</span>
            <span>·</span>
            <span>{t('canvas.windowBlocks', { count: windowBlockCount })}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <StickyNote size={11} />
              {t('canvas.noteBlocks', { count: noteBlockCount })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

QuickSwitcherCanvasItem.displayName = 'QuickSwitcherCanvasItem';
