import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CodePaneGitBranchEntry,
  CodePaneGitCommitDetails,
  CodePaneGitCommitFileChange,
  CodePaneGitCompareCommitsResult,
  CodePaneGitDiffHunk,
  CodePaneGitGraphCommit,
  CodePaneGitRebasePlanEntry,
  CodePaneGitRebasePlanResult,
  CodePaneGitStatusEntry,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';
import { getPathLeafLabel } from '../../../utils/pathDisplay';
import { buildGitGraphLayout, type GitGraphLineSegment, type GitGraphRowLayout } from '../../../utils/gitGraphLayout';
import { GitHunkList } from '../scm/GitHunkList';

export type GitToolWindowTab = 'changes' | 'log' | 'rebase';
type GitChangeSection = 'conflicted' | 'staged' | 'unstaged' | 'untracked';

type GitChangeWorkbenchRow = {
  key: string;
  section: GitChangeSection;
  entry: CodePaneGitStatusEntry;
  relativePath: string;
  directoryLabel: string;
};

type GitChangeWorkbenchDirectoryGroup = {
  key: string;
  label: string;
  rows: GitChangeWorkbenchRow[];
};

type GitChangeWorkbenchSectionGroup = {
  section: GitChangeSection;
  count: number;
  directoryGroups: GitChangeWorkbenchDirectoryGroup[];
};

type GitChangeVisibleItem =
  | {
      key: string;
      kind: 'section';
      section: GitChangeSection;
      count: number;
    }
  | {
      key: string;
      kind: 'directory';
      label: string;
      count: number;
    }
  | {
      key: string;
      kind: 'change';
      row: GitChangeWorkbenchRow;
    };

const GitChangeEntryCard = React.memo(function GitChangeEntryCard({
  row,
  isSelected,
  getRelativePath,
  onSelectChange,
  onStagePath,
  onUnstagePath,
  onDiscardPath,
  onOpenFileDiff,
  onOpenConflictResolver,
  onResolveConflict,
  onShowFileHistory,
  onRevealInExplorer,
  t,
}: {
  row: GitChangeWorkbenchRow;
  isSelected: boolean;
  getRelativePath: (filePath: string) => string;
  onSelectChange: (entry: CodePaneGitStatusEntry) => void | Promise<void>;
  onStagePath: (filePath: string) => void | Promise<void>;
  onUnstagePath: (filePath: string) => void | Promise<void>;
  onDiscardPath: (filePath: string, restoreStaged: boolean) => void | Promise<void>;
  onOpenFileDiff: (filePath: string) => void | Promise<void>;
  onOpenConflictResolver: (filePath: string) => void | Promise<void>;
  onResolveConflict: (filePath: string, resolution: 'ours' | 'theirs') => void | Promise<void>;
  onShowFileHistory: (filePath: string) => void | Promise<void>;
  onRevealInExplorer: (filePath: string) => void | Promise<void>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const entry = row.entry;
  const entryTextClassName = getGitStatusTextClassName(entry.status);
  const canStage = row.section !== 'staged';
  const canUnstage = row.section === 'staged' || Boolean(entry.staged);

  return (
    <div
      className={`group rounded border px-2 py-2 transition-colors ${
        isSelected
          ? 'border-[rgb(var(--ring))]/45 bg-[rgb(var(--primary))]/10 text-[rgb(var(--foreground))]'
          : 'border-transparent text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          void onSelectChange(entry);
        }}
        className="flex w-full min-w-0 items-center gap-2 text-left"
      >
        <FileIcon size={13} className="shrink-0 text-[rgb(var(--muted-foreground))]" />
        <span className={`min-w-0 flex-1 truncate text-xs ${entryTextClassName}`}>
          {getPathLeafLabel(entry.path)}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${getGitStatusBadgeClassName(entry.status)}`}>
          {getGitStatusBadgeLabel(entry.status)}
        </span>
      </button>
      <div className="mt-1 truncate pl-5 text-[10px] text-[rgb(var(--muted-foreground))]">
        {row.relativePath}
      </div>
      {entry.originalPath && (
        <div className="mt-0.5 truncate pl-5 text-[10px] text-[rgb(var(--muted-foreground))]/75">
          {getRelativePath(entry.originalPath)} -&gt; {row.relativePath}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1 pl-5">
        {entry.conflicted ? (
          <>
            <button
              type="button"
              onClick={() => {
                void onOpenConflictResolver(entry.path);
              }}
              className="rounded bg-[rgb(var(--success)/0.14)] px-1.5 py-0.5 text-[10px] text-[rgb(var(--success))] hover:bg-[rgb(var(--success)/0.22)]"
            >
              {t('codePane.gitResolveConflict')}
            </button>
            <button
              type="button"
              onClick={() => {
                void onResolveConflict(entry.path, 'ours');
              }}
              className="rounded bg-[rgb(var(--warning)/0.14)] px-1.5 py-0.5 text-[10px] text-[rgb(var(--warning))] hover:bg-[rgb(var(--warning)/0.22)]"
            >
              {t('codePane.gitUseOurs')}
            </button>
            <button
              type="button"
              onClick={() => {
                void onResolveConflict(entry.path, 'theirs');
              }}
              className="rounded bg-[rgb(var(--info)/0.14)] px-1.5 py-0.5 text-[10px] text-[rgb(var(--info))] hover:bg-[rgb(var(--info)/0.22)]"
            >
              {t('codePane.gitUseTheirs')}
            </button>
          </>
        ) : (
          <>
            {canStage && (
              <button
                type="button"
                onClick={() => {
                  void onStagePath(entry.path);
                }}
                className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]"
              >
                {t('codePane.gitStage')}
              </button>
            )}
            {canUnstage && (
              <button
                type="button"
                onClick={() => {
                  void onUnstagePath(entry.path);
                }}
                className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]"
              >
                {t('codePane.gitUnstage')}
              </button>
            )}
            {(row.section === 'unstaged' || row.section === 'untracked' || entry.status === 'deleted') && (
              <button
                type="button"
                onClick={() => {
                  void onDiscardPath(entry.path, row.section === 'staged');
                }}
                className="rounded bg-[rgb(var(--error)/0.14)] px-1.5 py-0.5 text-[10px] text-[rgb(var(--error))] hover:bg-[rgb(var(--error)/0.22)]"
              >
                {t('codePane.gitDiscard')}
              </button>
            )}
          </>
        )}
        {entry.status !== 'deleted' && (
          <button
            type="button"
            onClick={() => {
              void onOpenFileDiff(entry.path);
            }}
            className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]"
          >
            {t('codePane.openDiff')}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void onShowFileHistory(entry.path);
          }}
          className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]"
        >
          {t('codePane.gitFileHistory')}
        </button>
        <button
          type="button"
          onClick={() => {
            void onRevealInExplorer(entry.path);
          }}
          className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]"
        >
          {t('codePane.gitRevealInExplorer')}
        </button>
      </div>
    </div>
  );
});

const BranchTreeRow = React.memo(function BranchTreeRow({
  node,
  depth,
  isSelected = false,
  isCollapsed = false,
  onToggleNode,
  onSelectBranch,
}: {
  node: BranchTreeNode;
  depth: number;
  isSelected?: boolean;
  isCollapsed?: boolean;
  onToggleNode: (nodeKey: string) => void;
  onSelectBranch: (branchName: string) => void;
}) {
  if (node.kind === 'folder') {
    return (
      <button
        type="button"
        onClick={() => {
          onToggleNode(node.key);
        }}
        className="flex h-7 w-full items-center gap-2 rounded text-left text-xs text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
        style={{ paddingLeft: `${10 + (depth * 14)}px`, paddingRight: '8px' }}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <FolderTree size={12} className="shrink-0 text-[rgb(var(--muted-foreground))]" />
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        <span className="rounded bg-[rgb(var(--secondary))] px-1 py-0.5 text-[10px] text-[rgb(var(--muted-foreground))]">
          {node.branchCount}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        onSelectBranch(node.branch.name);
      }}
      className={`flex h-7 w-full items-center gap-2 rounded text-left text-xs transition-colors ${
        isSelected
          ? 'bg-[rgb(var(--primary))]/10 text-[rgb(var(--foreground))]'
          : 'text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]'
      }`}
      style={{ paddingLeft: `${28 + (depth * 14)}px`, paddingRight: '8px' }}
    >
      <GitBranch size={12} className={`shrink-0 ${node.branch.current ? 'text-[rgb(var(--success))]' : 'text-[rgb(var(--muted-foreground))]'}`} />
      <span className="min-w-0 flex-1 truncate">{node.label}</span>
      <span className="truncate text-[10px] text-[rgb(var(--muted-foreground))]">{node.branch.shortSha}</span>
      {node.branch.current && (
        <span className="rounded bg-[rgb(var(--success)/0.14)] px-1 py-0.5 text-[10px] text-[rgb(var(--success))]">
          HEAD
        </span>
      )}
    </button>
  );
});

interface GitToolWindowProps {
  activeTab?: GitToolWindowTab;
  onTabChange?: (tab: GitToolWindowTab) => void;
  branches: CodePaneGitBranchEntry[];
  selectedBranchName: string | null;
  commits: CodePaneGitGraphCommit[];
  selectedCommitSha: string | null;
  changes: CodePaneGitStatusEntry[];
  selectedChangePath: string | null;
  selectedHunkPath: string | null;
  selectedHunkRelativePath: string | null;
  stagedHunks: CodePaneGitDiffHunk[];
  unstagedHunks: CodePaneGitDiffHunk[];
  hunksLoading: boolean;
  hunksError: string | null;
  rebasePlan: CodePaneGitRebasePlanResult | null;
  rebaseBaseRef: string;
  isBranchesLoading: boolean;
  branchesError: string | null;
  isRebaseLoading: boolean;
  rebaseError: string | null;
  selectedCommitDetails: CodePaneGitCommitDetails | null;
  comparedCommits: CodePaneGitCompareCommitsResult | null;
  selectedCommitOrder: string[];
  isCommitDetailsLoading: boolean;
  commitDetailsError: string | null;
  onSelectBranch: (branchName: string) => void;
  onSelectCommit: (commitSha: string, event?: { metaKey?: boolean; ctrlKey?: boolean }) => void;
  onSelectChange: (entry: CodePaneGitStatusEntry) => void | Promise<void>;
  onChangeRebaseBaseRef: (baseRef: string) => void;
  onRefresh: () => void | Promise<void>;
  onRefreshRebase: () => void | Promise<void>;
  onStagePath: (filePath: string) => void | Promise<void>;
  onUnstagePath: (filePath: string) => void | Promise<void>;
  onDiscardPath: (filePath: string, restoreStaged: boolean) => void | Promise<void>;
  onOpenFileDiff: (filePath: string) => void | Promise<void>;
  onOpenConflictResolver: (filePath: string) => void | Promise<void>;
  onResolveConflict: (filePath: string, resolution: 'ours' | 'theirs') => void | Promise<void>;
  onStageHunk: (hunk: CodePaneGitDiffHunk) => void | Promise<void>;
  onUnstageHunk: (hunk: CodePaneGitDiffHunk) => void | Promise<void>;
  onDiscardHunk: (hunk: CodePaneGitDiffHunk) => void | Promise<void>;
  onShowFileHistory: (filePath: string) => void | Promise<void>;
  onRevealInExplorer: (filePath: string) => void | Promise<void>;
  onCheckoutBranch: (config: { branchName: string; createBranch: boolean; startPoint?: string; preferExisting?: boolean }) => void | Promise<void>;
  onRequestRenameBranch: (branchName: string) => void | Promise<void>;
  onDeleteBranch: (branchName: string, force?: boolean) => void | Promise<void>;
  onCherryPick: (commitSha: string) => void | Promise<void>;
  onCompareSelectedCommits: () => void | Promise<void>;
  onOpenCommitFileDiff: (config: {
    filePath: string;
    leftCommitSha?: string;
    rightCommitSha?: string;
    rightLabel?: string;
    leftLabel?: string;
  }) => void | Promise<void>;
  onApplyRebasePlan: (baseRef: string, entries: CodePaneGitRebasePlanEntry[]) => void | Promise<void>;
  getRelativePath: (filePath: string) => string;
  onClose: () => void;
}

type BranchTreeNode =
  | {
    key: string;
    kind: 'folder';
    label: string;
    children: BranchTreeNode[];
    branchCount: number;
  }
  | {
    key: string;
    kind: 'branch';
    label: string;
    branch: CodePaneGitBranchEntry;
  };

interface BranchTreeSection {
  key: string;
  label: string;
  count: number;
  nodes: BranchTreeNode[];
}

type BranchTreeVisibleRow = {
  key: string;
  depth: number;
  node: BranchTreeNode;
};

type BranchListVisibleItem =
  | {
    key: string;
    kind: 'section';
    label: string;
    count: number;
  }
  | {
    key: string;
    kind: 'row';
    depth: number;
    node: BranchTreeNode;
  };

type WindowedListSlice<T> = {
  items: T[];
  offsetTop: number;
  totalHeight: number;
  isWindowed: boolean;
};

const GIT_GRAPH_COLORS = [
  '#60a5fa',
  '#34d399',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#f87171',
  '#22d3ee',
  '#facc15',
] as const;

const GRAPH_LANE_WIDTH = 14;
const GRAPH_ROW_HEIGHT = 28;
const GRAPH_NODE_RADIUS = 4;
const GIT_FIXED_LIST_OVERSCAN = 10;
const GIT_FIXED_LIST_WINDOWING_THRESHOLD = 120;
const GIT_BRANCH_LIST_ROW_HEIGHT = 28;
const GIT_COMMIT_LOG_ROW_HEIGHT = 32;
const GIT_REBASE_ROW_HEIGHT = 32;
const GIT_CHANGE_ROW_HEIGHT = 104;
const GIT_CHANGE_SECTION_ORDER: GitChangeSection[] = ['conflicted', 'staged', 'unstaged', 'untracked'];

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
  threshold = GIT_FIXED_LIST_WINDOWING_THRESHOLD,
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
    overscan: GIT_FIXED_LIST_OVERSCAN,
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

export const GitToolWindow = React.memo(function GitToolWindow({
  activeTab: controlledActiveTab,
  onTabChange,
  branches,
  selectedBranchName,
  commits,
  selectedCommitSha,
  changes,
  selectedChangePath,
  selectedHunkPath,
  selectedHunkRelativePath,
  stagedHunks,
  unstagedHunks,
  hunksLoading,
  hunksError,
  rebasePlan,
  rebaseBaseRef,
  isBranchesLoading,
  branchesError,
  isRebaseLoading,
  rebaseError,
  selectedCommitDetails,
  comparedCommits,
  selectedCommitOrder,
  isCommitDetailsLoading,
  commitDetailsError,
  onSelectBranch,
  onSelectCommit,
  onSelectChange,
  onChangeRebaseBaseRef,
  onRefresh,
  onRefreshRebase,
  onStagePath,
  onUnstagePath,
  onDiscardPath,
  onOpenFileDiff,
  onOpenConflictResolver,
  onResolveConflict,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  onShowFileHistory,
  onRevealInExplorer,
  onCheckoutBranch,
  onRequestRenameBranch,
  onDeleteBranch,
  onCherryPick,
  onCompareSelectedCommits,
  onOpenCommitFileDiff,
  onApplyRebasePlan,
  getRelativePath,
  onClose,
}: GitToolWindowProps) {
  const { t } = useI18n();
  const [draftEntries, setDraftEntries] = useState<CodePaneGitRebasePlanEntry[]>([]);

  const activeTab = controlledActiveTab ?? 'log';

  useEffect(() => {
    setDraftEntries(rebasePlan?.commits ?? []);
  }, [rebasePlan]);

  const selectedBranch = useMemo(() => (
    branches.find((branch) => branch.name === selectedBranchName)
    ?? branches.find((branch) => branch.current)
    ?? branches[0]
    ?? null
  ), [branches, selectedBranchName]);
  const selectedCommit = useMemo(() => (
    commits.find((commit) => commit.sha === selectedCommitSha)
    ?? commits[0]
    ?? null
  ), [commits, selectedCommitSha]);

  const currentBranches = useMemo(
    () => branches.filter((branch) => branch.current),
    [branches],
  );
  const localBranches = useMemo(
    () => branches.filter((branch) => branch.kind === 'local'),
    [branches],
  );
  const remoteBranches = useMemo(
    () => branches.filter((branch) => branch.kind === 'remote'),
    [branches],
  );
  const baseRefOptions = useMemo(
    () => branches.map((branch) => branch.name),
    [branches],
  );

  const moveDraftEntry = useCallback((entryIndex: number, direction: -1 | 1) => {
    setDraftEntries((currentEntries) => {
      const nextIndex = entryIndex + direction;
      if (nextIndex < 0 || nextIndex >= currentEntries.length) {
        return currentEntries;
      }

      const nextEntries = [...currentEntries];
      const [entry] = nextEntries.splice(entryIndex, 1);
      nextEntries.splice(nextIndex, 0, entry);
      return nextEntries;
    });
  }, []);

  const updateDraftAction = useCallback((
    entryIndex: number,
    action: CodePaneGitRebasePlanEntry['action'],
  ) => {
    setDraftEntries((currentEntries) => currentEntries.map((entry, index) => (
      index === entryIndex
        ? {
          ...entry,
          action,
        }
        : entry
    )));
  }, []);

  const handleTabChange = useCallback((tab: GitToolWindowTab) => {
    onTabChange?.(tab);
  }, [onTabChange]);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_88%,transparent)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            <GitBranch size={12} className="text-[rgb(var(--primary))]" />
            {t('codePane.gitWorkbenchTab')}
          </div>
          <div className="flex rounded bg-[rgb(var(--secondary))] p-0.5">
            {([
              ['changes', t('codePane.gitChangesWorkbenchTab')],
              ['log', t('codePane.gitLogTab')],
              ['rebase', t('codePane.gitRebasePlanner')],
            ] as const).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                onClick={() => {
                  handleTabChange(tabId);
                }}
                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                  activeTab === tabId
                    ? 'bg-[rgb(var(--primary))]/14 text-[rgb(var(--foreground))]'
                    : 'text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onRefresh();
            }}
            className="rounded bg-[rgb(var(--secondary))] p-1 text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[rgb(var(--secondary))] p-1 text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {((activeTab !== 'changes' ? branchesError : null) || (activeTab === 'rebase' ? rebaseError : null)) && (
        <div className="border-b border-[rgb(var(--error)/0.20)] bg-[rgb(var(--error)/0.10)] px-3 py-2 text-xs text-[rgb(var(--error))]">
          {(activeTab !== 'changes' ? branchesError : null) || rebaseError}
        </div>
      )}

      {activeTab === 'changes' ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,420px)_minmax(0,1fr)] overflow-hidden">
          <GitChangesSection
            changes={changes}
            selectedChangePath={selectedChangePath}
            getRelativePath={getRelativePath}
            onSelectChange={onSelectChange}
            onStagePath={onStagePath}
            onUnstagePath={onUnstagePath}
            onDiscardPath={onDiscardPath}
            onOpenFileDiff={onOpenFileDiff}
            onOpenConflictResolver={onOpenConflictResolver}
            onResolveConflict={onResolveConflict}
            onShowFileHistory={onShowFileHistory}
            onRevealInExplorer={onRevealInExplorer}
            t={t}
          />
          <div className="min-h-0 overflow-auto bg-[color-mix(in_srgb,rgb(var(--background))_72%,transparent)] px-3 py-3">
            <GitHunkList
              selectedPath={selectedHunkPath}
              relativePath={selectedHunkRelativePath}
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
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_340px] overflow-hidden">
          <div className="min-h-0 border-r border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_78%,transparent)]">
            <BranchListSection
              currentBranches={currentBranches}
              localBranches={localBranches}
              remoteBranches={remoteBranches}
              selectedBranchName={selectedBranch?.name ?? null}
              isLoading={isBranchesLoading}
              onSelectBranch={onSelectBranch}
              t={t}
            />
          </div>

          <div className="min-h-0 border-r border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_72%,transparent)]">
            {activeTab === 'log' ? (
              <CommitLogSection
                commits={commits}
                selectedCommitSha={selectedCommit?.sha ?? null}
                selectedCommitOrder={selectedCommitOrder}
                onSelectCommit={onSelectCommit}
                onCompareSelectedCommits={onCompareSelectedCommits}
                t={t}
              />
            ) : (
              <RebasePlanSection
                entries={draftEntries}
                isLoading={isRebaseLoading}
                onMoveEntry={moveDraftEntry}
                onChangeAction={updateDraftAction}
                t={t}
              />
            )}
          </div>

          <div className="min-h-0 overflow-auto px-3 py-3">
            {activeTab === 'log' ? (
              <GitWorkbenchDetails
                selectedBranch={selectedBranch}
                selectedCommit={selectedCommit}
                selectedCommitDetails={selectedCommitDetails}
                comparedCommits={comparedCommits}
                selectedCommitOrder={selectedCommitOrder}
                isCommitDetailsLoading={isCommitDetailsLoading}
                commitDetailsError={commitDetailsError}
                onCheckoutBranch={onCheckoutBranch}
                onRequestRenameBranch={onRequestRenameBranch}
                onDeleteBranch={onDeleteBranch}
                onCherryPick={onCherryPick}
                onOpenCommitFileDiff={onOpenCommitFileDiff}
                t={t}
              />
            ) : (
              <GitRebaseDetails
                branches={baseRefOptions}
                baseRef={rebaseBaseRef}
                hasMergeCommits={Boolean(rebasePlan?.hasMergeCommits)}
                entryCount={draftEntries.length}
                isLoading={isRebaseLoading}
                onChangeBaseRef={onChangeRebaseBaseRef}
                onRefreshRebase={onRefreshRebase}
                onApplyRebasePlan={onApplyRebasePlan}
                draftEntries={draftEntries}
                t={t}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const GitChangesSection = React.memo(function GitChangesSection({
  changes,
  selectedChangePath,
  getRelativePath,
  onSelectChange,
  onStagePath,
  onUnstagePath,
  onDiscardPath,
  onOpenFileDiff,
  onOpenConflictResolver,
  onResolveConflict,
  onShowFileHistory,
  onRevealInExplorer,
  t,
}: {
  changes: CodePaneGitStatusEntry[];
  selectedChangePath: string | null;
  getRelativePath: (filePath: string) => string;
  onSelectChange: (entry: CodePaneGitStatusEntry) => void | Promise<void>;
  onStagePath: (filePath: string) => void | Promise<void>;
  onUnstagePath: (filePath: string) => void | Promise<void>;
  onDiscardPath: (filePath: string, restoreStaged: boolean) => void | Promise<void>;
  onOpenFileDiff: (filePath: string) => void | Promise<void>;
  onOpenConflictResolver: (filePath: string) => void | Promise<void>;
  onResolveConflict: (filePath: string, resolution: 'ours' | 'theirs') => void | Promise<void>;
  onShowFileHistory: (filePath: string) => void | Promise<void>;
  onRevealInExplorer: (filePath: string) => void | Promise<void>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const sectionGroups = useMemo(
    () => buildGitChangeWorkbenchGroups(changes, getRelativePath),
    [changes, getRelativePath],
  );
  const visibleItems = useMemo<GitChangeVisibleItem[]>(() => {
    const nextItems: GitChangeVisibleItem[] = [];
    for (const sectionGroup of sectionGroups) {
      nextItems.push({
        key: `section:${sectionGroup.section}`,
        kind: 'section',
        section: sectionGroup.section,
        count: sectionGroup.count,
      });
      for (const directoryGroup of sectionGroup.directoryGroups) {
        nextItems.push({
          key: `directory:${sectionGroup.section}:${directoryGroup.key}`,
          kind: 'directory',
          label: directoryGroup.label,
          count: directoryGroup.rows.length,
        });
        for (const row of directoryGroup.rows) {
          nextItems.push({
            key: row.key,
            kind: 'change',
            row,
          });
        }
      }
    }
    return nextItems;
  }, [sectionGroups]);
  const { scrollRef, slice: visibleItemSlice, handleScroll } = useFixedWindowedList(
    visibleItems,
    GIT_CHANGE_ROW_HEIGHT,
  );

  const renderVisibleItem = useCallback((item: GitChangeVisibleItem) => {
    if (item.kind === 'section') {
      return (
        <div
          key={item.key}
          className="flex h-10 items-center justify-between gap-2 px-2 text-[11px] font-medium text-[rgb(var(--muted-foreground))]"
        >
          <span>{getGitSectionLabel(t, item.section)}</span>
          <span className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--muted-foreground))]">{item.count}</span>
        </div>
      );
    }

    if (item.kind === 'directory') {
      return (
        <div
          key={item.key}
          className="flex h-9 items-center gap-2 rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_42%,transparent)] px-2 text-[11px] text-[rgb(var(--muted-foreground))]"
        >
          <Folder size={12} className="shrink-0 text-[rgb(var(--muted-foreground))]" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="rounded bg-[rgb(var(--background))] px-1 py-0.5 text-[10px]">{item.count}</span>
        </div>
      );
    }

    return (
      <GitChangeEntryCard
        key={item.key}
        row={item.row}
        isSelected={selectedChangePath === item.row.entry.path}
        getRelativePath={getRelativePath}
        onSelectChange={onSelectChange}
        onStagePath={onStagePath}
        onUnstagePath={onUnstagePath}
        onDiscardPath={onDiscardPath}
        onOpenFileDiff={onOpenFileDiff}
        onOpenConflictResolver={onOpenConflictResolver}
        onResolveConflict={onResolveConflict}
        onShowFileHistory={onShowFileHistory}
        onRevealInExplorer={onRevealInExplorer}
        t={t}
      />
    );
  }, [
    getRelativePath,
    onDiscardPath,
    onOpenConflictResolver,
    onOpenFileDiff,
    onResolveConflict,
    onRevealInExplorer,
    onSelectChange,
    onShowFileHistory,
    onStagePath,
    onUnstagePath,
    selectedChangePath,
    t,
  ]);

  return (
    <div className="flex min-h-0 flex-col border-r border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_78%,transparent)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
          <FolderTree size={12} />
          {t('codePane.gitChanges')}
        </div>
        <span className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--muted-foreground))]">
          {changes.length}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-2 py-2"
        onScroll={handleScroll}
      >
        {sectionGroups.length > 0 ? (
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
          <div className="flex h-full items-center justify-center text-xs text-[rgb(var(--muted-foreground))]">
            {t('codePane.noChanges')}
          </div>
        )}
      </div>
    </div>
  );
});

const BranchListSection = React.memo(function BranchListSection({
  currentBranches,
  localBranches,
  remoteBranches,
  selectedBranchName,
  isLoading,
  onSelectBranch,
  t,
}: {
  currentBranches: CodePaneGitBranchEntry[];
  localBranches: CodePaneGitBranchEntry[];
  remoteBranches: CodePaneGitBranchEntry[];
  selectedBranchName: string | null;
  isLoading: boolean;
  onSelectBranch: (branchName: string) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const [collapsedNodeKeys, setCollapsedNodeKeys] = useState<string[]>([]);
  const collapsedNodeKeySet = useMemo(() => new Set(collapsedNodeKeys), [collapsedNodeKeys]);
  const sections = useMemo<BranchTreeSection[]>(() => {
    const headNodes: BranchTreeNode[] = [];
    for (const branch of currentBranches) {
      headNodes.push({
        key: `head:branch:${branch.name}`,
        kind: 'branch',
        label: branch.shortName || branch.name,
        branch,
      } satisfies BranchTreeNode);
    }
    const localNodes = buildBranchTree(localBranches, 'local', (branch) => splitBranchPath(branch.shortName || branch.name));
    const remoteNodes = buildBranchTree(remoteBranches, 'remote', (branch) => {
      const [remoteName, ...restPath] = splitBranchPath(branch.shortName || branch.name);
      return [remoteName || branch.name, ...restPath];
    });

    const nextSections: BranchTreeSection[] = [];
    if (headNodes.length > 0) {
      nextSections.push({
        key: 'head',
        label: t('codePane.gitCurrentBranchGroup'),
        count: headNodes.length,
        nodes: headNodes,
      });
    }
    if (localBranches.length > 0) {
      nextSections.push({
        key: 'local',
        label: t('codePane.gitLocalBranches'),
        count: localBranches.length,
        nodes: localNodes,
      });
    }
    if (remoteBranches.length > 0) {
      nextSections.push({
        key: 'remote',
        label: t('codePane.gitRemoteBranches'),
        count: remoteBranches.length,
        nodes: remoteNodes,
      });
    }
    return nextSections;
  }, [currentBranches, localBranches, remoteBranches, t]);
  const visibleSections = useMemo(() => sections.map((section) => ({
    ...section,
    rows: flattenBranchTreeRows(section.nodes, collapsedNodeKeySet),
  })), [collapsedNodeKeySet, sections]);
  const visibleItems = useMemo<BranchListVisibleItem[]>(() => {
    const nextItems: BranchListVisibleItem[] = [];
    for (const section of visibleSections) {
      nextItems.push({
        key: `section:${section.key}`,
        kind: 'section',
        label: section.label,
        count: section.count,
      });
      for (const row of section.rows) {
        nextItems.push({
          key: row.key,
          kind: 'row',
          depth: row.depth,
          node: row.node,
        });
      }
    }
    return nextItems;
  }, [visibleSections]);
  const { scrollRef, slice: visibleItemSlice, handleScroll } = useFixedWindowedList(
    visibleItems,
    GIT_BRANCH_LIST_ROW_HEIGHT,
  );

  const toggleNode = useCallback((nodeKey: string) => {
    setCollapsedNodeKeys((currentKeys) => (
      currentKeys.includes(nodeKey)
        ? currentKeys.filter((key) => key !== nodeKey)
        : [...currentKeys, nodeKey]
    ));
  }, []);

  const totalBranches = localBranches.length + remoteBranches.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          <FolderTree size={12} />
          {t('codePane.gitBranchManager')}
        </div>
        <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">
          {totalBranches}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-2 py-2"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.loading')}
          </div>
        ) : visibleItems.length > 0 ? (
          visibleItemSlice.isWindowed ? (
            <div style={{ height: `${visibleItemSlice.totalHeight}px`, position: 'relative' }}>
              <div style={{ transform: `translateY(${visibleItemSlice.offsetTop}px)` }}>
                {visibleItemSlice.items.map((item) => (
                  item.kind === 'section' ? (
                    <div
                      key={item.key}
                      className="flex h-7 items-center justify-between gap-2 px-2 text-[11px] font-medium text-zinc-500"
                    >
                      <span>{item.label}</span>
                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">{item.count}</span>
                    </div>
                  ) : (
                    <BranchTreeRow
                      key={item.key}
                      node={item.node}
                      depth={item.depth}
                      isSelected={item.node.kind === 'branch' && item.node.branch.name === selectedBranchName}
                      isCollapsed={item.node.kind === 'folder' ? collapsedNodeKeySet.has(item.node.key) : false}
                      onToggleNode={toggleNode}
                      onSelectBranch={onSelectBranch}
                    />
                  )
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {visibleItems.map((item) => (
                item.kind === 'section' ? (
                  <div
                    key={item.key}
                    className="flex h-7 items-center justify-between gap-2 px-2 text-[11px] font-medium text-zinc-500"
                  >
                    <span>{item.label}</span>
                    <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">{item.count}</span>
                  </div>
                ) : (
                  <BranchTreeRow
                    key={item.key}
                    node={item.node}
                    depth={item.depth}
                    isSelected={item.node.kind === 'branch' && item.node.branch.name === selectedBranchName}
                    isCollapsed={item.node.kind === 'folder' ? collapsedNodeKeySet.has(item.node.key) : false}
                    onToggleNode={toggleNode}
                    onSelectBranch={onSelectBranch}
                  />
                )
              ))}
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {t('codePane.gitCommitGraphEmpty')}
          </div>
        )}
      </div>
    </div>
  );
});

const GitCommitGraphCell = React.memo(function GitCommitGraphCell({
  row,
  graphWidth,
}: {
  row: GitGraphRowLayout;
  graphWidth: number;
}) {
  const nodeColor = getGraphColor(row.nodeColorIndex);

  return (
    <div className="flex items-center">
      <svg
        width={graphWidth}
        height={GRAPH_ROW_HEIGHT}
        viewBox={`0 0 ${graphWidth} ${GRAPH_ROW_HEIGHT}`}
        className="block h-7"
        aria-hidden="true"
      >
        {row.segments.map((segment, index) => (
          <path
            key={`${row.commit.sha}-segment-${index}`}
            d={toSegmentPath(segment)}
            fill="none"
            stroke={getGraphColor(segment.colorIndex)}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />
        ))}
        <circle
          cx={getLaneCenter(row.nodeLane)}
          cy={GRAPH_ROW_HEIGHT / 2}
          r={row.commit.isMergeCommit ? GRAPH_NODE_RADIUS + 0.5 : GRAPH_NODE_RADIUS}
          fill={nodeColor}
          stroke={row.commit.isHead ? '#ecfccb' : '#18181b'}
          strokeWidth={row.commit.isHead ? 1.8 : 1.2}
        />
        {row.commit.isHead && (
          <circle
            cx={getLaneCenter(row.nodeLane)}
            cy={GRAPH_ROW_HEIGHT / 2}
            r={GRAPH_NODE_RADIUS + 2}
            fill="none"
            stroke={nodeColor}
            strokeWidth={1.1}
            opacity={0.45}
          />
        )}
      </svg>
    </div>
  );
});

const CommitLogRow = React.memo(function CommitLogRow({
  row,
  graphWidth,
  gridTemplateColumns,
  isSelected,
  compareIndex,
  onSelectCommit,
}: {
  row: GitGraphRowLayout;
  graphWidth: number;
  gridTemplateColumns: string;
  isSelected: boolean;
  compareIndex?: number;
  onSelectCommit: (commitSha: string, event?: { metaKey?: boolean; ctrlKey?: boolean }) => void;
}) {
  const isCompared = compareIndex !== undefined;
  const visibleRefs = row.commit.refs.slice(0, 3);

  return (
    <button
      type="button"
      onClick={(event) => {
        onSelectCommit(row.commit.sha, {
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
        });
      }}
      className={`grid h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition-colors ${
        isSelected
          ? 'bg-sky-500/15 text-sky-100'
          : isCompared
            ? 'bg-amber-500/10 text-amber-100'
            : 'text-zinc-300 hover:bg-zinc-900/80 hover:text-zinc-100'
      }`}
      style={{ gridTemplateColumns }}
    >
      <GitCommitGraphCell row={row} graphWidth={graphWidth} />
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        <span className="min-w-0 flex-1 truncate text-zinc-100">
          {row.commit.subject || row.commit.shortSha}
        </span>
        {isCompared && (
          <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-200">
            {compareIndex}
          </span>
        )}
        {visibleRefs.map((ref) => (
          <span
            key={`${row.commit.sha}-${ref}`}
            className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${getRefClassName(ref)}`}
          >
            {ref}
          </span>
        ))}
        {row.commit.refs.length > visibleRefs.length && (
          <span className="shrink-0 text-[10px] text-zinc-500">
            +{row.commit.refs.length - visibleRefs.length}
          </span>
        )}
      </div>
      <span className="truncate text-zinc-400">{row.commit.author}</span>
      <span className="truncate text-zinc-500">{formatTimestamp(row.commit.timestamp)}</span>
    </button>
  );
});

const CommitLogSection = React.memo(function CommitLogSection({
  commits,
  selectedCommitSha,
  selectedCommitOrder,
  onSelectCommit,
  onCompareSelectedCommits,
  t,
}: {
  commits: CodePaneGitGraphCommit[];
  selectedCommitSha: string | null;
  selectedCommitOrder: string[];
  onSelectCommit: (commitSha: string, event?: { metaKey?: boolean; ctrlKey?: boolean }) => void;
  onCompareSelectedCommits: () => void | Promise<void>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const layout = useMemo(() => buildGitGraphLayout(commits), [commits]);
  const graphWidth = Math.max(layout.maxColumns, 1) * GRAPH_LANE_WIDTH;
  const gridTemplateColumns = `${graphWidth + 24}px minmax(0,1fr) 110px 138px`;
  const selectedCommitIndexBySha = useMemo(() => new Map(
    selectedCommitOrder.map((commitSha, index) => [commitSha, index + 1]),
  ), [selectedCommitOrder]);
  const { scrollRef, slice: visibleCommitRows, handleScroll } = useFixedWindowedList(
    layout.rows,
    GIT_COMMIT_LOG_ROW_HEIGHT,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div
          className="grid gap-2 text-[11px] font-medium text-zinc-500"
          style={{ gridTemplateColumns }}
        >
          <span>{t('codePane.gitGraph')}</span>
          <span>{t('codePane.gitCommit')}</span>
          <span>{t('codePane.gitAuthor')}</span>
          <span>{t('codePane.gitDate')}</span>
        </div>
        {selectedCommitOrder.length > 1 && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded bg-zinc-900/70 px-2 py-1.5 text-[11px] text-zinc-400">
            <span>{t('codePane.gitCompareSelectionCount', { count: selectedCommitOrder.length })}</span>
            <button
              type="button"
              onClick={() => {
                void onCompareSelectedCommits();
              }}
              className="rounded bg-zinc-800 px-2 py-1 text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            >
              {t('codePane.gitCompareSelectedCommits')}
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-2 py-2"
        onScroll={handleScroll}
      >
        {layout.rows.length > 0 ? (
          visibleCommitRows.isWindowed ? (
            <div style={{ height: `${visibleCommitRows.totalHeight}px`, position: 'relative' }}>
              <div style={{ transform: `translateY(${visibleCommitRows.offsetTop}px)` }}>
                {visibleCommitRows.items.map((row) => (
                  <CommitLogRow
                    key={row.commit.sha}
                    row={row}
                    graphWidth={graphWidth}
                    gridTemplateColumns={gridTemplateColumns}
                    isSelected={row.commit.sha === selectedCommitSha}
                    compareIndex={selectedCommitIndexBySha.get(row.commit.sha)}
                    onSelectCommit={onSelectCommit}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {layout.rows.map((row) => (
                <CommitLogRow
                  key={row.commit.sha}
                  row={row}
                  graphWidth={graphWidth}
                  gridTemplateColumns={gridTemplateColumns}
                  isSelected={row.commit.sha === selectedCommitSha}
                  compareIndex={selectedCommitIndexBySha.get(row.commit.sha)}
                  onSelectCommit={onSelectCommit}
                />
              ))}
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {t('codePane.gitCommitGraphEmpty')}
          </div>
        )}
      </div>
    </div>
  );
});

const GitWorkbenchDetails = React.memo(function GitWorkbenchDetails({
  selectedBranch,
  selectedCommit,
  selectedCommitDetails,
  comparedCommits,
  selectedCommitOrder,
  isCommitDetailsLoading,
  commitDetailsError,
  onCheckoutBranch,
  onRequestRenameBranch,
  onDeleteBranch,
  onCherryPick,
  onOpenCommitFileDiff,
  t,
}: {
  selectedBranch: CodePaneGitBranchEntry | null;
  selectedCommit: CodePaneGitGraphCommit | null;
  selectedCommitDetails: CodePaneGitCommitDetails | null;
  comparedCommits: CodePaneGitCompareCommitsResult | null;
  selectedCommitOrder: string[];
  isCommitDetailsLoading: boolean;
  commitDetailsError: string | null;
  onCheckoutBranch: (config: { branchName: string; createBranch: boolean; startPoint?: string; preferExisting?: boolean }) => void | Promise<void>;
  onRequestRenameBranch: (branchName: string) => void | Promise<void>;
  onDeleteBranch: (branchName: string, force?: boolean) => void | Promise<void>;
  onCherryPick: (commitSha: string) => void | Promise<void>;
  onOpenCommitFileDiff: (config: {
    filePath: string;
    leftCommitSha?: string;
    rightCommitSha?: string;
    rightLabel?: string;
    leftLabel?: string;
  }) => void | Promise<void>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="space-y-3">
      {selectedBranch && (
        <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {t('codePane.gitBranchManager')}
              </div>
              <div className="mt-2 truncate text-sm font-medium text-zinc-100">{selectedBranch.name}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                <span>{selectedBranch.kind === 'local' ? t('codePane.gitLocalBranch') : t('codePane.gitRemoteBranch')}</span>
                <span>{selectedBranch.shortSha}</span>
                {selectedBranch.upstream && <span>{selectedBranch.upstream}</span>}
                <span>↑{selectedBranch.aheadCount} ↓{selectedBranch.behindCount}</span>
              </div>
            </div>
            {selectedBranch.current && (
              <span className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-200">
                {t('codePane.gitCurrentBranchBadge')}
              </span>
            )}
          </div>
          {selectedBranch.subject && (
            <div className="mt-3 rounded bg-zinc-950/50 px-2 py-1.5 text-xs text-zinc-400">
              {selectedBranch.subject}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!selectedBranch.current && selectedBranch.kind === 'local' && (
              <button
                type="button"
                onClick={() => {
                  void onCheckoutBranch({
                    branchName: selectedBranch.name,
                    createBranch: false,
                  });
                }}
                className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
              >
                {t('codePane.gitCheckout')}
              </button>
            )}
            {selectedBranch.kind === 'remote' && (
              <button
                type="button"
                onClick={() => {
                  const suggestedBranchName = selectedBranch.name.split('/').slice(1).join('/') || selectedBranch.name;
                  void onCheckoutBranch({
                    branchName: suggestedBranchName,
                    createBranch: true,
                    startPoint: selectedBranch.name,
                    preferExisting: true,
                  });
                }}
                className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
              >
                {t('codePane.gitCreateTrackingBranch')}
              </button>
            )}
            {selectedBranch.kind === 'local' && (
              <button
                type="button"
                onClick={() => {
                  void onRequestRenameBranch(selectedBranch.name);
                }}
                className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
              >
                <Pencil size={11} />
                {t('codePane.gitRenameBranch')}
              </button>
            )}
            {!selectedBranch.current && selectedBranch.kind === 'local' && (
              <button
                type="button"
                onClick={() => {
                  const forceDelete = !selectedBranch.mergedIntoCurrent;
                  void onDeleteBranch(selectedBranch.name, forceDelete);
                }}
                className="flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-200 transition-colors hover:bg-red-500/25"
              >
                <Trash2 size={11} />
                {t('codePane.gitDeleteBranch')}
              </button>
            )}
          </div>
        </div>
      )}

      {selectedCommit ? (
        <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {t('codePane.gitCommit')}
              </div>
              <div className="mt-2 text-sm font-medium text-zinc-100">{selectedCommit.subject || selectedCommit.shortSha}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                <span>{selectedCommit.author}</span>
                <span>{selectedCommit.shortSha}</span>
                <span>{formatTimestamp(selectedCommit.timestamp)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void onCherryPick(selectedCommit.sha);
              }}
              className="flex shrink-0 items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            >
              <GitCommitHorizontal size={11} />
              {t('codePane.gitCherryPick')}
            </button>
          </div>
          {selectedCommit.refs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCommit.refs.map((ref) => (
                <span key={`${selectedCommit.sha}-${ref}`} className={`rounded px-2 py-1 text-[11px] ${getRefClassName(ref)}`}>
                  {ref}
                </span>
              ))}
            </div>
          )}
          {selectedCommitDetails?.body && (
            <div className="mt-3 whitespace-pre-wrap rounded bg-zinc-950/60 px-2 py-2 text-xs text-zinc-400">
              {selectedCommitDetails.body}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-zinc-500">{t('codePane.gitCommitGraphEmpty')}</div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {comparedCommits ? t('codePane.gitCompareFiles') : t('codePane.gitCommitFiles')}
          </div>
          {selectedCommitOrder.length > 1 && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {selectedCommitOrder.map((sha) => sha.slice(0, 7)).join(' -> ')}
            </span>
          )}
        </div>
        {commitDetailsError ? (
          <div className="text-xs text-red-300">{commitDetailsError}</div>
        ) : isCommitDetailsLoading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.loading')}
          </div>
        ) : (
          <CommitFileList
            files={comparedCommits?.files ?? selectedCommitDetails?.files ?? []}
            comparedCommits={comparedCommits}
            selectedCommitDetails={selectedCommitDetails}
            onOpenDiff={onOpenCommitFileDiff}
            t={t}
          />
        )}
      </div>
    </div>
  );
});

const CommitFileList = React.memo(function CommitFileList({
  files,
  comparedCommits,
  selectedCommitDetails,
  onOpenDiff,
  t,
}: {
  files: CodePaneGitCommitFileChange[];
  comparedCommits: CodePaneGitCompareCommitsResult | null;
  selectedCommitDetails: CodePaneGitCommitDetails | null;
  onOpenDiff: (config: {
    filePath: string;
    leftCommitSha?: string;
    rightCommitSha?: string;
    rightLabel?: string;
    leftLabel?: string;
  }) => void | Promise<void>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  if (files.length === 0) {
    return (
      <div className="text-xs text-zinc-500">
        {comparedCommits ? t('codePane.gitCompareFilesEmpty') : t('codePane.gitCommitFilesEmpty')}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((file) => (
        <button
          key={`${file.path}:${file.previousPath ?? ''}`}
          type="button"
          onDoubleClick={() => {
            void onOpenDiff({
              filePath: file.path,
              leftCommitSha: comparedCommits?.baseCommitSha,
              rightCommitSha: comparedCommits?.targetCommitSha ?? selectedCommitDetails?.commitSha,
              leftLabel: comparedCommits?.baseCommitSha.slice(0, 7),
              rightLabel: (comparedCommits?.targetCommitSha ?? selectedCommitDetails?.commitSha)?.slice(0, 7),
            });
          }}
          className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-950/70 hover:text-zinc-100"
        >
          <span className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] ${getCommitFileStatusClassName(file.status)}`}>
            {getCommitFileStatusLabel(file.status)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-zinc-100">{file.relativePath}</div>
            {file.previousPath && (
              <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                {t('codePane.gitComparePreviousPath')}: {file.previousPath}
              </div>
            )}
          </div>
          <div className="shrink-0 text-[10px] text-zinc-500">
            +{file.additions} -{file.deletions}
          </div>
        </button>
      ))}
    </div>
  );
});

const RebasePlanRow = React.memo(function RebasePlanRow({
  entry,
  entryIndex,
  onMoveEntry,
  onChangeAction,
  t,
}: {
  entry: CodePaneGitRebasePlanEntry;
  entryIndex: number;
  onMoveEntry: (entryIndex: number, direction: -1 | 1) => void;
  onChangeAction: (entryIndex: number, action: CodePaneGitRebasePlanEntry['action']) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div
      className="grid h-8 grid-cols-[92px_minmax(0,1fr)_72px_72px] items-center gap-2 rounded px-2 text-xs text-zinc-300 hover:bg-zinc-900/70"
    >
      <select
        value={entry.action}
        onChange={(event) => {
          onChangeAction(entryIndex, event.target.value as CodePaneGitRebasePlanEntry['action']);
        }}
        className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-200 outline-none"
      >
        {(['pick', 'squash', 'fixup', 'drop'] as const).map((action) => (
          <option key={action} value={action}>
            {action}
          </option>
        ))}
      </select>
      <div className="min-w-0 truncate">
        <span className="mr-2 text-zinc-500">{entry.shortSha}</span>
        <span className="truncate">{entry.subject}</span>
      </div>
      <span className="truncate text-zinc-500">{entry.author}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            onMoveEntry(entryIndex, -1);
          }}
          className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
          aria-label={t('codePane.moveUp')}
        >
          <ArrowUp size={11} />
        </button>
        <button
          type="button"
          onClick={() => {
            onMoveEntry(entryIndex, 1);
          }}
          className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
          aria-label={t('codePane.moveDown')}
        >
          <ArrowDown size={11} />
        </button>
      </div>
    </div>
  );
});

const RebasePlanSection = React.memo(function RebasePlanSection({
  entries,
  isLoading,
  onMoveEntry,
  onChangeAction,
  t,
}: {
  entries: CodePaneGitRebasePlanEntry[];
  isLoading: boolean;
  onMoveEntry: (entryIndex: number, direction: -1 | 1) => void;
  onChangeAction: (entryIndex: number, action: CodePaneGitRebasePlanEntry['action']) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const { scrollRef, slice: visibleEntries, handleScroll } = useFixedWindowedList(
    entries,
    GIT_REBASE_ROW_HEIGHT,
  );
  const entryIndexByCommitSha = useMemo(() => new Map(
    entries.map((entry, index) => [entry.commitSha, index]),
  ), [entries]);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[92px_minmax(0,1fr)_72px_72px] gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] font-medium text-zinc-500">
        <span>{t('codePane.gitRebaseAction')}</span>
        <span>{t('codePane.gitCommit')}</span>
        <span>{t('codePane.gitAuthor')}</span>
        <span>{t('codePane.gitMove')}</span>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-2 py-2"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.loading')}
          </div>
        ) : entries.length > 0 ? (
          visibleEntries.isWindowed ? (
            <div style={{ height: `${visibleEntries.totalHeight}px`, position: 'relative' }}>
              <div style={{ transform: `translateY(${visibleEntries.offsetTop}px)` }}>
                {visibleEntries.items.map((entry) => {
                  const index = entryIndexByCommitSha.get(entry.commitSha) ?? -1;
                  return (
                    <RebasePlanRow
                      key={entry.commitSha}
                      entry={entry}
                      entryIndex={index}
                      onMoveEntry={onMoveEntry}
                      onChangeAction={onChangeAction}
                      t={t}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {entries.map((entry, index) => (
                <RebasePlanRow
                  key={entry.commitSha}
                  entry={entry}
                  entryIndex={index}
                  onMoveEntry={onMoveEntry}
                  onChangeAction={onChangeAction}
                  t={t}
                />
              ))}
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {t('codePane.gitRebasePlanEmpty')}
          </div>
        )}
      </div>
    </div>
  );
});

const GitRebaseDetails = React.memo(function GitRebaseDetails({
  branches,
  baseRef,
  hasMergeCommits,
  entryCount,
  isLoading,
  onChangeBaseRef,
  onRefreshRebase,
  onApplyRebasePlan,
  draftEntries,
  t,
}: {
  branches: string[];
  baseRef: string;
  hasMergeCommits: boolean;
  entryCount: number;
  isLoading: boolean;
  onChangeBaseRef: (baseRef: string) => void;
  onRefreshRebase: () => void | Promise<void>;
  onApplyRebasePlan: (baseRef: string, entries: CodePaneGitRebasePlanEntry[]) => void | Promise<void>;
  draftEntries: CodePaneGitRebasePlanEntry[];
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="space-y-3">
      <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {t('codePane.gitRebasePlanner')}
        </div>
        <label className="mb-2 block text-[11px] text-zinc-500">{t('codePane.gitRebaseBaseRef')}</label>
        <select
          value={baseRef}
          onChange={(event) => {
            onChangeBaseRef(event.target.value);
          }}
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none"
        >
          {branches.map((branchName) => (
            <option key={branchName} value={branchName}>
              {branchName}
            </option>
          ))}
        </select>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void onRefreshRebase();
            }}
            className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
          >
            <RefreshCw size={11} />
            {t('codePane.refresh')}
          </button>
          <button
            type="button"
            disabled={isLoading || !baseRef || draftEntries.length === 0 || hasMergeCommits}
            onClick={() => {
              void onApplyRebasePlan(baseRef, draftEntries);
            }}
            className="flex items-center gap-1 rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-200 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={11} />
            {t('codePane.gitApplyRebasePlan')}
          </button>
        </div>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
        <div>{t('codePane.gitRebaseCommitCount', { count: entryCount })}</div>
        {hasMergeCommits ? (
          <div className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-amber-200">
            {t('codePane.gitRebaseMergeWarning')}
          </div>
        ) : (
          <div className="mt-2 text-zinc-500">{t('codePane.gitRebaseHint')}</div>
        )}
      </div>
    </div>
  );
});

function buildBranchTree(
  branches: CodePaneGitBranchEntry[],
  keyPrefix: string,
  getSegments: (branch: CodePaneGitBranchEntry) => string[],
): BranchTreeNode[] {
  const rootNodes: BranchTreeNode[] = [];

  for (const branch of branches) {
    const segments = getSegments(branch).filter(Boolean);
    insertBranchTreeNode(rootNodes, segments.length > 0 ? segments : [branch.name], branch, keyPrefix, []);
  }

  return sortBranchTreeNodes(rootNodes);
}

function insertBranchTreeNode(
  nodes: BranchTreeNode[],
  segments: string[],
  branch: CodePaneGitBranchEntry,
  keyPrefix: string,
  parentSegments: string[],
): void {
  if (segments.length <= 1) {
    nodes.push({
      key: `${keyPrefix}:branch:${branch.name}`,
      kind: 'branch',
      label: segments[0] ?? branch.name,
      branch,
    });
    return;
  }

  const [folderLabel, ...restSegments] = segments;
  const folderPath = parentSegments.length > 0
    ? `${parentSegments.join('/')}/${folderLabel}`
    : folderLabel;
  let folderNode = nodes.find((node): node is Extract<BranchTreeNode, { kind: 'folder' }> => (
    node.kind === 'folder' && node.label === folderLabel
  ));

  if (!folderNode) {
    folderNode = {
      key: `${keyPrefix}:folder:${folderPath}`,
      kind: 'folder',
      label: folderLabel,
      children: [],
      branchCount: 0,
    };
    nodes.push(folderNode);
  }

  folderNode.branchCount += 1;
  insertBranchTreeNode(folderNode.children, restSegments, branch, keyPrefix, [...parentSegments, folderLabel]);
}

function sortBranchTreeNodes(nodes: BranchTreeNode[]): BranchTreeNode[] {
  const nextNodes = [...nodes];
  for (let index = 0; index < nextNodes.length; index += 1) {
    const node = nextNodes[index];
    if (node?.kind === 'folder') {
      nextNodes[index] = {
        ...node,
        children: sortBranchTreeNodes(node.children),
      };
    }
  }

  nextNodes.sort((leftNode, rightNode) => {
    if (leftNode.kind !== rightNode.kind) {
      return leftNode.kind === 'folder' ? -1 : 1;
    }

    if (leftNode.kind === 'branch' && rightNode.kind === 'branch') {
      if (leftNode.branch.current !== rightNode.branch.current) {
        return leftNode.branch.current ? -1 : 1;
      }
    }

    return leftNode.label.localeCompare(rightNode.label);
  });
  return nextNodes;
}

function flattenBranchTreeRows(
  nodes: BranchTreeNode[],
  collapsedNodeKeys: Set<string>,
  depth = 0,
): BranchTreeVisibleRow[] {
  const rows: BranchTreeVisibleRow[] = [];
  const stack: Array<{ node: BranchTreeNode; depth: number }> = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    stack.push({
      node: nodes[index]!,
      depth,
    });
  }

  while (stack.length > 0) {
    const nextRow = stack.pop()!;
    rows.push({
      key: nextRow.node.key,
      depth: nextRow.depth,
      node: nextRow.node,
    });

    if (nextRow.node.kind === 'folder' && !collapsedNodeKeys.has(nextRow.node.key)) {
      for (let index = nextRow.node.children.length - 1; index >= 0; index -= 1) {
        stack.push({
          node: nextRow.node.children[index]!,
          depth: nextRow.depth + 1,
        });
      }
    }
  }

  return rows;
}

function buildGitChangeWorkbenchGroups(
  changes: CodePaneGitStatusEntry[],
  getRelativePath: (filePath: string) => string,
): GitChangeWorkbenchSectionGroup[] {
  const sectionGroups = new Map<GitChangeSection, {
    count: number;
    directoryGroups: Map<string, GitChangeWorkbenchDirectoryGroup>;
  }>();
  const repositoryRootLabel = getRepositoryRootLabel();

  for (const entry of changes) {
    const relativePath = getRelativePath(entry.path) || getPathLeafLabel(entry.path) || entry.path;
    const directoryLabel = getDirectoryLabel(relativePath);

    for (const section of getGitEntrySections(entry)) {
      let sectionGroup = sectionGroups.get(section);
      if (!sectionGroup) {
        sectionGroup = {
          count: 0,
          directoryGroups: new Map<string, GitChangeWorkbenchDirectoryGroup>(),
        };
        sectionGroups.set(section, sectionGroup);
      }
      sectionGroup.count += 1;

      let directoryGroup = sectionGroup.directoryGroups.get(directoryLabel);
      if (!directoryGroup) {
        directoryGroup = {
          key: directoryLabel,
          label: directoryLabel,
          rows: [],
        };
        sectionGroup.directoryGroups.set(directoryLabel, directoryGroup);
      }

      directoryGroup.rows.push({
        key: `${section}:${entry.path}`,
        section,
        entry,
        relativePath,
        directoryLabel,
      });
    }
  }

  return GIT_CHANGE_SECTION_ORDER
    .map((section) => {
      const sectionGroup = sectionGroups.get(section);
      if (!sectionGroup) {
        return null;
      }

      const directoryGroups = Array.from(sectionGroup.directoryGroups.values());
      for (const directoryGroup of directoryGroups) {
        directoryGroup.rows.sort((left, right) => (
          left.relativePath.localeCompare(right.relativePath, undefined, { sensitivity: 'base' })
        ));
      }
      directoryGroups.sort((left, right) => {
        if (left.label === repositoryRootLabel && right.label !== repositoryRootLabel) {
          return -1;
        }

        if (right.label === repositoryRootLabel && left.label !== repositoryRootLabel) {
          return 1;
        }

        return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
      });

      return {
        section,
        count: sectionGroup.count,
        directoryGroups,
      };
    })
    .filter((sectionGroup): sectionGroup is GitChangeWorkbenchSectionGroup => Boolean(sectionGroup));
}

function getGitEntrySections(entry: CodePaneGitStatusEntry): GitChangeSection[] {
  if (entry.conflicted || entry.section === 'conflicted') {
    return ['conflicted'];
  }

  const sections: GitChangeSection[] = [];
  if (entry.staged || entry.section === 'staged') {
    sections.push('staged');
  }
  if (entry.unstaged || entry.section === 'unstaged') {
    sections.push('unstaged');
  }
  if (entry.status === 'untracked' || entry.section === 'untracked') {
    sections.push('untracked');
  }

  if (sections.length === 0) {
    sections.push(entry.status === 'untracked' ? 'untracked' : 'unstaged');
  }

  if (sections.length <= 1) {
    return sections;
  }

  const uniqueSections: GitChangeSection[] = [];
  for (const section of sections) {
    if (!uniqueSections.includes(section)) {
      uniqueSections.push(section);
    }
  }
  return uniqueSections;
}

function getDirectoryLabel(relativePath: string): string {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const separatorIndex = normalizedPath.lastIndexOf('/');
  return separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex) : getRepositoryRootLabel();
}

function getRepositoryRootLabel(): string {
  return '.';
}

function getGitSectionLabel(t: ReturnType<typeof useI18n>['t'], section: GitChangeSection): string {
  switch (section) {
    case 'conflicted':
      return t('codePane.gitSectionConflicted');
    case 'staged':
      return t('codePane.gitSectionStaged');
    case 'unstaged':
      return t('codePane.gitSectionUnstaged');
    case 'untracked':
      return t('codePane.gitSectionUntracked');
    default:
      return section;
  }
}

function getGitStatusTextClassName(status?: CodePaneGitStatusEntry['status']): string {
  switch (status) {
    case 'modified':
      return 'text-[rgb(var(--warning))]';
    case 'untracked':
    case 'added':
      return 'text-[rgb(var(--success))]';
    case 'deleted':
      return 'text-[rgb(var(--error))]';
    case 'renamed':
      return 'text-[rgb(var(--info))]';
    default:
      return '';
  }
}

function getGitStatusBadgeLabel(status?: CodePaneGitStatusEntry['status']): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'modified':
    default:
      return 'M';
  }
}

function getGitStatusBadgeClassName(status?: CodePaneGitStatusEntry['status']): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]';
    case 'deleted':
      return 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]';
    case 'renamed':
      return 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]';
    case 'modified':
    default:
      return 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]';
  }
}

function splitBranchPath(branchName: string): string[] {
  return branchName.split('/').filter(Boolean);
}

function toSegmentPath(segment: GitGraphLineSegment): string {
  const startX = getLaneCenter(segment.fromLane);
  const endX = getLaneCenter(segment.toLane);
  const startY = segment.fromY * GRAPH_ROW_HEIGHT;
  const endY = segment.toY * GRAPH_ROW_HEIGHT;

  if (segment.fromLane === segment.toLane) {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  const controlY = startY + ((endY - startY) * 0.5);
  return `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`;
}

function getLaneCenter(lane: number): number {
  return (lane * GRAPH_LANE_WIDTH) + (GRAPH_LANE_WIDTH / 2);
}

function getGraphColor(colorIndex: number): string {
  return GIT_GRAPH_COLORS[colorIndex % GIT_GRAPH_COLORS.length];
}

function getRefClassName(ref: string): string {
  if (ref.startsWith('HEAD ->')) {
    return 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]';
  }

  if (ref.startsWith('origin/')) {
    return 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]';
  }

  if (ref.startsWith('tag:')) {
    return 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]';
  }

  return 'bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))]';
}

function getCommitFileStatusLabel(status: CodePaneGitCommitFileChange['status']): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'type-changed':
      return 'T';
    case 'modified':
    default:
      return 'M';
  }
}

function getCommitFileStatusClassName(status: CodePaneGitCommitFileChange['status']): string {
  switch (status) {
    case 'added':
      return 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]';
    case 'deleted':
      return 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]';
    case 'renamed':
    case 'copied':
      return 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]';
    case 'type-changed':
      return 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]';
    case 'modified':
    default:
      return 'bg-[rgb(var(--secondary))] text-[rgb(var(--muted-foreground))]';
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}
