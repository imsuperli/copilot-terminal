import React from 'react';
import { Loader2 } from 'lucide-react';
import type { CodePaneGitDiffHunk } from '../../../../shared/types/electron-api';
import type { TranslationKey, TranslationParams } from '../../../i18n';
import { getPathLeafLabel } from '../../../utils/pathDisplay';
import {
  idePopupBadgeClassName,
  idePopupCardClassName,
  idePopupMicroButtonClassName,
} from '../../ui/ide-popup';

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

const GIT_HUNK_MAX_RENDERED_LINES = 80;

const GitHunkRows = React.memo(function GitHunkRows({
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
      <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-2.5 py-2 text-[11px] text-zinc-500">
        {staged ? t('codePane.gitNoStagedHunks') : t('codePane.gitNoUnstagedHunks')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hunks.map((hunk) => {
        const visibleLines = hunk.lines.slice(0, GIT_HUNK_MAX_RENDERED_LINES);
        const hiddenLineCount = Math.max(0, hunk.lines.length - visibleLines.length);

        return (
          <div key={hunk.id} className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/35">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-2.5 py-1.5">
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
                    className={idePopupMicroButtonClassName('neutral')}
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
                      className={idePopupMicroButtonClassName('success')}
                    >
                      {t('codePane.gitStageHunk')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDiscardHunk(hunk);
                      }}
                      className={idePopupMicroButtonClassName('danger')}
                    >
                      {t('codePane.gitDiscardHunk')}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="max-h-40 overflow-auto px-2.5 py-1.5 font-mono text-[10px] leading-5">
              {visibleLines.map((line, index) => {
                const tone = line.type === 'add'
                  ? 'bg-emerald-500/[0.06] text-emerald-200'
                  : line.type === 'delete'
                    ? 'bg-red-500/[0.06] text-red-200'
                    : 'text-zinc-500';
                const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
                return (
                  <div
                    key={`${hunk.id}:${index}`}
                    className={`grid grid-cols-[2.5rem_2.5rem_1rem_minmax(0,1fr)] gap-1 rounded-sm px-1 ${tone}`}
                  >
                    <span className="select-none text-right text-zinc-600">{line.oldLineNumber ?? ''}</span>
                    <span className="select-none text-right text-zinc-600">{line.newLineNumber ?? ''}</span>
                    <span className="select-none">{prefix}</span>
                    <span className="truncate whitespace-pre">{line.text || ' '}</span>
                  </div>
                );
              })}
              {hiddenLineCount > 0 && (
                <div className="px-1 pt-1 text-[10px] text-zinc-500">
                  +{hiddenLineCount}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export const GitHunkList = React.memo(function GitHunkList({
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
    <div className={`${idePopupCardClassName} p-2.5`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {t('codePane.gitSelectedFileHunks')}
        </div>
        {loading && <Loader2 size={12} className="animate-spin text-zinc-500" />}
      </div>

      {!selectedPath ? (
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-2.5 py-2 text-xs text-zinc-500">
          {t('codePane.gitSelectChangedFileForHunks')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="min-w-0 rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-2.5 py-2">
            <div className="truncate text-xs font-medium text-zinc-200">{getPathLeafLabel(selectedPath)}</div>
            {relativePath && (
              <div className="truncate text-[10px] text-zinc-500">{relativePath}</div>
            )}
          </div>
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/[0.08] px-2.5 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
              <span>{t('codePane.gitSectionUnstaged')}</span>
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${idePopupBadgeClassName('amber')}`}>{unstagedHunks.length}</span>
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
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${idePopupBadgeClassName('emerald')}`}>{stagedHunks.length}</span>
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
});
