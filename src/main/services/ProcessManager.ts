import { EventEmitter } from 'events';
import { platform } from 'os';
import { existsSync } from 'fs';
import { IProcessManager, TerminalConfig, ProcessHandle, ProcessInfo, ProcessStatus } from '../types/process';
import { StatusDetectorImpl, IStatusDetector } from './StatusDetector';
import { WindowStatus } from '../../renderer/types/window';

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
  private nextPid: number;
  private statusDetector: IStatusDetector;

  constructor() {
    super();
    this.processes = new Map();
    this.ptys = new Map();
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
    };
    this.processes.set(pid, processInfo);
    this.ptys.set(pid, ptyProcess);

    // Start tracking this PID before registering listeners (avoids race condition)
    this.statusDetector.trackPid(pid);

    // Register PTY listeners for status detection
    ptyProcess.onData((data: string) => {
      this.statusDetector.onPtyData(pid, data);
    });

    ptyProcess.onExit((exitCode: number) => {
      this.statusDetector.onProcessExit(pid, exitCode);
    });

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
      this.ptys.delete(pid);
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
    // Store callback for cleanup
    const handler = (data: string) => callback(data);
    pty.onData(handler);
    return () => {
      // Mock PTY doesn't support removeListener, no-op
    };
  }

  /**
   * 销毁 ProcessManager，释放资源
   */
  destroy(): void {
    this.statusDetector.destroy();
    this.processes.clear();
    this.ptys.clear();
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
