import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, X } from 'lucide-react';
import type { CodePaneGitConflictDetails } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface ConflictResolutionToolWindowProps {
  conflict: CodePaneGitConflictDetails | null;
  isLoading: boolean;
  isApplying: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  onApply: (mergedContent: string) => void | Promise<void>;
  onClose: () => void;
}

export function ConflictResolutionToolWindow({
  conflict,
  isLoading,
  isApplying,
  error,
  onRefresh,
  onApply,
  onClose,
}: ConflictResolutionToolWindowProps) {
  const { t } = useI18n();
  const [mergedContent, setMergedContent] = useState('');

  useEffect(() => {
    setMergedContent(conflict?.mergedContent ?? '');
  }, [conflict]);

  const replaceMergedContent = (nextContent: string) => {
    setMergedContent(nextContent);
  };

  return (
    <div className="flex h-80 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.gitConflictResolverTab')}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-200">
            {conflict?.relativePath ?? t('codePane.loading')}
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
            onClick={() => {
              void onApply(mergedContent);
            }}
            disabled={!conflict || isApplying}
            className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {t('codePane.gitApplyConflictResolution')}
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

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-zinc-500">
          <Loader2 size={12} className="animate-spin" />
          {t('codePane.loading')}
        </div>
      ) : conflict ? (
        <>
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] text-zinc-400">
            <button
              type="button"
              onClick={() => {
                replaceMergedContent(conflict.baseContent);
              }}
              className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            >
              <Copy size={11} />
              {t('codePane.gitUseBase')}
            </button>
            <button
              type="button"
              onClick={() => {
                replaceMergedContent(conflict.oursContent);
              }}
              className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            >
              <Copy size={11} />
              {t('codePane.gitUseOurs')}
            </button>
            <button
              type="button"
              onClick={() => {
                replaceMergedContent(conflict.theirsContent);
              }}
              className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            >
              <Copy size={11} />
              {t('codePane.gitUseTheirs')}
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 overflow-hidden">
            <ConflictPane title={t('codePane.gitConflictBase')} content={conflict.baseContent} />
            <ConflictPane title={t('codePane.gitConflictOurs')} content={conflict.oursContent} borderLeft />
            <ConflictPane title={t('codePane.gitConflictTheirs')} content={conflict.theirsContent} borderTop />
            <MergedConflictPane
              title={t('codePane.gitConflictMerged')}
              content={mergedContent}
              borderLeft
              borderTop
              onChange={setMergedContent}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">
          {t('codePane.gitConflictsNone')}
        </div>
      )}
    </div>
  );
}

function ConflictPane({
  title,
  content,
  borderLeft,
  borderTop,
}: {
  title: string;
  content: string;
  borderLeft?: boolean;
  borderTop?: boolean;
}) {
  return (
    <div className={`flex min-h-0 flex-col ${borderLeft ? 'border-l border-zinc-800' : ''} ${borderTop ? 'border-t border-zinc-800' : ''}`}>
      <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-zinc-200">
          {content || '[empty]'}
        </pre>
      </div>
    </div>
  );
}

function MergedConflictPane({
  title,
  content,
  borderLeft,
  borderTop,
  onChange,
}: {
  title: string;
  content: string;
  borderLeft?: boolean;
  borderTop?: boolean;
  onChange: (nextValue: string) => void;
}) {
  return (
    <div className={`flex min-h-0 flex-col ${borderLeft ? 'border-l border-zinc-800' : ''} ${borderTop ? 'border-t border-zinc-800' : ''}`}>
      <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {title}
      </div>
      <div className="min-h-0 flex-1 p-3">
        <textarea
          value={content}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="h-full w-full resize-none rounded border border-zinc-800 bg-zinc-950/70 p-3 font-mono text-[11px] leading-5 text-zinc-100 outline-none transition-colors focus:border-sky-500/40"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
