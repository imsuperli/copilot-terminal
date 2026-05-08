import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import type {
  CodePaneRunSession,
  CodePaneTestItem,
} from '../../../../shared/types/electron-api';
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

interface TestsToolWindowProps {
  testItems: CodePaneTestItem[];
  sessions: CodePaneRunSession[];
  selectedSession: CodePaneRunSession | null;
  selectedOutput: string;
  isLoading: boolean;
  error: string | null;
  hasFailedSessions: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onRunTest: (targetId: string) => void | Promise<void>;
  onSelectSession: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void | Promise<void>;
  onOpenTestItem: (item: CodePaneTestItem) => void | Promise<void>;
  onRerunFailed: () => void | Promise<void>;
}

type FlatTestTreeRow = {
  key: string;
  item: CodePaneTestItem;
  depth: number;
  hasChildren: boolean;
};

type WindowedListSlice<T> = {
  items: T[];
  offsetTop: number;
  totalHeight: number;
  isWindowed: boolean;
};

const TESTS_FIXED_LIST_OVERSCAN = 8;
const TESTS_FIXED_LIST_WINDOWING_THRESHOLD = 80;
const TESTS_TREE_ROW_HEIGHT = 28;
const TESTS_SESSION_ROW_HEIGHT = 64;

function getWindowedListSlice<T>({
  items,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan = TESTS_FIXED_LIST_OVERSCAN,
  threshold = TESTS_FIXED_LIST_WINDOWING_THRESHOLD,
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

function flattenTestTreeItems(items: CodePaneTestItem[], depth = 0): FlatTestTreeRow[] {
  const rows: FlatTestTreeRow[] = [];
  const stack: Array<{ item: CodePaneTestItem; depth: number }> = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    stack.push({
      item: items[index]!,
      depth,
    });
  }

  while (stack.length > 0) {
    const nextRow = stack.pop()!;
    const children = nextRow.item.children ?? [];
    rows.push({
      key: nextRow.item.id,
      item: nextRow.item,
      depth: nextRow.depth,
      hasChildren: children.length > 0,
    });

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({
        item: children[index]!,
        depth: nextRow.depth + 1,
      });
    }
  }

  return rows;
}

const TestTreeRow = React.memo(function TestTreeRow({
  row,
  onRunTest,
  onOpenTestItem,
}: {
  row: FlatTestTreeRow;
  onRunTest: (targetId: string) => void | Promise<void>;
  onOpenTestItem: (item: CodePaneTestItem) => void | Promise<void>;
}) {
  const { item, depth, hasChildren } = row;

  return (
    <div
      className="flex h-7 items-center gap-2 rounded px-2 text-xs text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
      style={{ paddingLeft: `${8 + (depth * 14)}px` }}
    >
      <button
        type="button"
        onClick={() => {
          if (item.filePath) {
            void onOpenTestItem(item);
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {hasChildren ? (
          <ChevronDown size={12} className="shrink-0 text-[rgb(var(--muted-foreground))]" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <FileCode2 size={12} className="shrink-0 text-[rgb(var(--muted-foreground))]" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="rounded bg-[var(--appearance-pane-chrome-background)] px-1 py-0.5 text-[10px] text-[rgb(var(--muted-foreground))]">
          {item.kind}
        </span>
      </button>
      {item.runnableTargetId && (
        <button
          type="button"
          onClick={() => {
            void onRunTest(item.runnableTargetId!);
          }}
          className="rounded-md border border-[rgb(var(--success))/0.35] bg-[rgb(var(--success))/0.12] p-1 text-[rgb(var(--success))] transition-colors hover:border-[rgb(var(--success))/0.5] hover:bg-[rgb(var(--success))/0.18]"
        >
          <Play size={11} />
        </button>
      )}
    </div>
  );
});

const TestSessionRow = React.memo(function TestSessionRow({
  session,
  isSelected,
  onSelectSession,
}: {
  session: CodePaneRunSession;
  isSelected: boolean;
  onSelectSession: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const tone = getSessionTone(session.state, t);

  return (
    <button
      type="button"
      onClick={() => {
        onSelectSession(session.id);
      }}
      className={`h-16 w-full rounded border px-2 py-2 text-left transition-colors ${
        isSelected
          ? 'border-[rgb(var(--ring))]/45 bg-[rgb(var(--primary))]/10 text-[rgb(var(--foreground))]'
          : 'border-transparent bg-transparent text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{session.label}</div>
          <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{session.detail}</div>
        </div>
        <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${tone.className}`}>
          {tone.label}
        </span>
      </div>
      <div className="mt-2 text-[10px] text-[rgb(var(--muted-foreground))]">
        {formatSessionTimestamp(session.startedAt)}
      </div>
    </button>
  );
});

export const TestsToolWindow = React.memo(function TestsToolWindow({
  testItems,
  sessions,
  selectedSession,
  selectedOutput,
  isLoading,
  error,
  hasFailedSessions,
  onClose,
  onRefresh,
  onRunTest,
  onSelectSession,
  onStopSession,
  onOpenTestItem,
  onRerunFailed,
}: TestsToolWindowProps) {
  const { t } = useI18n();
  const flatTestRows = useMemo(() => flattenTestTreeItems(testItems), [testItems]);
  const { scrollRef: testTreeScrollRef, slice: visibleTestRows, handleScroll: handleTestTreeScroll } = useFixedWindowedList(
    flatTestRows,
    TESTS_TREE_ROW_HEIGHT,
  );
  const { scrollRef: sessionsScrollRef, slice: visibleSessionRows, handleScroll: handleSessionsScroll } = useFixedWindowedList(
    sessions,
    TESTS_SESSION_ROW_HEIGHT,
  );

  return (
    <IdePopupShell className="flex h-full min-h-0 flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className={idePopupHeaderMetaClassName}>
            {t('codePane.testsTab')}
          </div>
          <div className={`mt-1 ${idePopupTitleClassName}`}>
            {t('codePane.testTree')}
          </div>
          <div className={idePopupSubtitleClassName}>
            {flatTestRows.length}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onRerunFailed();
            }}
            disabled={!hasFailedSessions}
            className="rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('codePane.rerunFailedTests')}
          </button>
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-[320px] shrink-0 flex-col border-r border-[rgb(var(--border))]">
          <div className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.testTree')}
          </div>
          <div
            ref={testTreeScrollRef}
            className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-2 py-2`}
            onScroll={handleTestTreeScroll}
          >
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
                <Loader2 size={12} className="animate-spin" />
                {t('codePane.testsLoading')}
              </div>
            ) : error ? (
              <div className="text-xs text-[rgb(var(--error))]">{error}</div>
            ) : flatTestRows.length > 0 ? (
              visibleTestRows.isWindowed ? (
                <div style={{ height: `${visibleTestRows.totalHeight}px`, position: 'relative' }}>
                  <div style={{ transform: `translateY(${visibleTestRows.offsetTop}px)` }}>
                    {visibleTestRows.items.map((row) => (
                      <TestTreeRow
                        key={row.key}
                        row={row}
                        onRunTest={onRunTest}
                        onOpenTestItem={onOpenTestItem}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {flatTestRows.map((row) => (
                    <TestTreeRow
                      key={row.key}
                      row={row}
                      onRunTest={onRunTest}
                      onOpenTestItem={onOpenTestItem}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.testsEmpty')}</div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex w-64 shrink-0 flex-col border-r border-[rgb(var(--border))]">
              <div className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                {t('codePane.runSessions')}
              </div>
              <div
                ref={sessionsScrollRef}
                className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-2 py-2`}
                onScroll={handleSessionsScroll}
              >
                {sessions.length > 0 ? (
                  visibleSessionRows.isWindowed ? (
                    <div style={{ height: `${visibleSessionRows.totalHeight}px`, position: 'relative' }}>
                      <div style={{ transform: `translateY(${visibleSessionRows.offsetTop}px)` }}>
                        {visibleSessionRows.items.map((session) => (
                          <TestSessionRow
                            key={session.id}
                            session={session}
                            isSelected={selectedSession?.id === session.id}
                            onSelectSession={onSelectSession}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {sessions.map((session) => (
                        <TestSessionRow
                          key={session.id}
                          session={session}
                          isSelected={selectedSession?.id === session.id}
                          onSelectSession={onSelectSession}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.runConsoleEmpty')}</div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                    {t('codePane.runConsole')}
                  </div>
                  {selectedSession && (
                    <div className="mt-1 truncate text-xs text-[rgb(var(--foreground))]">
                      {selectedSession.label}
                    </div>
                  )}
                </div>
                {selectedSession && isSessionActive(selectedSession) && (
                  <button
                    type="button"
                    onClick={() => {
                      void onStopSession(selectedSession.id);
                    }}
                    className="rounded-md border border-[rgb(var(--error))/0.35] bg-[rgb(var(--error))/0.12] p-1.5 text-[rgb(var(--error))] transition-colors hover:border-[rgb(var(--error))/0.5] hover:bg-[rgb(var(--error))/0.18]"
                    aria-label={t('codePane.stopRun')}
                  >
                    <Square size={12} />
                  </button>
                )}
              </div>
              <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-3 py-3`}>
                {selectedSession ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[rgb(var(--foreground))]">
                    {selectedOutput || '$ '}
                  </pre>
                ) : (
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.runConsoleEmpty')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </IdePopupShell>
  );
});

function formatSessionTimestamp(timestamp: string): string {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) {
    return timestamp;
  }

  return new Date(value).toLocaleTimeString();
}

function isSessionActive(session: CodePaneRunSession): boolean {
  return session.state === 'starting' || session.state === 'running';
}

function getSessionTone(
  state: CodePaneRunSession['state'],
  t: ReturnType<typeof useI18n>['t'],
): { label: string; className: string } {
  switch (state) {
    case 'starting':
      return {
        label: t('codePane.sessionStateStarting'),
        className: 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]',
      };
    case 'running':
      return {
        label: t('codePane.sessionStateRunning'),
        className: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
      };
    case 'passed':
      return {
        label: t('codePane.sessionStatePassed'),
        className: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
      };
    case 'failed':
      return {
        label: t('codePane.sessionStateFailed'),
        className: 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]',
      };
    case 'stopped':
      return {
        label: t('codePane.sessionStateStopped'),
        className: 'bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--muted-foreground))]',
      };
    default:
      return {
        label: state,
        className: 'bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--muted-foreground))]',
      };
  }
}
