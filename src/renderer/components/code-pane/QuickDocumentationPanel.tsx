import React from 'react';
import { BookOpen, Loader2, RefreshCw, X } from 'lucide-react';
import type { CodePaneHoverResult } from '../../../shared/types/electron-api';
import { useI18n } from '../../i18n';
import {
  idePopupAccentCardClassName,
  IdePopupShell,
  idePopupBodyClassName,
  idePopupCardClassName,
  idePopupHeaderClassName,
  idePopupIconButtonClassName,
  idePopupScrollAreaClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
} from '../ui/ide-popup';

interface QuickDocumentationPanelProps {
  title: string;
  loadingLabel: string;
  emptyLabel: string;
  error: string | null;
  loading: boolean;
  result: CodePaneHoverResult | null;
  onRefresh: () => void;
  onClose: () => void;
}

export function QuickDocumentationPanel({
  title,
  loadingLabel,
  emptyLabel,
  error,
  loading,
  result,
  onRefresh,
  onClose,
}: QuickDocumentationPanelProps) {
  const { t } = useI18n();
  const contentCount = result?.contents.length ?? 0;
  const subtitle = React.useMemo(() => (
    contentCount > 0
      ? contentCount === 1
        ? t('codePane.quickDocumentationCountOne')
        : t('codePane.quickDocumentationCountMany', { count: contentCount })
      : emptyLabel
  ), [contentCount, emptyLabel, t]);
  const contents = result?.contents ?? [];

  return (
    <IdePopupShell className="absolute right-3 top-3 z-20 flex w-[400px] max-w-[calc(100%-24px)] flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BookOpen size={12} className="shrink-0 text-[rgb(var(--primary))]" />
            <div className="min-w-0">
              <div className={idePopupTitleClassName}>{title}</div>
              <div className={idePopupSubtitleClassName}>{subtitle}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className={idePopupIconButtonClassName}
            aria-label={title}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={idePopupIconButtonClassName}
            aria-label={title}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} max-h-[52vh] px-3 py-3 text-xs text-[rgb(var(--foreground))]`}>
        {loading ? (
          <div className="flex items-center gap-2 px-1 text-[rgb(var(--muted-foreground))]">
            <Loader2 size={12} className="animate-spin" />
            {loadingLabel}
          </div>
        ) : error ? (
          <div className={`${idePopupCardClassName} border-[rgb(var(--error)/0.30)] text-[rgb(var(--error))]`}>{error}</div>
        ) : contents.length ? (
          <div className="space-y-3">
            {contents.map((content, index) => (
              <QuickDocumentationContentCard
                key={`${content.kind}-${index}`}
                kind={content.kind}
                value={content.value}
              />
            ))}
          </div>
        ) : (
          <div className={`${idePopupCardClassName} text-[rgb(var(--muted-foreground))]`}>{emptyLabel}</div>
        )}
      </div>
    </IdePopupShell>
  );
}

const QuickDocumentationContentCard = React.memo(function QuickDocumentationContentCard({
  kind,
  value,
}: {
  kind: CodePaneHoverResult['contents'][number]['kind'];
  value: string;
}) {
  return (
    <div
      className={`${
        kind === 'markdown'
          ? idePopupAccentCardClassName
          : idePopupCardClassName
      }`}
    >
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
        {kind}
      </div>
      <div className="whitespace-pre-wrap break-words leading-5 text-[rgb(var(--foreground))]">
        {value}
      </div>
    </div>
  );
});
