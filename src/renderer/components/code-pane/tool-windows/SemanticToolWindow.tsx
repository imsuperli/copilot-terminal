import React from 'react';
import {
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CodePaneSemanticTokensLegend } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

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
    <div className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.semanticTab')}
          </div>
          <div className="truncate text-xs text-zinc-500">
            {fileLabel ?? t('codePane.semanticTokensEmpty')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleEnabled}
            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
              isEnabled
                ? 'bg-emerald-500/20 text-emerald-100'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-50'
            }`}
          >
            {isEnabled ? t('codePane.semanticTokensEnabled') : t('codePane.semanticTokensDisabled')}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-zinc-800 p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] overflow-hidden">
        <div className="min-h-0 overflow-auto px-3 py-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 size={12} className="animate-spin" />
              {t('codePane.semanticTokensLoading')}
            </div>
          ) : error ? (
            <div className="text-xs text-red-300">{error}</div>
          ) : summary.length > 0 ? (
            <div className="space-y-2">
              <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-300">
                {t('codePane.semanticTokensTotal')}: {totalTokens}
              </div>
              {summary.map((entry) => (
                <div
                  key={entry.tokenType}
                  className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300"
                >
                  <span className="font-medium text-zinc-100">{entry.tokenType}</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                    {entry.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-zinc-800 bg-zinc-950/60 px-3 py-4 text-xs text-zinc-500">
              {t('codePane.semanticTokensEmpty')}
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-auto border-l border-zinc-800 px-3 py-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {t('codePane.semanticTokensLegend')}
          </div>
          <div className="space-y-2">
            <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                Types
              </div>
              <div className="flex flex-wrap gap-2">
                {(legend?.tokenTypes ?? []).map((tokenType) => (
                  <span
                    key={tokenType}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                  >
                    {tokenType}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                Modifiers
              </div>
              <div className="flex flex-wrap gap-2">
                {(legend?.tokenModifiers ?? []).map((tokenModifier) => (
                  <span
                    key={tokenModifier}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                  >
                    {tokenModifier}
                  </span>
                ))}
                {!legend?.tokenModifiers?.length && (
                  <span className="text-[11px] text-zinc-500">{t('codePane.semanticTokensEmpty')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
