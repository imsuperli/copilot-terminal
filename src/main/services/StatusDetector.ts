import { WindowStatus } from '../../shared/types/window';

/**
 * StatusDetector 接口
 */
export interface IStatusDetector {
  detectStatus(pid: number): Promise<WindowStatus>;
  subscribeStatusChange(callback: (pid: number, status: WindowStatus) => void): () => void;
  trackPid(pid: number, options?: { virtual?: boolean }): void;
  untrackPid(pid: number): void;
  onPtyData(pid: number, data: string): void;
  onProcessExit(pid: number, exitCode: number): void;
  destroy(): void;
}

/**
 * StatusDetectorImpl - 智能状态检测服务
 *
 * 通过 CPU 使用率、PTY 输出时间、进程退出码综合判断窗口状态。
 * 使用事件驱动模式，由 StatusPoller 定期调用 detectStatus() 进行状态检测。
 */
export class StatusDetectorImpl implements IStatusDetector {
  /** 最后一次 PTY 输出时间戳 (pid -> ms) */
  private lastOutputTime = new Map<number, number>();
  /** 进程退出码 (pid -> exitCode) */
  private exitCodes = new Map<number, number>();
  /** 当前已知状态缓存 (pid -> WindowStatus) */
  private statusCache = new Map<number, WindowStatus>();
  /** 正在追踪的 PID 集合 */
  private trackedPids = new Set<number>();
  /** 虚拟 PID 集合（如 SSH channel），不应使用 process.kill 探测。 */
  private virtualPids = new Set<number>();
  /** 状态变化订阅回调列表 */
  private subscribers: Array<(pid: number, status: WindowStatus) => void> = [];

  /**
   * 检测指定 PID 的当前状态
   */
  async detectStatus(pid: number): Promise<WindowStatus> {
    // 进程已退出
    if (!this.isProcessAlive(pid)) {
      // 若无退出码记录（进程崩溃/被信号杀死），视为 Error
      if (!this.exitCodes.has(pid)) {
        return WindowStatus.Error;
      }
      const exitCode = this.exitCodes.get(pid)!;
      return exitCode === 0 ? WindowStatus.Completed : WindowStatus.Error;
    }

    // 计算距上次输出的时间
    const lastOutput = this.lastOutputTime.get(pid) ?? 0;
    const timeSinceOutput = lastOutput > 0 ? Date.now() - lastOutput : Infinity;

    // 运行中：最近 2s 内有输出
    if (timeSinceOutput < 2000) {
      return WindowStatus.Running;
    }

    // 等待输入：进程存活 + 无最近输出
    return WindowStatus.WaitingForInput;
  }

  /**
   * 订阅状态变化事件，返回取消订阅函数
   */
  subscribeStatusChange(callback: (pid: number, status: WindowStatus) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx !== -1) this.subscribers.splice(idx, 1);
    };
  }

  /**
   * 开始追踪某个 PID
   */
  trackPid(pid: number, options?: { virtual?: boolean }): void {
    this.trackedPids.add(pid);
    if (options?.virtual) {
      this.virtualPids.add(pid);
    }
    // 初始状态设为 WaitingForInput（shell 启动后等待用户输入）
    // 如果进程正在执行任务，会在下次轮询时更新为 Running
    this.statusCache.set(pid, WindowStatus.WaitingForInput);
    // 不设置 lastOutputTime，让第一次检测来判断状态
  }

  /**
   * 停止追踪某个 PID，清理相关数据
   */
  untrackPid(pid: number): void {
    this.trackedPids.delete(pid);
    this.virtualPids.delete(pid);
    this.lastOutputTime.delete(pid);
    this.exitCodes.delete(pid);
    this.statusCache.delete(pid);
  }

  /**
   * 记录 PTY 输出事件（由 ProcessManager 调用）
   */
  onPtyData(pid: number, _data: string): void {
    this.lastOutputTime.set(pid, Date.now());
  }

  /**
   * 记录进程退出事件（由 ProcessManager 调用）
   */
  onProcessExit(pid: number, exitCode: number): void {
    this.virtualPids.delete(pid);
    this.exitCodes.set(pid, exitCode);
    // 立即触发状态更新，无需等待 StatusPoller 下次轮询
    const newStatus = exitCode === 0 ? WindowStatus.Completed : WindowStatus.Error;
    this.updateStatus(pid, newStatus);
  }

  /**
   * 销毁服务，释放所有资源
   */
  destroy(): void {
    this.trackedPids.clear();
    this.virtualPids.clear();
    this.lastOutputTime.clear();
    this.exitCodes.clear();
    this.statusCache.clear();
    this.subscribers = [];
  }

  /**
   * 检测进程是否存活（使用 signal 0 探测）
   */
  isProcessAlive(pid: number): boolean {
    if (this.exitCodes.has(pid)) {
      return false;
    }

    if (this.virtualPids.has(pid)) {
      return true;
    }

    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 更新状态缓存并在状态变化时通知订阅者
   */
  private updateStatus(pid: number, newStatus: WindowStatus): void {
    const oldStatus = this.statusCache.get(pid);
    if (newStatus !== oldStatus) {
      this.statusCache.set(pid, newStatus);
      this.notifySubscribers(pid, newStatus);
    }
  }

  /**
   * 通知所有订阅者
   */
  private notifySubscribers(pid: number, status: WindowStatus): void {
    for (const cb of this.subscribers) {
      try {
        cb(pid, status);
      } catch {
        // 单个订阅者异常不影响其他订阅者
      }
    }
  }
}
