import React, { useCallback, useMemo } from 'react';
import { Orbit, StickyNote } from 'lucide-react';
import { CanvasWorkspace } from '../../shared/types/canvas';
import { formatRelativeTime, useI18n } from '../i18n';
import {
  idePopupInteractiveListCardClassName,
  idePopupListCardFooterClassName,
  idePopupPillClassName,
} from './ui/ide-popup';

interface CanvasWorkspaceCardProps {
  canvasWorkspace: CanvasWorkspace;
  onClick?: (canvasWorkspaceId: string) => void;
}

export const CanvasWorkspaceCard = React.memo<CanvasWorkspaceCardProps>(({
  canvasWorkspace,
  onClick,
}) => {
  const { language, t } = useI18n();

  const blockSummary = useMemo(() => {
    const noteCount = canvasWorkspace.blocks.filter((block) => block.type === 'note').length;
    const windowCount = canvasWorkspace.blocks.filter((block) => block.type === 'window').length;
    return { noteCount, windowCount };
  }, [canvasWorkspace.blocks]);

  const updatedAt = useMemo(() => {
    try {
      return formatRelativeTime(canvasWorkspace.updatedAt, language);
    } catch {
      return t('common.unknown');
    }
  }, [canvasWorkspace.updatedAt, language, t]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.(canvasWorkspace.id);
    }
  }, [canvasWorkspace.id, onClick]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(canvasWorkspace.id)}
      onKeyDown={handleKeyDown}
      className={`${idePopupInteractiveListCardClassName} flex h-56 min-w-[280px] flex-col border-t border-t-[rgba(125,211,252,0.55)]`}
      aria-label={`${t('canvas.cardAriaLabel')}: ${canvasWorkspace.name}`}
    >
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(125,211,252,0.22)] bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.22),rgba(14,116,144,0.08))] text-[rgb(var(--foreground))]">
              <Orbit size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-[rgb(var(--foreground))]">
                {canvasWorkspace.name}
              </h3>
              <p className="truncate text-sm text-[rgb(var(--muted-foreground))]">
                {t('canvas.cardSubtitle')}
              </p>
            </div>
          </div>
          <span className={idePopupPillClassName}>{canvasWorkspace.blocks.length}</span>
        </div>

        <div className="mt-4 flex flex-1 flex-col justify-between rounded-2xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_74%,transparent)] p-4">
          <div className="space-y-2 text-sm text-[rgb(var(--muted-foreground))]">
            <div className="flex items-center gap-2">
              <Orbit size={14} />
              <span>{t('canvas.windowBlocks', { count: blockSummary.windowCount })}</span>
            </div>
            <div className="flex items-center gap-2">
              <StickyNote size={14} />
              <span>{t('canvas.noteBlocks', { count: blockSummary.noteCount })}</span>
            </div>
          </div>
          <div className="mt-4 text-xs text-[rgb(var(--muted-foreground))]">
            {t('canvas.updatedAt', { time: updatedAt })}
          </div>
        </div>
      </div>

      <div className={`${idePopupListCardFooterClassName} border-t border-[rgb(var(--border))]`}>
        <span>{t('canvas.openWorkspace')}</span>
      </div>
    </div>
  );
});

CanvasWorkspaceCard.displayName = 'CanvasWorkspaceCard';
