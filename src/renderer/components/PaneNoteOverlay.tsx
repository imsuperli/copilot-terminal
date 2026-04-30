import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { PaneNoteRecord } from '../stores/paneNoteStore';
import { usePaneNoteStore } from '../stores/paneNoteStore';

interface PaneNoteOverlayProps {
  windowId: string;
  paneId: string;
  isActive: boolean;
  isWindowActive: boolean;
  isPaneHovered: boolean;
  avoidTopRightInset?: number;
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
  avoidTopRightInset = 0,
}) => {
  const { t } = useI18n();
  const note = usePaneNoteStore((state) => state.notes[`${windowId}::${paneId}`]);
  const isDraftOpen = usePaneNoteStore((state) => Boolean(state.draftOpenKeys[`${windowId}::${paneId}`]));
  const draftSide = usePaneNoteStore((state) => state.draftSides[`${windowId}::${paneId}`]);
  const setNote = usePaneNoteStore((state) => state.setNote);
  const removeNote = usePaneNoteStore((state) => state.removeNote);
  const setSide = usePaneNoteStore((state) => state.setSide);
  const closeDraft = usePaneNoteStore((state) => state.closeDraft);
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isNoteHovered, setIsNoteHovered] = useState(false);
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
  const hasNote = Boolean(note?.text);
  const side = note?.side ?? draftSide ?? 'right';
  const shouldExpand = isEditing || (hasNote ? (isFocused || isNoteHovered) : false);
  const shouldShowCollapsedChip = hasNote && !shouldExpand;
  const widthSourceText = (isEditing ? draft : note?.text) || t('paneNote.placeholder');
  const longestLineLength = useMemo(() => {
    const lines = widthSourceText.split('\n').map((line) => line.trimEnd().length);
    return Math.max(12, Math.min(24, ...lines, 12));
  }, [widthSourceText]);
  const expandedCardStyle = {
    width: `${longestLineLength + 3}ch`,
    maxWidth: 'min(15.5rem, calc(100vw - 1.5rem))',
  } as const;

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
      pinned: false,
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
    return null;
  }

  const effectiveSide = dragPreviewSide ?? side;
  const rootSideClassName = effectiveSide === 'left' ? 'items-start' : 'items-end';
  const rootStyle = effectiveSide === 'left'
    ? { left: '0.5rem' }
    : { right: `calc(0.5rem + ${avoidTopRightInset}px)` };

  const handleRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    removeNote(windowId, paneId);
    closeDraft(windowId, paneId);
    setDraft('');
    setIsEditing(false);
  };

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute top-2 z-30 flex max-w-[min(20rem,calc(100%-1rem))] flex-col gap-2 ${rootSideClassName}`}
      style={rootStyle}
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
          onMouseEnter={() => setIsNoteHovered(true)}
          onMouseLeave={() => setIsNoteHovered(false)}
          onPointerDown={startDrag}
        >
          <button
            type="button"
            aria-label={t('paneNote.expand')}
            title={note?.text}
            className={`inline-flex h-7 max-w-[13rem] items-center rounded-md border border-[rgba(255,255,255,0.24)] bg-[linear-gradient(180deg,rgba(255,255,255,0.20),rgba(255,255,255,0.06))] px-2.5 text-left text-[11px] text-[rgba(255,255,255,0.92)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_22px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-all ${isDragging ? 'opacity-100 ring-1 ring-[rgb(var(--primary))]' : 'opacity-58 hover:h-8 hover:max-w-[16rem] hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(24,24,27,0.82)] hover:text-[rgb(var(--foreground))] hover:opacity-100 hover:shadow-[0_14px_28px_rgba(15,23,42,0.24)]'}`}
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
            <span className="truncate">{previewText}</span>
          </button>
        </div>
      ) : null}

      {shouldExpand ? (
        <div
          className={`pointer-events-auto overflow-hidden rounded-lg border border-[rgba(255,255,255,0.14)] bg-[rgba(24,24,27,0.84)] shadow-[0_16px_34px_rgba(15,23,42,0.24)] backdrop-blur-xl transition-all ${isDragging ? 'ring-1 ring-[rgb(var(--primary))]' : ''}`}
          style={expandedCardStyle}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handlePaste();
          }}
          onMouseEnter={() => setIsNoteHovered(true)}
          onMouseLeave={() => setIsNoteHovered(false)}
          onPointerDown={isEditing ? undefined : startDrag}
        >
          <div className="p-2">
            {isEditing ? (
              <div className="relative">
                <textarea
                  value={draft}
                  autoFocus
                  rows={2}
                  maxLength={240}
                  placeholder={t('paneNote.placeholder')}
                  className="block min-h-[3.05rem] w-full resize-none overflow-hidden rounded-md border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.05)] px-2 py-1.5 pr-7 text-[12px] leading-5 text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--muted-foreground))] focus:border-[rgb(var(--ring))] focus:ring-2 focus:ring-[rgb(var(--ring))]/20"
                  onChange={(event) => setDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
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
                <button
                  type="button"
                  aria-label={t('paneNote.delete')}
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-md text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={handleRemove}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="relative pr-6">
                <button
                  type="button"
                  aria-label={t('paneNote.edit')}
                  className="block w-full text-left"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setIsEditing(true)}
                >
                  <div className="line-clamp-2 whitespace-pre-wrap break-words text-[12px] leading-5 text-[rgb(var(--foreground))]">
                    {note?.text}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={t('paneNote.delete')}
                  className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-md text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={handleRemove}
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

PaneNoteOverlay.displayName = 'PaneNoteOverlay';
