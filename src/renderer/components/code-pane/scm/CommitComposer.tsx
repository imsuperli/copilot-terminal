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
    <div className="space-y-3 rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_58%,transparent)] p-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
        {t('codePane.gitComposer')}
      </div>

      <div className="space-y-2">
        <textarea
          value={commitMessage}
          onChange={(event) => {
            setCommitMessage(event.target.value);
          }}
          placeholder={t('codePane.gitCommitPlaceholder')}
          className="h-20 w-full resize-none rounded border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-2 text-xs text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--muted-foreground))]/75 focus:border-[rgb(var(--ring))]"
        />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[rgb(var(--muted-foreground))]">
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
          className="flex items-center gap-1 rounded bg-[rgb(var(--success)/0.14)] px-2 py-1 text-[11px] text-[rgb(var(--success))] transition-colors hover:bg-[rgb(var(--success)/0.22)] disabled:cursor-not-allowed disabled:opacity-40"
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
          className="w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1.5 text-xs text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--muted-foreground))]/75 focus:border-[rgb(var(--ring))]"
        />
        <div className="flex items-center gap-2 text-[11px] text-[rgb(var(--muted-foreground))]">
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
            className="flex items-center gap-1 rounded bg-[rgb(var(--secondary))] px-2 py-1 text-[11px] text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
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
          className="w-full rounded border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1.5 text-xs text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--muted-foreground))]/75 focus:border-[rgb(var(--ring))]"
        />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[rgb(var(--muted-foreground))]">
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
            className="flex items-center gap-1 rounded bg-[rgb(var(--secondary))] px-2 py-1 text-[11px] text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-40"
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
            className="rounded bg-[rgb(var(--warning)/0.14)] px-2 py-1 text-[11px] text-[rgb(var(--warning))] transition-colors hover:bg-[rgb(var(--warning)/0.22)]"
          >
            {t('codePane.gitRebaseContinue')}
          </button>
          <button
            type="button"
            onClick={() => {
              void onRebaseControl('abort');
            }}
            className="flex items-center gap-1 rounded bg-[rgb(var(--error)/0.14)] px-2 py-1 text-[11px] text-[rgb(var(--error))] transition-colors hover:bg-[rgb(var(--error)/0.22)]"
          >
            <Undo2 size={12} />
            {t('codePane.gitRebaseAbort')}
          </button>
        </div>
      )}
    </div>
  );
}
