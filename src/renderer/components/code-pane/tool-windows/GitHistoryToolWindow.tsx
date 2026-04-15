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
  const selectedEntry = history?.entries.find((entry) => entry.commitSha === selectedCommitSha)
    ?? history?.entries[0]
    ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.gitHistoryTab')}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-200">
            {history?.targetFilePath ?? t('codePane.gitHistoryEmpty')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onRefresh();
            }}
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
        <div className="min-h-0 border-r border-zinc-800 px-2 py-2">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 size={12} className="animate-spin" />
              {t('codePane.gitHistoryLoading')}
            </div>
          ) : history?.entries.length ? (
            <div className="space-y-1 overflow-auto">
              {history.entries.map((entry) => {
                const isSelected = entry.commitSha === selectedEntry?.commitSha;
                return (
                  <button
                    key={`${entry.commitSha}-${entry.lineNumber ?? 0}`}
                    type="button"
                    onClick={() => {
                      onSelectCommit(entry.commitSha);
                    }}
                    className={`w-full rounded border px-2 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                        : 'border-transparent bg-transparent text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/70'
                    }`}
                  >
                    <div className="truncate text-xs font-medium">{entry.subject || entry.shortSha}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                      <span>{entry.author}</span>
                      <span>{entry.shortSha}</span>
                      {entry.lineNumber ? <span>L{entry.lineNumber}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              {t('codePane.gitHistoryEmpty')}
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-auto px-3 py-3">
          {selectedEntry ? (
            <GitHistoryDetails entry={selectedEntry} onCherryPick={onCherryPick} />
          ) : (
            <div className="text-xs text-zinc-500">{t('codePane.gitHistoryEmpty')}</div>
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
      <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-100">{entry.subject || entry.shortSha}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
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
            className="flex shrink-0 items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
          >
            <GitCommitHorizontal size={12} />
            {t('codePane.gitCherryPick')}
          </button>
        </div>
      </div>
      {entry.refs.length > 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {t('codePane.gitHistoryRefs')}
          </div>
          <div className="flex flex-wrap gap-2">
            {entry.refs.map((ref) => (
              <span key={`${entry.commitSha}-${ref}`} className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
                {ref}
              </span>
            ))}
          </div>
        </div>
      )}
      {entry.filePath && (
        <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {entry.scope === 'line' ? t('codePane.gitLineHistory') : t('codePane.gitFileHistory')}
          </div>
          <div className="text-xs text-zinc-300">{entry.filePath}</div>
          {entry.lineNumber ? (
            <div className="mt-1 text-[11px] text-zinc-500">{t('codePane.gitHistoryLineLabel', { line: entry.lineNumber })}</div>
          ) : null}
        </div>
      )}
      <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 p-3 text-[11px] text-zinc-500">
        <RotateCcw size={12} />
        {t('codePane.gitHistoryReplayHint')}
      </div>
    </div>
  );
}
