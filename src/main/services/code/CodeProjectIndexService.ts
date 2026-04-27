import { createHash } from 'crypto';
import { promises as fsPromises } from 'fs';
import path from 'path';
import type {
  CodePaneIndexProgressPayload,
  CodePaneListDirectoryConfig,
  CodePaneSearchFilesConfig,
  CodePaneTreeEntry,
} from '../../../shared/types/electron-api';
import { PathValidator } from '../../utils/pathValidator';
import {
  CODE_PANE_INDEX_IGNORE_SIGNATURE,
  CODE_PANE_INDEX_SCHEMA_VERSION,
  isIgnoredCodePanePath,
  shouldIgnoreCodePaneDirectory,
} from './codePaneFsConstants';

type ProjectType = 'directory';

type DirectorySignature = {
  mtimeMs: number;
  ctimeMs: number;
};

type PersistedDirectoryEntry = {
  relativePath: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  mtimeMs?: number;
  hasChildren?: boolean;
};

type PersistedDirectoryRecord = DirectorySignature & {
  entries: PersistedDirectoryEntry[];
};

type PersistedProjectIndex = {
  schemaVersion: number;
  ignoreSignature: string;
  files: string[];
  directories: Record<string, PersistedDirectoryRecord>;
};

type PersistedProjectManifest = {
  schemaVersion: number;
  ignoreSignature: string;
  projectId: string;
  projectType: ProjectType;
  projectRootPath: string;
  projectRootRealPath: string;
  directoryCount: number;
  fileCount: number;
  lastWarmupFinishedAt: string | null;
};

type ProjectIdentity = {
  projectId: string;
  projectType: ProjectType;
  projectRootPath: string;
  projectRootRealPath: string;
};

export type CodeProjectIndexChange = {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
};

type ProjectIndexState = ProjectIdentity & {
  data: PersistedProjectIndex;
  workspaceTracked: boolean;
  paneConsumers: Set<string>;
  watcher: any | null;
  pendingChanges: CodeProjectIndexChange[];
  flushTimer: NodeJS.Timeout | null;
  persistTimer: NodeJS.Timeout | null;
  warmupPromise: Promise<void> | null;
  queue: Promise<void>;
  lastWarmupFinishedAt: string | null;
  progress: ProjectIndexProgressState | null;
  lastProgressEventAt: number;
};

type LoadedPersistedProjectState = {
  data: PersistedProjectIndex;
  lastWarmupFinishedAt: string | null;
};

type ProjectIndexProgressState = Omit<CodePaneIndexProgressPayload, 'paneId' | 'rootPath'>;

type ScanProjectTreeResult = {
  directories: Record<string, PersistedDirectoryRecord>;
  files: string[];
};

let chokidarModule: any = null;
let chokidarPromise: Promise<any> | null = null;

async function getChokidar() {
  if (chokidarModule) {
    return chokidarModule;
  }

  if (chokidarPromise) {
    return chokidarPromise;
  }

  chokidarPromise = (0, eval)("import('chokidar')").then((module: any) => {
    chokidarModule = module.default || module;
    return chokidarModule;
  });

  return chokidarPromise;
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const relativePath = path.relative(basePath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath === '.' ? '' : relativePath.split(path.sep).join('/');
}

function fromProjectRelativePath(projectRootPath: string, relativePath: string): string {
  return relativePath
    ? path.join(projectRootPath, ...relativePath.split('/'))
    : projectRootPath;
}

function toProjectRelativePath(projectRootPath: string, absolutePath: string): string {
  return normalizeRelativePath(path.relative(projectRootPath, absolutePath));
}

function compareTreeEntries(left: PersistedDirectoryEntry, right: PersistedDirectoryEntry): number {
  if (left.type !== right.type) {
    return left.type === 'directory' ? -1 : 1;
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function compareSearchResults(rootPath: string, leftPath: string, rightPath: string, query: string): number {
  const getSearchTuple = (filePath: string) => {
    const relativePath = path.relative(rootPath, filePath).toLowerCase();
    const baseName = path.basename(filePath).toLowerCase();
    const extension = path.extname(baseName);
    const stem = extension ? baseName.slice(0, -extension.length) : baseName;
    const baseIndex = baseName.indexOf(query);
    const relativeIndex = relativePath.indexOf(query);
    const depth = relativePath.split(path.sep).length - 1;

    const tuple = [
      baseName === query ? 0 : 1,
      stem === query ? 0 : 1,
      stem.startsWith(query) ? 0 : 1,
      baseName.startsWith(query) ? 0 : 1,
      baseIndex === -1 ? Number.MAX_SAFE_INTEGER : baseIndex,
      relativeIndex === -1 ? Number.MAX_SAFE_INTEGER : relativeIndex,
      depth,
      baseName.length,
      relativePath.length,
    ] as const;

    return {
      relativePath,
      tuple,
    };
  };

  const leftSearchData = getSearchTuple(leftPath);
  const rightSearchData = getSearchTuple(rightPath);
  const leftTuple = leftSearchData.tuple;
  const rightTuple = rightSearchData.tuple;
  for (let index = 0; index < leftTuple.length - 1; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) {
      return Number(leftTuple[index]) - Number(rightTuple[index]);
    }
  }

  return leftSearchData.relativePath.localeCompare(
    rightSearchData.relativePath,
    undefined,
    { sensitivity: 'base' },
  );
}

function getClampedLimit(limit: number | undefined, fallbackLimit: number): number {
  return Math.max(1, Math.min(limit ?? fallbackLimit, 500));
}

function shouldIncludeHiddenPath(relativePath: string): boolean {
  if (!relativePath) {
    return true;
  }

  return !relativePath.split('/').some((segment) => segment.startsWith('.'));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf-8');
  await fsPromises.rename(tempPath, filePath);
}

export class CodeProjectIndexService {
  private readonly projectStates = new Map<string, ProjectIndexState>();
  private readonly paneToProjectId = new Map<string, string>();

  constructor(
    private readonly indexRootPath: string,
    private readonly emitProgressEvent?: (payload: CodePaneIndexProgressPayload) => void,
    private readonly options: {
      enableWatcher?: boolean;
    } = {},
  ) {}

  async syncWorkspaceProjects(projectRoots: string[]): Promise<void> {
    const desiredProjectIds = new Set<string>();
    const uniqueProjectRoots = Array.from(new Set(projectRoots));

    for (const projectRoot of uniqueProjectRoots) {
      try {
        const state = await this.ensureProjectState(projectRoot);
        desiredProjectIds.add(state.projectId);
        state.workspaceTracked = true;
      } catch {
        // Ignore invalid workspace roots and continue indexing other projects.
      }
    }

    for (const state of this.projectStates.values()) {
      if (desiredProjectIds.has(state.projectId)) {
        continue;
      }

      state.workspaceTracked = false;
      await this.stopWatcherIfUnused(state);
    }
  }

  async watchProjectForPane(paneId: string, rootPath: string): Promise<void> {
    const previousProjectId = this.paneToProjectId.get(paneId);
    if (previousProjectId) {
      await this.unwatchProjectForPane(paneId);
    }

    const state = await this.ensureProjectState(rootPath);
    state.paneConsumers.add(paneId);
    this.paneToProjectId.set(paneId, state.projectId);
    if (state.progress) {
      this.emitProgressToPanes(state, [paneId], state.progress);
    }
    if (this.options.enableWatcher !== false) {
      await this.ensureWatcher(state);
    }

    if (state.lastWarmupFinishedAt) {
      this.publishProgress(state, this.createReadyProgress(state, true), [paneId], true);
      return;
    }

    this.scheduleWarmup(state);
  }

  async unwatchProjectForPane(paneId: string): Promise<void> {
    const projectId = this.paneToProjectId.get(paneId);
    if (!projectId) {
      return;
    }

    this.paneToProjectId.delete(paneId);
    const state = this.projectStates.get(projectId);
    if (!state) {
      return;
    }

    state.paneConsumers.delete(paneId);
    await this.stopWatcherIfUnused(state);
  }

  async listDirectory(config: CodePaneListDirectoryConfig): Promise<CodePaneTreeEntry[]> {
    const paneRootInfo = await this.resolvePaneRoot(config.rootPath);
    const targetPath = config.targetPath ?? paneRootInfo.rootPath;
    const absoluteTargetPath = await this.resolveExistingDirectoryPath(paneRootInfo, targetPath);
    const state = await this.ensureProjectState(paneRootInfo.rootPath);
    const directoryRelativePath = toProjectRelativePath(state.projectRootPath, absoluteTargetPath);
    const directorySignature = await this.readDirectorySignature(absoluteTargetPath);
    const cachedDirectory = state.data.directories[directoryRelativePath];

    if (
      cachedDirectory
      && cachedDirectory.mtimeMs === directorySignature.mtimeMs
      && cachedDirectory.ctimeMs === directorySignature.ctimeMs
    ) {
      return this.materializeDirectoryEntries(
        state.projectRootPath,
        cachedDirectory.entries,
        config.includeHidden ?? false,
      );
    }

    const scannedDirectory = await this.enqueueStateTask(state, async () => {
      const nextDirectory = await this.scanSingleDirectory(state.projectRootPath, directoryRelativePath);
      state.data.directories[directoryRelativePath] = nextDirectory;
      this.schedulePersist(state);
      return nextDirectory;
    });

    return this.materializeDirectoryEntries(
      state.projectRootPath,
      scannedDirectory.entries,
      config.includeHidden ?? false,
    );
  }

  async searchFiles(config: CodePaneSearchFilesConfig): Promise<string[]> {
    const paneRootInfo = await this.resolvePaneRoot(config.rootPath);
    const state = await this.ensureProjectState(paneRootInfo.rootPath);
    const query = config.query.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const rootRelativePrefix = toProjectRelativePath(state.projectRootPath, paneRootInfo.rootPath);
    const normalizedPrefix = rootRelativePrefix ? `${rootRelativePrefix}/` : '';
    const limit = getClampedLimit(config.limit, 100);
    const absoluteMatches = state.data.files
      .filter((relativePath) => {
        if (!shouldIncludeHiddenPath(relativePath)) {
          return false;
        }

        if (normalizedPrefix && relativePath !== rootRelativePrefix && !relativePath.startsWith(normalizedPrefix)) {
          return false;
        }

        const absolutePath = fromProjectRelativePath(state.projectRootPath, relativePath);
        const relativeToPaneRoot = path.relative(paneRootInfo.rootPath, absolutePath).toLowerCase();
        return path.basename(absolutePath).toLowerCase().includes(query) || relativeToPaneRoot.includes(query);
      })
      .map((relativePath) => fromProjectRelativePath(state.projectRootPath, relativePath))
      .sort((left, right) => compareSearchResults(paneRootInfo.rootPath, left, right, query))
      .slice(0, limit);

    if (absoluteMatches.length > 0 || state.data.files.length > 0 || state.lastWarmupFinishedAt) {
      return absoluteMatches;
    }

    return this.searchFilesLive(paneRootInfo.rootPath, query, limit);
  }

  async notifyChanges(rootPath: string, changes: CodeProjectIndexChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }

    const state = await this.ensureProjectState(rootPath);
    for (const change of changes) {
      state.pendingChanges.push({
        type: change.type,
        path: path.resolve(change.path),
      });
    }

    if (state.flushTimer) {
      return;
    }

    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      void this.enqueueStateTask(state, async () => {
        const pendingChanges = state.pendingChanges.splice(0, state.pendingChanges.length);
        if (pendingChanges.length === 0) {
          return;
        }

        await this.applyChanges(state, pendingChanges);
        this.schedulePersist(state);
      });
    }, 150);
  }

  async waitForIdle(rootPath: string): Promise<void> {
    const state = await this.ensureProjectState(rootPath);
    if (state.warmupPromise) {
      await state.warmupPromise;
    }

    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
      await this.enqueueStateTask(state, async () => {
        const pendingChanges = state.pendingChanges.splice(0, state.pendingChanges.length);
        if (pendingChanges.length === 0) {
          return;
        }

        await this.applyChanges(state, pendingChanges);
        this.schedulePersist(state);
      });
    }

    await state.queue;

    if (state.persistTimer) {
      clearTimeout(state.persistTimer);
      state.persistTimer = null;
      await this.persistState(state);
    }
  }

  async destroy(): Promise<void> {
    const states = Array.from(this.projectStates.values());
    this.paneToProjectId.clear();

    await Promise.all(states.map(async (state) => {
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
      }
      if (state.persistTimer) {
        clearTimeout(state.persistTimer);
        state.persistTimer = null;
        await this.persistState(state);
      }
      if (state.watcher) {
        await state.watcher.close();
      }
    }));

    this.projectStates.clear();
  }

  private async ensureProjectState(rootPath: string): Promise<ProjectIndexState> {
    const paneRootInfo = await this.resolvePaneRoot(rootPath);

    for (const state of this.projectStates.values()) {
      if (state.projectRootPath === paneRootInfo.rootPath) {
        return state;
      }
    }

    const identity = await this.resolveProjectIdentity(paneRootInfo.rootPath);
    const existingState = this.projectStates.get(identity.projectId);
    if (existingState) {
      return existingState;
    }

    const loadedState = await this.loadPersistedState(identity);
    const state: ProjectIndexState = {
      ...identity,
      data: loadedState?.data ?? {
        schemaVersion: CODE_PANE_INDEX_SCHEMA_VERSION,
        ignoreSignature: CODE_PANE_INDEX_IGNORE_SIGNATURE,
        files: [],
        directories: {},
      },
      workspaceTracked: false,
      paneConsumers: new Set<string>(),
      watcher: null,
      pendingChanges: [],
      flushTimer: null,
      persistTimer: null,
      warmupPromise: null,
      queue: Promise.resolve(),
      lastWarmupFinishedAt: loadedState?.lastWarmupFinishedAt ?? null,
      progress: loadedState?.lastWarmupFinishedAt
        ? {
          state: 'ready',
          processedDirectoryCount: Object.keys(loadedState.data.directories).length,
          totalDirectoryCount: Object.keys(loadedState.data.directories).length,
          indexedFileCount: loadedState.data.files.length,
          reusedPersistedIndex: true,
        }
        : null,
      lastProgressEventAt: 0,
    };

    this.projectStates.set(state.projectId, state);
    return state;
  }

  private async resolveProjectIdentity(rootPath: string): Promise<ProjectIdentity> {
    const projectType: ProjectType = 'directory';
    const projectRootPath = rootPath;
    const projectRootRealPath = await fsPromises.realpath(projectRootPath);
    const projectId = createHash('sha1')
      .update(`${projectType}:${projectRootRealPath}`)
      .digest('hex');

    return {
      projectId,
      projectType,
      projectRootPath,
      projectRootRealPath,
    };
  }

  private async loadPersistedState(identity: ProjectIdentity): Promise<LoadedPersistedProjectState | null> {
    const manifestPath = this.getManifestPath(identity.projectId);
    const indexPath = this.getIndexPath(identity.projectId);

    try {
      const [manifestContent, indexContent] = await Promise.all([
        fsPromises.readFile(manifestPath, 'utf-8'),
        fsPromises.readFile(indexPath, 'utf-8'),
      ]);
      const manifest = JSON.parse(manifestContent) as PersistedProjectManifest;
      const persistedIndex = JSON.parse(indexContent) as PersistedProjectIndex;

      if (manifest.schemaVersion !== CODE_PANE_INDEX_SCHEMA_VERSION) {
        return null;
      }

      if (manifest.ignoreSignature !== CODE_PANE_INDEX_IGNORE_SIGNATURE) {
        return null;
      }

      if (manifest.projectRootRealPath !== identity.projectRootRealPath) {
        return null;
      }

      if (persistedIndex.schemaVersion !== CODE_PANE_INDEX_SCHEMA_VERSION) {
        return null;
      }

      if (persistedIndex.ignoreSignature !== CODE_PANE_INDEX_IGNORE_SIGNATURE) {
        return null;
      }

      return {
        data: persistedIndex,
        lastWarmupFinishedAt: manifest.lastWarmupFinishedAt,
      };
    } catch {
      return null;
    }
  }

  private scheduleWarmup(state: ProjectIndexState): void {
    if (state.warmupPromise) {
      return;
    }

    this.publishProgress(state, {
      state: 'building',
      processedDirectoryCount: 0,
      totalDirectoryCount: 1,
      indexedFileCount: state.data.files.length,
      reusedPersistedIndex: false,
    }, undefined, true);

    state.warmupPromise = this.enqueueStateTask(state, async () => {
      try {
        const scannedProject = await this.scanProjectTree(state.projectRootPath, '', (progress) => {
          this.publishProgress(state, {
            state: 'building',
            processedDirectoryCount: progress.processedDirectoryCount,
            totalDirectoryCount: progress.totalDirectoryCount,
            indexedFileCount: progress.indexedFileCount,
            reusedPersistedIndex: false,
          }, undefined, progress.done);
        });
        state.data = {
          schemaVersion: CODE_PANE_INDEX_SCHEMA_VERSION,
          ignoreSignature: CODE_PANE_INDEX_IGNORE_SIGNATURE,
          files: scannedProject.files.sort((left, right) => (
            left.localeCompare(right, undefined, { sensitivity: 'base' })
          )),
          directories: scannedProject.directories,
        };
        state.lastWarmupFinishedAt = new Date().toISOString();
        this.publishProgress(state, this.createReadyProgress(state, false), undefined, true);
        this.schedulePersist(state);
      } catch (error) {
        this.publishProgress(state, {
          state: 'error',
          processedDirectoryCount: 0,
          totalDirectoryCount: 0,
          indexedFileCount: state.data.files.length,
          reusedPersistedIndex: false,
          error: error instanceof Error ? error.message : String(error),
        }, undefined, true);
        throw error;
      }
    }).finally(() => {
      state.warmupPromise = null;
    });
  }

  private async ensureWatcher(state: ProjectIndexState): Promise<void> {
    if (state.watcher) {
      return;
    }

    const chokidar = await getChokidar();
    const watcher = chokidar.watch(state.projectRootPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
      ignored: (target: string) => {
        return isIgnoredCodePanePath(state.projectRootPath, target);
      },
    });

    watcher
      .on('add', (changedPath: string) => {
        void this.notifyChanges(state.projectRootPath, [{ type: 'add', path: changedPath }]);
      })
      .on('change', (changedPath: string) => {
        void this.notifyChanges(state.projectRootPath, [{ type: 'change', path: changedPath }]);
      })
      .on('unlink', (changedPath: string) => {
        void this.notifyChanges(state.projectRootPath, [{ type: 'unlink', path: changedPath }]);
      })
      .on('addDir', (changedPath: string) => {
        void this.notifyChanges(state.projectRootPath, [{ type: 'addDir', path: changedPath }]);
      })
      .on('unlinkDir', (changedPath: string) => {
        void this.notifyChanges(state.projectRootPath, [{ type: 'unlinkDir', path: changedPath }]);
      })
      .on('error', () => {
        this.scheduleWarmup(state);
      });

    state.watcher = watcher;
  }

  private async stopWatcherIfUnused(state: ProjectIndexState): Promise<void> {
    if (state.workspaceTracked || state.paneConsumers.size > 0) {
      return;
    }

    if (!state.watcher) {
      return;
    }

    const watcher = state.watcher;
    state.watcher = null;
    await watcher.close();
  }

  private async applyChanges(state: ProjectIndexState, changes: CodeProjectIndexChange[]): Promise<void> {
    const directoriesToRefresh = new Set<string>();
    const subtreesToRescan = new Set<string>();

    for (const change of changes) {
      const absolutePath = path.resolve(change.path);
      if (!isPathWithin(state.projectRootPath, absolutePath)) {
        continue;
      }

      const relativePath = toProjectRelativePath(state.projectRootPath, absolutePath);

      switch (change.type) {
        case 'addDir':
          directoriesToRefresh.add(normalizeRelativePath(path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath)));
          subtreesToRescan.add(relativePath);
          break;
        case 'unlinkDir':
          directoriesToRefresh.add(normalizeRelativePath(path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath)));
          this.removeDirectorySubtree(state, relativePath);
          break;
        case 'add':
          directoriesToRefresh.add(normalizeRelativePath(path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath)));
          this.addFileToIndex(state, relativePath);
          break;
        case 'unlink':
          directoriesToRefresh.add(normalizeRelativePath(path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath)));
          this.removeFileFromIndex(state, relativePath);
          break;
        case 'change':
          directoriesToRefresh.add(normalizeRelativePath(path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath)));
          break;
      }
    }

    for (const subtreeRelativePath of subtreesToRescan) {
      const scannedSubtree = await this.scanProjectTree(
        state.projectRootPath,
        subtreeRelativePath,
      );
      this.removeDirectorySubtree(state, subtreeRelativePath);
      Object.assign(state.data.directories, scannedSubtree.directories);
      for (const relativeFilePath of scannedSubtree.files) {
        this.addFileToIndex(state, relativeFilePath);
      }
    }

    for (const directoryRelativePath of directoriesToRefresh) {
      const absoluteDirectoryPath = fromProjectRelativePath(state.projectRootPath, directoryRelativePath);
      try {
        const refreshedDirectory = await this.scanSingleDirectory(state.projectRootPath, directoryRelativePath);
        state.data.directories[directoryRelativePath] = refreshedDirectory;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          delete state.data.directories[directoryRelativePath];
        }
      }
    }
  }

  private addFileToIndex(state: ProjectIndexState, relativePath: string): void {
    if (!state.data.files.includes(relativePath)) {
      state.data.files.push(relativePath);
      state.data.files.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
    }
  }

  private removeFileFromIndex(state: ProjectIndexState, relativePath: string): void {
    state.data.files = state.data.files.filter((filePath) => filePath !== relativePath);
  }

  private removeDirectorySubtree(state: ProjectIndexState, directoryRelativePath: string): void {
    const normalizedPrefix = directoryRelativePath ? `${directoryRelativePath}/` : '';
    state.data.files = state.data.files.filter((filePath) => (
      filePath !== directoryRelativePath && !filePath.startsWith(normalizedPrefix)
    ));

    for (const knownDirectoryPath of Object.keys(state.data.directories)) {
      if (
        knownDirectoryPath === directoryRelativePath
        || (normalizedPrefix && knownDirectoryPath.startsWith(normalizedPrefix))
      ) {
        delete state.data.directories[knownDirectoryPath];
      }
    }
  }

  private schedulePersist(state: ProjectIndexState): void {
    if (state.persistTimer) {
      return;
    }

    state.persistTimer = setTimeout(() => {
      state.persistTimer = null;
      void this.persistState(state);
    }, 250);
  }

  private async persistState(state: ProjectIndexState): Promise<void> {
    const manifestPath = this.getManifestPath(state.projectId);
    const indexPath = this.getIndexPath(state.projectId);
    const manifest: PersistedProjectManifest = {
      schemaVersion: CODE_PANE_INDEX_SCHEMA_VERSION,
      ignoreSignature: CODE_PANE_INDEX_IGNORE_SIGNATURE,
      projectId: state.projectId,
      projectType: state.projectType,
      projectRootPath: state.projectRootPath,
      projectRootRealPath: state.projectRootRealPath,
      directoryCount: Object.keys(state.data.directories).length,
      fileCount: state.data.files.length,
      lastWarmupFinishedAt: state.lastWarmupFinishedAt,
    };

    await Promise.all([
      writeJsonAtomic(manifestPath, manifest),
      writeJsonAtomic(indexPath, state.data),
    ]);
  }

  private async scanProjectTree(
    projectRootPath: string,
    startRelativePath = '',
    onProgress?: (progress: {
      processedDirectoryCount: number;
      totalDirectoryCount: number;
      indexedFileCount: number;
      done: boolean;
    }) => void,
  ): Promise<ScanProjectTreeResult> {
    const directories: Record<string, PersistedDirectoryRecord> = {};
    const files: string[] = [];
    const directoriesToScan = [startRelativePath];
    let processedDirectoryCount = 0;
    let lastProgressReportedAt = 0;

    while (directoriesToScan.length > 0) {
      const directoryRelativePath = directoriesToScan.pop() ?? '';
      let directoryRecord: PersistedDirectoryRecord;
      try {
        directoryRecord = await this.scanSingleDirectory(projectRootPath, directoryRelativePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw error;
      }
      directories[directoryRelativePath] = directoryRecord;
      processedDirectoryCount += 1;

      for (const entry of directoryRecord.entries) {
        if (entry.type === 'directory') {
          directoriesToScan.push(entry.relativePath);
        } else {
          files.push(entry.relativePath);
        }
      }

      if (onProgress) {
        const now = Date.now();
        if (now - lastProgressReportedAt >= 120 || directoriesToScan.length === 0) {
          onProgress({
            processedDirectoryCount,
            totalDirectoryCount: processedDirectoryCount + directoriesToScan.length,
            indexedFileCount: files.length,
            done: directoriesToScan.length === 0,
          });
          lastProgressReportedAt = now;
        }
      }
    }

    return { directories, files };
  }

  private async scanSingleDirectory(
    projectRootPath: string,
    directoryRelativePath: string,
  ): Promise<PersistedDirectoryRecord> {
    const absoluteDirectoryPath = fromProjectRelativePath(projectRootPath, directoryRelativePath);
    const directoryStats = await fsPromises.stat(absoluteDirectoryPath);
    const directoryEntries = await fsPromises.readdir(absoluteDirectoryPath, { withFileTypes: true });
    const entryStats = await Promise.all(directoryEntries.map(async (
      directoryEntry,
    ): Promise<PersistedDirectoryEntry | null> => {
      if (
        directoryEntry.isDirectory()
        && shouldIgnoreCodePaneDirectory(directoryEntry.name, path.join(absoluteDirectoryPath, directoryEntry.name))
      ) {
        return null;
      }

      if (directoryEntry.isSymbolicLink()) {
        return null;
      }

      if (!directoryEntry.isDirectory() && !directoryEntry.isFile()) {
        return null;
      }

      const entryAbsolutePath = path.join(absoluteDirectoryPath, directoryEntry.name);
      let stats: Awaited<ReturnType<typeof fsPromises.stat>>;
      try {
        stats = await fsPromises.stat(entryAbsolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
      const entryRelativePath = normalizeRelativePath(path.posix.join(directoryRelativePath, directoryEntry.name));

      return {
        relativePath: entryRelativePath,
        name: directoryEntry.name,
        type: directoryEntry.isDirectory() ? 'directory' as const : 'file' as const,
        size: directoryEntry.isFile() ? stats.size : undefined,
        mtimeMs: stats.mtimeMs,
        hasChildren: directoryEntry.isDirectory() ? true : undefined,
      };
    }));

    const entries = entryStats
      .filter((entry): entry is PersistedDirectoryEntry => entry !== null)
      .sort(compareTreeEntries);

    return {
      mtimeMs: directoryStats.mtimeMs,
      ctimeMs: directoryStats.ctimeMs,
      entries,
    };
  }

  private materializeDirectoryEntries(
    projectRootPath: string,
    entries: PersistedDirectoryEntry[],
    includeHidden: boolean,
  ): CodePaneTreeEntry[] {
    return entries
      .filter((entry) => includeHidden || !entry.name.startsWith('.'))
      .map((entry) => ({
        path: fromProjectRelativePath(projectRootPath, entry.relativePath),
        name: entry.name,
        type: entry.type,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        hasChildren: entry.hasChildren,
      }));
  }

  private async readDirectorySignature(directoryPath: string): Promise<DirectorySignature> {
    const stats = await fsPromises.stat(directoryPath);
    return {
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
    };
  }

  private async searchFilesLive(rootPath: string, query: string, limit: number): Promise<string[]> {
    const results: string[] = [];
    const stack: string[] = [rootPath];

    while (stack.length > 0 && results.length < limit) {
      const directoryPath = stack.pop();
      if (!directoryPath) {
        continue;
      }

      const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory() && shouldIgnoreCodePaneDirectory(entry.name, entryPath)) {
          continue;
        }

        if (entry.isSymbolicLink()) {
          continue;
        }

        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const relativePath = path.relative(rootPath, entryPath).toLowerCase();
        if (entry.name.toLowerCase().includes(query) || relativePath.includes(query)) {
          results.push(entryPath);
          if (results.length >= limit) {
            break;
          }
        }
      }
    }

    return results.sort((left, right) => compareSearchResults(rootPath, left, right, query));
  }

  private async resolvePaneRoot(rootPath: string): Promise<{ rootPath: string; rootRealPath: string }> {
    const expandedRootPath = path.resolve(PathValidator.expandHomePath(rootPath));
    const validation = PathValidator.validate(expandedRootPath);
    if (!validation.valid) {
      throw new Error(`Invalid code pane root path: ${validation.reason ?? 'unknown error'}`);
    }

    return {
      rootPath: expandedRootPath,
      rootRealPath: await fsPromises.realpath(expandedRootPath),
    };
  }

  private async resolveExistingDirectoryPath(
    paneRootInfo: { rootPath: string; rootRealPath: string },
    targetPath: string,
  ): Promise<string> {
    const resolvedPath = path.resolve(targetPath);
    if (!path.isAbsolute(targetPath) || !isPathWithin(paneRootInfo.rootPath, resolvedPath)) {
      throw new Error('Target path is outside the code pane root');
    }

    const stats = await fsPromises.lstat(resolvedPath);
    if (stats.isSymbolicLink()) {
      throw new Error('Symbolic links are not supported in the code pane');
    }

    if (!stats.isDirectory()) {
      throw new Error('Target path is not a directory');
    }

    const realPath = await fsPromises.realpath(resolvedPath);
    if (!isPathWithin(paneRootInfo.rootRealPath, realPath)) {
      throw new Error('Target path resolves outside the code pane root');
    }

    return resolvedPath;
  }

  private getProjectDirectoryPath(projectId: string): string {
    return path.join(this.indexRootPath, 'projects', projectId);
  }

  private getManifestPath(projectId: string): string {
    return path.join(this.getProjectDirectoryPath(projectId), 'manifest.json');
  }

  private getIndexPath(projectId: string): string {
    return path.join(this.getProjectDirectoryPath(projectId), 'index.json');
  }

  private createReadyProgress(
    state: ProjectIndexState,
    reusedPersistedIndex: boolean,
  ): ProjectIndexProgressState {
    const directoryCount = Object.keys(state.data.directories).length;
    return {
      state: 'ready',
      processedDirectoryCount: directoryCount,
      totalDirectoryCount: directoryCount,
      indexedFileCount: state.data.files.length,
      reusedPersistedIndex,
    };
  }

  private publishProgress(
    state: ProjectIndexState,
    progress: ProjectIndexProgressState,
    paneIds?: Iterable<string>,
    force = false,
  ): void {
    state.progress = progress;

    if (!this.emitProgressEvent) {
      return;
    }

    const now = Date.now();
    if (!force && now - state.lastProgressEventAt < 120) {
      return;
    }

    state.lastProgressEventAt = now;
    this.emitProgressToPanes(state, paneIds, progress);
  }

  private emitProgressToPanes(
    state: ProjectIndexState,
    paneIds: Iterable<string> | undefined,
    progress: ProjectIndexProgressState,
  ): void {
    if (!this.emitProgressEvent) {
      return;
    }

    for (const paneId of paneIds ?? state.paneConsumers) {
      this.emitProgressEvent({
        paneId,
        rootPath: state.projectRootPath,
        ...progress,
      });
    }
  }

  private enqueueStateTask<T>(state: ProjectIndexState, task: () => Promise<T>): Promise<T> {
    const nextTask = state.queue.then(task, task);
    state.queue = nextTask.then(() => undefined, () => undefined);
    return nextTask;
  }
}
