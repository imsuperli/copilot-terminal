import path from 'path';
import { BrowserWindow } from 'electron';
import { PathValidator } from '../../utils/pathValidator';
import { CODE_PANE_IGNORED_DIRECTORY_NAMES } from './codePaneFsConstants';

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

type WatchChange = {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
};

type WatcherInfo = {
  rootPath: string;
  watcher: any;
  paneIds: Set<string>;
  pendingChanges: WatchChange[];
  flushTimer: NodeJS.Timeout | null;
};

export class CodePaneWatcherService {
  private readonly rootWatchers = new Map<string, WatcherInfo>();
  private readonly paneToRoot = new Map<string, string>();

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly onChanges?: (rootPath: string, changes: WatchChange[]) => void | Promise<void>,
  ) {}

  async watchRoot(paneId: string, rootPath: string): Promise<void> {
    const normalizedRootPath = path.resolve(PathValidator.expandHomePath(rootPath));
    const validation = PathValidator.validate(normalizedRootPath);
    if (!validation.valid) {
      throw new Error(`Invalid code pane root path: ${validation.reason ?? 'unknown error'}`);
    }

    const existingRootPath = this.paneToRoot.get(paneId);
    if (existingRootPath && existingRootPath !== normalizedRootPath) {
      await this.unwatchRoot(paneId);
    } else if (existingRootPath === normalizedRootPath) {
      return;
    }

    let watcherInfo = this.rootWatchers.get(normalizedRootPath);
    if (!watcherInfo) {
      const chokidar = await getChokidar();
      const watcher = chokidar.watch(normalizedRootPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
        ignored: (target: string) => {
          const resolvedTargetPath = path.resolve(target);
          const relativePath = path.relative(normalizedRootPath, resolvedTargetPath);
          if (!relativePath || relativePath.startsWith('..')) {
            return false;
          }

          return relativePath.split(path.sep).some((segment) => CODE_PANE_IGNORED_DIRECTORY_NAMES.has(segment));
        },
      });

      watcherInfo = {
        rootPath: normalizedRootPath,
        watcher,
        paneIds: new Set<string>(),
        pendingChanges: [],
        flushTimer: null,
      };

      const forward = (type: WatchChange['type'], changedPath: string) => {
        this.enqueueChange(normalizedRootPath, {
          type,
          path: path.resolve(changedPath),
        });
      };

      watcher
        .on('add', (changedPath: string) => forward('add', changedPath))
        .on('change', (changedPath: string) => forward('change', changedPath))
        .on('unlink', (changedPath: string) => forward('unlink', changedPath))
        .on('addDir', (changedPath: string) => forward('addDir', changedPath))
        .on('unlinkDir', (changedPath: string) => forward('unlinkDir', changedPath))
        .on('error', () => {
          // Ignore watcher errors for v1 and let polling actions recover state.
        });

      this.rootWatchers.set(normalizedRootPath, watcherInfo);
    }

    watcherInfo.paneIds.add(paneId);
    this.paneToRoot.set(paneId, normalizedRootPath);
  }

  async unwatchRoot(paneId: string): Promise<void> {
    const rootPath = this.paneToRoot.get(paneId);
    if (!rootPath) {
      return;
    }

    const watcherInfo = this.rootWatchers.get(rootPath);
    if (!watcherInfo) {
      this.paneToRoot.delete(paneId);
      return;
    }

    watcherInfo.paneIds.delete(paneId);
    this.paneToRoot.delete(paneId);

    if (watcherInfo.paneIds.size > 0) {
      return;
    }

    if (watcherInfo.flushTimer) {
      clearTimeout(watcherInfo.flushTimer);
      watcherInfo.flushTimer = null;
    }

    await watcherInfo.watcher.close();
    this.rootWatchers.delete(rootPath);
  }

  async destroy(): Promise<void> {
    const watcherInfos = Array.from(this.rootWatchers.values());
    this.rootWatchers.clear();
    this.paneToRoot.clear();

    await Promise.all(watcherInfos.map(async (watcherInfo) => {
      if (watcherInfo.flushTimer) {
        clearTimeout(watcherInfo.flushTimer);
      }
      await watcherInfo.watcher.close();
    }));
  }

  private enqueueChange(rootPath: string, change: WatchChange): void {
    const watcherInfo = this.rootWatchers.get(rootPath);
    if (!watcherInfo) {
      return;
    }

    watcherInfo.pendingChanges.push(change);
    if (watcherInfo.flushTimer) {
      return;
    }

    watcherInfo.flushTimer = setTimeout(() => {
      watcherInfo.flushTimer = null;
      if (watcherInfo.pendingChanges.length === 0) {
        return;
      }

      const changes = watcherInfo.pendingChanges.splice(0, watcherInfo.pendingChanges.length);
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('code-pane-fs-changed', {
          rootPath,
          changes,
        });
      }

      void this.onChanges?.(rootPath, changes);
    }, 100);
  }
}
