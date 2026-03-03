/**
 * PTY 数据订阅管理器
 *
 * 职责：
 * - 管理所有 PTY 数据订阅的生命周期
 * - 确保订阅正确创建和清理
 * - 防止内存泄漏
 *
 * 设计原则：
 * - 每个 paneId 对应一个 PTY 进程
 * - 每个 PTY 进程有一个订阅
 * - 订阅的键统一使用 paneId（唯一标识）
 */
export class PtySubscriptionManager {
  /** 订阅映射：paneId -> 取消订阅函数 */
  private subscriptions = new Map<string, () => void>();

  /**
   * 添加订阅
   * @param paneId 窗格 ID
   * @param unsubscribe 取消订阅函数
   */
  add(paneId: string, unsubscribe: () => void): void {
    // 如果已存在订阅，先清理旧的
    if (this.subscriptions.has(paneId)) {
      console.warn(`[PtySubscriptionManager] Pane ${paneId} already has subscription, cleaning up old one`);
      this.remove(paneId);
    }

    this.subscriptions.set(paneId, unsubscribe);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[PtySubscriptionManager] Added subscription for pane ${paneId}, total: ${this.subscriptions.size}`);
    }
  }

  /**
   * 移除单个订阅
   * @param paneId 窗格 ID
   * @returns 是否成功移除
   */
  remove(paneId: string): boolean {
    const unsubscribe = this.subscriptions.get(paneId);
    if (unsubscribe) {
      try {
        unsubscribe();
        this.subscriptions.delete(paneId);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[PtySubscriptionManager] Removed subscription for pane ${paneId}, remaining: ${this.subscriptions.size}`);
        }
        return true;
      } catch (error) {
        console.error(`[PtySubscriptionManager] Failed to unsubscribe pane ${paneId}:`, error);
        // 即使取消订阅失败，也要从 Map 中删除
        this.subscriptions.delete(paneId);
        return false;
      }
    }
    return false;
  }

  /**
   * 移除窗口的所有订阅
   * @param windowId 窗口 ID
   * @param processManager 进程管理器（用于查找窗口的所有窗格）
   * @returns 移除的订阅数量
   */
  removeByWindow(windowId: string, processManager: { listProcesses(): Array<{ windowId?: string; paneId?: string }> }): number {
    const processes = processManager.listProcesses();
    const windowProcesses = processes.filter(p => p.windowId === windowId);

    let removedCount = 0;
    for (const proc of windowProcesses) {
      if (proc.paneId && this.remove(proc.paneId)) {
        removedCount++;
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[PtySubscriptionManager] Removed ${removedCount} subscriptions for window ${windowId}`);
    }
    return removedCount;
  }

  /**
   * 清理所有订阅
   */
  clear(): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[PtySubscriptionManager] Clearing all ${this.subscriptions.size} subscriptions`);
    }

    for (const [paneId, unsubscribe] of this.subscriptions.entries()) {
      try {
        unsubscribe();
      } catch (error) {
        console.error(`[PtySubscriptionManager] Failed to unsubscribe pane ${paneId}:`, error);
      }
    }

    this.subscriptions.clear();
    if (process.env.NODE_ENV === 'development') {
      console.log('[PtySubscriptionManager] All subscriptions cleared');
    }
  }

  /**
   * 检查是否存在订阅
   * @param paneId 窗格 ID
   */
  has(paneId: string): boolean {
    return this.subscriptions.has(paneId);
  }

  /**
   * 获取当前订阅数量
   */
  size(): number {
    return this.subscriptions.size;
  }

  /**
   * 获取所有订阅的窗格 ID（用于调试）
   */
  getAllPaneIds(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}
