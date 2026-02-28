import { EventEmitter } from 'events';
import { platform } from 'os';
import { existsSync } from 'fs';
import { IProcessManager, TerminalConfig, ProcessHandle, ProcessInfo, ProcessStatus } from '../types/process';
import { StatusDetectorImpl, IStatusDetector } from './StatusDetector';
import { WindowStatus } from '../../renderer/types/window';

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
  private nextPid: number;
  private statusDetector: IStatusDetector;

  constructor() {
    super();
    this.processes = new Map();
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

    // Mock PTY creation (will be replaced with real node-pty when available)
    const pid = this.nextPid++;
    const mockPty = this.createMockPty(pid, config);

    // Store process info
    const processInfo: ProcessInfo = {
      pid,
      status: ProcessStatus.Alive,
      workingDirectory: config.workingDirectory,
      command,
      windowId: config.windowId,
    };
    this.processes.set(pid, processInfo);

    // Start tracking this PID before registering listeners (avoids race condition)
    this.statusDetector.trackPid(pid);

    // Register PTY listeners for status detection
    mockPty.onData((data: string) => {
      this.statusDetector.onPtyData(pid, data);
    });

    mockPty.onExit((exitCode: number) => {
      this.statusDetector.onProcessExit(pid, exitCode);
    });

    // Emit process-created event
    this.emit('process-created', processInfo);

    return {
      pid,
      pty: mockPty,
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

    // Mock process termination
    processInfo.status = ProcessStatus.Exited;
    processInfo.exitCode = 0;

    // Notify status detector of exit
    this.statusDetector.onProcessExit(pid, 0);

    // Emit process-exited event
    this.emit('process-exited', processInfo);

    // Clean up after a delay
    setTimeout(() => {
      this.processes.delete(pid);
      this.statusDetector.untrackPid(pid);
    }, 1000);
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
   * 获取窗口状态（通过 windowId）
   */
  async getWindowStatus(windowId: string): Promise<WindowStatus> {
    const processInfo = Array.from(this.processes.values()).find(p => p.windowId === windowId);
    if (!processInfo) {
      throw new Error(`Window not found: ${windowId}`);
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
   * 销毁 ProcessManager，释放资源
   */
  destroy(): void {
    this.statusDetector.destroy();
    this.processes.clear();
  }

  /**
   * 获取平台默认 shell
   */
  private getDefaultShell(): string {
    const currentPlatform = platform();

    if (currentPlatform === 'win32') {
      // Windows: 优先 pwsh.exe (PowerShell 7+), 降级到 cmd.exe
      const pwshPaths = [
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe',
      ];

      for (const path of pwshPaths) {
        if (existsSync(path)) {
          return path;
        }
      }

      return 'cmd.exe';  // Fallback
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
   * 创建 mock PTY (临时实现，待 node-pty 可用后替换)
   */
  private createMockPty(pid: number, config: TerminalConfig): any {
    return {
      pid,
      onData: (callback: (data: string) => void) => {
        // Mock: 模拟终端输出
        setTimeout(() => {
          callback(`Mock terminal started in ${config.workingDirectory}\r\n`);
        }, 100);
      },
      onExit: (callback: (exitCode: number) => void) => {
        // Mock: 模拟进程退出
      },
      write: (data: string) => {
        // Mock: 模拟写入终端
      },
      resize: (cols: number, rows: number) => {
        // Mock: 模拟调整终端大小
      },
      kill: () => {
        // Mock: 模拟终止进程
        this.killProcess(pid);
      },
    };
  }
}
