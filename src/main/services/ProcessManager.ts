import { EventEmitter } from 'events';
import { platform } from 'os';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { IProcessManager, TerminalConfig, ProcessHandle, ProcessInfo, ProcessStatus } from '../types/process';
import { StatusDetectorImpl, IStatusDetector } from './StatusDetector';
import { WindowStatus } from '../../shared/types/window';
import { getLatestEnvironmentVariables } from '../utils/environment';

// 尝试导入 node-pty，如果失败则使用 mock
let pty: any;
try {
  pty = require('@homebridge/node-pty-prebuilt-multiarch');
} catch {
  try {
    pty = require('node-pty');
  } catch {
    pty = null;
  }
}

/**
 * ProcessManager - 终端进程管理服务
 * 
 * 负责创建、监控和终止终端进程
 * 使用 node-pty 进行跨平台 PTY 进程管理
 * 
 * NOTE: 当前实现使用 mock PTY，待 node-pty 编译环境就绪后替换为真实实现
 */
export class ProcessManager extends EventEmitter implements IProcessManager {
  private processes: Map<number, ProcessInfo>;
  private ptys: Map<number, any>;
  private ptyDisposables: Map<number, Array<{ dispose: () => void }>>;
  private ptyOutputBuffers: Map<number, string[]>; // 缓存 PTY 初始输出
  private paneIndex: Map<string, number>; // "windowId:paneId" → pid 索引，用于 O(1) 查找
  private nextPid: number;
  private statusDetector: IStatusDetector;
  private cachedDefaultShell: string | null;
  private cachedSpawnEnv: NodeJS.ProcessEnv | null;
  private cachedSpawnEnvAt: number;
  private readonly SPAWN_ENV_CACHE_TTL_MS = 30000;

  constructor() {
    super();
    this.processes = new Map();
    this.ptys = new Map();
    this.ptyDisposables = new Map();
    this.ptyOutputBuffers = new Map();
    this.paneIndex = new Map();
    this.nextPid = 1000;  // Start from 1000 for mock PIDs
    this.statusDetector = new StatusDetectorImpl();
    this.cachedDefaultShell = null;
    this.cachedSpawnEnv = null;
    this.cachedSpawnEnvAt = 0;
    // 注意：不再启动 StatusDetector 的内部轮询，由 StatusPoller 统一管理轮询
  }

  /**
   * 创建新的终端进程
   */
  async spawnTerminal(config: TerminalConfig): Promise<ProcessHandle> {
    const spawnStartAt = Date.now();

    // Validate working directory
    if (!existsSync(config.workingDirectory)) {
      throw new Error(`Working directory does not exist: ${config.workingDirectory}`);
    }

    // Get default shell for platform
    const shell = this.getDefaultShell();
    const command = config.command || shell;

    // 创建 PTY 进程（真实或 mock）
    let ptyProcess: any;
    let pid: number;

    if (pty) {
      // 使用真实的 node-pty
      ptyProcess = this.createRealPty(config);
      pid = ptyProcess.pid;
    } else {
      // 使用 mock PTY
      pid = this.nextPid++;
      ptyProcess = this.createMockPty(pid, config);
    }

    // Store process info
    const processInfo: ProcessInfo = {
      pid,
      status: ProcessStatus.Alive,
      workingDirectory: config.workingDirectory,
      command,
      windowId: config.windowId,
      paneId: config.paneId,
    };
    this.processes.set(pid, processInfo);
    this.ptys.set(pid, ptyProcess);

    // 维护 paneIndex 索引，用于 O(1) 查找
    const paneKey = this.getPaneKey(config.windowId, config.paneId);
    this.paneIndex.set(paneKey, pid);

    // 初始化输出缓冲区，用于缓存早期输出（避免竞态条件导致数据丢失）
    this.ptyOutputBuffers.set(pid, []);

    // Start tracking this PID before registering listeners (avoids race condition)
    this.statusDetector.trackPid(pid);

    // 立即开始缓存 PTY 输出（在任何订阅之前）
    const bufferDisposable = ptyProcess.onData((data: string) => {
      const buffer = this.ptyOutputBuffers.get(pid);
      if (buffer) {
        buffer.push(data);
        // 限制缓冲区大小，避免内存泄漏（增加到 500 条消息，覆盖更多启动输出）
        if (buffer.length > 500) {
          buffer.shift();
        }
      }
    });

    // Register PTY listeners for status detection and save disposables
    const disposables: Array<{ dispose: () => void }> = [];

    // 保存缓冲区监听器
    if (bufferDisposable && typeof bufferDisposable.dispose === 'function') {
      disposables.push(bufferDisposable);
    }

    const onDataDisposable = ptyProcess.onData((data: string) => {
      this.statusDetector.onPtyData(pid, data);
    });
    if (onDataDisposable && typeof onDataDisposable.dispose === 'function') {
      disposables.push(onDataDisposable);
    }

    const onExitDisposable = ptyProcess.onExit((exitCode: number) => {
      this.statusDetector.onProcessExit(pid, exitCode);
    });
    if (onExitDisposable && typeof onExitDisposable.dispose === 'function') {
      disposables.push(onExitDisposable);
    }

    // Save disposables for cleanup
    this.ptyDisposables.set(pid, disposables);

    // Emit process-created event
    this.emit('process-created', processInfo);

    const spawnDuration = Date.now() - spawnStartAt;
    if (spawnDuration > 400 && process.env.NODE_ENV === 'development') {
      console.warn(
        `[ProcessManager] Slow spawn detected (${spawnDuration}ms) for windowId=${config.windowId ?? 'unknown'}, paneId=${config.paneId ?? 'unknown'}`
      );
    }

    return {
      pid,
      pty: ptyProcess,
    };
  }

  /**
   * 终止指定进程
   */
  async killProcess(pid: number): Promise<void> {
    const processInfo = this.processes.get(pid);
    if (!processInfo) {
      throw new Error(`Process not found: ${pid}`);
    }

    if (processInfo.status === ProcessStatus.Exited) {
      throw new Error(`Process already exited: ${pid}`);
    }

    // 清理 PTY 事件监听器
    const disposables = this.ptyDisposables.get(pid);
    if (disposables) {
      disposables.forEach(d => {
        try {
          d.dispose();
        } catch (error) {
          // 忽略清理错误
        }
      });
      this.ptyDisposables.delete(pid);
    }

    // 清理输出缓冲区
    this.ptyOutputBuffers.delete(pid);

    // 清理 paneIndex 索引
    const paneKey = this.getPaneKey(processInfo.windowId, processInfo.paneId);
    this.paneIndex.delete(paneKey);

    // 实际终止 PTY 进程
    const ptyProcess = this.ptys.get(pid);
    if (ptyProcess && typeof ptyProcess.kill === 'function') {
      try {
        if (platform() === 'win32') {
          // Windows: 使用 taskkill 强制终止进程树
          this.killProcessTreeWindows(pid);
        } else {
          // Unix: 使用 SIGTERM 信号温和地终止进程
          ptyProcess.kill('SIGTERM');
        }
      } catch (error) {
        // 忽略错误，因为进程可能已经退出
        if (process.env.NODE_ENV === 'development') {
          console.log(`PTY process ${pid} already exited or kill failed`);
        }
      }
    }

    // 更新进程状态
    processInfo.status = ProcessStatus.Exited;
    processInfo.exitCode = 0;

    // Notify status detector of exit
    this.statusDetector.onProcessExit(pid, 0);

    // Emit process-exited event
    this.emit('process-exited', processInfo);

    // Clean up after a delay
    const cleanupTimer = setTimeout(() => {
      this.processes.delete(pid);
      this.ptys.delete(pid);
      this.statusDetector.untrackPid(pid);
    }, 1000);
    cleanupTimer.unref(); // 不阻止进程退出
  }

  /**
   * 获取进程状态
   */
  getProcessStatus(pid: number): ProcessInfo | null {
    return this.processes.get(pid) || null;
  }

  /**
   * 列出所有进程
   */
  listProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  /**
   * 通过 windowId 和 paneId 查找 PID（O(1) 查找）
   *
   * @returns PID 或 null（如果未找到）
   */
  getPidByPane(windowId: string, paneId?: string): number | null {
    const paneKey = this.getPaneKey(windowId, paneId);
    return this.paneIndex.get(paneKey) ?? null;
  }

  /**
   * 生成 paneIndex 的 key
   */
  private getPaneKey(windowId: string | undefined, paneId: string | undefined): string {
    return `${windowId ?? ''}:${paneId ?? ''}`;
  }

  /**
   * 获取窗格状态（通过 windowId 和 paneId）
   */
  async getPaneStatus(windowId: string, paneId: string): Promise<WindowStatus> {
    const processInfo = Array.from(this.processes.values()).find(
      p => p.windowId === windowId && p.paneId === paneId
    );
    if (!processInfo) {
      throw new Error(`Pane not found: ${windowId}/${paneId}`);
    }
    return this.statusDetector.detectStatus(processInfo.pid);
  }

  /**
   * 获取 StatusDetector 实例（供 StatusPoller 使用）
   */
  getStatusDetector(): IStatusDetector {
    return this.statusDetector;
  }

  /**
   * 订阅状态变化事件，返回取消订阅函数
   */
  subscribeStatusChange(callback: (pid: number, status: WindowStatus) => void): () => void {
    return this.statusDetector.subscribeStatusChange(callback);
  }

  /**
   * 向 PTY 写入数据（用户输入）
   */
  writeToPty(pid: number, data: string): void {
    const pty = this.ptys.get(pid);
    if (pty) {
      pty.write(data);
    }
  }

  /**
   * 调整 PTY 大小
   */
  resizePty(pid: number, cols: number, rows: number): void {
    const pty = this.ptys.get(pid);
    if (pty) {
      pty.resize(cols, rows);
    }
  }

  /**
   * 订阅 PTY 数据输出，返回取消订阅函数
   *
   * 注意：首次订阅时会先发送缓存的初始输出，避免竞态条件导致数据丢失
   */
  subscribePtyData(pid: number, callback: (data: string) => void): () => void {
    const pty = this.ptys.get(pid);
    if (!pty) return () => {};

    // 包装回调，添加错误处理，防止回调异常中断 PTY 数据流
    const safeCallback = (data: string) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[ProcessManager] PTY data callback error for pid ${pid}:`, error);
        // 不要让错误中断 PTY 数据流
      }
    };

    // 先发送缓存的初始输出（如果有）
    const buffer = this.ptyOutputBuffers.get(pid);
    if (buffer && buffer.length > 0) {
      // 使用 setImmediate 异步发送，避免阻塞
      setImmediate(() => {
        for (const data of buffer) {
          safeCallback(data);
        }
      });
      // 清空缓冲区，避免重复发送
      this.ptyOutputBuffers.delete(pid);
    }

    // node-pty 的 onData 返回一个 disposable 对象
    const disposable = pty.onData(safeCallback);

    // 返回清理函数
    return () => {
      if (disposable && typeof disposable.dispose === 'function') {
        disposable.dispose();
      }
    };
  }

  /**
   * 销毁 ProcessManager，释放资源
   */
  async destroy(progressCallback?: (current: number, total: number) => void): Promise<void> {
    console.log('[ProcessManager] Starting destroy...');

    // 先停止状态检测器，避免在清理过程中触发检测
    this.statusDetector.destroy();

    // 清理所有 PTY 事件监听器
    for (const [pid, disposables] of this.ptyDisposables.entries()) {
      disposables.forEach(d => {
        try {
          d.dispose();
        } catch (error) {
          // 忽略清理错误
        }
      });
    }
    this.ptyDisposables.clear();

    // 收集所有 PTY 进程的 PID
    const pidsToKill: number[] = [];

    // 第一步：尝试优雅终止（SIGTERM）
    for (const [pid, pty] of this.ptys.entries()) {
      pidsToKill.push(pid);
      if (pty && typeof pty.kill === 'function') {
        try {
          // 先使用 SIGTERM 优雅终止
          pty.kill('SIGTERM');
          console.log(`[ProcessManager] Sent SIGTERM to PTY process ${pid}`);
        } catch (error) {
          // 忽略错误，因为进程可能已经退出
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ProcessManager] PTY process ${pid} already exited or kill failed`);
          }
        }
      }
    }

    const totalProcesses = pidsToKill.length;

    // 等待 300ms 让进程有机会优雅退出
    if (pidsToKill.length > 0) {
      console.log('[ProcessManager] Waiting 300ms for graceful shutdown...');
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 第二步：强制终止所有进程及其子进程树
    if (pidsToKill.length > 0) {
      console.log('[ProcessManager] Force killing remaining processes and their children...');

      if (platform() === 'win32') {
        // Windows: 使用 taskkill /T 一次性终止进程树，避免递归查询
        // 这比逐个查询子进程快得多，且不会阻塞主线程太久
        await this.killProcessTreesBatch(pidsToKill, progressCallback, totalProcesses);
      } else {
        // Unix/macOS: 使用进程组终止子进程
        await this.killProcessTreesUnix(pidsToKill, progressCallback, totalProcesses);
      }
    }

    // 不等待进程退出，直接清理
    this.processes.clear();
    this.ptys.clear();
    this.paneIndex.clear();

    console.log('[ProcessManager] Destroy completed');
  }

  /**
   * 批量终止进程树（Windows）
   * 使用 taskkill /T 一次性终止进程树，避免递归查询子进程
   */
  private async killProcessTreesBatch(
    pids: number[],
    progressCallback?: (current: number, total: number) => void,
    total?: number
  ): Promise<void> {
    const totalProcesses = total || pids.length;
    let processedCount = 0;

    // 分批处理，每批最多 10 个进程，避免命令行过长
    const batchSize = 10;
    for (let i = 0; i < pids.length; i += batchSize) {
      const batch = pids.slice(i, i + batchSize);

      // 使用 Promise.all 并行终止多个进程树
      await Promise.all(
        batch.map(async (pid) => {
          try {
            // 使用 taskkill /F /T 强制终止进程树
            // /F: 强制终止
            // /T: 终止进程及其所有子进程
            await new Promise<void>((resolve) => {
              // 使用 setImmediate 将 execSync 放到下一个事件循环，避免阻塞 UI
              setImmediate(() => {
                try {
                  execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
                  console.log(`[ProcessManager] Killed process tree for PID ${pid}`);
                } catch (error) {
                  // 进程可能已经退出，忽略错误
                  console.log(`[ProcessManager] Process ${pid} already exited`);
                }
                resolve();
              });
            });
          } catch (error) {
            console.log(`[ProcessManager] Failed to kill process ${pid}`);
          }
        })
      );

      // 更新进度（每批处理完后更新一次，减少 IPC 调用频率）
      processedCount += batch.length;
      if (progressCallback) {
        progressCallback(Math.min(processedCount, totalProcesses), totalProcesses);
      }

      // 每批之间短暂延迟，让 UI 有机会更新
      if (i + batchSize < pids.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * 批量终止进程树（Unix/macOS）
   * 使用进程组 (PGID) 终止整个进程树
   */
  private async killProcessTreesUnix(
    pids: number[],
    progressCallback?: (current: number, total: number) => void,
    total?: number
  ): Promise<void> {
    const totalProcesses = total || pids.length;
    let processedCount = 0;

    // 分批处理，每批最多 10 个进程
    const batchSize = 10;
    for (let i = 0; i < pids.length; i += batchSize) {
      const batch = pids.slice(i, i + batchSize);

      // 使用 Promise.all 并行终止多个进程树
      await Promise.all(
        batch.map(async (pid) => {
          try {
            await new Promise<void>((resolve) => {
              setImmediate(() => {
                try {
                  // 方法1: 尝试终止进程组（负 PID 表示进程组）
                  // 这会终止该进程及其所有子进程
                  try {
                    process.kill(-pid, 'SIGKILL');
                    console.log(`[ProcessManager] Killed process group -${pid}`);
                  } catch (pgidError) {
                    // 如果进程组终止失败，尝试直接终止进程
                    try {
                      process.kill(pid, 'SIGKILL');
                      console.log(`[ProcessManager] Killed process ${pid}`);
                    } catch (pidError) {
                      console.log(`[ProcessManager] Process ${pid} already exited`);
                    }
                  }

                  // 方法2: 使用 pkill 终止子进程（备用方案）
                  // pkill -P <pid> 会终止所有父进程为 <pid> 的子进程
                  try {
                    execSync(`pkill -9 -P ${pid}`, { stdio: 'ignore' });
                    console.log(`[ProcessManager] Killed children of process ${pid}`);
                  } catch (error) {
                    // 忽略错误，可能没有子进程
                  }
                } catch (error) {
                  console.log(`[ProcessManager] Failed to kill process ${pid}`);
                }
                resolve();
              });
            });
          } catch (error) {
            console.log(`[ProcessManager] Failed to kill process ${pid}`);
          }
        })
      );

      // 更新进度（每批处理完后更新一次，减少 IPC 调用频率）
      processedCount += batch.length;
      if (progressCallback) {
        progressCallback(Math.min(processedCount, totalProcesses), totalProcesses);
      }

      // 每批之间短暂延迟，让 UI 有机会更新
      if (i + batchSize < pids.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * Windows: 强制终止进程树
   */
  private killProcessTreeWindows(pid: number): void {
    try {
      // 使用 taskkill /F /T 强制终止进程及其所有子进程
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      console.log(`[ProcessManager] Killed process tree for PID ${pid}`);
    } catch (error) {
      // 进程可能已经退出，忽略错误
      console.log(`[ProcessManager] Process ${pid} already exited or kill failed`);
    }
  }

  /**
   * 获取平台默认 shell
   */
  private getDefaultShell(): string {
    if (this.cachedDefaultShell) {
      return this.cachedDefaultShell;
    }

    let shell: string;
    const currentPlatform = platform();

    if (currentPlatform === 'win32') {
      // Windows: 使用 where 命令查找 pwsh.exe (PowerShell 7+)
      try {
        execSync('where pwsh.exe', { stdio: 'ignore' });
        shell = 'pwsh.exe';
      } catch {
        // 回退到 cmd.exe，不使用旧版 powershell.exe
        shell = 'cmd.exe';
      }
    } else if (currentPlatform === 'darwin') {
      // macOS: 优先 zsh, 降级到 bash
      if (existsSync('/bin/zsh')) {
        shell = '/bin/zsh';
      } else {
        shell = '/bin/bash';
      }
    } else {
      // Linux: bash
      shell = '/bin/bash';
    }

    this.cachedDefaultShell = shell;
    return shell;
  }

  /**
   * 获取用于创建 PTY 的环境变量（带短期缓存）
   * 说明：Windows 下读取注册表是同步命令，缓存可显著降低卡顿概率。
   */
  private getSpawnEnvironment(): NodeJS.ProcessEnv {
    const now = Date.now();
    if (
      this.cachedSpawnEnv &&
      now - this.cachedSpawnEnvAt < this.SPAWN_ENV_CACHE_TTL_MS
    ) {
      return this.cachedSpawnEnv;
    }

    this.cachedSpawnEnv = getLatestEnvironmentVariables();
    this.cachedSpawnEnvAt = now;
    return this.cachedSpawnEnv;
  }

  /**
   * 创建 Mock PTY 进程（仅在 node-pty 不可用时使用）
   */
  private createMockPty(pid: number, config: TerminalConfig): any {
    // Mock 实现
    const dataCallbacks: Array<(data: string) => void> = [];
    const exitCallbacks: Array<(exitCode: number) => void> = [];

    return {
      pid,
      onData: (callback: (data: string) => void) => {
        dataCallbacks.push(callback);
        // Mock: 模拟终端输出
        setTimeout(() => {
          callback(`Mock terminal started in ${config.workingDirectory}\r\n`);
          callback(`$ `); // 显示提示符
        }, 100);
      },
      onExit: (callback: (exitCode: number) => void) => {
        exitCallbacks.push(callback);
      },
      write: (data: string) => {
        // Mock: 回显用户输入并模拟命令执行
        dataCallbacks.forEach(cb => {
          cb(data); // 回显输入

          // 如果是回车，模拟命令执行
          if (data === '\r') {
            cb('\r\n$ '); // 新行 + 提示符
          }
        });
      },
      resize: (cols: number, rows: number) => {
        // Mock: 模拟调整终端大小（无需实际操作）
      },
      kill: () => {
        // Mock: 模拟终止进程
        exitCallbacks.forEach(cb => cb(0));
        this.killProcess(pid);
      },
    };
  }

  /**
   * 创建真实的 PTY 进程（使用 node-pty）
   */
  private createRealPty(config: TerminalConfig): any {
    const shell = this.getDefaultShell();
    const command = config.command || shell;

    // 获取最新的系统环境变量（Windows 从注册表读取，macOS/Linux 使用 process.env）
    const latestEnv = this.getSpawnEnvironment();

    // 清理环境变量，移除可能导致冲突的变量
    const cleanEnv = { ...latestEnv };
    delete cleanEnv.CLAUDECODE; // 移除 Claude Code 环境变量，避免嵌套会话检测
    delete cleanEnv.VSCODE_INJECTION; // 移除 VS Code 注入变量

    // 注入窗口 ID 环境变量（供 statusLine 插件使用）
    cleanEnv.AUSOME_TERMINAL_WINDOW_ID = config.windowId;

    // 创建真实的 PTY 进程
    const ptySpawnOptions: Record<string, unknown> = {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: config.workingDirectory,
      env: cleanEnv,
    };

    if (platform() === 'win32') {
      ptySpawnOptions.useConpty = true;
      ptySpawnOptions.useConptyDll = true;
    }

    const ptyProcess = pty.spawn(shell, [], ptySpawnOptions);

    return ptyProcess;
  }
}
