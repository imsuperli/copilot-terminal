import React from 'react';
import { Edit3, MonitorSmartphone, StickyNote, Trash2 } from 'lucide-react';
import type { CanvasBlock } from '../../shared/types/canvas';
import type { CanvasResizeDirection } from '../utils/canvasWorkspace';
import { useI18n } from '../i18n';

interface CanvasBlockChromeProps {
  block: CanvasBlock;
  title: string;
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
        'pointer-events-auto absolute overflow-hidden rounded-2xl border bg-[rgba(17,24,39,0.94)] shadow-[0_24px_80px_rgba(0,0,0,0.38)] transition-shadow',
        selected ? 'border-sky-300/60 shadow-[0_24px_80px_rgba(14,165,233,0.12)]' : 'border-white/10',
        missing ? 'border-amber-300/35' : '',
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
            ? 'border-white/12 bg-sky-400/[0.10] text-white/85'
            : 'border-white/10 bg-white/5 text-white/70',
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
              <span className="truncate font-medium text-white">{title}</span>
              {onStartTitleEdit && (
                <button
                  type="button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartTitleEdit();
                  }}
                  className="inline-flex items-center justify-center rounded-md p-1 text-white/35 transition hover:bg-white/10 hover:text-white"
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
            className="inline-flex items-center justify-center rounded-md p-1 text-white/45 transition hover:bg-white/10 hover:text-white"
            title={t('canvas.removeBlock')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="h-[calc(100%-37px)]">{children}</div>

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
