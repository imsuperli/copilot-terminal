import React from 'react';
import { GitCommitHorizontal, Loader2 } from 'lucide-react';
import type { CodePaneGitBlameLine } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface BlameGutterProps {
  enabled: boolean;
  loading: boolean;
  entry: CodePaneGitBlameLine | null;
  onToggle: () => void;
  onOpenHistory: () => void | Promise<void>;
}

export function BlameGutter({
  enabled,
  loading,
  entry,
  onToggle,
  onOpenHistory,
}: BlameGutterProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/70 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {t('codePane.gitBlame')}
        </div>
        <div className="mt-1 truncate text-xs text-zinc-300">
          {enabled
            ? (entry ? `${entry.author} · ${entry.summary || entry.shortSha}` : t('codePane.gitBlameEmpty'))
            : t('codePane.gitBlameDisabled')}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className={`rounded px-2 py-1 text-[11px] transition-colors ${
            enabled
              ? 'bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50'
          }`}
        >
          {enabled ? t('codePane.gitBlameHide') : t('codePane.gitBlameShow')}
        </button>
        <button
          type="button"
          disabled={!enabled || !entry}
          onClick={() => {
            void onOpenHistory();
          }}
          className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <GitCommitHorizontal size={12} />}
          {t('codePane.gitLineHistory')}
        </button>
      </div>
    </div>
  );
}
