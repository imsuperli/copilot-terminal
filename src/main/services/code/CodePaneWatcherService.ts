import path from 'path';
import { BrowserWindow, type WebContents } from 'electron';
import { PathValidator } from '../../utils/pathValidator';
import { isIgnoredCodePanePath } from './codePaneFsConstants';

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

type ChokidarLike = {
  watch: (target: string, options: Record<string, unknown>) => any;
};

type WatcherInfo = {
  rootPath: string;
  watcher: any;
  paneTargets: Map<string, WebContents>;
  pendingChanges: WatchChange[];
  flushTimer: NodeJS.Timeout | null;
};

type PaneSubscription = {
  rootPath: string;
  webContents: WebContents;
  handleDestroyed: () => void;
};

export class CodePaneWatcherService {
  private readonly rootWatchers = new Map<string, WatcherInfo>();
  private readonly paneSubscriptions = new Map<string, PaneSubscription>();

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly onChanges?: (rootPath: string, changes: WatchChange[]) => void | Promise<void>,
    private readonly loadChokidar: () => Promise<ChokidarLike> = getChokidar,
  ) {}

  async watchRoot(paneId: string, rootPath: string, webContents: WebContents): Promise<void> {
    const normalizedRootPath = path.resolve(PathValidator.expandHomePath(rootPath));
    const validation = PathValidator.validate(normalizedRootPath);
    if (!validation.valid) {
      throw new Error(`Invalid code pane root path: ${validation.reason ?? 'unknown error'}`);
    }

    if (webContents.isDestroyed()) {
      throw new Error(`Cannot watch code pane root for destroyed webContents: ${paneId}`);
    }

    const existingSubscription = this.paneSubscriptions.get(paneId);
    const existingRootPath = existingSubscription?.rootPath;
    const existingTargetId = existingSubscription?.webContents.id;
    if (existingRootPath && existingRootPath !== normalizedRootPath) {
      await this.unwatchRoot(paneId);
    } else if (
      existingRootPath === normalizedRootPath
      && existingTargetId === webContents.id
      && this.rootWatchers.has(normalizedRootPath)
    ) {
      return;
    }

    let watcherInfo = this.rootWatchers.get(normalizedRootPath);
    if (!watcherInfo) {
      const chokidar = await this.loadChokidar();
      const watcher = chokidar.watch(normalizedRootPath, {
        persistent: true,
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
        ignored: (target: string) => {
          return isIgnoredCodePanePath(normalizedRootPath, target);
        },
      });

      watcherInfo = {
        rootPath: normalizedRootPath,
        watcher,
        paneTargets: new Map<string, WebContents>(),
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

    if (existingSubscription) {
      this.rootWatchers.get(existingSubscription.rootPath)?.paneTargets.delete(paneId);
      existingSubscription.webContents.removeListener('destroyed', existingSubscription.handleDestroyed);
    }

    const handleDestroyed = () => {
      void this.unwatchRoot(paneId);
    };

    webContents.on('destroyed', handleDestroyed);
    watcherInfo.paneTargets.set(paneId, webContents);
    this.paneSubscriptions.set(paneId, {
      rootPath: normalizedRootPath,
      webContents,
      handleDestroyed,
    });
  }

  async unwatchRoot(paneId: string): Promise<void> {
    const subscription = this.paneSubscriptions.get(paneId);
    if (!subscription) {
      return;
    }

    this.paneSubscriptions.delete(paneId);
    if (!subscription.webContents.isDestroyed()) {
      subscription.webContents.removeListener('destroyed', subscription.handleDestroyed);
    }

    const watcherInfo = this.rootWatchers.get(subscription.rootPath);
    if (!watcherInfo) {
      return;
    }

    watcherInfo.paneTargets.delete(paneId);

    if (watcherInfo.paneTargets.size > 0) {
      return;
    }

    if (watcherInfo.flushTimer) {
      clearTimeout(watcherInfo.flushTimer);
      watcherInfo.flushTimer = null;
    }

    await watcherInfo.watcher.close();
    this.rootWatchers.delete(subscription.rootPath);
  }

  async destroy(): Promise<void> {
    const watcherInfos = Array.from(this.rootWatchers.values());
    const subscriptions = Array.from(this.paneSubscriptions.values());
    this.rootWatchers.clear();
    this.paneSubscriptions.clear();

    for (const subscription of subscriptions) {
      if (!subscription.webContents.isDestroyed()) {
        subscription.webContents.removeListener('destroyed', subscription.handleDestroyed);
      }
    }

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
      const targetContents = new Map<number, WebContents>();
      for (const target of watcherInfo.paneTargets.values()) {
        if (target.isDestroyed()) {
          continue;
        }
        targetContents.set(target.id, target);
      }

      for (const target of targetContents.values()) {
        target.send('code-pane-fs-changed', {
          rootPath,
          changes,
        });
      }

      void this.onChanges?.(rootPath, changes);
    }, 100);
  }
}
