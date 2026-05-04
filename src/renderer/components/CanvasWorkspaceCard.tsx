import React, { useCallback, useMemo } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Archive, ArchiveRestore, Edit2, MoreHorizontal, Orbit, StickyNote, Trash2 } from 'lucide-react';
import { CanvasWorkspace } from '../../shared/types/canvas';
import { formatRelativeTime, useI18n } from '../i18n';
import {
  ideMenuContentClassName,
  ideMenuDangerItemClassName,
  ideMenuItemClassName,
  IdeMenuItemContent,
} from './ui/ide-menu';
import {
  idePopupInteractiveListCardClassName,
  idePopupListCardFooterClassName,
  idePopupPillClassName,
  idePopupTonalButtonClassName,
} from './ui/ide-popup';

interface CanvasWorkspaceCardProps {
  canvasWorkspace: CanvasWorkspace;
  onClick?: (canvasWorkspaceId: string) => void;
  onRename?: (canvasWorkspace: CanvasWorkspace) => void;
  onArchive?: (canvasWorkspace: CanvasWorkspace) => void;
  onUnarchive?: (canvasWorkspace: CanvasWorkspace) => void;
  onDelete?: (canvasWorkspace: CanvasWorkspace) => void;
}

export const CanvasWorkspaceCard = React.memo<CanvasWorkspaceCardProps>(({
  canvasWorkspace,
  onClick,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
}) => {
  const { language, t } = useI18n();
  const cardButtonClassName = `${idePopupTonalButtonClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`;

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

  const hasActions = Boolean(onRename || onArchive || onUnarchive || onDelete);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(canvasWorkspace.id)}
      onKeyDown={handleKeyDown}
      className={`${idePopupInteractiveListCardClassName} flex h-56 min-w-[280px] flex-col border-t border-t-[rgb(var(--primary))]/55`}
      aria-label={`${t('canvas.cardAriaLabel')}: ${canvasWorkspace.name}`}
    >
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgb(var(--primary))]/22 bg-[linear-gradient(180deg,rgb(var(--primary))/0.14_0%,color-mix(in_srgb,rgb(var(--card))_72%,transparent)_100%)] text-[rgb(var(--foreground))]">
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
          <div className="flex items-center gap-2">
            <span className={idePopupPillClassName}>{canvasWorkspace.blocks.length}</span>
            {hasActions && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={t('common.more')}
                    onClick={(event) => event.stopPropagation()}
                    className={`flex h-8 w-8 items-center justify-center ${cardButtonClassName}`}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className={ideMenuContentClassName}
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {onRename && (
                      <DropdownMenu.Item
                        className={ideMenuItemClassName}
                        onSelect={() => onRename(canvasWorkspace)}
                        aria-label={t('canvas.renameWorkspace')}
                      >
                        <IdeMenuItemContent icon={<Edit2 size={14} />} label={t('canvas.renameWorkspace')} />
                      </DropdownMenu.Item>
                    )}
                    {!canvasWorkspace.archived && onArchive && (
                      <DropdownMenu.Item
                        className={ideMenuItemClassName}
                        onSelect={() => onArchive(canvasWorkspace)}
                        aria-label={t('canvas.archiveWorkspace')}
                      >
                        <IdeMenuItemContent icon={<Archive size={14} />} label={t('canvas.archiveWorkspace')} />
                      </DropdownMenu.Item>
                    )}
                    {canvasWorkspace.archived && onUnarchive && (
                      <DropdownMenu.Item
                        className={ideMenuItemClassName}
                        onSelect={() => onUnarchive(canvasWorkspace)}
                        aria-label={t('canvas.unarchiveWorkspace')}
                      >
                        <IdeMenuItemContent icon={<ArchiveRestore size={14} />} label={t('canvas.unarchiveWorkspace')} />
                      </DropdownMenu.Item>
                    )}
                    {onDelete && (
                      <DropdownMenu.Item
                        className={ideMenuDangerItemClassName}
                        onSelect={() => onDelete(canvasWorkspace)}
                        aria-label={t('canvas.deleteWorkspace')}
                      >
                        <IdeMenuItemContent icon={<Trash2 size={14} />} label={t('canvas.deleteWorkspace')} />
                      </DropdownMenu.Item>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
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
        <span>{canvasWorkspace.archived ? t('status.archived') : t('canvas.openWorkspace')}</span>
      </div>
    </div>
  );
});

CanvasWorkspaceCard.displayName = 'CanvasWorkspaceCard';
