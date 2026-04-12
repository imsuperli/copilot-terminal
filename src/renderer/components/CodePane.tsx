import React, {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode2,
  Folder,
  FolderOpen,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import type { Pane } from '../types/window';
import type {
  CodePaneFsChangedPayload,
  CodePaneGitStatusEntry,
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
import { getPathLeafLabel } from '../utils/pathDisplay';

type MonacoModule = typeof import('monaco-editor');
type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type MonacoDiffEditor = import('monaco-editor').editor.IStandaloneDiffEditor;
type MonacoModel = import('monaco-editor').editor.ITextModel;
type MonacoDisposable = import('monaco-editor').IDisposable;
type MonacoViewState = import('monaco-editor').editor.ICodeEditorViewState | null;

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
};

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

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const normalizedParentPath = normalizePath(parentPath);
  const normalizedCandidatePath = normalizePath(candidatePath);
  return normalizedCandidatePath === normalizedParentPath
    || normalizedCandidatePath.startsWith(`${normalizedParentPath}/`);
}

function createEmptySet(): Set<string> {
  return new Set<string>();
}

function createTabList(existingTabs: Array<{ path: string; pinned?: boolean }>, filePath: string) {
  const existingTab = existingTabs.find((tab) => tab.path === filePath);
  if (existingTab) {
    return existingTabs;
  }

  return [...existingTabs, { path: filePath }];
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
  const paneRef = useRef(pane);
  const rootPath = pane.code?.rootPath ?? pane.cwd;
  const openFiles = pane.code?.openFiles ?? [];
  const activeFilePath = pane.code?.activeFilePath ?? null;
  const selectedPath = pane.code?.selectedPath ?? null;
  const viewMode = pane.code?.viewMode ?? 'editor';
  const diffTargetPath = pane.code?.diffTargetPath ?? null;

  const monacoRef = useRef<MonacoModule | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const diffEditorRef = useRef<MonacoDiffEditor | null>(null);
  const fileModelsRef = useRef(new Map<string, MonacoModel>());
  const diffModelsRef = useRef(new Map<string, MonacoModel>());
  const modelDisposersRef = useRef(new Map<string, MonacoDisposable>());
  const fileMetaRef = useRef(new Map<string, FileRuntimeMeta>());
  const viewStatesRef = useRef(new Map<string, MonacoViewState>());
  const autoSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const suppressModelEventsRef = useRef(new Set<string>());

  const [treeEntriesByDirectory, setTreeEntriesByDirectory] = useState<Record<string, CodePaneTreeEntry[]>>({});
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set([rootPath]));
  const [loadedDirectories, setLoadedDirectories] = useState<Set<string>>(() => new Set());
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set([rootPath]));
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(createEmptySet);
  const [savingPaths, setSavingPaths] = useState<Set<string>>(createEmptySet);
  const [gitStatusByPath, setGitStatusByPath] = useState<Record<string, CodePaneGitStatusEntry>>({});
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [treeLoadError, setTreeLoadError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const expandedDirectoriesRef = useRef(expandedDirectories);
  const loadedDirectoriesRef = useRef(loadedDirectories);
  const dirtyPathsRef = useRef(dirtyPaths);
  const savingPathsRef = useRef(savingPaths);
  const activeFilePathRef = useRef(activeFilePath);

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
    const currentCodeState = paneRef.current.code ?? {
      rootPath,
      openFiles: [],
      activeFilePath: null,
      selectedPath: null,
      viewMode: 'editor' as const,
      diffTargetPath: null,
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

  const loadDirectory = useCallback(async (directoryPath: string) => {
    setLoadingDirectories((currentLoadingDirectories) => {
      const nextLoadingDirectories = new Set(currentLoadingDirectories);
      nextLoadingDirectories.add(directoryPath);
      return nextLoadingDirectories;
    });

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

    setLoadingDirectories((currentLoadingDirectories) => {
      const nextLoadingDirectories = new Set(currentLoadingDirectories);
      nextLoadingDirectories.delete(directoryPath);
      return nextLoadingDirectories;
    });
  }, [rootPath, t]);

  const createOrUpdateModel = useCallback((filePath: string, readResult: CodePaneReadFileResult) => {
    const monaco = monacoRef.current;
    if (!monaco) {
      return null;
    }

    let model = fileModelsRef.current.get(filePath);
    if (!model) {
      model = monaco.editor.createModel(readResult.content, readResult.language, monaco.Uri.file(filePath));
      const disposable = model.onDidChangeContent(() => {
        if (suppressModelEventsRef.current.has(filePath)) {
          return;
        }

        markDirty(filePath, true);
        const existingTimer = autoSaveTimersRef.current.get(filePath);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

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
    });

    markDirty(filePath, false);
    clearBannerForFile(filePath);
    return model;
  }, [clearBannerForFile, markDirty]);

  const loadFileIntoModel = useCallback(async (filePath: string) => {
    if (!monacoRef.current && supportsMonaco) {
      monacoRef.current = await ensureMonacoEnvironment();
    }

    const response = await window.electronAPI.codePaneReadFile({
      rootPath,
      filePath,
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
  }, [createOrUpdateModel, rootPath, supportsMonaco, t]);

  const refreshEditorSurface = useCallback(async () => {
    const hostElement = editorHostRef.current;
    if (!hostElement) {
      return;
    }

    const monaco = await ensureMonacoEnvironment();
    monacoRef.current = monaco;
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
      }

      diffEditorRef.current.setModel({
        original: diffModel,
        modified: model,
      });

      const savedViewState = viewStatesRef.current.get(currentActiveFilePath);
      if (savedViewState) {
        diffEditorRef.current.getModifiedEditor().restoreViewState(savedViewState);
      }

      if (isActive) {
        diffEditorRef.current.getModifiedEditor().focus();
      }
      return;
    }

    diffEditorRef.current?.dispose();
    diffEditorRef.current = null;

    if (!editorRef.current) {
      editorRef.current = monaco.editor.create(hostElement, {
        automaticLayout: true,
        minimap: { enabled: false },
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
    }

    editorRef.current.setModel(model);

    const savedViewState = viewStatesRef.current.get(currentActiveFilePath);
    if (savedViewState) {
      editorRef.current.restoreViewState(savedViewState);
    }

    if (isActive) {
      editorRef.current.focus();
    }
  }, [disposeEditors, isActive, saveCurrentViewState, viewMode]);

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

    if (!dirtyPathsRef.current.has(filePath) && !options?.overwrite) {
      return true;
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
    void refreshGitStatus();
    return true;
  }, [clearBannerForFile, markDirty, markSaving, refreshGitStatus, rootPath, t]);

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

    const nextTabs = options?.preserveTabs
      ? openFiles
      : createTabList(openFiles, filePath);

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
      monacoRef.current = await ensureMonacoEnvironment();
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
  }, [clearBannerForFile, gitStatusByPath, rootPath, supportsMonaco, t]);

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

    const nextOpenFiles = openFiles.filter((tab) => tab.path !== filePath);
    const nextActiveFilePath = activeFilePath === filePath
      ? nextOpenFiles[nextOpenFiles.length - 1]?.path ?? null
      : activeFilePath;

    persistCodeState({
      openFiles: nextOpenFiles,
      activeFilePath: nextActiveFilePath,
      selectedPath: nextActiveFilePath ?? selectedPath,
      viewMode: 'editor',
      diffTargetPath: null,
    });
  }, [activeFilePath, clearBannerForFile, flushDirtyFiles, markDirty, openFiles, persistCodeState, selectedPath]);

  const toggleDirectory = useCallback((directoryPath: string) => {
    persistCodeState({
      selectedPath: directoryPath,
    });

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

  const refreshLoadedDirectories = useCallback(async () => {
    const directoriesToRefresh = Array.from(new Set([rootPath, ...loadedDirectoriesRef.current]));
    await Promise.all(directoriesToRefresh.map((directoryPath) => loadDirectory(directoryPath)));
    await refreshGitStatus();
  }, [loadDirectory, refreshGitStatus, rootPath]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      setBanner(null);
      setTreeLoadError(null);
      setSearchError(null);
      setTreeEntriesByDirectory({});
      setExpandedDirectories(new Set([rootPath]));
      setLoadedDirectories(new Set());
      setLoadingDirectories(new Set([rootPath]));
      setSearchResults([]);
      disposeEditors();
      disposeAllModels();

      try {
        if (supportsMonaco) {
          monacoRef.current = await ensureMonacoEnvironment();
          if (!mounted) {
            return;
          }
        }

        await Promise.all([
          loadDirectory(rootPath),
          refreshGitStatus(),
          window.electronAPI.codePaneWatchRoot({
            paneId: pane.id,
            rootPath,
          }),
        ]);
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
          void reloadFileFromDisk(change.path);
        }
      }

      void refreshLoadedDirectories();
    };

    window.electronAPI.onCodePaneFsChanged(handleFsChanged);

    return () => {
      mounted = false;
      window.electronAPI.offCodePaneFsChanged(handleFsChanged);
      void window.electronAPI.codePaneUnwatchRoot(pane.id);
      void flushDirtyFiles().finally(() => {
        disposeEditors();
        disposeAllModels();
      });
    };
  }, [disposeAllModels, disposeEditors, flushDirtyFiles, loadDirectory, pane.id, refreshGitStatus, refreshLoadedDirectories, reloadFileFromDisk, rootPath, supportsMonaco, t]);

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

  const activeTabStatus = activeFilePath ? getEntryStatus(activeFilePath, 'file') : undefined;
  const activeStatusText = activeFilePath
    ? savingPaths.has(activeFilePath)
      ? t('codePane.saving')
      : dirtyPaths.has(activeFilePath)
        ? t('codePane.unsaved')
        : t('codePane.saved')
    : t('codePane.autoSave');
  const statusTone = getStatusTone(activeTabStatus);
  const sidebarEntries = treeEntriesByDirectory[rootPath] ?? [];

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
          {isDirectory && isExpanded && renderTree(entry.path, depth + 1)}
        </React.Fragment>
      );
    });
  }, [activateFile, expandedDirectories, getEntryStatus, loadingDirectories, selectedPath, toggleDirectory, treeEntriesByDirectory]);

  const renderedSearchResults = useMemo(() => searchResults.map((filePath) => {
    const entryStatus = getEntryStatus(filePath, 'file');
    const badge = getStatusTone(entryStatus);
    return (
      <button
        key={filePath}
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
    );
  }), [activateFile, getEntryStatus, rootPath, searchResults, selectedPath]);

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
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border ${isActive ? 'border-[rgb(var(--primary))]/45' : 'border-zinc-800'} bg-zinc-950`}
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
                renderTree(rootPath, 0)
              ) : (
                <div className="px-2 text-xs text-zinc-500">{t('codePane.emptyFolder')}</div>
              )}
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-[34px] items-stretch overflow-x-auto border-b border-zinc-800 bg-zinc-950/70">
            {openFiles.length > 0 ? openFiles.map((tab) => {
              const isTabActive = tab.path === activeFilePath;
              const isTabDirty = dirtyPaths.has(tab.path);
              const tabStatus = getEntryStatus(tab.path, 'file');
              const badge = getStatusTone(tabStatus);

              return (
                <div
                  key={tab.path}
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
                    <span className="truncate">{getPathLeafLabel(tab.path)}</span>
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
                {activeFilePath ? getRelativePath(rootPath, activeFilePath) : t('codePane.autoSave')}
              </span>
              {statusTone && (
                <span className={`rounded px-1.5 py-0.5 font-medium ${statusTone.className}`}>
                  {statusTone.badge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
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
