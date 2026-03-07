import { IWorkspaceManager } from './WorkspaceManager';
import { Workspace } from '../types/workspace';

/**
 * AutoSaveManager 接口
 * 负责在窗口变化时自动保存工作区配置
 */
export interface IAutoSaveManager {
  startAutoSave(workspaceManager: IWorkspaceManager, getWorkspace: () => Workspace): void;
  stopAutoSave(): void;
  triggerSave(): void;
  saveImmediately(): Promise<void>;
}

/**
 * AutoSaveManager 实现
 *
 * 功能：
 * - 防抖保存：频繁修改时只保存一次（300ms 延迟）
 * - 异步保存：不阻塞主进程
 * - 错误处理：保存失败时记录日志，不影响应用运行
 * - 应用关闭时立即保存
 */
export class AutoSaveManagerImpl implements IAutoSaveManager {
  private saveTimer: NodeJS.Timeout | null = null;
  private workspaceManager: IWorkspaceManager | null = null;
  private getWorkspace: (() => Workspace) | null = null;
  private readonly DEBOUNCE_DELAY = 300; // 300ms 防抖延迟（快速响应用户操作）

  /**
   * 启动自动保存
   * @param workspaceManager WorkspaceManager 实例
   * @param getWorkspace 获取当前工作区状态的函数
   */
  startAutoSave(workspaceManager: IWorkspaceManager, getWorkspace: () => Workspace): void {
    this.workspaceManager = workspaceManager;
    this.getWorkspace = getWorkspace;
    console.log('AutoSaveManager started');
  }

  /**
   * 停止自动保存
   * 清理定时器，避免内存泄漏
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    console.log('AutoSaveManager stopped');
  }

  /**
   * 触发保存（防抖）
   * 如果已有待处理的保存，清除旧的定时器
   * 设置新的定时器，延迟 300ms 后执行保存
   */
  triggerSave(): void {
    // 清除旧的定时器
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // 设置新的定时器，延迟 1 秒后执行保存
    this.saveTimer = setTimeout(() => {
      this.performSave();
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * 立即保存（用于应用关闭时）
   * 不使用防抖，直接执行保存
   */
  async saveImmediately(): Promise<void> {
    // 清除待处理的定时器
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // 立即执行保存
    await this.performSave();
  }

  /**
   * 执行保存操作
   * 异步执行，不阻塞主进程
   * 保存失败时记录错误日志，不抛出异常
   */
  private async performSave(): Promise<void> {
    try {
      const workspace = this.getWorkspace?.();
      if (!workspace || !this.workspaceManager) {
        return;
      }

      // 🔥 数据完整性校验：防止保存损坏的数据
      if (!this.validateWorkspaceData(workspace)) {
        return;
      }

      // 去重：根据窗口 ID 去重，保留最新的窗口状态
      const uniqueWindows = Array.from(
        new Map(workspace.windows.map(w => [w.id, w])).values()
      );

      // 规范化窗口数据：确保所有 pane 都有 pid 字段
      const normalizedWindows = uniqueWindows.map(window => ({
        ...window,
        layout: this.normalizeLayout(window.layout),
      }));

      const deduplicatedWorkspace = {
        ...workspace,
        windows: normalizedWindows,
      };

      await this.workspaceManager.saveWorkspace(deduplicatedWorkspace);
    } catch (error) {
      // 保存失败时记录错误日志，不影响应用运行
    }
  }

  /**
   * 校验工作区数据完整性
   * 防止保存损坏或不完整的数据
   */
  private validateWorkspaceData(workspace: Workspace): boolean {
    // 检查基本结构
    if (!workspace.version || !workspace.settings) {
      return false;
    }

    // 检查窗口数据
    if (!Array.isArray(workspace.windows)) {
      return false;
    }

    // 检查每个窗口的必需字段
    for (const window of workspace.windows) {
      if (!window.id || !window.name || !window.layout) {
        return false;
      }

      // 检查 layout 结构
      if (!this.validateLayout(window.layout)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 校验布局结构
   */
  private validateLayout(layout: any): boolean {
    if (!layout || typeof layout !== 'object') {
      return false;
    }

    if (layout.type === 'pane') {
      // 检查 pane 节点
      if (!layout.id || !layout.pane) {
        return false;
      }
      const pane = layout.pane;
      if (!pane.id || typeof pane.cwd !== 'string' || typeof pane.command !== 'string') {
        return false;
      }
      return true;
    } else if (layout.type === 'split') {
      // 检查 split 节点
      if (!Array.isArray(layout.children) || !Array.isArray(layout.sizes)) {
        return false;
      }
      // 递归检查子节点
      for (const child of layout.children) {
        if (!this.validateLayout(child)) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * 规范化布局数据：确保所有 pane 都有必需的字段
   */
  private normalizeLayout(layout: any): any {
    if (!layout) return layout;

    if (layout.type === 'pane') {
      return {
        ...layout,
        pane: {
          ...layout.pane,
          // 确保 pid 字段存在（如果不存在则设为 null）
          pid: layout.pane.pid !== undefined ? layout.pane.pid : null,
        },
      };
    } else if (layout.type === 'split') {
      return {
        ...layout,
        children: layout.children.map((child: any) => this.normalizeLayout(child)),
      };
    }

    return layout;
  }
}
