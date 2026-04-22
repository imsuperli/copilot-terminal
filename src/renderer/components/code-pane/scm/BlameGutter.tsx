import React from 'react';
import { GitCommitHorizontal, Loader2 } from 'lucide-react';
import type { CodePaneGitBlameLine } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';
import {
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupSubtitleClassName,
  idePopupToggleButtonClassName,
} from '../../ui/ide-popup';

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
    <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[linear-gradient(180deg,var(--appearance-pane-chrome-background)_0%,var(--appearance-card-surface-top)_100%)] px-3 py-2 backdrop-blur-[8px]">
      <div className="min-w-0">
        <div className={idePopupHeaderMetaClassName}>
          {t('codePane.gitBlame')}
        </div>
        <div className={`mt-1 ${idePopupSubtitleClassName}`}>
          {enabled
            ? (entry ? `${entry.author} · ${entry.summary || entry.shortSha}` : t('codePane.gitBlameEmpty'))
            : t('codePane.gitBlameDisabled')}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className={idePopupToggleButtonClassName(enabled)}
        >
          {enabled ? t('codePane.gitBlameHide') : t('codePane.gitBlameShow')}
        </button>
        <button
          type="button"
          disabled={!enabled || !entry}
          onClick={() => {
            void onOpenHistory();
          }}
          className={`${idePopupIconButtonClassName} h-auto w-auto gap-1 px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <GitCommitHorizontal size={12} />}
          {t('codePane.gitLineHistory')}
        </button>
      </div>
    </div>
  );
}
