import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, File as FileIcon, FolderTree, GitCommitHorizontal, Loader2, RefreshCw, X } from 'lucide-react';
import type { CodePaneGitDiffHunk, CodePaneGitRepositorySummary, CodePaneGitStatusEntry } from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';
import { getPathLeafLabel } from '../../../utils/pathDisplay';
import { GitHunkList } from './GitHunkList';
import {
  idePopupActionButtonClassName,
  idePopupCardClassName,
  idePopupFieldShellClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupMicroButtonClassName,
  idePopupOverlayClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  IdePopupShell,
} from '../../ui/ide-popup';

interface CommitWindowProps {
  open: boolean;
  summary: CodePaneGitRepositorySummary | null;
  entries: CodePaneGitStatusEntry[];
  initialSelectedPaths?: string[];
  selectedPath: string | null;
  selectedRelativePath: string | null;
  stagedHunks: CodePaneGitDiffHunk[];
  unstagedHunks: CodePaneGitDiffHunk[];
  hunksLoading: boolean;
  hunksError: string | null;
  initialMessage?: string;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void | Promise<void>;
  onSelectPath: (filePath: string) => void | Promise<void>;
  onStagePath: (filePath: string) => void | Promise<void>;
  onUnstagePath: (filePath: string) => void | Promise<void>;
  onDiscardPath: (filePath: string) => void | Promise<void>;
  onOpenFileDiff: (filePath: string) => void | Promise<void>;
  onOpenConflictResolver: (filePath: string) => void | Promise<void>;
  onResolveConflict: (filePath: string, resolution: 'ours' | 'theirs') => void | Promise<void>;
  onStageHunk: (hunk: CodePaneGitDiffHunk) => void | Promise<void>;
  onUnstageHunk: (hunk: CodePaneGitDiffHunk) => void | Promise<void>;
  onDiscardHunk: (hunk: CodePaneGitDiffHunk) => void | Promise<void>;
  onCommit: (config: { message: string; selectedPaths: string[] }) => void | Promise<void>;
}

function getStatusTone(entry: CodePaneGitStatusEntry) {
  switch (entry.status) {
    case 'added':
    case 'untracked':
      return 'text-emerald-300';
    case 'deleted':
      return 'text-red-300';
    case 'renamed':
      return 'text-sky-300';
    default:
      return 'text-amber-300';
  }
}

export function CommitWindow({
  open,
  summary,
  entries,
  initialSelectedPaths = [],
  selectedPath,
  selectedRelativePath,
  stagedHunks,
  unstagedHunks,
  hunksLoading,
  hunksError,
  initialMessage = '',
  isSubmitting = false,
  onOpenChange,
  onRefresh,
  onSelectPath,
  onStagePath,
  onUnstagePath,
  onDiscardPath,
  onOpenFileDiff,
  onOpenConflictResolver,
  onResolveConflict,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  onCommit,
}: CommitWindowProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState(initialMessage);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setMessage(initialMessage);
  }, [initialMessage, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedPaths((currentSelectedPaths) => {
      if (entries.length === 0) {
        return [];
      }

      const availablePaths = new Set(entries.map((entry) => entry.path));
      const preferredPaths = initialSelectedPaths.filter((path) => availablePaths.has(path));
      if (preferredPaths.length > 0) {
        return preferredPaths;
      }

      const retainedPaths = currentSelectedPaths.filter((path) => availablePaths.has(path));
      if (retainedPaths.length > 0) {
        return retainedPaths;
      }

      return entries.map((entry) => entry.path);
    });
  }, [entries, initialSelectedPaths, open]);

  const selectedCount = selectedPaths.length;
  const selectedPathSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const canCommit = message.trim().length > 0 && selectedCount > 0 && !isSubmitting;
  const currentBranchLabel = summary?.currentBranch ?? summary?.headSha ?? '';

  const toggleSelectedPath = (filePath: string) => {
    setSelectedPaths((currentSelectedPaths) => (
      currentSelectedPaths.includes(filePath)
        ? currentSelectedPaths.filter((path) => path !== filePath)
        : [...currentSelectedPaths, filePath]
    ));
  };

  const handleCommit = async () => {
    if (!canCommit) {
      return;
    }

    await onCommit({
      message: message.trim(),
      selectedPaths,
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={`${idePopupOverlayClassName} z-[1450] animate-fade-in`} />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-[1460] h-[min(86vh,780px)] w-[min(94vw,1180px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in focus:outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <IdePopupShell className="flex h-full min-h-0 flex-col">
            <div className={idePopupHeaderClassName}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <GitCommitHorizontal size={12} className="shrink-0 text-emerald-300" />
                  <div className={idePopupHeaderMetaClassName}>{t('codePane.gitWorkbenchTab')}</div>
                </div>
                <Dialog.Title className={`mt-1 ${idePopupTitleClassName}`}>
                  {t('codePane.gitCommitDots')}
                </Dialog.Title>
                <Dialog.Description className={idePopupSubtitleClassName}>
                  {currentBranchLabel
                    ? `${currentBranchLabel} · ${t('codePane.sourceControlHint')}`
                    : t('codePane.sourceControlHint')}
                </Dialog.Description>
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
                  <RefreshCw size={14} />
                </button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className={idePopupIconButtonClassName}
                    aria-label={t('common.close')}
                  >
                    <X size={14} />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
              <div className="flex min-h-0 flex-col border-r border-zinc-800/90 bg-[linear-gradient(180deg,rgba(21,23,28,0.92)_0%,rgba(18,20,24,0.98)_100%)]">
                <div className="border-b border-zinc-800 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    {t('codePane.gitCommitPlaceholder')}
                  </div>
                  <div className={`${idePopupFieldShellClassName} mt-2 items-start gap-0 px-0 py-0`}>
                    <textarea
                      value={message}
                      onChange={(event) => {
                        setMessage(event.target.value);
                      }}
                      placeholder={t('codePane.gitCommitPlaceholder')}
                      className="h-24 w-full resize-none bg-transparent px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="rounded-md border border-zinc-700/70 bg-zinc-950/35 px-2 py-1 text-[11px] text-zinc-400">
                      {t('codePane.gitChanges')} · {selectedCount}/{entries.length}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCommit();
                      }}
                      disabled={!canCommit}
                      className={idePopupActionButtonClassName('success')}
                    >
                      {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <GitCommitHorizontal size={14} />}
                      <span>{t('codePane.gitCommit')}</span>
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                  {entries.length > 0 ? (
                    <div className="space-y-1">
                      {entries.map((entry) => {
                        const isChecked = selectedPathSet.has(entry.path);
                        const isActive = selectedPath === entry.path;
                        return (
                          <div
                            key={entry.path}
                            className={`rounded-[12px] border transition-colors ${
                              isActive
                                ? 'border-sky-500/35 bg-sky-500/[0.08] shadow-[inset_0_0_0_1px_rgba(125,211,252,0.12)]'
                                : 'border-transparent bg-transparent hover:border-zinc-700/60 hover:bg-zinc-900/55'
                            }`}
                          >
                            <div className="flex items-start gap-2 px-2.5 py-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  toggleSelectedPath(entry.path);
                                }}
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  isChecked
                                    ? 'border-sky-400/70 bg-sky-500/[0.10] text-sky-200'
                                    : 'border-zinc-600 bg-zinc-950/80 text-transparent'
                                }`}
                                aria-label={`${isChecked ? 'unselect' : 'select'} ${entry.path}`}
                              >
                                <Check size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void onSelectPath(entry.path);
                                }}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <FileIcon size={13} className="shrink-0 text-zinc-500" />
                                  <span className={`truncate text-sm ${isActive ? 'text-zinc-50' : getStatusTone(entry)}`}>
                                    {getPathLeafLabel(entry.path)}
                                  </span>
                                </div>
                                <div className="mt-1 truncate pl-5 text-[11px] text-zinc-500">
                                  {entry.path}
                                </div>
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1 px-2.5 pb-2.5 pl-8">
                              {entry.staged ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void onUnstagePath(entry.path);
                                  }}
                                  className={idePopupMicroButtonClassName('neutral')}
                                >
                                  {t('codePane.gitUnstage')}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void onStagePath(entry.path);
                                  }}
                                  className={idePopupMicroButtonClassName('success')}
                                >
                                  {t('codePane.gitStage')}
                                </button>
                              )}
                              {entry.conflicted ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void onOpenConflictResolver(entry.path);
                                    }}
                                    className={idePopupMicroButtonClassName('success')}
                                  >
                                    {t('codePane.gitResolveConflict')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void onResolveConflict(entry.path, 'ours');
                                    }}
                                    className={idePopupMicroButtonClassName('warning')}
                                  >
                                    {t('codePane.gitUseOurs')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void onResolveConflict(entry.path, 'theirs');
                                    }}
                                    className={idePopupMicroButtonClassName('primary')}
                                  >
                                    {t('codePane.gitUseTheirs')}
                                  </button>
                                </>
                              ) : null}
                              {(entry.unstaged || entry.status === 'untracked' || entry.status === 'deleted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void onDiscardPath(entry.path);
                                  }}
                                  className={idePopupMicroButtonClassName('danger')}
                                >
                                  {t('codePane.gitDiscard')}
                                </button>
                              )}
                              {entry.status !== 'deleted' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void onOpenFileDiff(entry.path);
                                  }}
                                  className={idePopupMicroButtonClassName('neutral')}
                                >
                                  {t('codePane.openDiff')}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-2 py-3 text-xs text-zinc-500">{t('codePane.noChanges')}</div>
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-auto bg-[linear-gradient(180deg,rgba(24,26,31,0.94)_0%,rgba(19,21,26,0.98)_100%)] px-4 py-4">
                <div className={`${idePopupCardClassName} mb-3 flex items-center gap-2 px-3 py-2`}>
                  <FolderTree size={12} className="text-zinc-500" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    {t('codePane.gitSelectedFileHunks')}
                  </span>
                </div>
                <GitHunkList
                  selectedPath={selectedPath}
                  relativePath={selectedRelativePath}
                  stagedHunks={stagedHunks}
                  unstagedHunks={unstagedHunks}
                  loading={hunksLoading}
                  error={hunksError}
                  onStageHunk={onStageHunk}
                  onUnstageHunk={onUnstageHunk}
                  onDiscardHunk={onDiscardHunk}
                  t={t}
                />
              </div>
            </div>
          </IdePopupShell>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
