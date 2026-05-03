import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Plus, StickyNote, MonitorSmartphone } from 'lucide-react';
import { AppLanguage } from '../../shared/i18n';
import { CanvasBlock, CanvasNoteBlock, CanvasWindowBlock, CanvasWorkspace } from '../../shared/types/canvas';
import { useWindowStore } from '../stores/windowStore';
import { formatRelativeTime, useI18n } from '../i18n';

interface CanvasWorkspaceViewProps {
  canvasWorkspace: CanvasWorkspace;
}

type DragState =
  | { type: 'pan'; startX: number; startY: number; initTx: number; initTy: number }
  | { type: 'block'; blockId: string; startX: number; startY: number; initX: number; initY: number }
  | null;

function clampZoom(zoom: number): number {
  return Math.max(0.3, Math.min(2.5, zoom));
}

export const CanvasWorkspaceView: React.FC<CanvasWorkspaceViewProps> = ({ canvasWorkspace }) => {
  const { t, language } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const updateCanvasWorkspace = useWindowStore((state) => state.updateCanvasWorkspace);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>(null);

  const windowsById = useMemo(
    () => new Map(windows.map((window) => [window.id, window])),
    [windows],
  );

  const updateViewport = useCallback((tx: number, ty: number, zoom: number) => {
    updateCanvasWorkspace(canvasWorkspace.id, {
      viewport: {
        tx,
        ty,
        zoom: clampZoom(zoom),
      },
    });
  }, [canvasWorkspace.id, updateCanvasWorkspace]);

  const updateBlock = useCallback((
    blockId: string,
    updates: Partial<Pick<CanvasBlock, 'x' | 'y' | 'width' | 'height' | 'label'>> & { content?: string },
  ) => {
    const nextBlocks: CanvasBlock[] = canvasWorkspace.blocks.map((block) => {
      if (block.id !== blockId) {
        return block
      }

      if (block.type === 'window') {
        const nextBlock: CanvasWindowBlock = {
          ...block,
          type: 'window',
          x: updates.x ?? block.x,
          y: updates.y ?? block.y,
          width: updates.width ?? block.width,
          height: updates.height ?? block.height,
          zIndex: block.zIndex,
          label: updates.label ?? block.label,
          windowId: block.windowId,
        }
        return nextBlock
      }

      const nextBlock: CanvasNoteBlock = {
        ...block,
        type: 'note',
        x: updates.x ?? block.x,
        y: updates.y ?? block.y,
        width: updates.width ?? block.width,
        height: updates.height ?? block.height,
        zIndex: block.zIndex,
        label: updates.label ?? block.label,
        content: typeof updates.content === 'string' ? updates.content : block.content,
      }
      return nextBlock
    });
    updateCanvasWorkspace(canvasWorkspace.id, {
      blocks: nextBlocks,
    });
  }, [canvasWorkspace.blocks, canvasWorkspace.id, updateCanvasWorkspace]);

  const createNote = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const x = (clientX - rect.left - canvasWorkspace.viewport.tx) / canvasWorkspace.viewport.zoom;
    const y = (clientY - rect.top - canvasWorkspace.viewport.ty) / canvasWorkspace.viewport.zoom;
    const nextBlock: CanvasBlock = {
      id: `note-${Date.now()}`,
      type: 'note',
      x,
      y,
      width: 280,
      height: 180,
      zIndex: canvasWorkspace.nextZIndex,
      label: t('canvas.defaultNoteTitle'),
      content: '',
    };
    updateCanvasWorkspace(canvasWorkspace.id, {
      blocks: [...canvasWorkspace.blocks, nextBlock],
      nextZIndex: canvasWorkspace.nextZIndex + 1,
    });
  }, [canvasWorkspace.blocks, canvasWorkspace.id, canvasWorkspace.nextZIndex, canvasWorkspace.viewport.tx, canvasWorkspace.viewport.ty, canvasWorkspace.viewport.zoom, t, updateCanvasWorkspace]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    const nextZoom = canvasWorkspace.viewport.zoom * (event.deltaY > 0 ? 0.92 : 1.08);
    updateViewport(canvasWorkspace.viewport.tx, canvasWorkspace.viewport.ty, nextZoom);
  }, [canvasWorkspace.viewport.tx, canvasWorkspace.viewport.ty, canvasWorkspace.viewport.zoom, updateViewport]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState) {
      return;
    }

    if (dragState.type === 'pan') {
      updateViewport(
        dragState.initTx + (event.clientX - dragState.startX),
        dragState.initTy + (event.clientY - dragState.startY),
        canvasWorkspace.viewport.zoom,
      );
      return;
    }

    const deltaX = (event.clientX - dragState.startX) / canvasWorkspace.viewport.zoom;
    const deltaY = (event.clientY - dragState.startY) / canvasWorkspace.viewport.zoom;
    updateBlock(dragState.blockId, {
      x: dragState.initX + deltaX,
      y: dragState.initY + deltaY,
    });
  }, [canvasWorkspace.viewport.zoom, dragState, updateBlock, updateViewport]);

  const worldStyle = useMemo(() => ({
    transform: `translate(${canvasWorkspace.viewport.tx}px, ${canvasWorkspace.viewport.ty}px) scale(${canvasWorkspace.viewport.zoom})`,
    transformOrigin: '0 0',
  }), [canvasWorkspace.viewport.tx, canvasWorkspace.viewport.ty, canvasWorkspace.viewport.zoom]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(120,119,198,0.08),transparent_32%),linear-gradient(180deg,rgba(13,17,23,0.96),rgba(9,12,18,1))]">
      <div className="pointer-events-none absolute left-5 top-4 z-20 flex items-center gap-3 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-sm text-white/80 backdrop-blur">
        <span className="font-medium text-white">{canvasWorkspace.name}</span>
        <span className="text-white/45">·</span>
        <span>{formatRelativeTime(canvasWorkspace.updatedAt, language as AppLanguage)}</span>
      </div>

      <div className="absolute right-5 top-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            createNote(rect.left + rect.width / 2, rect.top + rect.height / 2);
          }}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-white/15"
        >
          <Plus size={16} />
          {t('canvas.addNote')}
        </button>
      </div>

      <div
        ref={canvasRef}
        className="h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          setDragState({
            type: 'pan',
            startX: event.clientX,
            startY: event.clientY,
            initTx: canvasWorkspace.viewport.tx,
            initTy: canvasWorkspace.viewport.ty,
          });
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragState(null)}
        onMouseLeave={() => setDragState(null)}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) {
            createNote(event.clientX, event.clientY);
          }
        }}
      >
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
            backgroundSize: `${24 * canvasWorkspace.viewport.zoom}px ${24 * canvasWorkspace.viewport.zoom}px`,
            backgroundPosition: `${canvasWorkspace.viewport.tx}px ${canvasWorkspace.viewport.ty}px`,
          }}
        />

        <div className="absolute inset-0" style={worldStyle}>
          {canvasWorkspace.blocks.map((block) => {
            const linkedWindow = block.type === 'window' ? windowsById.get(block.windowId) : null;
            return (
              <div
                key={block.id}
                className="absolute overflow-hidden rounded-2xl border border-white/10 bg-[rgba(17,24,39,0.92)] shadow-[0_24px_80px_rgba(0,0,0,0.38)]"
                style={{
                  left: block.x,
                  top: block.y,
                  width: block.width,
                  height: block.height,
                  zIndex: block.zIndex,
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setDragState({
                    type: 'block',
                    blockId: block.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    initX: block.x,
                    initY: block.y,
                  });
                }}
              >
                <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
                  <div className="flex items-center gap-2">
                    {block.type === 'window' ? <MonitorSmartphone size={14} /> : <StickyNote size={14} />}
                    <span>{block.label || (block.type === 'window' ? linkedWindow?.name || t('canvas.missingWindow') : t('canvas.defaultNoteTitle'))}</span>
                  </div>
                </div>

                {block.type === 'window' ? (
                  <div className="flex h-[calc(100%-37px)] flex-col justify-between p-4 text-sm text-white/70">
                    <div className="text-base font-medium text-white">{linkedWindow?.name || t('canvas.missingWindow')}</div>
                    <div className="line-clamp-3 text-white/55">
                      {linkedWindow
                        ? t('canvas.windowBlockHint')
                        : t('canvas.windowMissingHint')}
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={block.content}
                    onChange={(event) => updateBlock(block.id, { content: event.target.value })}
                    placeholder={t('canvas.notePlaceholder')}
                    className="h-[calc(100%-37px)] w-full resize-none border-0 bg-transparent p-4 text-sm text-white outline-none placeholder:text-white/30"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
