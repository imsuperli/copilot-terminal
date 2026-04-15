import React from 'react';
import { AlertTriangle, Check, Eye, Loader2, X } from 'lucide-react';
import type {
  CodePanePreviewChangeSet,
  CodePanePreviewFileChange,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface RefactorPreviewToolWindowProps {
  changeSet: CodePanePreviewChangeSet | null;
  selectedChangeId: string | null;
  isApplying: boolean;
  error: string | null;
  onSelectChange: (changeId: string) => void;
  onApply: () => void | Promise<void>;
  onClose: () => void;
}

export function RefactorPreviewToolWindow({
  changeSet,
  selectedChangeId,
  isApplying,
  error,
  onSelectChange,
  onApply,
  onClose,
}: RefactorPreviewToolWindowProps) {
  const { t } = useI18n();
  const selectedChange = changeSet?.files.find((candidate) => candidate.id === selectedChangeId)
    ?? changeSet?.files[0]
    ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.refactorPreviewTab')}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-200">{changeSet?.title ?? t('codePane.refactorPreviewEmpty')}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onApply();
            }}
            disabled={!changeSet || isApplying}
            className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {t('codePane.refactorApply')}
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

      {changeSet?.stats && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] text-zinc-400">
          <span className="rounded bg-zinc-900/80 px-2 py-1">
            {t('codePane.refactorPreviewStatsFiles', { count: changeSet.stats.fileCount })}
          </span>
          <span className="rounded bg-zinc-900/80 px-2 py-1">
            {t('codePane.refactorPreviewStatsEdits', { count: changeSet.stats.editCount })}
          </span>
          {changeSet.stats.renameCount > 0 && (
            <span className="rounded bg-zinc-900/80 px-2 py-1">
              {t('codePane.refactorPreviewStatsRenames', { count: changeSet.stats.renameCount })}
            </span>
          )}
          {changeSet.stats.moveCount > 0 && (
            <span className="rounded bg-zinc-900/80 px-2 py-1">
              {t('codePane.refactorPreviewStatsMoves', { count: changeSet.stats.moveCount })}
            </span>
          )}
          {changeSet.stats.deleteCount > 0 && (
            <span className="rounded bg-zinc-900/80 px-2 py-1">
              {t('codePane.refactorPreviewStatsDeletes', { count: changeSet.stats.deleteCount })}
            </span>
          )}
        </div>
      )}

      {changeSet?.warnings && changeSet.warnings.length > 0 && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={12} />
            {t('codePane.refactorPreviewWarnings')}
          </div>
          <div className="mt-2 space-y-1">
            {changeSet.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
        <div className="min-h-0 border-r border-zinc-800 px-2 py-2">
          {changeSet?.files.length ? (
            <div className="space-y-1 overflow-auto">
              {changeSet.files.map((change) => {
                const isSelected = selectedChange?.id === change.id;
                return (
                  <button
                    key={change.id}
                    type="button"
                    onClick={() => {
                      onSelectChange(change.id);
                    }}
                    className={`w-full rounded border px-2 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-100'
                        : 'border-transparent bg-transparent text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/70'
                    }`}
                  >
                    <div className="truncate text-xs font-medium">{getLeafLabel(change.filePath)}</div>
                    <div className="mt-1 truncate text-[10px] text-zinc-500">{change.filePath}</div>
                    {change.targetFilePath && (
                      <div className="mt-1 truncate text-[10px] text-zinc-500">{change.targetFilePath}</div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              {t('codePane.refactorPreviewEmpty')}
            </div>
          )}
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
          <PreviewPane
            title={t('codePane.refactorPreviewBefore')}
            tone="text-zinc-500"
            change={selectedChange}
            content={selectedChange?.beforeContent ?? ''}
          />
          <PreviewPane
            title={t('codePane.refactorPreviewAfter')}
            tone="text-emerald-300"
            change={selectedChange}
            content={selectedChange?.afterContent ?? ''}
            borderLeft
          />
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  title,
  tone,
  change,
  content,
  borderLeft,
}: {
  title: string;
  tone: string;
  change: CodePanePreviewFileChange | null;
  content: string;
  borderLeft?: boolean;
}) {
  return (
    <div className={`flex min-h-0 flex-col ${borderLeft ? 'border-l border-zinc-800' : ''}`}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">{title}</div>
        {change && (
          <div className={`flex items-center gap-1 text-[10px] ${tone}`}>
            <Eye size={12} />
            <span>{change.kind.toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-zinc-200">
          {content || '[empty]'}
        </pre>
      </div>
    </div>
  );
}

function getLeafLabel(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || normalizedPath;
}
