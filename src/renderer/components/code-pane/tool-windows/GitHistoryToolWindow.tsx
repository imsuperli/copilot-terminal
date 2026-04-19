import React from 'react';
import { GitCommitHorizontal, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import type {
  CodePaneGitHistoryEntry,
  CodePaneGitHistoryResult,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface GitHistoryToolWindowProps {
  history: CodePaneGitHistoryResult | null;
  selectedCommitSha: string | null;
  isLoading: boolean;
  error: string | null;
  onSelectCommit: (commitSha: string) => void;
  onRefresh: () => void | Promise<void>;
  onCherryPick: (commitSha: string) => void | Promise<void>;
  onClose: () => void;
}

type WindowedListSlice<T> = {
  items: T[];
  offsetTop: number;
  totalHeight: number;
  isWindowed: boolean;
};

const GIT_HISTORY_ROW_HEIGHT = 72;
const GIT_HISTORY_ROW_OVERSCAN = 8;
const GIT_HISTORY_WINDOWING_THRESHOLD = 80;

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

export function GitHistoryToolWindow({
  history,
  selectedCommitSha,
  isLoading,
  error,
  onSelectCommit,
  onRefresh,
  onCherryPick,
  onClose,
}: GitHistoryToolWindowProps) {
  const { t } = useI18n();
  const listScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [listScrollTop, setListScrollTop] = React.useState(0);
  const [listViewportHeight, setListViewportHeight] = React.useState(0);
  const pendingListScrollTopRef = React.useRef<number | null>(null);
  const listScrollAnimationFrameRef = React.useRef<number | null>(null);
  const selectedEntry = history?.entries.find((entry) => entry.commitSha === selectedCommitSha)
    ?? history?.entries[0]
    ?? null;
  const historyEntries = history?.entries ?? [];
  const visibleEntries = React.useMemo(() => getWindowedListSlice({
    items: historyEntries,
    scrollTop: listScrollTop,
    viewportHeight: listViewportHeight,
    rowHeight: GIT_HISTORY_ROW_HEIGHT,
    overscan: GIT_HISTORY_ROW_OVERSCAN,
    threshold: GIT_HISTORY_WINDOWING_THRESHOLD,
  }), [historyEntries, listScrollTop, listViewportHeight]);

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

  const renderHistoryEntry = React.useCallback((entry: CodePaneGitHistoryEntry) => {
    const isSelected = entry.commitSha === selectedEntry?.commitSha;
    return (
      <button
        key={`${entry.commitSha}-${entry.lineNumber ?? 0}`}
        type="button"
        onClick={() => {
          onSelectCommit(entry.commitSha);
        }}
        className={`h-[72px] w-full rounded border px-2 py-2 text-left transition-colors ${
          isSelected
            ? 'border-[rgb(var(--warning)/0.30)] bg-[rgb(var(--warning)/0.10)] text-[rgb(var(--foreground))]'
            : 'border-transparent bg-transparent text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]'
        }`}
      >
        <div className="truncate text-xs font-medium">{entry.subject || entry.shortSha}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[rgb(var(--muted-foreground))]">
          <span>{entry.author}</span>
          <span>{entry.shortSha}</span>
          {entry.lineNumber ? <span>L{entry.lineNumber}</span> : null}
        </div>
      </button>
    );
  }, [onSelectCommit, selectedEntry?.commitSha]);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_88%,transparent)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.gitHistoryTab')}
          </div>
          <div className="mt-1 truncate text-xs text-[rgb(var(--foreground))]">
            {history?.targetFilePath ?? t('codePane.gitHistoryEmpty')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onRefresh();
            }}
            className="rounded bg-[rgb(var(--secondary))] p-1 text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[rgb(var(--secondary))] p-1 text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-[rgb(var(--error)/0.20)] bg-[rgb(var(--error)/0.10)] px-3 py-2 text-xs text-[rgb(var(--error))]">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
        <div
          ref={listScrollRef}
          className="min-h-0 overflow-auto border-r border-[rgb(var(--border))] px-2 py-2"
          onScroll={(event) => {
            scheduleListScrollTopUpdate(event.currentTarget.scrollTop);
          }}
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
              <Loader2 size={12} className="animate-spin" />
              {t('codePane.gitHistoryLoading')}
            </div>
          ) : historyEntries.length ? (
            visibleEntries.isWindowed ? (
              <div style={{ height: `${visibleEntries.totalHeight}px`, position: 'relative' }}>
                <div className="space-y-1" style={{ transform: `translateY(${visibleEntries.offsetTop}px)` }}>
                  {visibleEntries.items.map(renderHistoryEntry)}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {historyEntries.map(renderHistoryEntry)}
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[rgb(var(--muted-foreground))]">
              {t('codePane.gitHistoryEmpty')}
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-auto px-3 py-3">
          {selectedEntry ? (
            <GitHistoryDetails entry={selectedEntry} onCherryPick={onCherryPick} />
          ) : (
            <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.gitHistoryEmpty')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function GitHistoryDetails({
  entry,
  onCherryPick,
}: {
  entry: CodePaneGitHistoryEntry;
  onCherryPick: (commitSha: string) => void | Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div className="rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_58%,transparent)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-[rgb(var(--foreground))]">{entry.subject || entry.shortSha}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[rgb(var(--muted-foreground))]">
              <span>{entry.author}</span>
              <span>{new Date(entry.timestamp * 1000).toLocaleString()}</span>
              <span>{entry.shortSha}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void onCherryPick(entry.commitSha);
            }}
            className="flex shrink-0 items-center gap-1 rounded bg-[rgb(var(--success)/0.14)] px-2 py-1 text-[11px] text-[rgb(var(--success))] transition-colors hover:bg-[rgb(var(--success)/0.22)]"
          >
            <GitCommitHorizontal size={12} />
            {t('codePane.gitCherryPick')}
          </button>
        </div>
      </div>
      {entry.refs.length > 0 && (
        <div className="rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_58%,transparent)] p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.gitHistoryRefs')}
          </div>
          <div className="flex flex-wrap gap-2">
            {entry.refs.map((ref) => (
              <span
                key={`${entry.commitSha}-${ref}`}
                className="rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_74%,transparent)] px-2 py-1 text-[11px] text-[rgb(var(--foreground))]"
              >
                {ref}
              </span>
            ))}
          </div>
        </div>
      )}
      {entry.filePath && (
        <div className="rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_58%,transparent)] p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {entry.scope === 'line' ? t('codePane.gitLineHistory') : t('codePane.gitFileHistory')}
          </div>
          <div className="text-xs text-[rgb(var(--foreground))]">{entry.filePath}</div>
          {entry.lineNumber ? (
            <div className="mt-1 text-[11px] text-[rgb(var(--muted-foreground))]">{t('codePane.gitHistoryLineLabel', { line: entry.lineNumber })}</div>
          ) : null}
        </div>
      )}
      <div className="flex items-center gap-2 rounded border border-[rgb(var(--warning)/0.20)] bg-[rgb(var(--warning)/0.08)] p-3 text-[11px] text-[rgb(var(--warning))]">
        <RotateCcw size={12} />
        {t('codePane.gitHistoryReplayHint')}
      </div>
    </div>
  );
}
