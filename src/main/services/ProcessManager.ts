import { EventEmitter } from 'events';
import { platform } from 'os';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { IProcessManager, TerminalConfig, ProcessHandle, ProcessInfo, ProcessStatus } from '../types/process';
import { StatusDetectorImpl, IStatusDetector } from './StatusDetector';
import { WindowStatus } from '../../shared/types/window';

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
  private nextPid: number;
  private statusDetector: IStatusDetector;

  constructor() {
    super();
    this.processes = new Map();
    this.ptys = new Map();
    this.ptyDisposables = new Map();
    this.nextPid = 1000;  // Start from 1000 for mock PIDs
    this.statusDetector = new StatusDetectorImpl();
    this.statusDetector.startPolling();
  }

  /**
   * 创建新的终端进程
   */
  async spawnTerminal(config: TerminalConfig): Promise<ProcessHandle> {
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

    // Start tracking this PID before registering listeners (avoids race condition)
    this.statusDetector.trackPid(pid);

    // Register PTY listeners for status detection and save disposables
    const disposables: Array<{ dispose: () => void }> = [];

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

    // 实际终止 PTY 进程（node-pty 会自动终止子进程树）
    const ptyProcess = this.ptys.get(pid);
    if (ptyProcess && typeof ptyProcess.kill === 'function') {
      try {
        // 使用 SIGTERM 信号温和地终止进程
        ptyProcess.kill('SIGTERM');
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
   */
  subscribePtyData(pid: number, callback: (data: string) => void): () => void {
    const pty = this.ptys.get(pid);
    if (!pty) return () => {};

    // node-pty 的 onData 返回一个 disposable 对象
    const disposable = pty.onData(callback);

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

    // 第二步：Windows 上使用 taskkill 强制终止仍在运行的进程
    if (process.platform === 'win32' && pidsToKill.length > 0) {
      const { execSync } = require('child_process');
      console.log('[ProcessManager] Force killing remaining processes with taskkill...');
      let processedCount = 0;
      for (const pid of pidsToKill) {
        try {
          // /F 强制终止, /T 终止子进程树
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[ProcessManager] Force killed process tree ${pid}`);
        } catch (error) {
          // 进程可能已经优雅退出，忽略错误
          console.log(`[ProcessManager] Process ${pid} already exited (graceful shutdown succeeded)`);
        }
        processedCount++;
        // 通知进度
        if (progressCallback) {
          progressCallback(processedCount, totalProcesses);
        }
      }
    }

    // 不等待进程退出，直接清理
    this.processes.clear();
    this.ptys.clear();

    console.log('[ProcessManager] Destroy completed');
  }

  /**
   * 获取平台默认 shell
   */
  private getDefaultShell(): string {
    const currentPlatform = platform();

    if (currentPlatform === 'win32') {
      // Windows: 使用 where 命令查找 pwsh.exe (PowerShell 7+)
      try {
        execSync('where pwsh.exe', { stdio: 'ignore' });
        return 'pwsh.exe';
      } catch {
        // 回退到 cmd.exe，不使用旧版 powershell.exe
        return 'cmd.exe';
      }
    } else if (currentPlatform === 'darwin') {
      // macOS: 优先 zsh, 降级到 bash
      if (existsSync('/bin/zsh')) {
        return '/bin/zsh';
      }
      return '/bin/bash';
    } else {
      // Linux: bash
      return '/bin/bash';
    }
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

    // 清理环境变量，移除可能导致冲突的变量
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE; // 移除 Claude Code 环境变量，避免嵌套会话检测
    delete cleanEnv.VSCODE_INJECTION; // 移除 VS Code 注入变量

    // 创建真实的 PTY 进程
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: config.workingDirectory,
      env: cleanEnv,
    });

    return ptyProcess;
  }
}
