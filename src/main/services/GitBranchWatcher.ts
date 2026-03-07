import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { FileWatcherService } from './FileWatcherService';

/**
 * Git 分支监听器
 *
 * 监听 .git/HEAD 文件变化，实时检测分支切换
 * 支持：
 * - 普通 git 仓库
 * - git worktree（.git 是文件而非目录）
 * - detached HEAD 状态
 */
export class GitBranchWatcher {
  private fileWatcher: FileWatcherService;
  private unwatchers: Map<string, () => void> = new Map(); // windowId -> unwatch

  constructor(fileWatcher: FileWatcherService) {
    this.fileWatcher = fileWatcher;
  }

  /**
   * 开始监听指定目录的 git 分支
   * @param windowId 窗口 ID
   * @param cwd 工作目录
   * @param onBranchChange 分支变化回调
   */
  watch(
    windowId: string,
    cwd: string,
    onBranchChange: (branch: string | undefined) => void
  ): void {
    // 如果已经在监听，先停止
    this.unwatch(windowId);

    try {
      // 解析 .git/HEAD 文件路径
      const headPath = this.resolveGitHeadPath(cwd);
      if (!headPath) {
        // 不是 git 仓库
        onBranchChange(undefined);
        return;
      }

      console.log(`[GitBranchWatcher] Start watching ${headPath} for window ${windowId}`);

      // 立即读取一次当前分支
      const initialBranch = this.parseBranch(headPath);
      onBranchChange(initialBranch);

      // 监听 HEAD 文件变化
      const unwatch = this.fileWatcher.watch(
        headPath,
        (event) => {
          if (event === 'change' || event === 'add') {
            const branch = this.parseBranch(headPath);
            console.log(`[GitBranchWatcher] Branch changed for window ${windowId}: ${branch}`);
            onBranchChange(branch);
          } else if (event === 'unlink') {
            // HEAD 文件被删除（极少见）
            onBranchChange(undefined);
          }
        },
        {
          debounce: 100, // 100ms 防抖
          ignoreInitial: true,
        }
      );

      this.unwatchers.set(windowId, unwatch);
    } catch (error) {
      console.error(`[GitBranchWatcher] Failed to watch ${cwd}:`, error);
      onBranchChange(undefined);
    }
  }

  /**
   * 停止监听指定窗口
   */
  unwatch(windowId: string): void {
    const unwatch = this.unwatchers.get(windowId);
    if (unwatch) {
      console.log(`[GitBranchWatcher] Stop watching for window ${windowId}`);
      unwatch();
      this.unwatchers.delete(windowId);
    }
  }

  /**
   * 停止所有监听
   */
  unwatchAll(): void {
    console.log('[GitBranchWatcher] Stopping all watchers');
    for (const [windowId, unwatch] of this.unwatchers) {
      unwatch();
    }
    this.unwatchers.clear();
  }

  /**
   * 解析 .git/HEAD 文件路径
   * 支持普通 git 仓库和 git worktree
   * @returns HEAD 文件的绝对路径，如果不是 git 仓库则返回 null
   */
  private resolveGitHeadPath(cwd: string): string | null {
    const gitPath = join(cwd, '.git');

    if (!existsSync(gitPath)) {
      return null;
    }

    const stats = statSync(gitPath);

    if (stats.isDirectory()) {
      // 普通 git 仓库：.git 是目录
      const headPath = join(gitPath, 'HEAD');
      return existsSync(headPath) ? headPath : null;
    } else if (stats.isFile()) {
      // git worktree 或子模块：.git 是文件
      // 文件内容格式：gitdir: /path/to/main/.git/worktrees/xxx
      try {
        const content = readFileSync(gitPath, 'utf-8').trim();
        const match = content.match(/^gitdir:\s*(.+)$/);
        if (match) {
          const gitDir = match[1].trim();
          // 支持相对路径
          const absoluteGitDir = gitDir.startsWith('/')
            ? gitDir
            : join(cwd, gitDir);
          const headPath = join(absoluteGitDir, 'HEAD');
          return existsSync(headPath) ? headPath : null;
        }
      } catch (error) {
        console.error(`[GitBranchWatcher] Failed to read .git file:`, error);
      }
    }

    return null;
  }

  /**
   * 解析 HEAD 文件内容，提取分支名
   * @param headPath HEAD 文件路径
   * @returns 分支名或 commit hash（detached HEAD）
   */
  private parseBranch(headPath: string): string | undefined {
    try {
      const content = readFileSync(headPath, 'utf-8').trim();

      // 普通分支：ref: refs/heads/main
      if (content.startsWith('ref: refs/heads/')) {
        return content.replace('ref: refs/heads/', '');
      }

      // Detached HEAD：直接是 commit hash
      // 返回前 7 位 hash
      if (/^[0-9a-f]{40}$/i.test(content)) {
        return content.substring(0, 7);
      }

      // 其他情况（不应该出现）
      return undefined;
    } catch (error) {
      console.error(`[GitBranchWatcher] Failed to parse HEAD file:`, error);
      return undefined;
    }
  }

  /**
   * 获取当前监听的窗口数量
   */
  getWatcherCount(): number {
    return this.unwatchers.size;
  }
}
