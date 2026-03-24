import { BrowserWindow } from 'electron';
import { ProcessManager } from './ProcessManager';
import { Workspace } from '../types/workspace';
import { Window } from '../../shared/types/window';
import { createPtyDataForwarder } from '../utils/ptyDataForwarder';

/**
 * 工作区恢复结果
 */
export interface RestoreResult {
  windowId: string;
  pid: number | null;
  status: 'restoring' | 'error';
  error?: string;
}

/**
 * WorkspaceRestorer 接口
 * 负责启动时恢复工作区中的所有窗口
 */
export interface IWorkspaceRestorer {
  restoreWorkspace(workspace: Workspace): Promise<RestoreResult[]>;
}

/**
 * WorkspaceRestorer 实现
 *
 * 功能：
 * - 并行启动所有终端进程（使用 Promise.all）
 * - 通过 IPC 事件通知渲染进程更新状态
 * - 错误处理：单个窗口启动失败不影响其他窗口
 * - 性能优化：10+ 窗口恢复时间 < 5s
 */
export class WorkspaceRestorerImpl implements IWorkspaceRestorer {
  private processManager: ProcessManager;
  private mainWindow: BrowserWindow;
  private readonly forwardPtyData: ReturnType<typeof createPtyDataForwarder>;

  constructor(processManager: ProcessManager, mainWindow: BrowserWindow) {
    this.processManager = processManager;
    this.mainWindow = mainWindow;
    this.forwardPtyData = createPtyDataForwarder(() => this.mainWindow);
  }

  /**
   * 恢复工作区中的所有窗口
   * 并行启动所有终端进程，提高恢复速度
   */
  async restoreWorkspace(workspace: Workspace): Promise<RestoreResult[]> {
    if (!workspace.windows || workspace.windows.length === 0) {
      console.log('[WorkspaceRestorer] No windows to restore');
      return [];
    }

    console.log(`[WorkspaceRestorer] Starting to restore ${workspace.windows.length} windows`);
    const startTime = Date.now();

    // 并行启动所有窗口的终端进程
    const promises = workspace.windows.map(async (window) => {
      return await this.restoreWindow(window);
    });

    // 等待所有进程启动（并行执行）
    const results = await Promise.all(promises);

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.status === 'restoring').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(
      `[WorkspaceRestorer] Restored ${successCount}/${workspace.windows.length} windows in ${duration}ms ` +
      `(${errorCount} errors)`
    );

    // 通知渲染进程所有窗口恢复完成
    for (const result of results) {
      this.notifyWindowRestored(result);
    }

    return results;
  }

  /**
   * 恢复单个窗口
   * 启动终端进程并返回恢复结果
   */
  private async restoreWindow(window: Window): Promise<RestoreResult> {
    try {
      console.log(`[WorkspaceRestorer] Restoring window: ${window.id} (${window.name})`);

      // 启动终端进程
      const handle = await this.processManager.spawnTerminal({
        workingDirectory: (window as any).workingDirectory || process.cwd(),
        command: (window as any).command || '',
        windowId: window.id,
      });

      // 订阅 PTY 数据，推送到渲染进程
      this.processManager.subscribePtyData(handle.pid, (data: string) => {
        this.forwardPtyData({ windowId: window.id, data });
      });

      return {
        windowId: window.id,
        pid: handle.pid,
        status: 'restoring',
      };
    } catch (error) {
      console.error(`[WorkspaceRestorer] Failed to restore window ${window.id}:`, error);
      return {
        windowId: window.id,
        pid: null,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 通知渲染进程窗口恢复完成
   * 通过 IPC 事件推送状态更新
   */
  private notifyWindowRestored(result: RestoreResult): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('window-restored', result);
    }
  }
}
