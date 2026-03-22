import path from 'path';
import fs from 'fs';
import { ProjectConfig } from '../../shared/types/project-config';
import { readProjectConfig } from '../utils/project-config';
import { FileWatcherService } from './FileWatcherService';

/**
 * 项目配置文件监听器
 * 监听 copilot.json 文件变化，自动重新加载配置
 *
 * 重构后基于 FileWatcherService 实现
 */
class ProjectConfigWatcher {
  private fileWatcher: FileWatcherService;
  private watchers: Map<string, { projectPath: string; unwatch: () => void }> = new Map();

  constructor(fileWatcher: FileWatcherService) {
    this.fileWatcher = fileWatcher;
  }

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

    // 监听精确的 copilot.json 文件路径。
    // 即使文件初始不存在，chokidar 也能在后续创建时触发 add 事件，
    // 这样可以避免递归监听整个项目目录带来的高 CPU 开销。
    const unwatch = await this.fileWatcher.watch(
      configPath,
      async (event) => {
        if (event === 'change' || event === 'add') {
          try {
            console.log(`[ProjectConfigWatcher] Reloading config for window ${windowId}`);
            const config = await readProjectConfig(projectPath);

            // 只有成功读取到配置时才更新
            // 如果 config 为 null（JSON 语法错误或格式验证失败），则保持原有配置不变
            if (config !== null) {
              onUpdate(config);
            } else {
              console.warn(`[ProjectConfigWatcher] Invalid config for window ${windowId}, keeping existing config`);
            }
          } catch (error) {
            // 捕获异常但不更新配置，保持原有配置不变
            console.error('[ProjectConfigWatcher] Failed to reload project config:', error);
            console.warn('[ProjectConfigWatcher] Keeping existing config due to error');
          }
        } else if (event === 'unlink') {
          console.log(`[ProjectConfigWatcher] copilot.json deleted for window ${windowId}`);
          onUpdate(null);
        }
      },
      {
        debounce: 500, // 500ms 防抖
        ignoreInitial: true,
        awaitWriteFinish: true,
        stabilityThreshold: 200,
      }
    );

    this.watchers.set(windowId, { projectPath, unwatch });
  }

  /**
   * 停止监听指定窗口
   */
  stopWatching(windowId: string): void {
    const watcher = this.watchers.get(windowId);
    if (watcher) {
      console.log(`[ProjectConfigWatcher] Stop watching for window ${windowId}`);
      watcher.unwatch();
      this.watchers.delete(windowId);
    }
  }

  /**
   * 停止所有监听
   */
  stopAll(): void {
    console.log('[ProjectConfigWatcher] Stopping all watchers');
    for (const watcher of this.watchers.values()) {
      watcher.unwatch();
    }
    this.watchers.clear();
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
