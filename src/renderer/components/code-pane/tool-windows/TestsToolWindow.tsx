import React from 'react';
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

export function TestsToolWindow({
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

  return (
    <div className="flex h-64 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.testsTab')}
          </div>
          <div className="text-xs text-zinc-500">
            {countTestNodes(testItems)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onRerunFailed();
            }}
            disabled={!hasFailedSessions}
            className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('codePane.rerunFailedTests')}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-zinc-800 p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-[320px] shrink-0 flex-col border-r border-zinc-800">
          <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {t('codePane.testTree')}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 size={12} className="animate-spin" />
                {t('codePane.testsLoading')}
              </div>
            ) : error ? (
              <div className="text-xs text-red-300">{error}</div>
            ) : testItems.length > 0 ? (
              <div className="space-y-1">
                {testItems.map((item) => (
                  <TestTreeItem
                    key={item.id}
                    item={item}
                    depth={0}
                    onRunTest={onRunTest}
                    onOpenTestItem={onOpenTestItem}
                  />
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-500">{t('codePane.testsEmpty')}</div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex w-64 shrink-0 flex-col border-r border-zinc-800">
              <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {t('codePane.runSessions')}
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                {sessions.length > 0 ? (
                  <div className="space-y-1">
                    {sessions.map((session) => {
                      const tone = getSessionTone(session.state);
                      const isSelected = selectedSession?.id === session.id;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => {
                            onSelectSession(session.id);
                          }}
                          className={`w-full rounded border px-2 py-2 text-left transition-colors ${
                            isSelected
                              ? 'border-zinc-700 bg-zinc-800 text-zinc-100'
                              : 'border-transparent bg-transparent text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium">{session.label}</div>
                              <div className="mt-1 truncate text-[10px] text-zinc-500">{session.detail}</div>
                            </div>
                            <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${tone.className}`}>
                              {tone.label}
                            </span>
                          </div>
                          <div className="mt-2 text-[10px] text-zinc-500">
                            {formatSessionTimestamp(session.startedAt)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">{t('codePane.runConsoleEmpty')}</div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    {t('codePane.runConsole')}
                  </div>
                  {selectedSession && (
                    <div className="mt-1 truncate text-xs text-zinc-300">
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
                    className="rounded bg-red-500/15 p-1 text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200"
                    aria-label={t('codePane.stopRun')}
                  >
                    <Square size={12} />
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                {selectedSession ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-zinc-200">
                    {selectedOutput || '$ '}
                  </pre>
                ) : (
                  <div className="text-xs text-zinc-500">{t('codePane.runConsoleEmpty')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TestTreeItemProps {
  item: CodePaneTestItem;
  depth: number;
  onRunTest: (targetId: string) => void | Promise<void>;
  onOpenTestItem: (item: CodePaneTestItem) => void | Promise<void>;
}

function TestTreeItem({
  item,
  depth,
  onRunTest,
  onOpenTestItem,
}: TestTreeItemProps) {
  const hasChildren = (item.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900/70"
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
            <ChevronDown size={12} className="shrink-0 text-zinc-500" />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <FileCode2 size={12} className="shrink-0 text-zinc-500" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-500">
            {item.kind}
          </span>
        </button>
        {item.runnableTargetId && (
          <button
            type="button"
            onClick={() => {
              void onRunTest(item.runnableTargetId!);
            }}
            className="rounded bg-emerald-500/15 p-1 text-emerald-300 transition-colors hover:bg-emerald-500/25 hover:text-emerald-200"
          >
            <Play size={11} />
          </button>
        )}
      </div>
      {hasChildren && (
        <div className="space-y-1">
          {item.children!.map((child) => (
            <TestTreeItem
              key={child.id}
              item={child}
              depth={depth + 1}
              onRunTest={onRunTest}
              onOpenTestItem={onOpenTestItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function countTestNodes(items: CodePaneTestItem[]): number {
  return items.reduce((total, item) => total + 1 + countTestNodes(item.children ?? []), 0);
}

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

function getSessionTone(state: CodePaneRunSession['state']): { label: string; className: string } {
  switch (state) {
    case 'starting':
      return {
        label: 'START',
        className: 'bg-sky-500/15 text-sky-300',
      };
    case 'running':
      return {
        label: 'RUN',
        className: 'bg-emerald-500/15 text-emerald-300',
      };
    case 'passed':
      return {
        label: 'PASS',
        className: 'bg-emerald-500/15 text-emerald-300',
      };
    case 'failed':
      return {
        label: 'FAIL',
        className: 'bg-red-500/15 text-red-300',
      };
    case 'stopped':
      return {
        label: 'STOP',
        className: 'bg-zinc-700 text-zinc-300',
      };
    default:
      return {
        label: state,
        className: 'bg-zinc-700 text-zinc-300',
      };
  }
}
