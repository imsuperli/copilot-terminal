import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import type { CodePaneBookmark } from '../../../types/window';
import { useI18n } from '../../../i18n';
import {
  IdePopupShell,
  idePopupBodyClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupScrollAreaClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
} from '../../ui/ide-popup';

type TodoItem = {
  filePath: string;
  lineNumber: number;
  column: number;
  lineText: string;
  token: 'TODO' | 'FIXME' | 'XXX';
};

type LocalHistoryEntry = {
  id: string;
  filePath: string;
  label: string;
  timestamp: number;
  preview: string;
};

interface WorkspaceToolWindowProps {
  bookmarks: CodePaneBookmark[];
  todoItems: TodoItem[];
  localHistoryEntries: LocalHistoryEntry[];
  activeFilePath: string | null;
  isTodoLoading: boolean;
  todoError: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenBookmark: (bookmark: CodePaneBookmark) => void;
  onOpenTodo: (item: TodoItem) => void;
  onOpenHistoryEntry: (entry: LocalHistoryEntry) => void;
  onRestoreHistoryEntry: (entry: LocalHistoryEntry) => void;
  getFileLabel: (filePath: string) => string;
  getRelativePath: (filePath: string) => string;
}

type WindowedListSlice<T> = {
  items: T[];
  offsetTop: number;
  totalHeight: number;
  isWindowed: boolean;
};

const WORKSPACE_FIXED_LIST_OVERSCAN = 8;
const WORKSPACE_FIXED_LIST_WINDOWING_THRESHOLD = 80;
const WORKSPACE_BOOKMARK_ROW_HEIGHT = 56;
const WORKSPACE_TODO_ROW_HEIGHT = 74;
const WORKSPACE_HISTORY_ROW_HEIGHT = 94;

function getWindowedListSlice<T>({
  items,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan = WORKSPACE_FIXED_LIST_OVERSCAN,
  threshold = WORKSPACE_FIXED_LIST_WINDOWING_THRESHOLD,
}: {
  items: T[];
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan?: number;
  threshold?: number;
}): WindowedListSlice<T> {
  if (items.length < threshold || viewportHeight <= 0) {
    return {
      items,
      offsetTop: 0,
      totalHeight: items.length * rowHeight,
      isWindowed: false,
    };
  }

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + (overscan * 2);
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  return {
    items: items.slice(startIndex, endIndex),
    offsetTop: startIndex * rowHeight,
    totalHeight: items.length * rowHeight,
    isWindowed: true,
  };
}

function useFixedWindowedList<T>(items: T[], rowHeight: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const pendingScrollTopRef = useRef<number | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);

  const scheduleScrollTopUpdate = React.useCallback((nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollAnimationFrameRef.current !== null) {
      return;
    }

    scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
      scrollAnimationFrameRef.current = null;
      const pendingScrollTop = pendingScrollTopRef.current;
      pendingScrollTopRef.current = null;
      if (pendingScrollTop !== null) {
        setScrollTop((currentScrollTop) => (
          currentScrollTop === pendingScrollTop ? currentScrollTop : pendingScrollTop
        ));
      }
    });
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const syncViewport = () => {
      setViewportHeight(container.clientHeight);
      setScrollTop(container.scrollTop);
    };

    syncViewport();

    const resizeObserver = new ResizeObserver(() => {
      syncViewport();
    });
    resizeObserver.observe(container);
    return () => {
      if (scrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, []);

  const slice = useMemo(() => getWindowedListSlice({
    items,
    scrollTop,
    viewportHeight,
    rowHeight,
  }), [items, rowHeight, scrollTop, viewportHeight]);

  return {
    scrollRef,
    slice,
    handleScroll: (event: React.UIEvent<HTMLDivElement>) => {
      scheduleScrollTopUpdate(event.currentTarget.scrollTop);
    },
  };
}

const BookmarkRow = React.memo(function BookmarkRow({
  bookmark,
  onOpenBookmark,
  getFileLabel,
  getRelativePath,
}: {
  bookmark: CodePaneBookmark;
  onOpenBookmark: (bookmark: CodePaneBookmark) => void;
  getFileLabel: (filePath: string) => string;
  getRelativePath: (filePath: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenBookmark(bookmark)}
      className="flex h-14 w-full items-start gap-2 rounded px-2 py-2 text-left text-xs text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
    >
      <span className="mt-0.5 rounded bg-[rgb(var(--warning)/0.14)] px-1 py-0.5 text-[10px] font-medium text-[rgb(var(--warning))]">
        {bookmark.lineNumber}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[rgb(var(--foreground))]">{getFileLabel(bookmark.filePath)}</div>
        <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{getRelativePath(bookmark.filePath)}</div>
      </div>
    </button>
  );
});

const TodoRow = React.memo(function TodoRow({
  item,
  onOpenTodo,
  getFileLabel,
  getRelativePath,
}: {
  item: TodoItem;
  onOpenTodo: (item: TodoItem) => void;
  getFileLabel: (filePath: string) => string;
  getRelativePath: (filePath: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenTodo(item)}
      className="flex h-[74px] w-full items-start gap-2 rounded px-2 py-2 text-left text-xs text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
    >
      <span className="mt-0.5 rounded bg-[rgb(var(--info)/0.14)] px-1 py-0.5 text-[10px] font-medium text-[rgb(var(--info))]">
        {item.token}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[rgb(var(--foreground))]">{getFileLabel(item.filePath)}</div>
        <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">
          {getRelativePath(item.filePath)}:{item.lineNumber}
        </div>
        <div className="mt-1 line-clamp-2 break-words text-[11px] text-[rgb(var(--muted-foreground))]">{item.lineText.trim()}</div>
      </div>
    </button>
  );
});

const LocalHistoryRow = React.memo(function LocalHistoryRow({
  entry,
  onOpenHistoryEntry,
  onRestoreHistoryEntry,
  getRelativePath,
  emptyPreviewLabel,
  restoreLabel,
}: {
  entry: LocalHistoryEntry;
  onOpenHistoryEntry: (entry: LocalHistoryEntry) => void;
  onRestoreHistoryEntry: (entry: LocalHistoryEntry) => void;
  getRelativePath: (filePath: string) => string;
  emptyPreviewLabel: string;
  restoreLabel: string;
}) {
  return (
    <div className="h-[94px] rounded border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] p-2">
      <button
        type="button"
        onClick={() => onOpenHistoryEntry(entry)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-xs font-medium text-[rgb(var(--foreground))]">{entry.label}</div>
          <div className="shrink-0 text-[10px] text-[rgb(var(--muted-foreground))]">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </div>
        </div>
        <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{getRelativePath(entry.filePath)}</div>
        <div className="mt-2 line-clamp-2 text-[11px] text-[rgb(var(--muted-foreground))]">{entry.preview || emptyPreviewLabel}</div>
      </button>
      <div className="mt-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => onRestoreHistoryEntry(entry)}
          className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-2 py-1 text-[10px] text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
        >
          <RotateCcw size={10} />
          {restoreLabel}
        </button>
      </div>
    </div>
  );
});

export const WorkspaceToolWindow = React.memo(function WorkspaceToolWindow({
  bookmarks,
  todoItems,
  localHistoryEntries,
  activeFilePath,
  isTodoLoading,
  todoError,
  onClose,
  onRefresh,
  onOpenBookmark,
  onOpenTodo,
  onOpenHistoryEntry,
  onRestoreHistoryEntry,
  getFileLabel,
  getRelativePath,
}: WorkspaceToolWindowProps) {
  const { t } = useI18n();
  const { scrollRef: bookmarksScrollRef, slice: visibleBookmarks, handleScroll: handleBookmarksScroll } = useFixedWindowedList(
    bookmarks,
    WORKSPACE_BOOKMARK_ROW_HEIGHT,
  );
  const { scrollRef: todoScrollRef, slice: visibleTodoItems, handleScroll: handleTodoScroll } = useFixedWindowedList(
    todoItems,
    WORKSPACE_TODO_ROW_HEIGHT,
  );
  const { scrollRef: historyScrollRef, slice: visibleHistoryEntries, handleScroll: handleHistoryScroll } = useFixedWindowedList(
    localHistoryEntries,
    WORKSPACE_HISTORY_ROW_HEIGHT,
  );
  const localHistoryEmptyPreviewLabel = t('codePane.localHistoryEmptyPreview');
  const localHistoryRestoreLabel = t('codePane.localHistoryRestore');

  return (
    <IdePopupShell className="flex h-full min-h-0 flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className={idePopupHeaderMetaClassName}>
            {t('codePane.workspaceTab')}
          </div>
          <div className={`mt-1 ${idePopupTitleClassName}`}>
            {t('codePane.workspaceOverview')}
          </div>
          <div className={idePopupSubtitleClassName}>
            {activeFilePath ? getFileLabel(activeFilePath) : t('codePane.workspaceOverview')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className={idePopupIconButtonClassName}
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
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

      <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-3">
        <section className="flex min-h-0 flex-col border-r border-[rgb(var(--border))]">
          <header className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.bookmarksTitle')}
          </header>
          <div
            ref={bookmarksScrollRef}
            className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-2 py-2`}
            onScroll={handleBookmarksScroll}
          >
            {bookmarks.length > 0 ? (
              visibleBookmarks.isWindowed ? (
                <div style={{ height: `${visibleBookmarks.totalHeight}px`, position: 'relative' }}>
                  <div style={{ transform: `translateY(${visibleBookmarks.offsetTop}px)` }}>
                    {visibleBookmarks.items.map((bookmark) => (
                      <BookmarkRow
                        key={bookmark.id}
                        bookmark={bookmark}
                        onOpenBookmark={onOpenBookmark}
                        getFileLabel={getFileLabel}
                        getRelativePath={getRelativePath}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {bookmarks.map((bookmark) => (
                    <BookmarkRow
                      key={bookmark.id}
                      bookmark={bookmark}
                      onOpenBookmark={onOpenBookmark}
                      getFileLabel={getFileLabel}
                      getRelativePath={getRelativePath}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.bookmarksEmpty')}</div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col border-r border-[rgb(var(--border))]">
          <header className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.todoTitle')}
          </header>
          <div
            ref={todoScrollRef}
            className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-2 py-2`}
            onScroll={handleTodoScroll}
          >
            {isTodoLoading ? (
              <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
                <Loader2 size={12} className="animate-spin" />
                {t('codePane.todoLoading')}
              </div>
            ) : todoError ? (
              <div className="text-xs text-[rgb(var(--error))]">{todoError}</div>
            ) : todoItems.length > 0 ? (
              visibleTodoItems.isWindowed ? (
                <div style={{ height: `${visibleTodoItems.totalHeight}px`, position: 'relative' }}>
                  <div style={{ transform: `translateY(${visibleTodoItems.offsetTop}px)` }}>
                    {visibleTodoItems.items.map((item) => (
                      <TodoRow
                        key={`${item.token}:${item.filePath}:${item.lineNumber}:${item.column}`}
                        item={item}
                        onOpenTodo={onOpenTodo}
                        getFileLabel={getFileLabel}
                        getRelativePath={getRelativePath}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {todoItems.map((item) => (
                    <TodoRow
                      key={`${item.token}:${item.filePath}:${item.lineNumber}:${item.column}`}
                      item={item}
                      onOpenTodo={onOpenTodo}
                      getFileLabel={getFileLabel}
                      getRelativePath={getRelativePath}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.todoEmpty')}</div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <header className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.localHistoryTitle')}
          </header>
          <div
            ref={historyScrollRef}
            className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-2 py-2`}
            onScroll={handleHistoryScroll}
          >
            {localHistoryEntries.length > 0 ? (
              visibleHistoryEntries.isWindowed ? (
                <div style={{ height: `${visibleHistoryEntries.totalHeight}px`, position: 'relative' }}>
                  <div style={{ transform: `translateY(${visibleHistoryEntries.offsetTop}px)` }}>
                    {visibleHistoryEntries.items.map((entry) => (
                      <LocalHistoryRow
                        key={entry.id}
                        entry={entry}
                        onOpenHistoryEntry={onOpenHistoryEntry}
                        onRestoreHistoryEntry={onRestoreHistoryEntry}
                        getRelativePath={getRelativePath}
                        emptyPreviewLabel={localHistoryEmptyPreviewLabel}
                        restoreLabel={localHistoryRestoreLabel}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {localHistoryEntries.map((entry) => (
                    <LocalHistoryRow
                      key={entry.id}
                      entry={entry}
                      onOpenHistoryEntry={onOpenHistoryEntry}
                      onRestoreHistoryEntry={onRestoreHistoryEntry}
                      getRelativePath={getRelativePath}
                      emptyPreviewLabel={localHistoryEmptyPreviewLabel}
                      restoreLabel={localHistoryRestoreLabel}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.localHistoryEmpty')}</div>
            )}
          </div>
        </section>
      </div>
    </IdePopupShell>
  );
});
