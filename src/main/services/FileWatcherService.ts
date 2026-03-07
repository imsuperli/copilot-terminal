import chokidar from 'chokidar';
import { existsSync } from 'fs';

/**
 * 文件监听事件类型
 */
export type WatchEvent = 'change' | 'add' | 'unlink';

/**
 * 文件监听回调函数
 */
export type WatchCallback = (event: WatchEvent, filePath: string) => void;

/**
 * 文件监听选项
 */
export interface WatchOptions {
  /** 防抖延迟（毫秒），默认 0（不防抖） */
  debounce?: number;
  /** 是否忽略初始扫描事件，默认 true */
  ignoreInitial?: boolean;
  /** 是否等待文件写入完成，默认 true */
  awaitWriteFinish?: boolean;
  /** 文件稳定性阈值（毫秒），默认 200 */
  stabilityThreshold?: number;
}

/**
 * 监听器信息
 */
interface WatcherInfo {
  watcher: chokidar.FSWatcher;
  refCount: number;
  callbacks: Map<symbol, WatchCallback>;
  debounceTimers: Map<symbol, NodeJS.Timeout>;
}

/**
 * 通用文件监听服务
 *
 * 提供统一的文件监听能力，支持：
 * - 引用计数：多个订阅者监听同一文件时，只创建一个 chokidar watcher
 * - 自动清理：最后一个订阅者取消时，自动关闭 watcher
 * - 防抖支持：可选的防抖配置
 * - 错误处理：统一的错误处理和日志
 */
export class FileWatcherService {
  private watchers: Map<string, WatcherInfo> = new Map();

  /**
   * 监听文件变化
   * @param filePath 文件路径（绝对路径）
   * @param callback 变化回调
   * @param options 监听选项
   * @returns 取消监听函数
   */
  watch(
    filePath: string,
    callback: WatchCallback,
    options: WatchOptions = {}
  ): () => void {
    const {
      debounce = 0,
      ignoreInitial = true,
      awaitWriteFinish = true,
      stabilityThreshold = 200,
    } = options;

    // 生成唯一的回调 ID
    const callbackId = Symbol('callback');

    // 获取或创建 watcher
    let watcherInfo = this.watchers.get(filePath);

    if (!watcherInfo) {
      // 创建新的 watcher
      const watcher = chokidar.watch(filePath, {
        persistent: true,
        ignoreInitial,
        awaitWriteFinish: awaitWriteFinish
          ? {
              stabilityThreshold,
              pollInterval: 100,
            }
          : false,
      });

      watcherInfo = {
        watcher,
        refCount: 0,
        callbacks: new Map(),
        debounceTimers: new Map(),
      };

      // 设置事件监听
      watcher
        .on('change', () => this.handleEvent(filePath, 'change'))
        .on('add', () => this.handleEvent(filePath, 'add'))
        .on('unlink', () => this.handleEvent(filePath, 'unlink'))
        .on('error', (error) => {
          console.error(`[FileWatcherService] Watcher error for ${filePath}:`, error);
        });

      this.watchers.set(filePath, watcherInfo);
      console.log(`[FileWatcherService] Created watcher for ${filePath}`);
    }

    // 增加引用计数
    watcherInfo.refCount++;

    // 创建防抖包装的回调
    const wrappedCallback = (event: WatchEvent, path: string) => {
      if (debounce > 0) {
        // 清除之前的定时器
        const existingTimer = watcherInfo!.debounceTimers.get(callbackId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        // 设置新的定时器
        const timer = setTimeout(() => {
          callback(event, path);
          watcherInfo!.debounceTimers.delete(callbackId);
        }, debounce);

        watcherInfo!.debounceTimers.set(callbackId, timer);
      } else {
        // 不防抖，直接调用
        callback(event, path);
      }
    };

    // 注册回调
    watcherInfo.callbacks.set(callbackId, wrappedCallback);

    console.log(
      `[FileWatcherService] Added callback for ${filePath} (refCount: ${watcherInfo.refCount})`
    );

    // 返回取消监听函数
    return () => this.unwatch(filePath, callbackId);
  }

  /**
   * 取消监听
   */
  private unwatch(filePath: string, callbackId: symbol): void {
    const watcherInfo = this.watchers.get(filePath);
    if (!watcherInfo) return;

    // 清除防抖定时器
    const timer = watcherInfo.debounceTimers.get(callbackId);
    if (timer) {
      clearTimeout(timer);
      watcherInfo.debounceTimers.delete(callbackId);
    }

    // 移除回调
    watcherInfo.callbacks.delete(callbackId);
    watcherInfo.refCount--;

    console.log(
      `[FileWatcherService] Removed callback for ${filePath} (refCount: ${watcherInfo.refCount})`
    );

    // 如果没有订阅者了，关闭 watcher
    if (watcherInfo.refCount === 0) {
      watcherInfo.watcher.close();
      this.watchers.delete(filePath);
      console.log(`[FileWatcherService] Closed watcher for ${filePath}`);
    }
  }

  /**
   * 处理文件事件
   */
  private handleEvent(filePath: string, event: WatchEvent): void {
    const watcherInfo = this.watchers.get(filePath);
    if (!watcherInfo) return;

    // 通知所有订阅者
    for (const callback of watcherInfo.callbacks.values()) {
      try {
        callback(event, filePath);
      } catch (error) {
        console.error(`[FileWatcherService] Callback error for ${filePath}:`, error);
      }
    }
  }

  /**
   * 获取当前监听的文件数量
   */
  getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * 销毁所有监听器
   */
  destroy(): void {
    console.log('[FileWatcherService] Destroying all watchers');
    for (const [filePath, watcherInfo] of this.watchers) {
      // 清除所有防抖定时器
      for (const timer of watcherInfo.debounceTimers.values()) {
        clearTimeout(timer);
      }
      watcherInfo.debounceTimers.clear();

      // 关闭 watcher
      watcherInfo.watcher.close();
    }
    this.watchers.clear();
  }
}

// 导出单例
export const fileWatcherService = new FileWatcherService();
