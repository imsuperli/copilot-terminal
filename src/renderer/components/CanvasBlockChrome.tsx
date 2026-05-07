import React from 'react';
import { Edit3, MonitorSmartphone, StickyNote, Trash2 } from 'lucide-react';
import type { CanvasBlock, CanvasBlockSummary } from '../../shared/types/canvas';
import type { CanvasResizeDirection } from '../utils/canvasWorkspace';
import { useI18n } from '../i18n';

interface CanvasBlockChromeProps {
  block: CanvasBlock;
  title: string;
  summary?: CanvasBlockSummary;
  showSummaryOverlay?: boolean;
  selected: boolean;
  missing?: boolean;
  editingTitle?: boolean;
  titleEditor?: React.ReactNode;
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHeaderMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onStartTitleEdit?: () => void;
  onResizeMouseDown: (event: React.MouseEvent<HTMLDivElement>, direction: CanvasResizeDirection) => void;
  onRemove: () => void;
  children: React.ReactNode;
}

function ResizeHandle({
  direction,
  onMouseDown,
}: {
  direction: CanvasResizeDirection;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>, direction: CanvasResizeDirection) => void;
}) {
  const size = 8;
  const style: React.CSSProperties = { position: 'absolute', zIndex: 10 };

  if (direction === 'e') Object.assign(style, { right: 0, top: size, bottom: size, width: size, cursor: 'col-resize' });
  if (direction === 'w') Object.assign(style, { left: 0, top: size, bottom: size, width: size, cursor: 'col-resize' });
  if (direction === 's') Object.assign(style, { left: size, right: size, bottom: 0, height: size, cursor: 'row-resize' });
  if (direction === 'n') Object.assign(style, { left: size, right: size, top: 0, height: size, cursor: 'row-resize' });
  if (direction === 'se') Object.assign(style, { right: 0, bottom: 0, width: size, height: size, cursor: 'se-resize' });
  if (direction === 'sw') Object.assign(style, { left: 0, bottom: 0, width: size, height: size, cursor: 'sw-resize' });
  if (direction === 'ne') Object.assign(style, { right: 0, top: 0, width: size, height: size, cursor: 'ne-resize' });
  if (direction === 'nw') Object.assign(style, { left: 0, top: 0, width: size, height: size, cursor: 'nw-resize' });

  return (
    <div
      style={style}
      onMouseDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onMouseDown(event, direction);
      }}
    />
  );
}

export function CanvasBlockChrome({
  block,
  title,
  summary,
  showSummaryOverlay = true,
  selected,
  missing = false,
  editingTitle = false,
  titleEditor,
  onMouseDown,
  onHeaderMouseDown,
  onStartTitleEdit,
  onResizeMouseDown,
  onRemove,
  children,
}: CanvasBlockChromeProps) {
  const { t } = useI18n();
  const icon = block.type === 'window' ? <MonitorSmartphone size={14} /> : <StickyNote size={14} />;

  return (
    <div
      className={[
        'pointer-events-auto absolute overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,color-mix(in_srgb,var(--appearance-card-surface-top)_100%,transparent)_0%,color-mix(in_srgb,var(--appearance-card-surface-bottom)_100%,transparent)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.28)] transition-shadow',
        selected ? 'border-[rgb(var(--primary))]/60 shadow-[0_24px_80px_rgba(14,165,233,0.10)]' : 'border-[rgb(var(--border))]',
        missing ? 'border-[rgb(var(--warning))/0.40]' : '',
      ].join(' ')}
      onMouseDown={onMouseDown}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        zIndex: block.zIndex,
      }}
    >
      <div
        className={[
          'flex cursor-grab items-center justify-between border-b px-4 py-2 text-sm active:cursor-grabbing',
          selected
            ? 'border-[rgb(var(--primary))]/24 bg-[rgb(var(--primary))]/10 text-[rgb(var(--foreground))]'
            : 'border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_58%,transparent)] text-[rgb(var(--muted-foreground))]',
        ].join(' ')}
        onMouseDown={onHeaderMouseDown}
      >
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          {editingTitle ? (
            <div
              className="min-w-0 flex-1"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
            >
              {titleEditor}
            </div>
          ) : (
            <>
              <span className="truncate font-medium text-[rgb(var(--foreground))]">{title}</span>
              {onStartTitleEdit && (
                <button
                  type="button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartTitleEdit();
                  }}
                  className="inline-flex items-center justify-center rounded-md p-1 text-[rgb(var(--muted-foreground))] transition hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
                  title={t('canvas.renameBlock')}
                >
                  <Edit3 size={13} />
                </button>
              )}
            </>
          )}
        </div>
        {!editingTitle && (
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onRemove}
            className="inline-flex items-center justify-center rounded-md p-1 text-[rgb(var(--muted-foreground))] transition hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
            title={t('canvas.removeBlock')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="relative h-[calc(100%-37px)] overflow-hidden">{children}</div>

      {!editingTitle && showSummaryOverlay && summary && (summary.metrics?.length || summary.tags?.length) ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] border-t border-[rgb(var(--border))] bg-[linear-gradient(180deg,color-mix(in_srgb,rgb(var(--background))_8%,transparent)_0%,color-mix(in_srgb,rgb(var(--background))_72%,transparent)_100%)] px-3 py-2 backdrop-blur">
          {summary.metrics?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {summary.metrics.slice(0, 4).map((metric) => (
                <span
                  key={`${metric.label}-${metric.value}`}
                  className="rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_48%,transparent)] px-2 py-0.5 text-[10px] text-[rgb(var(--muted-foreground))]"
                >
                  {metric.label}: {metric.value}
                </span>
              ))}
            </div>
          ) : null}
          {summary.tags?.length ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {summary.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[rgb(var(--primary))]/18 bg-[rgb(var(--primary))]/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[rgb(var(--primary))]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {(['e', 's', 'se', 'w', 'n', 'nw', 'ne', 'sw'] as CanvasResizeDirection[]).map((direction) => (
        <ResizeHandle
          key={direction}
          direction={direction}
          onMouseDown={onResizeMouseDown}
        />
      ))}
    </div>
  );
}
