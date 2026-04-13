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
  GripVertical,
  Loader2,
  Pin,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import type { Pane } from '../types/window';
import type {
  CodePaneContentMatch,
  CodePaneGitGraphCommit,
  CodePaneGitRepositorySummary,
  CodePaneFsChangedPayload,
  CodePaneGitStatusEntry,
  CodePaneIndexProgressPayload,
  CodePaneLanguageWorkspaceChangedPayload,
  CodePaneLanguageWorkspaceState,
  CodePaneLocation,
  CodePaneReadFileResult,
  CodePaneTreeEntry,
} from '../../shared/types/electron-api';
import {
  CODE_PANE_BINARY_FILE_ERROR_CODE,
  CODE_PANE_FILE_TOO_LARGE_ERROR_CODE,
  CODE_PANE_SAVE_CONFLICT_ERROR_CODE,
} from '../../shared/types/electron-api';
import { AppTooltip } from './ui/AppTooltip';
import { useI18n } from '../i18n';
import { preventMouseButtonFocus } from '../utils/buttonFocus';
import { useWindowStore } from '../stores/windowStore';
import { ensureMonacoEnvironment } from '../utils/monacoEnvironment';
import {
  ensureMonacoLanguageBridge,
  type MonacoLanguageBridge,
} from '../services/code/MonacoLanguageBridge';
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

const CODE_PANE_SIDEBAR_DEFAULT_WIDTH = 300;
const CODE_PANE_SIDEBAR_MIN_WIDTH = 220;
const CODE_PANE_SIDEBAR_MAX_WIDTH = 520;

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

function clampSidebarWidth(width: number | undefined | null): number {
  if (!Number.isFinite(width)) {
    return CODE_PANE_SIDEBAR_DEFAULT_WIDTH;
  }

  return Math.min(
    CODE_PANE_SIDEBAR_MAX_WIDTH,
    Math.max(CODE_PANE_SIDEBAR_MIN_WIDTH, Math.round(width as number)),
  );
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

function sortOpenFilesByPinned<T extends { pinned?: boolean }>(openFiles: T[]): T[] {
  const pinnedOpenFiles = openFiles.filter((tab) => tab.pinned);
  const regularOpenFiles = openFiles.filter((tab) => !tab.pinned);
  return [...pinnedOpenFiles, ...regularOpenFiles];
}

function createTabList(existingTabs: Array<{ path: string; pinned?: boolean }>, filePath: string) {
  const existingTab = existingTabs.find((tab) => tab.path === filePath);
  if (existingTab) {
    return sortOpenFilesByPinned(existingTabs);
  }

  return sortOpenFilesByPinned([...existingTabs, { path: filePath }]);
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
  const rootPath = pane.code?.rootPath ?? pane.cwd;
  const openFiles = pane.code?.openFiles ?? [];
  const activeFilePath = pane.code?.activeFilePath ?? null;
  const selectedPath = pane.code?.selectedPath ?? null;
  const viewMode = pane.code?.viewMode ?? 'editor';
  const diffTargetPath = pane.code?.diffTargetPath ?? null;
  const initialSidebarLayout = useMemo(() => getInitialSidebarLayout(pane), [pane]);

  const monacoRef = useRef<MonacoModule | null>(null);
  const languageBridgeRef = useRef<MonacoLanguageBridge | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const diffEditorRef = useRef<MonacoDiffEditor | null>(null);
  const fileModelsRef = useRef(new Map<string, MonacoModel>());
  const diffModelsRef = useRef(new Map<string, MonacoModel>());
  const modelDisposersRef = useRef(new Map<string, MonacoDisposable>());
  const fileMetaRef = useRef(new Map<string, FileRuntimeMeta>());
  const preloadedReadResultsRef = useRef(new Map<string, CodePaneReadFileResult>());
  const viewStatesRef = useRef(new Map<string, MonacoViewState>());
  const autoSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const documentSyncTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const suppressModelEventsRef = useRef(new Set<string>());
  const markerListenerRef = useRef<MonacoDisposable | null>(null);
  const editorMouseDownListenerRef = useRef<MonacoDisposable | null>(null);
  const editorMouseMoveListenerRef = useRef<MonacoDisposable | null>(null);
  const editorMouseLeaveListenerRef = useRef<MonacoDisposable | null>(null);
  const diffEditorMouseDownListenerRef = useRef<MonacoDisposable | null>(null);
  const diffEditorMouseMoveListenerRef = useRef<MonacoDisposable | null>(null);
  const diffEditorMouseLeaveListenerRef = useRef<MonacoDisposable | null>(null);
  const definitionLinkDecorationEditorRef = useRef<MonacoEditor | null>(null);
  const definitionLinkDecorationIdsRef = useRef<string[]>([]);
  const definitionHoverRequestKeyRef = useRef<string | null>(null);
  const definitionLookupCacheRef = useRef(new Map<string, Promise<DefinitionLookupResult>>());
  const sidebarResizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarResizeCleanupRef = useRef<(() => void) | null>(null);

  const [treeEntriesByDirectory, setTreeEntriesByDirectory] = useState<Record<string, CodePaneTreeEntry[]>>({});
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => (
    createExpandedDirectorySet(rootPath, pane.code?.expandedPaths)
  ));
  const [loadedDirectories, setLoadedDirectories] = useState<Set<string>>(() => new Set());
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set([rootPath]));
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(initialSidebarLayout.activeView);
  const [isSidebarVisible, setIsSidebarVisible] = useState(initialSidebarLayout.visible);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarLayout.width);
  const [lastExpandedSidebarWidth, setLastExpandedSidebarWidth] = useState(initialSidebarLayout.lastExpandedWidth);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [contentSearchQuery, setContentSearchQuery] = useState('');
  const deferredContentSearchQuery = useDeferredValue(contentSearchQuery);
  const [contentSearchResults, setContentSearchResults] = useState<CodePaneContentMatch[]>([]);
  const [isContentSearching, setIsContentSearching] = useState(false);
  const [problems, setProblems] = useState<Array<MonacoMarker & { filePath: string }>>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(createEmptySet);
  const [savingPaths, setSavingPaths] = useState<Set<string>>(createEmptySet);
  const [gitStatusByPath, setGitStatusByPath] = useState<Record<string, CodePaneGitStatusEntry>>({});
  const [gitRepositorySummary, setGitRepositorySummary] = useState<CodePaneGitRepositorySummary | null>(null);
  const [gitGraph, setGitGraph] = useState<CodePaneGitGraphCommit[]>([]);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [treeLoadError, setTreeLoadError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [contentSearchError, setContentSearchError] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<CodePaneIndexStatus | null>(null);
  const [languageWorkspaceState, setLanguageWorkspaceState] = useState<CodePaneLanguageWorkspaceState | null>(null);

  const expandedDirectoriesRef = useRef(expandedDirectories);
  const loadedDirectoriesRef = useRef(loadedDirectories);
  const dirtyPathsRef = useRef(dirtyPaths);
  const savingPathsRef = useRef(savingPaths);
  const activeFilePathRef = useRef(activeFilePath);
  const pendingNavigationRef = useRef<FileNavigationLocation | null>(null);
  const openFileLocationRef = useRef<(location: FileNavigationLocation) => Promise<void>>(async () => {});
  const sidebarModeRef = useRef(sidebarMode);
  const sidebarVisibleRef = useRef(isSidebarVisible);
  const sidebarWidthRef = useRef(sidebarWidth);
  const lastExpandedSidebarWidthRef = useRef(lastExpandedSidebarWidth);

  useEffect(() => {
    paneRef.current = pane;
  }, [pane]);

  useEffect(() => {
    const nextSidebarLayout = getInitialSidebarLayout(pane);
    setSidebarMode(nextSidebarLayout.activeView);
    setIsSidebarVisible(nextSidebarLayout.visible);
    setSidebarWidth(nextSidebarLayout.width);
    setLastExpandedSidebarWidth(nextSidebarLayout.lastExpandedWidth);
  }, [pane.id, pane.code?.layout, pane]);

  useEffect(() => {
    expandedDirectoriesRef.current = expandedDirectories;
  }, [expandedDirectories]);

  useEffect(() => {
    loadedDirectoriesRef.current = loadedDirectories;
  }, [loadedDirectories]);

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
  }, [viewMode]);

  const disposeEditors = useCallback(() => {
    saveCurrentViewState();
    editorMouseDownListenerRef.current?.dispose();
    editorMouseDownListenerRef.current = null;
    editorMouseMoveListenerRef.current?.dispose();
    editorMouseMoveListenerRef.current = null;
    editorMouseLeaveListenerRef.current?.dispose();
    editorMouseLeaveListenerRef.current = null;
    diffEditorMouseDownListenerRef.current?.dispose();
    diffEditorMouseDownListenerRef.current = null;
    diffEditorMouseMoveListenerRef.current?.dispose();
    diffEditorMouseMoveListenerRef.current = null;
    diffEditorMouseLeaveListenerRef.current?.dispose();
    diffEditorMouseLeaveListenerRef.current = null;
    clearDefinitionLinkDecoration();
    editorRef.current?.dispose();
    diffEditorRef.current?.dispose();
    editorRef.current = null;
    diffEditorRef.current = null;
  }, [clearDefinitionLinkDecoration, saveCurrentViewState]);

  const disposeAllModels = useCallback(() => {
    for (const timer of autoSaveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    autoSaveTimersRef.current.clear();

    for (const timer of documentSyncTimersRef.current.values()) {
      clearTimeout(timer);
    }
    documentSyncTimersRef.current.clear();

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
        setGitGraph(graphResponse?.success ? graphResponse.data ?? [] : []);
      }
    });
  }, [rootPath]);

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
      expandedPaths: Array.from(nextExpandedDirectories),
    });
    handleSidebarModeSelect('files');

    const directoriesToLoad = directoryPathsToExpand.filter((directoryPath) => !loadedDirectoriesRef.current.has(directoryPath));
    if (directoriesToLoad.length > 0) {
      await Promise.all(directoriesToLoad.map((directoryPath) => loadDirectory(directoryPath)));
    }
  }, [handleSidebarModeSelect, loadDirectory, persistCodeState, rootPath]);

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

        markDirty(filePath, true);
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

    markDirty(filePath, false);
    clearBannerForFile(filePath);
    refreshProblems();
    if (!readResult.readOnly) {
      void syncLanguageDocument(filePath, 'open');
    }
    return model;
  }, [clearBannerForFile, clearDefinitionLookupCache, markDirty, refreshProblems, syncLanguageDocument]);

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

  const handleDefinitionClick = useCallback(async (editorInstance: MonacoEditor | null, lineNumber: number, column: number) => {
    const model = editorInstance?.getModel();
    const filePath = activeFilePathRef.current ?? model?.uri.fsPath ?? model?.uri.path;
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
  }, [lookupDefinitionTarget]);

  const attachDefinitionClickNavigation = useCallback((
    editorInstance: MonacoEditor | null,
    target: 'editor' | 'diff',
  ) => {
    const mouseDownListenerRef = target === 'editor'
      ? editorMouseDownListenerRef
      : diffEditorMouseDownListenerRef;
    const mouseMoveListenerRef = target === 'editor'
      ? editorMouseMoveListenerRef
      : diffEditorMouseMoveListenerRef;
    const mouseLeaveListenerRef = target === 'editor'
      ? editorMouseLeaveListenerRef
      : diffEditorMouseLeaveListenerRef;

    mouseDownListenerRef.current?.dispose();
    mouseDownListenerRef.current = null;
    mouseMoveListenerRef.current?.dispose();
    mouseMoveListenerRef.current = null;
    mouseLeaveListenerRef.current?.dispose();
    mouseLeaveListenerRef.current = null;

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
      const filePath = activeFilePathRef.current ?? model?.uri.fsPath ?? model?.uri.path;
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

    mouseDownListenerRef.current = editorInstance.onMouseDown((event: any) => {
      const pointerEvent = event.event?.browserEvent ?? event.event ?? {};
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
  }, [clearDefinitionLinkDecoration, getDefinitionLookupKey, handleDefinitionClick, isMac, updateDefinitionLinkHover]);

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
          glyphMargin: false,
          stickyScroll: { enabled: false },
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
      });

      const savedViewState = viewStatesRef.current.get(currentActiveFilePath);
      if (savedViewState) {
        diffEditorRef.current.getModifiedEditor().restoreViewState(savedViewState);
      }

      applyPendingNavigation(diffEditorRef.current.getModifiedEditor(), currentActiveFilePath);

      if (isActive) {
        diffEditorRef.current.getModifiedEditor().focus();
      }
      return;
    }

    diffEditorMouseDownListenerRef.current?.dispose();
    diffEditorMouseDownListenerRef.current = null;
    diffEditorRef.current?.dispose();
    diffEditorRef.current = null;

    if (!editorRef.current) {
      editorRef.current = monaco.editor.create(hostElement, {
        automaticLayout: true,
        minimap: { enabled: false },
        links: true,
        definitionLinkOpensInPeek: false,
        wordWrap: 'off',
        fontSize: 13,
        tabSize: 2,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        glyphMargin: false,
        stickyScroll: { enabled: false },
      });
      editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const filePath = activeFilePathRef.current;
        if (filePath) {
          void saveFile(filePath);
        }
      });
      attachDefinitionClickNavigation(editorRef.current, 'editor');
    }

    editorRef.current.setModel(model);
    editorRef.current.updateOptions?.({
      readOnly: isReadOnlyFile,
    });

    const savedViewState = viewStatesRef.current.get(currentActiveFilePath);
    if (savedViewState) {
      editorRef.current.restoreViewState(savedViewState);
    }

    applyPendingNavigation(editorRef.current, currentActiveFilePath);

    if (isActive) {
      editorRef.current.focus();
    }
  }, [
    applyPendingNavigation,
    attachDefinitionClickNavigation,
    disposeEditors,
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

  const saveFile = useCallback(async (filePath: string, options?: { overwrite?: boolean }) => {
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
    markSaving(filePath, true);

    const response = await window.electronAPI.codePaneWriteFile({
      rootPath,
      filePath,
      content: model.getValue(),
      expectedMtimeMs: options?.overwrite ? undefined : fileMeta.mtimeMs,
    });

    markSaving(filePath, false);

    if (!response.success || !response.data) {
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
    markDirty(filePath, false);
    clearBannerForFile(filePath);
    await syncLanguageDocument(filePath, 'save');
    void refreshGitSnapshot();
    return true;
  }, [clearBannerForFile, flushPendingLanguageSync, markDirty, markSaving, refreshGitSnapshot, rootPath, syncLanguageDocument, t]);

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

  const activateFile = useCallback(async (filePath: string, options?: { preserveTabs?: boolean }) => {
    const loadedModel = fileModelsRef.current.get(filePath) ?? await loadFileIntoModel(filePath);
    if (!loadedModel) {
      persistCodeState({
        selectedPath: filePath,
      });
      return;
    }

    const currentOpenFiles = paneRef.current.code?.openFiles ?? openFiles;
    const nextTabs = options?.preserveTabs
      ? sortOpenFilesByPinned(currentOpenFiles)
      : createTabList(currentOpenFiles, filePath);

    persistCodeState({
      openFiles: nextTabs,
      activeFilePath: filePath,
      selectedPath: filePath,
      viewMode: 'editor',
      diffTargetPath: null,
    });
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
    const nextTabs = options?.preserveTabs
      ? currentOpenFiles
      : createTabList(currentOpenFiles, filePath);

    setBanner(null);
    persistCodeState({
      openFiles: nextTabs,
      activeFilePath: filePath,
      selectedPath: filePath,
      viewMode: 'diff',
      diffTargetPath: filePath,
    });
    await refreshEditorSurface();
  }, [ensureDiffModel, loadFileIntoModel, openFiles, persistCodeState, refreshEditorSurface]);

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

    await closeLanguageDocument(filePath);
    modelDisposersRef.current.get(filePath)?.dispose();
    modelDisposersRef.current.delete(filePath);
    fileModelsRef.current.get(filePath)?.dispose();
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

    persistCodeState({
      openFiles: nextOpenFiles,
      activeFilePath: nextActiveFilePath,
      selectedPath: nextActiveFilePath ?? currentSelectedPath,
      viewMode: 'editor',
      diffTargetPath: null,
    });
  }, [activeFilePath, clearBannerForFile, clearDefinitionLookupCache, closeLanguageDocument, flushDirtyFiles, markDirty, openFiles, persistCodeState, selectedPath]);

  const toggleDirectory = useCallback((directoryPath: string) => {
    setExpandedDirectories((currentExpandedDirectories) => {
      const nextExpandedDirectories = new Set(currentExpandedDirectories);
      if (nextExpandedDirectories.has(directoryPath)) {
        nextExpandedDirectories.delete(directoryPath);
      } else {
        nextExpandedDirectories.add(directoryPath);
        if (!loadedDirectoriesRef.current.has(directoryPath)) {
          void loadDirectory(directoryPath);
        }
      }

      persistCodeState({
        selectedPath: directoryPath,
        expandedPaths: Array.from(nextExpandedDirectories),
      });

      return nextExpandedDirectories;
    });
  }, [loadDirectory, persistCodeState]);

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
      await Promise.all(uniqueDirectoryPaths.map((directoryPath) => loadDirectory(directoryPath, {
        showLoadingIndicator: options?.showLoadingIndicator,
      })));
    }

    if (options?.refreshGitStatus !== false) {
      await refreshGitSnapshot();
    }
  }, [loadDirectory, refreshGitSnapshot]);

  const refreshLoadedDirectories = useCallback(async () => {
    const directoriesToRefresh = Array.from(new Set([rootPath, ...loadedDirectoriesRef.current]));
    await refreshDirectoryPaths(directoriesToRefresh);
  }, [refreshDirectoryPaths, rootPath]);

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
          expandedPaths: Array.from(nextExpandedDirectories),
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
    const currentOpenFiles = paneRef.current.code?.openFiles ?? openFiles;
    const nextOpenFiles = sortOpenFilesByPinned(currentOpenFiles.map((tab) => (
      tab.path === filePath
        ? { ...tab, pinned: !tab.pinned }
        : tab
    )));

    persistCodeState({
      openFiles: nextOpenFiles,
    });
  }, [openFiles, persistCodeState]);

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
      setIndexStatus(null);
      setLanguageWorkspaceState(null);
      setExpandedDirectories(initialExpandedDirectories);
      setLoadedDirectories(new Set());
      setLoadingDirectories(new Set([rootPath]));
      setSearchResults([]);
      setContentSearchResults([]);
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
  }, [loadDirectory, pane.id, refreshGitSnapshot, rootPath, supportsMonaco, t]);

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

      await refreshEditorSurface();
    };

    void syncActiveSurface();
  }, [activeFilePath, diffTargetPath, ensureDiffModel, loadFileIntoModel, persistCodeState, refreshEditorSurface, viewMode]);

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

    const timer = setTimeout(async () => {
      const response = await window.electronAPI.codePaneSearchFiles({
        rootPath,
        query: trimmedQuery,
        limit: 80,
      });

      if (cancelled) {
        return;
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
  }, [deferredSearchQuery, rootPath, t]);

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

    const timer = setTimeout(async () => {
      const response = await window.electronAPI.codePaneSearchContents({
        rootPath,
        query: trimmedQuery,
        limit: 120,
        maxMatchesPerFile: 6,
      });

      if (cancelled) {
        return;
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
  }, [deferredContentSearchQuery, rootPath, t]);

  const getDisplayPath = useCallback((filePath: string) => (
    fileMetaRef.current.get(filePath)?.displayPath ?? filePath
  ), []);

  const getFileLabel = useCallback((filePath: string) => (
    getPathLeafLabel(getDisplayPath(filePath)) || getDisplayPath(filePath)
  ), [getDisplayPath]);

  const activeTabStatus = activeFilePath ? getEntryStatus(activeFilePath, 'file') : undefined;
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
  const statusTone = getStatusTone(activeTabStatus);
  const sidebarEntries = treeEntriesByDirectory[rootPath] ?? [];
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
  const ActiveSidebarIcon = activeSidebarTab.icon;

  const renderFileContextMenu = useCallback((
    filePath: string,
    entryType: CodePaneTreeEntry['type'],
    options?: {
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
              void openDiffForFile(filePath);
            }}
          >
            {t('codePane.openDiff')}
          </ContextMenu.Item>
        )}
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
  ), [contextMenuContentClassName, contextMenuItemClassName, copyPath, openDiffForFile, revealPath, t, togglePinnedTab]);

  const renderTree = useCallback((directoryPath: string, depth: number): React.ReactNode => {
    const entries = treeEntriesByDirectory[directoryPath] ?? [];
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
                    void activateFile(entry.path);
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
                {loadingDirectories.has(entry.path) && (
                  <Loader2 size={12} className="shrink-0 animate-spin text-zinc-500" />
                )}
                {badge && (
                  <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${badge.className}`}>
                    {badge.badge}
                  </span>
                )}
              </button>
            </ContextMenu.Trigger>
            {renderFileContextMenu(entry.path, entry.type)}
          </ContextMenu.Root>
          {isDirectory && isExpanded && renderTree(entry.path, depth + 1)}
        </React.Fragment>
      );
    });
  }, [activateFile, expandedDirectories, getEntryStatus, loadingDirectories, renderFileContextMenu, selectedPath, toggleDirectory, treeEntriesByDirectory]);

  const renderedSearchResults = useMemo(() => searchResults.map((filePath) => {
    const entryStatus = getEntryStatus(filePath, 'file');
    const badge = getStatusTone(entryStatus);
    return (
      <ContextMenu.Root key={filePath}>
        <ContextMenu.Trigger asChild>
          <button
            type="button"
            onClick={() => {
              void activateFile(filePath);
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

  const openFileLocation = useCallback(async (location: FileNavigationLocation) => {
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
    await activateFile(location.filePath);
  }, [activateFile]);

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

  const renderGitChangeTree = (nodes: GitChangeTreeNode[], depth = 0): React.ReactNode => nodes.map((node) => {
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

    return (
      <div key={`${node.path}-${depth}`} className="group">
        <div
          className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70"
          style={{ paddingLeft: `${8 + (depth * 14)}px` }}
        >
          <button
            type="button"
            onClick={() => {
              if (entry.status === 'deleted') {
                void revealPathInExplorer(node.path);
                return;
              }
              void activateFile(node.path);
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
  });

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
          <AppTooltip content={t('codePane.refresh')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
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
          <AppTooltip content={t('common.save')} placement="pane-corner">
            <button
              type="button"
              tabIndex={-1}
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
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
                  ) : sidebarEntries.length > 0 ? (
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
                            {loadingDirectories.has(rootPath) && (
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
                  {t('codePane.searchContents')}
                </div>
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
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="border-b border-zinc-800 px-2 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  {t('codePane.searchTab')}
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                  {deferredContentSearchQuery.trim() && contentSearchError ? (
                    <div className="text-xs text-red-300">{contentSearchError}</div>
                  ) : deferredContentSearchQuery.trim() ? (
                    contentSearchGroups.length > 0 ? (
                      <div className="space-y-3">
                        {contentSearchGroups.map((group) => (
                          <div key={group.filePath} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                void activateFile(group.filePath);
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
                      </div>
                    </div>

                    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                          {t('codePane.gitBranchGraph')}
                        </div>
                        <div className="text-[10px] text-zinc-500">{gitGraph.length}</div>
                      </div>
                      {gitGraph.length > 0 ? (
                        <div className="space-y-1">
                          {gitGraph.map((commit) => {
                            const laneWidth = Math.max(commit.laneCount, 1) * 12;
                            const visibleRefs = commit.refs.slice(0, 4);
                            return (
                              <div key={commit.sha} className="flex items-start gap-3 rounded px-1 py-1 text-xs hover:bg-zinc-800/60">
                                <div className="relative mt-1 h-5 shrink-0" style={{ width: `${laneWidth}px` }}>
                                  {Array.from({ length: Math.max(commit.laneCount, 1) }).map((_, laneIndex) => (
                                    <span
                                      key={`${commit.sha}-lane-${laneIndex}`}
                                      className="absolute inset-y-0 w-px bg-zinc-700/70"
                                      style={{ left: `${(laneIndex * 12) + 5}px` }}
                                    />
                                  ))}
                                  <span
                                    className={`absolute top-1 h-2.5 w-2.5 rounded-full border ${commit.isMergeCommit ? 'border-sky-300 bg-sky-400' : commit.isHead ? 'border-emerald-300 bg-emerald-400' : 'border-zinc-300 bg-zinc-400'}`}
                                    style={{ left: `${(commit.lane * 12) + 1}px` }}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="truncate text-zinc-100">{commit.subject || commit.shortSha}</span>
                                    {visibleRefs.map((ref) => (
                                      <span
                                        key={`${commit.sha}-${ref}`}
                                        className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-300"
                                      >
                                        {ref}
                                      </span>
                                    ))}
                                    {commit.refs.length > visibleRefs.length && (
                                      <span className="text-[10px] text-zinc-500">+{commit.refs.length - visibleRefs.length}</span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                                    <span>{commit.author}</span>
                                    <span>{new Date(commit.timestamp * 1000).toLocaleString()}</span>
                                    <span>{commit.shortSha}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">{t('codePane.gitCommitGraphEmpty')}</div>
                      )}
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

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-[34px] items-stretch overflow-x-auto border-b border-zinc-800 bg-zinc-950/70">
            {orderedOpenFiles.length > 0 ? orderedOpenFiles.map((tab) => {
              const isTabActive = tab.path === activeFilePath;
              const isTabDirty = dirtyPaths.has(tab.path);
              const tabStatus = getEntryStatus(tab.path, 'file');
              const badge = getStatusTone(tabStatus);
              const isTabPinned = Boolean(tab.pinned);

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
                          void activateFile(tab.path, { preserveTabs: true });
                        }}
                      >
                        <FileIcon size={12} className="shrink-0" />
                        {isTabPinned && <Pin size={10} className="shrink-0 text-zinc-500" />}
                        <span className="truncate">{getFileLabel(tab.path)}</span>
                        {isTabDirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />}
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

          <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-950">
            {activeFilePath ? (
              <>
                <div
                  ref={editorHostRef}
                  className="h-full w-full"
                />
                {isBootstrapping && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 text-xs text-zinc-500">
                    {t('codePane.loading')}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <FileCode2 size={24} className="text-zinc-700" />
                <div className="text-sm font-medium text-zinc-300">{t('codePane.noOpenFile')}</div>
                <div className="max-w-md text-xs text-zinc-500">{t('codePane.noOpenFileHint')}</div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950/80 px-3 py-2 text-[11px] text-zinc-500">
            <div className="flex min-w-0 items-center gap-3">
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
              <span>{activeStatusText}</span>
              <span>{viewMode === 'diff' ? t('codePane.diffView') : t('codePane.editorView')}</span>
              <span>{t('codePane.autoSave')}</span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

CodePane.displayName = 'CodePane';
