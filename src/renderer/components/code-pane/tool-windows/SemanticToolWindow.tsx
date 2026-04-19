import React from 'react';
import {
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CodePaneSemanticTokensLegend } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';
import {
  IdePopupShell,
  idePopupBadgeClassName,
  idePopupBodyClassName,
  idePopupCardClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupScrollAreaClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  idePopupToggleButtonClassName,
} from '../../ui/ide-popup';

export interface SemanticTokenSummaryEntry {
  tokenType: string;
  count: number;
}

interface SemanticToolWindowProps {
  fileLabel: string | null;
  legend: CodePaneSemanticTokensLegend | null;
  summary: SemanticTokenSummaryEntry[];
  totalTokens: number;
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onToggleEnabled: () => void;
}

export function SemanticToolWindow({
  fileLabel,
  legend,
  summary,
  totalTokens,
  isEnabled,
  isLoading,
  error,
  onClose,
  onRefresh,
  onToggleEnabled,
}: SemanticToolWindowProps) {
  const { t } = useI18n();

  return (
    <IdePopupShell className="flex h-full min-h-0 flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className={idePopupHeaderMetaClassName}>
            {t('codePane.semanticTab')}
          </div>
          <div className={`mt-1 ${idePopupTitleClassName}`}>
            {fileLabel ?? t('codePane.semanticTokensEmpty')}
          </div>
          <div className={idePopupSubtitleClassName}>
            {legend ? t('codePane.semanticTokensLegend') : t('codePane.semanticTokensEmpty')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleEnabled}
            aria-pressed={isEnabled}
            className={idePopupToggleButtonClassName(isEnabled)}
          >
            {isEnabled ? t('codePane.semanticTokensEnabled') : t('codePane.semanticTokensDisabled')}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className={idePopupIconButtonClassName}
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] overflow-hidden">
        <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 overflow-auto px-3 py-3`}>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
              <Loader2 size={12} className="animate-spin" />
              {t('codePane.semanticTokensLoading')}
            </div>
          ) : error ? (
            <div className={`${idePopupCardClassName} border-[rgb(var(--error))/0.30] text-xs text-[rgb(var(--error))]`}>
              {error}
            </div>
          ) : summary.length > 0 ? (
            <div className="space-y-2">
              <div className={`${idePopupCardClassName} px-3 py-2 text-xs text-[rgb(var(--foreground))]`}>
                {t('codePane.semanticTokensTotal')}: {totalTokens}
              </div>
              {summary.map((entry) => (
                <div
                  key={entry.tokenType}
                  className={`${idePopupCardClassName} flex items-center justify-between px-3 py-2 text-xs text-[rgb(var(--foreground))]`}
                >
                  <span className="font-medium text-[rgb(var(--foreground))]">{entry.tokenType}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${idePopupBadgeClassName('zinc')}`}>
                    {entry.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_40%,transparent)] px-3 py-4 text-xs text-[rgb(var(--muted-foreground))]">
              {t('codePane.semanticTokensEmpty')}
            </div>
          )}
        </div>

        <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 overflow-auto border-l border-[rgb(var(--border))] px-3 py-3`}>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.semanticTokensLegend')}
          </div>
          <div className="space-y-2">
            <div className={idePopupCardClassName}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
                Types
              </div>
              <div className="flex flex-wrap gap-2">
                {(legend?.tokenTypes ?? []).map((tokenType) => (
                  <span
                    key={tokenType}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${idePopupBadgeClassName('zinc')}`}
                  >
                    {tokenType}
                  </span>
                ))}
              </div>
            </div>
            <div className={idePopupCardClassName}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
                Modifiers
              </div>
              <div className="flex flex-wrap gap-2">
                {(legend?.tokenModifiers ?? []).map((tokenModifier) => (
                  <span
                    key={tokenModifier}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${idePopupBadgeClassName('zinc')}`}
                  >
                    {tokenModifier}
                  </span>
                ))}
                {!legend?.tokenModifiers?.length && (
                  <span className="text-[11px] text-[rgb(var(--muted-foreground))]">{t('codePane.semanticTokensEmpty')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </IdePopupShell>
  );
}
