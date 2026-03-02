import { BrowserWindow } from 'electron';
import { IStatusDetector } from './StatusDetector';
import { WindowStatus } from '../../renderer/types/window';

interface TrackedWindow {
  pid: number;
  isActive: boolean;
  lastStatus: WindowStatus;
  lastCheckTime: number;
}

/**
 * StatusPoller - 窗口状态轮询服务
 *
 * 管理所有窗口的状态轮询，活跃窗口每 1s 检测，非活跃窗口每 5s 检测。
 * 状态变化时通过 IPC 推送 window-status-changed 事件到渲染进程。
 */
export class StatusPoller {
  private trackedWindows = new Map<string, TrackedWindow>();
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private statusDetector: IStatusDetector;
  private mainWindow: BrowserWindow;

  constructor(statusDetector: IStatusDetector, mainWindow: BrowserWindow) {
    this.statusDetector = statusDetector;
    this.mainWindow = mainWindow;
  }

  /**
   * 启动轮询（每 1s 执行一次轮询逻辑）
   */
  startPolling(): void {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(() => {
      this.poll();
    }, 1000);
    this.pollingInterval.unref(); // 不阻止进程退出
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
   * 添加窗口到轮询列表
   */
  addWindow(windowId: string, pid: number): void {
    this.trackedWindows.set(windowId, {
      pid,
      isActive: false,
      lastStatus: WindowStatus.Restoring,
      lastCheckTime: Date.now(),
    });
  }

  /**
   * 从轮询列表移除窗口
   */
  removeWindow(windowId: string): void {
    this.trackedWindows.delete(windowId);
  }

  /**
   * 标记活跃窗口（同时将其他窗口设为非活跃）
   */
  setActiveWindow(windowId: string): void {
    for (const tracked of this.trackedWindows.values()) {
      tracked.isActive = false;
    }
    const tracked = this.trackedWindows.get(windowId);
    if (tracked) {
      tracked.isActive = true;
    }
  }

  /**
   * 获取当前跟踪的窗口数量（用于测试）
   */
  getTrackedWindowCount(): number {
    return this.trackedWindows.size;
  }

  /**
   * 是否正在轮询（用于测试）
   */
  isPolling(): boolean {
    return this.pollingInterval !== null;
  }

  /**
   * 执行一次轮询逻辑
   */
  private poll(): void {
    const now = Date.now();

    for (const [windowId, tracked] of this.trackedWindows.entries()) {
      // 活跃窗口每 1s 检测，非活跃窗口每 5s 检测
      const interval = tracked.isActive ? 1000 : 5000;

      if (now - tracked.lastCheckTime < interval) {
        continue;
      }

      tracked.lastCheckTime = now;

      this.statusDetector.detectStatus(tracked.pid).then((newStatus) => {
        if (newStatus !== tracked.lastStatus) {
          tracked.lastStatus = newStatus;
          this.notifyStatusChange(windowId, newStatus);
        }
      }).catch(() => {
        // 检测失败时忽略，下次轮询重试
      });
    }
  }

  /**
   * 通过 IPC 推送状态变化事件到渲染进程
   */
  private notifyStatusChange(windowId: string, status: WindowStatus): void {
    if (this.mainWindow.isDestroyed()) return;

    this.mainWindow.webContents.send('window-status-changed', {
      windowId,
      status,
      timestamp: new Date().toISOString(),
    });
  }
}
