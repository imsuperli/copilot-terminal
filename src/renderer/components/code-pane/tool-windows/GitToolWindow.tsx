import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
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
  CodePaneGitGraphCommit,
  CodePaneGitRebasePlanEntry,
  CodePaneGitRebasePlanResult,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';
import { buildGitGraphLayout, type GitGraphLineSegment, type GitGraphRowLayout } from '../../../utils/gitGraphLayout';

type GitToolWindowTab = 'log' | 'rebase';

interface GitToolWindowProps {
  branches: CodePaneGitBranchEntry[];
  selectedBranchName: string | null;
  commits: CodePaneGitGraphCommit[];
  selectedCommitSha: string | null;
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
  onChangeRebaseBaseRef: (baseRef: string) => void;
  onRefresh: () => void | Promise<void>;
  onRefreshRebase: () => void | Promise<void>;
  onCheckoutBranch: (config: { branchName: string; createBranch: boolean; startPoint?: string }) => void | Promise<void>;
  onRenameBranch: (branchName: string, nextBranchName: string) => void | Promise<void>;
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

export function GitToolWindow({
  branches,
  selectedBranchName,
  commits,
  selectedCommitSha,
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
  onChangeRebaseBaseRef,
  onRefresh,
  onRefreshRebase,
  onCheckoutBranch,
  onRenameBranch,
  onDeleteBranch,
  onCherryPick,
  onCompareSelectedCommits,
  onOpenCommitFileDiff,
  onApplyRebasePlan,
  onClose,
}: GitToolWindowProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<GitToolWindowTab>('log');
  const [draftEntries, setDraftEntries] = useState<CodePaneGitRebasePlanEntry[]>([]);

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

  const moveDraftEntry = (entryIndex: number, direction: -1 | 1) => {
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
  };

  const updateDraftAction = (
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
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950/95">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            <GitBranch size={12} className="text-sky-300" />
            {t('codePane.gitWorkbenchTab')}
          </div>
          <div className="flex rounded bg-zinc-900/80 p-0.5">
            {([
              ['log', t('codePane.gitLogTab')],
              ['rebase', t('codePane.gitRebasePlanner')],
            ] as const).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                onClick={() => {
                  setActiveTab(tabId);
                }}
                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                  activeTab === tabId
                    ? 'bg-sky-500/20 text-sky-100'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
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
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
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

      {(branchesError || (activeTab === 'rebase' ? rebaseError : null)) && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {branchesError || rebaseError}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_340px] overflow-hidden">
        <div className="min-h-0 border-r border-zinc-800 bg-zinc-950/70">
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

        <div className="min-h-0 border-r border-zinc-800 bg-zinc-950/40">
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
              onRenameBranch={onRenameBranch}
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
    </div>
  );
}

function BranchListSection({
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
  const sections = useMemo<BranchTreeSection[]>(() => {
    const headNodes = currentBranches.map((branch) => ({
      key: `head:branch:${branch.name}`,
      kind: 'branch',
      label: branch.shortName || branch.name,
      branch,
    } satisfies BranchTreeNode));
    const localNodes = buildBranchTree(localBranches, 'local', (branch) => splitBranchPath(branch.shortName || branch.name));
    const remoteNodes = buildBranchTree(remoteBranches, 'remote', (branch) => {
      const [remoteName, ...restPath] = splitBranchPath(branch.shortName || branch.name);
      return [remoteName || branch.name, ...restPath];
    });

    return [
      {
        key: 'head',
        label: t('codePane.gitCurrentBranchGroup'),
        count: headNodes.length,
        nodes: headNodes,
      },
      {
        key: 'local',
        label: t('codePane.gitLocalBranches'),
        count: localBranches.length,
        nodes: localNodes,
      },
      {
        key: 'remote',
        label: t('codePane.gitRemoteBranches'),
        count: remoteBranches.length,
        nodes: remoteNodes,
      },
    ].filter((section) => section.count > 0);
  }, [currentBranches, localBranches, remoteBranches, t]);

  const toggleNode = (nodeKey: string) => {
    setCollapsedNodeKeys((currentKeys) => (
      currentKeys.includes(nodeKey)
        ? currentKeys.filter((key) => key !== nodeKey)
        : [...currentKeys, nodeKey]
    ));
  };

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
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.loading')}
          </div>
        ) : sections.length > 0 ? (
          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="mb-1 flex items-center justify-between gap-2 px-2 text-[11px] font-medium text-zinc-500">
                  <span>{section.label}</span>
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">{section.count}</span>
                </div>
                <div className="space-y-0.5">
                  {section.nodes.map((node) => (
                    <BranchTreeRow
                      key={node.key}
                      node={node}
                      depth={0}
                      selectedBranchName={selectedBranchName}
                      collapsedNodeKeys={collapsedNodeKeys}
                      onToggleNode={toggleNode}
                      onSelectBranch={onSelectBranch}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {t('codePane.gitCommitGraphEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}

function BranchTreeRow({
  node,
  depth,
  selectedBranchName,
  collapsedNodeKeys,
  onToggleNode,
  onSelectBranch,
}: {
  node: BranchTreeNode;
  depth: number;
  selectedBranchName: string | null;
  collapsedNodeKeys: string[];
  onToggleNode: (nodeKey: string) => void;
  onSelectBranch: (branchName: string) => void;
}) {
  if (node.kind === 'folder') {
    const isCollapsed = collapsedNodeKeys.includes(node.key);
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            onToggleNode(node.key);
          }}
          className="flex w-full items-center gap-2 rounded py-1 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
          style={{ paddingLeft: `${10 + (depth * 14)}px`, paddingRight: '8px' }}
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <FolderTree size={12} className="shrink-0 text-zinc-500" />
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
          <span className="rounded bg-zinc-900 px-1 py-0.5 text-[10px] text-zinc-500">
            {node.branchCount}
          </span>
        </button>
        {!isCollapsed && (
          <div className="space-y-0.5">
            {node.children.map((childNode) => (
              <BranchTreeRow
                key={childNode.key}
                node={childNode}
                depth={depth + 1}
                selectedBranchName={selectedBranchName}
                collapsedNodeKeys={collapsedNodeKeys}
                onToggleNode={onToggleNode}
                onSelectBranch={onSelectBranch}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = node.branch.name === selectedBranchName;
  return (
    <button
      type="button"
      onClick={() => {
        onSelectBranch(node.branch.name);
      }}
      className={`flex w-full items-center gap-2 rounded py-1 text-left text-xs transition-colors ${
        isSelected
          ? 'bg-sky-500/15 text-sky-100'
          : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
      }`}
      style={{ paddingLeft: `${28 + (depth * 14)}px`, paddingRight: '8px' }}
    >
      <GitBranch size={12} className={`shrink-0 ${node.branch.current ? 'text-emerald-300' : 'text-zinc-500'}`} />
      <span className="min-w-0 flex-1 truncate">{node.label}</span>
      <span className="truncate text-[10px] text-zinc-500">{node.branch.shortSha}</span>
      {node.branch.current && (
        <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[10px] text-emerald-200">
          HEAD
        </span>
      )}
    </button>
  );
}

function CommitLogSection({
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
  const selectedCommitSet = useMemo(() => new Set(selectedCommitOrder), [selectedCommitOrder]);

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
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {layout.rows.length > 0 ? (
          <div className="space-y-0.5">
            {layout.rows.map((row) => {
              const isSelected = row.commit.sha === selectedCommitSha;
              const isCompared = selectedCommitSet.has(row.commit.sha);
              const visibleRefs = row.commit.refs.slice(0, 3);
              return (
                <button
                  key={row.commit.sha}
                  type="button"
                  onClick={(event) => {
                    onSelectCommit(row.commit.sha, {
                      metaKey: event.metaKey,
                      ctrlKey: event.ctrlKey,
                    });
                  }}
                  className={`grid w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
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
                        {selectedCommitOrder.indexOf(row.commit.sha) + 1}
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
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {t('codePane.gitCommitGraphEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}

function GitCommitGraphCell({
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
}

function GitWorkbenchDetails({
  selectedBranch,
  selectedCommit,
  selectedCommitDetails,
  comparedCommits,
  selectedCommitOrder,
  isCommitDetailsLoading,
  commitDetailsError,
  onCheckoutBranch,
  onRenameBranch,
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
  onCheckoutBranch: (config: { branchName: string; createBranch: boolean; startPoint?: string }) => void | Promise<void>;
  onRenameBranch: (branchName: string, nextBranchName: string) => void | Promise<void>;
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
                  const nextBranchName = window.prompt(t('codePane.gitRenameBranchPrompt'), selectedBranch.name)?.trim();
                  if (nextBranchName && nextBranchName !== selectedBranch.name) {
                    void onRenameBranch(selectedBranch.name, nextBranchName);
                  }
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
                  const confirmed = window.confirm(
                    forceDelete
                      ? t('codePane.gitDeleteBranchForcePrompt', { branch: selectedBranch.name })
                      : t('codePane.gitDeleteBranchPrompt', { branch: selectedBranch.name }),
                  );
                  if (confirmed) {
                    void onDeleteBranch(selectedBranch.name, forceDelete);
                  }
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
}

function CommitFileList({
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
}

function RebasePlanSection({
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
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[92px_minmax(0,1fr)_72px_72px] gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] font-medium text-zinc-500">
        <span>{t('codePane.gitRebaseAction')}</span>
        <span>{t('codePane.gitCommit')}</span>
        <span>{t('codePane.gitAuthor')}</span>
        <span>{t('codePane.gitMove')}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.loading')}
          </div>
        ) : entries.length > 0 ? (
          <div className="space-y-0.5">
            {entries.map((entry, index) => (
              <div
                key={entry.commitSha}
                className="grid grid-cols-[92px_minmax(0,1fr)_72px_72px] items-center gap-2 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900/70"
              >
                <select
                  value={entry.action}
                  onChange={(event) => {
                    onChangeAction(index, event.target.value as CodePaneGitRebasePlanEntry['action']);
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
                      onMoveEntry(index, -1);
                    }}
                    className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
                    aria-label={t('codePane.moveUp')}
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onMoveEntry(index, 1);
                    }}
                    className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
                    aria-label={t('codePane.moveDown')}
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            {t('codePane.gitRebasePlanEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}

function GitRebaseDetails({
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
}

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
  const folderPath = [...parentSegments, folderLabel];
  let folderNode = nodes.find((node): node is Extract<BranchTreeNode, { kind: 'folder' }> => (
    node.kind === 'folder' && node.label === folderLabel
  ));

  if (!folderNode) {
    folderNode = {
      key: `${keyPrefix}:folder:${folderPath.join('/')}`,
      kind: 'folder',
      label: folderLabel,
      children: [],
      branchCount: 0,
    };
    nodes.push(folderNode);
  }

  insertBranchTreeNode(folderNode.children, restSegments, branch, keyPrefix, folderPath);
  folderNode.branchCount = countBranchNodes(folderNode.children);
}

function sortBranchTreeNodes(nodes: BranchTreeNode[]): BranchTreeNode[] {
  return [...nodes]
    .map((node) => (
      node.kind === 'folder'
        ? {
          ...node,
          children: sortBranchTreeNodes(node.children),
          branchCount: countBranchNodes(node.children),
        }
        : node
    ))
    .sort((leftNode, rightNode) => {
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
}

function countBranchNodes(nodes: BranchTreeNode[]): number {
  return nodes.reduce((count, node) => (
    count + (node.kind === 'folder' ? countBranchNodes(node.children) : 1)
  ), 0);
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
    return 'bg-emerald-500/15 text-emerald-200';
  }

  if (ref.startsWith('origin/')) {
    return 'bg-sky-500/15 text-sky-200';
  }

  if (ref.startsWith('tag:')) {
    return 'bg-amber-500/15 text-amber-200';
  }

  return 'bg-zinc-800 text-zinc-300';
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
      return 'bg-emerald-500/15 text-emerald-200';
    case 'deleted':
      return 'bg-red-500/15 text-red-200';
    case 'renamed':
    case 'copied':
      return 'bg-sky-500/15 text-sky-200';
    case 'type-changed':
      return 'bg-amber-500/15 text-amber-200';
    case 'modified':
    default:
      return 'bg-zinc-800 text-zinc-300';
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}
