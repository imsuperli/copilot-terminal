import React, { useState } from 'react';
import {
  Activity,
  Bot,
  FileOutput,
  Grid2X2,
  LayoutTemplate,
  Link2,
  Minus,
  MoveHorizontal,
  MoveVertical,
  NotebookPen,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { CanvasArrangeMode } from '../utils/canvasWorkspace';
import { useI18n } from '../i18n';

const toolbarSurfaceClassName = 'rounded-xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_78%,transparent)] shadow-[0_14px_32px_rgba(0,0,0,0.22)] backdrop-blur';
const toolbarNeutralButtonClassName = 'border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_64%,transparent)] text-[rgb(var(--foreground))] hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]';
const toolbarPrimaryButtonClassName = 'border-[rgb(var(--primary))]/30 bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/16';

interface CanvasArrangeToolbarProps {
  actions?: React.ReactNode;
  blockCount: number;
  selectedCount: number;
  zoom: number;
  activeArrangeMode: CanvasArrangeMode | null;
  canLinkSelection?: boolean;
  onCreateBlock: () => void;
  onOpenTemplates: () => void;
  onOpenActivity: () => void;
  activityCount?: number;
  onAskAI: () => void;
  onSendToNote: () => void;
  onLinkSelection: () => void;
  onExportReport: () => void;
  onArrange: (mode: CanvasArrangeMode) => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToContent: () => void;
  onDeleteSelected: () => void;
  onRenameWorkspace: () => void;
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
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition',
        active
          ? toolbarPrimaryButtonClassName
          : toolbarNeutralButtonClassName,
        disabled ? 'cursor-not-allowed opacity-40 hover:border-[rgb(var(--border))] hover:bg-[color-mix(in_srgb,rgb(var(--secondary))_64%,transparent)] hover:text-[rgb(var(--foreground))]' : '',
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
    <div className={`inline-flex items-center gap-1 px-1 py-1 ${toolbarSurfaceClassName}`}>
      <IconButton title="Zoom out" onClick={onZoomOut}>
        <Minus size={14} />
      </IconButton>
      <button
        type="button"
        onClick={onResetZoom}
        className={`min-w-[64px] rounded-lg px-2 py-1 text-[11px] font-medium tabular-nums transition ${toolbarNeutralButtonClassName}`}
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
  actions,
  blockCount,
  selectedCount,
  zoom,
  activeArrangeMode,
  canLinkSelection = false,
  onCreateBlock,
  onOpenTemplates,
  onOpenActivity,
  activityCount = 0,
  onAskAI,
  onSendToNote,
  onLinkSelection,
  onExportReport,
  onArrange,
  onResetZoom,
  onZoomIn,
  onZoomOut,
  onFitToContent,
  onDeleteSelected,
  onRenameWorkspace,
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
    <div className="absolute right-5 top-4 z-20 flex max-w-[min(76vw,940px)] flex-col items-end gap-2">
      {actions ? (
        <div className="flex w-full justify-end">
          {actions}
        </div>
      ) : null}
      <div className={`inline-flex flex-wrap items-center justify-end gap-1.5 px-2 py-2 ${toolbarSurfaceClassName}`}>
        <button
          type="button"
          onClick={onCreateBlock}
          className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition ${toolbarPrimaryButtonClassName}`}
        >
          <Plus size={14} />
          {t('canvas.addContent')}
        </button>
        <button
          type="button"
          onClick={onOpenTemplates}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${toolbarNeutralButtonClassName}`}
        >
          <LayoutTemplate size={14} />
          {t('canvas.templates')}
        </button>
        <button
          type="button"
          onClick={onOpenActivity}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${toolbarNeutralButtonClassName}`}
        >
          <Activity size={14} />
          {activityCount > 0 ? t('canvas.activityWithCount', { count: activityCount }) : t('canvas.activity')}
        </button>
        <button
          type="button"
          onClick={onAskAI}
          disabled={selectedCount === 0}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${toolbarPrimaryButtonClassName}`}
        >
          <Bot size={14} />
          {t('canvas.askAI')}
        </button>
        <button
          type="button"
          onClick={onSendToNote}
          disabled={selectedCount === 0}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${toolbarNeutralButtonClassName}`}
        >
          <NotebookPen size={14} />
          {t('canvas.sendToNote')}
        </button>
        <button
          type="button"
          onClick={onExportReport}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${toolbarNeutralButtonClassName}`}
        >
          <FileOutput size={14} />
          {t('canvas.exportReport')}
        </button>
      </div>

      <div className={`inline-flex flex-wrap items-center justify-end gap-1 px-1.5 py-1.5 ${toolbarSurfaceClassName}`}>
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
        <div className="mx-1 h-5 w-px bg-[rgb(var(--border))]" />
        <IconButton title={t('canvas.fitToContent')} onClick={onFitToContent}>
          <Search size={14} />
        </IconButton>
        <IconButton
          title={t('canvas.linkSelection')}
          disabled={!canLinkSelection}
          onClick={onLinkSelection}
        >
          <Link2 size={14} />
        </IconButton>
        <IconButton
          title={t('canvas.deleteSelection')}
          disabled={selectedCount === 0}
          onClick={onDeleteSelected}
        >
          <Trash2 size={14} />
        </IconButton>
        <IconButton title={t('canvas.renameWorkspace')} onClick={onRenameWorkspace}>
          <PencilLine size={14} />
        </IconButton>
        <ZoomPill
          zoom={zoom}
          onZoomOut={onZoomOut}
          onResetZoom={onResetZoom}
          onZoomIn={onZoomIn}
        />
      </div>
    </div>
  );
}
