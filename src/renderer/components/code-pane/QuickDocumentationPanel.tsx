import React from 'react';
import { BookOpen, Loader2, RefreshCw, X } from 'lucide-react';
import type { CodePaneHoverResult } from '../../../shared/types/electron-api';

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
    <div className="absolute right-3 top-3 z-20 flex w-[380px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-100">
          <BookOpen size={13} className="shrink-0 text-sky-300" />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={title}
          >
            <RefreshCw size={11} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={title}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <div className="max-h-[50vh] overflow-auto px-3 py-3 text-xs text-zinc-300">
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
                className={`rounded border px-3 py-2 ${
                  content.kind === 'markdown'
                    ? 'border-sky-500/10 bg-sky-500/5'
                    : 'border-zinc-800 bg-zinc-900/70'
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
    </div>
  );
}
