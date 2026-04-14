import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
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
  CodePaneGitGraphCommit,
  CodePaneGitRebasePlanEntry,
  CodePaneGitRebasePlanResult,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

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
  onSelectBranch: (branchName: string) => void;
  onSelectCommit: (commitSha: string) => void;
  onChangeRebaseBaseRef: (baseRef: string) => void;
  onRefresh: () => void | Promise<void>;
  onRefreshRebase: () => void | Promise<void>;
  onCheckoutBranch: (config: { branchName: string; createBranch: boolean; startPoint?: string }) => void | Promise<void>;
  onRenameBranch: (branchName: string, nextBranchName: string) => void | Promise<void>;
  onDeleteBranch: (branchName: string, force?: boolean) => void | Promise<void>;
  onCherryPick: (commitSha: string) => void | Promise<void>;
  onApplyRebasePlan: (baseRef: string, entries: CodePaneGitRebasePlanEntry[]) => void | Promise<void>;
  onClose: () => void;
}

const GIT_LANE_COLORS = [
  '#60a5fa',
  '#34d399',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#f87171',
] as const;

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
  onSelectBranch,
  onSelectCommit,
  onChangeRebaseBaseRef,
  onRefresh,
  onRefreshRebase,
  onCheckoutBranch,
  onRenameBranch,
  onDeleteBranch,
  onCherryPick,
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
    () => branches.filter((branch) => branch.kind === 'local' && !branch.current),
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
    <div className="flex h-80 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
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
                    ? 'bg-zinc-700 text-zinc-100'
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

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden">
        <div className="min-h-0 border-r border-zinc-800">
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

        <div className="min-h-0 border-r border-zinc-800">
          {activeTab === 'log' ? (
            <CommitLogSection
              commits={commits}
              selectedCommitSha={selectedCommit?.sha ?? null}
              onSelectCommit={onSelectCommit}
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
              onCheckoutBranch={onCheckoutBranch}
              onRenameBranch={onRenameBranch}
              onDeleteBranch={onDeleteBranch}
              onCherryPick={onCherryPick}
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
  const renderBranchRow = (branch: CodePaneGitBranchEntry) => {
    const isSelected = branch.name === selectedBranchName;
    return (
      <button
        key={branch.name}
        type="button"
        onClick={() => {
          onSelectBranch(branch.name);
        }}
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
          isSelected
            ? 'bg-sky-500/15 text-sky-100'
            : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
        }`}
      >
        <GitBranch size={12} className="shrink-0 text-zinc-500" />
        <span className="min-w-0 flex-1 truncate">{branch.name}</span>
        {branch.current && (
          <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[10px] text-emerald-200">
            HEAD
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {t('codePane.gitBranchManager')}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.loading')}
          </div>
        ) : (
          <div className="space-y-3">
            <BranchGroup title={t('codePane.gitCurrentBranchGroup')}>
              {currentBranches.map(renderBranchRow)}
            </BranchGroup>
            <BranchGroup title={t('codePane.gitLocalBranches')}>
              {localBranches.map(renderBranchRow)}
            </BranchGroup>
            <BranchGroup title={t('codePane.gitRemoteBranches')}>
              {remoteBranches.map(renderBranchRow)}
            </BranchGroup>
          </div>
        )}
      </div>
    </div>
  );
}

function BranchGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 px-2 text-[11px] font-medium text-zinc-500">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CommitLogSection({
  commits,
  selectedCommitSha,
  onSelectCommit,
  t,
}: {
  commits: CodePaneGitGraphCommit[];
  selectedCommitSha: string | null;
  onSelectCommit: (commitSha: string) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_120px_140px] gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] font-medium text-zinc-500">
        <span>{t('codePane.gitGraph')}</span>
        <span>{t('codePane.gitCommit')}</span>
        <span>{t('codePane.gitAuthor')}</span>
        <span>{t('codePane.gitDate')}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {commits.length > 0 ? (
          <div className="space-y-0.5">
            {commits.map((commit) => {
              const isSelected = commit.sha === selectedCommitSha;
              return (
                <button
                  key={commit.sha}
                  type="button"
                  onClick={() => {
                    onSelectCommit(commit.sha);
                  }}
                  className={`grid w-full grid-cols-[72px_minmax(0,1fr)_120px_140px] items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-sky-500/15 text-sky-100'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                  }`}
                >
                  <GitLanePreview commit={commit} />
                  <div className="min-w-0 truncate">
                    <span className="truncate">{commit.subject || commit.shortSha}</span>
                    {commit.refs.length > 0 && (
                      <span className="ml-2 truncate text-[10px] text-zinc-500">{commit.refs.join(' · ')}</span>
                    )}
                  </div>
                  <span className="truncate text-zinc-400">{commit.author}</span>
                  <span className="truncate text-zinc-500">{new Date(commit.timestamp * 1000).toLocaleString()}</span>
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

function GitLanePreview({ commit }: { commit: CodePaneGitGraphCommit }) {
  return (
    <div className="flex h-5 items-center">
      {Array.from({ length: Math.max(commit.laneCount, 1) }).map((_, laneIndex) => {
        const laneColor = GIT_LANE_COLORS[laneIndex % GIT_LANE_COLORS.length];
        const isActiveLane = laneIndex === commit.lane;
        return (
          <div key={`${commit.sha}-${laneIndex}`} className="relative flex h-5 w-3 items-center justify-center">
            <span
              className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
              style={{ backgroundColor: laneColor, opacity: isActiveLane ? 0.8 : 0.35 }}
            />
            {isActiveLane && (
              <span
                className="relative z-10 h-2.5 w-2.5 rounded-full border border-zinc-950"
                style={{ backgroundColor: laneColor }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GitWorkbenchDetails({
  selectedBranch,
  selectedCommit,
  onCheckoutBranch,
  onRenameBranch,
  onDeleteBranch,
  onCherryPick,
  t,
}: {
  selectedBranch: CodePaneGitBranchEntry | null;
  selectedCommit: CodePaneGitGraphCommit | null;
  onCheckoutBranch: (config: { branchName: string; createBranch: boolean; startPoint?: string }) => void | Promise<void>;
  onRenameBranch: (branchName: string, nextBranchName: string) => void | Promise<void>;
  onDeleteBranch: (branchName: string, force?: boolean) => void | Promise<void>;
  onCherryPick: (commitSha: string) => void | Promise<void>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="space-y-3">
      {selectedBranch && (
        <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-100">{selectedBranch.name}</div>
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
          {selectedBranch.subject && (
            <div className="mt-3 rounded bg-zinc-950/50 px-2 py-1.5 text-xs text-zinc-400">
              {selectedBranch.subject}
            </div>
          )}
        </div>
      )}

      {selectedCommit ? (
        <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-100">{selectedCommit.subject || selectedCommit.shortSha}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                <span>{selectedCommit.author}</span>
                <span>{selectedCommit.shortSha}</span>
                <span>{new Date(selectedCommit.timestamp * 1000).toLocaleString()}</span>
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
                <span key={`${selectedCommit.sha}-${ref}`} className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-zinc-500">{t('codePane.gitCommitGraphEmpty')}</div>
      )}
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
