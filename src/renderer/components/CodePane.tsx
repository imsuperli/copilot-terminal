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
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  GitCompareArrows,
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
  CodePaneFsChangedPayload,
  CodePaneGitStatusEntry,
  CodePaneIndexProgressPayload,
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
type SidebarMode = 'files' | 'search' | 'scm' | 'problems';

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
  const rootPath = pane.code?.rootPath ?? pane.cwd;
  const openFiles = pane.code?.openFiles ?? [];
  const activeFilePath = pane.code?.activeFilePath ?? null;
  const selectedPath = pane.code?.selectedPath ?? null;
  const viewMode = pane.code?.viewMode ?? 'editor';
  const diffTargetPath = pane.code?.diffTargetPath ?? null;

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
  const diffEditorMouseDownListenerRef = useRef<MonacoDisposable | null>(null);

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
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files');
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
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [treeLoadError, setTreeLoadError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [contentSearchError, setContentSearchError] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<CodePaneIndexStatus | null>(null);

  const expandedDirectoriesRef = useRef(expandedDirectories);
  const loadedDirectoriesRef = useRef(loadedDirectories);
  const dirtyPathsRef = useRef(dirtyPaths);
  const savingPathsRef = useRef(savingPaths);
  const activeFilePathRef = useRef(activeFilePath);
  const pendingNavigationRef = useRef<FileNavigationLocation | null>(null);
  const openFileLocationRef = useRef<(location: FileNavigationLocation) => Promise<void>>(async () => {});

  useEffect(() => {
    paneRef.current = pane;
  }, [pane]);

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

  const persistCodeState = useCallback((updates: Partial<NonNullable<Pane['code']>>) => {
    const currentCodeState = {
      rootPath,
      openFiles: [],
      activeFilePath: null,
      selectedPath: null,
      expandedPaths: [rootPath],
      viewMode: 'editor' as const,
      diffTargetPath: null,
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
    diffEditorMouseDownListenerRef.current?.dispose();
    diffEditorMouseDownListenerRef.current = null;
    editorRef.current?.dispose();
    diffEditorRef.current?.dispose();
    editorRef.current = null;
    diffEditorRef.current = null;
  }, [saveCurrentViewState]);

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
    viewStatesRef.current.clear();
    setProblems([]);
  }, []);

  const refreshGitStatus = useCallback(async () => {
    const response = await window.electronAPI.codePaneGetGitStatus({ rootPath });
    if (!response.success) {
      return;
    }

    startTransition(() => {
      setGitStatusByPath(
        Object.fromEntries((response.data ?? []).map((entry) => [entry.path, entry])),
      );
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
  }, [clearBannerForFile, markDirty, refreshProblems, syncLanguageDocument]);

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
    const filePath = model?.uri.fsPath || model?.uri.path;
    if (!model || !filePath) {
      return;
    }

    const response = await window.electronAPI.codePaneGetDefinition({
      rootPath,
      filePath,
      language: model.getLanguageId(),
      position: {
        lineNumber,
        column,
      },
    });

    if (!response.success) {
      setBanner({
        tone: 'warning',
        message: response.error || t('common.retry'),
        filePath,
      });
      return;
    }

    const nextLocation = response.data?.[0];
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
  }, [rootPath, t]);

  const attachDefinitionClickNavigation = useCallback((
    editorInstance: MonacoEditor | null,
    target: 'editor' | 'diff',
  ) => {
    const listenerRef = target === 'editor'
      ? editorMouseDownListenerRef
      : diffEditorMouseDownListenerRef;

    listenerRef.current?.dispose();
    listenerRef.current = null;

    if (!editorInstance || typeof editorInstance.onMouseDown !== 'function') {
      return;
    }

    listenerRef.current = editorInstance.onMouseDown((event: any) => {
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
  }, [handleDefinitionClick, isMac]);

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
    void refreshGitStatus();
    return true;
  }, [clearBannerForFile, flushPendingLanguageSync, markDirty, markSaving, refreshGitStatus, rootPath, syncLanguageDocument, t]);

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
  }, [activeFilePath, clearBannerForFile, closeLanguageDocument, flushDirtyFiles, markDirty, openFiles, persistCodeState, selectedPath]);

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
      await refreshGitStatus();
    }
  }, [loadDirectory, refreshGitStatus]);

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

    window.electronAPI.onCodePaneFsChanged(handleFsChanged);
    window.electronAPI.onCodePaneIndexProgress(handleIndexProgress);

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
          refreshGitStatus(),
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
  }, [loadDirectory, pane.id, refreshGitStatus, rootPath, supportsMonaco, t]);

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
  const statusTone = getStatusTone(activeTabStatus);
  const sidebarEntries = treeEntriesByDirectory[rootPath] ?? [];
  const rootLabel = useMemo(() => getPathLeafLabel(rootPath) || rootPath, [rootPath]);
  const isRootExpanded = expandedDirectories.has(rootPath);
  const isRootSelected = selectedPath === rootPath;
  const rootBadge = getStatusTone(getEntryStatus(rootPath, 'directory'));
  const orderedOpenFiles = useMemo(() => sortOpenFilesByPinned(openFiles), [openFiles]);
  const contextMenuContentClassName = 'z-50 min-w-[180px] rounded border border-zinc-800 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur';
  const contextMenuItemClassName = 'flex items-center gap-2 rounded px-3 py-2 text-xs text-zinc-200 outline-none transition-colors focus:bg-zinc-800 data-[highlighted]:bg-zinc-800';

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

  return (
    <div
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
        <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/70">
          <div className="grid grid-cols-2 gap-px border-b border-zinc-800 bg-zinc-900/80 p-1">
            <button
              type="button"
              onClick={() => setSidebarMode('files')}
              className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${sidebarMode === 'files' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'}`}
            >
              <FileCode2 size={12} />
              {t('codePane.filesTab')}
            </button>
            <button
              type="button"
              onClick={() => setSidebarMode('search')}
              className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${sidebarMode === 'search' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'}`}
            >
              <Search size={12} />
              {t('codePane.searchTab')}
            </button>
            <button
              type="button"
              onClick={() => setSidebarMode('scm')}
              className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${sidebarMode === 'scm' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'}`}
            >
              <GitBranch size={12} />
              {t('codePane.scmTab')}
            </button>
            <button
              type="button"
              onClick={() => setSidebarMode('problems')}
              className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${sidebarMode === 'problems' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'}`}
            >
              <AlertTriangle size={12} />
              {t('codePane.problemsTab')}
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
                <div className="text-xs text-zinc-500">
                  {scmEntries.length > 0 ? t('codePane.sourceControlHint') : t('codePane.noChanges')}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                {scmEntries.length > 0 ? (
                  <div className="space-y-2">
                    {scmEntries.map((entry) => {
                      const badge = getStatusTone(entry.status);
                      return (
                        <div key={entry.path} className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
                          <div className="mb-2 flex items-center gap-2">
                            <FileIcon size={13} className="shrink-0 text-zinc-500" />
                            <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                              {getPathLeafLabel(entry.path)}
                            </span>
                            {badge && (
                              <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${badge.className}`}>
                                {badge.badge}
                              </span>
                            )}
                          </div>
                          <div className="mb-2 truncate text-[10px] text-zinc-500">
                            {getRelativePath(rootPath, entry.path)}
                          </div>
                          <div className="flex items-center gap-2">
                            {entry.status !== 'deleted' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void activateFile(entry.path);
                                  }}
                                  className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                                >
                                  {t('common.open')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void openDiffForFile(entry.path);
                                  }}
                                  className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 hover:text-zinc-50"
                                >
                                  {t('codePane.openDiff')}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">{t('codePane.noChanges')}</div>
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
              <span>{activeStatusText}</span>
              <span>{viewMode === 'diff' ? t('codePane.diffView') : t('codePane.editorView')}</span>
              <span>{t('codePane.autoSave')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

CodePane.displayName = 'CodePane';
