import React from 'react';
import { AlertTriangle, Check, Eye, Loader2, X } from 'lucide-react';
import type {
  CodePanePreviewChangeSet,
  CodePanePreviewFileChange,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';
import {
  IdePopupShell,
  idePopupBadgeClassName,
  idePopupBodyClassName,
  idePopupCardClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupScrollAreaClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
} from '../../ui/ide-popup';

interface RefactorPreviewToolWindowProps {
  changeSet: CodePanePreviewChangeSet | null;
  selectedChangeId: string | null;
  isApplying: boolean;
  error: string | null;
  onSelectChange: (changeId: string) => void;
  onApply: () => void | Promise<void>;
  onClose: () => void;
}

type WindowedListSlice<T> = {
  items: T[];
  offsetTop: number;
  totalHeight: number;
  isWindowed: boolean;
};

const REFACTOR_PREVIEW_FILE_ROW_HEIGHT = 74;
const REFACTOR_PREVIEW_FILE_ROW_OVERSCAN = 8;
const REFACTOR_PREVIEW_FILE_WINDOWING_THRESHOLD = 80;

function getWindowedListSlice<T>({
  items,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan,
  threshold,
}: {
  items: T[];
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
  threshold: number;
}): WindowedListSlice<T> {
  const totalHeight = items.length * rowHeight;

  if (items.length <= threshold || viewportHeight <= 0) {
    return {
      items,
      offsetTop: 0,
      totalHeight,
      isWindowed: false,
    };
  }

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );

  return {
    items: items.slice(startIndex, endIndex),
    offsetTop: startIndex * rowHeight,
    totalHeight,
    isWindowed: true,
  };
}

export function RefactorPreviewToolWindow({
  changeSet,
  selectedChangeId,
  isApplying,
  error,
  onSelectChange,
  onApply,
  onClose,
}: RefactorPreviewToolWindowProps) {
  const { t } = useI18n();
  const listScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [listScrollTop, setListScrollTop] = React.useState(0);
  const [listViewportHeight, setListViewportHeight] = React.useState(0);
  const pendingListScrollTopRef = React.useRef<number | null>(null);
  const listScrollAnimationFrameRef = React.useRef<number | null>(null);
  const selectedChange = changeSet?.files.find((candidate) => candidate.id === selectedChangeId)
    ?? changeSet?.files[0]
    ?? null;
  const fileChanges = changeSet?.files ?? [];
  const visibleFileChanges = React.useMemo(() => getWindowedListSlice({
    items: fileChanges,
    scrollTop: listScrollTop,
    viewportHeight: listViewportHeight,
    rowHeight: REFACTOR_PREVIEW_FILE_ROW_HEIGHT,
    overscan: REFACTOR_PREVIEW_FILE_ROW_OVERSCAN,
    threshold: REFACTOR_PREVIEW_FILE_WINDOWING_THRESHOLD,
  }), [fileChanges, listScrollTop, listViewportHeight]);

  const scheduleListScrollTopUpdate = React.useCallback((nextScrollTop: number) => {
    pendingListScrollTopRef.current = nextScrollTop;
    if (listScrollAnimationFrameRef.current !== null) {
      return;
    }

    listScrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
      listScrollAnimationFrameRef.current = null;
      const pendingScrollTop = pendingListScrollTopRef.current;
      pendingListScrollTopRef.current = null;
      if (pendingScrollTop !== null) {
        setListScrollTop((currentScrollTop) => (
          currentScrollTop === pendingScrollTop ? currentScrollTop : pendingScrollTop
        ));
      }
    });
  }, []);

  React.useEffect(() => {
    const container = listScrollRef.current;
    if (!container) {
      return;
    }

    const syncViewport = () => {
      setListViewportHeight(container.clientHeight);
      setListScrollTop(container.scrollTop);
    };

    syncViewport();

    const resizeObserver = new ResizeObserver(() => {
      syncViewport();
    });
    resizeObserver.observe(container);
    return () => {
      if (listScrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(listScrollAnimationFrameRef.current);
        listScrollAnimationFrameRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, []);

  const renderFileChange = React.useCallback((change: CodePanePreviewFileChange) => {
    const isSelected = selectedChange?.id === change.id;
    return (
      <button
        key={change.id}
        type="button"
        onClick={() => {
          onSelectChange(change.id);
        }}
        className={`h-[74px] w-full rounded border px-2 py-2 text-left transition-colors ${
          isSelected
            ? 'border-[rgb(var(--primary))]/40 bg-[rgb(var(--primary))]/10 text-[rgb(var(--foreground))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]'
            : 'border-transparent bg-transparent text-[rgb(var(--foreground))] hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))]'
        }`}
      >
        <div className="truncate text-xs font-medium">{getLeafLabel(change.filePath)}</div>
        <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{change.filePath}</div>
        {change.targetFilePath && (
          <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{change.targetFilePath}</div>
        )}
      </button>
    );
  }, [onSelectChange, selectedChange?.id]);

  return (
    <IdePopupShell className="flex h-full min-h-0 flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0">
          <div className={idePopupHeaderMetaClassName}>
            {t('codePane.refactorPreviewTab')}
          </div>
          <div className={`mt-1 ${idePopupTitleClassName}`}>{changeSet?.title ?? t('codePane.refactorPreviewEmpty')}</div>
          <div className={idePopupSubtitleClassName}>
            {changeSet?.stats
              ? t('codePane.refactorPreviewStatsFiles', { count: changeSet.stats.fileCount })
              : t('codePane.refactorPreviewEmpty')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onApply();
            }}
            disabled={!changeSet || isApplying}
            className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--success))/0.35] bg-[rgb(var(--success))/0.12] px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--success))] transition-colors hover:border-[rgb(var(--success))/0.5] hover:bg-[rgb(var(--success))/0.18] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {t('codePane.refactorApply')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={idePopupIconButtonClassName}
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-[rgb(var(--error))/0.22] bg-[rgb(var(--error))/0.08] px-3 py-2 text-xs text-[rgb(var(--error))]">
          {error}
        </div>
      )}

      {changeSet?.stats && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_32%,transparent)] px-3 py-2 text-[11px] text-[rgb(var(--muted-foreground))]">
          <span className={`rounded px-2 py-1 ${idePopupBadgeClassName('zinc')}`}>
            {t('codePane.refactorPreviewStatsFiles', { count: changeSet.stats.fileCount })}
          </span>
          <span className={`rounded px-2 py-1 ${idePopupBadgeClassName('zinc')}`}>
            {t('codePane.refactorPreviewStatsEdits', { count: changeSet.stats.editCount })}
          </span>
          {changeSet.stats.renameCount > 0 && (
            <span className={`rounded px-2 py-1 ${idePopupBadgeClassName('zinc')}`}>
              {t('codePane.refactorPreviewStatsRenames', { count: changeSet.stats.renameCount })}
            </span>
          )}
          {changeSet.stats.moveCount > 0 && (
            <span className={`rounded px-2 py-1 ${idePopupBadgeClassName('zinc')}`}>
              {t('codePane.refactorPreviewStatsMoves', { count: changeSet.stats.moveCount })}
            </span>
          )}
          {changeSet.stats.deleteCount > 0 && (
            <span className={`rounded px-2 py-1 ${idePopupBadgeClassName('zinc')}`}>
              {t('codePane.refactorPreviewStatsDeletes', { count: changeSet.stats.deleteCount })}
            </span>
          )}
        </div>
      )}

      {changeSet?.warnings && changeSet.warnings.length > 0 && (
        <div className="border-b border-[rgb(var(--warning))/0.22] bg-[rgb(var(--warning))/0.08] px-3 py-2 text-xs text-[rgb(var(--warning))]">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={12} />
            {t('codePane.refactorPreviewWarnings')}
          </div>
          <div className="mt-2 space-y-1">
            {changeSet.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
        <div
          ref={listScrollRef}
          className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 overflow-auto border-r border-[rgb(var(--border))] px-2 py-2`}
          onScroll={(event) => {
            scheduleListScrollTopUpdate(event.currentTarget.scrollTop);
          }}
        >
          {fileChanges.length ? (
            visibleFileChanges.isWindowed ? (
              <div style={{ height: `${visibleFileChanges.totalHeight}px`, position: 'relative' }}>
                <div className="space-y-1" style={{ transform: `translateY(${visibleFileChanges.offsetTop}px)` }}>
                  {visibleFileChanges.items.map(renderFileChange)}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {fileChanges.map(renderFileChange)}
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[rgb(var(--muted-foreground))]">
              {t('codePane.refactorPreviewEmpty')}
            </div>
          )}
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
          <PreviewPane
            title={t('codePane.refactorPreviewBefore')}
            tone="text-[rgb(var(--muted-foreground))]"
            change={selectedChange}
            content={selectedChange?.beforeContent ?? ''}
          />
          <PreviewPane
            title={t('codePane.refactorPreviewAfter')}
            tone="text-emerald-300"
            change={selectedChange}
            content={selectedChange?.afterContent ?? ''}
            borderLeft
          />
        </div>
      </div>
    </IdePopupShell>
  );
}

function PreviewPane({
  title,
  tone,
  change,
  content,
  borderLeft,
}: {
  title: string;
  tone: string;
  change: CodePanePreviewFileChange | null;
  content: string;
  borderLeft?: boolean;
}) {
  return (
    <div className={`flex min-h-0 flex-col ${borderLeft ? 'border-l border-[rgb(var(--border))]' : ''}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_24%,transparent)] px-3 py-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">{title}</div>
        {change && (
          <div className={`flex items-center gap-1 text-[10px] ${tone}`}>
            <Eye size={12} />
            <span>{change.kind.toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-3 py-3`}>
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[rgb(var(--foreground))]">
          {content || '[empty]'}
        </pre>
      </div>
    </div>
  );
}

function getLeafLabel(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || normalizedPath;
}
