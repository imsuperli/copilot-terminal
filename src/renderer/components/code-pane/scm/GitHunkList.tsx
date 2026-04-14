import React from 'react';
import { Loader2 } from 'lucide-react';
import type { CodePaneGitDiffHunk } from '../../../../shared/types/electron-api';
import type { TranslationKey, TranslationParams } from '../../../i18n';
import { getPathLeafLabel } from '../../../utils/pathDisplay';

interface GitHunkListProps {
  selectedPath: string | null;
  relativePath: string | null;
  stagedHunks: CodePaneGitDiffHunk[];
  unstagedHunks: CodePaneGitDiffHunk[];
  loading: boolean;
  error: string | null;
  onStageHunk: (hunk: CodePaneGitDiffHunk) => void;
  onUnstageHunk: (hunk: CodePaneGitDiffHunk) => void;
  onDiscardHunk: (hunk: CodePaneGitDiffHunk) => void;
  t: (key: TranslationKey, values?: TranslationParams) => string;
}

function GitHunkRows({
  hunks,
  staged,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  t,
}: {
  hunks: CodePaneGitDiffHunk[];
  staged: boolean;
  onStageHunk: (hunk: CodePaneGitDiffHunk) => void;
  onUnstageHunk: (hunk: CodePaneGitDiffHunk) => void;
  onDiscardHunk: (hunk: CodePaneGitDiffHunk) => void;
  t: (key: TranslationKey, values?: TranslationParams) => string;
}) {
  if (hunks.length === 0) {
    return (
      <div className="rounded bg-zinc-950/50 px-2 py-1.5 text-[11px] text-zinc-500">
        {staged ? t('codePane.gitNoStagedHunks') : t('codePane.gitNoUnstagedHunks')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hunks.map((hunk) => (
        <div key={hunk.id} className="rounded border border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-2 py-1">
            <div className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-400">
              {hunk.header}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {staged ? (
                <button
                  type="button"
                  onClick={() => {
                    onUnstageHunk(hunk);
                  }}
                  className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                >
                  {t('codePane.gitUnstageHunk')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onStageHunk(hunk);
                    }}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                  >
                    {t('codePane.gitStageHunk')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDiscardHunk(hunk);
                    }}
                    className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-500/25"
                  >
                    {t('codePane.gitDiscardHunk')}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="max-h-40 overflow-auto px-2 py-1 font-mono text-[10px] leading-5">
            {hunk.lines.map((line, index) => {
              const tone = line.type === 'add'
                ? 'text-emerald-300'
                : line.type === 'delete'
                  ? 'text-red-300'
                  : 'text-zinc-500';
              const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
              return (
                <div
                  key={`${hunk.id}:${index}`}
                  className={`grid grid-cols-[2.5rem_2.5rem_1rem_minmax(0,1fr)] gap-1 ${tone}`}
                >
                  <span className="select-none text-right text-zinc-600">{line.oldLineNumber ?? ''}</span>
                  <span className="select-none text-right text-zinc-600">{line.newLineNumber ?? ''}</span>
                  <span className="select-none">{prefix}</span>
                  <span className="truncate whitespace-pre">{line.text || ' '}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GitHunkList({
  selectedPath,
  relativePath,
  stagedHunks,
  unstagedHunks,
  loading,
  error,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  t,
}: GitHunkListProps) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {t('codePane.gitSelectedFileHunks')}
        </div>
        {loading && <Loader2 size={12} className="animate-spin text-zinc-500" />}
      </div>

      {!selectedPath ? (
        <div className="text-xs text-zinc-500">{t('codePane.gitSelectChangedFileForHunks')}</div>
      ) : (
        <div className="space-y-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-zinc-200">{getPathLeafLabel(selectedPath)}</div>
            {relativePath && (
              <div className="truncate text-[10px] text-zinc-500">{relativePath}</div>
            )}
          </div>
          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
              <span>{t('codePane.gitSectionUnstaged')}</span>
              <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-500">{unstagedHunks.length}</span>
            </div>
            <GitHunkRows
              hunks={unstagedHunks}
              staged={false}
              onStageHunk={onStageHunk}
              onUnstageHunk={onUnstageHunk}
              onDiscardHunk={onDiscardHunk}
              t={t}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
              <span>{t('codePane.gitSectionStaged')}</span>
              <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-500">{stagedHunks.length}</span>
            </div>
            <GitHunkRows
              hunks={stagedHunks}
              staged
              onStageHunk={onStageHunk}
              onUnstageHunk={onUnstageHunk}
              onDiscardHunk={onDiscardHunk}
              t={t}
            />
          </div>
        </div>
      )}
    </div>
  );
}
