import React, { useState } from 'react';
import { GitCommitHorizontal, Package, Route, Undo2 } from 'lucide-react';
import type { CodePaneGitRepositorySummary } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface CommitComposerProps {
  summary: CodePaneGitRepositorySummary | null;
  onCommit: (config: { message: string; amend: boolean; includeAll: boolean }) => void | Promise<void>;
  onStash: (config: { message: string; includeUntracked: boolean }) => void | Promise<void>;
  onCheckout: (config: { branchName: string; createBranch: boolean }) => void | Promise<void>;
  onRebaseControl: (action: 'continue' | 'abort') => void | Promise<void>;
}

export function CommitComposer({
  summary,
  onCommit,
  onStash,
  onCheckout,
  onRebaseControl,
}: CommitComposerProps) {
  const { t } = useI18n();
  const [commitMessage, setCommitMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [includeAll, setIncludeAll] = useState(true);
  const [stashMessage, setStashMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [branchName, setBranchName] = useState('');
  const [createBranch, setCreateBranch] = useState(false);

  return (
    <div className="space-y-3 rounded border border-zinc-800 bg-zinc-900/50 p-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {t('codePane.gitComposer')}
      </div>

      <div className="space-y-2">
        <textarea
          value={commitMessage}
          onChange={(event) => {
            setCommitMessage(event.target.value);
          }}
          placeholder={t('codePane.gitCommitPlaceholder')}
          className="h-20 w-full resize-none rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700"
        />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={amend} onChange={(event) => { setAmend(event.target.checked); }} />
            {t('codePane.gitAmend')}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={includeAll} onChange={(event) => { setIncludeAll(event.target.checked); }} />
            {t('codePane.gitStageAllBeforeCommit')}
          </label>
        </div>
        <button
          type="button"
          disabled={!commitMessage.trim()}
          onClick={() => {
            void onCommit({
              message: commitMessage.trim(),
              amend,
              includeAll,
            });
            setCommitMessage('');
          }}
          className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GitCommitHorizontal size={12} />
          {t('codePane.gitCommit')}
        </button>
      </div>

      <div className="space-y-2">
        <input
          value={stashMessage}
          onChange={(event) => {
            setStashMessage(event.target.value);
          }}
          placeholder={t('codePane.gitStashPlaceholder')}
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700"
        />
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(event) => {
                setIncludeUntracked(event.target.checked);
              }}
            />
            {t('codePane.gitIncludeUntracked')}
          </label>
          <button
            type="button"
            onClick={() => {
              void onStash({
                message: stashMessage.trim(),
                includeUntracked,
              });
              setStashMessage('');
            }}
            className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
          >
            <Package size={12} />
            {t('codePane.gitStash')}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <input
          value={branchName}
          onChange={(event) => {
            setBranchName(event.target.value);
          }}
          placeholder={t('codePane.gitCheckoutPlaceholder')}
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700"
        />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={createBranch}
              onChange={(event) => {
                setCreateBranch(event.target.checked);
              }}
            />
            {t('codePane.gitCreateBranch')}
          </label>
          <button
            type="button"
            disabled={!branchName.trim()}
            onClick={() => {
              void onCheckout({
                branchName: branchName.trim(),
                createBranch,
              });
              setBranchName('');
            }}
            className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Route size={12} />
            {t('codePane.gitCheckout')}
          </button>
        </div>
      </div>

      {summary?.operation === 'rebase' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onRebaseControl('continue');
            }}
            className="rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-200 transition-colors hover:bg-amber-500/25"
          >
            {t('codePane.gitRebaseContinue')}
          </button>
          <button
            type="button"
            onClick={() => {
              void onRebaseControl('abort');
            }}
            className="flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-200 transition-colors hover:bg-red-500/25"
          >
            <Undo2 size={12} />
            {t('codePane.gitRebaseAbort')}
          </button>
        </div>
      )}
    </div>
  );
}
