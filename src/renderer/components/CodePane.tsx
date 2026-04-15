import React, {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  GitCompareArrows,
  GripHorizontal,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pin,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import type {
  CodePaneOpenFile,
  CodePaneSavePipelineState,
  CodePaneSaveQualityState,
  CodePaneSaveQualityStep,
  Pane,
} from '../types/window';
import type {
  CodePaneBreakpoint,
  CodePaneCallHierarchyDirection,
  CodePaneCodeAction,
  CodePaneDiagnostic,
  CodePaneContentMatch,
  CodePaneExceptionBreakpoint,
  CodePaneDocumentSymbol,
  CodePaneDebugSession,
  CodePaneDebugSessionChangedPayload,
  CodePaneDebugSessionDetails,
  CodePaneDebugSessionOutputPayload,
  CodePaneDebugStackFrame,
  CodePaneExternalLibrarySection,
  CodePaneGitDiffHunk,
  CodePaneGitBranchEntry,
  CodePaneGitGraphCommit,
  CodePaneGitBlameLine,
  CodePaneGitConflictDetails,
  CodePaneGitHistoryResult,
  CodePaneGitRebasePlanEntry,
  CodePaneGitRebasePlanResult,
  CodePaneGitRepositorySummary,
  CodePaneHoverResult,
  CodePaneFsChangedPayload,
  CodePaneGitStatusEntry,
  CodePaneHierarchyItem,
  CodePaneHierarchyResult,
  CodePaneIndexProgressPayload,
  CodePaneLanguageWorkspaceChangedPayload,
  CodePaneLanguageWorkspaceState,
  CodePaneLocation,
  CodePaneProjectContribution,
  CodePaneReadFileResult,
  CodePaneReference,
  CodePaneRunSession,
  CodePaneRunSessionChangedPayload,
  CodePaneRunSessionOutputPayload,
  CodePaneRunTarget,
  CodePanePreviewChangeSet,
  CodePaneSemanticTokensLegend,
  CodePaneSemanticTokensResult,
  CodePaneTextEdit,
  CodePaneTestItem,
  CodePaneTreeEntry,
  CodePaneTypeHierarchyDirection,
  CodePaneWorkspaceSymbol,
} from '../../shared/types/electron-api';
import {
  CODE_PANE_BINARY_FILE_ERROR_CODE,
  CODE_PANE_FILE_TOO_LARGE_ERROR_CODE,
  CODE_PANE_SAVE_CONFLICT_ERROR_CODE,
} from '../../shared/types/electron-api';
import { AppTooltip } from './ui/AppTooltip';
import { BreadcrumbsBar, type CodePaneBreadcrumbItem } from './code-pane/BreadcrumbsBar';
import { DebugToolWindow } from './code-pane/tool-windows/DebugToolWindow';
import { ConflictResolutionToolWindow } from './code-pane/tool-windows/ConflictResolutionToolWindow';
import { GitHistoryToolWindow } from './code-pane/tool-windows/GitHistoryToolWindow';
import {
  HierarchyToolWindow,
  type HierarchyMode,
  type HierarchyTreeNode,
} from './code-pane/tool-windows/HierarchyToolWindow';
import { PerformanceToolWindow } from './code-pane/tool-windows/PerformanceToolWindow';
import { ProjectToolWindow } from './code-pane/tool-windows/ProjectToolWindow';
import { QuickDocumentationPanel } from './code-pane/QuickDocumentationPanel';
import { RefactorPreviewToolWindow } from './code-pane/tool-windows/RefactorPreviewToolWindow';
import { RunToolWindow } from './code-pane/tool-windows/RunToolWindow';
import {
  SemanticToolWindow,
  type SemanticTokenSummaryEntry,
} from './code-pane/tool-windows/SemanticToolWindow';
import { TestsToolWindow } from './code-pane/tool-windows/TestsToolWindow';
import { WorkspaceToolWindow } from './code-pane/tool-windows/WorkspaceToolWindow';
import { BlameGutter } from './code-pane/scm/BlameGutter';
import { CommitComposer } from './code-pane/scm/CommitComposer';
import { GitHunkList } from './code-pane/scm/GitHunkList';
import { GitToolWindow } from './code-pane/tool-windows/GitToolWindow';
import { useI18n } from '../i18n';
import { preventMouseButtonFocus } from '../utils/buttonFocus';
import { useWindowStore } from '../stores/windowStore';
import { ensureMonacoEnvironment } from '../utils/monacoEnvironment';
import {
  ensureMonacoLanguageBridge,
  type MonacoLanguageBridge,
} from '../services/code/MonacoLanguageBridge';
import { CodePaneRuntimeStore } from '../stores/codePaneRuntimeStore';
import { getPathLeafLabel } from '../utils/pathDisplay';

type MonacoModule = typeof import('monaco-editor');
type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type MonacoDiffEditor = import('monaco-editor').editor.IStandaloneDiffEditor;
type MonacoModel = import('monaco-editor').editor.ITextModel;
type MonacoDisposable = import('monaco-editor').IDisposable;
type MonacoViewState = import('monaco-editor').editor.ICodeEditorViewState | null;
type MonacoMarker = import('monaco-editor').editor.IMarker;
type MonacoRange = import('monaco-editor').IRange;
type SidebarMode = 'files' | 'search' | 'scm' | 'problems';
type SearchEverywhereMode = 'all' | 'commands' | 'recent';
type BottomPanelMode =
  | 'run'
  | 'debug'
  | 'tests'
  | 'project'
  | 'git'
  | 'conflict'
  | 'preview'
  | 'history'
  | 'workspace'
  | 'performance'
  | 'hierarchy'
  | 'semantic';

const CODE_PANE_SIDEBAR_DEFAULT_WIDTH = 300;
const CODE_PANE_SIDEBAR_MIN_WIDTH = 220;
const CODE_PANE_SIDEBAR_MAX_WIDTH = 520;
const CODE_PANE_EDITOR_SPLIT_DEFAULT_SIZE = 0.5;
const CODE_PANE_EDITOR_SPLIT_MIN_SIZE = 0.3;
const CODE_PANE_EDITOR_SPLIT_MAX_SIZE = 0.7;
const CODE_PANE_BOTTOM_PANEL_DEFAULT_HEIGHT = 320;
const CODE_PANE_BOTTOM_PANEL_MIN_HEIGHT = 180;
const CODE_PANE_BOTTOM_PANEL_MAX_HEIGHT = 680;
const CODE_PANE_TOP_REGION_MIN_HEIGHT = 180;
const CODE_PANE_STATUS_BAR_RESERVED_HEIGHT = 40;
const CODE_PANE_MAX_RECENT_FILES = 20;
const CODE_PANE_MAX_RECENT_LOCATIONS = 30;
const CODE_PANE_MAX_NAVIGATION_HISTORY = 50;
const CODE_PANE_MAX_LOCAL_HISTORY_PER_FILE = 12;
const CODE_PANE_MAX_LOCAL_HISTORY_CONTENT_SIZE = 200_000;
const CODE_PANE_LOCAL_HISTORY_CHANGE_DEBOUNCE_MS = 2500;
const CODE_PANE_TODO_TOKENS = ['TODO', 'FIXME', 'XXX'] as const;
const CODE_PANE_SEARCH_CACHE_TTL_MS = 10_000;
const CODE_PANE_SAVE_QUALITY_LINT_MARKER_OWNER = 'save-quality-linter';
const CODE_PANE_DEFAULT_EXCEPTION_BREAKPOINTS: CodePaneExceptionBreakpoint[] = [{
  id: 'all',
  label: 'All Exceptions',
  enabled: false,
}];

type FileNavigationLocation = {
  filePath: string;
  lineNumber: number;
  column: number;
  content?: string;
  language?: string;
  readOnly?: boolean;
  displayPath?: string;
  documentUri?: string;
};

type BannerState = {
  tone: 'warning' | 'error' | 'info';
  message: string;
  filePath?: string;
  showReload?: boolean;
  showOverwrite?: boolean;
};

type FileRuntimeMeta = {
  language: string;
  mtimeMs: number;
  size: number;
  lastSavedAt?: number;
  readOnly?: boolean;
  displayPath?: string;
  documentUri?: string;
};

type NavigationHistoryEntry = {
  filePath: string;
  lineNumber: number;
  column: number;
  displayPath?: string;
};

type SearchEverywhereItem = {
  id: string;
  section: string;
  title: string;
  subtitle?: string;
  meta?: string;
  execute: () => void | Promise<void>;
};

type CodePaneFsChange = CodePaneFsChangedPayload['changes'][number];
type CodePaneIndexStatus = CodePaneIndexProgressPayload;
type DefinitionLookupResult = {
  location: CodePaneLocation | null;
  error?: string;
};
type GitChangeSection = 'conflicted' | 'staged' | 'unstaged' | 'untracked';
type GitChangeTreeNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  entry?: CodePaneGitStatusEntry;
  children?: GitChangeTreeNode[];
};
type GitChangeSectionGroup = {
  section: GitChangeSection;
  count: number;
  roots: GitChangeTreeNode[];
};

type DebugEvaluationEntry = {
  id: string;
  expression: string;
  value: string;
};

type DebugWatchEntry = {
  id: string;
  expression: string;
  value?: string;
  error?: string;
};

type EditorTarget = 'editor' | 'secondary' | 'diff';
type CodePaneTodoItem = CodePaneContentMatch & {
  token: typeof CODE_PANE_TODO_TOKENS[number];
};
type LocalHistoryEntry = {
  id: string;
  filePath: string;
  label: string;
  reason: 'open' | 'draft' | 'save' | 'restore';
  timestamp: number;
  content: string;
  preview: string;
};

type EditorActionMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  active?: boolean;
  onSelect: () => void;
};

type ToolWindowLauncher = {
  id: string;
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
};

type SaveFileOptions = {
  overwrite?: boolean;
  skipQualityPipeline?: boolean;
};

const GIT_CHANGE_SECTION_ORDER: GitChangeSection[] = ['conflicted', 'staged', 'unstaged', 'untracked'];

export interface CodePaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isVirtualDocumentPath(pathValue: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(pathValue) && !pathValue.toLowerCase().startsWith('file://');
}

function createFallbackRange(lineNumber: number, column: number): MonacoRange {
  return {
    startLineNumber: lineNumber,
    startColumn: column,
    endLineNumber: lineNumber,
    endColumn: column + 1,
  };
}

function normalizeSidebarMode(mode: string | undefined): SidebarMode {
  switch (mode) {
    case 'search':
    case 'scm':
    case 'problems':
      return mode;
    case 'files':
    default:
      return 'files';
  }
}

function getBreakpointKey(breakpoint: CodePaneBreakpoint): string {
  return `${normalizePath(breakpoint.filePath)}:${breakpoint.lineNumber}`;
}

function normalizeBreakpoint(
  breakpoint: Partial<CodePaneBreakpoint> & {
    filePath: string;
    lineNumber: number;
  },
): CodePaneBreakpoint {
  const normalizedBreakpoint: CodePaneBreakpoint = {
    filePath: normalizePath(breakpoint.filePath),
    lineNumber: Math.max(1, Math.round(breakpoint.lineNumber)),
  };

  if (typeof breakpoint.id === 'string' && breakpoint.id.trim().length > 0) {
    normalizedBreakpoint.id = breakpoint.id.trim();
  }
  if (breakpoint.condition?.trim()) {
    normalizedBreakpoint.condition = breakpoint.condition.trim();
  }
  if (breakpoint.logMessage?.trim()) {
    normalizedBreakpoint.logMessage = breakpoint.logMessage.trim();
  }
  if (breakpoint.enabled === false) {
    normalizedBreakpoint.enabled = false;
  }

  return normalizedBreakpoint;
}

function normalizeBreakpoints(
  breakpoints: Array<{
    filePath: string;
    lineNumber: number;
    condition?: string;
    logMessage?: string;
    enabled?: boolean;
  }> | undefined | null,
): CodePaneBreakpoint[] {
  const normalizedBreakpoints: CodePaneBreakpoint[] = [];
  const seenKeys = new Set<string>();

  for (const breakpoint of breakpoints ?? []) {
    if (!breakpoint?.filePath || !Number.isFinite(breakpoint.lineNumber)) {
      continue;
    }

    const normalizedBreakpoint = normalizeBreakpoint(breakpoint);
    const breakpointKey = getBreakpointKey(normalizedBreakpoint);
    if (seenKeys.has(breakpointKey)) {
      continue;
    }

    seenKeys.add(breakpointKey);
    normalizedBreakpoints.push(normalizedBreakpoint);
  }

  return normalizedBreakpoints.sort((left, right) => {
    const pathOrder = left.filePath.localeCompare(right.filePath);
    return pathOrder !== 0 ? pathOrder : left.lineNumber - right.lineNumber;
  });
}

function normalizeExceptionBreakpoints(
  breakpoints: Array<{
    id: 'all';
    enabled: boolean;
    label?: string;
  }> | undefined | null,
): CodePaneExceptionBreakpoint[] {
  const allBreakpoint = breakpoints?.find((breakpoint) => breakpoint.id === 'all');
  return [{
    id: 'all',
    label: allBreakpoint?.label ?? CODE_PANE_DEFAULT_EXCEPTION_BREAKPOINTS[0].label,
    enabled: allBreakpoint?.enabled === true,
  }];
}

function normalizeWatchExpressions(watchExpressions: string[] | undefined | null): string[] {
  const normalizedExpressions: string[] = [];
  const seenExpressions = new Set<string>();

  for (const watchExpression of watchExpressions ?? []) {
    const normalizedExpression = watchExpression.trim();
    if (!normalizedExpression || seenExpressions.has(normalizedExpression)) {
      continue;
    }

    seenExpressions.add(normalizedExpression);
    normalizedExpressions.push(normalizedExpression);
  }

  return normalizedExpressions;
}

function getBreakpointGlyphClassName(breakpoint: CodePaneBreakpoint): string {
  if (breakpoint.enabled === false) {
    return 'code-pane-breakpoint-glyph code-pane-breakpoint-glyph-disabled';
  }
  if (breakpoint.logMessage?.trim()) {
    return 'code-pane-breakpoint-glyph code-pane-breakpoint-glyph-log';
  }
  if (breakpoint.condition?.trim()) {
    return 'code-pane-breakpoint-glyph code-pane-breakpoint-glyph-conditional';
  }
  return 'code-pane-breakpoint-glyph';
}

function formatBreakpointHoverMessage(breakpoint: CodePaneBreakpoint): string {
  const details = [`Breakpoint ${breakpoint.lineNumber}`];
  if (breakpoint.enabled === false) {
    details.push('disabled');
  }
  if (breakpoint.condition?.trim()) {
    details.push(`condition: ${breakpoint.condition.trim()}`);
  }
  if (breakpoint.logMessage?.trim()) {
    details.push(`log: ${breakpoint.logMessage.trim()}`);
  }
  return details.join('\n');
}

function getHierarchyNodeKey(item: CodePaneHierarchyItem): string {
  const selectionRange = item.selectionRange;
  return [
    item.filePath,
    selectionRange.startLineNumber,
    selectionRange.startColumn,
    item.name,
  ].join(':');
}

function createHierarchyTreeNode(
  item: CodePaneHierarchyItem,
  children?: CodePaneHierarchyItem[],
): HierarchyTreeNode {
  const childNodes = (children ?? []).map((child) => createHierarchyTreeNode(child));
  return {
    key: getHierarchyNodeKey(item),
    item,
    children: childNodes,
    isExpanded: childNodes.length > 0,
    isLoading: false,
    isExpandable: true,
    error: null,
  };
}

function updateHierarchyTreeNode(
  node: HierarchyTreeNode,
  targetKey: string,
  updater: (candidate: HierarchyTreeNode) => HierarchyTreeNode,
): HierarchyTreeNode {
  if (node.key === targetKey) {
    return updater(node);
  }

  if (node.children.length === 0) {
    return node;
  }

  let didChange = false;
  const nextChildren = node.children.map((child) => {
    const nextChild = updateHierarchyTreeNode(child, targetKey, updater);
    if (nextChild !== child) {
      didChange = true;
    }
    return nextChild;
  });

  if (!didChange) {
    return node;
  }

  return {
    ...node,
    children: nextChildren,
  };
}

function findHierarchyTreeNode(node: HierarchyTreeNode | null, targetKey: string): HierarchyTreeNode | null {
  if (!node) {
    return null;
  }

  if (node.key === targetKey) {
    return node;
  }

  for (const child of node.children) {
    const match = findHierarchyTreeNode(child, targetKey);
    if (match) {
      return match;
    }
  }

  return null;
}

function summarizeSemanticTokens(result: CodePaneSemanticTokensResult): {
  totalTokens: number;
  summary: SemanticTokenSummaryEntry[];
} {
  const counts = new Map<string, number>();
  const data = result.data ?? [];
  for (let index = 0; index + 4 < data.length; index += 5) {
    const tokenTypeIndex = data[index + 3];
    const tokenType = result.legend.tokenTypes[tokenTypeIndex] ?? `token-${String(tokenTypeIndex)}`;
    counts.set(tokenType, (counts.get(tokenType) ?? 0) + 1);
  }

  const summary = Array.from(counts.entries())
    .map(([tokenType, count]) => ({ tokenType, count }))
    .sort((left, right) => right.count - left.count || left.tokenType.localeCompare(right.tokenType));

  return {
    totalTokens: summary.reduce((total, entry) => total + entry.count, 0),
    summary,
  };
}

function clampSidebarWidth(width: number | undefined | null): number {
  if (!Number.isFinite(width)) {
    return CODE_PANE_SIDEBAR_DEFAULT_WIDTH;
  }

  return Math.min(
    CODE_PANE_SIDEBAR_MAX_WIDTH,
    Math.max(CODE_PANE_SIDEBAR_MIN_WIDTH, Math.round(width as number)),
  );
}

function clampEditorSplitSize(size: number | undefined | null): number {
  if (!Number.isFinite(size)) {
    return CODE_PANE_EDITOR_SPLIT_DEFAULT_SIZE;
  }

  return Math.min(
    CODE_PANE_EDITOR_SPLIT_MAX_SIZE,
    Math.max(CODE_PANE_EDITOR_SPLIT_MIN_SIZE, size ?? CODE_PANE_EDITOR_SPLIT_DEFAULT_SIZE),
  );
}

function clampBottomPanelHeight(height: number | undefined | null, maxHeight = CODE_PANE_BOTTOM_PANEL_MAX_HEIGHT): number {
  const resolvedMaxHeight = Math.max(CODE_PANE_BOTTOM_PANEL_MIN_HEIGHT, Math.round(maxHeight));
  if (!Number.isFinite(height)) {
    return Math.min(CODE_PANE_BOTTOM_PANEL_DEFAULT_HEIGHT, resolvedMaxHeight);
  }

  return Math.min(
    resolvedMaxHeight,
    Math.max(CODE_PANE_BOTTOM_PANEL_MIN_HEIGHT, Math.round(height as number)),
  );
}

function getInitialEditorSplitLayout(pane: Pane) {
  return {
    visible: Boolean(pane.code?.layout?.editorSplit?.visible),
    size: clampEditorSplitSize(pane.code?.layout?.editorSplit?.size),
    secondaryFilePath: pane.code?.layout?.editorSplit?.secondaryFilePath ?? null,
  };
}

function getInitialSidebarLayout(pane: Pane): {
  visible: boolean;
  activeView: SidebarMode;
  width: number;
  lastExpandedWidth: number;
} {
  const sidebarState = pane.code?.layout?.sidebar;
  const width = clampSidebarWidth(
    sidebarState?.width
      ?? sidebarState?.lastExpandedWidth
      ?? CODE_PANE_SIDEBAR_DEFAULT_WIDTH,
  );

  return {
    visible: sidebarState?.visible ?? true,
    activeView: normalizeSidebarMode(sidebarState?.activeView),
    width,
    lastExpandedWidth: clampSidebarWidth(sidebarState?.lastExpandedWidth ?? width),
  };
}

function getInitialBottomPanelLayout(pane: Pane): {
  height: number;
} {
  return {
    height: clampBottomPanelHeight(pane.code?.layout?.bottomPanel?.height),
  };
}

function getInitialSavePipelineState(pane: Pane): Required<CodePaneSavePipelineState> {
  return {
    formatOnSave: pane.code?.savePipeline?.formatOnSave ?? false,
    organizeImportsOnSave: pane.code?.savePipeline?.organizeImportsOnSave ?? false,
    lintOnSave: pane.code?.savePipeline?.lintOnSave ?? false,
  };
}

function createFullDocumentRange(content: string) {
  const lines = content.split(/\r?\n/);
  const lastLine = lines.at(-1) ?? '';
  return {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: lines.length,
    endColumn: lastLine.length + 1,
  };
}

function createSaveQualityState(config: {
  status: CodePaneSaveQualityState['status'];
  message?: string;
  steps?: CodePaneSaveQualityStep[];
}): CodePaneSaveQualityState {
  return {
    status: config.status,
    ...(config.message ? { message: config.message } : {}),
    ...(config.steps ? { steps: config.steps } : {}),
    updatedAt: new Date().toISOString(),
  };
}

function resolveSaveQualityStatus(steps: CodePaneSaveQualityStep[]): CodePaneSaveQualityState['status'] {
  if (steps.some((step) => step.status === 'error')) {
    return 'error';
  }
  if (steps.some((step) => step.status === 'warning')) {
    return 'warning';
  }
  if (steps.some((step) => step.status === 'running')) {
    return 'running';
  }
  if (steps.some((step) => step.status === 'passed')) {
    return 'passed';
  }
  return 'idle';
}

function updateSaveQualityStep(
  steps: CodePaneSaveQualityStep[],
  nextStep: CodePaneSaveQualityStep,
): CodePaneSaveQualityStep[] {
  const existingIndex = steps.findIndex((step) => step.id === nextStep.id);
  if (existingIndex === -1) {
    return [...steps, nextStep];
  }

  const nextSteps = [...steps];
  nextSteps.splice(existingIndex, 1, nextStep);
  return nextSteps;
}

function getRelativePath(rootPath: string, targetPath: string): string {
  const normalizedRootPath = normalizePath(rootPath);
  const normalizedTargetPath = normalizePath(targetPath);

  if (normalizedTargetPath === normalizedRootPath) {
    return '';
  }

  if (normalizedTargetPath.startsWith(`${normalizedRootPath}/`)) {
    return normalizedTargetPath.slice(normalizedRootPath.length + 1);
  }

  return normalizedTargetPath;
}

function getParentDirectory(targetPath: string): string {
  const normalizedTargetPath = normalizePath(targetPath);
  const lastSeparatorIndex = normalizedTargetPath.lastIndexOf('/');
  if (lastSeparatorIndex <= 0) {
    return normalizedTargetPath;
  }
  return normalizedTargetPath.slice(0, lastSeparatorIndex);
}

function replacePathLeaf(targetPath: string, nextLeaf: string): string {
  const parentDirectory = getParentDirectory(targetPath);
  return `${parentDirectory}/${nextLeaf}`.replace(/\/{2,}/g, '/');
}

function resolvePathFromRoot(rootPath: string, relativePath: string): string {
  const normalizedRootPath = normalizePath(rootPath);
  const normalizedRelativePath = normalizePath(relativePath).replace(/^\/+/, '');
  if (!normalizedRelativePath) {
    return normalizedRootPath;
  }

  return `${normalizedRootPath}/${normalizedRelativePath}`.replace(/\/{2,}/g, '/');
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const normalizedParentPath = normalizePath(parentPath);
  const normalizedCandidatePath = normalizePath(candidatePath);
  return normalizedCandidatePath === normalizedParentPath
    || normalizedCandidatePath.startsWith(`${normalizedParentPath}/`);
}

function matchesLanguageWorkspaceRoot(
  rootPath: string,
  state: CodePaneLanguageWorkspaceState,
): boolean {
  return state.workspaceRoot === rootPath
    || state.projectRoot === rootPath
    || isPathInside(rootPath, state.projectRoot)
    || isPathInside(state.projectRoot, rootPath);
}

function formatLanguageLabel(languageId: string): string {
  switch (languageId) {
    case 'java':
      return 'Java';
    case 'python':
      return 'Python';
    case 'typescript':
      return 'TypeScript';
    case 'javascript':
      return 'JavaScript';
    case 'go':
      return 'Go';
    default:
      return languageId ? `${languageId.slice(0, 1).toUpperCase()}${languageId.slice(1)}` : 'Language';
  }
}

function isPathAffectedByRemovedDirectory(removedDirectoryPaths: string[], candidatePath: string): boolean {
  return removedDirectoryPaths.some((removedDirectoryPath) => isPathInside(removedDirectoryPath, candidatePath));
}

function getDirectoryRefreshPath(rootPath: string, change: CodePaneFsChange): string | null {
  if (change.type === 'change' || change.type === 'unlink' || change.type === 'unlinkDir') {
    return null;
  }

  const normalizedRootPath = normalizePath(rootPath);
  const normalizedChangedPath = normalizePath(change.path);
  if (normalizedChangedPath === normalizedRootPath) {
    return normalizedRootPath;
  }

  const parentDirectoryPath = getParentDirectory(normalizedChangedPath);
  return isPathInside(normalizedRootPath, parentDirectoryPath) ? parentDirectoryPath : null;
}

function collectDirectoryRefreshPaths(
  rootPath: string,
  changes: CodePaneFsChange[],
  loadedDirectories: Set<string>,
): string[] {
  const loadedDirectoryPaths = new Set(Array.from(loadedDirectories, (directoryPath) => normalizePath(directoryPath)));
  const normalizedRootPath = normalizePath(rootPath);
  const directoryPathsToRefresh = new Set<string>();

  for (const change of changes) {
    const directoryPath = getDirectoryRefreshPath(rootPath, change);
    if (!directoryPath) {
      continue;
    }

    if (directoryPath === normalizedRootPath || loadedDirectoryPaths.has(directoryPath)) {
      directoryPathsToRefresh.add(directoryPath);
    }
  }

  return Array.from(directoryPathsToRefresh);
}

function createEmptySet(): Set<string> {
  return new Set<string>();
}

function createExpandedDirectorySet(rootPath: string, expandedPaths?: string[] | null): Set<string> {
  if (!expandedPaths) {
    return new Set<string>([rootPath]);
  }

  const nextExpandedDirectories = new Set<string>();
  for (const expandedPath of expandedPaths ?? []) {
    if (expandedPath && isPathInside(rootPath, expandedPath)) {
      nextExpandedDirectories.add(expandedPath);
    }
  }
  return nextExpandedDirectories;
}

function sortOpenFilesByPinned<T extends { pinned?: boolean; preview?: boolean }>(openFiles: T[]): T[] {
  const pinnedOpenFiles = openFiles.filter((tab) => tab.pinned);
  const regularOpenFiles = openFiles.filter((tab) => !tab.pinned && !tab.preview);
  const previewOpenFiles = openFiles.filter((tab) => !tab.pinned && tab.preview);
  return [...pinnedOpenFiles, ...regularOpenFiles, ...previewOpenFiles];
}

function upsertOpenFileTab(
  existingTabs: CodePaneOpenFile[],
  filePath: string,
  options?: {
    preview?: boolean;
    promote?: boolean;
    pinned?: boolean;
  },
) {
  const shouldOpenAsPreview = Boolean(options?.preview) && !options?.pinned;
  const nextTabs = shouldOpenAsPreview
    ? existingTabs.filter((tab) => !tab.preview || tab.path === filePath)
    : [...existingTabs];
  const existingTabIndex = nextTabs.findIndex((tab) => tab.path === filePath);

  if (existingTabIndex >= 0) {
    const existingTab = nextTabs[existingTabIndex];
    const isPinned = options?.pinned ?? existingTab.pinned ?? false;
    nextTabs[existingTabIndex] = {
      ...existingTab,
      pinned: isPinned || undefined,
      preview: isPinned || options?.promote
        ? false
        : shouldOpenAsPreview
          ? true
          : existingTab.preview,
    };
    return sortOpenFilesByPinned(nextTabs);
  }

  return sortOpenFilesByPinned([
    ...nextTabs,
    {
      path: filePath,
      pinned: options?.pinned,
      preview: shouldOpenAsPreview || undefined,
    },
  ]);
}

function isSameNavigationLocation(
  left: Pick<NavigationHistoryEntry, 'filePath' | 'lineNumber' | 'column'> | null | undefined,
  right: Pick<NavigationHistoryEntry, 'filePath' | 'lineNumber' | 'column'> | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.filePath === right.filePath
    && left.lineNumber === right.lineNumber
    && left.column === right.column;
}

function getStatusTone(status?: CodePaneGitStatusEntry['status']): {
  badge: string;
  className: string;
} | null {
  switch (status) {
    case 'modified':
      return { badge: 'M', className: 'bg-amber-500/15 text-amber-300' };
    case 'untracked':
      return { badge: 'U', className: 'bg-emerald-500/15 text-emerald-300' };
    case 'added':
      return { badge: 'A', className: 'bg-emerald-500/15 text-emerald-300' };
    case 'deleted':
      return { badge: 'D', className: 'bg-red-500/15 text-red-300' };
    case 'renamed':
      return { badge: 'R', className: 'bg-sky-500/15 text-sky-300' };
    default:
      return null;
  }
}

function getProblemTone(severity: number): {
  label: 'error' | 'warning' | 'info' | 'hint';
  className: string;
} {
  if (severity >= 8) {
    return { label: 'error', className: 'bg-red-500/15 text-red-300' };
  }
  if (severity >= 4) {
    return { label: 'warning', className: 'bg-amber-500/15 text-amber-300' };
  }
  if (severity >= 2) {
    return { label: 'info', className: 'bg-sky-500/15 text-sky-300' };
  }
  return { label: 'hint', className: 'bg-emerald-500/15 text-emerald-300' };
}

function compareTextEditsDescending(left: CodePaneTextEdit, right: CodePaneTextEdit): number {
  if (left.range.startLineNumber !== right.range.startLineNumber) {
    return right.range.startLineNumber - left.range.startLineNumber;
  }
  if (left.range.startColumn !== right.range.startColumn) {
    return right.range.startColumn - left.range.startColumn;
  }
  if (left.range.endLineNumber !== right.range.endLineNumber) {
    return right.range.endLineNumber - left.range.endLineNumber;
  }
  return right.range.endColumn - left.range.endColumn;
}

function getTextOffset(content: string, lineNumber: number, column: number): number {
  const normalizedLineNumber = Math.max(lineNumber, 1);
  const lines = content.split('\n');
  let offset = 0;

  for (let index = 0; index < normalizedLineNumber - 1; index += 1) {
    offset += (lines[index] ?? '').length + 1;
  }

  const lineContent = lines[normalizedLineNumber - 1] ?? '';
  return offset + Math.min(Math.max(column - 1, 0), lineContent.length);
}

function applyTextEditsToContent(content: string, edits: CodePaneTextEdit[]): string {
  return [...edits]
    .sort(compareTextEditsDescending)
    .reduce((currentContent, edit) => {
      const startOffset = getTextOffset(
        currentContent,
        edit.range.startLineNumber,
        edit.range.startColumn,
      );
      const endOffset = getTextOffset(
        currentContent,
        edit.range.endLineNumber,
        edit.range.endColumn,
      );
      return `${currentContent.slice(0, startOffset)}${edit.newText}${currentContent.slice(endOffset)}`;
    }, content);
}

function isRefactorCodeAction(action: CodePaneCodeAction): boolean {
  const normalizedKind = action.kind?.toLowerCase() ?? '';
  const normalizedTitle = action.title.toLowerCase();
  return normalizedKind.startsWith('refactor')
    || normalizedTitle.includes('extract')
    || normalizedTitle.includes('inline')
    || normalizedTitle.includes('change signature')
    || normalizedTitle.includes('safe delete')
    || normalizedTitle.includes('move');
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

  return Array.from(new Set(sections));
}

function sortGitChangeTreeNodes(nodes: GitChangeTreeNode[]): GitChangeTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortGitChangeTreeNodes(node.children) : undefined,
    }))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });
}

function insertGitChangeTreeNode(
  nodes: GitChangeTreeNode[],
  segments: string[],
  fullPath: string,
  entry: CodePaneGitStatusEntry,
  currentPath = '',
): GitChangeTreeNode[] {
  const [segment, ...restSegments] = segments;
  if (!segment) {
    return nodes;
  }

  const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
  const existingNode = nodes.find((node) => node.name === segment);
  if (restSegments.length === 0) {
    if (existingNode) {
      existingNode.type = 'file';
      existingNode.path = fullPath;
      existingNode.entry = entry;
      delete existingNode.children;
      return nodes;
    }

    nodes.push({
      name: segment,
      path: fullPath,
      type: 'file',
      entry,
    });
    return nodes;
  }

  const directoryNode = existingNode && existingNode.type === 'directory'
    ? existingNode
    : (() => {
      if (existingNode) {
        existingNode.type = 'directory';
        existingNode.path = nextPath;
        existingNode.children = existingNode.children ?? [];
        return existingNode;
      }

      const nextNode: GitChangeTreeNode = {
        name: segment,
        path: nextPath,
        type: 'directory',
        children: [],
      };
      nodes.push(nextNode);
      return nextNode;
    })();

  directoryNode.children = insertGitChangeTreeNode(
    directoryNode.children ?? [],
    restSegments,
    fullPath,
    entry,
    nextPath,
  );

  return nodes;
}

function buildGitChangeSectionGroups(
  entries: CodePaneGitStatusEntry[],
  rootPath: string,
): GitChangeSectionGroup[] {
  const groupedNodes = new Map<GitChangeSection, GitChangeTreeNode[]>();
  const sectionCounts = new Map<GitChangeSection, number>();

  for (const entry of entries) {
    const relativePath = getRelativePath(rootPath, entry.path);
    const pathSegments = relativePath.split('/').filter(Boolean);
    if (pathSegments.length === 0) {
      continue;
    }

    for (const section of getGitEntrySections(entry)) {
      const nodes = groupedNodes.get(section) ?? [];
      insertGitChangeTreeNode(nodes, pathSegments, entry.path, entry);
      groupedNodes.set(section, nodes);
      sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
    }
  }

  return GIT_CHANGE_SECTION_ORDER.map((section) => ({
    section,
    count: sectionCounts.get(section) ?? 0,
    roots: sortGitChangeTreeNodes(groupedNodes.get(section) ?? []),
  })).filter((group) => group.count > 0);
}

function isPositionWithinRange(
  range: CodePaneDocumentSymbol['range'],
  lineNumber: number,
  column: number,
): boolean {
  if (lineNumber < range.startLineNumber || lineNumber > range.endLineNumber) {
    return false;
  }

  if (lineNumber === range.startLineNumber && column < range.startColumn) {
    return false;
  }

  if (lineNumber === range.endLineNumber && column > range.endColumn) {
    return false;
  }

  return true;
}

function findActiveDocumentSymbolPathInTree(
  symbol: CodePaneDocumentSymbol,
  lineNumber: number,
  column: number,
): CodePaneDocumentSymbol[] {
  if (!isPositionWithinRange(symbol.range, lineNumber, column)) {
    return [];
  }

  for (const child of symbol.children ?? []) {
    const childPath = findActiveDocumentSymbolPathInTree(child, lineNumber, column);
    if (childPath.length > 0) {
      return [symbol, ...childPath];
    }
  }

  return [symbol];
}

function findActiveDocumentSymbolPath(
  symbols: CodePaneDocumentSymbol[],
  lineNumber: number,
  column: number,
): CodePaneDocumentSymbol[] {
  for (const symbol of symbols) {
    const path = findActiveDocumentSymbolPathInTree(symbol, lineNumber, column);
    if (path.length > 0) {
      return path;
    }
  }

  return [];
}

export const CodePane: React.FC<CodePaneProps> = ({
  windowId,
  pane,
  isActive,
  onActivate,
  onClose,
}) => {
  const { t } = useI18n();
  const updatePane = useWindowStore((state) => state.updatePane);
  const supportsMonaco = typeof Worker !== 'undefined';
  const isMac = window.electronAPI.platform === 'darwin';
  const paneRef = useRef(pane);
  const rootContainerRef = useRef<HTMLDivElement | null>(null);
  const workspaceLayoutRef = useRef<HTMLDivElement | null>(null);
  const rootPath = pane.code?.rootPath ?? pane.cwd;
  const openFiles = pane.code?.openFiles ?? [];
  const bookmarks = pane.code?.bookmarks ?? [];
  const activeFilePath = pane.code?.activeFilePath ?? null;
  const selectedPath = pane.code?.selectedPath ?? null;
  const viewMode = pane.code?.viewMode ?? 'editor';
  const diffTargetPath = pane.code?.diffTargetPath ?? null;
  const savePipelineState = getInitialSavePipelineState(pane);
  const qualityGateState = pane.code?.qualityGate ?? null;
  const initialSidebarLayout = useMemo(() => getInitialSidebarLayout(pane), [pane]);
  const initialEditorSplitLayout = useMemo(() => getInitialEditorSplitLayout(pane), [pane]);
  const initialBottomPanelLayout = useMemo(() => getInitialBottomPanelLayout(pane), [pane]);

  const monacoRef = useRef<MonacoModule | null>(null);
  const languageBridgeRef = useRef<MonacoLanguageBridge | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const secondaryEditorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const secondaryEditorRef = useRef<MonacoEditor | null>(null);
  const diffEditorRef = useRef<MonacoDiffEditor | null>(null);
  const fileModelsRef = useRef(new Map<string, MonacoModel>());
  const diffModelsRef = useRef(new Map<string, MonacoModel>());
  const modelDisposersRef = useRef(new Map<string, MonacoDisposable>());
  const fileMetaRef = useRef(new Map<string, FileRuntimeMeta>());
  const modelFilePathRef = useRef(new Map<string, string>());
  const preloadedReadResultsRef = useRef(new Map<string, CodePaneReadFileResult>());
  const viewStatesRef = useRef(new Map<string, MonacoViewState>());
  const secondaryViewStatesRef = useRef(new Map<string, MonacoViewState>());
  const autoSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const documentSyncTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const localHistoryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const localHistoryEntriesRef = useRef(new Map<string, LocalHistoryEntry[]>());
  const suppressModelEventsRef = useRef(new Set<string>());
  const markerListenerRef = useRef<MonacoDisposable | null>(null);
  const editorMouseDownListenerRef = useRef<MonacoDisposable | null>(null);
  const editorMouseMoveListenerRef = useRef<MonacoDisposable | null>(null);
  const editorMouseLeaveListenerRef = useRef<MonacoDisposable | null>(null);
  const secondaryEditorMouseDownListenerRef = useRef<MonacoDisposable | null>(null);
  const secondaryEditorMouseMoveListenerRef = useRef<MonacoDisposable | null>(null);
  const secondaryEditorMouseLeaveListenerRef = useRef<MonacoDisposable | null>(null);
  const diffEditorMouseDownListenerRef = useRef<MonacoDisposable | null>(null);
  const diffEditorMouseMoveListenerRef = useRef<MonacoDisposable | null>(null);
  const diffEditorMouseLeaveListenerRef = useRef<MonacoDisposable | null>(null);
  const editorCursorPositionListenerRef = useRef<MonacoDisposable | null>(null);
  const secondaryEditorCursorPositionListenerRef = useRef<MonacoDisposable | null>(null);
  const diffEditorCursorPositionListenerRef = useRef<MonacoDisposable | null>(null);
  const definitionLinkDecorationEditorRef = useRef<MonacoEditor | null>(null);
  const definitionLinkDecorationIdsRef = useRef<string[]>([]);
  const debugDecorationEditorRef = useRef<MonacoEditor | null>(null);
  const debugDecorationIdsRef = useRef<string[]>([]);
  const definitionHoverRequestKeyRef = useRef<string | null>(null);
  const definitionLookupCacheRef = useRef(new Map<string, Promise<DefinitionLookupResult>>());
  const sidebarResizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarResizeCleanupRef = useRef<(() => void) | null>(null);
  const editorSplitResizeStartRef = useRef<{ startX: number; startSize: number } | null>(null);
  const editorSplitResizeCleanupRef = useRef<(() => void) | null>(null);
  const bottomPanelResizeStartRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const bottomPanelResizeCleanupRef = useRef<(() => void) | null>(null);
  const focusedEditorTargetRef = useRef<EditorTarget>('editor');
  const runtimeStoreRef = useRef(new CodePaneRuntimeStore());

  const [treeEntriesByDirectory, setTreeEntriesByDirectory] = useState<Record<string, CodePaneTreeEntry[]>>({});
  const [externalEntriesByDirectory, setExternalEntriesByDirectory] = useState<Record<string, CodePaneTreeEntry[]>>({});
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => (
    createExpandedDirectorySet(rootPath, pane.code?.expandedPaths)
  ));
  const [loadedDirectories, setLoadedDirectories] = useState<Set<string>>(() => new Set());
  const [loadedExternalDirectories, setLoadedExternalDirectories] = useState<Set<string>>(() => new Set());
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set([rootPath]));
  const [loadingExternalDirectories, setLoadingExternalDirectories] = useState<Set<string>>(() => new Set());
  const [externalLibrarySections, setExternalLibrarySections] = useState<CodePaneExternalLibrarySection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(initialSidebarLayout.activeView);
  const [isSidebarVisible, setIsSidebarVisible] = useState(initialSidebarLayout.visible);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarLayout.width);
  const [lastExpandedSidebarWidth, setLastExpandedSidebarWidth] = useState(initialSidebarLayout.lastExpandedWidth);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isEditorSplitVisible, setIsEditorSplitVisible] = useState(initialEditorSplitLayout.visible);
  const [editorSplitSize, setEditorSplitSize] = useState(initialEditorSplitLayout.size);
  const [secondaryFilePath, setSecondaryFilePath] = useState<string | null>(initialEditorSplitLayout.secondaryFilePath);
  const [isEditorSplitResizing, setIsEditorSplitResizing] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(initialBottomPanelLayout.height);
  const [isBottomPanelResizing, setIsBottomPanelResizing] = useState(false);
  const [searchPanelMode, setSearchPanelMode] = useState<'contents' | 'symbols' | 'usages'>('contents');
  const [contentSearchQuery, setContentSearchQuery] = useState('');
  const deferredContentSearchQuery = useDeferredValue(contentSearchQuery);
  const [contentSearchResults, setContentSearchResults] = useState<CodePaneContentMatch[]>([]);
  const [isContentSearching, setIsContentSearching] = useState(false);
  const [workspaceSymbolQuery, setWorkspaceSymbolQuery] = useState('');
  const deferredWorkspaceSymbolQuery = useDeferredValue(workspaceSymbolQuery);
  const [workspaceSymbolResults, setWorkspaceSymbolResults] = useState<CodePaneWorkspaceSymbol[]>([]);
  const [isWorkspaceSymbolSearching, setIsWorkspaceSymbolSearching] = useState(false);
  const [workspaceSymbolError, setWorkspaceSymbolError] = useState<string | null>(null);
  const [isSearchEverywhereOpen, setIsSearchEverywhereOpen] = useState(false);
  const [searchEverywhereMode, setSearchEverywhereMode] = useState<SearchEverywhereMode>('all');
  const [searchEverywhereQuery, setSearchEverywhereQuery] = useState('');
  const deferredSearchEverywhereQuery = useDeferredValue(searchEverywhereQuery);
  const [searchEverywhereFileResults, setSearchEverywhereFileResults] = useState<string[]>([]);
  const [searchEverywhereSymbolResults, setSearchEverywhereSymbolResults] = useState<CodePaneWorkspaceSymbol[]>([]);
  const [isSearchEverywhereLoading, setIsSearchEverywhereLoading] = useState(false);
  const [searchEverywhereError, setSearchEverywhereError] = useState<string | null>(null);
  const [searchEverywhereSelectedIndex, setSearchEverywhereSelectedIndex] = useState(0);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [recentLocations, setRecentLocations] = useState<NavigationHistoryEntry[]>([]);
  const [, setNavigationStateVersion] = useState(0);
  const [isCodeActionMenuOpen, setIsCodeActionMenuOpen] = useState(false);
  const [codeActionItems, setCodeActionItems] = useState<CodePaneCodeAction[]>([]);
  const [isCodeActionMenuLoading, setIsCodeActionMenuLoading] = useState(false);
  const [codeActionMenuError, setCodeActionMenuError] = useState<string | null>(null);
  const [selectedCodeActionIndex, setSelectedCodeActionIndex] = useState(0);
  const [bottomPanelMode, setBottomPanelMode] = useState<BottomPanelMode | null>(null);
  const [breakpoints, setBreakpoints] = useState<CodePaneBreakpoint[]>(() => normalizeBreakpoints(pane.code?.breakpoints));
  const [exceptionBreakpoints, setExceptionBreakpoints] = useState<CodePaneExceptionBreakpoint[]>(
    () => normalizeExceptionBreakpoints(pane.code?.debug?.exceptionBreakpoints),
  );
  const [runTargets, setRunTargets] = useState<CodePaneRunTarget[]>([]);
  const [isRunTargetsLoading, setIsRunTargetsLoading] = useState(false);
  const [runTargetsError, setRunTargetsError] = useState<string | null>(null);
  const [debugSessions, setDebugSessions] = useState<CodePaneDebugSession[]>([]);
  const [debugSessionOutputs, setDebugSessionOutputs] = useState<Record<string, string>>({});
  const [selectedDebugSessionId, setSelectedDebugSessionId] = useState<string | null>(null);
  const [debugSessionDetails, setDebugSessionDetails] = useState<CodePaneDebugSessionDetails | null>(null);
  const [watchExpressions, setWatchExpressions] = useState<string[]>(
    () => normalizeWatchExpressions(pane.code?.debug?.watchExpressions),
  );
  const [watchEntries, setWatchEntries] = useState<DebugWatchEntry[]>([]);
  const [isDebugDetailsLoading, setIsDebugDetailsLoading] = useState(false);
  const [debugEvaluations, setDebugEvaluations] = useState<DebugEvaluationEntry[]>([]);
  const [testItems, setTestItems] = useState<CodePaneTestItem[]>([]);
  const [isTestsLoading, setIsTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState<string | null>(null);
  const [projectContributions, setProjectContributions] = useState<CodePaneProjectContribution[]>([]);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [runSessions, setRunSessions] = useState<CodePaneRunSession[]>([]);
  const [runSessionOutputs, setRunSessionOutputs] = useState<Record<string, string>>({});
  const [selectedRunSessionId, setSelectedRunSessionId] = useState<string | null>(null);
  const [usageResults, setUsageResults] = useState<CodePaneReference[]>([]);
  const [isFindingUsages, setIsFindingUsages] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usagesTargetLabel, setUsagesTargetLabel] = useState<string | null>(null);
  const [problems, setProblems] = useState<Array<MonacoMarker & { filePath: string }>>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(createEmptySet);
  const [savingPaths, setSavingPaths] = useState<Set<string>>(createEmptySet);
  const [gitStatusByPath, setGitStatusByPath] = useState<Record<string, CodePaneGitStatusEntry>>({});
  const [gitRepositorySummary, setGitRepositorySummary] = useState<CodePaneGitRepositorySummary | null>(null);
  const [gitGraph, setGitGraph] = useState<CodePaneGitGraphCommit[]>([]);
  const [gitBranches, setGitBranches] = useState<CodePaneGitBranchEntry[]>([]);
  const [selectedGitBranchName, setSelectedGitBranchName] = useState<string | null>(null);
  const [selectedGitLogCommitSha, setSelectedGitLogCommitSha] = useState<string | null>(null);
  const [isGitBranchesLoading, setIsGitBranchesLoading] = useState(false);
  const [gitBranchesError, setGitBranchesError] = useState<string | null>(null);
  const [gitRebasePlan, setGitRebasePlan] = useState<CodePaneGitRebasePlanResult | null>(null);
  const [gitRebaseBaseRef, setGitRebaseBaseRef] = useState('');
  const [isGitRebaseLoading, setIsGitRebaseLoading] = useState(false);
  const [gitRebaseError, setGitRebaseError] = useState<string | null>(null);
  const [gitConflictDetails, setGitConflictDetails] = useState<CodePaneGitConflictDetails | null>(null);
  const [selectedGitConflictPath, setSelectedGitConflictPath] = useState<string | null>(null);
  const [isGitConflictLoading, setIsGitConflictLoading] = useState(false);
  const [isApplyingGitConflict, setIsApplyingGitConflict] = useState(false);
  const [gitConflictError, setGitConflictError] = useState<string | null>(null);
  const [selectedGitChangePath, setSelectedGitChangePath] = useState<string | null>(null);
  const [gitStagedHunks, setGitStagedHunks] = useState<CodePaneGitDiffHunk[]>([]);
  const [gitUnstagedHunks, setGitUnstagedHunks] = useState<CodePaneGitDiffHunk[]>([]);
  const [isGitHunksLoading, setIsGitHunksLoading] = useState(false);
  const [gitHunksError, setGitHunksError] = useState<string | null>(null);
  const [refactorPreview, setRefactorPreview] = useState<CodePanePreviewChangeSet | null>(null);
  const [selectedPreviewChangeId, setSelectedPreviewChangeId] = useState<string | null>(null);
  const [isApplyingRefactorPreview, setIsApplyingRefactorPreview] = useState(false);
  const [refactorPreviewError, setRefactorPreviewError] = useState<string | null>(null);
  const [gitHistory, setGitHistory] = useState<CodePaneGitHistoryResult | null>(null);
  const [selectedHistoryCommitSha, setSelectedHistoryCommitSha] = useState<string | null>(null);
  const [isGitHistoryLoading, setIsGitHistoryLoading] = useState(false);
  const [gitHistoryError, setGitHistoryError] = useState<string | null>(null);
  const [todoItems, setTodoItems] = useState<CodePaneTodoItem[]>([]);
  const [isTodoLoading, setIsTodoLoading] = useState(false);
  const [todoError, setTodoError] = useState<string | null>(null);
  const [localHistoryVersion, setLocalHistoryVersion] = useState(0);
  const [runtimeStoreVersion, setRuntimeStoreVersion] = useState(0);
  const [isBlameVisible, setIsBlameVisible] = useState(false);
  const [isBlameLoading, setIsBlameLoading] = useState(false);
  const [blameLines, setBlameLines] = useState<CodePaneGitBlameLine[]>([]);
  const [activeCursorLineNumber, setActiveCursorLineNumber] = useState(1);
  const [activeCursorColumn, setActiveCursorColumn] = useState(1);
  const [activeEditorTarget, setActiveEditorTarget] = useState<EditorTarget>('editor');
  const [activeDocumentSymbols, setActiveDocumentSymbols] = useState<CodePaneDocumentSymbol[]>([]);
  const [isActiveDocumentSymbolsLoading, setIsActiveDocumentSymbolsLoading] = useState(false);
  const [quickDocumentation, setQuickDocumentation] = useState<CodePaneHoverResult | null>(null);
  const [quickDocumentationError, setQuickDocumentationError] = useState<string | null>(null);
  const [isQuickDocumentationOpen, setIsQuickDocumentationOpen] = useState(false);
  const [isQuickDocumentationLoading, setIsQuickDocumentationLoading] = useState(false);
  const [selectedHierarchyMode, setSelectedHierarchyMode] = useState<HierarchyMode>('call-outgoing');
  const [hierarchyRootNode, setHierarchyRootNode] = useState<HierarchyTreeNode | null>(null);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const [areInlayHintsEnabled, setAreInlayHintsEnabled] = useState(true);
  const [areSemanticTokensEnabled, setAreSemanticTokensEnabled] = useState(true);
  const [semanticLegend, setSemanticLegend] = useState<CodePaneSemanticTokensLegend | null>(null);
  const [semanticSummary, setSemanticSummary] = useState<SemanticTokenSummaryEntry[]>([]);
  const [semanticTokenCount, setSemanticTokenCount] = useState(0);
  const [semanticSummaryFileLabel, setSemanticSummaryFileLabel] = useState<string | null>(null);
  const [isSemanticSummaryLoading, setIsSemanticSummaryLoading] = useState(false);
  const [semanticSummaryError, setSemanticSummaryError] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [treeLoadError, setTreeLoadError] = useState<string | null>(null);
  const [externalLibrariesError, setExternalLibrariesError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [contentSearchError, setContentSearchError] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<CodePaneIndexStatus | null>(null);
  const [languageWorkspaceState, setLanguageWorkspaceState] = useState<CodePaneLanguageWorkspaceState | null>(null);
  const editorInlayHintOptions = useMemo(() => ({
    inlayHints: {
      enabled: (areInlayHintsEnabled ? 'on' : 'off') as 'on' | 'off',
    },
    semanticHighlighting: {
      enabled: areSemanticTokensEnabled,
    },
  }), [areInlayHintsEnabled, areSemanticTokensEnabled]);

  const expandedDirectoriesRef = useRef(expandedDirectories);
  const loadedDirectoriesRef = useRef(loadedDirectories);
  const loadedExternalDirectoriesRef = useRef(loadedExternalDirectories);
  const breakpointsRef = useRef(breakpoints);
  const exceptionBreakpointsRef = useRef(exceptionBreakpoints);
  const debugCurrentFrameRef = useRef<CodePaneDebugStackFrame | null>(null);
  const dirtyPathsRef = useRef(dirtyPaths);
  const savingPathsRef = useRef(savingPaths);
  const activeFilePathRef = useRef(activeFilePath);
  const pendingNavigationRef = useRef<FileNavigationLocation | null>(null);
  const openFileLocationRef = useRef<(location: FileNavigationLocation) => Promise<void>>(async () => {});
  const sidebarModeRef = useRef(sidebarMode);
  const sidebarVisibleRef = useRef(isSidebarVisible);
  const sidebarWidthRef = useRef(sidebarWidth);
  const lastExpandedSidebarWidthRef = useRef(lastExpandedSidebarWidth);
  const editorSplitSizeRef = useRef(editorSplitSize);
  const secondaryFilePathRef = useRef(secondaryFilePath);
  const bottomPanelHeightRef = useRef(bottomPanelHeight);
  const recentFilesRef = useRef<string[]>([]);
  const recentLocationsRef = useRef<NavigationHistoryEntry[]>([]);
  const navigationBackStackRef = useRef<NavigationHistoryEntry[]>([]);
  const navigationForwardStackRef = useRef<NavigationHistoryEntry[]>([]);
  const searchEverywhereInputRef = useRef<HTMLInputElement | null>(null);
  const navigateBackRef = useRef<() => Promise<void>>(async () => {});
  const navigateForwardRef = useRef<() => Promise<void>>(async () => {});
  const goToImplementationAtCursorRef = useRef<() => Promise<void>>(async () => {});
  const renameSymbolAtCursorRef = useRef<() => Promise<void>>(async () => {});
  const findUsagesAtCursorRef = useRef<() => Promise<void>>(async () => {});
  const formatActiveDocumentRef = useRef<() => Promise<void>>(async () => {});
  const saveFileRef = useRef<(filePath: string, options?: SaveFileOptions) => Promise<boolean>>(async () => true);
  const openCodeActionMenuRef = useRef<() => Promise<void>>(async () => {});
  const loadDebugSessionDetailsRef = useRef<(sessionId: string | null) => Promise<void>>(async () => {});
  const toggleBreakpointRef = useRef<(filePath: string, lineNumber: number) => Promise<void>>(async () => {});
  const runSelectedCodeActionRef = useRef<(action: CodePaneCodeAction | undefined) => Promise<void>>(async () => {});
  const hierarchyRequestIdRef = useRef(0);
  const semanticRequestIdRef = useRef(0);

  useEffect(() => {
    paneRef.current = pane;
  }, [pane]);

  useEffect(() => runtimeStoreRef.current.subscribe(() => {
    setRuntimeStoreVersion((currentVersion) => currentVersion + 1);
  }), []);

  useEffect(() => {
    localHistoryEntriesRef.current.clear();
    localHistoryTimersRef.current.forEach((timer) => clearTimeout(timer));
    localHistoryTimersRef.current.clear();
    setTodoItems([]);
    setTodoError(null);
    setLocalHistoryVersion((currentVersion) => currentVersion + 1);
  }, [pane.id, rootPath]);

  useEffect(() => {
    const nextSidebarLayout = getInitialSidebarLayout(pane);
    setSidebarMode(nextSidebarLayout.activeView);
    setIsSidebarVisible(nextSidebarLayout.visible);
    setSidebarWidth(nextSidebarLayout.width);
    setLastExpandedSidebarWidth(nextSidebarLayout.lastExpandedWidth);
    const nextEditorSplitLayout = getInitialEditorSplitLayout(pane);
    setIsEditorSplitVisible(nextEditorSplitLayout.visible);
    setEditorSplitSize(nextEditorSplitLayout.size);
    setSecondaryFilePath(nextEditorSplitLayout.secondaryFilePath);
    const nextBottomPanelLayout = getInitialBottomPanelLayout(pane);
    setBottomPanelHeight(nextBottomPanelLayout.height);
  }, [pane.id, pane.code?.layout, pane]);

  useEffect(() => {
    expandedDirectoriesRef.current = expandedDirectories;
  }, [expandedDirectories]);

  useEffect(() => {
    loadedDirectoriesRef.current = loadedDirectories;
  }, [loadedDirectories]);

  useEffect(() => {
    loadedExternalDirectoriesRef.current = loadedExternalDirectories;
  }, [loadedExternalDirectories]);

  useEffect(() => {
    setBreakpoints(normalizeBreakpoints(pane.code?.breakpoints));
  }, [pane.id, pane.code?.breakpoints]);

  useEffect(() => {
    breakpointsRef.current = breakpoints;
  }, [breakpoints]);

  useEffect(() => {
    setExceptionBreakpoints(normalizeExceptionBreakpoints(pane.code?.debug?.exceptionBreakpoints));
  }, [pane.id, pane.code?.debug?.exceptionBreakpoints]);

  useEffect(() => {
    exceptionBreakpointsRef.current = exceptionBreakpoints;
  }, [exceptionBreakpoints]);

  useEffect(() => {
    setWatchExpressions(normalizeWatchExpressions(pane.code?.debug?.watchExpressions));
  }, [pane.id, pane.code?.debug?.watchExpressions]);

  useEffect(() => {
    dirtyPathsRef.current = dirtyPaths;
  }, [dirtyPaths]);

  useEffect(() => {
    savingPathsRef.current = savingPaths;
  }, [savingPaths]);

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  useEffect(() => {
    sidebarModeRef.current = sidebarMode;
  }, [sidebarMode]);

  useEffect(() => {
    sidebarVisibleRef.current = isSidebarVisible;
  }, [isSidebarVisible]);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    lastExpandedSidebarWidthRef.current = lastExpandedSidebarWidth;
  }, [lastExpandedSidebarWidth]);

  useEffect(() => {
    editorSplitSizeRef.current = editorSplitSize;
  }, [editorSplitSize]);

  useEffect(() => {
    secondaryFilePathRef.current = secondaryFilePath;
  }, [secondaryFilePath]);

  useEffect(() => {
    bottomPanelHeightRef.current = bottomPanelHeight;
  }, [bottomPanelHeight]);

  const persistCodeState = useCallback((updates: Partial<NonNullable<Pane['code']>>) => {
    const currentCodeState = {
      rootPath,
      openFiles: [],
      activeFilePath: null,
      selectedPath: null,
      expandedPaths: [rootPath],
      viewMode: 'editor' as const,
      diffTargetPath: null,
      layout: {
        sidebar: getInitialSidebarLayout(paneRef.current),
        bottomPanel: getInitialBottomPanelLayout(paneRef.current),
        editorSplit: getInitialEditorSplitLayout(paneRef.current),
      },
      ...(paneRef.current.code ?? {}),
    };
    const nextCodeState = {
      ...currentCodeState,
      ...updates,
    };

    paneRef.current = {
      ...paneRef.current,
      code: nextCodeState,
    };

    if (updates.activeFilePath !== undefined) {
      activeFilePathRef.current = updates.activeFilePath;
    }

    updatePane(windowId, pane.id, {
      code: nextCodeState,
    });
  }, [pane.id, rootPath, updatePane, windowId]);

  const persistSidebarLayout = useCallback((updates: Partial<NonNullable<NonNullable<Pane['code']>['layout']>['sidebar']>) => {
    const currentSidebarLayout = {
      ...getInitialSidebarLayout(paneRef.current),
      ...(paneRef.current.code?.layout?.sidebar ?? {}),
    };

    persistCodeState({
      layout: {
        ...(paneRef.current.code?.layout ?? {}),
        sidebar: {
          ...currentSidebarLayout,
          ...updates,
        },
      },
    });
  }, [persistCodeState]);

  const persistEditorSplitLayout = useCallback((updates: Partial<NonNullable<NonNullable<NonNullable<Pane['code']>['layout']>['editorSplit']>>) => {
    const currentEditorSplitLayout = {
      ...getInitialEditorSplitLayout(paneRef.current),
      ...(paneRef.current.code?.layout?.editorSplit ?? {}),
    };
    const currentSidebarLayout = {
      ...getInitialSidebarLayout(paneRef.current),
      ...(paneRef.current.code?.layout?.sidebar ?? {}),
    };

    const nextEditorSplitLayout = {
      ...currentEditorSplitLayout,
      ...updates,
      size: clampEditorSplitSize(updates.size ?? currentEditorSplitLayout.size),
      secondaryFilePath: Object.prototype.hasOwnProperty.call(updates, 'secondaryFilePath')
        ? (updates.secondaryFilePath ?? null)
        : (currentEditorSplitLayout.secondaryFilePath ?? null),
    };

    setIsEditorSplitVisible(Boolean(nextEditorSplitLayout.visible));
    setEditorSplitSize(nextEditorSplitLayout.size);
    setSecondaryFilePath(nextEditorSplitLayout.secondaryFilePath);

    persistCodeState({
      layout: {
        ...(paneRef.current.code?.layout ?? {}),
        sidebar: currentSidebarLayout,
        editorSplit: nextEditorSplitLayout,
      },
    });
  }, [persistCodeState]);

  const persistBottomPanelLayout = useCallback((updates: Partial<NonNullable<NonNullable<NonNullable<Pane['code']>['layout']>['bottomPanel']>>) => {
    const currentBottomPanelLayout = {
      ...getInitialBottomPanelLayout(paneRef.current),
      ...(paneRef.current.code?.layout?.bottomPanel ?? {}),
    };
    const currentSidebarLayout = {
      ...getInitialSidebarLayout(paneRef.current),
      ...(paneRef.current.code?.layout?.sidebar ?? {}),
    };
    const currentEditorSplitLayout = {
      ...getInitialEditorSplitLayout(paneRef.current),
      ...(paneRef.current.code?.layout?.editorSplit ?? {}),
    };

    const nextBottomPanelLayout = {
      ...currentBottomPanelLayout,
      ...updates,
      height: clampBottomPanelHeight(updates.height ?? currentBottomPanelLayout.height),
    };

    bottomPanelHeightRef.current = nextBottomPanelLayout.height;
    setBottomPanelHeight(nextBottomPanelLayout.height);

    persistCodeState({
      layout: {
        ...(paneRef.current.code?.layout ?? {}),
        sidebar: currentSidebarLayout,
        bottomPanel: nextBottomPanelLayout,
        editorSplit: currentEditorSplitLayout,
      },
    });
  }, [persistCodeState]);

  const persistDebugState = useCallback((updates: Partial<NonNullable<NonNullable<Pane['code']>['debug']>>) => {
    const currentDebugState = paneRef.current.code?.debug ?? {};
    persistCodeState({
      debug: {
        ...currentDebugState,
        ...updates,
      },
    });
  }, [persistCodeState]);

  const persistSavePipelineState = useCallback((updates: Partial<Required<CodePaneSavePipelineState>>) => {
    const currentSavePipelineState = getInitialSavePipelineState(paneRef.current);
    persistCodeState({
      savePipeline: {
        ...currentSavePipelineState,
        ...updates,
      },
    });
  }, [persistCodeState]);

  const persistQualityGateState = useCallback((qualityGate: CodePaneSaveQualityState) => {
    persistCodeState({
      qualityGate,
    });
  }, [persistCodeState]);

  const getPersistedExpandedPaths = useCallback((paths: Set<string>) => (
    Array.from(paths).filter((directoryPath) => isPathInside(rootPath, directoryPath))
  ), [rootPath]);

  const persistDebugBreakpoints = useCallback((nextBreakpoints: CodePaneBreakpoint[]) => {
    const normalizedBreakpoints = normalizeBreakpoints(nextBreakpoints);
    setBreakpoints(normalizedBreakpoints);
    persistCodeState({
      breakpoints: normalizedBreakpoints.map((breakpoint) => ({
        filePath: breakpoint.filePath,
        lineNumber: breakpoint.lineNumber,
        ...(breakpoint.condition ? { condition: breakpoint.condition } : {}),
        ...(breakpoint.logMessage ? { logMessage: breakpoint.logMessage } : {}),
        ...(breakpoint.enabled === false ? { enabled: false } : {}),
      })),
    });
  }, [persistCodeState]);

  const persistExceptionBreakpoints = useCallback((nextBreakpoints: CodePaneExceptionBreakpoint[]) => {
    const normalizedExceptionBreakpoints = normalizeExceptionBreakpoints(nextBreakpoints);
    setExceptionBreakpoints(normalizedExceptionBreakpoints);
    persistDebugState({
      exceptionBreakpoints: normalizedExceptionBreakpoints.map((breakpoint) => ({
        id: breakpoint.id,
        enabled: breakpoint.enabled,
      })),
    });
  }, [persistDebugState]);

  const persistWatchExpressions = useCallback((nextWatchExpressions: string[]) => {
    const normalizedWatchExpressions = normalizeWatchExpressions(nextWatchExpressions);
    setWatchExpressions(normalizedWatchExpressions);
    persistDebugState({
      watchExpressions: normalizedWatchExpressions,
    });
  }, [persistDebugState]);

  const updateOpenFileTabs = useCallback((
    updater: (currentOpenFiles: CodePaneOpenFile[]) => CodePaneOpenFile[],
  ) => {
    const currentOpenFiles = paneRef.current.code?.openFiles ?? openFiles;
    const nextOpenFiles = sortOpenFilesByPinned(updater(currentOpenFiles));
    persistCodeState({
      openFiles: nextOpenFiles,
    });
    return nextOpenFiles;
  }, [openFiles, persistCodeState]);

  const promotePreviewTab = useCallback((filePath: string) => {
    updateOpenFileTabs((currentOpenFiles) => currentOpenFiles.map((tab) => (
      tab.path === filePath && tab.preview
        ? { ...tab, preview: false }
        : tab
    )));
  }, [updateOpenFileTabs]);

  const addLocalHistoryEntry = useCallback((
    filePath: string,
    reason: LocalHistoryEntry['reason'],
    content: string,
  ) => {
    if (!filePath || content.length > CODE_PANE_MAX_LOCAL_HISTORY_CONTENT_SIZE) {
      return;
    }

    const normalizedContent = content.replace(/\r\n/g, '\n');
    const existingEntries = localHistoryEntriesRef.current.get(filePath) ?? [];
    const lastEntry = existingEntries[0];
    if (lastEntry?.content === normalizedContent) {
      return;
    }

    const nextEntry: LocalHistoryEntry = {
      id: `${filePath}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      filePath,
      reason,
      label: reason === 'save'
        ? t('codePane.localHistorySaved')
        : reason === 'draft'
          ? t('codePane.localHistoryDraft')
          : reason === 'restore'
            ? t('codePane.localHistoryRestorePoint')
            : t('codePane.localHistoryOpened'),
      timestamp: Date.now(),
      content: normalizedContent,
      preview: normalizedContent.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '',
    };

    localHistoryEntriesRef.current.set(filePath, [
      nextEntry,
      ...existingEntries,
    ].slice(0, CODE_PANE_MAX_LOCAL_HISTORY_PER_FILE));
    setLocalHistoryVersion((currentVersion) => currentVersion + 1);
  }, [t]);

  const scheduleLocalHistorySnapshot = useCallback((filePath: string) => {
    const existingTimer = localHistoryTimersRef.current.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    localHistoryTimersRef.current.set(filePath, setTimeout(() => {
      localHistoryTimersRef.current.delete(filePath);
      const model = fileModelsRef.current.get(filePath);
      if (!model) {
        return;
      }

      addLocalHistoryEntry(filePath, 'draft', model.getValue());
    }, CODE_PANE_LOCAL_HISTORY_CHANGE_DEBOUNCE_MS));
  }, [addLocalHistoryEntry]);

  const trackRequest = useCallback(async <T,>(
    key: string,
    label: string,
    meta: string | undefined,
    request: () => Promise<T>,
  ) => {
    const handle = runtimeStoreRef.current.beginRequest(key, label, meta);

    try {
      const result = await request();
      runtimeStoreRef.current.finishRequest(handle, 'completed');
      return result;
    } catch (error) {
      runtimeStoreRef.current.finishRequest(handle, 'error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, []);

  const loadExceptionBreakpoints = useCallback(async () => {
    const persistedExceptionBreakpoints = paneRef.current.code?.debug?.exceptionBreakpoints;
    if ((persistedExceptionBreakpoints?.length ?? 0) > 0) {
      const normalizedPersistedBreakpoints = normalizeExceptionBreakpoints(persistedExceptionBreakpoints);
      const syncResponse = await window.electronAPI.codePaneSetExceptionBreakpoints({
        rootPath,
        breakpoints: normalizedPersistedBreakpoints,
      });
      if (syncResponse.success) {
        setExceptionBreakpoints(normalizedPersistedBreakpoints);
      }
      return;
    }

    const response = await window.electronAPI.codePaneGetExceptionBreakpoints({
      rootPath,
    });
    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    persistExceptionBreakpoints(response.data ?? CODE_PANE_DEFAULT_EXCEPTION_BREAKPOINTS);
  }, [persistExceptionBreakpoints, rootPath, t]);

  const loadDebugSessions = useCallback(async () => {
    const response = await window.electronAPI.codePaneListDebugSessions({
      rootPath,
    });
    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    const snapshots = response.data ?? [];
    setDebugSessions(snapshots.map((snapshot) => snapshot.session));
    setDebugSessionOutputs(
      snapshots.reduce<Record<string, string>>((accumulator, snapshot) => {
        accumulator[snapshot.session.id] = snapshot.output;
        return accumulator;
      }, {}),
    );
    setSelectedDebugSessionId((currentSelectedSessionId) => {
      if (currentSelectedSessionId && snapshots.some((snapshot) => snapshot.session.id === currentSelectedSessionId)) {
        return currentSelectedSessionId;
      }

      return snapshots[0]?.session.id ?? null;
    });
  }, [rootPath, t]);

  useEffect(() => {
    for (const breakpoint of breakpointsRef.current) {
      void window.electronAPI.codePaneSetBreakpoint({
        rootPath,
        breakpoint,
      });
    }
  }, [rootPath]);

  const toggleSidebarVisibility = useCallback((nextVisible?: boolean) => {
    const shouldShowSidebar = nextVisible ?? !sidebarVisibleRef.current;
    const restoredWidth = clampSidebarWidth(lastExpandedSidebarWidthRef.current);
    const nextWidth = shouldShowSidebar ? restoredWidth : sidebarWidthRef.current;
    const nextLastExpandedWidth = shouldShowSidebar
      ? restoredWidth
      : clampSidebarWidth(sidebarWidthRef.current);

    setIsSidebarVisible(shouldShowSidebar);
    setSidebarWidth(nextWidth);
    setLastExpandedSidebarWidth(nextLastExpandedWidth);
    sidebarVisibleRef.current = shouldShowSidebar;
    sidebarWidthRef.current = nextWidth;
    lastExpandedSidebarWidthRef.current = nextLastExpandedWidth;
    persistSidebarLayout({
      visible: shouldShowSidebar,
      activeView: sidebarModeRef.current,
      width: nextWidth,
      lastExpandedWidth: nextLastExpandedWidth,
    });
  }, [persistSidebarLayout]);

  const handleSidebarModeSelect = useCallback((mode: SidebarMode) => {
    const isSameMode = sidebarModeRef.current === mode;
    if (isSameMode) {
      toggleSidebarVisibility();
      return;
    }

    const nextWidth = clampSidebarWidth(lastExpandedSidebarWidthRef.current);
    setSidebarMode(mode);
    setIsSidebarVisible(true);
    setSidebarWidth(nextWidth);
    setLastExpandedSidebarWidth(nextWidth);
    sidebarModeRef.current = mode;
    sidebarVisibleRef.current = true;
    sidebarWidthRef.current = nextWidth;
    lastExpandedSidebarWidthRef.current = nextWidth;
    persistSidebarLayout({
      visible: true,
      activeView: mode,
      width: nextWidth,
      lastExpandedWidth: nextWidth,
    });
  }, [persistSidebarLayout, toggleSidebarVisibility]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey) {
        return;
      }

      const isPrimaryModifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!isPrimaryModifier || event.key.toLowerCase() !== 'b') {
        return;
      }

      event.preventDefault();
      toggleSidebarVisibility();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, isMac, toggleSidebarVisibility]);

  useEffect(() => (
    () => {
      sidebarResizeCleanupRef.current?.();
      sidebarResizeCleanupRef.current = null;
      editorSplitResizeCleanupRef.current?.();
      editorSplitResizeCleanupRef.current = null;
      bottomPanelResizeCleanupRef.current?.();
      bottomPanelResizeCleanupRef.current = null;
    }
  ), []);

  const clearBannerForFile = useCallback((filePath?: string | null) => {
    if (!filePath) {
      return;
    }

    setBanner((currentBanner) => (
      currentBanner && currentBanner.filePath === filePath ? null : currentBanner
    ));
  }, []);

  const markDirty = useCallback((filePath: string, dirty: boolean) => {
    const nextDirtyPaths = new Set(dirtyPathsRef.current);
    if (dirty) {
      nextDirtyPaths.add(filePath);
    } else {
      nextDirtyPaths.delete(filePath);
    }
    dirtyPathsRef.current = nextDirtyPaths;

    setDirtyPaths((currentDirtyPaths) => {
      return new Set(nextDirtyPaths);
    });
  }, []);

  const markSaving = useCallback((filePath: string, saving: boolean) => {
    const nextSavingPaths = new Set(savingPathsRef.current);
    if (saving) {
      nextSavingPaths.add(filePath);
    } else {
      nextSavingPaths.delete(filePath);
    }
    savingPathsRef.current = nextSavingPaths;

    setSavingPaths((currentSavingPaths) => {
      return new Set(nextSavingPaths);
    });
  }, []);

  const getEntryStatus = useCallback((entryPath: string, entryType: CodePaneTreeEntry['type']) => {
    if (gitStatusByPath[entryPath]) {
      return gitStatusByPath[entryPath].status;
    }

    if (entryType === 'directory') {
      const matchingEntry = Object.keys(gitStatusByPath).find((candidatePath) => isPathInside(entryPath, candidatePath));
      return matchingEntry ? gitStatusByPath[matchingEntry].status : undefined;
    }

    return undefined;
  }, [gitStatusByPath]);

  const refreshProblems = useCallback(() => {
    const monaco = monacoRef.current;
    if (!monaco) {
      setProblems([]);
      return;
    }

      const nextProblems = Array.from(fileModelsRef.current.values())
      .flatMap((model) => monaco.editor.getModelMarkers({ resource: model.uri }).map((marker) => ({
        ...marker,
        filePath: model.uri.fsPath || model.uri.path,
      })))
      .sort((left, right) => {
        if (left.severity !== right.severity) {
          return right.severity - left.severity;
        }

        if (left.filePath !== right.filePath) {
          return left.filePath.localeCompare(right.filePath, undefined, { sensitivity: 'base' });
        }

        if (left.startLineNumber !== right.startLineNumber) {
          return left.startLineNumber - right.startLineNumber;
        }

        return left.startColumn - right.startColumn;
      });

    startTransition(() => {
      setProblems(nextProblems);
    });
  }, []);

  const ensureMarkerListener = useCallback((monaco: MonacoModule) => {
    if (markerListenerRef.current) {
      return;
    }

    markerListenerRef.current = monaco.editor.onDidChangeMarkers(() => {
      refreshProblems();
    });
  }, [refreshProblems]);

  const ensureMonacoReady = useCallback(async (): Promise<MonacoModule | null> => {
    if (!supportsMonaco) {
      return null;
    }

    try {
      const monaco = monacoRef.current ?? await ensureMonacoEnvironment();
      monacoRef.current = monaco;
      languageBridgeRef.current = ensureMonacoLanguageBridge(monaco);
      ensureMarkerListener(monaco);
      return monaco;
    } catch (error) {
      setBanner((currentBanner) => (
        currentBanner ?? {
          tone: 'error',
          message: error instanceof Error ? error.message : t('common.retry'),
        }
      ));
      return null;
    }
  }, [ensureMarkerListener, supportsMonaco, t]);

  const buildLanguageDocumentContext = useCallback((filePath: string) => {
    const model = fileModelsRef.current.get(filePath);
    const fileMeta = fileMetaRef.current.get(filePath);
    if (!model) {
      return null;
    }

    if (fileMeta?.readOnly) {
      return null;
    }

    return {
      paneId: pane.id,
      rootPath,
      filePath,
      language: fileMeta?.language ?? model.getLanguageId(),
      model,
    };
  }, [pane.id, rootPath]);

  const syncLanguageDocument = useCallback(async (
    filePath: string,
    reason: 'open' | 'change' | 'save',
  ) => {
    const bridge = languageBridgeRef.current ?? (
      monacoRef.current ? ensureMonacoLanguageBridge(monacoRef.current) : null
    );
    languageBridgeRef.current = bridge;
    const context = buildLanguageDocumentContext(filePath);
    if (!bridge || !context) {
      return;
    }

    if (reason === 'open') {
      bridge.openDocument(context);
      return;
    }

    if (reason === 'change') {
      await bridge.changeDocument(context);
      return;
    }

    await bridge.saveDocument(context);
  }, [buildLanguageDocumentContext]);

  const flushPendingLanguageSync = useCallback(async (filePath: string) => {
    const timer = documentSyncTimersRef.current.get(filePath);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    documentSyncTimersRef.current.delete(filePath);
    await syncLanguageDocument(filePath, 'change');
  }, [syncLanguageDocument]);

  const closeLanguageDocument = useCallback(async (filePath: string) => {
    const bridge = languageBridgeRef.current ?? (
      monacoRef.current ? ensureMonacoLanguageBridge(monacoRef.current) : null
    );
    languageBridgeRef.current = bridge;
    const context = buildLanguageDocumentContext(filePath);
    const timer = documentSyncTimersRef.current.get(filePath);
    if (timer) {
      clearTimeout(timer);
      documentSyncTimersRef.current.delete(filePath);
    }

    if (!bridge || !context) {
      return;
    }

    await bridge.closeDocument(context);
  }, [buildLanguageDocumentContext]);

  const closeAllLanguageDocuments = useCallback(async () => {
    const filePaths = Array.from(fileModelsRef.current.keys());
    for (const filePath of filePaths) {
      await closeLanguageDocument(filePath);
    }
  }, [closeLanguageDocument]);

  const clearDefinitionLookupCache = useCallback(() => {
    definitionLookupCacheRef.current.clear();
  }, []);

  const getModelRequestPath = useCallback((filePath: string) => (
    fileMetaRef.current.get(filePath)?.documentUri ?? filePath
  ), []);

  const getDefinitionLookupRange = useCallback((model: MonacoModel, lineNumber: number, column: number): MonacoRange => {
    const word = model.getWordAtPosition?.({ lineNumber, column });
    if (!word) {
      return createFallbackRange(lineNumber, column);
    }

    return {
      startLineNumber: lineNumber,
      startColumn: word.startColumn,
      endLineNumber: lineNumber,
      endColumn: word.endColumn,
    };
  }, []);

  const getDefinitionLookupKey = useCallback((model: MonacoModel, filePath: string, lineNumber: number, column: number) => {
    const range = getDefinitionLookupRange(model, lineNumber, column);
    const requestPath = getModelRequestPath(filePath);
    return `${requestPath}:${model.getLanguageId()}:${range.startLineNumber}:${range.startColumn}:${range.endColumn}`;
  }, [getDefinitionLookupRange, getModelRequestPath]);

  const lookupDefinitionTarget = useCallback(async (
    model: MonacoModel,
    filePath: string,
    lineNumber: number,
    column: number,
    options?: {
      showErrors?: boolean;
    },
  ) => {
    const requestPath = getModelRequestPath(filePath);
    const requestKey = getDefinitionLookupKey(model, filePath, lineNumber, column);

    let pendingLookup = definitionLookupCacheRef.current.get(requestKey);
    if (!pendingLookup) {
      pendingLookup = window.electronAPI.codePaneGetDefinition({
        rootPath,
        filePath: requestPath,
        language: model.getLanguageId(),
        position: {
          lineNumber,
          column,
        },
      }).then((response): DefinitionLookupResult => {
        if (!response.success) {
          return {
            location: null,
            error: response.error || t('common.retry'),
          };
        }

        return {
          location: response.data?.[0] ?? null,
        };
      }).catch((error): DefinitionLookupResult => ({
        location: null,
        error: error instanceof Error ? error.message : t('common.retry'),
      }));
      definitionLookupCacheRef.current.set(requestKey, pendingLookup);
    }

    const result = await pendingLookup;
    if (result.error && options?.showErrors) {
      setBanner({
        tone: 'warning',
        message: result.error,
        filePath,
      });
    }

    return {
      requestKey,
      range: getDefinitionLookupRange(model, lineNumber, column),
      location: result.location,
    };
  }, [getDefinitionLookupKey, getDefinitionLookupRange, getModelRequestPath, rootPath, t]);

  const clearDefinitionLinkDecoration = useCallback((editorInstance?: MonacoEditor | null) => {
    const targetEditor = editorInstance ?? definitionLinkDecorationEditorRef.current;
    if (targetEditor && typeof targetEditor.deltaDecorations === 'function') {
      definitionLinkDecorationIdsRef.current = targetEditor.deltaDecorations(
        definitionLinkDecorationIdsRef.current,
        [],
      );
    } else {
      definitionLinkDecorationIdsRef.current = [];
    }

    if (!editorInstance || targetEditor === definitionLinkDecorationEditorRef.current) {
      definitionLinkDecorationEditorRef.current = null;
    }

    definitionHoverRequestKeyRef.current = null;
  }, []);

  const applyDefinitionLinkDecoration = useCallback((editorInstance: MonacoEditor, range: MonacoRange) => {
    if (definitionLinkDecorationEditorRef.current && definitionLinkDecorationEditorRef.current !== editorInstance) {
      clearDefinitionLinkDecoration(definitionLinkDecorationEditorRef.current);
    }

    definitionLinkDecorationEditorRef.current = editorInstance;
    definitionLinkDecorationIdsRef.current = editorInstance.deltaDecorations(
      definitionLinkDecorationIdsRef.current,
      [{
        range,
        options: {
          inlineClassName: 'code-pane-definition-link',
        },
      }],
    );
  }, [clearDefinitionLinkDecoration]);

  const clearDebugDecorations = useCallback((editorInstance?: MonacoEditor | null) => {
    const targetEditor = editorInstance ?? debugDecorationEditorRef.current;
    if (targetEditor && typeof targetEditor.deltaDecorations === 'function') {
      debugDecorationIdsRef.current = targetEditor.deltaDecorations(debugDecorationIdsRef.current, []);
    } else {
      debugDecorationIdsRef.current = [];
    }

    if (!editorInstance || targetEditor === debugDecorationEditorRef.current) {
      debugDecorationEditorRef.current = null;
    }
  }, []);

  const applyDebugDecorations = useCallback((editorInstance: MonacoEditor | null, filePath: string | null) => {
    if (!editorInstance || !filePath) {
      clearDebugDecorations(editorInstance);
      return;
    }

    if (debugDecorationEditorRef.current && debugDecorationEditorRef.current !== editorInstance) {
      clearDebugDecorations(debugDecorationEditorRef.current);
    }

    const normalizedFilePath = normalizePath(filePath);
    const breakpointDecorations = breakpointsRef.current
      .filter((breakpoint) => normalizePath(breakpoint.filePath) === normalizedFilePath)
      .map((breakpoint) => ({
        range: {
          startLineNumber: breakpoint.lineNumber,
          startColumn: 1,
          endLineNumber: breakpoint.lineNumber,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          glyphMarginClassName: getBreakpointGlyphClassName(breakpoint),
          glyphMarginHoverMessage: [{ value: formatBreakpointHoverMessage(breakpoint) }],
        },
      }));
    const currentFrame = debugCurrentFrameRef.current;
    const currentFrameDecorations = currentFrame?.filePath && normalizePath(currentFrame.filePath) === normalizedFilePath && currentFrame.lineNumber
      ? [{
        range: {
          startLineNumber: currentFrame.lineNumber,
          startColumn: 1,
          endLineNumber: currentFrame.lineNumber,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'code-pane-debug-current-line',
          glyphMarginClassName: 'code-pane-debug-current-glyph',
          glyphMarginHoverMessage: [{ value: `Paused at ${currentFrame.lineNumber}` }],
        },
      }]
      : [];

    debugDecorationEditorRef.current = editorInstance;
    debugDecorationIdsRef.current = editorInstance.deltaDecorations(
      debugDecorationIdsRef.current,
      [...breakpointDecorations, ...currentFrameDecorations],
    );
  }, [clearDebugDecorations]);

  const updateDefinitionLinkHover = useCallback(async (
    editorInstance: MonacoEditor | null,
    lineNumber: number,
    column: number,
  ) => {
    const model = editorInstance?.getModel();
    const filePath = activeFilePathRef.current ?? model?.uri.fsPath ?? model?.uri.path;
    if (!editorInstance || !model || !filePath) {
      clearDefinitionLinkDecoration(editorInstance);
      return;
    }

    const { requestKey, range, location } = await lookupDefinitionTarget(
      model,
      filePath,
      lineNumber,
      column,
      { showErrors: false },
    );

    if (definitionHoverRequestKeyRef.current !== requestKey) {
      return;
    }

    if (!location) {
      clearDefinitionLinkDecoration(editorInstance);
      return;
    }

    applyDefinitionLinkDecoration(editorInstance, range);
  }, [applyDefinitionLinkDecoration, clearDefinitionLinkDecoration, lookupDefinitionTarget]);

  const applyPendingNavigation = useCallback((editorInstance: MonacoEditor | null, filePath: string) => {
    const pendingNavigation = pendingNavigationRef.current;
    if (!editorInstance || !pendingNavigation || pendingNavigation.filePath !== filePath) {
      return;
    }

    editorInstance.setPosition?.({
      lineNumber: pendingNavigation.lineNumber,
      column: pendingNavigation.column,
    });
    editorInstance.setSelection?.({
      startLineNumber: pendingNavigation.lineNumber,
      startColumn: pendingNavigation.column,
      endLineNumber: pendingNavigation.lineNumber,
      endColumn: pendingNavigation.column + 1,
    });
    editorInstance.revealLineInCenter?.(pendingNavigation.lineNumber);
    pendingNavigationRef.current = null;
  }, []);

  const saveCurrentViewState = useCallback(() => {
    const currentFilePath = activeFilePathRef.current;
    if (!currentFilePath) {
      return;
    }

    const currentViewMode = paneRef.current.code?.viewMode ?? viewMode;
    if (currentViewMode === 'diff') {
      viewStatesRef.current.set(currentFilePath, diffEditorRef.current?.getModifiedEditor().saveViewState() ?? null);
      return;
    }

    viewStatesRef.current.set(currentFilePath, editorRef.current?.saveViewState() ?? null);
    const currentSecondaryFilePath = secondaryFilePathRef.current;
    if (currentSecondaryFilePath) {
      secondaryViewStatesRef.current.set(
        currentSecondaryFilePath,
        secondaryEditorRef.current?.saveViewState() ?? null,
      );
    }
  }, [viewMode]);

  const disposeEditors = useCallback(() => {
    saveCurrentViewState();
    editorMouseDownListenerRef.current?.dispose();
    editorMouseDownListenerRef.current = null;
    editorMouseMoveListenerRef.current?.dispose();
    editorMouseMoveListenerRef.current = null;
    editorMouseLeaveListenerRef.current?.dispose();
    editorMouseLeaveListenerRef.current = null;
    editorCursorPositionListenerRef.current?.dispose();
    editorCursorPositionListenerRef.current = null;
    secondaryEditorMouseDownListenerRef.current?.dispose();
    secondaryEditorMouseDownListenerRef.current = null;
    secondaryEditorMouseMoveListenerRef.current?.dispose();
    secondaryEditorMouseMoveListenerRef.current = null;
    secondaryEditorMouseLeaveListenerRef.current?.dispose();
    secondaryEditorMouseLeaveListenerRef.current = null;
    secondaryEditorCursorPositionListenerRef.current?.dispose();
    secondaryEditorCursorPositionListenerRef.current = null;
    diffEditorMouseDownListenerRef.current?.dispose();
    diffEditorMouseDownListenerRef.current = null;
    diffEditorMouseMoveListenerRef.current?.dispose();
    diffEditorMouseMoveListenerRef.current = null;
    diffEditorMouseLeaveListenerRef.current?.dispose();
    diffEditorMouseLeaveListenerRef.current = null;
    diffEditorCursorPositionListenerRef.current?.dispose();
    diffEditorCursorPositionListenerRef.current = null;
    clearDefinitionLinkDecoration();
    clearDebugDecorations();
    editorRef.current?.dispose();
    secondaryEditorRef.current?.dispose();
    diffEditorRef.current?.dispose();
    editorRef.current = null;
    secondaryEditorRef.current = null;
    diffEditorRef.current = null;
  }, [clearDebugDecorations, clearDefinitionLinkDecoration, saveCurrentViewState]);

  const disposeAllModels = useCallback(() => {
    for (const timer of autoSaveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    autoSaveTimersRef.current.clear();

    for (const timer of documentSyncTimersRef.current.values()) {
      clearTimeout(timer);
    }
    documentSyncTimersRef.current.clear();

    for (const timer of localHistoryTimersRef.current.values()) {
      clearTimeout(timer);
    }
    localHistoryTimersRef.current.clear();

    for (const disposable of modelDisposersRef.current.values()) {
      disposable.dispose();
    }
    modelDisposersRef.current.clear();

    for (const model of fileModelsRef.current.values()) {
      model.dispose();
    }
    fileModelsRef.current.clear();

    for (const model of diffModelsRef.current.values()) {
      model.dispose();
    }
    diffModelsRef.current.clear();

    fileMetaRef.current.clear();
    preloadedReadResultsRef.current.clear();
    clearDefinitionLookupCache();
    viewStatesRef.current.clear();
    setProblems([]);
  }, [clearDefinitionLookupCache]);

  const refreshGitSnapshot = useCallback(async (options?: { includeGraph?: boolean }) => {
    const includeGraph = options?.includeGraph ?? (
      sidebarVisibleRef.current && sidebarModeRef.current === 'scm'
    );

    const statusPromise = window.electronAPI.codePaneGetGitStatus({ rootPath });
    const summaryPromise = window.electronAPI.codePaneGetGitRepositorySummary({ rootPath });
    const graphPromise = includeGraph
      ? window.electronAPI.codePaneGetGitGraph({ rootPath, limit: 60 })
      : Promise.resolve(null);

    const [statusResponse, summaryResponse, graphResponse] = await Promise.all([
      statusPromise,
      summaryPromise,
      graphPromise,
    ]);

    startTransition(() => {
      setGitStatusByPath(
        statusResponse?.success
          ? Object.fromEntries((statusResponse.data ?? []).map((entry) => [entry.path, entry]))
          : {},
      );
      setGitRepositorySummary(summaryResponse?.success ? summaryResponse.data ?? null : null);
      if (includeGraph) {
        const nextGraph = graphResponse?.success ? graphResponse.data ?? [] : [];
        setGitGraph(nextGraph);
        setSelectedGitLogCommitSha((currentCommitSha) => (
          currentCommitSha && nextGraph.some((commit) => commit.sha === currentCommitSha)
            ? currentCommitSha
            : nextGraph[0]?.sha ?? null
        ));
      }
    });
  }, [rootPath]);

  const loadGitBranches = useCallback(async (options?: { preferredBaseRef?: string }) => {
    setIsGitBranchesLoading(true);
    setGitBranchesError(null);

    const response = await window.electronAPI.codePaneGetGitBranches({ rootPath });
    if (!response.success || !response.data) {
      setGitBranches([]);
      setGitBranchesError(response.error || t('common.retry'));
      setIsGitBranchesLoading(false);
      return;
    }

    const branches = response.data;
    startTransition(() => {
      setGitBranches(branches);
      setSelectedGitBranchName((currentBranchName) => (
        currentBranchName && branches.some((branch) => branch.name === currentBranchName)
          ? currentBranchName
          : branches.find((branch) => branch.current)?.name ?? branches[0]?.name ?? null
      ));
      setGitRebaseBaseRef((currentBaseRef) => {
        const preferredBaseRef = options?.preferredBaseRef ?? currentBaseRef;
        if (preferredBaseRef && branches.some((branch) => branch.name === preferredBaseRef)) {
          return preferredBaseRef;
        }

        return branches.find((branch) => branch.current)?.upstream
          ?? branches.find((branch) => branch.kind === 'local' && !branch.current)?.name
          ?? branches[0]?.name
          ?? '';
      });
    });
    setIsGitBranchesLoading(false);
  }, [rootPath, t]);

  const handleSelectGitBranch = useCallback((branchName: string) => {
    setSelectedGitBranchName(branchName);
    const selectedBranch = gitBranches.find((branch) => branch.name === branchName);
    if (selectedBranch?.commitSha) {
      setSelectedGitLogCommitSha(selectedBranch.commitSha);
    }
  }, [gitBranches]);

  const loadGitRebasePlan = useCallback(async (baseRef: string) => {
    if (!baseRef) {
      setGitRebasePlan(null);
      setGitRebaseError(null);
      setIsGitRebaseLoading(false);
      return;
    }

    setIsGitRebaseLoading(true);
    setGitRebaseError(null);
    const response = await window.electronAPI.codePaneGetGitRebasePlan({
      rootPath,
      baseRef,
    });

    if (!response.success || !response.data) {
      setGitRebasePlan(null);
      setGitRebaseError(response.error || t('common.retry'));
      setIsGitRebaseLoading(false);
      return;
    }

    const rebasePlan = response.data;
    startTransition(() => {
      setGitRebasePlan(rebasePlan);
      setGitRebaseBaseRef(rebasePlan.baseRef);
    });
    setIsGitRebaseLoading(false);
  }, [rootPath, t]);

  const loadGitConflictDetails = useCallback(async (filePath: string | null) => {
    if (!filePath) {
      setGitConflictDetails(null);
      setGitConflictError(null);
      setIsGitConflictLoading(false);
      return;
    }

    setIsGitConflictLoading(true);
    setGitConflictError(null);
    const response = await window.electronAPI.codePaneGetGitConflictDetails({
      rootPath,
      filePath,
    });

    if (!response.success || !response.data) {
      setGitConflictDetails(null);
      setGitConflictError(response.error || t('common.retry'));
      setIsGitConflictLoading(false);
      return;
    }

    startTransition(() => {
      setSelectedGitConflictPath(filePath);
      setGitConflictDetails(response.data ?? null);
    });
    setIsGitConflictLoading(false);
  }, [rootPath, t]);

  const loadGitDiffHunks = useCallback(async (filePath: string | null) => {
    if (!filePath) {
      setGitStagedHunks([]);
      setGitUnstagedHunks([]);
      setGitHunksError(null);
      setIsGitHunksLoading(false);
      return;
    }

    setIsGitHunksLoading(true);
    setGitHunksError(null);
    const response = await window.electronAPI.codePaneGetGitDiffHunks({
      rootPath,
      filePath,
    });

    if (!response.success || !response.data) {
      setGitStagedHunks([]);
      setGitUnstagedHunks([]);
      setGitHunksError(response.error || t('common.retry'));
      setIsGitHunksLoading(false);
      return;
    }

    const diffHunks = response.data;
    startTransition(() => {
      setGitStagedHunks(diffHunks.stagedHunks ?? []);
      setGitUnstagedHunks(diffHunks.unstagedHunks ?? []);
    });
    setIsGitHunksLoading(false);
  }, [rootPath, t]);

  const loadDirectory = useCallback(async (
    directoryPath: string,
    options?: { showLoadingIndicator?: boolean },
  ) => {
    const showLoadingIndicator = options?.showLoadingIndicator ?? true;

    if (showLoadingIndicator) {
      setLoadingDirectories((currentLoadingDirectories) => {
        const nextLoadingDirectories = new Set(currentLoadingDirectories);
        nextLoadingDirectories.add(directoryPath);
        return nextLoadingDirectories;
      });
    }

    const response = await window.electronAPI.codePaneListDirectory({
      rootPath,
      targetPath: directoryPath,
    });

    if (response.success) {
      if (directoryPath === rootPath) {
        setTreeLoadError(null);
      }

      startTransition(() => {
        setTreeEntriesByDirectory((currentTreeEntries) => ({
          ...currentTreeEntries,
          [directoryPath]: response.data ?? [],
        }));
        setLoadedDirectories((currentLoadedDirectories) => {
          const nextLoadedDirectories = new Set(currentLoadedDirectories);
          nextLoadedDirectories.add(directoryPath);
          return nextLoadedDirectories;
        });
      });
    } else if (directoryPath === rootPath) {
      setTreeLoadError(response.error || t('common.retry'));
    } else {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
    }

    if (showLoadingIndicator) {
      setLoadingDirectories((currentLoadingDirectories) => {
        const nextLoadingDirectories = new Set(currentLoadingDirectories);
        nextLoadingDirectories.delete(directoryPath);
        return nextLoadingDirectories;
      });
    }
  }, [rootPath, t]);

  const loadExternalLibrarySections = useCallback(async () => {
    const response = await window.electronAPI.codePaneGetExternalLibrarySections({
      rootPath,
    });

    if (!response.success) {
      setExternalLibrariesError(response.error || t('common.retry'));
      setExternalLibrarySections([]);
      return [];
    }

    const nextSections = response.data ?? [];
    const nextExternalRootPaths = nextSections.flatMap((section) => section.roots.map((root) => root.path));

    setExternalLibrariesError(null);
    setExternalLibrarySections(nextSections);
    setExternalEntriesByDirectory((currentEntries) => (
      Object.fromEntries(
        Object.entries(currentEntries).filter(([directoryPath]) => (
          nextExternalRootPaths.some((rootDirectoryPath) => isPathInside(rootDirectoryPath, directoryPath))
        )),
      )
    ));
    setLoadedExternalDirectories((currentLoadedDirectories) => (
      new Set(
        Array.from(currentLoadedDirectories).filter((directoryPath) => (
          nextExternalRootPaths.some((rootDirectoryPath) => isPathInside(rootDirectoryPath, directoryPath))
        )),
      )
    ));
    setLoadingExternalDirectories((currentLoadingDirectories) => (
      new Set(
        Array.from(currentLoadingDirectories).filter((directoryPath) => (
          nextExternalRootPaths.some((rootDirectoryPath) => isPathInside(rootDirectoryPath, directoryPath))
        )),
      )
    ));
    setExpandedDirectories((currentExpandedDirectories) => (
      new Set(
        Array.from(currentExpandedDirectories).filter((directoryPath) => (
          isPathInside(rootPath, directoryPath)
          || nextExternalRootPaths.some((rootDirectoryPath) => isPathInside(rootDirectoryPath, directoryPath))
        )),
      )
    ));
    return nextSections;
  }, [rootPath, t]);

  const loadExternalDirectory = useCallback(async (
    directoryPath: string,
    options?: { showLoadingIndicator?: boolean },
  ) => {
    const showLoadingIndicator = options?.showLoadingIndicator ?? true;

    if (showLoadingIndicator) {
      setLoadingExternalDirectories((currentLoadingDirectories) => {
        const nextLoadingDirectories = new Set(currentLoadingDirectories);
        nextLoadingDirectories.add(directoryPath);
        return nextLoadingDirectories;
      });
    }

    const response = await window.electronAPI.codePaneListDirectory({
      rootPath,
      targetPath: directoryPath,
    });

    if (response.success) {
      setExternalLibrariesError(null);
      startTransition(() => {
        setExternalEntriesByDirectory((currentTreeEntries) => ({
          ...currentTreeEntries,
          [directoryPath]: response.data ?? [],
        }));
        setLoadedExternalDirectories((currentLoadedDirectories) => {
          const nextLoadedDirectories = new Set(currentLoadedDirectories);
          nextLoadedDirectories.add(directoryPath);
          return nextLoadedDirectories;
        });
      });
    } else {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
    }

    if (showLoadingIndicator) {
      setLoadingExternalDirectories((currentLoadingDirectories) => {
        const nextLoadingDirectories = new Set(currentLoadingDirectories);
        nextLoadingDirectories.delete(directoryPath);
        return nextLoadingDirectories;
      });
    }
  }, [rootPath, t]);

  const loadExplorerDirectory = useCallback(async (
    directoryPath: string,
    options?: { showLoadingIndicator?: boolean },
  ) => {
    if (isPathInside(rootPath, directoryPath)) {
      await loadDirectory(directoryPath, options);
      return;
    }

    await loadExternalDirectory(directoryPath, options);
  }, [loadDirectory, loadExternalDirectory, rootPath]);

  const isDirectoryLoaded = useCallback((directoryPath: string) => (
    isPathInside(rootPath, directoryPath)
      ? loadedDirectoriesRef.current.has(directoryPath)
      : loadedExternalDirectoriesRef.current.has(directoryPath)
  ), [rootPath]);

  const isDirectoryLoading = useCallback((directoryPath: string) => (
    isPathInside(rootPath, directoryPath)
      ? loadingDirectories.has(directoryPath)
      : loadingExternalDirectories.has(directoryPath)
  ), [loadingDirectories, loadingExternalDirectories, rootPath]);

  const getDirectoryEntries = useCallback((directoryPath: string) => (
    isPathInside(rootPath, directoryPath)
      ? (treeEntriesByDirectory[directoryPath] ?? [])
      : (externalEntriesByDirectory[directoryPath] ?? [])
  ), [externalEntriesByDirectory, rootPath, treeEntriesByDirectory]);

  const revealPathInExplorer = useCallback(async (targetPath: string) => {
    const directoryPathsToExpand: string[] = [];
    let currentPath = getParentDirectory(targetPath);

    while (isPathInside(rootPath, currentPath) && currentPath !== rootPath) {
      directoryPathsToExpand.unshift(currentPath);
      const parentPath = getParentDirectory(currentPath);
      if (parentPath === currentPath) {
        break;
      }
      currentPath = parentPath;
    }

    const nextExpandedDirectories = new Set(expandedDirectoriesRef.current);
    nextExpandedDirectories.add(rootPath);
    for (const directoryPath of directoryPathsToExpand) {
      nextExpandedDirectories.add(directoryPath);
    }

    setExpandedDirectories(nextExpandedDirectories);
    persistCodeState({
      selectedPath: targetPath,
      expandedPaths: getPersistedExpandedPaths(nextExpandedDirectories),
    });
    handleSidebarModeSelect('files');

    const directoriesToLoad = directoryPathsToExpand.filter((directoryPath) => !loadedDirectoriesRef.current.has(directoryPath));
    if (directoriesToLoad.length > 0) {
      await Promise.all(directoriesToLoad.map((directoryPath) => loadDirectory(directoryPath)));
    }
  }, [getPersistedExpandedPaths, handleSidebarModeSelect, loadDirectory, persistCodeState, rootPath]);

  const createOrUpdateModel = useCallback((filePath: string, readResult: CodePaneReadFileResult) => {
    const monaco = monacoRef.current;
    if (!monaco) {
      return null;
    }

    const modelUri = readResult.documentUri
      ? monaco.Uri.parse(readResult.documentUri)
      : monaco.Uri.file(filePath);
    let model = fileModelsRef.current.get(filePath);
    if (!model) {
      model = monaco.editor.createModel(readResult.content, readResult.language, modelUri);
      const disposable = model.onDidChangeContent(() => {
        if (fileMetaRef.current.get(filePath)?.readOnly) {
          return;
        }

        clearDefinitionLookupCache();

        if (suppressModelEventsRef.current.has(filePath)) {
          return;
        }

        promotePreviewTab(filePath);
        markDirty(filePath, true);
        scheduleLocalHistorySnapshot(filePath);
        const existingTimer = autoSaveTimersRef.current.get(filePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const existingDocumentSyncTimer = documentSyncTimersRef.current.get(filePath);
        if (existingDocumentSyncTimer) {
          clearTimeout(existingDocumentSyncTimer);
        }

        documentSyncTimersRef.current.set(filePath, setTimeout(() => {
          documentSyncTimersRef.current.delete(filePath);
          void syncLanguageDocument(filePath, 'change');
        }, 150));

        autoSaveTimersRef.current.set(filePath, setTimeout(() => {
          autoSaveTimersRef.current.delete(filePath);
          void saveFile(filePath);
        }, 800));
      });

      modelDisposersRef.current.set(filePath, disposable);
      fileModelsRef.current.set(filePath, model);
    } else {
      if (model.getLanguageId() !== readResult.language) {
        monaco.editor.setModelLanguage(model, readResult.language);
      }

      if (model.getValue() !== readResult.content) {
        suppressModelEventsRef.current.add(filePath);
        model.setValue(readResult.content);
        suppressModelEventsRef.current.delete(filePath);
        clearDefinitionLookupCache();
      }
    }

    fileMetaRef.current.set(filePath, {
      language: readResult.language,
      mtimeMs: readResult.mtimeMs,
      size: readResult.size,
      lastSavedAt: fileMetaRef.current.get(filePath)?.lastSavedAt,
      readOnly: readResult.readOnly,
      displayPath: readResult.displayPath,
      documentUri: readResult.documentUri,
    });
    modelFilePathRef.current.set(modelUri.path, filePath);

    markDirty(filePath, false);
    clearBannerForFile(filePath);
    refreshProblems();
    addLocalHistoryEntry(filePath, 'open', readResult.content);
    if (!readResult.readOnly) {
      void syncLanguageDocument(filePath, 'open');
    }
    return model;
  }, [
    addLocalHistoryEntry,
    clearBannerForFile,
    clearDefinitionLookupCache,
    markDirty,
    promotePreviewTab,
    refreshProblems,
    scheduleLocalHistorySnapshot,
    syncLanguageDocument,
  ]);

  const loadFileIntoModel = useCallback(async (filePath: string) => {
    if (!monacoRef.current && supportsMonaco) {
      const monaco = await ensureMonacoReady();
      if (!monaco) {
        return null;
      }
    }

    const preloadedReadResult = preloadedReadResultsRef.current.get(filePath);
    if (preloadedReadResult) {
      preloadedReadResultsRef.current.delete(filePath);
      return createOrUpdateModel(filePath, preloadedReadResult);
    }

    const response = await window.electronAPI.codePaneReadFile({
      rootPath,
      filePath,
      ...(isVirtualDocumentPath(filePath) ? { documentUri: filePath } : {}),
    });

    if (!response.success || !response.data) {
      if (response.errorCode === CODE_PANE_BINARY_FILE_ERROR_CODE) {
        setBanner({
          tone: 'info',
          message: t('codePane.binaryFile'),
          filePath,
        });
      } else if (response.errorCode === CODE_PANE_FILE_TOO_LARGE_ERROR_CODE) {
        setBanner({
          tone: 'info',
          message: t('codePane.fileTooLarge'),
          filePath,
        });
      } else {
        setBanner({
          tone: 'error',
          message: response.error || t('common.retry'),
          filePath,
        });
      }
      return null;
    }

    return createOrUpdateModel(filePath, response.data);
  }, [createOrUpdateModel, ensureMonacoReady, rootPath, supportsMonaco, t]);

  const getModelFilePath = useCallback((model: MonacoModel | null | undefined) => {
    if (!model) {
      return null;
    }

    return modelFilePathRef.current.get(model.uri.path)
      ?? model.uri.fsPath
      ?? model.uri.path
      ?? null;
  }, []);

  const handleDefinitionClick = useCallback(async (editorInstance: MonacoEditor | null, lineNumber: number, column: number) => {
    const model = editorInstance?.getModel();
    const filePath = getModelFilePath(model);
    if (!model || !filePath) {
      return;
    }

    const { location: nextLocation } = await lookupDefinitionTarget(
      model,
      filePath,
      lineNumber,
      column,
      { showErrors: true },
    );
    if (!nextLocation) {
      return;
    }

    await openFileLocationRef.current({
      filePath: nextLocation.filePath,
      lineNumber: nextLocation.range.startLineNumber,
      column: nextLocation.range.startColumn,
      content: nextLocation.content,
      language: nextLocation.language,
      readOnly: nextLocation.readOnly,
      displayPath: nextLocation.displayPath,
      documentUri: nextLocation.uri,
    });
  }, [getModelFilePath, lookupDefinitionTarget]);

  const attachDefinitionClickNavigation = useCallback((
    editorInstance: MonacoEditor | null,
    target: EditorTarget,
  ) => {
    const mouseDownListenerRef = target === 'editor'
      ? editorMouseDownListenerRef
      : target === 'secondary'
        ? secondaryEditorMouseDownListenerRef
        : diffEditorMouseDownListenerRef;
    const mouseMoveListenerRef = target === 'editor'
      ? editorMouseMoveListenerRef
      : target === 'secondary'
        ? secondaryEditorMouseMoveListenerRef
        : diffEditorMouseMoveListenerRef;
    const mouseLeaveListenerRef = target === 'editor'
      ? editorMouseLeaveListenerRef
      : target === 'secondary'
        ? secondaryEditorMouseLeaveListenerRef
        : diffEditorMouseLeaveListenerRef;
    const cursorPositionListenerRef = target === 'editor'
      ? editorCursorPositionListenerRef
      : target === 'secondary'
        ? secondaryEditorCursorPositionListenerRef
        : diffEditorCursorPositionListenerRef;

    mouseDownListenerRef.current?.dispose();
    mouseDownListenerRef.current = null;
    mouseMoveListenerRef.current?.dispose();
    mouseMoveListenerRef.current = null;
    mouseLeaveListenerRef.current?.dispose();
    mouseLeaveListenerRef.current = null;
    cursorPositionListenerRef.current?.dispose();
    cursorPositionListenerRef.current = null;

    if (!editorInstance || typeof editorInstance.onMouseDown !== 'function') {
      return;
    }

    mouseMoveListenerRef.current = editorInstance.onMouseMove?.((event: any) => {
      const pointerEvent = event.event?.browserEvent ?? event.event ?? {};
      const hasModifier = isMac
        ? pointerEvent.metaKey === true && pointerEvent.ctrlKey !== true
        : pointerEvent.ctrlKey === true && pointerEvent.metaKey !== true;

      if (!hasModifier || !event.target?.position) {
        clearDefinitionLinkDecoration(editorInstance);
        return;
      }

      const model = editorInstance.getModel?.();
      const filePath = getModelFilePath(model);
      if (!model || !filePath) {
        clearDefinitionLinkDecoration(editorInstance);
        return;
      }

      const requestKey = getDefinitionLookupKey(
        model,
        filePath,
        event.target.position.lineNumber,
        event.target.position.column,
      );
      if (definitionHoverRequestKeyRef.current === requestKey) {
        return;
      }

      definitionHoverRequestKeyRef.current = requestKey;
      void updateDefinitionLinkHover(
        editorInstance,
        event.target.position.lineNumber,
        event.target.position.column,
      );
    }) ?? null;

    mouseLeaveListenerRef.current = editorInstance.onMouseLeave?.(() => {
      clearDefinitionLinkDecoration(editorInstance);
    }) ?? null;

    cursorPositionListenerRef.current = editorInstance.onDidChangeCursorPosition?.((event: any) => {
      if (event?.position?.lineNumber) {
        setActiveCursorLineNumber(event.position.lineNumber);
        setActiveCursorColumn(event.position.column ?? 1);
      }
    }) ?? null;

    mouseDownListenerRef.current = editorInstance.onMouseDown((event: any) => {
      focusedEditorTargetRef.current = target;
      setActiveEditorTarget(target);
      if (event?.target?.position?.lineNumber) {
        setActiveCursorLineNumber(event.target.position.lineNumber);
        setActiveCursorColumn(event.target.position.column ?? 1);
      }
      const pointerEvent = event.event?.browserEvent ?? event.event ?? {};
      const monaco = monacoRef.current;
      const mouseTargetType = event.target?.type;
      const gutterGlyphMarginType = monaco?.editor?.MouseTargetType?.GUTTER_GLYPH_MARGIN;
      const gutterLineDecorationType = monaco?.editor?.MouseTargetType?.GUTTER_LINE_DECORATIONS;
      const isGutterBreakpointTarget = (gutterGlyphMarginType !== undefined && mouseTargetType === gutterGlyphMarginType)
        || (gutterLineDecorationType !== undefined && mouseTargetType === gutterLineDecorationType)
        || mouseTargetType === 'gutterGlyphMargin'
        || event.target?.detail?.isBreakpointMargin === true;
      if (isGutterBreakpointTarget && event.target?.position?.lineNumber) {
        const model = editorInstance.getModel?.();
        const filePath = getModelFilePath(model);
        const isReadOnlyFile = filePath
          ? fileMetaRef.current.get(filePath)?.readOnly === true
          : false;
        if (filePath && !isReadOnlyFile) {
          pointerEvent.preventDefault?.();
          pointerEvent.stopPropagation?.();
          event.event?.preventDefault?.();
          event.event?.stopPropagation?.();
          void toggleBreakpointRef.current(filePath, event.target.position.lineNumber);
        }
        return;
      }

      const hasModifier = isMac
        ? pointerEvent.metaKey === true && pointerEvent.ctrlKey !== true
        : pointerEvent.ctrlKey === true && pointerEvent.metaKey !== true;
      const isPrimaryButton = event.event?.leftButton === true
        || pointerEvent.button === 0
        || pointerEvent.buttons === 1;

      if (!hasModifier || !isPrimaryButton || !event.target?.position) {
        return;
      }

      pointerEvent.preventDefault?.();
      pointerEvent.stopPropagation?.();
      event.event?.preventDefault?.();
      event.event?.stopPropagation?.();

      void handleDefinitionClick(
        editorInstance,
        event.target.position.lineNumber,
        event.target.position.column,
      );
    });
  }, [
    clearDefinitionLinkDecoration,
    getDefinitionLookupKey,
    getModelFilePath,
    handleDefinitionClick,
    isMac,
    updateDefinitionLinkHover,
  ]);

  const refreshEditorSurface = useCallback(async () => {
    const hostElement = editorHostRef.current;
    if (!hostElement) {
      return;
    }

    const monaco = await ensureMonacoReady();
    if (!monaco) {
      disposeEditors();
      return;
    }

    const currentActiveFilePath = activeFilePathRef.current;
    const currentViewMode = paneRef.current.code?.viewMode ?? viewMode;
    const currentSecondaryFilePath = secondaryFilePathRef.current;
    const shouldShowSplit = currentViewMode === 'editor'
      && Boolean(paneRef.current.code?.layout?.editorSplit?.visible)
      && Boolean(currentSecondaryFilePath)
      && secondaryEditorHostRef.current;

    if (!currentActiveFilePath) {
      disposeEditors();
      return;
    }

    const model = fileModelsRef.current.get(currentActiveFilePath);
    if (!model) {
      return;
    }
    const isReadOnlyFile = fileMetaRef.current.get(currentActiveFilePath)?.readOnly === true;

    saveCurrentViewState();

    if (currentViewMode === 'diff') {
      const diffModel = diffModelsRef.current.get(currentActiveFilePath);
      if (!diffModel) {
        disposeEditors();
        return;
      }

      secondaryEditorMouseDownListenerRef.current?.dispose();
      secondaryEditorMouseDownListenerRef.current = null;
      secondaryEditorMouseMoveListenerRef.current?.dispose();
      secondaryEditorMouseMoveListenerRef.current = null;
      secondaryEditorMouseLeaveListenerRef.current?.dispose();
      secondaryEditorMouseLeaveListenerRef.current = null;
      secondaryEditorCursorPositionListenerRef.current?.dispose();
      secondaryEditorCursorPositionListenerRef.current = null;
      secondaryEditorRef.current?.dispose();
      secondaryEditorRef.current = null;
      editorRef.current?.dispose();
      editorRef.current = null;

      if (!diffEditorRef.current) {
        diffEditorRef.current = monaco.editor.createDiffEditor(hostElement, {
          automaticLayout: true,
          minimap: { enabled: false },
          links: true,
          definitionLinkOpensInPeek: false,
          renderSideBySide: true,
          wordWrap: 'off',
          fontSize: 13,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          glyphMargin: true,
          stickyScroll: { enabled: false },
          ...editorInlayHintOptions,
        });
        diffEditorRef.current.getModifiedEditor().addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => {
            const filePath = activeFilePathRef.current;
            if (filePath) {
              void saveFile(filePath);
            }
          },
        );
        attachDefinitionClickNavigation(diffEditorRef.current.getModifiedEditor(), 'diff');
      }

      diffEditorRef.current.setModel({
        original: diffModel,
        modified: model,
      });
      diffEditorRef.current.getModifiedEditor().updateOptions?.({
        readOnly: isReadOnlyFile,
        ...editorInlayHintOptions,
      });
      applyDebugDecorations(diffEditorRef.current.getModifiedEditor(), currentActiveFilePath);

      const savedViewState = viewStatesRef.current.get(currentActiveFilePath);
      if (savedViewState) {
        diffEditorRef.current.getModifiedEditor().restoreViewState(savedViewState);
      }

      applyPendingNavigation(diffEditorRef.current.getModifiedEditor(), currentActiveFilePath);

      if (isActive) {
        focusedEditorTargetRef.current = 'diff';
        setActiveEditorTarget('diff');
        diffEditorRef.current.getModifiedEditor().focus();
      }
      return;
    }

    diffEditorMouseDownListenerRef.current?.dispose();
    diffEditorMouseDownListenerRef.current = null;
    diffEditorRef.current?.dispose();
    diffEditorRef.current = null;

    const ensureCodeEditor = (target: 'editor' | 'secondary', host: HTMLElement) => {
      const editorInstanceRef = target === 'editor' ? editorRef : secondaryEditorRef;
      if (editorInstanceRef.current) {
        return editorInstanceRef.current;
      }

      const nextEditor = monaco.editor.create(host, {
        automaticLayout: true,
        minimap: { enabled: false },
        links: true,
        definitionLinkOpensInPeek: false,
        wordWrap: 'off',
        fontSize: 13,
        tabSize: 2,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        glyphMargin: true,
        stickyScroll: { enabled: false },
        ...editorInlayHintOptions,
      });
      nextEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const filePath = target === 'secondary'
          ? secondaryFilePathRef.current
          : activeFilePathRef.current;
        if (filePath) {
          void saveFileRef.current(filePath);
        }
      });
      nextEditor.addCommand(monaco.KeyCode.F2, () => {
        void renameSymbolAtCursorRef.current();
      });
      nextEditor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F12, () => {
        void findUsagesAtCursorRef.current();
      });
      nextEditor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
        void formatActiveDocumentRef.current();
      });
      attachDefinitionClickNavigation(nextEditor, target);
      editorInstanceRef.current = nextEditor;
      return nextEditor;
    };

    const primaryEditor = ensureCodeEditor('editor', hostElement);
    primaryEditor.setModel(model);
    primaryEditor.updateOptions?.({
      readOnly: isReadOnlyFile,
      ...editorInlayHintOptions,
    });
    applyDebugDecorations(primaryEditor, currentActiveFilePath);

    const savedViewState = viewStatesRef.current.get(currentActiveFilePath);
    if (savedViewState) {
      primaryEditor.restoreViewState(savedViewState);
    }

    applyPendingNavigation(primaryEditor, currentActiveFilePath);

    if (shouldShowSplit && currentSecondaryFilePath) {
      const secondaryModel = fileModelsRef.current.get(currentSecondaryFilePath);
      if (secondaryModel && secondaryEditorHostRef.current) {
        const secondaryEditor = ensureCodeEditor('secondary', secondaryEditorHostRef.current);
        secondaryEditor.setModel(secondaryModel);
        secondaryEditor.updateOptions?.({
          readOnly: fileMetaRef.current.get(currentSecondaryFilePath)?.readOnly === true,
          ...editorInlayHintOptions,
        });

        const savedSecondaryViewState = secondaryViewStatesRef.current.get(currentSecondaryFilePath);
        if (savedSecondaryViewState) {
          secondaryEditor.restoreViewState(savedSecondaryViewState);
        }
      }
    } else {
      secondaryEditorMouseDownListenerRef.current?.dispose();
      secondaryEditorMouseDownListenerRef.current = null;
      secondaryEditorMouseMoveListenerRef.current?.dispose();
      secondaryEditorMouseMoveListenerRef.current = null;
      secondaryEditorMouseLeaveListenerRef.current?.dispose();
      secondaryEditorMouseLeaveListenerRef.current = null;
      secondaryEditorCursorPositionListenerRef.current?.dispose();
      secondaryEditorCursorPositionListenerRef.current = null;
      secondaryEditorRef.current?.dispose();
      secondaryEditorRef.current = null;
    }

    if (isActive) {
      focusedEditorTargetRef.current = 'editor';
      setActiveEditorTarget('editor');
      primaryEditor.focus();
    }
  }, [
    applyDebugDecorations,
    applyPendingNavigation,
    attachDefinitionClickNavigation,
    disposeEditors,
    editorInlayHintOptions,
    ensureMonacoReady,
    isActive,
    saveCurrentViewState,
    viewMode,
  ]);

  const reloadFileFromDisk = useCallback(async (filePath: string) => {
    const response = await window.electronAPI.codePaneReadFile({
      rootPath,
      filePath,
    });

    if (!response.success || !response.data) {
      setBanner({
        tone: 'warning',
        message: t('codePane.externalChange'),
        filePath,
      });
      return false;
    }

    createOrUpdateModel(filePath, response.data);
    await refreshEditorSurface();
    return true;
  }, [createOrUpdateModel, refreshEditorSurface, rootPath, t]);

  const applySaveQualityDiagnostics = useCallback((filePath: string, diagnostics: CodePaneDiagnostic[]) => {
    const monaco = monacoRef.current;
    const model = fileModelsRef.current.get(filePath);
    if (!monaco || !model) {
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      CODE_PANE_SAVE_QUALITY_LINT_MARKER_OWNER,
      diagnostics.map((diagnostic) => ({
        message: diagnostic.message,
        severity: diagnostic.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : diagnostic.severity === 'warning'
            ? monaco.MarkerSeverity.Warning
            : diagnostic.severity === 'info'
              ? monaco.MarkerSeverity.Info
              : monaco.MarkerSeverity.Hint,
        startLineNumber: diagnostic.startLineNumber,
        startColumn: diagnostic.startColumn,
        endLineNumber: diagnostic.endLineNumber,
        endColumn: diagnostic.endColumn,
        ...(diagnostic.source ? { source: diagnostic.source } : {}),
        ...(diagnostic.code ? { code: diagnostic.code } : {}),
      })),
    );
  }, []);

  const clearSaveQualityDiagnostics = useCallback((filePath: string) => {
    const monaco = monacoRef.current;
    const model = fileModelsRef.current.get(filePath);
    if (!monaco || !model) {
      return;
    }

    monaco.editor.setModelMarkers(model, CODE_PANE_SAVE_QUALITY_LINT_MARKER_OWNER, []);
  }, []);

  const applyLanguageTextEditsWithoutSaving = useCallback(async (edits: CodePaneTextEdit[]) => {
    if (edits.length === 0) {
      return true;
    }

    const editsByFilePath = new Map<string, CodePaneTextEdit[]>();
    for (const edit of edits) {
      const fileEdits = editsByFilePath.get(edit.filePath) ?? [];
      fileEdits.push(edit);
      editsByFilePath.set(edit.filePath, fileEdits);
    }

    for (const [filePath, fileEdits] of editsByFilePath.entries()) {
      const existingModel = fileModelsRef.current.get(filePath);
      if (existingModel) {
        const nextContent = applyTextEditsToContent(existingModel.getValue(), fileEdits);
        suppressModelEventsRef.current.add(filePath);
        existingModel.setValue(nextContent);
        suppressModelEventsRef.current.delete(filePath);
        clearDefinitionLookupCache();
        markDirty(filePath, true);
        await syncLanguageDocument(filePath, 'change');
        continue;
      }

      const readResponse = await window.electronAPI.codePaneReadFile({
        rootPath,
        filePath,
      });
      if (!readResponse.success || !readResponse.data || readResponse.data.isBinary) {
        setBanner({
          tone: 'error',
          message: readResponse.error || t('common.retry'),
          filePath,
        });
        return false;
      }

      const nextContent = applyTextEditsToContent(readResponse.data.content, fileEdits);
      const writeResponse = await window.electronAPI.codePaneWriteFile({
        rootPath,
        filePath,
        content: nextContent,
        expectedMtimeMs: readResponse.data.mtimeMs,
      });
      if (!writeResponse.success) {
        setBanner({
          tone: writeResponse.errorCode === CODE_PANE_SAVE_CONFLICT_ERROR_CODE ? 'warning' : 'error',
          message: writeResponse.errorCode === CODE_PANE_SAVE_CONFLICT_ERROR_CODE
            ? t('codePane.saveConflict')
            : (writeResponse.error || t('common.retry')),
          filePath,
          showReload: writeResponse.errorCode === CODE_PANE_SAVE_CONFLICT_ERROR_CODE,
          showOverwrite: writeResponse.errorCode === CODE_PANE_SAVE_CONFLICT_ERROR_CODE,
        });
        return false;
      }
    }

    void refreshGitSnapshot();
    return true;
  }, [clearDefinitionLookupCache, markDirty, refreshGitSnapshot, rootPath, syncLanguageDocument, t]);

  const runSaveQualityPipeline = useCallback(async (filePath: string) => {
    const model = fileModelsRef.current.get(filePath);
    const fileMeta = fileMetaRef.current.get(filePath);
    if (!model || !fileMeta) {
      return createSaveQualityState({
        status: 'idle',
      });
    }

    const steps: CodePaneSaveQualityStep[] = [];
    const language = fileMeta.language ?? model.getLanguageId();

    if (savePipelineState.formatOnSave) {
      try {
        const response = await window.electronAPI.codePaneFormatDocument({
          rootPath,
          filePath,
          language,
          content: model.getValue(),
          tabSize: 2,
          insertSpaces: true,
        });
        if (!response.success) {
          throw new Error(response.error || t('common.retry'));
        }

        const edits = response.data ?? [];
        if (edits.length > 0) {
          const didApply = await applyLanguageTextEditsWithoutSaving(edits);
          if (!didApply) {
            throw new Error(t('common.retry'));
          }
        }
        steps.push({
          id: 'format',
          status: 'passed',
          message: edits.length > 0 ? t('codePane.saveQualityFormatted') : t('codePane.saveQualityNoChanges'),
        });
      } catch (error) {
        steps.push({
          id: 'format',
          status: 'error',
          message: error instanceof Error ? error.message : t('common.retry'),
        });
      }
    } else {
      steps.push({
        id: 'format',
        status: 'skipped',
        message: t('codePane.saveQualityDisabled'),
      });
    }

    if (savePipelineState.organizeImportsOnSave) {
      try {
        const response = await window.electronAPI.codePaneGetCodeActions({
          rootPath,
          filePath,
          language,
          range: createFullDocumentRange(model.getValue()),
        });
        if (!response.success) {
          throw new Error(response.error || t('common.retry'));
        }

        const organizeImportsAction = (response.data ?? []).find((action) => (
          action.kind === 'source.organizeImports'
          || action.kind?.startsWith('source.organizeImports')
        ));
        if (!organizeImportsAction) {
          steps.push({
            id: 'organize-imports',
            status: 'skipped',
            message: t('codePane.saveQualityUnavailable'),
          });
        } else {
          const runResponse = await window.electronAPI.codePaneRunCodeAction({
            rootPath,
            filePath,
            language,
            actionId: organizeImportsAction.id,
          });
          if (!runResponse.success) {
            throw new Error(runResponse.error || t('common.retry'));
          }

          const didApply = await applyLanguageTextEditsWithoutSaving(runResponse.data ?? []);
          if (!didApply) {
            throw new Error(t('common.retry'));
          }
          steps.push({
            id: 'organize-imports',
            status: 'passed',
            message: t('codePane.saveQualityImportsOrganized'),
          });
        }
      } catch (error) {
        steps.push({
          id: 'organize-imports',
          status: 'error',
          message: error instanceof Error ? error.message : t('common.retry'),
        });
      }
    } else {
      steps.push({
        id: 'organize-imports',
        status: 'skipped',
        message: t('codePane.saveQualityDisabled'),
      });
    }

    if (savePipelineState.lintOnSave) {
      try {
        const lintResponse = await window.electronAPI.codePaneLintDocument({
          rootPath,
          filePath,
          language,
          content: model.getValue(),
        });
        if (!lintResponse.success) {
          throw new Error(lintResponse.error || t('common.retry'));
        }

        const diagnostics = lintResponse.data ?? [];
        applySaveQualityDiagnostics(filePath, diagnostics);
        const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
        const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
        const issueCount = diagnostics.length;
        steps.push({
          id: 'lint',
          status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'passed',
          message: issueCount > 0
            ? t('codePane.saveQualityIssues', { count: issueCount })
            : t('codePane.saveQualityClean'),
          issueCount,
        });
      } catch (error) {
        clearSaveQualityDiagnostics(filePath);
        steps.push({
          id: 'lint',
          status: 'error',
          message: error instanceof Error ? error.message : t('common.retry'),
        });
      }
    } else {
      clearSaveQualityDiagnostics(filePath);
      steps.push({
        id: 'lint',
        status: 'skipped',
        message: t('codePane.saveQualityDisabled'),
      });
    }

    return createSaveQualityState({
      status: resolveSaveQualityStatus(steps),
      steps,
    });
  }, [
    applyLanguageTextEditsWithoutSaving,
    applySaveQualityDiagnostics,
    clearSaveQualityDiagnostics,
    rootPath,
    savePipelineState.formatOnSave,
    savePipelineState.lintOnSave,
    savePipelineState.organizeImportsOnSave,
    t,
  ]);

  const saveFile = useCallback(async (filePath: string, options?: SaveFileOptions) => {
    const model = fileModelsRef.current.get(filePath);
    const fileMeta = fileMetaRef.current.get(filePath);
    if (!model || !fileMeta) {
      return true;
    }

    if (fileMeta.readOnly) {
      return true;
    }

    if (!dirtyPathsRef.current.has(filePath) && !options?.overwrite) {
      return true;
    }

    await flushPendingLanguageSync(filePath);
    let qualityGateStateBeforeWrite: CodePaneSaveQualityState | null = null;
    if (!options?.skipQualityPipeline) {
      persistQualityGateState(createSaveQualityState({
        status: 'running',
        message: t('codePane.saveQualityRunning'),
      }));
      qualityGateStateBeforeWrite = await runSaveQualityPipeline(filePath);
      await flushPendingLanguageSync(filePath);
    }

    markSaving(filePath, true);

    const response = await window.electronAPI.codePaneWriteFile({
      rootPath,
      filePath,
      content: model.getValue(),
      expectedMtimeMs: options?.overwrite ? undefined : fileMeta.mtimeMs,
    });

    markSaving(filePath, false);

    if (!response.success || !response.data) {
      if (qualityGateStateBeforeWrite) {
        const nextSteps = updateSaveQualityStep(qualityGateStateBeforeWrite.steps ?? [], {
          id: 'write',
          status: 'error',
          message: response.error || t('common.retry'),
        });
        persistQualityGateState(createSaveQualityState({
          status: resolveSaveQualityStatus(nextSteps),
          message: response.error || t('common.retry'),
          steps: nextSteps,
        }));
      }
      if (response.errorCode === CODE_PANE_SAVE_CONFLICT_ERROR_CODE) {
        setBanner({
          tone: 'warning',
          message: t('codePane.saveConflict'),
          filePath,
          showReload: true,
          showOverwrite: true,
        });
      } else {
        setBanner({
          tone: 'error',
          message: response.error || t('common.retry'),
          filePath,
        });
      }
      return false;
    }

    fileMetaRef.current.set(filePath, {
      ...fileMeta,
      mtimeMs: response.data.mtimeMs,
      lastSavedAt: Date.now(),
    });
    addLocalHistoryEntry(filePath, 'save', model.getValue());
    markDirty(filePath, false);
    clearBannerForFile(filePath);
    if (qualityGateStateBeforeWrite) {
      const nextSteps = updateSaveQualityStep(qualityGateStateBeforeWrite.steps ?? [], {
        id: 'write',
        status: 'passed',
        message: t('codePane.saveQualityWritten'),
      });
      const nextStatus = resolveSaveQualityStatus(nextSteps);
      persistQualityGateState(createSaveQualityState({
        status: nextStatus,
        message: nextStatus === 'error'
          ? nextSteps.find((step) => step.status === 'error')?.message
          : nextStatus === 'warning'
            ? nextSteps.find((step) => step.status === 'warning')?.message ?? t('codePane.saveQualitySavedWithIssues')
            : t('codePane.saveQualitySaved'),
        steps: nextSteps,
      }));
    }
    await syncLanguageDocument(filePath, 'save');
    void refreshGitSnapshot();
    return true;
  }, [
    addLocalHistoryEntry,
    clearBannerForFile,
    flushPendingLanguageSync,
    markDirty,
    markSaving,
    refreshGitSnapshot,
    rootPath,
    runSaveQualityPipeline,
    syncLanguageDocument,
    t,
    persistQualityGateState,
  ]);

  const flushDirtyFiles = useCallback(async (targetFilePaths?: string[]) => {
    const pathsToFlush = targetFilePaths ?? Array.from(dirtyPathsRef.current);
    for (const filePath of pathsToFlush) {
      const existingTimer = autoSaveTimersRef.current.get(filePath);
      if (existingTimer) {
        clearTimeout(existingTimer);
        autoSaveTimersRef.current.delete(filePath);
      }

      const didSave = await saveFile(filePath);
      if (!didSave) {
        return false;
      }
    }

    return true;
  }, [saveFile]);

  const getActiveEditorContext = useCallback(() => {
    const currentViewMode = paneRef.current.code?.viewMode ?? viewMode;
    const currentFocusedEditorTarget = focusedEditorTargetRef.current;
    const editorInstance = currentViewMode === 'diff'
      ? diffEditorRef.current?.getModifiedEditor() ?? null
      : currentFocusedEditorTarget === 'secondary' && isEditorSplitVisible
        ? secondaryEditorRef.current ?? editorRef.current
        : editorRef.current;
    const model = editorInstance?.getModel();
    const filePath = currentViewMode === 'diff'
      ? activeFilePathRef.current
      : currentFocusedEditorTarget === 'secondary' && isEditorSplitVisible
        ? secondaryFilePathRef.current ?? getModelFilePath(model)
        : activeFilePathRef.current ?? getModelFilePath(model);
    const position = editorInstance?.getPosition?.();

    if (!editorInstance || !model || !filePath || !position) {
      return null;
    }

    return {
      editorInstance,
      model,
      filePath,
      position,
      language: fileMetaRef.current.get(filePath)?.language ?? model.getLanguageId(),
      readOnly: Boolean(fileMetaRef.current.get(filePath)?.readOnly),
    };
  }, [getModelFilePath, isEditorSplitVisible, viewMode]);

  const breadcrumbFilePath = useMemo(() => {
    if (viewMode === 'diff') {
      return activeFilePath;
    }

    if (activeEditorTarget === 'secondary' && isEditorSplitVisible) {
      return secondaryFilePath ?? activeFilePath;
    }

    return activeFilePath;
  }, [activeEditorTarget, activeFilePath, isEditorSplitVisible, secondaryFilePath, viewMode]);

  const breadcrumbLanguage = breadcrumbFilePath
    ? fileMetaRef.current.get(breadcrumbFilePath)?.language
    : undefined;

  const loadActiveDocumentSymbols = useCallback(async (filePath: string, language?: string) => {
    const requestPath = getModelRequestPath(filePath);
    const requestKey = `document-symbols:${requestPath}`;
    const requestVersion = runtimeStoreRef.current.markLatest(requestKey);
    setIsActiveDocumentSymbolsLoading(true);

    try {
      const response = await trackRequest(
        requestKey,
        'Document symbols',
        getRelativePath(rootPath, filePath),
        async () => await window.electronAPI.codePaneGetDocumentSymbols({
          rootPath,
          filePath: requestPath,
          language,
        }),
      );

      if (!runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        return;
      }

      setActiveDocumentSymbols(response.success ? (response.data ?? []) : []);
    } catch {
      if (!runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        return;
      }

      setActiveDocumentSymbols([]);
    } finally {
      if (runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        setIsActiveDocumentSymbolsLoading(false);
      }
    }
  }, [getModelRequestPath, rootPath, trackRequest]);

  const loadQuickDocumentation = useCallback(async () => {
    const context = getActiveEditorContext();
    if (!context) {
      setQuickDocumentation(null);
      setQuickDocumentationError(null);
      setIsQuickDocumentationLoading(false);
      return;
    }

    const requestPath = getModelRequestPath(context.filePath);
    const requestKey = `quick-documentation:${requestPath}`;
    const requestVersion = runtimeStoreRef.current.markLatest(requestKey);
    setIsQuickDocumentationLoading(true);
    setQuickDocumentationError(null);

    try {
      const response = await trackRequest(
        requestKey,
        'Quick documentation',
        `${getRelativePath(rootPath, context.filePath)}:${context.position.lineNumber}`,
        async () => await window.electronAPI.codePaneGetHover({
          rootPath,
          filePath: requestPath,
          language: context.language,
          position: {
            lineNumber: context.position.lineNumber,
            column: context.position.column,
          },
        }),
      );

      if (!runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        return;
      }

      setQuickDocumentation(response.success ? (response.data ?? null) : null);
      setQuickDocumentationError(response.success ? null : (response.error || t('common.retry')));
    } catch (error) {
      if (!runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        return;
      }

      setQuickDocumentation(null);
      setQuickDocumentationError(error instanceof Error ? error.message : t('common.retry'));
    } finally {
      if (runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        setIsQuickDocumentationLoading(false);
      }
    }
  }, [getActiveEditorContext, getModelRequestPath, rootPath, t, trackRequest]);

  const toggleQuickDocumentation = useCallback(() => {
    if (isQuickDocumentationOpen) {
      setIsQuickDocumentationOpen(false);
      return;
    }

    setIsQuickDocumentationOpen(true);
    void loadQuickDocumentation();
  }, [isQuickDocumentationOpen, loadQuickDocumentation]);

  const loadHierarchyRoot = useCallback(async (mode: HierarchyMode) => {
    const context = getActiveEditorContext();
    if (!context) {
      setHierarchyRootNode(null);
      setHierarchyError(null);
      setIsHierarchyLoading(false);
      return;
    }

    const requestPath = getModelRequestPath(context.filePath);
    const requestKey = `hierarchy:${mode}:${requestPath}`;
    const requestVersion = ++hierarchyRequestIdRef.current;
    setIsHierarchyLoading(true);
    setHierarchyError(null);

    const requestLabel = mode.startsWith('call')
      ? 'Call hierarchy'
      : 'Type hierarchy';

    try {
      const response = mode.startsWith('call')
        ? await trackRequest(
          requestKey,
          requestLabel,
          `${getRelativePath(rootPath, context.filePath)}:${context.position.lineNumber}`,
          async () => await window.electronAPI.codePaneGetCallHierarchy({
            rootPath,
            filePath: requestPath,
            language: context.language,
            position: {
              lineNumber: context.position.lineNumber,
              column: context.position.column,
            },
            direction: (mode === 'call-incoming' ? 'incoming' : 'outgoing') satisfies CodePaneCallHierarchyDirection,
          }),
        )
        : await trackRequest(
          requestKey,
          requestLabel,
          `${getRelativePath(rootPath, context.filePath)}:${context.position.lineNumber}`,
          async () => await window.electronAPI.codePaneGetTypeHierarchy({
            rootPath,
            filePath: requestPath,
            language: context.language,
            position: {
              lineNumber: context.position.lineNumber,
              column: context.position.column,
            },
            direction: (mode === 'type-parents' ? 'parents' : 'children') satisfies CodePaneTypeHierarchyDirection,
          }),
        );

      if (hierarchyRequestIdRef.current !== requestVersion) {
        return;
      }

      const hierarchyResult: CodePaneHierarchyResult = response.success && response.data
        ? response.data
        : {
          root: null,
          items: [],
        };

      setHierarchyRootNode(
        hierarchyResult.root
          ? createHierarchyTreeNode(hierarchyResult.root, hierarchyResult.items)
          : null,
      );
      setHierarchyError(response.success ? null : (response.error || t('common.retry')));
    } catch (error) {
      if (hierarchyRequestIdRef.current !== requestVersion) {
        return;
      }

      setHierarchyRootNode(null);
      setHierarchyError(error instanceof Error ? error.message : t('common.retry'));
    } finally {
      if (hierarchyRequestIdRef.current === requestVersion) {
        setIsHierarchyLoading(false);
      }
    }
  }, [getActiveEditorContext, getModelRequestPath, rootPath, t, trackRequest]);

  const openHierarchyPanel = useCallback((mode: HierarchyMode) => {
    setSelectedHierarchyMode(mode);
    setBottomPanelMode('hierarchy');
  }, []);

  const toggleHierarchyNode = useCallback(async (nodeKey: string) => {
    const currentRootNode = hierarchyRootNode;
    const targetNode = findHierarchyTreeNode(currentRootNode, nodeKey);
    if (!currentRootNode || !targetNode) {
      return;
    }

    if (!targetNode.isExpandable && targetNode.children.length === 0) {
      return;
    }

    if (targetNode.children.length > 0) {
      setHierarchyRootNode(updateHierarchyTreeNode(currentRootNode, nodeKey, (candidate) => ({
        ...candidate,
        isExpanded: !candidate.isExpanded,
      })));
      return;
    }

    setHierarchyRootNode(updateHierarchyTreeNode(currentRootNode, nodeKey, (candidate) => ({
      ...candidate,
      isExpanded: true,
      isLoading: true,
      error: null,
    })));

    try {
      const requestLabel = selectedHierarchyMode.startsWith('call')
        ? 'Call hierarchy children'
        : 'Type hierarchy children';
      const response = selectedHierarchyMode.startsWith('call')
        ? await trackRequest(
          `hierarchy-child:${selectedHierarchyMode}:${nodeKey}`,
          requestLabel,
          targetNode.item.name,
          async () => await window.electronAPI.codePaneResolveCallHierarchy({
            rootPath,
            language: targetNode.item.language,
            direction: (
              selectedHierarchyMode === 'call-incoming'
                ? 'incoming'
                : 'outgoing'
            ) satisfies CodePaneCallHierarchyDirection,
            item: targetNode.item,
          }),
        )
        : await trackRequest(
          `hierarchy-child:${selectedHierarchyMode}:${nodeKey}`,
          requestLabel,
          targetNode.item.name,
          async () => await window.electronAPI.codePaneResolveTypeHierarchy({
            rootPath,
            language: targetNode.item.language,
            direction: (
              selectedHierarchyMode === 'type-parents'
                ? 'parents'
                : 'children'
            ) satisfies CodePaneTypeHierarchyDirection,
            item: targetNode.item,
          }),
        );

      setHierarchyRootNode((currentNode) => (
        currentNode
          ? updateHierarchyTreeNode(currentNode, nodeKey, (candidate) => {
            const nextChildren = response.success
              ? (response.data ?? []).map((item) => createHierarchyTreeNode(item))
              : [];
            return {
              ...candidate,
              children: nextChildren,
              isExpanded: true,
              isLoading: false,
              isExpandable: nextChildren.length > 0,
              error: response.success ? null : (response.error || t('common.retry')),
            };
          })
          : currentNode
      ));
    } catch (error) {
      setHierarchyRootNode((currentNode) => (
        currentNode
          ? updateHierarchyTreeNode(currentNode, nodeKey, (candidate) => ({
            ...candidate,
            isLoading: false,
            error: error instanceof Error ? error.message : t('common.retry'),
          }))
          : currentNode
      ));
    }
  }, [hierarchyRootNode, rootPath, selectedHierarchyMode, t, trackRequest]);

  const openHierarchyItem = useCallback(async (item: CodePaneHierarchyItem) => {
    await openFileLocationRef.current({
      filePath: item.filePath,
      lineNumber: item.selectionRange.startLineNumber,
      column: item.selectionRange.startColumn,
      content: item.content,
      language: item.language,
      readOnly: item.readOnly,
      displayPath: item.displayPath,
      documentUri: item.uri ?? (isVirtualDocumentPath(item.filePath) ? item.filePath : undefined),
    });
  }, []);

  const loadSemanticSummary = useCallback(async () => {
    const context = getActiveEditorContext();
    if (!context) {
      setSemanticLegend(null);
      setSemanticSummary([]);
      setSemanticTokenCount(0);
      setSemanticSummaryFileLabel(null);
      setSemanticSummaryError(null);
      setIsSemanticSummaryLoading(false);
      return;
    }

    const requestPath = getModelRequestPath(context.filePath);
    const requestKey = `semantic:${requestPath}`;
    const requestVersion = ++semanticRequestIdRef.current;
    setIsSemanticSummaryLoading(true);
    setSemanticSummaryError(null);
    setSemanticSummaryFileLabel(getRelativePath(rootPath, context.filePath));

    try {
      const response = await trackRequest(
        requestKey,
        'Semantic tokens',
        getRelativePath(rootPath, context.filePath),
        async () => await window.electronAPI.codePaneGetSemanticTokens({
          rootPath,
          filePath: requestPath,
          language: context.language,
        }),
      );

      if (semanticRequestIdRef.current !== requestVersion) {
        return;
      }

      const semanticResult: CodePaneSemanticTokensResult | null = response.success
        ? (response.data ?? null)
        : null;
      if (!semanticResult) {
        setSemanticLegend(null);
        setSemanticSummary([]);
        setSemanticTokenCount(0);
        setSemanticSummaryError(response.success ? null : (response.error || t('common.retry')));
        return;
      }

      const nextSummary = summarizeSemanticTokens(semanticResult);
      setSemanticLegend(semanticResult.legend);
      setSemanticSummary(nextSummary.summary);
      setSemanticTokenCount(nextSummary.totalTokens);
      setSemanticSummaryError(response.success ? null : (response.error || t('common.retry')));
    } catch (error) {
      if (semanticRequestIdRef.current !== requestVersion) {
        return;
      }

      setSemanticLegend(null);
      setSemanticSummary([]);
      setSemanticTokenCount(0);
      setSemanticSummaryError(error instanceof Error ? error.message : t('common.retry'));
    } finally {
      if (semanticRequestIdRef.current === requestVersion) {
        setIsSemanticSummaryLoading(false);
      }
    }
  }, [getActiveEditorContext, getModelRequestPath, rootPath, t, trackRequest]);

  const applyLanguageTextEdits = useCallback(async (
    edits: CodePaneTextEdit[],
    options?: {
      saveAfterApply?: boolean;
    },
  ) => {
    const didApply = await applyLanguageTextEditsWithoutSaving(edits);
    if (!didApply) {
      return false;
    }

    if (options?.saveAfterApply === false || edits.length === 0) {
      return true;
    }

    const editedFilePaths = Array.from(new Set(edits.map((edit) => edit.filePath)));
    for (const editedFilePath of editedFilePaths) {
      if (!fileModelsRef.current.has(editedFilePath)) {
        continue;
      }

      const didSave = await saveFile(editedFilePath, {
        skipQualityPipeline: true,
      });
      if (!didSave) {
        return false;
      }
    }

    return true;
  }, [applyLanguageTextEditsWithoutSaving, saveFile]);

  const prepareRefactorPreview = useCallback(async (config: Parameters<typeof window.electronAPI.codePanePrepareRefactor>[0]) => {
    setRefactorPreviewError(null);

    const response = await window.electronAPI.codePanePrepareRefactor(config);
    if (!response.success || !response.data) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
        filePath: 'filePath' in config ? config.filePath : undefined,
      });
      return null;
    }

    setRefactorPreview(response.data);
    setSelectedPreviewChangeId(response.data.files[0]?.id ?? null);
    setBottomPanelMode('preview');
    return response.data;
  }, [t]);

  const findUsagesAtCursor = useCallback(async () => {
    const context = getActiveEditorContext();
    if (!context) {
      return;
    }

    const targetWord = context.model.getWordAtPosition(context.position)?.word ?? getPathLeafLabel(context.filePath);
    setSearchPanelMode('usages');
    setUsageResults([]);
    setUsagesTargetLabel(targetWord);
    setUsageError(null);
    setIsFindingUsages(true);
    handleSidebarModeSelect('search');

    const response = await window.electronAPI.codePaneGetReferences({
      rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber: context.position.lineNumber,
        column: context.position.column,
      },
    });

    startTransition(() => {
      setUsageResults(response.success ? (response.data ?? []) : []);
    });
    setUsageError(response.success ? null : (response.error || t('common.retry')));
    setIsFindingUsages(false);
  }, [getActiveEditorContext, handleSidebarModeSelect, rootPath, t]);

  const renameSymbolAtCursor = useCallback(async () => {
    const context = getActiveEditorContext();
    if (!context || context.readOnly) {
      return;
    }

    const currentWord = context.model.getWordAtPosition(context.position)?.word ?? '';
    const nextName = window.prompt(t('codePane.renamePrompt'), currentWord)?.trim();
    if (!nextName || nextName === currentWord) {
      return;
    }

    await prepareRefactorPreview({
      kind: 'rename-symbol',
      rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber: context.position.lineNumber,
        column: context.position.column,
      },
      newName: nextName,
    });
  }, [getActiveEditorContext, prepareRefactorPreview, rootPath, t]);

  const formatActiveDocument = useCallback(async () => {
    const context = getActiveEditorContext();
    if (!context || context.readOnly) {
      return;
    }

    const response = await window.electronAPI.codePaneFormatDocument({
      rootPath,
      filePath: context.filePath,
      language: context.language,
      content: context.model.getValue(),
      tabSize: 2,
      insertSpaces: true,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
        filePath: context.filePath,
      });
      return;
    }

    await applyLanguageTextEdits(response.data ?? []);
  }, [applyLanguageTextEdits, getActiveEditorContext, rootPath, t]);

  useEffect(() => {
    saveFileRef.current = saveFile;
  }, [saveFile]);

  useEffect(() => {
    findUsagesAtCursorRef.current = findUsagesAtCursor;
  }, [findUsagesAtCursor]);

  useEffect(() => {
    renameSymbolAtCursorRef.current = renameSymbolAtCursor;
  }, [renameSymbolAtCursor]);

  useEffect(() => {
    formatActiveDocumentRef.current = formatActiveDocument;
  }, [formatActiveDocument]);

  const activateFile = useCallback(async (
    filePath: string,
    options?: {
      recordRecent?: boolean;
      preview?: boolean;
      promotePreview?: boolean;
    },
  ) => {
    const loadedModel = fileModelsRef.current.get(filePath) ?? await loadFileIntoModel(filePath);
    if (!loadedModel) {
      persistCodeState({
        selectedPath: filePath,
      });
      return;
    }

    const currentOpenFiles = paneRef.current.code?.openFiles ?? openFiles;
    const nextTabs = upsertOpenFileTab(currentOpenFiles, filePath, {
      preview: options?.preview,
      promote: options?.promotePreview,
    });

    persistCodeState({
      openFiles: nextTabs,
      activeFilePath: filePath,
      selectedPath: filePath,
      viewMode: 'editor',
      diffTargetPath: null,
    });

    if (options?.recordRecent !== false) {
      setRecentFiles((currentRecentFiles) => {
        const nextRecentFiles = [
          filePath,
          ...currentRecentFiles.filter((currentFilePath) => currentFilePath !== filePath),
        ].slice(0, CODE_PANE_MAX_RECENT_FILES);
        recentFilesRef.current = nextRecentFiles;
        return nextRecentFiles;
      });
    }

    await refreshEditorSurface();
  }, [loadFileIntoModel, openFiles, persistCodeState, refreshEditorSurface]);

  const ensureDiffModel = useCallback(async (
    filePath: string,
    options?: {
      baseFilePath?: string;
      showBanner?: boolean;
    },
  ) => {
    if (!monacoRef.current && supportsMonaco) {
      const monaco = await ensureMonacoReady();
      if (!monaco) {
        if (options?.showBanner !== false) {
          setBanner({
            tone: 'info',
            message: t('codePane.gitUnavailable'),
            filePath,
          });
        }
        return false;
      }
    }

    const baseFilePath = options?.baseFilePath ?? filePath;
    if (!monacoRef.current) {
      if (options?.showBanner !== false) {
        setBanner({
          tone: 'info',
          message: t('codePane.gitUnavailable'),
          filePath,
        });
      }
      return false;
    }

    const response = await window.electronAPI.codePaneReadGitBaseFile({
      rootPath,
      filePath: baseFilePath,
    });

    if (!response.success) {
      if (options?.showBanner !== false) {
        setBanner({
          tone: 'info',
          message: response.error || t('codePane.gitUnavailable'),
          filePath,
        });
      }
      return false;
    }

    const statusEntry = gitStatusByPath[baseFilePath] ?? gitStatusByPath[filePath];
    if (!response.data?.existsInHead && !statusEntry) {
      if (options?.showBanner !== false) {
        setBanner({
          tone: 'info',
          message: t('codePane.gitUnavailable'),
          filePath,
        });
      }
      return false;
    }

    const meta = fileMetaRef.current.get(filePath) ?? fileMetaRef.current.get(baseFilePath);
    const language = meta?.language ?? fileModelsRef.current.get(filePath)?.getLanguageId() ?? 'plaintext';
    let diffModel = diffModelsRef.current.get(filePath);
    if (!diffModel) {
      diffModel = monacoRef.current.editor.createModel(
        response.data?.content ?? '',
        language,
        monacoRef.current.Uri.parse(`code-pane-head://${encodeURIComponent(filePath)}`),
      );
      diffModelsRef.current.set(filePath, diffModel);
    } else {
      if (diffModel.getLanguageId() !== language) {
        monacoRef.current.editor.setModelLanguage(diffModel, language);
      }
      if (diffModel.getValue() !== (response.data?.content ?? '')) {
        diffModel.setValue(response.data?.content ?? '');
      }
    }

    clearBannerForFile(filePath);
    return true;
  }, [clearBannerForFile, ensureMonacoReady, gitStatusByPath, rootPath, supportsMonaco, t]);

  const openDiffForFile = useCallback(async (filePath: string, options?: { preserveTabs?: boolean }) => {
    if (!isPathInside(rootPath, filePath)) {
      setBanner({
        tone: 'info',
        message: t('codePane.gitUnavailable'),
        filePath,
      });
      return;
    }

    const loadedModel = fileModelsRef.current.get(filePath) ?? await loadFileIntoModel(filePath);
    if (!loadedModel) {
      persistCodeState({
        selectedPath: filePath,
      });
      return;
    }

    const didEnsureDiffModel = await ensureDiffModel(filePath);
    if (!didEnsureDiffModel) {
      return;
    }

    const currentOpenFiles = paneRef.current.code?.openFiles ?? openFiles;
    const nextTabs = upsertOpenFileTab(currentOpenFiles, filePath, {
      promote: !options?.preserveTabs,
    });

    setBanner(null);
    persistCodeState({
      openFiles: nextTabs,
      activeFilePath: filePath,
      selectedPath: filePath,
      viewMode: 'diff',
      diffTargetPath: filePath,
    });
    await refreshEditorSurface();
  }, [ensureDiffModel, loadFileIntoModel, openFiles, persistCodeState, refreshEditorSurface, rootPath, t]);

  const closeFileTab = useCallback(async (filePath: string) => {
    const didFlush = await flushDirtyFiles([filePath]);
    if (!didFlush) {
      return;
    }

    const existingTimer = autoSaveTimersRef.current.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
      autoSaveTimersRef.current.delete(filePath);
    }
    const localHistoryTimer = localHistoryTimersRef.current.get(filePath);
    if (localHistoryTimer) {
      clearTimeout(localHistoryTimer);
      localHistoryTimersRef.current.delete(filePath);
    }

    await closeLanguageDocument(filePath);
    modelDisposersRef.current.get(filePath)?.dispose();
    modelDisposersRef.current.delete(filePath);
    const existingModel = fileModelsRef.current.get(filePath);
    if (existingModel) {
      modelFilePathRef.current.delete(existingModel.uri.path);
      existingModel.dispose();
    }
    fileModelsRef.current.delete(filePath);
    diffModelsRef.current.get(filePath)?.dispose();
    diffModelsRef.current.delete(filePath);
    fileMetaRef.current.delete(filePath);
    preloadedReadResultsRef.current.delete(filePath);
    clearDefinitionLookupCache();
    viewStatesRef.current.delete(filePath);
    markDirty(filePath, false);
    clearBannerForFile(filePath);

    const currentOpenFiles = sortOpenFilesByPinned(paneRef.current.code?.openFiles ?? openFiles);
    const currentActiveFilePath = paneRef.current.code?.activeFilePath ?? activeFilePath;
    const currentSelectedPath = paneRef.current.code?.selectedPath ?? selectedPath;
    const nextOpenFiles = currentOpenFiles.filter((tab) => tab.path !== filePath);
    const nextActiveFilePath = currentActiveFilePath === filePath
      ? nextOpenFiles[nextOpenFiles.length - 1]?.path ?? null
      : currentActiveFilePath;
    const nextSecondaryFilePath = secondaryFilePathRef.current === filePath
      ? null
      : secondaryFilePathRef.current;

    persistCodeState({
      openFiles: nextOpenFiles,
      activeFilePath: nextActiveFilePath,
      selectedPath: nextActiveFilePath ?? currentSelectedPath,
      viewMode: 'editor',
      diffTargetPath: null,
    });
    if (secondaryFilePathRef.current === filePath) {
      persistEditorSplitLayout({
        visible: false,
        secondaryFilePath: nextSecondaryFilePath,
      });
    }
  }, [
    activeFilePath,
    clearBannerForFile,
    clearDefinitionLookupCache,
    closeLanguageDocument,
    flushDirtyFiles,
    markDirty,
    openFiles,
    persistCodeState,
    persistEditorSplitLayout,
    selectedPath,
  ]);

  const applyRefactorPreview = useCallback(async () => {
    if (!refactorPreview) {
      return;
    }

    setIsApplyingRefactorPreview(true);
    setRefactorPreviewError(null);

    const response = await window.electronAPI.codePaneApplyRefactor({
      previewId: refactorPreview.id,
    });
    if (!response.success || !response.data) {
      setRefactorPreviewError(response.error || t('common.retry'));
      setIsApplyingRefactorPreview(false);
      return;
    }

    for (const change of response.data.files) {
      if (change.kind === 'modify') {
        const existingModel = fileModelsRef.current.get(change.filePath);
        if (existingModel) {
          await flushPendingLanguageSync(change.filePath);
          suppressModelEventsRef.current.add(change.filePath);
          existingModel.setValue(change.afterContent);
          suppressModelEventsRef.current.delete(change.filePath);
          clearDefinitionLookupCache();
          markDirty(change.filePath, false);
          await syncLanguageDocument(change.filePath, 'change');
          await syncLanguageDocument(change.filePath, 'save');
        }
        continue;
      }

      const currentOpenFiles = paneRef.current.code?.openFiles ?? openFiles;
      const isOpen = currentOpenFiles.some((tab) => tab.path === change.filePath);
      const wasActive = activeFilePathRef.current === change.filePath;
      if (isOpen) {
        await closeFileTab(change.filePath);
      }

      if ((change.kind === 'rename' || change.kind === 'move') && wasActive && change.targetFilePath) {
        await activateFile(change.targetFilePath);
      }
    }

    await refreshGitSnapshot({ includeGraph: true });
    setRefactorPreview(null);
    setSelectedPreviewChangeId(null);
    setRefactorPreviewError(null);
    setBottomPanelMode((currentMode) => (currentMode === 'preview' ? null : currentMode));
    setBanner({
      tone: 'info',
      message: t('codePane.refactorApplied'),
    });
    setIsApplyingRefactorPreview(false);
  }, [
    activateFile,
    clearDefinitionLookupCache,
    closeFileTab,
    flushPendingLanguageSync,
    markDirty,
    openFiles,
    refactorPreview,
    refreshGitSnapshot,
    syncLanguageDocument,
    t,
  ]);

  const renamePathWithPreview = useCallback(async (filePath: string) => {
    const currentName = getPathLeafLabel(filePath);
    const nextName = window.prompt(t('codePane.renamePathPrompt'), currentName)?.trim();
    if (!nextName || nextName === currentName) {
      return;
    }

    await prepareRefactorPreview({
      kind: 'rename-path',
      rootPath,
      filePath,
      nextFilePath: replacePathLeaf(filePath, nextName),
    });
  }, [prepareRefactorPreview, rootPath, t]);

  const movePathWithPreview = useCallback(async (filePath: string) => {
    const currentRelativePath = getRelativePath(rootPath, filePath);
    const nextRelativePath = window.prompt(t('codePane.movePathPrompt'), currentRelativePath)?.trim();
    if (!nextRelativePath || nextRelativePath === currentRelativePath) {
      return;
    }

    await prepareRefactorPreview({
      kind: 'move-path',
      rootPath,
      filePath,
      nextFilePath: resolvePathFromRoot(rootPath, nextRelativePath),
    });
  }, [prepareRefactorPreview, rootPath, t]);

  const safeDeletePathWithPreview = useCallback(async (filePath: string) => {
    const confirmed = window.confirm(t('codePane.safeDeleteConfirm', { path: getPathLeafLabel(filePath) }));
    if (!confirmed) {
      return;
    }

    await prepareRefactorPreview({
      kind: 'safe-delete',
      rootPath,
      filePath,
    });
  }, [prepareRefactorPreview, rootPath, t]);

  const toggleDirectory = useCallback((directoryPath: string) => {
    setExpandedDirectories((currentExpandedDirectories) => {
      const nextExpandedDirectories = new Set(currentExpandedDirectories);
      if (nextExpandedDirectories.has(directoryPath)) {
        nextExpandedDirectories.delete(directoryPath);
      } else {
        nextExpandedDirectories.add(directoryPath);
        if (!isDirectoryLoaded(directoryPath)) {
          void loadExplorerDirectory(directoryPath);
        }
      }

      persistCodeState({
        selectedPath: directoryPath,
        expandedPaths: getPersistedExpandedPaths(nextExpandedDirectories),
      });

      return nextExpandedDirectories;
    });
  }, [getPersistedExpandedPaths, isDirectoryLoaded, loadExplorerDirectory, persistCodeState]);

  const openDiffForActiveFile = useCallback(async () => {
    const filePath = activeFilePathRef.current;
    if (!filePath) {
      return;
    }
    await openDiffForFile(filePath, { preserveTabs: true });
  }, [openDiffForFile]);

  const refreshDirectoryPaths = useCallback(async (
    directoryPaths: Iterable<string>,
    options?: {
      showLoadingIndicator?: boolean;
      refreshGitStatus?: boolean;
    },
  ) => {
    const uniqueDirectoryPaths = Array.from(new Set(directoryPaths));
    if (uniqueDirectoryPaths.length > 0) {
      await Promise.all(uniqueDirectoryPaths.map((directoryPath) => loadExplorerDirectory(directoryPath, {
        showLoadingIndicator: options?.showLoadingIndicator,
      })));
    }

    if (options?.refreshGitStatus !== false) {
      await refreshGitSnapshot();
    }
  }, [loadExplorerDirectory, refreshGitSnapshot]);

  const refreshLoadedDirectories = useCallback(async () => {
    const directoriesToRefresh = Array.from(new Set([
      rootPath,
      ...loadedDirectoriesRef.current,
      ...loadedExternalDirectoriesRef.current,
    ]));

    await Promise.all([
      refreshDirectoryPaths(directoriesToRefresh),
      loadExternalLibrarySections(),
    ]);
  }, [loadExternalLibrarySections, refreshDirectoryPaths, rootPath]);

  const loadGitHistory = useCallback(async (
    config: {
      filePath?: string;
      lineNumber?: number;
    },
  ) => {
    setIsGitHistoryLoading(true);
    setGitHistoryError(null);

    const response = await trackRequest(
      `git-history:${rootPath}`,
      'Git history',
      config.filePath ? getRelativePath(rootPath, config.filePath) : undefined,
      async () => await window.electronAPI.codePaneGitHistory({
        rootPath,
        filePath: config.filePath,
        lineNumber: config.lineNumber,
        limit: 30,
      }),
    );
    if (!response.success || !response.data) {
      setGitHistoryError(response.error || t('common.retry'));
      setIsGitHistoryLoading(false);
      return;
    }

    setGitHistory(response.data);
    setSelectedHistoryCommitSha(response.data.entries[0]?.commitSha ?? null);
    setBottomPanelMode('history');
    setIsGitHistoryLoading(false);
  }, [rootPath, t, trackRequest]);

  const loadBlameForActiveFile = useCallback(async () => {
    const filePath = activeFilePathRef.current;
    if (!filePath) {
      setBlameLines([]);
      return;
    }

    setIsBlameLoading(true);
    const response = await window.electronAPI.codePaneGitBlame({
      rootPath,
      filePath,
    });
    if (!response.success) {
      setBanner({
        tone: 'warning',
        message: response.error || t('common.retry'),
        filePath,
      });
      setBlameLines([]);
      setIsBlameLoading(false);
      return;
    }

    setBlameLines(response.data ?? []);
    setIsBlameLoading(false);
  }, [rootPath, t]);

  const runGitOperation = useCallback(async (
    task: () => Promise<{ success: boolean; error?: string }>,
    options?: {
      successMessage?: string;
      refreshGraph?: boolean;
    },
  ) => {
    const response = await task();
    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return false;
    }

    await refreshLoadedDirectories();
    await refreshGitSnapshot({ includeGraph: options?.refreshGraph });
    if (options?.successMessage) {
      setBanner({
        tone: 'info',
        message: options.successMessage,
      });
    }

    if (isBlameVisible) {
      await loadBlameForActiveFile();
    }

    return true;
  }, [isBlameVisible, loadBlameForActiveFile, refreshGitSnapshot, refreshLoadedDirectories, t]);

  const stageGitPaths = useCallback(async (paths: string[]) => {
    await runGitOperation(
      async () => await window.electronAPI.codePaneGitStage({ rootPath, paths }),
      { successMessage: t('codePane.gitStageSuccess') },
    );
  }, [rootPath, runGitOperation, t]);

  const unstageGitPaths = useCallback(async (paths: string[]) => {
    await runGitOperation(
      async () => await window.electronAPI.codePaneGitUnstage({ rootPath, paths }),
      { successMessage: t('codePane.gitUnstageSuccess') },
    );
  }, [rootPath, runGitOperation, t]);

  const discardGitPaths = useCallback(async (paths: string[], restoreStaged?: boolean) => {
    await runGitOperation(
      async () => await window.electronAPI.codePaneGitDiscard({ rootPath, paths, restoreStaged }),
      { successMessage: t('codePane.gitDiscardSuccess') },
    );
  }, [rootPath, runGitOperation, t]);

  const stageGitHunk = useCallback(async (hunk: CodePaneGitDiffHunk) => {
    const didApply = await runGitOperation(
      async () => await window.electronAPI.codePaneGitStageHunk({
        rootPath,
        filePath: hunk.filePath,
        patch: hunk.patch,
      }),
      { successMessage: t('codePane.gitStageHunkSuccess') },
    );
    if (didApply) {
      await loadGitDiffHunks(hunk.filePath);
    }
  }, [loadGitDiffHunks, rootPath, runGitOperation, t]);

  const unstageGitHunk = useCallback(async (hunk: CodePaneGitDiffHunk) => {
    const didApply = await runGitOperation(
      async () => await window.electronAPI.codePaneGitUnstageHunk({
        rootPath,
        filePath: hunk.filePath,
        patch: hunk.patch,
      }),
      { successMessage: t('codePane.gitUnstageHunkSuccess') },
    );
    if (didApply) {
      await loadGitDiffHunks(hunk.filePath);
    }
  }, [loadGitDiffHunks, rootPath, runGitOperation, t]);

  const discardGitHunk = useCallback(async (hunk: CodePaneGitDiffHunk) => {
    const didApply = await runGitOperation(
      async () => await window.electronAPI.codePaneGitDiscardHunk({
        rootPath,
        filePath: hunk.filePath,
        patch: hunk.patch,
      }),
      { successMessage: t('codePane.gitDiscardHunkSuccess') },
    );
    if (didApply) {
      await loadGitDiffHunks(hunk.filePath);
    }
  }, [loadGitDiffHunks, rootPath, runGitOperation, t]);

  const commitGitChanges = useCallback(async (config: { message: string; amend: boolean; includeAll: boolean }) => {
    const response = await window.electronAPI.codePaneGitCommit({
      rootPath,
      message: config.message,
      amend: config.amend,
      includeAll: config.includeAll,
    });
    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    await refreshLoadedDirectories();
    await refreshGitSnapshot({ includeGraph: true });
    setBanner({
      tone: 'info',
      message: response.data?.summary
        ? `${t('codePane.gitCommitSuccess')} ${response.data.summary}`
        : t('codePane.gitCommitSuccess'),
    });
  }, [refreshGitSnapshot, refreshLoadedDirectories, rootPath, t]);

  const stashGitChanges = useCallback(async (config: { message: string; includeUntracked: boolean }) => {
    const response = await window.electronAPI.codePaneGitStash({
      rootPath,
      message: config.message,
      includeUntracked: config.includeUntracked,
    });
    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    await refreshLoadedDirectories();
    await refreshGitSnapshot({ includeGraph: true });
    setBanner({
      tone: 'info',
      message: response.data?.reference
        ? `${t('codePane.gitStashSuccess')} ${response.data.reference}`
        : t('codePane.gitStashSuccess'),
    });
  }, [refreshGitSnapshot, refreshLoadedDirectories, rootPath, t]);

  const checkoutGitBranch = useCallback(async (config: { branchName: string; createBranch: boolean; startPoint?: string }) => {
    const didCheckout = await runGitOperation(
      async () => await window.electronAPI.codePaneGitCheckout({
        rootPath,
        branchName: config.branchName,
        createBranch: config.createBranch,
        startPoint: config.startPoint,
      }),
      {
        successMessage: t('codePane.gitCheckoutSuccess'),
        refreshGraph: true,
      },
    );
    if (didCheckout) {
      await loadGitBranches({ preferredBaseRef: gitRebaseBaseRef });
    }
  }, [gitRebaseBaseRef, loadGitBranches, rootPath, runGitOperation, t]);

  const controlGitRebase = useCallback(async (action: 'continue' | 'abort') => {
    const didControl = await runGitOperation(
      async () => await window.electronAPI.codePaneGitRebaseControl({
        rootPath,
        action,
      }),
      {
        successMessage: action === 'continue' ? t('codePane.gitRebaseContinueSuccess') : t('codePane.gitRebaseAbortSuccess'),
        refreshGraph: true,
      },
    );
    if (didControl) {
      await loadGitBranches({ preferredBaseRef: gitRebaseBaseRef });
      await loadGitRebasePlan(gitRebaseBaseRef);
    }
  }, [gitRebaseBaseRef, loadGitBranches, loadGitRebasePlan, rootPath, runGitOperation, t]);

  const renameGitBranch = useCallback(async (branchName: string, nextBranchName: string) => {
    const didRename = await runGitOperation(
      async () => await window.electronAPI.codePaneGitRenameBranch({
        rootPath,
        branchName,
        nextBranchName,
      }),
      {
        successMessage: t('codePane.gitRenameBranchSuccess'),
        refreshGraph: true,
      },
    );
    if (didRename) {
      await loadGitBranches({
        preferredBaseRef: gitRebaseBaseRef === branchName ? nextBranchName : gitRebaseBaseRef,
      });
    }
  }, [gitRebaseBaseRef, loadGitBranches, rootPath, runGitOperation, t]);

  const deleteGitBranch = useCallback(async (branchName: string, force?: boolean) => {
    const didDelete = await runGitOperation(
      async () => await window.electronAPI.codePaneGitDeleteBranch({
        rootPath,
        branchName,
        force,
      }),
      {
        successMessage: t('codePane.gitDeleteBranchSuccess'),
        refreshGraph: true,
      },
    );
    if (didDelete) {
      await loadGitBranches({
        preferredBaseRef: gitRebaseBaseRef === branchName ? '' : gitRebaseBaseRef,
      });
    }
  }, [gitRebaseBaseRef, loadGitBranches, rootPath, runGitOperation, t]);

  const applyGitRebasePlan = useCallback(async (
    baseRef: string,
    entries: CodePaneGitRebasePlanEntry[],
  ) => {
    const response = await window.electronAPI.codePaneGitApplyRebasePlan({
      rootPath,
      baseRef,
      entries,
    });

    await Promise.all([
      refreshGitSnapshot({ includeGraph: true }),
      loadGitBranches({ preferredBaseRef: baseRef }),
      loadGitRebasePlan(baseRef),
    ]);

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    setBanner({
      tone: 'info',
      message: t('codePane.gitApplyRebasePlanSuccess'),
    });
  }, [loadGitBranches, loadGitRebasePlan, refreshGitSnapshot, rootPath, t]);

  const cherryPickCommit = useCallback(async (commitSha: string) => {
    await runGitOperation(
      async () => await window.electronAPI.codePaneGitCherryPick({
        rootPath,
        commitSha,
      }),
      {
        successMessage: t('codePane.gitCherryPickSuccess'),
        refreshGraph: true,
      },
    );
  }, [rootPath, runGitOperation, t]);

  const resolveGitConflict = useCallback(async (filePath: string, strategy: 'ours' | 'theirs' | 'mark-resolved') => {
    await runGitOperation(
      async () => await window.electronAPI.codePaneGitResolveConflict({
        rootPath,
        filePath,
        strategy,
      }),
      {
        successMessage: t('codePane.gitConflictResolved'),
      },
    );
  }, [rootPath, runGitOperation, t]);

  const openGitConflictResolver = useCallback(async (filePath: string) => {
    setBottomPanelMode('conflict');
    await loadGitConflictDetails(filePath);
  }, [loadGitConflictDetails]);

  const applyGitConflictResolution = useCallback(async (mergedContent: string) => {
    if (!selectedGitConflictPath) {
      return;
    }

    setIsApplyingGitConflict(true);
    setGitConflictError(null);
    const response = await window.electronAPI.codePaneGitApplyConflictResolution({
      rootPath,
      filePath: selectedGitConflictPath,
      mergedContent,
    });

    await refreshGitSnapshot({ includeGraph: true });

    if (!response.success) {
      setGitConflictError(response.error || t('common.retry'));
      setIsApplyingGitConflict(false);
      return;
    }

    setIsApplyingGitConflict(false);
    setGitConflictDetails(null);
    setSelectedGitConflictPath(null);
    setBottomPanelMode((currentMode) => (currentMode === 'conflict' ? null : currentMode));
    setBanner({
      tone: 'info',
      message: t('codePane.gitConflictResolved'),
    });
  }, [refreshGitSnapshot, rootPath, selectedGitConflictPath, t]);

  const pruneRemovedDirectories = useCallback((changes: CodePaneFsChange[]) => {
    const removedFilePaths = new Set(
      changes
        .filter((change) => change.type === 'unlink' && isPathInside(rootPath, change.path))
        .map((change) => normalizePath(change.path)),
    );
    const removedDirectoryPaths = changes
      .filter((change) => change.type === 'unlinkDir' && isPathInside(rootPath, change.path))
      .map((change) => normalizePath(change.path));

    if (removedFilePaths.size === 0 && removedDirectoryPaths.length === 0) {
      return;
    }

    const nextLoadedDirectories = new Set(
      Array.from(loadedDirectoriesRef.current).filter((directoryPath) => (
        !isPathAffectedByRemovedDirectory(removedDirectoryPaths, directoryPath)
      )),
    );
    loadedDirectoriesRef.current = nextLoadedDirectories;

    startTransition(() => {
      setLoadedDirectories(new Set(nextLoadedDirectories));
      setExpandedDirectories((currentExpandedDirectories) => {
        if (removedDirectoryPaths.length === 0) {
          return currentExpandedDirectories;
        }

        const nextExpandedDirectories = new Set(
          Array.from(currentExpandedDirectories).filter((directoryPath) => (
            !isPathAffectedByRemovedDirectory(removedDirectoryPaths, directoryPath)
          )),
        );

        if (nextExpandedDirectories.size === currentExpandedDirectories.size) {
          return currentExpandedDirectories;
        }

        persistCodeState({
          expandedPaths: getPersistedExpandedPaths(nextExpandedDirectories),
        });

        return nextExpandedDirectories;
      });
      setTreeEntriesByDirectory((currentTreeEntries) => (
        Object.fromEntries(
          Object.entries(currentTreeEntries)
            .filter(([directoryPath]) => (
              !isPathAffectedByRemovedDirectory(removedDirectoryPaths, directoryPath)
            ))
            .map(([directoryPath, entries]) => [
              directoryPath,
              entries.filter((entry) => {
                const normalizedEntryPath = normalizePath(entry.path);
                if (removedFilePaths.has(normalizedEntryPath)) {
                  return false;
                }

                return !isPathAffectedByRemovedDirectory(removedDirectoryPaths, normalizedEntryPath);
              }),
            ]),
        )
      ));
    });
  }, [persistCodeState, rootPath]);

  const ensureMarkerListenerRef = useRef(ensureMarkerListener);
  const disposeEditorsRef = useRef(disposeEditors);
  const disposeAllModelsRef = useRef(disposeAllModels);
  const flushDirtyFilesRef = useRef(flushDirtyFiles);
  const closeAllLanguageDocumentsRef = useRef(closeAllLanguageDocuments);
  const refreshDirectoryPathsRef = useRef(refreshDirectoryPaths);
  const pruneRemovedDirectoriesRef = useRef(pruneRemovedDirectories);
  const reloadFileFromDiskRef = useRef(reloadFileFromDisk);

  useEffect(() => {
    ensureMarkerListenerRef.current = ensureMarkerListener;
  }, [ensureMarkerListener]);

  useEffect(() => {
    disposeEditorsRef.current = disposeEditors;
  }, [disposeEditors]);

  useEffect(() => {
    disposeAllModelsRef.current = disposeAllModels;
  }, [disposeAllModels]);

  useEffect(() => {
    flushDirtyFilesRef.current = flushDirtyFiles;
  }, [flushDirtyFiles]);

  useEffect(() => {
    closeAllLanguageDocumentsRef.current = closeAllLanguageDocuments;
  }, [closeAllLanguageDocuments]);

  useEffect(() => {
    refreshDirectoryPathsRef.current = refreshDirectoryPaths;
  }, [refreshDirectoryPaths]);

  useEffect(() => {
    pruneRemovedDirectoriesRef.current = pruneRemovedDirectories;
  }, [pruneRemovedDirectories]);

  useEffect(() => {
    reloadFileFromDiskRef.current = reloadFileFromDisk;
  }, [reloadFileFromDisk]);

  const revealPath = useCallback(async (targetPath: string, entryType: CodePaneTreeEntry['type']) => {
    try {
      const response = await window.electronAPI.openFolder(
        entryType === 'directory' ? targetPath : getParentDirectory(targetPath),
      );
      if (response && response.success === false) {
        setBanner({
          tone: 'error',
          message: response.error || t('common.retry'),
        });
      }
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : t('common.retry'),
      });
    }
  }, [t]);

  const copyPath = useCallback(async (targetPath: string) => {
    try {
      const response = await window.electronAPI.writeClipboardText(targetPath);
      if (response && response.success === false) {
        setBanner({
          tone: 'error',
          message: response.error || t('common.retry'),
        });
        return;
      }

      setBanner({
        tone: 'info',
        message: t('codePane.pathCopied'),
        filePath: targetPath,
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : t('common.retry'),
      });
    }
  }, [t]);

  const togglePinnedTab = useCallback((filePath: string) => {
    updateOpenFileTabs((currentOpenFiles) => currentOpenFiles.map((tab) => {
      if (tab.path !== filePath) {
        return tab;
      }

      const nextPinned = !tab.pinned;
      return {
        ...tab,
        pinned: nextPinned || undefined,
        preview: nextPinned ? false : tab.preview,
      };
    }));
  }, [updateOpenFileTabs]);

  const openFileInSplit = useCallback(async (filePath: string) => {
    const loadedModel = fileModelsRef.current.get(filePath) ?? await loadFileIntoModel(filePath);
    if (!loadedModel) {
      return;
    }

    updateOpenFileTabs((currentOpenFiles) => upsertOpenFileTab(currentOpenFiles, filePath, {
      promote: true,
    }));
    persistEditorSplitLayout({
      visible: true,
      secondaryFilePath: filePath,
    });
    await refreshEditorSurface();
  }, [loadFileIntoModel, persistEditorSplitLayout, refreshEditorSurface, updateOpenFileTabs]);

  const toggleEditorSplit = useCallback(async () => {
    if (isEditorSplitVisible) {
      persistEditorSplitLayout({
        visible: false,
      });
      return;
    }

    const targetFilePath = secondaryFilePathRef.current ?? activeFilePathRef.current;
    if (!targetFilePath) {
      return;
    }

    await openFileInSplit(targetFilePath);
  }, [isEditorSplitVisible, openFileInSplit, persistEditorSplitLayout]);

  const loadTodoEntries = useCallback(async () => {
    setIsTodoLoading(true);
    setTodoError(null);

    const responses = await Promise.all(
      CODE_PANE_TODO_TOKENS.map(async (token) => ({
        token,
        response: await trackRequest(
          `todo-scan:${rootPath}:${token}`,
          'TODO scan',
          token,
          async () => await window.electronAPI.codePaneSearchContents({
            rootPath,
            query: token,
            limit: 120,
            maxMatchesPerFile: 20,
          }),
        ),
      })),
    );

    const nextTodoItems = responses.flatMap(({ token, response }) => {
      if (!response.success) {
        return [];
      }

      return (response.data ?? [])
        .filter((item) => item.lineText.toUpperCase().includes(token))
        .map((item) => ({
          ...item,
          token,
        }));
    }).sort((left, right) => {
      const pathOrder = left.filePath.localeCompare(right.filePath);
      if (pathOrder !== 0) {
        return pathOrder;
      }
      if (left.lineNumber !== right.lineNumber) {
        return left.lineNumber - right.lineNumber;
      }
      return left.column - right.column;
    });

    const uniqueTodoItems = nextTodoItems.filter((item, index, items) => {
      const itemKey = `${item.token}:${item.filePath}:${item.lineNumber}:${item.column}`;
      return items.findIndex((candidate) => (
        `${candidate.token}:${candidate.filePath}:${candidate.lineNumber}:${candidate.column}` === itemKey
      )) === index;
    });

    const firstError = responses.find(({ response }) => !response.success)?.response.error ?? null;
    setTodoItems(uniqueTodoItems);
    setTodoError(firstError);
    setIsTodoLoading(false);
  }, [rootPath, trackRequest]);

  const toggleBookmarkAtCursor = useCallback(() => {
    const context = getActiveEditorContext();
    if (!context) {
      return;
    }

    const bookmarkId = `${context.filePath}:${context.position.lineNumber}`;
    const currentBookmarks = paneRef.current.code?.bookmarks ?? bookmarks;
    const existingBookmark = currentBookmarks.find((bookmark) => bookmark.id === bookmarkId);
    const nextBookmarks = existingBookmark
      ? currentBookmarks.filter((bookmark) => bookmark.id !== bookmarkId)
      : [
        {
          id: bookmarkId,
          filePath: context.filePath,
          lineNumber: context.position.lineNumber,
          column: context.position.column,
          label: getPathLeafLabel(context.filePath) || context.filePath,
          createdAt: new Date().toISOString(),
        },
        ...currentBookmarks,
      ].sort((left, right) => {
        const pathOrder = left.filePath.localeCompare(right.filePath);
        return pathOrder !== 0 ? pathOrder : left.lineNumber - right.lineNumber;
      });

    persistCodeState({
      bookmarks: nextBookmarks,
    });
  }, [bookmarks, getActiveEditorContext, persistCodeState]);

  const restoreLocalHistoryEntry = useCallback(async (entryId: string) => {
    const allEntries = Array.from(localHistoryEntriesRef.current.values()).flat();
    const entry = allEntries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      return;
    }

    const model = fileModelsRef.current.get(entry.filePath) ?? await loadFileIntoModel(entry.filePath);
    if (!model) {
      return;
    }

    addLocalHistoryEntry(entry.filePath, 'restore', model.getValue());
    suppressModelEventsRef.current.add(entry.filePath);
    model.setValue(entry.content);
    suppressModelEventsRef.current.delete(entry.filePath);
    clearDefinitionLookupCache();
    markDirty(entry.filePath, true);
    await syncLanguageDocument(entry.filePath, 'change');
    await activateFile(entry.filePath, {
      recordRecent: true,
      promotePreview: true,
    });
  }, [
    activateFile,
    addLocalHistoryEntry,
    clearDefinitionLookupCache,
    loadFileIntoModel,
    markDirty,
    syncLanguageDocument,
  ]);

  useEffect(() => {
    let mounted = true;

    const handleFsChanged = (_event: unknown, payload: CodePaneFsChangedPayload) => {
      if (normalizePath(payload.rootPath) !== normalizePath(rootPath)) {
        return;
      }

      const openFilePathSet = new Set((paneRef.current.code?.openFiles ?? []).map((file) => file.path));
      for (const change of payload.changes) {
        if (!openFilePathSet.has(change.path)) {
          continue;
        }

        const lastSavedAt = fileMetaRef.current.get(change.path)?.lastSavedAt ?? 0;
        if (Date.now() - lastSavedAt < 1200) {
          continue;
        }

        if (dirtyPathsRef.current.has(change.path)) {
          setBanner({
            tone: 'warning',
            message: t('codePane.externalChange'),
            filePath: change.path,
            showReload: true,
            showOverwrite: true,
          });
        } else {
          void reloadFileFromDiskRef.current(change.path);
        }
      }

      pruneRemovedDirectoriesRef.current(payload.changes);

      const directoriesToRefresh = collectDirectoryRefreshPaths(
        rootPath,
        payload.changes,
        loadedDirectoriesRef.current,
      );

      void refreshDirectoryPathsRef.current(directoriesToRefresh, {
        showLoadingIndicator: false,
      });
    };

    const handleIndexProgress = (_event: unknown, payload: CodePaneIndexProgressPayload) => {
      if (payload.paneId !== pane.id) {
        return;
      }

      startTransition(() => {
        if (payload.state === 'ready') {
          setIndexStatus(null);
          return;
        }

        setIndexStatus(payload);
      });
    };

    const handleLanguageWorkspaceChanged = (
      _event: unknown,
      payload: CodePaneLanguageWorkspaceChangedPayload,
    ) => {
      if (!matchesLanguageWorkspaceRoot(rootPath, payload.state)) {
        return;
      }

      startTransition(() => {
        setLanguageWorkspaceState(payload.state);
      });
    };

    window.electronAPI.onCodePaneFsChanged(handleFsChanged);
    window.electronAPI.onCodePaneIndexProgress(handleIndexProgress);
    window.electronAPI.onCodePaneLanguageWorkspaceChanged(handleLanguageWorkspaceChanged);

    const bootstrap = async () => {
      const initialExpandedDirectories = createExpandedDirectorySet(
        rootPath,
        paneRef.current.code?.expandedPaths,
      );

      setIsBootstrapping(true);
      setBanner(null);
      setTreeLoadError(null);
      setSearchError(null);
      setContentSearchError(null);
      setTreeEntriesByDirectory({});
      setExternalEntriesByDirectory({});
      setExternalLibrarySections([]);
      setExternalLibrariesError(null);
      setIndexStatus(null);
      setLanguageWorkspaceState(null);
      setExpandedDirectories(initialExpandedDirectories);
      setLoadedDirectories(new Set());
      setLoadedExternalDirectories(new Set());
      setLoadingDirectories(new Set([rootPath]));
      setLoadingExternalDirectories(new Set());
      setSearchResults([]);
      setContentSearchResults([]);
      setIsSearchEverywhereOpen(false);
      setSearchEverywhereQuery('');
      setCodeActionItems([]);
      setIsCodeActionMenuOpen(false);
      setCodeActionMenuError(null);
      setBottomPanelMode(null);
      setRunTargets([]);
      setIsRunTargetsLoading(false);
      setRunTargetsError(null);
      setTestItems([]);
      setIsTestsLoading(false);
      setTestsError(null);
      setProjectContributions([]);
      setIsProjectLoading(false);
      setProjectError(null);
      setGitBranches([]);
      setSelectedGitBranchName(null);
      setSelectedGitLogCommitSha(null);
      setIsGitBranchesLoading(false);
      setGitBranchesError(null);
      setGitRebasePlan(null);
      setGitRebaseBaseRef('');
      setIsGitRebaseLoading(false);
      setGitRebaseError(null);
      setSelectedGitChangePath(null);
      setGitStagedHunks([]);
      setGitUnstagedHunks([]);
      setIsGitHunksLoading(false);
      setGitHunksError(null);
      setRunSessions([]);
      setRunSessionOutputs({});
      setSelectedRunSessionId(null);
      recentFilesRef.current = [];
      recentLocationsRef.current = [];
      navigationBackStackRef.current = [];
      navigationForwardStackRef.current = [];
      setRecentFiles([]);
      setRecentLocations([]);
      setNavigationStateVersion((currentVersion) => currentVersion + 1);
      disposeEditorsRef.current();
      disposeAllModelsRef.current();

      try {
        if (supportsMonaco) {
          void ensureMonacoEnvironment()
            .then((monaco) => {
              if (!mounted) {
                return;
              }

              monacoRef.current = monaco;
              languageBridgeRef.current = ensureMonacoLanguageBridge(monaco);
              ensureMarkerListenerRef.current(monaco);
            })
            .catch(() => {});
        }

        void window.electronAPI.codePaneWatchRoot({
          paneId: pane.id,
          rootPath,
        }).then((response) => {
          if (!mounted || response.success) {
            return;
          }

          setIndexStatus({
            paneId: pane.id,
            rootPath,
            state: 'error',
            processedDirectoryCount: 0,
            totalDirectoryCount: 0,
            indexedFileCount: 0,
            reusedPersistedIndex: false,
            error: response.error || t('codePane.indexingFailed'),
          });
        }).catch((error) => {
          if (!mounted) {
            return;
          }

          setIndexStatus({
            paneId: pane.id,
            rootPath,
            state: 'error',
            processedDirectoryCount: 0,
            totalDirectoryCount: 0,
            indexedFileCount: 0,
            reusedPersistedIndex: false,
            error: error instanceof Error ? error.message : t('codePane.indexingFailed'),
          });
        });

        await Promise.all([
          loadDirectory(rootPath),
          loadExternalLibrarySections(),
          refreshGitSnapshot(),
        ]);

        const nestedExpandedDirectories = Array.from(initialExpandedDirectories)
          .filter((directoryPath) => directoryPath !== rootPath);
        if (nestedExpandedDirectories.length > 0) {
          await Promise.all(nestedExpandedDirectories.map((directoryPath) => loadDirectory(directoryPath)));
        }
      } catch (error) {
        if (mounted) {
          setBanner({
            tone: 'error',
            message: error instanceof Error ? error.message : t('common.retry'),
          });
        }
      }

      if (mounted) {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
      window.electronAPI.offCodePaneFsChanged(handleFsChanged);
      window.electronAPI.offCodePaneIndexProgress(handleIndexProgress);
      window.electronAPI.offCodePaneLanguageWorkspaceChanged(handleLanguageWorkspaceChanged);
      void window.electronAPI.codePaneUnwatchRoot(pane.id);
      markerListenerRef.current?.dispose();
      markerListenerRef.current = null;
      void flushDirtyFilesRef.current().finally(() => {
        void closeAllLanguageDocumentsRef.current().finally(() => {
          disposeEditorsRef.current();
          disposeAllModelsRef.current();
        });
      });
    };
  }, [loadDirectory, loadExternalLibrarySections, pane.id, refreshGitSnapshot, rootPath, supportsMonaco, t]);

  useEffect(() => {
    if (!isSidebarVisible || sidebarMode !== 'scm') {
      return undefined;
    }

    void refreshGitSnapshot({ includeGraph: true });

    const refreshInterval = window.setInterval(() => {
      if (!document.hidden) {
        void refreshGitSnapshot({ includeGraph: true });
      }
    }, 5000);

    return () => {
      window.clearInterval(refreshInterval);
    };
  }, [isSidebarVisible, refreshGitSnapshot, sidebarMode]);

  useEffect(() => {
    if (!activeFilePath) {
      void refreshEditorSurface();
      return;
    }

    const syncActiveSurface = async () => {
      const currentViewMode = paneRef.current.code?.viewMode ?? viewMode;
      const currentDiffTargetPath = paneRef.current.code?.diffTargetPath ?? diffTargetPath ?? activeFilePath;
      const currentSecondaryFilePath = secondaryFilePathRef.current;
      const loadedModel = fileModelsRef.current.get(activeFilePath) ?? await loadFileIntoModel(activeFilePath);
      if (!loadedModel) {
        return;
      }

      if (currentViewMode === 'diff') {
        const didEnsureDiffModel = await ensureDiffModel(activeFilePath, {
          baseFilePath: currentDiffTargetPath,
          showBanner: false,
        });
        if (!didEnsureDiffModel) {
          persistCodeState({
            viewMode: 'editor',
            diffTargetPath: null,
          });
        }
      }

      if (currentViewMode === 'editor' && isEditorSplitVisible && currentSecondaryFilePath && currentSecondaryFilePath !== activeFilePath) {
        await loadFileIntoModel(currentSecondaryFilePath);
      }

      await refreshEditorSurface();
    };

    void syncActiveSurface();
  }, [
    activeFilePath,
    diffTargetPath,
    ensureDiffModel,
    isEditorSplitVisible,
    loadFileIntoModel,
    persistCodeState,
    refreshEditorSurface,
    secondaryFilePath,
    viewMode,
  ]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    editorRef.current?.focus();
    diffEditorRef.current?.getModifiedEditor().focus();
  }, [isActive]);

  useEffect(() => {
    const trimmedQuery = deferredSearchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);
    const requestKey = `search-files:${rootPath}`;
    const requestVersion = runtimeStoreRef.current.markLatest(requestKey);
    const cacheKey = `${requestKey}:${trimmedQuery}`;
    const cachedResults = runtimeStoreRef.current.getCache<string[]>(cacheKey, CODE_PANE_SEARCH_CACHE_TTL_MS);
    if (cachedResults) {
      const handle = runtimeStoreRef.current.beginRequest(requestKey, 'File search', trimmedQuery);
      runtimeStoreRef.current.finishRequest(handle, 'completed', { fromCache: true });
      setSearchResults(cachedResults);
      setIsSearching(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      const response = await trackRequest(
        requestKey,
        'File search',
        trimmedQuery,
        async () => await window.electronAPI.codePaneSearchFiles({
          rootPath,
          query: trimmedQuery,
          limit: 80,
        }),
      );

      if (cancelled || !runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        return;
      }

      if (response.success) {
        runtimeStoreRef.current.setCache(cacheKey, response.data ?? []);
      }
      startTransition(() => {
        setSearchResults(response.success ? (response.data ?? []) : []);
      });
      setSearchError(response.success ? null : (response.error || t('common.retry')));
      setIsSearching(false);
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredSearchQuery, rootPath, t, trackRequest]);

  useEffect(() => {
    const trimmedQuery = deferredContentSearchQuery.trim();
    if (!trimmedQuery) {
      setContentSearchResults([]);
      setIsContentSearching(false);
      setContentSearchError(null);
      return;
    }

    let cancelled = false;
    setIsContentSearching(true);
    setContentSearchError(null);
    const requestKey = `search-contents:${rootPath}`;
    const requestVersion = runtimeStoreRef.current.markLatest(requestKey);
    const cacheKey = `${requestKey}:${trimmedQuery}`;
    const cachedResults = runtimeStoreRef.current.getCache<CodePaneContentMatch[]>(cacheKey, CODE_PANE_SEARCH_CACHE_TTL_MS);
    if (cachedResults) {
      const handle = runtimeStoreRef.current.beginRequest(requestKey, 'Content search', trimmedQuery);
      runtimeStoreRef.current.finishRequest(handle, 'completed', { fromCache: true });
      setContentSearchResults(cachedResults);
      setIsContentSearching(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      const response = await trackRequest(
        requestKey,
        'Content search',
        trimmedQuery,
        async () => await window.electronAPI.codePaneSearchContents({
          rootPath,
          query: trimmedQuery,
          limit: 120,
          maxMatchesPerFile: 6,
        }),
      );

      if (cancelled || !runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        return;
      }

      if (response.success) {
        runtimeStoreRef.current.setCache(cacheKey, response.data ?? []);
      }
      startTransition(() => {
        setContentSearchResults(response.success ? (response.data ?? []) : []);
      });
      setContentSearchError(response.success ? null : (response.error || t('common.retry')));
      setIsContentSearching(false);
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredContentSearchQuery, rootPath, t, trackRequest]);

  useEffect(() => {
    const trimmedQuery = deferredWorkspaceSymbolQuery.trim();
    if (!trimmedQuery) {
      setWorkspaceSymbolResults([]);
      setIsWorkspaceSymbolSearching(false);
      setWorkspaceSymbolError(null);
      return;
    }

    let cancelled = false;
    setIsWorkspaceSymbolSearching(true);
    setWorkspaceSymbolError(null);
    const requestKey = `workspace-symbols:${rootPath}`;
    const requestVersion = runtimeStoreRef.current.markLatest(requestKey);
    const cacheKey = `${requestKey}:${trimmedQuery}`;
    const cachedResults = runtimeStoreRef.current.getCache<CodePaneWorkspaceSymbol[]>(cacheKey, CODE_PANE_SEARCH_CACHE_TTL_MS);
    if (cachedResults) {
      const handle = runtimeStoreRef.current.beginRequest(requestKey, 'Workspace symbols', trimmedQuery);
      runtimeStoreRef.current.finishRequest(handle, 'completed', { fromCache: true });
      setWorkspaceSymbolResults(cachedResults);
      setIsWorkspaceSymbolSearching(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      const response = await trackRequest(
        requestKey,
        'Workspace symbols',
        trimmedQuery,
        async () => await window.electronAPI.codePaneGetWorkspaceSymbols({
          rootPath,
          query: trimmedQuery,
          limit: 120,
        }),
      );

      if (cancelled || !runtimeStoreRef.current.isLatest(requestKey, requestVersion)) {
        return;
      }

      if (response.success) {
        runtimeStoreRef.current.setCache(cacheKey, response.data ?? []);
      }
      startTransition(() => {
        setWorkspaceSymbolResults(response.success ? (response.data ?? []) : []);
      });
      setWorkspaceSymbolError(response.success ? null : (response.error || t('common.retry')));
      setIsWorkspaceSymbolSearching(false);
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredWorkspaceSymbolQuery, rootPath, t, trackRequest]);

  const getCurrentNavigationLocation = useCallback((): NavigationHistoryEntry | null => {
    const context = getActiveEditorContext();
    if (context) {
      return {
        filePath: context.filePath,
        lineNumber: context.position.lineNumber,
        column: context.position.column,
        displayPath: fileMetaRef.current.get(context.filePath)?.displayPath,
      };
    }

    const filePath = activeFilePathRef.current;
    if (!filePath) {
      return null;
    }

    return {
      filePath,
      lineNumber: 1,
      column: 1,
      displayPath: fileMetaRef.current.get(filePath)?.displayPath,
    };
  }, [getActiveEditorContext]);

  const rememberRecentLocation = useCallback((location: NavigationHistoryEntry) => {
    setRecentLocations((currentRecentLocations) => {
      const nextRecentLocations = [
        location,
        ...currentRecentLocations.filter((entry) => !isSameNavigationLocation(entry, location)),
      ].slice(0, CODE_PANE_MAX_RECENT_LOCATIONS);
      recentLocationsRef.current = nextRecentLocations;
      return nextRecentLocations;
    });
  }, []);

  const clearNavigationForwardStack = useCallback(() => {
    if (navigationForwardStackRef.current.length === 0) {
      return;
    }

    navigationForwardStackRef.current = [];
    setNavigationStateVersion((currentVersion) => currentVersion + 1);
  }, []);

  const pushNavigationBackStack = useCallback((location: NavigationHistoryEntry) => {
    const currentBackStack = navigationBackStackRef.current;
    const lastBackLocation = currentBackStack[currentBackStack.length - 1];
    if (isSameNavigationLocation(lastBackLocation, location)) {
      return;
    }

    navigationBackStackRef.current = [
      ...currentBackStack,
      location,
    ].slice(-CODE_PANE_MAX_NAVIGATION_HISTORY);
    setNavigationStateVersion((currentVersion) => currentVersion + 1);
  }, []);

  const openEditorLocation = useCallback(async (
    location: FileNavigationLocation,
    options?: {
      preserveTabs?: boolean;
      recordHistory?: boolean;
      recordRecent?: boolean;
      clearForward?: boolean;
    },
  ) => {
    if (options?.recordHistory !== false) {
      const currentLocation = getCurrentNavigationLocation();
      if (currentLocation && !isSameNavigationLocation(currentLocation, location)) {
        pushNavigationBackStack(currentLocation);
      }
    }

    if (options?.clearForward !== false) {
      clearNavigationForwardStack();
    }

    if (options?.recordRecent !== false) {
      rememberRecentLocation({
        filePath: location.filePath,
        lineNumber: location.lineNumber,
        column: location.column,
        displayPath: location.displayPath,
      });
    }

    if (typeof location.content === 'string') {
      preloadedReadResultsRef.current.set(location.filePath, {
        content: location.content,
        mtimeMs: 0,
        size: location.content.length,
        language: location.language ?? 'plaintext',
        isBinary: false,
        readOnly: location.readOnly,
        displayPath: location.displayPath,
        documentUri: location.documentUri,
      });
    }

    pendingNavigationRef.current = location;
    await activateFile(location.filePath, {
      recordRecent: options?.recordRecent,
      promotePreview: true,
    });
  }, [
    activateFile,
    clearNavigationForwardStack,
    getCurrentNavigationLocation,
    pushNavigationBackStack,
    rememberRecentLocation,
  ]);

  const getDisplayPath = useCallback((filePath: string) => (
    fileMetaRef.current.get(filePath)?.displayPath ?? filePath
  ), []);

  const getFileLabel = useCallback((filePath: string) => (
    getPathLeafLabel(getDisplayPath(filePath)) || getDisplayPath(filePath)
  ), [getDisplayPath]);

  const activeSymbolPath = useMemo(() => findActiveDocumentSymbolPath(
    activeDocumentSymbols,
    activeCursorLineNumber,
    activeCursorColumn,
  ), [activeCursorColumn, activeCursorLineNumber, activeDocumentSymbols]);

  const breadcrumbItems = useMemo<CodePaneBreadcrumbItem[]>(() => {
    if (!breadcrumbFilePath) {
      return [];
    }

    const fileItem: CodePaneBreadcrumbItem = {
      id: `file:${breadcrumbFilePath}`,
      label: getRelativePath(rootPath, getDisplayPath(breadcrumbFilePath)),
      detail: breadcrumbFilePath,
      kind: 'file',
      lineNumber: 1,
      column: 1,
    };

    return [
      fileItem,
      ...activeSymbolPath.map((symbol) => ({
        id: `symbol:${breadcrumbFilePath}:${symbol.name}:${symbol.selectionRange.startLineNumber}:${symbol.selectionRange.startColumn}`,
        label: symbol.name,
        detail: symbol.detail,
        kind: 'symbol' as const,
        lineNumber: symbol.selectionRange.startLineNumber,
        column: symbol.selectionRange.startColumn,
      })),
    ];
  }, [activeSymbolPath, breadcrumbFilePath, getDisplayPath, rootPath]);

  const visibleLocalHistoryEntries = useMemo(() => {
    const sourceEntries = activeFilePath
      ? (localHistoryEntriesRef.current.get(activeFilePath) ?? [])
      : Array.from(localHistoryEntriesRef.current.values()).flat();
    return [...sourceEntries]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 24);
  }, [activeFilePath, localHistoryVersion]);

  const runtimeRequests = useMemo(() => (
    runtimeStoreRef.current.getRecentRequests()
  ), [runtimeStoreVersion]);

  const activePerformanceTasks = useMemo(() => {
    const nextTasks = [];

    if (isRunTargetsLoading) {
      nextTasks.push({
        id: 'run-targets',
        label: 'Run targets',
        detail: activeFilePath ? getRelativePath(rootPath, activeFilePath) : rootPath,
        status: 'running' as const,
      });
    }
    if (isTestsLoading) {
      nextTasks.push({
        id: 'tests',
        label: 'Test discovery',
        detail: activeFilePath ? getRelativePath(rootPath, activeFilePath) : rootPath,
        status: 'running' as const,
      });
    }
    if (isProjectLoading) {
      nextTasks.push({
        id: 'project',
        label: 'Project model',
        detail: rootPath,
        status: 'running' as const,
      });
    }
    if (isDebugDetailsLoading) {
      nextTasks.push({
        id: 'debug-details',
        label: 'Debug session details',
        detail: selectedDebugSessionId ?? 'session',
        status: 'running' as const,
      });
    }
    if (isTodoLoading) {
      nextTasks.push({
        id: 'todo',
        label: 'TODO scan',
        detail: rootPath,
        status: 'running' as const,
      });
    }
    if (isGitHistoryLoading) {
      nextTasks.push({
        id: 'git-history',
        label: 'Git history',
        detail: gitHistory?.targetFilePath ? getRelativePath(rootPath, gitHistory.targetFilePath) : rootPath,
        status: 'running' as const,
      });
    }

    return nextTasks;
  }, [
    activeFilePath,
    gitHistory?.targetFilePath,
    isDebugDetailsLoading,
    isGitHistoryLoading,
    isProjectLoading,
    isRunTargetsLoading,
    isTestsLoading,
    isTodoLoading,
    rootPath,
    selectedDebugSessionId,
  ]);

  const hasRuntimeActivity = runtimeRequests.some((request) => request.status === 'running') || activePerformanceTasks.length > 0;

  const currentLineBookmarkId = activeFilePath
    ? `${activeFilePath}:${activeCursorLineNumber}`
    : null;
  const isCurrentLineBookmarked = currentLineBookmarkId
    ? bookmarks.some((bookmark) => bookmark.id === currentLineBookmarkId)
    : false;

  const activeTabStatus = activeFilePath ? getEntryStatus(activeFilePath, 'file') : undefined;
  const activeFileReadOnly = activeFilePath ? Boolean(fileMetaRef.current.get(activeFilePath)?.readOnly) : false;
  const activeStatusText = activeFilePath
    ? savingPaths.has(activeFilePath)
      ? t('codePane.saving')
      : dirtyPaths.has(activeFilePath)
        ? t('codePane.unsaved')
        : t('codePane.saved')
    : t('codePane.autoSave');
  const activeFileDisplayPath = activeFilePath ? getDisplayPath(activeFilePath) : null;
  const indexStatusText = indexStatus?.state === 'building'
    ? t('codePane.indexingProgress', {
      processed: indexStatus.processedDirectoryCount,
      total: indexStatus.totalDirectoryCount,
      files: indexStatus.indexedFileCount,
    })
    : (indexStatus?.error || t('codePane.indexingFailed'));
  const languageStatusText = useMemo(() => {
    if (!languageWorkspaceState) {
      return null;
    }

    const languageLabel = formatLanguageLabel(languageWorkspaceState.languageId);
    const progressText = languageWorkspaceState.progressText || languageWorkspaceState.message;

    switch (languageWorkspaceState.phase) {
      case 'ready':
        return `${languageLabel}: ready`;
      case 'error':
        return progressText ? `${languageLabel}: ${progressText}` : `${languageLabel}: error`;
      case 'importing-project':
        return progressText ? `${languageLabel}: ${progressText}` : `${languageLabel}: importing project`;
      case 'indexing-workspace':
        return progressText ? `${languageLabel}: ${progressText}` : `${languageLabel}: indexing workspace`;
      case 'detecting-project':
        return progressText ? `${languageLabel}: ${progressText}` : `${languageLabel}: detecting project`;
      case 'starting':
      case 'degraded':
      case 'idle':
      default:
        return progressText ? `${languageLabel}: ${progressText}` : `${languageLabel}: starting`;
    }
  }, [languageWorkspaceState]);
  const languageStatusTone = useMemo(() => {
    if (!languageWorkspaceState) {
      return null;
    }

    if (languageWorkspaceState.phase === 'error') {
      return {
        className: 'bg-red-500/15 text-red-300',
        showSpinner: false,
      };
    }

    if (languageWorkspaceState.phase === 'ready') {
      return {
        className: 'bg-emerald-500/15 text-emerald-300',
        showSpinner: false,
      };
    }

    return {
      className: 'bg-amber-500/15 text-amber-300',
      showSpinner: true,
    };
  }, [languageWorkspaceState]);
  const qualityGateChip = useMemo(() => {
    if (!qualityGateState || qualityGateState.status === 'idle') {
      return null;
    }

    switch (qualityGateState.status) {
      case 'running':
        return {
          className: 'bg-sky-500/15 text-sky-300',
          showSpinner: true,
          text: qualityGateState.message || t('codePane.saveQualityRunning'),
        };
      case 'error':
        return {
          className: 'bg-red-500/15 text-red-300',
          showSpinner: false,
          text: qualityGateState.message || t('codePane.saveQualityFailed'),
        };
      case 'warning':
        return {
          className: 'bg-amber-500/15 text-amber-300',
          showSpinner: false,
          text: qualityGateState.message || t('codePane.saveQualitySavedWithIssues'),
        };
      case 'passed':
      default:
        return {
          className: 'bg-emerald-500/15 text-emerald-300',
          showSpinner: false,
          text: qualityGateState.message || t('codePane.saveQualitySaved'),
        };
    }
  }, [qualityGateState, t]);
  const statusTone = getStatusTone(activeTabStatus);
  const sidebarEntries = treeEntriesByDirectory[rootPath] ?? [];
  const hasExternalLibraries = externalLibrarySections.some((section) => section.roots.length > 0);
  const rootLabel = useMemo(() => getPathLeafLabel(rootPath) || rootPath, [rootPath]);
  const isRootExpanded = expandedDirectories.has(rootPath);
  const isRootSelected = selectedPath === rootPath;
  const rootBadge = getStatusTone(getEntryStatus(rootPath, 'directory'));
  const orderedOpenFiles = useMemo(() => sortOpenFilesByPinned(openFiles), [openFiles]);
  const contextMenuContentClassName = 'z-50 min-w-[180px] rounded border border-zinc-800 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur';
  const contextMenuItemClassName = 'flex items-center gap-2 rounded px-3 py-2 text-xs text-zinc-200 outline-none transition-colors focus:bg-zinc-800 data-[highlighted]:bg-zinc-800';
  const sidebarTabs = useMemo(() => ([
    {
      mode: 'files' as const,
      icon: FileCode2,
      label: t('codePane.filesTab'),
    },
    {
      mode: 'search' as const,
      icon: Search,
      label: t('codePane.searchTab'),
    },
    {
      mode: 'scm' as const,
      icon: GitBranch,
      label: t('codePane.scmTab'),
    },
    {
      mode: 'problems' as const,
      icon: AlertTriangle,
      label: t('codePane.problemsTab'),
    },
  ]), [t]);
  const activeSidebarTab = sidebarTabs.find((tab) => tab.mode === sidebarMode) ?? sidebarTabs[0];

  const startSidebarResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    sidebarResizeCleanupRef.current?.();
    sidebarResizeStartRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidthRef.current,
    };
    setIsSidebarResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (nextEvent: MouseEvent) => {
      const resizeStart = sidebarResizeStartRef.current;
      if (!resizeStart) {
        return;
      }

      const nextWidth = clampSidebarWidth(resizeStart.startWidth + (nextEvent.clientX - resizeStart.startX));
      sidebarWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      sidebarResizeCleanupRef.current = null;
    };

    const handleMouseUp = () => {
      const resizeStart = sidebarResizeStartRef.current;
      sidebarResizeStartRef.current = null;
      setIsSidebarResizing(false);

      if (resizeStart) {
        const nextWidth = clampSidebarWidth(sidebarWidthRef.current);
        sidebarWidthRef.current = nextWidth;
        lastExpandedSidebarWidthRef.current = nextWidth;
        setSidebarWidth(nextWidth);
        setLastExpandedSidebarWidth(nextWidth);
        persistSidebarLayout({
          visible: true,
          activeView: sidebarModeRef.current,
          width: nextWidth,
          lastExpandedWidth: nextWidth,
        });
      }

      cleanup();
    };

    sidebarResizeCleanupRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [persistSidebarLayout]);

  const resetSidebarWidth = useCallback(() => {
    const nextWidth = CODE_PANE_SIDEBAR_DEFAULT_WIDTH;
    sidebarWidthRef.current = nextWidth;
    lastExpandedSidebarWidthRef.current = nextWidth;
    setSidebarWidth(nextWidth);
    setLastExpandedSidebarWidth(nextWidth);
    persistSidebarLayout({
      visible: true,
      activeView: sidebarModeRef.current,
      width: nextWidth,
      lastExpandedWidth: nextWidth,
    });
  }, [persistSidebarLayout]);

  const startEditorSplitResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    editorSplitResizeCleanupRef.current?.();
    editorSplitResizeStartRef.current = {
      startX: event.clientX,
      startSize: editorSplitSizeRef.current,
    };
    setIsEditorSplitResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (nextEvent: MouseEvent) => {
      const resizeStart = editorSplitResizeStartRef.current;
      const containerWidth = editorHostRef.current?.parentElement?.parentElement?.getBoundingClientRect().width ?? 0;
      if (!resizeStart || containerWidth <= 0) {
        return;
      }

      const nextSize = clampEditorSplitSize(
        resizeStart.startSize + ((nextEvent.clientX - resizeStart.startX) / containerWidth),
      );
      editorSplitSizeRef.current = nextSize;
      setEditorSplitSize(nextSize);
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      editorSplitResizeCleanupRef.current = null;
    };

    const handleMouseUp = () => {
      const resizeStart = editorSplitResizeStartRef.current;
      editorSplitResizeStartRef.current = null;
      setIsEditorSplitResizing(false);

      if (resizeStart) {
        const nextSize = clampEditorSplitSize(editorSplitSizeRef.current);
        editorSplitSizeRef.current = nextSize;
        setEditorSplitSize(nextSize);
        persistEditorSplitLayout({
          visible: true,
          size: nextSize,
          secondaryFilePath: secondaryFilePathRef.current,
        });
      }

      cleanup();
    };

    editorSplitResizeCleanupRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [persistEditorSplitLayout]);

  const getBottomPanelMaxHeight = useCallback(() => {
    const containerHeight = workspaceLayoutRef.current?.getBoundingClientRect().height ?? 0;
    if (containerHeight <= 0) {
      return CODE_PANE_BOTTOM_PANEL_MAX_HEIGHT;
    }

    return Math.min(
      CODE_PANE_BOTTOM_PANEL_MAX_HEIGHT,
      Math.max(
        CODE_PANE_BOTTOM_PANEL_MIN_HEIGHT,
        containerHeight - CODE_PANE_TOP_REGION_MIN_HEIGHT - CODE_PANE_STATUS_BAR_RESERVED_HEIGHT,
      ),
    );
  }, []);

  const resetBottomPanelHeight = useCallback(() => {
    const nextHeight = clampBottomPanelHeight(
      CODE_PANE_BOTTOM_PANEL_DEFAULT_HEIGHT,
      getBottomPanelMaxHeight(),
    );

    bottomPanelHeightRef.current = nextHeight;
    setBottomPanelHeight(nextHeight);
    persistBottomPanelLayout({
      height: nextHeight,
    });
  }, [getBottomPanelMaxHeight, persistBottomPanelLayout]);

  const startBottomPanelResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    bottomPanelResizeCleanupRef.current?.();
    bottomPanelResizeStartRef.current = {
      startY: event.clientY,
      startHeight: bottomPanelHeightRef.current,
    };
    setIsBottomPanelResizing(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (nextEvent: MouseEvent) => {
      const resizeStart = bottomPanelResizeStartRef.current;
      if (!resizeStart) {
        return;
      }

      const nextHeight = clampBottomPanelHeight(
        resizeStart.startHeight - (nextEvent.clientY - resizeStart.startY),
        getBottomPanelMaxHeight(),
      );
      bottomPanelHeightRef.current = nextHeight;
      setBottomPanelHeight(nextHeight);
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      bottomPanelResizeCleanupRef.current = null;
    };

    const handleMouseUp = () => {
      const resizeStart = bottomPanelResizeStartRef.current;
      bottomPanelResizeStartRef.current = null;
      setIsBottomPanelResizing(false);

      if (resizeStart) {
        const nextHeight = clampBottomPanelHeight(
          bottomPanelHeightRef.current,
          getBottomPanelMaxHeight(),
        );
        bottomPanelHeightRef.current = nextHeight;
        setBottomPanelHeight(nextHeight);
        persistBottomPanelLayout({
          height: nextHeight,
        });
      }

      cleanup();
    };

    bottomPanelResizeCleanupRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [getBottomPanelMaxHeight, persistBottomPanelLayout]);

  const ActiveSidebarIcon = activeSidebarTab.icon;

  const renderFileContextMenu = useCallback((
    filePath: string,
    entryType: CodePaneTreeEntry['type'],
    options?: {
      allowDiff?: boolean;
      pinned?: boolean;
      showPinToggle?: boolean;
    },
  ) => (
    <ContextMenu.Portal>
      <ContextMenu.Content className={contextMenuContentClassName}>
        <ContextMenu.Item
          className={contextMenuItemClassName}
          onSelect={() => {
            void revealPath(filePath, entryType);
          }}
        >
          {t('codePane.revealInFolder')}
        </ContextMenu.Item>
        <ContextMenu.Item
          className={contextMenuItemClassName}
          onSelect={() => {
            void copyPath(filePath);
          }}
        >
          {t('codePane.copyPath')}
        </ContextMenu.Item>
        {entryType === 'file' && (
          <ContextMenu.Item
            className={contextMenuItemClassName}
            onSelect={() => {
              void openFileInSplit(filePath);
            }}
          >
            {t('codePane.openInSplit')}
          </ContextMenu.Item>
        )}
        {entryType === 'file' && options?.allowDiff !== false && (
          <ContextMenu.Item
            className={contextMenuItemClassName}
            onSelect={() => {
              void openDiffForFile(filePath);
            }}
          >
            {t('codePane.openDiff')}
          </ContextMenu.Item>
        )}
        <ContextMenu.Separator className="my-1 h-px bg-zinc-800" />
        <ContextMenu.Item
          className={contextMenuItemClassName}
          onSelect={() => {
            void renamePathWithPreview(filePath);
          }}
        >
          {t('codePane.renamePath')}
        </ContextMenu.Item>
        <ContextMenu.Item
          className={contextMenuItemClassName}
          onSelect={() => {
            void movePathWithPreview(filePath);
          }}
        >
          {t('codePane.movePath')}
        </ContextMenu.Item>
        <ContextMenu.Item
          className={contextMenuItemClassName}
          onSelect={() => {
            void safeDeletePathWithPreview(filePath);
          }}
        >
          {t('codePane.safeDelete')}
        </ContextMenu.Item>
        {entryType === 'file' && options?.showPinToggle && (
          <>
            <ContextMenu.Separator className="my-1 h-px bg-zinc-800" />
            <ContextMenu.Item
              className={contextMenuItemClassName}
              onSelect={() => {
                togglePinnedTab(filePath);
              }}
            >
              {options.pinned ? t('codePane.unpinTab') : t('codePane.pinTab')}
            </ContextMenu.Item>
          </>
        )}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  ), [
    contextMenuContentClassName,
    contextMenuItemClassName,
    copyPath,
    movePathWithPreview,
    openFileInSplit,
    openDiffForFile,
    renamePathWithPreview,
    revealPath,
    safeDeletePathWithPreview,
    t,
    togglePinnedTab,
  ]);

  const renderTree = useCallback((directoryPath: string, depth: number): React.ReactNode => {
    const entries = getDirectoryEntries(directoryPath);
    return entries.map((entry) => {
      const isDirectory = entry.type === 'directory';
      const isExpanded = expandedDirectories.has(entry.path);
      const isSelected = selectedPath === entry.path;
      const entryStatus = getEntryStatus(entry.path, entry.type);
      const badge = getStatusTone(entryStatus);

      return (
        <React.Fragment key={entry.path}>
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (isDirectory) {
                    toggleDirectory(entry.path);
                  } else {
                    void activateFile(entry.path, { preview: true });
                  }
                }}
                onDoubleClick={() => {
                  if (!isDirectory) {
                    void activateFile(entry.path, { promotePreview: true });
                  }
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${isSelected ? 'bg-[rgb(var(--primary))]/15 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/70'}`}
                style={{ paddingLeft: `${10 + depth * 14}px` }}
              >
                {isDirectory ? (
                  isExpanded ? <ChevronDown size={14} className="shrink-0 text-zinc-500" /> : <ChevronRight size={14} className="shrink-0 text-zinc-500" />
                ) : (
                  <span className="w-[14px] shrink-0" />
                )}
                {isDirectory ? (
                  isExpanded ? <FolderOpen size={14} className="shrink-0 text-amber-300" /> : <Folder size={14} className="shrink-0 text-amber-300" />
                ) : (
                  <FileIcon size={14} className="shrink-0 text-zinc-500" />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {isDirectoryLoading(entry.path) && (
                  <Loader2 size={12} className="shrink-0 animate-spin text-zinc-500" />
                )}
                {badge && (
                  <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${badge.className}`}>
                    {badge.badge}
                  </span>
                )}
              </button>
            </ContextMenu.Trigger>
            {renderFileContextMenu(entry.path, entry.type, {
              allowDiff: isPathInside(rootPath, entry.path),
            })}
          </ContextMenu.Root>
          {isDirectory && isExpanded && renderTree(entry.path, depth + 1)}
        </React.Fragment>
      );
    });
  }, [activateFile, expandedDirectories, getDirectoryEntries, getEntryStatus, isDirectoryLoading, renderFileContextMenu, rootPath, selectedPath, toggleDirectory]);

  const renderedExternalLibrarySections = useMemo(() => {
    if (!hasExternalLibraries && !externalLibrariesError) {
      return null;
    }

    return (
      <div className="mt-3 border-t border-zinc-800/80 pt-3">
        {externalLibrariesError ? (
          <div className="px-2 pb-2 text-xs text-red-300">{externalLibrariesError}</div>
        ) : null}
        {externalLibrarySections.map((section) => (
          <div key={section.id} className="pb-3">
            <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              {`${t('codePane.externalLibraries')} · ${formatLanguageLabel(section.languageId)}`}
            </div>
            {section.roots.map((root) => {
              const isExpanded = expandedDirectories.has(root.path);
              const isSelected = selectedPath === root.path;
              const helperText = root.description ?? root.path;

              return (
                <div key={root.id}>
                  <ContextMenu.Root>
                    <ContextMenu.Trigger asChild>
                      <button
                        type="button"
                        title={root.path}
                        onClick={() => {
                          toggleDirectory(root.path);
                        }}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${isSelected ? 'bg-[rgb(var(--primary))]/15 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/70'}`}
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} className="shrink-0 text-zinc-500" />
                        ) : (
                          <ChevronRight size={14} className="shrink-0 text-zinc-500" />
                        )}
                        {isExpanded ? (
                          <FolderOpen size={14} className="shrink-0 text-amber-300" />
                        ) : (
                          <Folder size={14} className="shrink-0 text-amber-300" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{root.label}</span>
                        {isDirectoryLoading(root.path) && (
                          <Loader2 size={12} className="shrink-0 animate-spin text-zinc-500" />
                        )}
                      </button>
                    </ContextMenu.Trigger>
                    {renderFileContextMenu(root.path, 'directory', { allowDiff: false })}
                  </ContextMenu.Root>
                  <div className="truncate px-8 pb-1 text-[10px] text-zinc-600">{helperText}</div>
                  {isExpanded ? renderTree(root.path, 1) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }, [expandedDirectories, externalLibrariesError, externalLibrarySections, hasExternalLibraries, isDirectoryLoading, renderFileContextMenu, renderTree, selectedPath, t, toggleDirectory]);

  const renderedSearchResults = useMemo(() => searchResults.map((filePath) => {
    const entryStatus = getEntryStatus(filePath, 'file');
    const badge = getStatusTone(entryStatus);
    return (
      <ContextMenu.Root key={filePath}>
        <ContextMenu.Trigger asChild>
          <button
            type="button"
            onClick={() => {
              void activateFile(filePath, { preview: true });
            }}
            onDoubleClick={() => {
              void activateFile(filePath, { promotePreview: true });
            }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${selectedPath === filePath ? 'bg-[rgb(var(--primary))]/15 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/70'}`}
          >
            <FileIcon size={14} className="shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1 truncate">{getPathLeafLabel(filePath)}</span>
            <span className="max-w-[160px] truncate text-[10px] text-zinc-500">
              {getRelativePath(rootPath, filePath)}
            </span>
            {badge && (
              <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${badge.className}`}>
                {badge.badge}
              </span>
            )}
          </button>
        </ContextMenu.Trigger>
        {renderFileContextMenu(filePath, 'file')}
      </ContextMenu.Root>
    );
  }), [activateFile, getEntryStatus, renderFileContextMenu, rootPath, searchResults, selectedPath]);

  const contentSearchGroups = useMemo(() => {
    const groups = new Map<string, CodePaneContentMatch[]>();
    for (const match of contentSearchResults) {
      const matches = groups.get(match.filePath) ?? [];
      matches.push(match);
      groups.set(match.filePath, matches);
    }

    return Array.from(groups.entries()).map(([filePath, matches]) => ({
      filePath,
      matches,
    }));
  }, [contentSearchResults]);

  const usageGroups = useMemo(() => {
    const groups = new Map<string, CodePaneReference[]>();
    for (const reference of usageResults) {
      const references = groups.get(reference.filePath) ?? [];
      references.push(reference);
      groups.set(reference.filePath, references);
    }

    return Array.from(groups.entries()).map(([filePath, references]) => ({
      filePath,
      references,
    }));
  }, [usageResults]);

  const scmEntries = useMemo(() => (
    Object.values(gitStatusByPath).sort((left, right) => {
      const leftPath = getRelativePath(rootPath, left.path);
      const rightPath = getRelativePath(rootPath, right.path);
      return leftPath.localeCompare(rightPath, undefined, { sensitivity: 'base' });
    })
  ), [gitStatusByPath, rootPath]);

  const gitChangeSectionGroups = useMemo(
    () => buildGitChangeSectionGroups(scmEntries, rootPath),
    [rootPath, scmEntries],
  );

  const selectedGitChangeRelativePath = useMemo(
    () => selectedGitChangePath ? getRelativePath(rootPath, selectedGitChangePath) : null,
    [rootPath, selectedGitChangePath],
  );

  useEffect(() => {
    if (!selectedGitChangePath) {
      return;
    }

    if (gitStatusByPath[selectedGitChangePath]) {
      return;
    }

    setSelectedGitChangePath(null);
    void loadGitDiffHunks(null);
  }, [gitStatusByPath, loadGitDiffHunks, selectedGitChangePath]);

  const gitOperationLabel = useMemo(() => {
    switch (gitRepositorySummary?.operation) {
      case 'merge':
        return t('codePane.gitOperationMerge');
      case 'rebase':
        return t('codePane.gitOperationRebase');
      case 'cherry-pick':
        return t('codePane.gitOperationCherryPick');
      case 'revert':
        return t('codePane.gitOperationRevert');
      case 'bisect':
        return t('codePane.gitOperationBisect');
      default:
        return t('codePane.gitOperationIdle');
    }
  }, [gitRepositorySummary?.operation, t]);

  const gitSummaryBranchLabel = useMemo(() => {
    if (!gitRepositorySummary) {
      return null;
    }

    if (gitRepositorySummary.currentBranch) {
      return gitRepositorySummary.currentBranch;
    }

    if (gitRepositorySummary.detachedHead && gitRepositorySummary.headSha) {
      return `${t('codePane.gitDetachedHead')} ${gitRepositorySummary.headSha.slice(0, 7)}`;
    }

    return t('codePane.gitDetachedHead');
  }, [gitRepositorySummary, t]);

  const gitBranchCopyValue = useMemo(
    () => gitRepositorySummary?.currentBranch ?? gitRepositorySummary?.headSha ?? '',
    [gitRepositorySummary],
  );

  const gitStatusChip = useMemo(() => {
    if (!gitRepositorySummary) {
      return null;
    }

    if (gitRepositorySummary.hasConflicts) {
      return {
        className: 'bg-red-500/15 text-red-300',
        text: `${gitSummaryBranchLabel ?? t('codePane.gitDetachedHead')} · ${t('codePane.gitConflictsActive')}`,
      };
    }

    if (gitRepositorySummary.operation !== 'idle') {
      return {
        className: 'bg-amber-500/15 text-amber-300',
        text: `${gitSummaryBranchLabel ?? t('codePane.gitDetachedHead')} · ${gitOperationLabel}`,
      };
    }

    const aheadBehindText = gitRepositorySummary.aheadCount > 0 || gitRepositorySummary.behindCount > 0
      ? ` ↑${gitRepositorySummary.aheadCount} ↓${gitRepositorySummary.behindCount}`
      : '';

    return {
      className: 'bg-emerald-500/15 text-emerald-300',
      text: `${gitSummaryBranchLabel ?? t('codePane.gitDetachedHead')}${aheadBehindText}`,
    };
  }, [gitOperationLabel, gitRepositorySummary, gitSummaryBranchLabel, t]);
  const activeBlameEntry = useMemo(() => (
    blameLines.find((entry) => entry.lineNumber === activeCursorLineNumber)
    ?? blameLines[0]
    ?? null
  ), [activeCursorLineNumber, blameLines]);

  const problemGroups = useMemo(() => {
    const groups = new Map<string, Array<MonacoMarker & { filePath: string }>>();
    for (const problem of problems) {
      const entries = groups.get(problem.filePath) ?? [];
      entries.push(problem);
      groups.set(problem.filePath, entries);
    }

    return Array.from(groups.entries()).map(([filePath, entries]) => ({
      filePath,
      entries,
    }));
  }, [problems]);

  const problemSummary = useMemo(() => {
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    for (const problem of problems) {
      if (problem.severity >= 8) {
        errorCount += 1;
      } else if (problem.severity >= 4) {
        warningCount += 1;
      } else {
        infoCount += 1;
      }
    }

    return {
      errorCount,
      warningCount,
      infoCount,
    };
  }, [problems]);

  const sortedProblemLocations = useMemo(() => (
    [...problems].sort((left, right) => (
      left.filePath.localeCompare(right.filePath)
      || left.startLineNumber - right.startLineNumber
      || left.startColumn - right.startColumn
    ))
  ), [problems]);

  const navigateProblem = useCallback(async (direction: 1 | -1) => {
    if (sortedProblemLocations.length === 0) {
      return;
    }

    const currentLocation = getCurrentNavigationLocation();
    let nextProblem = sortedProblemLocations[0];

    if (currentLocation) {
      if (direction > 0) {
        nextProblem = sortedProblemLocations.find((problem) => (
          problem.filePath > currentLocation.filePath
          || (
            problem.filePath === currentLocation.filePath
            && (
              problem.startLineNumber > currentLocation.lineNumber
              || (
                problem.startLineNumber === currentLocation.lineNumber
                && problem.startColumn > currentLocation.column
              )
            )
          )
        )) ?? sortedProblemLocations[0];
      } else {
        nextProblem = [...sortedProblemLocations].reverse().find((problem) => (
          problem.filePath < currentLocation.filePath
          || (
            problem.filePath === currentLocation.filePath
            && (
              problem.startLineNumber < currentLocation.lineNumber
              || (
                problem.startLineNumber === currentLocation.lineNumber
                && problem.startColumn < currentLocation.column
              )
            )
          )
        )) ?? sortedProblemLocations[sortedProblemLocations.length - 1];
      }
    }

    handleSidebarModeSelect('problems');
    await openEditorLocation({
      filePath: nextProblem.filePath,
      lineNumber: nextProblem.startLineNumber,
      column: nextProblem.startColumn,
    }, {
      preserveTabs: true,
      recordHistory: true,
      recordRecent: true,
      clearForward: true,
    });
  }, [getCurrentNavigationLocation, handleSidebarModeSelect, openEditorLocation, sortedProblemLocations]);

  const openSearchEverywhere = useCallback((mode: SearchEverywhereMode) => {
    setSearchEverywhereMode(mode);
    setSearchEverywhereQuery('');
    setSearchEverywhereError(null);
    setSearchEverywhereSelectedIndex(0);
    setIsSearchEverywhereOpen(true);
  }, []);

  const closeSearchEverywhere = useCallback(() => {
    setIsSearchEverywhereOpen(false);
    setSearchEverywhereQuery('');
    setSearchEverywhereError(null);
    setSearchEverywhereSelectedIndex(0);
  }, []);

  const searchEverywhereCommandItems = useMemo<SearchEverywhereItem[]>(() => ([
    {
      id: 'command-search-everywhere',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.searchEverywhereOpen'),
      meta: 'Ctrl/Cmd+P',
      execute: () => {
        openSearchEverywhere('all');
      },
    },
    {
      id: 'command-open-actions',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.codeActions'),
      meta: 'Alt+Enter',
      execute: async () => {
        await openCodeActionMenuRef.current();
      },
    },
    {
      id: 'command-go-to-implementation',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.goToImplementation'),
      meta: 'Ctrl/Cmd+Alt+B',
      execute: async () => {
        await goToImplementationAtCursorRef.current();
      },
    },
    {
      id: 'command-quick-documentation',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.quickDocumentation'),
      meta: 'F1',
      execute: async () => {
        setIsQuickDocumentationOpen(true);
        await loadQuickDocumentation();
      },
    },
    {
      id: 'command-find-usages',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.findUsages'),
      meta: 'Shift+F12',
      execute: async () => {
        await findUsagesAtCursor();
      },
    },
    {
      id: 'command-rename-symbol',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.renameSymbol'),
      meta: 'F2',
      execute: async () => {
        await renameSymbolAtCursor();
      },
    },
    {
      id: 'command-format-document',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.formatDocument'),
      meta: 'Shift+Alt+F',
      execute: async () => {
        await formatActiveDocument();
      },
    },
    {
      id: 'command-back',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.navigateBack'),
      meta: 'Alt+Left',
      execute: async () => {
        await navigateBackRef.current();
      },
    },
    {
      id: 'command-forward',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.navigateForward'),
      meta: 'Alt+Right',
      execute: async () => {
        await navigateForwardRef.current();
      },
    },
    {
      id: 'command-next-problem',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.nextProblem'),
      meta: 'F8',
      execute: async () => {
        await navigateProblem(1);
      },
    },
    {
      id: 'command-previous-problem',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.previousProblem'),
      meta: 'Shift+F8',
      execute: async () => {
        await navigateProblem(-1);
      },
    },
    {
      id: 'command-toggle-sidebar',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.toggleSidebar'),
      meta: 'Ctrl/Cmd+B',
      execute: () => {
        toggleSidebarVisibility();
      },
    },
    {
      id: 'command-refresh-project',
      section: t('codePane.searchEverywhereCommandsSection'),
      title: t('codePane.refresh'),
      execute: async () => {
        setIsRefreshing(true);
        try {
          await refreshLoadedDirectories();
        } finally {
          setIsRefreshing(false);
        }
      },
    },
  ]), [
    findUsagesAtCursor,
    formatActiveDocument,
    loadQuickDocumentation,
    navigateProblem,
    openSearchEverywhere,
    refreshLoadedDirectories,
    renameSymbolAtCursor,
    t,
    toggleSidebarVisibility,
  ]);

  useEffect(() => {
    if (!isSearchEverywhereOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      searchEverywhereInputRef.current?.focus();
      searchEverywhereInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isSearchEverywhereOpen]);

  useEffect(() => {
    if (!isSearchEverywhereOpen) {
      return;
    }

    const trimmedQuery = deferredSearchEverywhereQuery.trim();
    if (!trimmedQuery || searchEverywhereMode === 'commands' || searchEverywhereMode === 'recent') {
      setSearchEverywhereFileResults([]);
      setSearchEverywhereSymbolResults([]);
      setSearchEverywhereError(null);
      setIsSearchEverywhereLoading(false);
      return;
    }

    let cancelled = false;
    setIsSearchEverywhereLoading(true);
    setSearchEverywhereError(null);

    const timer = window.setTimeout(async () => {
      const [fileResponse, symbolResponse] = await Promise.all([
        window.electronAPI.codePaneSearchFiles({
          rootPath,
          query: trimmedQuery,
          limit: 40,
        }),
        window.electronAPI.codePaneGetWorkspaceSymbols({
          rootPath,
          query: trimmedQuery,
          limit: 40,
        }),
      ]);

      if (cancelled) {
        return;
      }

      setSearchEverywhereFileResults(fileResponse.success ? (fileResponse.data ?? []) : []);
      setSearchEverywhereSymbolResults(symbolResponse.success ? (symbolResponse.data ?? []) : []);
      setSearchEverywhereError(
        fileResponse.success && symbolResponse.success
          ? null
          : fileResponse.error || symbolResponse.error || t('common.retry'),
      );
      setIsSearchEverywhereLoading(false);
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredSearchEverywhereQuery, isSearchEverywhereOpen, rootPath, searchEverywhereMode, t]);

  const searchEverywhereItems = useMemo<SearchEverywhereItem[]>(() => {
    const trimmedQuery = searchEverywhereQuery.trim().toLowerCase();

    if (searchEverywhereMode === 'commands') {
      return searchEverywhereCommandItems.filter((item) => (
        trimmedQuery.length === 0
        || item.title.toLowerCase().includes(trimmedQuery)
        || item.meta?.toLowerCase().includes(trimmedQuery)
      ));
    }

    if (searchEverywhereMode === 'recent') {
      const recentLocationItems = recentLocations
        .filter((location) => (
          trimmedQuery.length === 0
          || getPathLeafLabel(location.displayPath ?? location.filePath).toLowerCase().includes(trimmedQuery)
          || location.filePath.toLowerCase().includes(trimmedQuery)
        ))
        .map((location, index) => ({
          id: `recent-location-${location.filePath}-${location.lineNumber}-${location.column}-${index}`,
          section: t('codePane.recentLocations'),
          title: getPathLeafLabel(location.displayPath ?? location.filePath) || location.filePath,
          subtitle: location.displayPath ?? getRelativePath(rootPath, location.filePath),
          meta: `${location.lineNumber}:${location.column}`,
          execute: async () => {
            await openEditorLocation(location, {
              preserveTabs: true,
              recordHistory: true,
              recordRecent: true,
              clearForward: true,
            });
          },
        }));
      const recentFileItems = recentFiles
        .filter((filePath) => (
          trimmedQuery.length === 0
          || getPathLeafLabel(getDisplayPath(filePath)).toLowerCase().includes(trimmedQuery)
          || getDisplayPath(filePath).toLowerCase().includes(trimmedQuery)
        ))
        .map((filePath) => ({
          id: `recent-file-${filePath}`,
          section: t('codePane.recentFiles'),
          title: getFileLabel(filePath),
          subtitle: getRelativePath(rootPath, getDisplayPath(filePath)),
          execute: async () => {
            await openEditorLocation({
              filePath,
              lineNumber: 1,
              column: 1,
            }, {
              preserveTabs: true,
              recordHistory: true,
              recordRecent: true,
              clearForward: true,
            });
          },
        }));
      return [...recentLocationItems, ...recentFileItems];
    }

    const commandItems = searchEverywhereCommandItems.filter((item) => (
      trimmedQuery.length === 0
      || item.title.toLowerCase().includes(trimmedQuery)
      || item.meta?.toLowerCase().includes(trimmedQuery)
    ));

    const recentItems = trimmedQuery.length === 0
      ? [
          ...recentLocations.map((location, index) => ({
            id: `search-recent-location-${location.filePath}-${location.lineNumber}-${location.column}-${index}`,
            section: t('codePane.recentLocations'),
            title: getPathLeafLabel(location.displayPath ?? location.filePath) || location.filePath,
            subtitle: location.displayPath ?? getRelativePath(rootPath, location.filePath),
            meta: `${location.lineNumber}:${location.column}`,
            execute: async () => {
              await openEditorLocation(location, {
                preserveTabs: true,
                recordHistory: true,
                recordRecent: true,
                clearForward: true,
              });
            },
          })),
          ...recentFiles.map((filePath) => ({
            id: `search-recent-file-${filePath}`,
            section: t('codePane.recentFiles'),
            title: getFileLabel(filePath),
            subtitle: getRelativePath(rootPath, getDisplayPath(filePath)),
            execute: async () => {
              await openEditorLocation({
                filePath,
                lineNumber: 1,
                column: 1,
              }, {
                preserveTabs: true,
                recordHistory: true,
                recordRecent: true,
                clearForward: true,
              });
            },
          })),
        ]
      : [];

    const fileItems = searchEverywhereFileResults.map((filePath) => ({
      id: `search-file-${filePath}`,
      section: t('codePane.searchEverywhereFilesSection'),
      title: getPathLeafLabel(filePath) || filePath,
      subtitle: getRelativePath(rootPath, filePath),
      execute: async () => {
        await openEditorLocation({
          filePath,
          lineNumber: 1,
          column: 1,
        }, {
          recordHistory: true,
          recordRecent: true,
          clearForward: true,
        });
      },
    }));

    const symbolItems = searchEverywhereSymbolResults.map((symbol) => ({
      id: `search-symbol-${symbol.filePath}-${symbol.name}-${symbol.range.startLineNumber}-${symbol.range.startColumn}`,
      section: t('codePane.searchEverywhereSymbolsSection'),
      title: symbol.name,
      subtitle: getRelativePath(rootPath, symbol.filePath),
      meta: `${symbol.range.startLineNumber}:${symbol.range.startColumn}`,
      execute: async () => {
        await openEditorLocation({
          filePath: symbol.filePath,
          lineNumber: symbol.range.startLineNumber,
          column: symbol.range.startColumn,
        }, {
          preserveTabs: true,
          recordHistory: true,
          recordRecent: true,
          clearForward: true,
        });
      },
    }));

    return [
      ...recentItems,
      ...commandItems,
      ...fileItems,
      ...symbolItems,
    ];
  }, [
    activateFile,
    getDisplayPath,
    getFileLabel,
    openEditorLocation,
    recentFiles,
    recentLocations,
    rootPath,
    searchEverywhereCommandItems,
    searchEverywhereFileResults,
    searchEverywhereMode,
    searchEverywhereQuery,
    searchEverywhereSymbolResults,
    t,
  ]);

  useEffect(() => {
    if (!isSearchEverywhereOpen) {
      return;
    }

    setSearchEverywhereSelectedIndex((currentIndex) => (
      searchEverywhereItems.length === 0
        ? 0
        : Math.min(currentIndex, searchEverywhereItems.length - 1)
    ));
  }, [isSearchEverywhereOpen, searchEverywhereItems]);

  const canNavigateBack = navigationBackStackRef.current.length > 0;
  const canNavigateForward = navigationForwardStackRef.current.length > 0;
  const selectedSearchEverywhereItem = searchEverywhereItems[searchEverywhereSelectedIndex] ?? null;
  const selectedCodeAction = codeActionItems[selectedCodeActionIndex] ?? null;
  const visibleDebugSessions = debugSessions;
  const selectedDebugSession = visibleDebugSessions.find((session) => session.id === selectedDebugSessionId) ?? visibleDebugSessions[0] ?? null;
  const selectedDebugSessionOutput = selectedDebugSession ? (debugSessionOutputs[selectedDebugSession.id] ?? '') : '';
  const debugTargets = useMemo(() => (
    runTargets.filter((target) => target.canDebug)
  ), [runTargets]);
  const visibleRunSessions = useMemo(() => {
    if (bottomPanelMode === 'tests') {
      return runSessions.filter((session) => session.kind === 'test');
    }

    if (bottomPanelMode === 'project') {
      return runSessions.filter((session) => session.kind === 'task');
    }

    if (bottomPanelMode === 'run') {
      return runSessions.filter((session) => session.kind !== 'test' && session.kind !== 'task');
    }

    return runSessions;
  }, [bottomPanelMode, runSessions]);
  const selectedRunSession = visibleRunSessions.find((session) => session.id === selectedRunSessionId) ?? visibleRunSessions[0] ?? null;
  const selectedRunSessionOutput = selectedRunSession ? (runSessionOutputs[selectedRunSession.id] ?? '') : '';
  const hasFailedTestSessions = runSessions.some((session) => session.kind === 'test' && session.state === 'failed');

  useEffect(() => {
    debugCurrentFrameRef.current = selectedDebugSession?.currentFrame ?? null;
  }, [selectedDebugSession?.currentFrame]);

  useEffect(() => {
    setActiveCursorLineNumber(1);
    setActiveCursorColumn(1);
  }, [activeFilePath]);

  useEffect(() => {
    if (viewMode !== 'diff' && activeEditorTarget === 'diff') {
      setActiveEditorTarget('editor');
      focusedEditorTargetRef.current = 'editor';
      return;
    }

    if ((!isEditorSplitVisible || !secondaryFilePath) && activeEditorTarget === 'secondary') {
      setActiveEditorTarget('editor');
      focusedEditorTargetRef.current = 'editor';
    }
  }, [activeEditorTarget, isEditorSplitVisible, secondaryFilePath, viewMode]);

  useEffect(() => {
    if (!isBlameVisible) {
      setBlameLines([]);
      return;
    }

    void loadBlameForActiveFile();
  }, [activeFilePath, isBlameVisible, loadBlameForActiveFile]);

  useEffect(() => {
    if (!breadcrumbFilePath) {
      setActiveDocumentSymbols([]);
      setIsActiveDocumentSymbolsLoading(false);
      return;
    }

    void loadActiveDocumentSymbols(breadcrumbFilePath, breadcrumbLanguage);
  }, [breadcrumbFilePath, breadcrumbLanguage, loadActiveDocumentSymbols]);

  useEffect(() => {
    if (!isQuickDocumentationOpen) {
      return undefined;
    }

    const timer = setTimeout(() => {
      void loadQuickDocumentation();
    }, 120);

    return () => {
      clearTimeout(timer);
    };
  }, [
    activeCursorColumn,
    activeCursorLineNumber,
    activeEditorTarget,
    breadcrumbFilePath,
    isQuickDocumentationOpen,
    loadQuickDocumentation,
  ]);

  useEffect(() => {
    editorRef.current?.updateOptions?.(editorInlayHintOptions);
    secondaryEditorRef.current?.updateOptions?.(editorInlayHintOptions);
    diffEditorRef.current?.getModifiedEditor().updateOptions?.(editorInlayHintOptions);
  }, [editorInlayHintOptions]);

  useEffect(() => {
    const activeEditor = viewMode === 'diff'
      ? diffEditorRef.current?.getModifiedEditor() ?? null
      : editorRef.current;
    const currentFilePath = activeFilePathRef.current;
    if (!activeEditor || !currentFilePath) {
      clearDebugDecorations(activeEditor ?? undefined);
      return;
    }

    applyDebugDecorations(activeEditor, currentFilePath);
  }, [activeFilePath, applyDebugDecorations, breakpoints, clearDebugDecorations, selectedDebugSession?.currentFrame, viewMode]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target?.isContentEditable === true;
      const hasPrimaryModifier = isMac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;

      if (event.key === 'Escape') {
        if (isSearchEverywhereOpen) {
          event.preventDefault();
          closeSearchEverywhere();
          return;
        }

        if (isCodeActionMenuOpen) {
          event.preventDefault();
          setIsCodeActionMenuOpen(false);
          setCodeActionItems([]);
          setCodeActionMenuError(null);
          return;
        }
      }

      if (hasPrimaryModifier && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        openSearchEverywhere('all');
        return;
      }

      if (hasPrimaryModifier && !event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        openSearchEverywhere('recent');
        return;
      }

      if (hasPrimaryModifier && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        openSearchEverywhere('commands');
        return;
      }

      if (isEditableTarget) {
        return;
      }

      if (event.altKey && event.key === 'Enter') {
        event.preventDefault();
        void openCodeActionMenuRef.current();
        return;
      }

      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        void navigateBackRef.current();
        return;
      }

      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        void navigateForwardRef.current();
        return;
      }

      if (hasPrimaryModifier && event.altKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        void goToImplementationAtCursorRef.current();
        return;
      }

      if (event.key === 'F1') {
        event.preventDefault();
        toggleQuickDocumentation();
        return;
      }

      if (event.key === 'F8') {
        event.preventDefault();
        void navigateProblem(event.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    closeSearchEverywhere,
    isActive,
    isCodeActionMenuOpen,
    isMac,
    isSearchEverywhereOpen,
    navigateProblem,
    openSearchEverywhere,
    toggleQuickDocumentation,
  ]);

  useEffect(() => {
    if (!isCodeActionMenuOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedCodeActionIndex((currentIndex) => (
          codeActionItems.length === 0
            ? 0
            : Math.min(currentIndex + 1, codeActionItems.length - 1)
        ));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedCodeActionIndex((currentIndex) => (
          codeActionItems.length === 0
            ? 0
            : Math.max(currentIndex - 1, 0)
        ));
        return;
      }

      if (event.key === 'Enter' && selectedCodeAction) {
        event.preventDefault();
        void runSelectedCodeActionRef.current(selectedCodeAction);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [codeActionItems.length, isCodeActionMenuOpen, selectedCodeAction]);

  useEffect(() => {
    const handleRunSessionChanged = (_event: unknown, payload: CodePaneRunSessionChangedPayload) => {
      if (normalizePath(payload.rootPath) !== normalizePath(rootPath)) {
        return;
      }

      setRunSessions((currentSessions) => {
        const nextSessions = [
          payload.session,
          ...currentSessions.filter((session) => session.id !== payload.session.id),
        ];
        return nextSessions.slice(0, 20);
      });
      setSelectedRunSessionId((currentSelectedSessionId) => currentSelectedSessionId ?? payload.session.id);
    };

    const handleRunSessionOutput = (_event: unknown, payload: CodePaneRunSessionOutputPayload) => {
      if (normalizePath(payload.rootPath) !== normalizePath(rootPath)) {
        return;
      }

      setRunSessionOutputs((currentOutputs) => ({
        ...currentOutputs,
        [payload.sessionId]: `${currentOutputs[payload.sessionId] ?? ''}${payload.chunk}`,
      }));
    };

    window.electronAPI.onCodePaneRunSessionChanged(handleRunSessionChanged);
    window.electronAPI.onCodePaneRunSessionOutput(handleRunSessionOutput);

    return () => {
      window.electronAPI.offCodePaneRunSessionChanged(handleRunSessionChanged);
      window.electronAPI.offCodePaneRunSessionOutput(handleRunSessionOutput);
    };
  }, [rootPath]);

  useEffect(() => {
    const handleDebugSessionChanged = (_event: unknown, payload: CodePaneDebugSessionChangedPayload) => {
      if (normalizePath(payload.rootPath) !== normalizePath(rootPath)) {
        return;
      }

      setDebugSessions((currentSessions) => {
        const nextSessions = [
          payload.session,
          ...currentSessions.filter((session) => session.id !== payload.session.id),
        ];
        return nextSessions.slice(0, 20);
      });
      setSelectedDebugSessionId((currentSelectedSessionId) => currentSelectedSessionId ?? payload.session.id);
      if (payload.session.state === 'paused' || payload.session.state === 'stopped' || payload.session.state === 'error') {
        void loadDebugSessionDetailsRef.current(payload.session.id);
      }
    };

    const handleDebugSessionOutput = (_event: unknown, payload: CodePaneDebugSessionOutputPayload) => {
      if (normalizePath(payload.rootPath) !== normalizePath(rootPath)) {
        return;
      }

      setDebugSessionOutputs((currentOutputs) => ({
        ...currentOutputs,
        [payload.sessionId]: `${currentOutputs[payload.sessionId] ?? ''}${payload.chunk}`,
      }));
    };

    window.electronAPI.onCodePaneDebugSessionChanged(handleDebugSessionChanged);
    window.electronAPI.onCodePaneDebugSessionOutput(handleDebugSessionOutput);

    return () => {
      window.electronAPI.offCodePaneDebugSessionChanged(handleDebugSessionChanged);
      window.electronAPI.offCodePaneDebugSessionOutput(handleDebugSessionOutput);
    };
  }, [rootPath]);

  const openFileLocation = useCallback(async (location: FileNavigationLocation) => {
    await openEditorLocation(location, {
      recordHistory: true,
      recordRecent: true,
      clearForward: true,
    });
  }, [openEditorLocation]);

  useEffect(() => {
    openFileLocationRef.current = openFileLocation;
  }, [openFileLocation]);

  const openContentSearchMatch = useCallback(async (match: CodePaneContentMatch) => {
    await openFileLocation({
      filePath: match.filePath,
      lineNumber: match.lineNumber,
      column: match.column,
    });
  }, [openFileLocation]);

  const navigateHistory = useCallback(async (direction: 'back' | 'forward') => {
    const sourceStackRef = direction === 'back'
      ? navigationBackStackRef
      : navigationForwardStackRef;
    const targetStackRef = direction === 'back'
      ? navigationForwardStackRef
      : navigationBackStackRef;
    const nextLocation = sourceStackRef.current[sourceStackRef.current.length - 1];

    if (!nextLocation) {
      return;
    }

    sourceStackRef.current = sourceStackRef.current.slice(0, -1);

    const currentLocation = getCurrentNavigationLocation();
    if (currentLocation && !isSameNavigationLocation(currentLocation, nextLocation)) {
      targetStackRef.current = [
        ...targetStackRef.current,
        currentLocation,
      ].slice(-CODE_PANE_MAX_NAVIGATION_HISTORY);
    }

    setNavigationStateVersion((currentVersion) => currentVersion + 1);
    await openEditorLocation({
      filePath: nextLocation.filePath,
      lineNumber: nextLocation.lineNumber,
      column: nextLocation.column,
      displayPath: nextLocation.displayPath,
    }, {
      preserveTabs: true,
      recordHistory: false,
      recordRecent: true,
      clearForward: false,
    });
  }, [getCurrentNavigationLocation, openEditorLocation]);

  const navigateBack = useCallback(async () => {
    await navigateHistory('back');
  }, [navigateHistory]);

  const navigateForward = useCallback(async () => {
    await navigateHistory('forward');
  }, [navigateHistory]);

  useEffect(() => {
    navigateBackRef.current = navigateBack;
  }, [navigateBack]);

  useEffect(() => {
    navigateForwardRef.current = navigateForward;
  }, [navigateForward]);

  const goToImplementationAtCursor = useCallback(async () => {
    const context = getActiveEditorContext();
    if (!context) {
      return;
    }

    const response = await window.electronAPI.codePaneGetImplementations({
      rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber: context.position.lineNumber,
        column: context.position.column,
      },
    });

    if (!response.success) {
      setBanner({
        tone: 'warning',
        message: response.error || t('common.retry'),
        filePath: context.filePath,
      });
      return;
    }

    const implementation = response.data?.[0];
    if (!implementation) {
      setBanner({
        tone: 'info',
        message: t('codePane.goToImplementationEmpty'),
        filePath: context.filePath,
      });
      return;
    }

    await openEditorLocation({
      filePath: implementation.filePath,
      lineNumber: implementation.range.startLineNumber,
      column: implementation.range.startColumn,
      content: implementation.content,
      language: implementation.language,
      readOnly: implementation.readOnly,
      displayPath: implementation.displayPath,
      documentUri: implementation.uri,
    }, {
      preserveTabs: true,
      recordHistory: true,
      recordRecent: true,
      clearForward: true,
    });
  }, [getActiveEditorContext, openEditorLocation, rootPath, t]);

  useEffect(() => {
    goToImplementationAtCursorRef.current = goToImplementationAtCursor;
  }, [goToImplementationAtCursor]);

  const openCodeActionMenu = useCallback(async () => {
    const context = getActiveEditorContext();
    if (!context) {
      return;
    }

    const wordRange = context.model.getWordAtPosition(context.position);
    const requestRange = wordRange
      ? {
          startLineNumber: context.position.lineNumber,
          startColumn: wordRange.startColumn,
          endLineNumber: context.position.lineNumber,
          endColumn: wordRange.endColumn,
        }
      : {
          startLineNumber: context.position.lineNumber,
          startColumn: context.position.column,
          endLineNumber: context.position.lineNumber,
          endColumn: context.position.column + 1,
        };

    setIsCodeActionMenuOpen(true);
    setCodeActionItems([]);
    setCodeActionMenuError(null);
    setIsCodeActionMenuLoading(true);
    setSelectedCodeActionIndex(0);

    const response = await window.electronAPI.codePaneGetCodeActions({
      rootPath,
      filePath: context.filePath,
      language: context.language,
      range: requestRange,
    });

    startTransition(() => {
      setCodeActionItems(response.success ? (response.data ?? []) : []);
    });
    setCodeActionMenuError(response.success ? null : (response.error || t('common.retry')));
    setIsCodeActionMenuLoading(false);
  }, [getActiveEditorContext, rootPath, t]);

  useEffect(() => {
    openCodeActionMenuRef.current = openCodeActionMenu;
  }, [openCodeActionMenu]);

  const runSelectedCodeAction = useCallback(async (action: CodePaneCodeAction | undefined) => {
    const context = getActiveEditorContext();
    if (!context || !action || action.disabledReason) {
      return;
    }

    if (isRefactorCodeAction(action)) {
      await prepareRefactorPreview({
        kind: 'code-action',
        rootPath,
        filePath: context.filePath,
        language: context.language,
        actionId: action.id,
        title: action.title,
      });
      setIsCodeActionMenuOpen(false);
      setCodeActionItems([]);
      setCodeActionMenuError(null);
      return;
    }

    const response = await window.electronAPI.codePaneRunCodeAction({
      rootPath,
      filePath: context.filePath,
      language: context.language,
      actionId: action.id,
    });

    if (!response.success) {
      setCodeActionMenuError(response.error || t('common.retry'));
      return;
    }

    await applyLanguageTextEdits(response.data ?? []);
    setIsCodeActionMenuOpen(false);
    setCodeActionItems([]);
    setCodeActionMenuError(null);
  }, [applyLanguageTextEdits, getActiveEditorContext, prepareRefactorPreview, rootPath, t]);

  useEffect(() => {
    runSelectedCodeActionRef.current = runSelectedCodeAction;
  }, [runSelectedCodeAction]);

  const loadRunTargets = useCallback(async () => {
    setIsRunTargetsLoading(true);
    setRunTargetsError(null);

    const response = await trackRequest(
      `run-targets:${rootPath}`,
      'Run targets',
      activeFilePathRef.current ? getRelativePath(rootPath, activeFilePathRef.current) : undefined,
      async () => await window.electronAPI.codePaneListRunTargets({
        rootPath,
        activeFilePath: activeFilePathRef.current,
      }),
    );

    setRunTargets(response.success ? (response.data ?? []) : []);
    setRunTargetsError(response.success ? null : (response.error || t('common.retry')));
    setIsRunTargetsLoading(false);
  }, [rootPath, t, trackRequest]);

  const loadDebugSessionDetails = useCallback(async (sessionId: string | null) => {
    if (!sessionId) {
      setDebugSessionDetails(null);
      return;
    }

    setIsDebugDetailsLoading(true);
    const response = await trackRequest(
      `debug-details:${sessionId}`,
      'Debug session details',
      sessionId,
      async () => await window.electronAPI.codePaneGetDebugSessionDetails({
        sessionId,
      }),
    );
    setDebugSessionDetails(response.success ? (response.data ?? null) : null);
    setIsDebugDetailsLoading(false);
  }, [trackRequest]);

  useEffect(() => {
    loadDebugSessionDetailsRef.current = loadDebugSessionDetails;
  }, [loadDebugSessionDetails]);

  const loadTests = useCallback(async () => {
    setIsTestsLoading(true);
    setTestsError(null);

    const response = await trackRequest(
      `tests:${rootPath}`,
      'Test discovery',
      activeFilePathRef.current ? getRelativePath(rootPath, activeFilePathRef.current) : undefined,
      async () => await window.electronAPI.codePaneListTests({
        rootPath,
        activeFilePath: activeFilePathRef.current,
      }),
    );

    setTestItems(response.success ? (response.data ?? []) : []);
    setTestsError(response.success ? null : (response.error || t('common.retry')));
    setIsTestsLoading(false);
  }, [rootPath, t, trackRequest]);

  const loadProjectContributions = useCallback(async (refresh = false) => {
    setIsProjectLoading(true);
    setProjectError(null);

    const response = await trackRequest(
      `project-model:${rootPath}`,
      refresh ? 'Refresh project model' : 'Project contribution',
      rootPath,
      async () => refresh
        ? await window.electronAPI.codePaneRefreshProjectModel({ rootPath })
        : await window.electronAPI.codePaneGetProjectContribution({ rootPath }),
    );

    setProjectContributions(response.success ? (response.data ?? []) : []);
    setProjectError(response.success ? null : (response.error || t('common.retry')));
    setIsProjectLoading(false);
  }, [rootPath, t, trackRequest]);

  const runTargetById = useCallback(async (targetId: string) => {
    const response = await window.electronAPI.codePaneRunTarget({
      rootPath,
      targetId,
    });

    if (!response.success || !response.data) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    setBottomPanelMode('run');
    setSelectedRunSessionId(response.data.id);
  }, [rootPath, t]);

  const debugTargetById = useCallback(async (targetId: string) => {
    await loadExceptionBreakpoints();
    const response = await window.electronAPI.codePaneDebugStart({
      rootPath,
      targetId,
    });

    if (!response.success || !response.data) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    setBottomPanelMode('debug');
    setSelectedDebugSessionId(response.data.id);
  }, [loadExceptionBreakpoints, rootPath, t]);

  const runTestTarget = useCallback(async (targetId: string) => {
    const response = await window.electronAPI.codePaneRunTests({
      rootPath,
      targetId,
    });

    if (!response.success || !response.data) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    setBottomPanelMode('tests');
    setSelectedRunSessionId(response.data.id);
  }, [rootPath, t]);

  const rerunFailedTests = useCallback(async () => {
    const response = await window.electronAPI.codePaneRerunFailedTests({
      rootPath,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    const latestSession = response.data?.at(-1) ?? null;
    if (latestSession) {
      setBottomPanelMode('tests');
      setSelectedRunSessionId(latestSession.id);
    }
  }, [rootPath, t]);

  const stopRunSession = useCallback(async (sessionId: string) => {
    const response = await window.electronAPI.codePaneStopRunTarget({
      sessionId,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
    }
  }, [t]);

  const runProjectCommandById = useCallback(async (commandId: string) => {
    const response = await window.electronAPI.codePaneRunProjectCommand({
      rootPath,
      commandId,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    setBottomPanelMode('project');
    if (response.data) {
      setSelectedRunSessionId(response.data.id);
      return;
    }

    void loadProjectContributions(true);
  }, [loadProjectContributions, rootPath, t]);

  const stopDebugSession = useCallback(async (sessionId: string) => {
    const response = await window.electronAPI.codePaneDebugStop({
      sessionId,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
    }
  }, [t]);

  const pauseDebugSession = useCallback(async (sessionId: string) => {
    const response = await window.electronAPI.codePaneDebugPause({
      sessionId,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
    }
  }, [t]);

  const continueDebugSession = useCallback(async (sessionId: string) => {
    const response = await window.electronAPI.codePaneDebugContinue({
      sessionId,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
    }
  }, [t]);

  const stepDebugSession = useCallback(async (
    sessionId: string,
    step: 'over' | 'into' | 'out',
  ) => {
    const action = step === 'over'
      ? window.electronAPI.codePaneDebugStepOver
      : step === 'into'
        ? window.electronAPI.codePaneDebugStepInto
        : window.electronAPI.codePaneDebugStepOut;
    const response = await action({
      sessionId,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
    }
  }, [t]);

  const evaluateDebugExpression = useCallback(async (expression: string) => {
    if (!selectedDebugSession) {
      return;
    }

    const response = await window.electronAPI.codePaneDebugEvaluate({
      sessionId: selectedDebugSession.id,
      expression,
    });

    if (!response.success || !response.data) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    setDebugEvaluations((currentEvaluations) => [
      {
        id: `${selectedDebugSession.id}:${Date.now()}`,
        expression,
        value: response.data?.value ?? '',
      },
      ...currentEvaluations,
    ].slice(0, 20));
  }, [selectedDebugSession, t]);

  const refreshDebugWatches = useCallback(async (
    sessionOverride?: CodePaneDebugSession | null,
    expressionsOverride?: string[],
  ) => {
    const targetSession = sessionOverride ?? selectedDebugSession;
    const expressions = expressionsOverride ?? watchExpressions;
    if (expressions.length === 0) {
      setWatchEntries([]);
      return;
    }

    if (!targetSession || targetSession.state !== 'paused') {
      setWatchEntries((currentEntries) => expressions.map((expression) => (
        currentEntries.find((entry) => entry.expression === expression) ?? {
          id: expression,
          expression,
        }
      )));
      return;
    }

    const nextEntries = await Promise.all(expressions.map(async (expression) => {
      const response = await window.electronAPI.codePaneDebugEvaluate({
        sessionId: targetSession.id,
        expression,
      });
      if (!response.success) {
        return {
          id: expression,
          expression,
          error: response.error || t('common.retry'),
        };
      }

      return {
        id: expression,
        expression,
        value: response.data?.value ?? '',
      };
    }));
    setWatchEntries(nextEntries);
  }, [selectedDebugSession, t, watchExpressions]);

  const addDebugWatchExpression = useCallback(async (expression: string) => {
    const normalizedExpression = expression.trim();
    if (!normalizedExpression) {
      return;
    }

    const nextExpressions = normalizeWatchExpressions([...watchExpressions, normalizedExpression]);
    persistWatchExpressions(nextExpressions);
    await refreshDebugWatches(selectedDebugSession, nextExpressions);
  }, [persistWatchExpressions, refreshDebugWatches, selectedDebugSession, watchExpressions]);

  const removeDebugWatchExpression = useCallback((expression: string) => {
    const nextExpressions = watchExpressions.filter((watchExpression) => watchExpression !== expression);
    persistWatchExpressions(nextExpressions);
    setWatchEntries((currentEntries) => currentEntries.filter((entry) => entry.expression !== expression));
  }, [persistWatchExpressions, watchExpressions]);

  const openTestItem = useCallback(async (item: CodePaneTestItem) => {
    if (!item.filePath) {
      return;
    }

    await openEditorLocation({
      filePath: item.filePath,
      lineNumber: 1,
      column: 1,
    }, {
      preserveTabs: true,
      recordHistory: true,
      recordRecent: true,
      clearForward: true,
    });
  }, [openEditorLocation]);

  const openDebugFrame = useCallback(async (frameId: string) => {
    const frame = debugSessionDetails?.stackFrames.find((candidate) => candidate.id === frameId);
    if (!frame?.filePath || !frame.lineNumber) {
      return;
    }

    await openEditorLocation({
      filePath: frame.filePath,
      lineNumber: frame.lineNumber,
      column: frame.column ?? 1,
    }, {
      preserveTabs: true,
      recordHistory: true,
      recordRecent: true,
      clearForward: true,
    });
  }, [debugSessionDetails?.stackFrames, openEditorLocation]);

  const updateBreakpoint = useCallback(async (breakpoint: CodePaneBreakpoint) => {
    const normalizedBreakpoint = normalizeBreakpoint(breakpoint);
    const response = await window.electronAPI.codePaneSetBreakpoint({
      rootPath,
      breakpoint: normalizedBreakpoint,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
        filePath: normalizedBreakpoint.filePath,
      });
      return;
    }

    const breakpointKey = getBreakpointKey(normalizedBreakpoint);
    const nextBreakpoints = breakpointsRef.current.some((candidate) => getBreakpointKey(candidate) === breakpointKey)
      ? breakpointsRef.current.map((candidate) => (
        getBreakpointKey(candidate) === breakpointKey
          ? normalizedBreakpoint
          : candidate
      ))
      : [...breakpointsRef.current, normalizedBreakpoint];
    persistDebugBreakpoints(nextBreakpoints);
  }, [persistDebugBreakpoints, rootPath, t]);

  const removeBreakpoint = useCallback(async (breakpoint: CodePaneBreakpoint) => {
    const normalizedBreakpoint = normalizeBreakpoint(breakpoint);
    const response = await window.electronAPI.codePaneRemoveBreakpoint({
      rootPath,
      breakpoint: normalizedBreakpoint,
    });

    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
        filePath: normalizedBreakpoint.filePath,
      });
      return;
    }

    persistDebugBreakpoints(
      breakpointsRef.current.filter((candidate) => getBreakpointKey(candidate) !== getBreakpointKey(normalizedBreakpoint)),
    );
  }, [persistDebugBreakpoints, rootPath, t]);

  const setExceptionBreakpoint = useCallback(async (
    breakpointId: CodePaneExceptionBreakpoint['id'],
    enabled: boolean,
  ) => {
    const nextBreakpoints = normalizeExceptionBreakpoints(
      exceptionBreakpointsRef.current.map((breakpoint) => (
        breakpoint.id === breakpointId
          ? { ...breakpoint, enabled }
          : breakpoint
      )),
    );
    const response = await window.electronAPI.codePaneSetExceptionBreakpoints({
      rootPath,
      breakpoints: nextBreakpoints,
    });
    if (!response.success) {
      setBanner({
        tone: 'error',
        message: response.error || t('common.retry'),
      });
      return;
    }

    persistExceptionBreakpoints(nextBreakpoints);
  }, [persistExceptionBreakpoints, rootPath, t]);

  const toggleBreakpoint = useCallback(async (filePath: string, lineNumber: number) => {
    const normalizedBreakpoint = normalizeBreakpoint({
      filePath,
      lineNumber,
    });
    const breakpointKey = getBreakpointKey(normalizedBreakpoint);
    const existingBreakpoint = breakpointsRef.current.find((candidate) => getBreakpointKey(candidate) === breakpointKey);
    if (existingBreakpoint) {
      await removeBreakpoint(existingBreakpoint);
      return;
    }

    await updateBreakpoint(normalizedBreakpoint);
  }, [removeBreakpoint, updateBreakpoint]);

  useEffect(() => {
    toggleBreakpointRef.current = toggleBreakpoint;
  }, [toggleBreakpoint]);

  const toggleBottomPanelMode = useCallback((mode: BottomPanelMode) => {
    setBottomPanelMode((currentMode) => (currentMode === mode ? null : mode));
  }, []);

  const toggleHierarchyToolWindow = useCallback(() => {
    if (!activeFilePath) {
      return;
    }

    if (bottomPanelMode === 'hierarchy') {
      setBottomPanelMode(null);
      return;
    }

    void openHierarchyPanel(selectedHierarchyMode);
  }, [activeFilePath, bottomPanelMode, openHierarchyPanel, selectedHierarchyMode]);

  const refreshBottomPanel = useCallback(() => {
    if (bottomPanelMode === 'run') {
      void loadRunTargets();
      return;
    }

    if (bottomPanelMode === 'debug') {
      void loadRunTargets();
      void loadDebugSessions();
      void loadDebugSessionDetails(selectedDebugSessionId);
      void loadExceptionBreakpoints();
      return;
    }

    if (bottomPanelMode === 'tests') {
      void loadTests();
      return;
    }

    if (bottomPanelMode === 'project') {
      void loadProjectContributions(true);
      return;
    }

    if (bottomPanelMode === 'git') {
      void refreshGitSnapshot({ includeGraph: true });
      void loadGitBranches({ preferredBaseRef: gitRebaseBaseRef });
      if (gitRebaseBaseRef) {
        void loadGitRebasePlan(gitRebaseBaseRef);
      }
      return;
    }

    if (bottomPanelMode === 'conflict') {
      void loadGitConflictDetails(selectedGitConflictPath);
      return;
    }

    if (bottomPanelMode === 'history') {
      void loadGitHistory({
        filePath: gitHistory?.targetFilePath,
        lineNumber: gitHistory?.targetLineNumber,
      });
      return;
    }

    if (bottomPanelMode === 'workspace') {
      void loadTodoEntries();
      return;
    }

    if (bottomPanelMode === 'performance') {
      setRuntimeStoreVersion((currentVersion) => currentVersion + 1);
      return;
    }

    if (bottomPanelMode === 'hierarchy') {
      void loadHierarchyRoot(selectedHierarchyMode);
      return;
    }

    if (bottomPanelMode === 'semantic') {
      void loadSemanticSummary();
    }
  }, [
    bottomPanelMode,
    selectedGitConflictPath,
    gitRebaseBaseRef,
    gitHistory?.targetFilePath,
    gitHistory?.targetLineNumber,
    loadGitBranches,
    loadGitConflictDetails,
    loadGitHistory,
    loadGitRebasePlan,
    loadHierarchyRoot,
    loadDebugSessions,
    loadDebugSessionDetails,
    loadExceptionBreakpoints,
    loadSemanticSummary,
    loadTodoEntries,
    loadProjectContributions,
    refreshGitSnapshot,
    loadRunTargets,
    loadTests,
    selectedDebugSessionId,
    selectedHierarchyMode,
  ]);

  useEffect(() => {
    if (bottomPanelMode === 'run') {
      void loadRunTargets();
    } else if (bottomPanelMode === 'debug') {
      void loadRunTargets();
      void loadDebugSessions();
      void loadExceptionBreakpoints();
    } else if (bottomPanelMode === 'tests') {
      void loadTests();
    } else if (bottomPanelMode === 'project') {
      void loadProjectContributions();
    } else if (bottomPanelMode === 'git') {
      void refreshGitSnapshot({ includeGraph: true });
      void loadGitBranches({ preferredBaseRef: gitRebaseBaseRef });
    } else if (bottomPanelMode === 'conflict' && selectedGitConflictPath) {
      void loadGitConflictDetails(selectedGitConflictPath);
    } else if (bottomPanelMode === 'history' && gitHistory?.targetFilePath) {
      void loadGitHistory({
        filePath: gitHistory.targetFilePath,
        lineNumber: gitHistory.targetLineNumber,
      });
    } else if (bottomPanelMode === 'workspace') {
      void loadTodoEntries();
    } else if (bottomPanelMode === 'hierarchy') {
      void loadHierarchyRoot(selectedHierarchyMode);
    } else if (bottomPanelMode === 'semantic') {
      void loadSemanticSummary();
    }
  }, [
    activeFilePath,
    bottomPanelMode,
    selectedGitConflictPath,
    gitRebaseBaseRef,
    gitHistory?.targetFilePath,
    gitHistory?.targetLineNumber,
    loadGitBranches,
    loadGitConflictDetails,
    loadGitHistory,
    loadGitRebasePlan,
    loadHierarchyRoot,
    loadDebugSessions,
    loadExceptionBreakpoints,
    loadTodoEntries,
    loadProjectContributions,
    refreshGitSnapshot,
    loadRunTargets,
    loadSemanticSummary,
    loadTests,
    selectedHierarchyMode,
  ]);

  useEffect(() => {
    if (bottomPanelMode !== 'git' || !gitRebaseBaseRef) {
      return;
    }

    void loadGitRebasePlan(gitRebaseBaseRef);
  }, [bottomPanelMode, gitRebaseBaseRef, loadGitRebasePlan]);

  useEffect(() => {
    void loadDebugSessionDetails(selectedDebugSessionId);
  }, [loadDebugSessionDetails, selectedDebugSessionId]);

  useEffect(() => {
    setDebugEvaluations([]);
  }, [selectedDebugSessionId]);

  useEffect(() => {
    void refreshDebugWatches(selectedDebugSession);
  }, [refreshDebugWatches, selectedDebugSession, watchExpressions]);

  const handlePaneClose = useCallback(async () => {
    if (!onClose) {
      return;
    }

    const didFlush = await flushDirtyFiles();
    if (!didFlush) {
      return;
    }

    onClose();
  }, [flushDirtyFiles, onClose]);

  const getGitSectionLabel = useCallback((section: GitChangeSection) => {
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
  }, [t]);

  const renderGitChangeTree = useCallback((nodes: GitChangeTreeNode[], depth = 0): React.ReactNode => nodes.map((node) => {
    if (node.type === 'directory') {
      return (
        <div key={`${node.path}-${node.name}`}>
          <div
            className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-400"
            style={{ paddingLeft: `${8 + (depth * 14)}px` }}
          >
            <Folder size={13} className="shrink-0 text-zinc-500" />
            <span className="truncate">{node.name}</span>
          </div>
          {node.children && renderGitChangeTree(node.children, depth + 1)}
        </div>
      );
    }

    const entry = node.entry;
    if (!entry) {
      return null;
    }

    const badge = getStatusTone(entry.status);
    const relativePath = getRelativePath(rootPath, node.path);
    const isSelected = selectedGitChangePath === node.path;

    return (
      <div key={`${node.path}-${depth}`} className="group">
        <div
          className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors ${isSelected ? 'bg-[rgb(var(--primary))]/15 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/70'}`}
          style={{ paddingLeft: `${8 + (depth * 14)}px` }}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedGitChangePath(node.path);
              void loadGitDiffHunks(node.path);
              if (entry.status === 'deleted') {
                return;
              }
              void activateFile(node.path, { preview: true });
            }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <FileIcon size={13} className="shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {badge && (
              <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${badge.className}`}>
                {badge.badge}
              </span>
            )}
          </button>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {entry.conflicted ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void openGitConflictResolver(node.path);
                  }}
                  className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/25"
                >
                  {t('codePane.gitResolveConflict')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void resolveGitConflict(node.path, 'ours');
                  }}
                  className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/25"
                >
                  {t('codePane.gitUseOurs')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void resolveGitConflict(node.path, 'theirs');
                  }}
                  className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-200 hover:bg-sky-500/25"
                >
                  {t('codePane.gitUseTheirs')}
                </button>
              </>
            ) : (
              <>
                {entry.staged && (
                  <button
                    type="button"
                    onClick={() => {
                      void unstageGitPaths([node.path]);
                    }}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                  >
                    {t('codePane.gitUnstage')}
                  </button>
                )}
                {!entry.staged && (
                  <button
                    type="button"
                    onClick={() => {
                      void stageGitPaths([node.path]);
                    }}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                  >
                    {t('codePane.gitStage')}
                  </button>
                )}
                {(entry.unstaged || entry.status === 'untracked' || entry.status === 'deleted') && (
                  <button
                    type="button"
                    onClick={() => {
                      void discardGitPaths([node.path], Boolean(entry.staged));
                    }}
                    className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-500/25"
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
                  void openDiffForFile(node.path);
                }}
                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
              >
                {t('codePane.openDiff')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void loadGitHistory({ filePath: node.path });
              }}
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
            >
              {t('codePane.gitFileHistory')}
            </button>
            <button
              type="button"
              onClick={() => {
                void revealPathInExplorer(node.path);
              }}
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
            >
              {t('codePane.gitRevealInExplorer')}
            </button>
          </div>
        </div>
        <div className="pb-1 pr-2 text-[10px] text-zinc-500" style={{ paddingLeft: `${31 + (depth * 14)}px` }}>
          <div className="truncate">{relativePath}</div>
          {entry.originalPath && (
            <div className="truncate text-zinc-600">
              {getRelativePath(rootPath, entry.originalPath)} -&gt; {relativePath}
            </div>
          )}
        </div>
      </div>
    );
  }), [activateFile, discardGitPaths, loadGitDiffHunks, loadGitHistory, openDiffForFile, openGitConflictResolver, resolveGitConflict, revealPathInExplorer, rootPath, selectedGitChangePath, stageGitPaths, t, unstageGitPaths]);

  const toolWindowLaunchers = useMemo<ToolWindowLauncher[]>(() => {
    const items: ToolWindowLauncher[] = [
      {
        id: 'run',
        label: t('codePane.runTab'),
        active: bottomPanelMode === 'run',
        onClick: () => {
          toggleBottomPanelMode('run');
        },
      },
      {
        id: 'debug',
        label: t('codePane.debugTab'),
        active: bottomPanelMode === 'debug',
        onClick: () => {
          toggleBottomPanelMode('debug');
        },
      },
      {
        id: 'tests',
        label: t('codePane.testsTab'),
        active: bottomPanelMode === 'tests',
        onClick: () => {
          toggleBottomPanelMode('tests');
        },
      },
      {
        id: 'project',
        label: t('codePane.projectTab'),
        active: bottomPanelMode === 'project',
        onClick: () => {
          toggleBottomPanelMode('project');
        },
      },
      {
        id: 'git',
        label: t('codePane.gitWorkbenchTab'),
        active: bottomPanelMode === 'git',
        onClick: () => {
          toggleBottomPanelMode('git');
        },
      },
      {
        id: 'workspace',
        label: t('codePane.workspaceTab'),
        active: bottomPanelMode === 'workspace',
        onClick: () => {
          toggleBottomPanelMode('workspace');
        },
      },
      {
        id: 'hierarchy',
        label: t('codePane.hierarchyTab'),
        active: bottomPanelMode === 'hierarchy',
        disabled: !activeFilePath,
        onClick: () => {
          toggleHierarchyToolWindow();
        },
      },
      {
        id: 'semantic',
        label: t('codePane.semanticTab'),
        active: bottomPanelMode === 'semantic',
        disabled: !activeFilePath,
        onClick: () => {
          toggleBottomPanelMode('semantic');
        },
      },
      {
        id: 'performance',
        label: t('codePane.performanceTab'),
        active: bottomPanelMode === 'performance',
        onClick: () => {
          toggleBottomPanelMode('performance');
        },
      },
    ];

    if (gitHistory || bottomPanelMode === 'history') {
      items.splice(5, 0, {
        id: 'history',
        label: t('codePane.gitHistoryTab'),
        active: bottomPanelMode === 'history',
        onClick: () => {
          toggleBottomPanelMode('history');
        },
      });
    }

    if (refactorPreview || bottomPanelMode === 'preview') {
      items.splice(items.length - 1, 0, {
        id: 'preview',
        label: t('codePane.refactorPreviewTab'),
        active: bottomPanelMode === 'preview',
        onClick: () => {
          toggleBottomPanelMode('preview');
        },
      });
    }

    return items;
  }, [
    activeFilePath,
    bottomPanelMode,
    gitHistory,
    refactorPreview,
    t,
    toggleBottomPanelMode,
    toggleHierarchyToolWindow,
  ]);

  const renderBottomPanel = () => {
    switch (bottomPanelMode) {
      case 'run':
        return (
          <RunToolWindow
            targets={runTargets}
            sessions={visibleRunSessions}
            selectedSession={selectedRunSession}
            selectedOutput={selectedRunSessionOutput}
            isLoading={isRunTargetsLoading}
            error={runTargetsError}
            onClose={() => {
              setBottomPanelMode(null);
            }}
            onRefresh={refreshBottomPanel}
            onRunTarget={runTargetById}
            onSelectSession={setSelectedRunSessionId}
            onStopSession={stopRunSession}
          />
        );
      case 'debug':
        return (
          <DebugToolWindow
            targets={debugTargets}
            breakpoints={breakpoints}
            exceptionBreakpoints={exceptionBreakpoints}
            sessions={visibleDebugSessions}
            selectedSession={selectedDebugSession}
            selectedDetails={debugSessionDetails}
            selectedOutput={selectedDebugSessionOutput}
            watchEntries={watchEntries}
            evaluations={debugEvaluations}
            isLoading={isRunTargetsLoading}
            isDetailsLoading={isDebugDetailsLoading}
            error={runTargetsError}
            onClose={() => {
              setBottomPanelMode(null);
            }}
            onRefresh={refreshBottomPanel}
            onStartDebug={debugTargetById}
            onSelectSession={setSelectedDebugSessionId}
            onStopSession={stopDebugSession}
            onPauseSession={pauseDebugSession}
            onContinueSession={continueDebugSession}
            onStepOver={(sessionId) => stepDebugSession(sessionId, 'over')}
            onStepInto={(sessionId) => stepDebugSession(sessionId, 'into')}
            onStepOut={(sessionId) => stepDebugSession(sessionId, 'out')}
            onOpenFrame={openDebugFrame}
            onEvaluate={evaluateDebugExpression}
            onAddWatch={addDebugWatchExpression}
            onRemoveWatch={removeDebugWatchExpression}
            onRefreshWatches={() => refreshDebugWatches()}
            onUpdateBreakpoint={updateBreakpoint}
            onRemoveBreakpoint={removeBreakpoint}
            onSetExceptionBreakpoint={setExceptionBreakpoint}
          />
        );
      case 'hierarchy':
        return (
          <HierarchyToolWindow
            mode={selectedHierarchyMode}
            root={hierarchyRootNode}
            isLoading={isHierarchyLoading}
            error={hierarchyError}
            onClose={() => {
              setBottomPanelMode(null);
            }}
            onRefresh={() => {
              void loadHierarchyRoot(selectedHierarchyMode);
            }}
            onSelectMode={(mode) => {
              setSelectedHierarchyMode(mode);
            }}
            onToggleNode={(nodeKey) => {
              void toggleHierarchyNode(nodeKey);
            }}
            onOpenItem={(item) => {
              void openHierarchyItem(item);
            }}
          />
        );
      case 'semantic':
        return (
          <SemanticToolWindow
            fileLabel={semanticSummaryFileLabel}
            legend={semanticLegend}
            summary={semanticSummary}
            totalTokens={semanticTokenCount}
            isEnabled={areSemanticTokensEnabled}
            isLoading={isSemanticSummaryLoading}
            error={semanticSummaryError}
            onClose={() => {
              setBottomPanelMode(null);
            }}
            onRefresh={() => {
              void loadSemanticSummary();
            }}
            onToggleEnabled={() => {
              setAreSemanticTokensEnabled((currentValue) => !currentValue);
            }}
          />
        );
      case 'project':
        return (
          <ProjectToolWindow
            contributions={projectContributions}
            sessions={visibleRunSessions}
            selectedSession={selectedRunSession}
            selectedOutput={selectedRunSessionOutput}
            languageWorkspaceState={languageWorkspaceState}
            isLoading={isProjectLoading}
            error={projectError}
            onClose={() => {
              setBottomPanelMode(null);
            }}
            onRefresh={refreshBottomPanel}
            onRunCommand={runProjectCommandById}
            onSelectSession={setSelectedRunSessionId}
            onStopSession={stopRunSession}
            onOpenTreeItem={(item) => {
              if (!item.filePath) {
                return;
              }

              void openFileLocation({
                filePath: item.filePath,
                lineNumber: item.lineNumber ?? 1,
                column: item.column ?? 1,
              });
            }}
          />
        );
      case 'tests':
        return (
          <TestsToolWindow
            testItems={testItems}
            sessions={visibleRunSessions}
            selectedSession={selectedRunSession}
            selectedOutput={selectedRunSessionOutput}
            isLoading={isTestsLoading}
            error={testsError}
            hasFailedSessions={hasFailedTestSessions}
            onClose={() => {
              setBottomPanelMode(null);
            }}
            onRefresh={refreshBottomPanel}
            onRunTest={runTestTarget}
            onSelectSession={setSelectedRunSessionId}
            onStopSession={stopRunSession}
            onOpenTestItem={openTestItem}
            onRerunFailed={rerunFailedTests}
          />
        );
      case 'preview':
        return (
          <RefactorPreviewToolWindow
            changeSet={refactorPreview}
            selectedChangeId={selectedPreviewChangeId}
            isApplying={isApplyingRefactorPreview}
            error={refactorPreviewError}
            onSelectChange={setSelectedPreviewChangeId}
            onApply={applyRefactorPreview}
            onClose={() => {
              setBottomPanelMode(null);
            }}
          />
        );
      case 'git':
        return (
          <GitToolWindow
            branches={gitBranches}
            selectedBranchName={selectedGitBranchName}
            commits={gitGraph}
            selectedCommitSha={selectedGitLogCommitSha}
            rebasePlan={gitRebasePlan}
            rebaseBaseRef={gitRebaseBaseRef}
            isBranchesLoading={isGitBranchesLoading}
            branchesError={gitBranchesError}
            isRebaseLoading={isGitRebaseLoading}
            rebaseError={gitRebaseError}
            onSelectBranch={handleSelectGitBranch}
            onSelectCommit={setSelectedGitLogCommitSha}
            onChangeRebaseBaseRef={setGitRebaseBaseRef}
            onRefresh={refreshBottomPanel}
            onRefreshRebase={() => {
              void loadGitRebasePlan(gitRebaseBaseRef);
            }}
            onCheckoutBranch={checkoutGitBranch}
            onRenameBranch={renameGitBranch}
            onDeleteBranch={deleteGitBranch}
            onCherryPick={cherryPickCommit}
            onApplyRebasePlan={applyGitRebasePlan}
            onClose={() => {
              setBottomPanelMode(null);
            }}
          />
        );
      case 'conflict':
        return (
          <ConflictResolutionToolWindow
            conflict={gitConflictDetails}
            isLoading={isGitConflictLoading}
            isApplying={isApplyingGitConflict}
            error={gitConflictError}
            onRefresh={refreshBottomPanel}
            onApply={applyGitConflictResolution}
            onClose={() => {
              setBottomPanelMode(null);
            }}
          />
        );
      case 'history':
        return (
          <GitHistoryToolWindow
            history={gitHistory}
            selectedCommitSha={selectedHistoryCommitSha}
            isLoading={isGitHistoryLoading}
            error={gitHistoryError}
            onSelectCommit={setSelectedHistoryCommitSha}
            onRefresh={refreshBottomPanel}
            onCherryPick={cherryPickCommit}
            onClose={() => {
              setBottomPanelMode(null);
            }}
          />
        );
      case 'workspace':
        return (
          <WorkspaceToolWindow
            bookmarks={bookmarks}
            todoItems={todoItems}
            localHistoryEntries={visibleLocalHistoryEntries}
            activeFilePath={activeFilePath}
            isTodoLoading={isTodoLoading}
            todoError={todoError}
            onClose={() => {
              setBottomPanelMode(null);
            }}
            onRefresh={loadTodoEntries}
            onOpenBookmark={(bookmark) => {
              void openFileLocation({
                filePath: bookmark.filePath,
                lineNumber: bookmark.lineNumber,
                column: bookmark.column,
              });
            }}
            onOpenTodo={(item) => {
              void openFileLocation({
                filePath: item.filePath,
                lineNumber: item.lineNumber,
                column: item.column,
              });
            }}
            onOpenHistoryEntry={(entry) => {
              void openFileLocation({
                filePath: entry.filePath,
                lineNumber: 1,
                column: 1,
              });
            }}
            onRestoreHistoryEntry={(entry) => {
              void restoreLocalHistoryEntry(entry.id);
            }}
            getFileLabel={getFileLabel}
            getRelativePath={(filePath) => getRelativePath(rootPath, filePath)}
          />
        );
      case 'performance':
        return (
          <PerformanceToolWindow
            requests={runtimeRequests}
            activeTasks={activePerformanceTasks}
            indexStatus={indexStatus}
            languageWorkspaceState={languageWorkspaceState}
            onClose={() => {
              setBottomPanelMode(null);
            }}
            onRefresh={refreshBottomPanel}
          />
        );
      default:
        return null;
    }
  };

  const editorActionMenuSections = useMemo<EditorActionMenuItem[][]>(() => ([
    [
      {
        id: 'find-usages',
        label: t('codePane.findUsages'),
        disabled: !activeFilePath,
        onSelect: () => {
          void findUsagesAtCursor();
        },
      },
      {
        id: 'rename-symbol',
        label: t('codePane.renameSymbol'),
        disabled: !activeFilePath || activeFileReadOnly,
        onSelect: () => {
          void renameSymbolAtCursor();
        },
      },
      {
        id: 'go-to-implementation',
        label: t('codePane.goToImplementation'),
        disabled: !activeFilePath,
        onSelect: () => {
          void goToImplementationAtCursor();
        },
      },
      {
        id: 'code-actions',
        label: t('codePane.codeActions'),
        disabled: !activeFilePath,
        onSelect: () => {
          void openCodeActionMenu();
        },
      },
      {
        id: 'format-document',
        label: t('codePane.formatDocument'),
        disabled: !activeFilePath || activeFileReadOnly,
        onSelect: () => {
          void formatActiveDocument();
        },
      },
    ],
    [
      {
        id: 'quick-documentation',
        label: t('codePane.quickDocumentation'),
        disabled: !activeFilePath,
        active: isQuickDocumentationOpen,
        onSelect: () => {
          toggleQuickDocumentation();
        },
      },
      {
        id: 'toggle-inlay-hints',
        label: t('codePane.inlayHints'),
        disabled: !activeFilePath,
        active: areInlayHintsEnabled,
        onSelect: () => {
          setAreInlayHintsEnabled((currentValue) => !currentValue);
        },
      },
      {
        id: 'toggle-split-editor',
        label: t('codePane.editorSplitToggle'),
        disabled: !activeFilePath,
        active: isEditorSplitVisible,
        onSelect: () => {
          void toggleEditorSplit();
        },
      },
    ],
    [
      {
        id: 'toggle-bookmark',
        label: t('codePane.bookmarkToggle'),
        disabled: !activeFilePath,
        active: isCurrentLineBookmarked,
        onSelect: () => {
          toggleBookmarkAtCursor();
        },
      },
      {
        id: 'toggle-git-blame',
        label: t('codePane.gitBlame'),
        disabled: !activeFilePath,
        active: isBlameVisible,
        onSelect: () => {
          setIsBlameVisible((currentValue) => !currentValue);
        },
      },
    ],
  ]), [
    activeFilePath,
    activeFileReadOnly,
    areInlayHintsEnabled,
    findUsagesAtCursor,
    formatActiveDocument,
    goToImplementationAtCursor,
    isBlameVisible,
    isCurrentLineBookmarked,
    isEditorSplitVisible,
    isQuickDocumentationOpen,
    openCodeActionMenu,
    renameSymbolAtCursor,
    t,
    toggleEditorSplit,
    toggleQuickDocumentation,
    toggleBookmarkAtCursor,
  ]);

  return (
    <>
      <style>
        {`
          .code-pane-definition-link {
            cursor: pointer;
            text-decoration: underline;
            text-decoration-thickness: 1px;
            text-underline-offset: 2px;
          }

          .code-pane-breakpoint-glyph,
          .code-pane-debug-current-glyph {
            border-radius: 9999px;
            box-sizing: border-box;
            display: block;
            height: 10px;
            margin: 4px auto 0;
            width: 10px;
          }

          .code-pane-breakpoint-glyph {
            background: #ef4444;
            box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.45);
          }

          .code-pane-breakpoint-glyph-disabled {
            background: #71717a;
            box-shadow: 0 0 0 1px rgba(161, 161, 170, 0.4);
          }

          .code-pane-breakpoint-glyph-conditional {
            background: #f97316;
            box-shadow: 0 0 0 1px rgba(251, 146, 60, 0.45);
          }

          .code-pane-breakpoint-glyph-log {
            background: #06b6d4;
            box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.45);
          }

          .code-pane-debug-current-glyph {
            background: #f59e0b;
            box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.45);
          }

          .code-pane-debug-current-line {
            background: rgba(245, 158, 11, 0.14);
          }
        `}
      </style>
      <div
        ref={rootContainerRef}
        className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-950"
        onMouseDown={onActivate}
      >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/90 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-zinc-200">
          <FileCode2 size={14} className="shrink-0 text-[rgb(var(--primary))]" />
          <span className="truncate text-xs font-medium">
            {rootPath || t('codePane.title')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <AppTooltip content={t('codePane.navigateBack')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('codePane.navigateBack')}
              onMouseDown={preventMouseButtonFocus}
              onClick={() => {
                void navigateBack();
              }}
              disabled={!canNavigateBack}
              className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={13} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('codePane.navigateForward')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('codePane.navigateForward')}
              onMouseDown={preventMouseButtonFocus}
              onClick={() => {
                void navigateForward();
              }}
              disabled={!canNavigateForward}
              className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={13} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('codePane.searchEverywhereOpen')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('codePane.searchEverywhereOpen')}
              onMouseDown={preventMouseButtonFocus}
              onClick={() => {
                openSearchEverywhere('all');
              }}
              className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-50"
            >
              <Search size={13} />
            </button>
          </AppTooltip>
          <AppTooltip content={t('codePane.refresh')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('codePane.refresh')}
              onMouseDown={preventMouseButtonFocus}
              onClick={() => {
                setIsRefreshing(true);
                void refreshLoadedDirectories().finally(() => {
                  setIsRefreshing(false);
                });
              }}
              className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-50"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </AppTooltip>
          <AppTooltip
            content={viewMode === 'diff' ? t('codePane.showEditor') : t('codePane.showDiff')}
            placement="pane-corner"
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label={viewMode === 'diff' ? t('codePane.showEditor') : t('codePane.showDiff')}
              onMouseDown={preventMouseButtonFocus}
              onClick={() => {
                if (viewMode === 'diff') {
                  persistCodeState({
                    viewMode: 'editor',
                    diffTargetPath: null,
                  });
                  return;
                }

                void openDiffForActiveFile();
              }}
              disabled={!activeFilePath}
              className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GitCompareArrows size={13} />
            </button>
          </AppTooltip>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                tabIndex={-1}
                title={t('codePane.editorActionsMenu')}
                aria-label={t('codePane.editorActionsMenu')}
                onMouseDown={preventMouseButtonFocus}
                className="flex h-6 items-center justify-center rounded bg-zinc-800/90 px-1.5 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
              >
                <MoreHorizontal size={13} className="mr-1" />
                {t('common.more')}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={contextMenuContentClassName}
                sideOffset={6}
                align="end"
              >
                {editorActionMenuSections.map((section, sectionIndex) => (
                  <React.Fragment key={`editor-actions-${sectionIndex}`}>
                    {section.map((item) => (
                      <DropdownMenu.Item
                        key={item.id}
                        disabled={item.disabled}
                        onSelect={item.onSelect}
                        className={`${contextMenuItemClassName} justify-between ${item.active ? 'bg-zinc-800/80 text-zinc-50' : ''} data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40`}
                      >
                        <span>{item.label}</span>
                        {item.active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />}
                      </DropdownMenu.Item>
                    ))}
                    {sectionIndex < editorActionMenuSections.length - 1 && (
                      <DropdownMenu.Separator className="my-1 h-px bg-zinc-800" />
                    )}
                  </React.Fragment>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <AppTooltip content={t('common.save')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('common.save')}
              onMouseDown={preventMouseButtonFocus}
              onClick={() => {
                if (activeFilePath) {
                  void saveFile(activeFilePath);
                }
              }}
              disabled={!activeFilePath}
              className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={13} />
            </button>
          </AppTooltip>
          {onClose && (
            <AppTooltip content={t('terminalPane.close')} placement="pane-corner">
              <button
                type="button"
                tabIndex={-1}
                aria-label={t('terminalPane.close')}
                onMouseDown={preventMouseButtonFocus}
                onClick={(event) => {
                  event.stopPropagation();
                  void handlePaneClose();
                }}
                className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800/90 text-zinc-400 hover:bg-red-600 hover:text-zinc-50"
              >
                <X size={13} />
              </button>
            </AppTooltip>
          )}
        </div>
      </div>

      {banner && (
        <div className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-xs ${banner.tone === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : banner.tone === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-sky-500/30 bg-sky-500/10 text-sky-100'}`}>
          <span className="min-w-0 flex-1 truncate">{banner.message}</span>
          <div className="flex items-center gap-2">
            {banner.showReload && banner.filePath && (
              <button
                type="button"
                onClick={() => {
                  void reloadFileFromDisk(banner.filePath!);
                  setBanner(null);
                }}
                className="rounded bg-zinc-950/50 px-2 py-1 text-[11px] font-medium text-zinc-100 hover:bg-zinc-950"
              >
                {t('codePane.reload')}
              </button>
            )}
            {banner.showOverwrite && banner.filePath && (
              <button
                type="button"
                onClick={() => {
                  void saveFile(banner.filePath!, { overwrite: true }).then((didSave) => {
                    if (didSave) {
                      setBanner(null);
                    }
                  });
                }}
                className="rounded bg-zinc-950/50 px-2 py-1 text-[11px] font-medium text-zinc-100 hover:bg-zinc-950"
              >
                {t('codePane.overwrite')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="rounded bg-zinc-950/30 p-1 text-zinc-100 hover:bg-zinc-950/60"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <div
        ref={workspaceLayoutRef}
        data-testid="code-pane-workspace-layout"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div
          data-testid="code-pane-workspace-top"
          className="flex min-h-[180px] flex-1 overflow-hidden"
        >
          <div className="flex h-full shrink-0">
          <div className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-950/85 px-1 py-2">
            {sidebarTabs.map((tab) => {
              const Icon = tab.icon;
              const isSelected = sidebarMode === tab.mode && isSidebarVisible;
              return (
                <AppTooltip key={tab.mode} content={tab.label} placement="pane-corner">
                  <button
                    type="button"
                    aria-label={tab.label}
                    aria-pressed={isSelected}
                    onClick={() => {
                      handleSidebarModeSelect(tab.mode);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded text-zinc-400 transition-colors ${isSelected ? 'bg-zinc-800 text-zinc-100' : 'hover:bg-zinc-900 hover:text-zinc-100'}`}
                  >
                    <Icon size={15} />
                  </button>
                </AppTooltip>
              );
            })}
          </div>

          {isSidebarVisible && (
            <>
              <aside
                className="flex h-full shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/70"
                style={{ width: `${sidebarWidth}px` }}
              >
                <div className="flex items-center justify-between border-b border-zinc-800 px-2 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                    <ActiveSidebarIcon size={12} />
                    <span className="truncate">{activeSidebarTab.label}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Collapse code pane sidebar"
                    onClick={() => {
                      toggleSidebarVisibility(false);
                    }}
                    className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>

          {sidebarMode === 'files' ? (
            <>
              <div className="border-b border-zinc-800 px-2 py-2">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  <Search size={12} />
                  {t('codePane.searchFiles')}
                </div>
                <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5">
                  <Search size={12} className="shrink-0 text-zinc-500" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('codePane.searchFilesPlaceholder')}
                    className="w-full bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                  {isSearching && <Loader2 size={12} className="shrink-0 animate-spin text-zinc-500" />}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="border-b border-zinc-800 px-2 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  {t('codePane.explorer')}
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-1 py-2">
                  {isBootstrapping ? (
                    <div className="flex items-center gap-2 px-2 text-xs text-zinc-500">
                      <Loader2 size={12} className="animate-spin" />
                      {t('codePane.loading')}
                    </div>
                  ) : deferredSearchQuery.trim() && searchError ? (
                    <div className="px-2 text-xs text-red-300">{searchError}</div>
                  ) : deferredSearchQuery.trim() ? (
                    renderedSearchResults.length > 0 ? renderedSearchResults : (
                      <div className="px-2 text-xs text-zinc-500">{t('common.noMatchingWindows')}</div>
                    )
                  ) : treeLoadError ? (
                    <div className="px-2 text-xs text-red-300">{treeLoadError}</div>
                  ) : sidebarEntries.length > 0 || hasExternalLibraries || externalLibrariesError ? (
                    <>
                      {sidebarEntries.length > 0 ? (
                        <>
                          <ContextMenu.Root>
                            <ContextMenu.Trigger asChild>
                              <button
                                type="button"
                                title={rootPath}
                                onClick={() => {
                                  toggleDirectory(rootPath);
                                }}
                                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${isRootSelected ? 'bg-[rgb(var(--primary))]/15 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/70'}`}
                              >
                                {isRootExpanded ? (
                                  <ChevronDown size={14} className="shrink-0 text-zinc-500" />
                                ) : (
                                  <ChevronRight size={14} className="shrink-0 text-zinc-500" />
                                )}
                                {isRootExpanded ? (
                                  <FolderOpen size={14} className="shrink-0 text-amber-300" />
                                ) : (
                                  <Folder size={14} className="shrink-0 text-amber-300" />
                                )}
                                <span className="min-w-0 flex-1 truncate">{rootLabel}</span>
                                {isDirectoryLoading(rootPath) && (
                                  <Loader2 size={12} className="shrink-0 animate-spin text-zinc-500" />
                                )}
                                {rootBadge && (
                                  <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${rootBadge.className}`}>
                                    {rootBadge.badge}
                                  </span>
                                )}
                              </button>
                            </ContextMenu.Trigger>
                            {renderFileContextMenu(rootPath, 'directory')}
                          </ContextMenu.Root>
                          {isRootExpanded && renderTree(rootPath, 1)}
                        </>
                      ) : null}
                      {renderedExternalLibrarySections}
                    </>
                  ) : (
                    <div className="px-2 text-xs text-zinc-500">{t('codePane.emptyFolder')}</div>
                  )}
                </div>
              </div>
            </>
          ) : sidebarMode === 'search' ? (
            <>
              <div className="border-b border-zinc-800 px-2 py-2">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  <Search size={12} />
                  {searchPanelMode === 'contents'
                    ? t('codePane.searchContents')
                    : searchPanelMode === 'symbols'
                      ? t('codePane.workspaceSymbols')
                      : t('codePane.findUsages')}
                </div>
                <div className="mb-2 flex gap-1 rounded bg-zinc-900/60 p-1">
                  {([
                    ['contents', t('codePane.searchModeContents')],
                    ['symbols', t('codePane.searchModeSymbols')],
                    ['usages', t('codePane.searchModeUsages')],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSearchPanelMode(mode)}
                      className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                        searchPanelMode === mode
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {searchPanelMode === 'contents' ? (
                  <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5">
                    <Search size={12} className="shrink-0 text-zinc-500" />
                    <input
                      value={contentSearchQuery}
                      onChange={(event) => setContentSearchQuery(event.target.value)}
                      placeholder={t('codePane.searchContentsPlaceholder')}
                      className="w-full bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
                    />
                    {isContentSearching && <Loader2 size={12} className="shrink-0 animate-spin text-zinc-500" />}
                  </div>
                ) : searchPanelMode === 'symbols' ? (
                  <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5">
                    <Search size={12} className="shrink-0 text-zinc-500" />
                    <input
                      value={workspaceSymbolQuery}
                      onChange={(event) => setWorkspaceSymbolQuery(event.target.value)}
                      placeholder={t('codePane.workspaceSymbolsPlaceholder')}
                      className="w-full bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
                    />
                    {isWorkspaceSymbolSearching && <Loader2 size={12} className="shrink-0 animate-spin text-zinc-500" />}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-400">
                    <span className="truncate">
                      {usagesTargetLabel
                        ? t('codePane.findUsagesFor', { symbol: usagesTargetLabel })
                        : t('codePane.findUsagesHint')}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void findUsagesAtCursor();
                      }}
                      className="shrink-0 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                    >
                      {t('codePane.findUsages')}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="border-b border-zinc-800 px-2 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  {searchPanelMode === 'contents'
                    ? t('codePane.searchTab')
                    : searchPanelMode === 'symbols'
                      ? t('codePane.workspaceSymbols')
                      : t('codePane.findUsages')}
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                  {searchPanelMode === 'contents' ? (
                    deferredContentSearchQuery.trim() && contentSearchError ? (
                      <div className="text-xs text-red-300">{contentSearchError}</div>
                    ) : deferredContentSearchQuery.trim() ? (
                      contentSearchGroups.length > 0 ? (
                        <div className="space-y-3">
                          {contentSearchGroups.map((group) => (
                            <div key={group.filePath} className="space-y-1">
                              <button
                                type="button"
                                onClick={() => {
                                  void activateFile(group.filePath, { preview: true });
                                }}
                                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"
                              >
                                <FileIcon size={13} className="shrink-0 text-zinc-500" />
                                <span className="min-w-0 flex-1 truncate">{getPathLeafLabel(group.filePath)}</span>
                                <span className="truncate text-[10px] text-zinc-500">
                                  {getRelativePath(rootPath, group.filePath)}
                                </span>
                              </button>
                              {group.matches.map((match) => (
                                <button
                                  key={`${group.filePath}:${match.lineNumber}:${match.column}`}
                                  type="button"
                                  onClick={() => {
                                    void openContentSearchMatch(match);
                                  }}
                                  className="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-xs text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
                                >
                                  <span className="w-[44px] shrink-0 text-[10px] text-zinc-500">
                                    {match.lineNumber}:{match.column}
                                  </span>
                                  <span className="min-w-0 flex-1 break-words">{match.lineText}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">{t('codePane.searchContentsEmpty')}</div>
                      )
                    ) : (
                      <div className="text-xs text-zinc-500">{t('codePane.searchContentsHint')}</div>
                    )
                  ) : searchPanelMode === 'symbols' ? (
                    deferredWorkspaceSymbolQuery.trim() && workspaceSymbolError ? (
                      <div className="text-xs text-red-300">{workspaceSymbolError}</div>
                    ) : deferredWorkspaceSymbolQuery.trim() ? (
                      workspaceSymbolResults.length > 0 ? (
                        <div className="space-y-1">
                          {workspaceSymbolResults.map((symbol) => (
                            <button
                              key={`${symbol.filePath}:${symbol.name}:${symbol.range.startLineNumber}:${symbol.range.startColumn}`}
                              type="button"
                              onClick={() => {
                                void openFileLocation({
                                  filePath: symbol.filePath,
                                  lineNumber: symbol.range.startLineNumber,
                                  column: symbol.range.startColumn,
                                });
                              }}
                              className="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"
                            >
                              <FileCode2 size={13} className="mt-0.5 shrink-0 text-zinc-500" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-zinc-100">{symbol.name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                                  {symbol.containerName && <span>{symbol.containerName}</span>}
                                  <span>{getRelativePath(rootPath, symbol.filePath)}</span>
                                  <span>{symbol.range.startLineNumber}:{symbol.range.startColumn}</span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">{t('codePane.workspaceSymbolsEmpty')}</div>
                      )
                    ) : (
                      <div className="text-xs text-zinc-500">{t('codePane.workspaceSymbolsHint')}</div>
                    )
                  ) : usageError ? (
                    <div className="text-xs text-red-300">{usageError}</div>
                  ) : isFindingUsages ? (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Loader2 size={12} className="animate-spin" />
                      {t('codePane.findUsages')}
                    </div>
                  ) : usagesTargetLabel ? (
                    usageGroups.length > 0 ? (
                      <div className="space-y-3">
                        {usageGroups.map((group) => (
                          <div key={group.filePath} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                void activateFile(group.filePath, { preview: true });
                              }}
                              className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"
                            >
                              <FileIcon size={13} className="shrink-0 text-zinc-500" />
                              <span className="min-w-0 flex-1 truncate">{getPathLeafLabel(group.filePath)}</span>
                              <span className="truncate text-[10px] text-zinc-500">
                                {getRelativePath(rootPath, group.filePath)}
                              </span>
                            </button>
                            {group.references.map((reference) => (
                              <button
                                key={`${group.filePath}:${reference.range.startLineNumber}:${reference.range.startColumn}`}
                                type="button"
                                onClick={() => {
                                  void openFileLocation({
                                    filePath: group.filePath,
                                    lineNumber: reference.range.startLineNumber,
                                    column: reference.range.startColumn,
                                  });
                                }}
                                className="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-xs text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
                              >
                                <span className="w-[44px] shrink-0 text-[10px] text-zinc-500">
                                  {reference.range.startLineNumber}:{reference.range.startColumn}
                                </span>
                                <span className="min-w-0 flex-1 break-words">
                                  {reference.previewText ?? getRelativePath(rootPath, group.filePath)}
                                </span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">{t('codePane.findUsagesEmpty')}</div>
                    )
                  ) : (
                    <div className="text-xs text-zinc-500">{t('codePane.findUsagesHint')}</div>
                  )}
                </div>
              </div>
            </>
          ) : sidebarMode === 'scm' ? (
            <>
              <div className="border-b border-zinc-800 px-2 py-2">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  <GitBranch size={12} />
                  {t('codePane.sourceControl')}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  {gitSummaryBranchLabel ? (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
                      {gitSummaryBranchLabel}
                    </span>
                  ) : null}
                  <span>
                    {gitRepositorySummary || scmEntries.length > 0
                      ? t('codePane.sourceControlHint')
                      : t('codePane.gitRepositoryUnavailable')}
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                {gitRepositorySummary || scmEntries.length > 0 ? (
                  <div className="space-y-3">
                    {gitRepositorySummary && (
                      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                            {t('codePane.gitRepositorySummary')}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void refreshGitSnapshot({ includeGraph: true });
                            }}
                            className="rounded bg-zinc-800 p-1 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-50"
                            aria-label={t('codePane.gitRefreshStatus')}
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                        {(gitRepositorySummary.operation !== 'idle' || gitRepositorySummary.hasConflicts) && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {gitRepositorySummary.operation !== 'idle' && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                                {gitOperationLabel}
                              </span>
                            )}
                            {gitRepositorySummary.hasConflicts && (
                              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                                {t('codePane.gitConflictsActive')}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300">
                          <div className="rounded bg-zinc-950/60 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{t('codePane.gitBranch')}</div>
                            <div className="mt-1 truncate text-zinc-100">{gitSummaryBranchLabel ?? t('codePane.gitDetachedHead')}</div>
                          </div>
                          <div className="rounded bg-zinc-950/60 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{t('codePane.gitUpstream')}</div>
                            <div className="mt-1 truncate text-zinc-100">{gitRepositorySummary.upstreamBranch ?? t('codePane.gitNoUpstream')}</div>
                          </div>
                          <div className="rounded bg-zinc-950/60 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{t('codePane.gitAheadBehind')}</div>
                            <div className="mt-1 text-zinc-100">
                              ↑{gitRepositorySummary.aheadCount} ↓{gitRepositorySummary.behindCount}
                            </div>
                          </div>
                          <div className="rounded bg-zinc-950/60 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{t('codePane.gitOperation')}</div>
                            <div className="mt-1 truncate text-zinc-100">{gitOperationLabel}</div>
                          </div>
                          <div className="rounded bg-zinc-950/60 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{t('codePane.gitConflicts')}</div>
                            <div className="mt-1 truncate text-zinc-100">
                              {gitRepositorySummary.hasConflicts
                                ? t('codePane.gitConflictsActive')
                                : t('codePane.gitConflictsNone')}
                            </div>
                          </div>
                          <div className="rounded bg-zinc-950/60 px-2 py-1.5">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{t('codePane.gitRepoRoot')}</div>
                            <div className="mt-1 truncate text-zinc-100">{gitRepositorySummary.repoRootPath}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                        {t('codePane.gitQuickActions')}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void refreshGitSnapshot({ includeGraph: true });
                          }}
                          className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                        >
                          {t('codePane.gitRefreshStatus')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void window.electronAPI.openFolder(gitRepositorySummary?.repoRootPath ?? rootPath);
                          }}
                          className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                        >
                          {t('codePane.gitOpenRepository')}
                        </button>
                        <button
                          type="button"
                          disabled={!gitBranchCopyValue}
                          onClick={() => {
                            if (gitBranchCopyValue) {
                              void window.electronAPI.writeClipboardText(gitBranchCopyValue);
                            }
                          }}
                          className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t('codePane.gitCopyBranchName')}
                        </button>
                        <button
                          type="button"
                          disabled={scmEntries.length === 0}
                          onClick={() => {
                            void stageGitPaths(scmEntries.map((entry) => entry.path));
                          }}
                          className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t('codePane.gitStageAll')}
                        </button>
                      </div>
                    </div>

                    <CommitComposer
                      summary={gitRepositorySummary}
                      onCommit={commitGitChanges}
                      onStash={stashGitChanges}
                      onCheckout={checkoutGitBranch}
                      onRebaseControl={controlGitRebase}
                    />

                    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                        {t('codePane.gitWorkbenchTab')}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBottomPanelMode('git');
                        }}
                        className="flex w-full items-center justify-between rounded bg-zinc-950/60 px-2 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-50"
                      >
                        <span>{t('codePane.gitOpenWorkbench')}</span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{gitGraph.length}</span>
                      </button>
                    </div>

                    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                        {t('codePane.gitChanges')}
                      </div>
                      {gitChangeSectionGroups.length > 0 ? (
                        <div className="space-y-3">
                          {gitChangeSectionGroups.map((group) => (
                            <div key={group.section}>
                              <div className="mb-1 flex items-center gap-2 px-2 text-[11px] font-medium text-zinc-400">
                                <span>{getGitSectionLabel(group.section)}</span>
                                <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-500">{group.count}</span>
                              </div>
                              <div className="space-y-0.5">
                                {renderGitChangeTree(group.roots)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">{t('codePane.noChanges')}</div>
                      )}
                    </div>

                    <GitHunkList
                      selectedPath={selectedGitChangePath}
                      relativePath={selectedGitChangeRelativePath}
                      stagedHunks={gitStagedHunks}
                      unstagedHunks={gitUnstagedHunks}
                      loading={isGitHunksLoading}
                      error={gitHunksError}
                      onStageHunk={stageGitHunk}
                      onUnstageHunk={unstageGitHunk}
                      onDiscardHunk={discardGitHunk}
                      t={t}
                    />
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">{t('codePane.gitRepositoryUnavailable')}</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-zinc-800 px-2 py-2">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  <AlertTriangle size={12} />
                  {t('codePane.problemsTab')}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{t('codePane.problemErrors', { count: problemSummary.errorCount })}</span>
                  <span>{t('codePane.problemWarnings', { count: problemSummary.warningCount })}</span>
                  <span>{t('codePane.problemInfos', { count: problemSummary.infoCount })}</span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                {problemGroups.length > 0 ? (
                  <div className="space-y-3">
                    {problemGroups.map((group) => (
                      <div key={group.filePath} className="space-y-1">
                        <div className="flex items-center gap-2 px-1 py-1 text-xs text-zinc-300">
                          <FileIcon size={13} className="shrink-0 text-zinc-500" />
                          <span className="min-w-0 flex-1 truncate">{getPathLeafLabel(group.filePath)}</span>
                          <span className="truncate text-[10px] text-zinc-500">
                            {getRelativePath(rootPath, group.filePath)}
                          </span>
                        </div>
                        {group.entries.map((problem) => {
                          const tone = getProblemTone(problem.severity);
                          return (
                            <button
                              key={`${group.filePath}:${problem.startLineNumber}:${problem.startColumn}:${problem.message}`}
                              type="button"
                              onClick={() => {
                                void openFileLocation({
                                  filePath: group.filePath,
                                  lineNumber: problem.startLineNumber,
                                  column: problem.startColumn,
                                });
                              }}
                              className="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"
                            >
                              <span className={`mt-0.5 rounded px-1 py-0.5 text-[10px] font-medium uppercase ${tone.className}`}>
                                {tone.label}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="break-words">{problem.message}</div>
                                <div className="mt-1 text-[10px] text-zinc-500">
                                  {problem.startLineNumber}:{problem.startColumn}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">{t('codePane.noProblems')}</div>
                )}
              </div>
            </>
          )}
              </aside>
              <div
                role="separator"
                aria-orientation="vertical"
                data-testid="code-pane-sidebar-resize-handle"
                onMouseDown={startSidebarResize}
                onDoubleClick={resetSidebarWidth}
                className={`flex h-full w-3 shrink-0 cursor-col-resize items-center justify-center bg-zinc-950/60 transition-colors ${isSidebarResizing ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}
              >
                <GripVertical size={12} />
              </div>
            </>
          )}
        </div>

          <div data-testid="code-pane-editor-region" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-[34px] items-stretch overflow-x-auto border-b border-zinc-800 bg-zinc-950/70">
            {orderedOpenFiles.length > 0 ? orderedOpenFiles.map((tab) => {
              const isTabActive = tab.path === activeFilePath;
              const isTabDirty = dirtyPaths.has(tab.path);
              const tabStatus = getEntryStatus(tab.path, 'file');
              const badge = getStatusTone(tabStatus);
              const isTabPinned = Boolean(tab.pinned);
              const isTabPreview = Boolean(tab.preview);

              return (
                <ContextMenu.Root key={tab.path}>
                  <ContextMenu.Trigger asChild>
                    <div
                      className={`group flex min-w-0 max-w-[220px] items-center gap-2 border-r border-zinc-800 px-3 py-2 text-xs ${isTabActive ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100'}`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => {
                          void activateFile(tab.path);
                        }}
                        onDoubleClick={() => {
                          if (tab.preview) {
                            void activateFile(tab.path, { promotePreview: true });
                          }
                        }}
                      >
                        <FileIcon size={12} className="shrink-0" />
                        {isTabPinned && <Pin size={10} className="shrink-0 text-zinc-500" />}
                        <span className={`truncate ${isTabPreview ? 'italic text-zinc-300' : ''}`}>{getFileLabel(tab.path)}</span>
                        {isTabDirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />}
                        {isTabPreview && (
                          <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">
                            {t('codePane.previewTabBadge')}
                          </span>
                        )}
                        {badge && (
                          <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${badge.className}`}>
                            {badge.badge}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void closeFileTab(tab.path);
                        }}
                        className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </ContextMenu.Trigger>
                  {renderFileContextMenu(tab.path, 'file', {
                    allowDiff: isPathInside(rootPath, tab.path),
                    pinned: isTabPinned,
                    showPinToggle: true,
                  })}
                </ContextMenu.Root>
              );
            }) : (
              <div className="flex items-center px-3 text-xs text-zinc-500">
                {t('codePane.openEditors')}
              </div>
            )}
	          </div>

	          {activeFilePath && (
	            <BreadcrumbsBar
	              items={breadcrumbItems}
	              emptyLabel={isActiveDocumentSymbolsLoading
	                ? t('codePane.loading')
	                : t('codePane.breadcrumbsEmpty')}
	              onSelect={(item) => {
	                if (!breadcrumbFilePath) {
	                  return;
	                }

	                void openFileLocation({
	                  filePath: breadcrumbFilePath,
	                  lineNumber: item.lineNumber,
	                  column: item.column,
	                });
	              }}
	            />
	          )}

	          <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-950">
	            {activeFilePath ? (
	              <div className="flex h-full min-h-0 flex-col">
	                {isQuickDocumentationOpen && (
	                  <QuickDocumentationPanel
	                    title={t('codePane.quickDocumentation')}
	                    loadingLabel={t('codePane.quickDocumentationLoading')}
	                    emptyLabel={t('codePane.quickDocumentationEmpty')}
	                    error={quickDocumentationError}
	                    loading={isQuickDocumentationLoading}
	                    result={quickDocumentation}
	                    onRefresh={() => {
	                      void loadQuickDocumentation();
	                    }}
	                    onClose={() => {
	                      setIsQuickDocumentationOpen(false);
	                    }}
	                  />
	                )}
	                {isBlameVisible && (
	                  <BlameGutter
                    enabled={isBlameVisible}
                    loading={isBlameLoading}
                    entry={activeBlameEntry}
                    onToggle={() => {
                      setIsBlameVisible((currentValue) => !currentValue);
                    }}
                    onOpenHistory={() => {
                      void loadGitHistory({
                        filePath: activeFilePath,
                        lineNumber: activeCursorLineNumber,
                      });
                    }}
                  />
                )}
                {isEditorSplitVisible && secondaryFilePath && viewMode === 'editor' ? (
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    <div
                      className="min-w-0 shrink-0"
                      style={{ width: `${editorSplitSize * 100}%` }}
                    >
                      <div
                        ref={editorHostRef}
                        className="h-full min-h-0"
                      />
                    </div>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      data-testid="code-pane-editor-split-resize-handle"
                      onMouseDown={startEditorSplitResize}
                      className={`flex h-full w-3 shrink-0 cursor-col-resize items-center justify-center border-l border-r border-zinc-800 bg-zinc-950/60 transition-colors ${isEditorSplitResizing ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}
                    >
                      <GripVertical size={12} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col border-l border-zinc-800/70">
                      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-2 py-1 text-[11px] text-zinc-400">
                        <span className="truncate">
                          {secondaryFilePath ? getRelativePath(rootPath, getDisplayPath(secondaryFilePath)) : t('codePane.editorSplitEmpty')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            persistEditorSplitLayout({
                              visible: false,
                            });
                          }}
                          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                        >
                          <X size={11} />
                        </button>
                      </div>
                      <div
                        ref={secondaryEditorHostRef}
                        className="min-h-0 flex-1"
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    ref={editorHostRef}
                    className="min-h-0 flex-1"
                  />
                )}
                {isBootstrapping && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 text-xs text-zinc-500">
                    {t('codePane.loading')}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <FileCode2 size={24} className="text-zinc-700" />
                <div className="text-sm font-medium text-zinc-300">{t('codePane.noOpenFile')}</div>
                <div className="max-w-md text-xs text-zinc-500">{t('codePane.noOpenFileHint')}</div>
              </div>
            )}
          </div>
        </div>
      </div>

          {bottomPanelMode && (
            <>
              <div
                role="separator"
                aria-orientation="horizontal"
                data-testid="code-pane-bottom-panel-resize-handle"
                onMouseDown={startBottomPanelResize}
                onDoubleClick={resetBottomPanelHeight}
                className={`flex h-3 shrink-0 cursor-row-resize items-center justify-center border-t border-zinc-800 bg-zinc-950/60 transition-colors ${isBottomPanelResizing ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}
              >
                <GripHorizontal size={12} />
              </div>
              <div
                data-testid="code-pane-bottom-panel"
                className="min-h-0 shrink-0 overflow-hidden"
                style={{
                  height: `${bottomPanelHeight}px`,
                  maxHeight: `calc(100% - ${CODE_PANE_TOP_REGION_MIN_HEIGHT + CODE_PANE_STATUS_BAR_RESERVED_HEIGHT}px)`,
                }}
              >
                {renderBottomPanel()}
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950/80 px-3 py-2 text-[11px] text-zinc-500">
            <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
              <div className="flex shrink-0 items-center gap-1 overflow-x-auto rounded border border-zinc-800 bg-zinc-950/80 px-1 py-0.5">
                {toolWindowLaunchers.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className={`shrink-0 rounded px-1.5 py-0.5 font-medium transition-colors ${
                      item.active
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="h-4 w-px shrink-0 bg-zinc-800" />
              <span className="truncate">
                {activeFilePath
                  ? (activeFileDisplayPath && isPathInside(rootPath, activeFileDisplayPath)
                    ? getRelativePath(rootPath, activeFileDisplayPath)
                    : activeFileDisplayPath)
                  : t('codePane.autoSave')}
              </span>
              {statusTone && (
                <span className={`rounded px-1.5 py-0.5 font-medium ${statusTone.className}`}>
                  {statusTone.badge}
                </span>
              )}
              {qualityGateChip && (
                <span
                  title={(qualityGateState?.steps ?? [])
                    .map((step) => `${step.id}: ${step.message ?? step.status}`)
                    .join('\n')}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${qualityGateChip.className}`}
                >
                  {qualityGateChip.showSpinner ? (
                    <Loader2 size={11} className="shrink-0 animate-spin" />
                  ) : (
                    <AlertTriangle size={11} className="shrink-0" />
                  )}
                  <span>{qualityGateChip.text}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {indexStatus && (
                <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${indexStatus.state === 'error' ? 'bg-red-500/15 text-red-300' : 'bg-sky-500/15 text-sky-300'}`}>
                  {indexStatus.state === 'building' && (
                    <Loader2 size={11} className="shrink-0 animate-spin" />
                  )}
                  <span>{indexStatusText}</span>
                </span>
              )}
              {languageStatusText && languageStatusTone && (
                <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${languageStatusTone.className}`}>
                  {languageStatusTone.showSpinner && (
                    <Loader2 size={11} className="shrink-0 animate-spin" />
                  )}
                  <span>{languageStatusText}</span>
                </span>
              )}
              {gitStatusChip && (
                <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${gitStatusChip.className}`}>
                  <GitBranch size={11} className="shrink-0" />
                  <span>{gitStatusChip.text}</span>
                </span>
              )}
              {hasRuntimeActivity && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-200">
                  {t('codePane.performanceBusy')}
                </span>
              )}
              <span>{activeStatusText}</span>
              <span>{viewMode === 'diff' ? t('codePane.diffView') : t('codePane.editorView')}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    persistSavePipelineState({
                      formatOnSave: !savePipelineState.formatOnSave,
                    });
                  }}
                  className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
                    savePipelineState.formatOnSave
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t('codePane.saveQualityFormatToggle')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    persistSavePipelineState({
                      organizeImportsOnSave: !savePipelineState.organizeImportsOnSave,
                    });
                  }}
                  className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
                    savePipelineState.organizeImportsOnSave
                      ? 'bg-sky-500/15 text-sky-300'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t('codePane.saveQualityImportsToggle')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    persistSavePipelineState({
                      lintOnSave: !savePipelineState.lintOnSave,
                    });
                  }}
                  className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
                    savePipelineState.lintOnSave
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t('codePane.saveQualityLintToggle')}
                </button>
              </div>
            </div>
          </div>
      </div>

      {isSearchEverywhereOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-zinc-950/70 p-4">
          <div className="mt-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="border-b border-zinc-800 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-zinc-100">{t('codePane.searchEverywhereTitle')}</div>
                <button
                  type="button"
                  onClick={closeSearchEverywhere}
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mb-3 flex gap-1 rounded bg-zinc-900/60 p-1">
                {([
                  ['all', t('codePane.searchEverywhereAll')],
                  ['recent', t('codePane.searchEverywhereRecent')],
                  ['commands', t('codePane.searchEverywhereCommands')],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSearchEverywhereMode(mode);
                      setSearchEverywhereSelectedIndex(0);
                    }}
                    className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                      searchEverywhereMode === mode
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
                <Search size={13} className="shrink-0 text-zinc-500" />
                <input
                  ref={searchEverywhereInputRef}
                  value={searchEverywhereQuery}
                  onChange={(event) => setSearchEverywhereQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setSearchEverywhereSelectedIndex((currentIndex) => (
                        searchEverywhereItems.length === 0
                          ? 0
                          : Math.min(currentIndex + 1, searchEverywhereItems.length - 1)
                      ));
                      return;
                    }

                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setSearchEverywhereSelectedIndex((currentIndex) => (
                        searchEverywhereItems.length === 0
                          ? 0
                          : Math.max(currentIndex - 1, 0)
                      ));
                      return;
                    }

                    if (event.key === 'Enter' && selectedSearchEverywhereItem) {
                      event.preventDefault();
                      closeSearchEverywhere();
                      void selectedSearchEverywhereItem.execute();
                      return;
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeSearchEverywhere();
                    }
                  }}
                  placeholder={t('codePane.searchEverywherePlaceholder')}
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                />
                {isSearchEverywhereLoading && <Loader2 size={13} className="shrink-0 animate-spin text-zinc-500" />}
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto p-2">
              {searchEverywhereError ? (
                <div className="px-2 py-3 text-sm text-red-300">{searchEverywhereError}</div>
              ) : searchEverywhereItems.length > 0 ? (
                <div className="space-y-1">
                  {searchEverywhereItems.map((item, index) => {
                    const previousItem = index > 0 ? searchEverywhereItems[index - 1] : null;
                    const showSectionLabel = !previousItem || previousItem.section !== item.section;
                    const isSelected = index === searchEverywhereSelectedIndex;

                    return (
                      <React.Fragment key={item.id}>
                        {showSectionLabel && (
                          <div className="px-2 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                            {item.section}
                          </div>
                        )}
                        <button
                          type="button"
                          onMouseEnter={() => {
                            setSearchEverywhereSelectedIndex(index);
                          }}
                          onClick={() => {
                            closeSearchEverywhere();
                            void item.execute();
                          }}
                          className={`flex w-full items-start justify-between gap-3 rounded px-2 py-2 text-left transition-colors ${
                            isSelected
                              ? 'bg-zinc-800 text-zinc-100'
                              : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{item.title}</div>
                            {item.subtitle && (
                              <div className="mt-1 truncate text-xs text-zinc-500">{item.subtitle}</div>
                            )}
                          </div>
                          {item.meta && (
                            <div className="shrink-0 text-[11px] text-zinc-500">{item.meta}</div>
                          )}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="px-2 py-3 text-sm text-zinc-500">{t('codePane.searchEverywhereEmpty')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {isCodeActionMenuOpen && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-zinc-950/60 p-4">
          <div className="mt-16 flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
              <div className="text-sm font-medium text-zinc-100">{t('codePane.codeActions')}</div>
              <button
                type="button"
                onClick={() => {
                  setIsCodeActionMenuOpen(false);
                  setCodeActionItems([]);
                  setCodeActionMenuError(null);
                }}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
              >
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-auto p-2">
              {isCodeActionMenuLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-sm text-zinc-500">
                  <Loader2 size={13} className="animate-spin" />
                  {t('codePane.codeActionsLoading')}
                </div>
              ) : codeActionMenuError ? (
                <div className="px-2 py-3 text-sm text-red-300">{codeActionMenuError}</div>
              ) : codeActionItems.length > 0 ? (
                <div className="space-y-1">
                  {codeActionItems.map((action, index) => {
                    const isSelected = index === selectedCodeActionIndex;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={Boolean(action.disabledReason)}
                        onMouseEnter={() => {
                          setSelectedCodeActionIndex(index);
                        }}
                        onClick={() => {
                          void runSelectedCodeAction(action);
                        }}
                        className={`flex w-full items-start justify-between gap-3 rounded px-2 py-2 text-left transition-colors ${
                          action.disabledReason
                            ? 'cursor-not-allowed text-zinc-600'
                            : isSelected
                              ? 'bg-zinc-800 text-zinc-100'
                              : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{action.title}</div>
                          {(action.kind || action.disabledReason) && (
                            <div className="mt-1 truncate text-xs text-zinc-500">
                              {action.disabledReason ?? action.kind}
                            </div>
                          )}
                        </div>
                        {action.isPreferred && (
                          <div className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                            {t('codePane.codeActionsPreferred')}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-2 py-3 text-sm text-zinc-500">{t('codePane.codeActionsEmpty')}</div>
              )}
            </div>
            {codeActionItems.length > 0 && !isCodeActionMenuLoading && (
              <div className="border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
                <span>{t('codePane.codeActionsHint')}</span>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
};

CodePane.displayName = 'CodePane';
