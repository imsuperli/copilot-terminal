import React from 'react';
import { BookOpen, Loader2, RefreshCw, X } from 'lucide-react';
import type { CodePaneHoverResult } from '../../../shared/types/electron-api';
import {
  IdePopupShell,
  idePopupBodyClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
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
  return (
    <IdePopupShell className="absolute right-3 top-3 z-20 flex w-[400px] max-w-[calc(100%-24px)] flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BookOpen size={12} className="shrink-0 text-sky-300" />
            <div className={idePopupHeaderMetaClassName}>{title}</div>
          </div>
          <div className="mt-1">
            <div className={idePopupTitleClassName}>{title}</div>
            <div className={idePopupSubtitleClassName}>{result?.contents.length ? `${result.contents.length} item${result.contents.length > 1 ? 's' : ''}` : emptyLabel}</div>
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

      <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} max-h-[52vh] px-3 py-3 text-xs text-zinc-300`}>
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {loadingLabel}
          </div>
        ) : error ? (
          <div className="text-red-300">{error}</div>
        ) : result?.contents.length ? (
          <div className="space-y-3">
            {result.contents.map((content, index) => (
              <div
                key={`${content.kind}-${index}`}
                className={`rounded-md border px-3 py-2 ${
                  content.kind === 'markdown'
                    ? 'border-sky-400/25 bg-sky-500/10'
                    : 'border-zinc-700/80 bg-zinc-900/55'
                }`}
              >
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  {content.kind}
                </div>
                <div className="whitespace-pre-wrap break-words leading-5 text-zinc-200">
                  {content.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-zinc-500">{emptyLabel}</div>
        )}
      </div>
    </IdePopupShell>
  );
}
