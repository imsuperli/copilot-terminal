import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Check,
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderTree,
  GitCommitHorizontal,
  Loader2,
  Minus,
  RefreshCw,
  X,
} from 'lucide-react';
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

type CommitWindowEntry = CodePaneGitStatusEntry & {
  relativePath: string;
};

type CommitWindowEntryGroup = {
  key: string;
  label: string;
  entries: CommitWindowEntry[];
  isRoot: boolean;
};

type CommitWindowVisibleEntryGroup = CommitWindowEntryGroup & {
  includedCount: number;
};

type CommitWindowVisibleItem =
  | {
      key: string;
      kind: 'group';
      group: CommitWindowVisibleEntryGroup;
    }
  | {
      key: string;
      kind: 'entry';
      entry: CommitWindowEntry;
    };

type WindowedListSlice<T> = {
  items: T[];
  offsetTop: number;
  totalHeight: number;
  isWindowed: boolean;
};

interface CommitWindowProps {
  open: boolean;
  summary: CodePaneGitRepositorySummary | null;
  entries: CommitWindowEntry[];
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

const COMMIT_WINDOW_FILE_ROW_HEIGHT = 116;
const COMMIT_WINDOW_FILE_ROW_OVERSCAN = 8;
const COMMIT_WINDOW_FILE_WINDOWING_THRESHOLD = 80;

function getWindowedListSlice<T>({
  items,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan,
  threshold,
}: {
  items: T[];
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
  threshold: number;
}): WindowedListSlice<T> {
  const totalHeight = items.length * rowHeight;

  if (items.length <= threshold || viewportHeight <= 0) {
    return {
      items,
      offsetTop: 0,
      totalHeight,
      isWindowed: false,
    };
  }

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );

  return {
    items: items.slice(startIndex, endIndex),
    offsetTop: startIndex * rowHeight,
    totalHeight,
    isWindowed: true,
  };
}

function useFixedWindowedList<T>(
  items: T[],
  rowHeight: number,
  threshold = COMMIT_WINDOW_FILE_WINDOWING_THRESHOLD,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const pendingScrollTopRef = useRef<number | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);

  const scheduleScrollTopUpdate = useCallback((nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollAnimationFrameRef.current !== null) {
      return;
    }

    scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
      scrollAnimationFrameRef.current = null;
      const pendingScrollTop = pendingScrollTopRef.current;
      pendingScrollTopRef.current = null;
      if (pendingScrollTop !== null) {
        setScrollTop((currentScrollTop) => (
          currentScrollTop === pendingScrollTop ? currentScrollTop : pendingScrollTop
        ));
      }
    });
  }, []);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const syncViewportHeight = () => {
      const nextHeight = scrollElement.clientHeight;
      setViewportHeight((currentHeight) => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ));
    };

    syncViewportHeight();

    const resizeObserver = new ResizeObserver(() => {
      syncViewportHeight();
    });
    resizeObserver.observe(scrollElement);

    return () => {
      if (scrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, []);

  const slice = useMemo(() => getWindowedListSlice({
    items,
    scrollTop,
    viewportHeight,
    rowHeight,
    overscan: COMMIT_WINDOW_FILE_ROW_OVERSCAN,
    threshold,
  }), [items, rowHeight, scrollTop, threshold, viewportHeight]);

  return {
    scrollRef,
    slice,
    handleScroll: (event: React.UIEvent<HTMLDivElement>) => {
      scheduleScrollTopUpdate(event.currentTarget.scrollTop);
    },
  };
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

function getCommitWindowGroupKey(relativePath: string): string {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const separatorIndex = normalizedPath.lastIndexOf('/');
  return separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex) : '.';
}

function buildCommitWindowEntryGroups(
  entries: CommitWindowEntry[],
  rootLabel: string,
): CommitWindowEntryGroup[] {
  const groups = new Map<string, CommitWindowEntryGroup>();

  for (const entry of entries) {
    const groupKey = getCommitWindowGroupKey(entry.relativePath);
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        label: groupKey === '.' ? rootLabel : groupKey,
        entries: [],
        isRoot: groupKey === '.',
      };
      groups.set(groupKey, group);
    }
    group.entries.push(entry);
  }

  const groupedEntries = Array.from(groups.values());
  for (const group of groupedEntries) {
    group.entries.sort((left, right) => (
        left.relativePath.localeCompare(right.relativePath, undefined, { sensitivity: 'base' })
      ));
  }

  groupedEntries.sort((left, right) => {
    if (left.isRoot !== right.isRoot) {
      return left.isRoot ? -1 : 1;
    }

    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
  });
  return groupedEntries;
}

const CommitWindowEntryCard = React.memo(function CommitWindowEntryCard({
  entry,
  isChecked,
  isActive,
  onToggleSelectedPath,
  onSelectPath,
  onStagePath,
  onUnstagePath,
  onDiscardPath,
  onOpenFileDiff,
  onOpenConflictResolver,
  onResolveConflict,
  t,
}: {
  entry: CommitWindowEntry;
  isChecked: boolean;
  isActive: boolean;
  onToggleSelectedPath: (filePath: string) => void;
  onSelectPath: (filePath: string) => void | Promise<void>;
  onStagePath: (filePath: string) => void | Promise<void>;
  onUnstagePath: (filePath: string) => void | Promise<void>;
  onDiscardPath: (filePath: string) => void | Promise<void>;
  onOpenFileDiff: (filePath: string) => void | Promise<void>;
  onOpenConflictResolver: (filePath: string) => void | Promise<void>;
  onResolveConflict: (filePath: string, resolution: 'ours' | 'theirs') => void | Promise<void>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div
      className={`rounded-[12px] border transition-colors ${
        isActive
          ? 'border-sky-500/35 bg-sky-500/[0.08] shadow-[inset_0_0_0_1px_rgba(125,211,252,0.12)]'
          : isChecked
            ? 'border-emerald-500/25 bg-emerald-500/[0.05] hover:border-emerald-400/35 hover:bg-emerald-500/[0.08]'
            : 'border-transparent bg-transparent hover:border-zinc-700/60 hover:bg-zinc-900/55'
      }`}
    >
      <div className="flex items-start gap-2 px-2.5 py-2.5">
        <button
          type="button"
          onClick={() => {
            onToggleSelectedPath(entry.path);
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
            {isChecked && (
              <span className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-emerald-200">
                {t('codePane.gitIncludedInCommit')}
              </span>
            )}
          </div>
          <div className="mt-1 truncate pl-5 text-[11px] text-zinc-500">
            {entry.relativePath}
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
});

export const CommitWindow = React.memo(function CommitWindow({
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
  const [showIncludedOnly, setShowIncludedOnly] = useState(false);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);

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

    setShowIncludedOnly(false);
    setCollapsedGroupKeys([]);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedPaths((currentSelectedPaths) => {
      if (entries.length === 0) {
        return [];
      }

      const availablePaths = new Set<string>();
      for (const entry of entries) {
        availablePaths.add(entry.path);
      }
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
  const rootDirectoryLabel = t('codePane.gitRepositoryRoot');
  const groupedEntries = useMemo(
    () => buildCommitWindowEntryGroups(entries, rootDirectoryLabel),
    [entries, rootDirectoryLabel],
  );
  const visibleEntries = useMemo(() => {
    if (!showIncludedOnly) {
      return entries;
    }

    return entries.filter((entry) => selectedPathSet.has(entry.path));
  }, [entries, selectedPathSet, showIncludedOnly]);
  const visibleEntryGroupsBase = useMemo(
    () => (
      showIncludedOnly
        ? buildCommitWindowEntryGroups(visibleEntries, rootDirectoryLabel)
        : groupedEntries
    ),
    [groupedEntries, rootDirectoryLabel, showIncludedOnly, visibleEntries],
  );
  const visibleEntryGroups = useMemo<CommitWindowVisibleEntryGroup[]>(
    () => visibleEntryGroupsBase.map((group) => {
      let includedCount = 0;
      for (const entry of group.entries) {
        if (selectedPathSet.has(entry.path)) {
          includedCount += 1;
        }
      }

      return {
        ...group,
        includedCount,
      };
    }),
    [selectedPathSet, visibleEntryGroupsBase],
  );
  const shouldRenderGroups = visibleEntryGroups.length > 1 || visibleEntryGroups.some((group) => !group.isRoot);
  const visibleItems = useMemo<CommitWindowVisibleItem[]>(() => {
    const nextItems: CommitWindowVisibleItem[] = [];
    if (shouldRenderGroups) {
      for (const group of visibleEntryGroups) {
        const isCollapsed = collapsedGroupKeys.includes(group.key);
        nextItems.push({
          key: `group:${group.key}`,
          kind: 'group',
          group,
        });
        if (!isCollapsed) {
          for (const entry of group.entries) {
            nextItems.push({
              key: `entry:${entry.path}`,
              kind: 'entry',
              entry,
            });
          }
        }
      }
      return nextItems;
    }

    for (const entry of visibleEntries) {
      nextItems.push({
        key: `entry:${entry.path}`,
        kind: 'entry',
        entry,
      });
    }
    return nextItems;
  }, [collapsedGroupKeys, shouldRenderGroups, visibleEntries, visibleEntryGroups]);
  const {
    scrollRef: visibleItemsScrollRef,
    slice: visibleItemSlice,
    handleScroll: handleVisibleItemsScroll,
  } = useFixedWindowedList(visibleItems, COMMIT_WINDOW_FILE_ROW_HEIGHT);

  useEffect(() => {
    if (!open) {
      return;
    }

    const visibleGroupKeys = new Set<string>();
    for (const group of visibleEntryGroups) {
      visibleGroupKeys.add(group.key);
    }
    setCollapsedGroupKeys((currentKeys) => currentKeys.filter((groupKey) => visibleGroupKeys.has(groupKey)));
  }, [open, visibleEntryGroups]);

  const toggleSelectedPath = useCallback((filePath: string) => {
    setSelectedPaths((currentSelectedPaths) => (
      currentSelectedPaths.includes(filePath)
        ? currentSelectedPaths.filter((path) => path !== filePath)
        : [...currentSelectedPaths, filePath]
    ));
  }, []);

  const toggleCollapsedGroup = useCallback((groupKey: string) => {
    setCollapsedGroupKeys((currentKeys) => (
      currentKeys.includes(groupKey)
        ? currentKeys.filter((candidateKey) => candidateKey !== groupKey)
        : [...currentKeys, groupKey]
    ));
  }, []);

  const toggleSelectedGroup = useCallback((groupEntries: CommitWindowEntry[]) => {
    setSelectedPaths((currentSelectedPaths) => {
      const currentSelectedPathSet = new Set(currentSelectedPaths);
      let shouldSelectGroup = false;
      for (const entry of groupEntries) {
        if (!currentSelectedPathSet.has(entry.path)) {
          shouldSelectGroup = true;
          break;
        }
      }

      if (shouldSelectGroup) {
        const nextSelectedPathSet = new Set(currentSelectedPaths);
        for (const entry of groupEntries) {
          nextSelectedPathSet.add(entry.path);
        }

        return [...nextSelectedPathSet];
      }

      const groupPathSet = new Set<string>();
      for (const entry of groupEntries) {
        groupPathSet.add(entry.path);
      }
      return currentSelectedPaths.filter((path) => !groupPathSet.has(path));
    });
  }, []);

  const handleCommit = async () => {
    if (!canCommit) {
      return;
    }

    await onCommit({
      message: message.trim(),
      selectedPaths,
    });
  };

  const renderVisibleItem = useCallback((item: CommitWindowVisibleItem) => {
    if (item.kind === 'group') {
      const group = item.group;
      const isCollapsed = collapsedGroupKeys.includes(group.key);
      const allGroupEntriesSelected = group.includedCount === group.entries.length;
      const someGroupEntriesSelected = group.includedCount > 0 && !allGroupEntriesSelected;

      return (
        <section
          key={item.key}
          className={`${idePopupCardClassName} overflow-hidden px-0 py-0`}
        >
          <div className="flex h-16 items-center gap-2 border-b border-zinc-800/70 px-3">
            <button
              type="button"
              aria-pressed={allGroupEntriesSelected}
              aria-label={`${allGroupEntriesSelected ? 'unselect' : 'select'} group ${group.label}`}
              onClick={() => {
                toggleSelectedGroup(group.entries);
              }}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                allGroupEntriesSelected || someGroupEntriesSelected
                  ? 'border-sky-400/70 bg-sky-500/[0.10] text-sky-200'
                  : 'border-zinc-600 bg-zinc-950/80 text-transparent'
              }`}
            >
              {allGroupEntriesSelected ? <Check size={11} /> : <Minus size={11} />}
            </button>
            <button
              type="button"
              onClick={() => {
                toggleCollapsedGroup(group.key);
              }}
              className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-zinc-50"
            >
              {isCollapsed ? (
                <ChevronRight size={13} className="shrink-0 text-zinc-500" />
              ) : (
                <ChevronDown size={13} className="shrink-0 text-zinc-500" />
              )}
              <Folder size={13} className="shrink-0 text-amber-300/85" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-100">
                {group.label}
              </span>
              <span className="shrink-0 rounded-md border border-zinc-700/80 bg-zinc-950/55 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                {group.includedCount}/{group.entries.length}
              </span>
            </button>
          </div>
        </section>
      );
    }

    return (
      <CommitWindowEntryCard
        key={item.key}
        entry={item.entry}
        isChecked={selectedPathSet.has(item.entry.path)}
        isActive={selectedPath === item.entry.path}
        onToggleSelectedPath={toggleSelectedPath}
        onSelectPath={onSelectPath}
        onStagePath={onStagePath}
        onUnstagePath={onUnstagePath}
        onDiscardPath={onDiscardPath}
        onOpenFileDiff={onOpenFileDiff}
        onOpenConflictResolver={onOpenConflictResolver}
        onResolveConflict={onResolveConflict}
        t={t}
      />
    );
  }, [
    collapsedGroupKeys,
    onDiscardPath,
    onOpenConflictResolver,
    onOpenFileDiff,
    onResolveConflict,
    onSelectPath,
    onStagePath,
    onUnstagePath,
    selectedPath,
    selectedPathSet,
    t,
    toggleCollapsedGroup,
    toggleSelectedGroup,
    toggleSelectedPath,
  ]);

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
                  <div className="mt-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
                      <button
                        type="button"
                        aria-pressed={showIncludedOnly}
                        onClick={() => {
                          setShowIncludedOnly((currentValue) => !currentValue);
                        }}
                        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                          showIncludedOnly
                            ? 'border-sky-400/70 bg-sky-500/[0.10] text-sky-200'
                            : 'border-zinc-600 bg-zinc-950/80 text-transparent'
                        }`}
                      >
                        <Check size={11} />
                      </button>
                      <span>{t('codePane.gitShowIncludedOnly')}</span>
                    </label>
                  </div>
                </div>

                <div
                  ref={visibleItemsScrollRef}
                  className="min-h-0 flex-1 overflow-auto px-2 py-2"
                  onScroll={handleVisibleItemsScroll}
                >
                  {visibleEntries.length > 0 ? (
                    visibleItemSlice.isWindowed ? (
                      <div style={{ height: `${visibleItemSlice.totalHeight}px`, position: 'relative' }}>
                        <div className="space-y-2" style={{ transform: `translateY(${visibleItemSlice.offsetTop}px)` }}>
                          {visibleItemSlice.items.map(renderVisibleItem)}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {visibleItems.map(renderVisibleItem)}
                      </div>
                    )
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
});
