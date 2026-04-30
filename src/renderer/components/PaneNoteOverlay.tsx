import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pin, PinOff, StickyNote, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { PaneNoteRecord } from '../stores/paneNoteStore';
import { usePaneNoteStore } from '../stores/paneNoteStore';

interface PaneNoteOverlayProps {
  windowId: string;
  paneId: string;
  isActive: boolean;
  isWindowActive: boolean;
  isPaneHovered: boolean;
}

function resolveDropSide(clientX: number, rect: DOMRect): PaneNoteRecord['side'] {
  return clientX - rect.left <= rect.width / 2 ? 'left' : 'right';
}

export const PaneNoteOverlay: React.FC<PaneNoteOverlayProps> = ({
  windowId,
  paneId,
  isActive,
  isWindowActive,
  isPaneHovered,
}) => {
  const { t } = useI18n();
  const note = usePaneNoteStore((state) => state.notes[`${windowId}::${paneId}`]);
  const isDraftOpen = usePaneNoteStore((state) => Boolean(state.draftOpenKeys[`${windowId}::${paneId}`]));
  const setNote = usePaneNoteStore((state) => state.setNote);
  const removeNote = usePaneNoteStore((state) => state.removeNote);
  const setPinned = usePaneNoteStore((state) => state.setPinned);
  const setSide = usePaneNoteStore((state) => state.setSide);
  const closeDraft = usePaneNoteStore((state) => state.closeDraft);
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPreviewSide, setDragPreviewSide] = useState<PaneNoteRecord['side'] | null>(null);

  useEffect(() => {
    setDraft(note?.text ?? '');
  }, [note?.text, paneId, windowId]);

  useEffect(() => {
    if (isDraftOpen) {
      setIsEditing(true);
    }
  }, [isDraftOpen]);

  const isFocused = isActive && isWindowActive;
  const isPinned = note?.pinned ?? false;
  const hasNote = Boolean(note?.text);
  const side = note?.side ?? 'right';
  const shouldExpand = isEditing || isPinned || (hasNote ? (isFocused || isPaneHovered) : false);
  const shouldShowCollapsedChip = hasNote && !shouldExpand;
  const isCompact = hasNote && !isPinned && !isEditing && !isPaneHovered && !isFocused;

  const previewText = useMemo(() => {
    if (!note?.text) {
      return '';
    }

    return note.text.length > 48 ? `${note.text.slice(0, 48)}…` : note.text;
  }, [note?.text]);

  const commitDraft = (nextText?: string) => {
    const trimmedDraft = (nextText ?? draft).trim();
    if (!trimmedDraft) {
      removeNote(windowId, paneId);
      closeDraft(windowId, paneId);
      setIsEditing(false);
      return;
    }

    setNote(windowId, paneId, {
      text: trimmedDraft,
      pinned: note?.pinned ?? false,
      side,
    });
    closeDraft(windowId, paneId);
    setIsEditing(false);
  };

  const handlePaste = async () => {
    const clipboardReader = window.electronAPI?.readClipboardText
      ? async () => {
        const response = await window.electronAPI.readClipboardText();
        if (typeof response === 'string') {
          return response;
        }
        if (
          response
          && typeof response === 'object'
          && 'success' in response
          && (response as { success?: boolean }).success
          && typeof (response as { data?: unknown }).data === 'string'
        ) {
          return (response as { data: string }).data;
        }
        return '';
      }
      : async () => navigator.clipboard?.readText?.() ?? '';

    try {
      const clipboardText = await clipboardReader();
      if (!clipboardText.trim()) {
        return;
      }

      const nextDraft = draft ? `${draft}\n${clipboardText}` : clipboardText;
      setDraft(nextDraft);
      setIsEditing(true);
    } catch {
      // Ignore clipboard failures so pane interactions keep working.
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);
    setIsDragging(true);
    setDragPreviewSide(side);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const rect = rootRef.current?.closest('[data-pane-visual-state]')?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setDragPreviewSide(resolveDropSide(moveEvent.clientX, rect));
    };

    const finishDrag = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', finishDrag);
      document.removeEventListener('pointercancel', finishDrag);

      const rect = rootRef.current?.closest('[data-pane-visual-state]')?.getBoundingClientRect();
      if (rect) {
        setSide(windowId, paneId, resolveDropSide(upEvent.clientX, rect));
      }

      setIsDragging(false);
      setDragPreviewSide(null);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', finishDrag);
    document.addEventListener('pointercancel', finishDrag);
  };

  if (!hasNote && !isEditing) {
    return (
      <div
        ref={rootRef}
        className={`pointer-events-none absolute top-2 z-30 ${side === 'left' ? 'left-2' : 'right-2'}`}
      >
        <button
          type="button"
          aria-label={t('paneNote.create')}
          className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_88%,transparent)] text-[rgb(var(--muted-foreground))] shadow-[0_10px_28px_rgba(15,23,42,0.22)] backdrop-blur transition-colors hover:border-[rgb(var(--primary))] hover:text-[rgb(var(--foreground))]"
          onClick={(event) => {
            event.stopPropagation();
            setDraft('');
            setIsEditing(true);
            closeDraft(windowId, paneId);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDraft('');
            setIsEditing(true);
            closeDraft(windowId, paneId);
            void handlePaste();
          }}
        >
          <StickyNote size={14} />
        </button>
      </div>
    );
  }

  const effectiveSide = dragPreviewSide ?? side;
  const rootSideClassName = effectiveSide === 'left' ? 'left-2 items-start' : 'right-2 items-end';

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute top-2 z-30 flex max-w-[min(20rem,calc(100%-1rem))] flex-col gap-2 ${rootSideClassName}`}
      data-pane-note-side={effectiveSide}
    >
      {isDragging ? (
        <>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -left-1 top-0 h-8 w-8 rounded-lg border transition-all ${effectiveSide === 'left' ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]/18 shadow-[0_0_0_1px_rgba(var(--primary),0.32)]' : 'border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_72%,transparent)] opacity-70'}`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -right-1 top-0 h-8 w-8 rounded-lg border transition-all ${effectiveSide === 'right' ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]/18 shadow-[0_0_0_1px_rgba(var(--primary),0.32)]' : 'border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_72%,transparent)] opacity-70'}`}
          />
        </>
      ) : null}

      {shouldShowCollapsedChip ? (
        <div
          className="pointer-events-auto"
          onPointerDown={startDrag}
        >
          <button
            type="button"
            aria-label={t('paneNote.expand')}
            title={note?.text}
            className={`inline-flex max-w-[12rem] items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_76%,transparent)] px-3 py-1.5 text-left text-[11px] text-[rgb(var(--foreground))] shadow-[0_12px_24px_rgba(15,23,42,0.24)] backdrop-blur transition-all ${isDragging ? 'opacity-100 ring-1 ring-[rgb(var(--primary))]' : 'opacity-70 hover:opacity-100'}`}
            onClick={(event) => {
              event.stopPropagation();
              setIsEditing(true);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handlePaste();
            }}
          >
            <StickyNote size={12} className="shrink-0 text-[rgb(var(--warning))]" />
            <span className="truncate">{previewText}</span>
          </button>
        </div>
      ) : null}

      {shouldExpand ? (
        <div
          className={`pointer-events-auto w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_90%,rgb(var(--warning))_10%)] shadow-[0_18px_40px_rgba(15,23,42,0.28)] backdrop-blur transition-all ${isCompact ? 'opacity-72' : 'opacity-100'} ${isDragging ? 'ring-1 ring-[rgb(var(--primary))]' : ''}`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handlePaste();
          }}
        >
          <div
            className="flex cursor-grab items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3 py-2 active:cursor-grabbing"
            onPointerDown={startDrag}
          >
            <div className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[rgb(var(--muted-foreground))]">
              <StickyNote size={12} className="shrink-0 text-[rgb(var(--warning))]" />
              <span className="truncate">{t('paneNote.title')}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={isPinned ? t('paneNote.unpin') : t('paneNote.pin')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
                onClick={() => {
                  if (!hasNote) {
                    return;
                  }
                  setPinned(windowId, paneId, !isPinned);
                }}
              >
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              <button
                type="button"
                aria-label={t('paneNote.delete')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
                onClick={() => {
                  removeNote(windowId, paneId);
                  setDraft('');
                  setIsEditing(false);
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="p-3">
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  autoFocus
                  rows={4}
                  maxLength={240}
                  placeholder={t('paneNote.placeholder')}
                  className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--muted-foreground))] focus:border-[rgb(var(--ring))] focus:ring-2 focus:ring-[rgb(var(--ring))]/20"
                  onChange={(event) => setDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handlePaste();
                  }}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      commitDraft();
                      return;
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setDraft(note?.text ?? '');
                      setIsEditing(false);
                    }
                  }}
                  onBlur={() => {
                    commitDraft();
                  }}
                />
                <div className="flex items-center justify-between gap-2 text-[11px] text-[rgb(var(--muted-foreground))]">
                  <span>{t('paneNote.shortcutHint')}</span>
                  <span>{draft.trim().length}/240</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                aria-label={t('paneNote.edit')}
                className="w-full text-left"
                onClick={() => setIsEditing(true)}
              >
                <div className="whitespace-pre-wrap break-words text-sm leading-6 text-[rgb(var(--foreground))]">
                  {note?.text}
                </div>
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

PaneNoteOverlay.displayName = 'PaneNoteOverlay';
