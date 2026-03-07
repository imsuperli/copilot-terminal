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
  private unwatchers: Map<string, () => void> = new Map(); // windowId -> unwatch

  constructor(fileWatcher: FileWatcherService) {
    this.fileWatcher = fileWatcher;
  }

  /**
   * 开始监听窗口的 copilot.json
   * @param windowId 窗口 ID
   * @param projectPath 项目路径
   * @param onUpdate 更新回调
   */
  startWatching(
    windowId: string,
    projectPath: string,
    onUpdate: (config: ProjectConfig | null) => void
  ): void {
    // 如果已经在监听，先停止
    this.stopWatching(windowId);

    const configPath = path.join(projectPath, 'copilot.json');

    // 检查文件是否存在
    if (!fs.existsSync(configPath)) {
      console.log(`[ProjectConfigWatcher] copilot.json not found for window ${windowId}`);
      return;
    }

    console.log(`[ProjectConfigWatcher] Start watching ${configPath} for window ${windowId}`);

    // 监听文件变化
    const unwatch = this.fileWatcher.watch(
      configPath,
      async (event) => {
        if (event === 'change' || event === 'add') {
          try {
            console.log(`[ProjectConfigWatcher] Reloading config for window ${windowId}`);
            const config = await readProjectConfig(projectPath);
            onUpdate(config);
          } catch (error) {
            console.error('[ProjectConfigWatcher] Failed to reload project config:', error);
            onUpdate(null);
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

    this.unwatchers.set(windowId, unwatch);
  }

  /**
   * 停止监听指定窗口
   */
  stopWatching(windowId: string): void {
    const unwatch = this.unwatchers.get(windowId);
    if (unwatch) {
      console.log(`[ProjectConfigWatcher] Stop watching for window ${windowId}`);
      unwatch();
      this.unwatchers.delete(windowId);
    }
  }

  /**
   * 停止所有监听
   */
  stopAll(): void {
    console.log('[ProjectConfigWatcher] Stopping all watchers');
    for (const [windowId, unwatch] of this.unwatchers) {
      unwatch();
    }
    this.unwatchers.clear();
  }

  /**
   * 获取当前监听的窗口数量
   */
  getWatcherCount(): number {
    return this.unwatchers.size;
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
