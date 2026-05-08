import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, X } from 'lucide-react';
import type { CodePaneGitConflictDetails } from '../../../../shared/types/electron-api';
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
    <IdePopupShell className="flex h-full min-h-0 flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0">
          <div className={idePopupHeaderMetaClassName}>
            {t('codePane.gitConflictResolverTab')}
          </div>
          <div className={`mt-1 ${idePopupTitleClassName}`}>
            {conflict?.relativePath ?? t('codePane.loading')}
          </div>
          <div className={idePopupSubtitleClassName}>
            {conflict ? t('codePane.gitConflictMerged') : t('codePane.gitConflictsNone')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onRefresh();
            }}
            className={idePopupIconButtonClassName}
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
            className="flex items-center gap-1 rounded-md border border-[rgb(var(--success))/0.35] bg-[rgb(var(--success))/0.12] px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--success))] transition-colors hover:border-[rgb(var(--success))/0.5] hover:bg-[rgb(var(--success))/0.18] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {t('codePane.gitApplyConflictResolution')}
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

      {error && (
        <div className="border-b border-[rgb(var(--error)/0.20)] bg-[rgb(var(--error)/0.10)] px-3 py-2 text-xs text-[rgb(var(--error))]">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
          <Loader2 size={12} className="animate-spin" />
          {t('codePane.loading')}
        </div>
      ) : conflict ? (
        <>
          <div className="flex items-center gap-2 border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] text-[rgb(var(--muted-foreground))]">
            <button
              type="button"
              onClick={() => {
                replaceMergedContent(conflict.baseContent);
              }}
              className="flex items-center gap-1 rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-2 py-1 text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]"
            >
              <Copy size={11} />
              {t('codePane.gitUseBase')}
            </button>
            <button
              type="button"
              onClick={() => {
                replaceMergedContent(conflict.oursContent);
              }}
              className="flex items-center gap-1 rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-2 py-1 text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]"
            >
              <Copy size={11} />
              {t('codePane.gitUseOurs')}
            </button>
            <button
              type="button"
              onClick={() => {
                replaceMergedContent(conflict.theirsContent);
              }}
              className="flex items-center gap-1 rounded-md border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-2 py-1 text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]"
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
        <div className="flex flex-1 items-center justify-center text-xs text-[rgb(var(--muted-foreground))]">
          {t('codePane.gitConflictsNone')}
        </div>
      )}
    </IdePopupShell>
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
  const { t } = useI18n();

  return (
    <div className={`flex min-h-0 flex-col ${borderLeft ? 'border-l border-[rgb(var(--border))]' : ''} ${borderTop ? 'border-t border-[rgb(var(--border))]' : ''}`}>
      <div className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
        {title}
      </div>
      <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-3 py-3`}>
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[rgb(var(--foreground))]">
          {content || t('codePane.emptyContent')}
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
    <div className={`flex min-h-0 flex-col ${borderLeft ? 'border-l border-[rgb(var(--border))]' : ''} ${borderTop ? 'border-t border-[rgb(var(--border))]' : ''}`}>
      <div className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
        {title}
      </div>
      <div className="min-h-0 flex-1 p-3">
        <textarea
          value={content}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="h-full w-full resize-none rounded border border-[rgb(var(--border))] bg-[var(--appearance-pane-background)] p-3 font-mono text-[11px] leading-5 text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
