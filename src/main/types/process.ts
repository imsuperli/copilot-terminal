import { PaneBackend } from '../../shared/types/window';

/**
 * 统一的 PTY 接口
 * 兼容 node-pty 的 IPty 接口和 mock 实现
 */
export interface IPty {
  pid: number;
  cols: number;
  rows: number;
  process: string;
  handleFlowControl: boolean;

  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;

  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (exitCode: { exitCode: number; signal?: number }) => void): { dispose(): void };
}

// 终端配置
export interface TerminalConfig {
  workingDirectory: string;
  command?: string;  // 可选，指定要启动的 shell 程序
  env?: Record<string, string>;
  name?: string;  // 窗口名称
  windowId?: string;  // 关联的窗口 ID
  paneId?: string;  // 关联的窗格 ID（用于拆分功能）
  backend?: PaneBackend;
}

// 进程句柄
export interface ProcessHandle {
  pid: number;
  sessionId: string;
  pty: IPty;
}

// 进程状态
export enum ProcessStatus {
  Alive = 'alive',
  Exited = 'exited',
}

// 进程信息
export interface ProcessInfo {
  sessionId: string;
  backend: PaneBackend;
  pid: number;
  status: ProcessStatus;
  exitCode?: number;
  workingDirectory: string;
  command?: string;
  windowId?: string;  // 关联的窗口 ID
  paneId?: string;  // 关联的窗格 ID
}

// ProcessManager 接口
export interface IProcessManager {
  spawnTerminal(config: TerminalConfig): Promise<ProcessHandle>;
  killProcess(pid: number): Promise<void>;
  getProcessStatus(pid: number): ProcessInfo | null;
  getSessionIdByPane(windowId: string, paneId?: string): string | null;
  listProcesses(): ProcessInfo[];
  getPaneStatus(windowId: string, paneId: string): Promise<import('../../renderer/types/window').WindowStatus>;
  subscribeStatusChange(callback: (pid: number, status: import('../../renderer/types/window').WindowStatus) => void): void;
  destroy(): Promise<void>;
}
