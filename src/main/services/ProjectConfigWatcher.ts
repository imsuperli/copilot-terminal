import path from 'path';
import fs from 'fs';
import { ProjectConfig } from '../../shared/types/project-config';
import { readProjectConfig } from '../utils/project-config';
import { FileWatcherService } from './FileWatcherService';

/**
 * 项目配置文件监听器
 * 监听 copilot.json 文件变化，自动重新加载配置
 *
 * 使用单个轮询器检查各窗口 copilot.json 的变更，
 * 避免为每个恢复窗口创建长期文件 watcher 带来的高 CPU 开销。
 */
class ProjectConfigWatcher {
  private watchers = new Map<string, {
    projectPath: string;
    onUpdate: (config: ProjectConfig | null) => void;
    lastSignature: string | null;
  }>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private readonly pollIntervalMs = 3000;

  constructor(_fileWatcher: FileWatcherService) {}

  /**
   * 开始监听窗口的 copilot.json
   * @param windowId 窗口 ID
   * @param projectPath 项目路径
   * @param onUpdate 更新回调
   */
  async startWatching(
    windowId: string,
    projectPath: string,
    onUpdate: (config: ProjectConfig | null) => void
  ): Promise<void> {
    const existingWatcher = this.watchers.get(windowId);
    if (existingWatcher?.projectPath === projectPath) {
      existingWatcher.onUpdate = onUpdate;
      return;
    }

    // 如果已经在监听其他路径，先停止
    this.stopWatching(windowId);

    if (!fs.existsSync(projectPath)) {
      console.log(`[ProjectConfigWatcher] project path not found for window ${windowId}: ${projectPath}`);
      return;
    }

    const configPath = path.join(projectPath, 'copilot.json');
    console.log(`[ProjectConfigWatcher] Start watching ${configPath} for window ${windowId}`);

    const lastSignature = await this.getConfigSignature(projectPath);
    const trackedWatcher = {
      projectPath,
      onUpdate,
      lastSignature,
    };

    this.watchers.set(windowId, trackedWatcher);

    this.ensurePolling();

    if (existingWatcher && existingWatcher.projectPath !== projectPath) {
      if (trackedWatcher.lastSignature === null) {
        trackedWatcher.onUpdate(null);
      } else {
        this.emitCurrentConfig(windowId, trackedWatcher);
      }
    }
  }

  /**
   * 停止监听指定窗口
   */
  stopWatching(windowId: string): void {
    const watcher = this.watchers.get(windowId);
    if (watcher) {
      console.log(`[ProjectConfigWatcher] Stop watching for window ${windowId}`);
      this.watchers.delete(windowId);
      this.stopPollingIfIdle();
    }
  }

  /**
   * 停止所有监听
   */
  stopAll(): void {
    console.log('[ProjectConfigWatcher] Stopping all watchers');
    this.watchers.clear();
    this.stopPolling();
  }

  /**
   * 获取当前监听的窗口数量
   */
  getWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * 获取当前正在监听的窗口 ID 列表
   */
  getWatchedWindowIds(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * 获取窗口当前监听的项目路径
   */
  getWatchedProjectPath(windowId: string): string | undefined {
    return this.watchers.get(windowId)?.projectPath;
  }

  private ensurePolling(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    this.pollTimer.unref();
  }

  private stopPollingIfIdle(): void {
    if (this.watchers.size === 0) {
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling || this.watchers.size === 0) {
      return;
    }

    this.isPolling = true;

    try {
      await Promise.all(
        Array.from(this.watchers.entries()).map(([windowId, watcher]) => this.pollWindow(windowId, watcher))
      );
    } finally {
      this.isPolling = false;
    }
  }

  private async pollWindow(
    windowId: string,
    watcher: { projectPath: string; onUpdate: (config: ProjectConfig | null) => void; lastSignature: string | null }
  ): Promise<void> {
    const currentSignature = await this.getConfigSignature(watcher.projectPath);
    if (currentSignature === watcher.lastSignature) {
      return;
    }

    watcher.lastSignature = currentSignature;

    if (currentSignature === null) {
      console.log(`[ProjectConfigWatcher] copilot.json deleted for window ${windowId}`);
      watcher.onUpdate(null);
      return;
    }

    this.emitCurrentConfig(windowId, watcher);
  }

  private emitCurrentConfig(
    windowId: string,
    watcher: { projectPath: string; onUpdate: (config: ProjectConfig | null) => void; lastSignature: string | null }
  ): void {
    try {
      console.log(`[ProjectConfigWatcher] Reloading config for window ${windowId}`);
      const config = readProjectConfig(watcher.projectPath);
      if (config !== null) {
        watcher.onUpdate(config);
      } else {
        console.warn(`[ProjectConfigWatcher] Invalid config for window ${windowId}, keeping existing config`);
      }
    } catch (error) {
      console.error('[ProjectConfigWatcher] Failed to reload project config:', error);
      console.warn('[ProjectConfigWatcher] Keeping existing config due to error');
    }
  }

  private async getConfigSignature(projectPath: string): Promise<string | null> {
    const configPath = path.join(projectPath, 'copilot.json');

    try {
      const stat = await fs.promises.stat(configPath);
      if (!stat.isFile()) {
        return null;
      }

      return `${stat.mtimeMs}:${stat.size}`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return null;
      }

      console.error(`[ProjectConfigWatcher] Failed to stat ${configPath}:`, error);
      return null;
    }
  }
}

// 导出工厂函数，需要传入 FileWatcherService 实例
export function createProjectConfigWatcher(fileWatcher: FileWatcherService): ProjectConfigWatcher {
  return new ProjectConfigWatcher(fileWatcher);
}

// 为了向后兼容，保留旧的导出方式
// 但现在需要在主进程中手动初始化
export let projectConfigWatcher: ProjectConfigWatcher;

export function initProjectConfigWatcher(fileWatcher: FileWatcherService): void {
  projectConfigWatcher = new ProjectConfigWatcher(fileWatcher);
}
