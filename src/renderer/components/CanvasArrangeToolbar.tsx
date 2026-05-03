import React, { useState } from 'react';
import { Activity, Grid2X2, LayoutTemplate, Minus, MoveHorizontal, MoveVertical, PencilLine, Plus, Search, Trash2 } from 'lucide-react';
import type { CanvasArrangeMode } from '../utils/canvasWorkspace';
import { useI18n } from '../i18n';

interface CanvasArrangeToolbarProps {
  blockCount: number;
  selectedCount: number;
  zoom: number;
  activeArrangeMode: CanvasArrangeMode | null;
  canAddWindow: boolean;
  onCreateBlock: () => void;
  onOpenTemplates: () => void;
  onOpenActivity: () => void;
  activityCount?: number;
  onAddNote: () => void;
  onArrange: (mode: CanvasArrangeMode) => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToContent: () => void;
  onDeleteSelected: () => void;
  onRenameWorkspace: () => void;
  onDeleteWorkspace: () => void;
}

function IconButton({
  active,
  disabled = false,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border text-white transition',
        active
          ? 'border-sky-300/50 bg-sky-400/15 text-sky-100'
          : 'border-white/10 bg-white/[0.06] text-white/75 hover:bg-white/[0.12] hover:text-white',
        disabled ? 'cursor-not-allowed opacity-40 hover:bg-white/[0.06] hover:text-white/75' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ZoomPill({
  zoom,
  onZoomOut,
  onResetZoom,
  onZoomIn,
}: {
  zoom: number;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[rgba(11,16,24,0.9)] px-1 py-1 shadow-[0_10px_28px_rgba(0,0,0,0.26)] backdrop-blur">
      <IconButton title="Zoom out" onClick={onZoomOut}>
        <Minus size={14} />
      </IconButton>
      <button
        type="button"
        onClick={onResetZoom}
        className="min-w-[64px] rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-medium tabular-nums text-white/85 transition hover:bg-white/[0.12] hover:text-white"
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton title="Zoom in" onClick={onZoomIn}>
        <Plus size={14} />
      </IconButton>
    </div>
  );
}

export function CanvasArrangeToolbar({
  blockCount,
  selectedCount,
  zoom,
  activeArrangeMode,
  canAddWindow,
  onCreateBlock,
  onOpenTemplates,
  onOpenActivity,
  activityCount = 0,
  onAddNote,
  onArrange,
  onResetZoom,
  onZoomIn,
  onZoomOut,
  onFitToContent,
  onDeleteSelected,
  onRenameWorkspace,
  onDeleteWorkspace,
}: CanvasArrangeToolbarProps) {
  const { t } = useI18n();
  const [arranging, setArranging] = useState(false);

  const runArrange = async (mode: CanvasArrangeMode) => {
    if (blockCount < 2 || arranging) {
      return;
    }

    setArranging(true);
    try {
      onArrange(mode);
    } finally {
      setArranging(false);
    }
  };

  return (
    <div className="absolute right-5 top-4 z-20 flex max-w-[min(82vw,980px)] flex-wrap items-center justify-end gap-2">
      <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[rgba(11,16,24,0.86)] px-1.5 py-1.5 shadow-[0_14px_32px_rgba(0,0,0,0.28)] backdrop-blur">
        <button
          type="button"
          onClick={onCreateBlock}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-1.5 text-sm text-white/85 transition hover:bg-white/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Plus size={14} />
          {t('canvas.createBlock')}
        </button>
        <button
          type="button"
          onClick={onAddNote}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-1.5 text-sm text-white/85 transition hover:bg-white/[0.14] hover:text-white"
        >
          <Plus size={14} />
          {t('canvas.addNote')}
        </button>
        <button
          type="button"
          onClick={onOpenTemplates}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-1.5 text-sm text-white/85 transition hover:bg-white/[0.14] hover:text-white"
        >
          <LayoutTemplate size={14} />
          {t('canvas.templates')}
        </button>
        <button
          type="button"
          onClick={onOpenActivity}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-1.5 text-sm text-white/85 transition hover:bg-white/[0.14] hover:text-white"
        >
          <Activity size={14} />
          {activityCount > 0 ? t('canvas.activityWithCount', { count: activityCount }) : t('canvas.activity')}
        </button>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <IconButton
          title={t('canvas.arrangeGrid')}
          active={activeArrangeMode === 'grid'}
          disabled={blockCount < 2 || arranging}
          onClick={() => runArrange('grid')}
        >
          <Grid2X2 size={14} />
        </IconButton>
        <IconButton
          title={t('canvas.arrangeRow')}
          active={activeArrangeMode === 'row'}
          disabled={blockCount < 2 || arranging}
          onClick={() => runArrange('row')}
        >
          <MoveHorizontal size={14} />
        </IconButton>
        <IconButton
          title={t('canvas.arrangeColumn')}
          active={activeArrangeMode === 'column'}
          disabled={blockCount < 2 || arranging}
          onClick={() => runArrange('column')}
        >
          <MoveVertical size={14} />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <IconButton title={t('canvas.fitToContent')} onClick={onFitToContent}>
          <Search size={14} />
        </IconButton>
        <IconButton
          title={canAddWindow ? t('canvas.addWindow') : t('canvas.noAvailableWindows')}
          disabled={!canAddWindow}
          onClick={onCreateBlock}
        >
          <Plus size={14} />
        </IconButton>
        <IconButton
          title={t('canvas.deleteSelection')}
          disabled={selectedCount === 0}
          onClick={onDeleteSelected}
        >
          <Trash2 size={14} />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button
          type="button"
          onClick={onRenameWorkspace}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-1.5 text-sm text-white/85 transition hover:bg-white/[0.14] hover:text-white"
        >
          <PencilLine size={14} />
          {t('canvas.renameWorkspace')}
        </button>
        <button
          type="button"
          onClick={onDeleteWorkspace}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-100 transition hover:bg-rose-500/16"
        >
          <Trash2 size={14} />
          {t('canvas.deleteWorkspace')}
        </button>
      </div>

      <ZoomPill
        zoom={zoom}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        onZoomIn={onZoomIn}
      />
    </div>
  );
}
