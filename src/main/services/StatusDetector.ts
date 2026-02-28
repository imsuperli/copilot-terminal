import pidusage from 'pidusage';
import { WindowStatus } from '../../renderer/types/window';

/**
 * StatusDetector 接口
 */
export interface IStatusDetector {
  detectStatus(pid: number): Promise<WindowStatus>;
  subscribeStatusChange(callback: (pid: number, status: WindowStatus) => void): () => void;
  trackPid(pid: number): void;
  untrackPid(pid: number): void;
  onPtyData(pid: number, data: string): void;
  onProcessExit(pid: number, exitCode: number): void;
  startPolling(): void;
  stopPolling(): void;
  destroy(): void;
}

/**
 * StatusDetectorImpl - 智能状态检测服务
 *
 * 通过 CPU 使用率、PTY 输出时间、进程退出码综合判断窗口状态。
 * 使用事件驱动 + 定期轮询混合模式，确保状态检测延迟 < 1s。
 */
export class StatusDetectorImpl implements IStatusDetector {
  /** 最后一次 PTY 输出时间戳 (pid -> ms) */
  private lastOutputTime = new Map<number, number>();
  /** 缓存的 CPU 使用率 (pid -> %) */
  private cpuUsage = new Map<number, number>();
  /** 进程退出码 (pid -> exitCode) */
  private exitCodes = new Map<number, number>();
  /** 当前已知状态缓存 (pid -> WindowStatus) */
  private statusCache = new Map<number, WindowStatus>();
  /** 正在追踪的 PID 集合 */
  private trackedPids = new Set<number>();
  /** 状态变化订阅回调列表 */
  private subscribers: Array<(pid: number, status: WindowStatus) => void> = [];
  /** 轮询定时器 */
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

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

    // 获取 CPU 使用率
    let cpu = 0;
    try {
      const stats = await pidusage(pid);
      cpu = stats.cpu;
      this.cpuUsage.set(pid, cpu);
    } catch {
      // pidusage 失败时使用缓存值
      cpu = this.cpuUsage.get(pid) ?? 0;
    }

    // 计算距上次输出的时间
    const lastOutput = this.lastOutputTime.get(pid) ?? 0;
    const timeSinceOutput = Date.now() - lastOutput;

    // 运行中：CPU > 1% 或最近 5s 内有输出
    if (cpu > 1.0 || timeSinceOutput < 5000) {
      return WindowStatus.Running;
    }

    // 等待输入：进程存活 + CPU < 1% + 最近 5s 无输出
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
  trackPid(pid: number): void {
    this.trackedPids.add(pid);
    // 初始状态设为 Running（进程刚创建）
    this.statusCache.set(pid, WindowStatus.Running);
    this.lastOutputTime.set(pid, Date.now());
  }

  /**
   * 停止追踪某个 PID，清理相关数据
   */
  untrackPid(pid: number): void {
    this.trackedPids.delete(pid);
    this.lastOutputTime.delete(pid);
    this.cpuUsage.delete(pid);
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
    this.exitCodes.set(pid, exitCode);
    // 立即触发状态更新，无需等待下次轮询
    const newStatus = exitCode === 0 ? WindowStatus.Completed : WindowStatus.Error;
    this.updateStatus(pid, newStatus);
  }

  /**
   * 启动轮询（每 1s 检测一次所有追踪的 PID）
   */
  startPolling(): void {
    if (this.pollingInterval) return;
    this.pollingInterval = setInterval(() => {
      this.pollAll();
    }, 1000);
  }

  /**
   * 停止轮询
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * 销毁服务，释放所有资源
   */
  destroy(): void {
    this.stopPolling();
    this.trackedPids.clear();
    this.lastOutputTime.clear();
    this.cpuUsage.clear();
    this.exitCodes.clear();
    this.statusCache.clear();
    this.subscribers = [];
  }

  /**
   * 检测进程是否存活（使用 signal 0 探测）
   */
  isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 轮询所有追踪的 PID
   */
  private pollAll(): void {
    for (const pid of this.trackedPids) {
      this.detectStatus(pid).then(newStatus => {
        this.updateStatus(pid, newStatus);
      }).catch(() => {
        // 检测失败时忽略，下次轮询重试
      });
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
