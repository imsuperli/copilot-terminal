// 终端配置
export interface TerminalConfig {
  workingDirectory: string;
  command?: string;  // 可选,默认打开 shell
  env?: Record<string, string>;
  name?: string;  // 窗口名称
}

// 进程句柄
export interface ProcessHandle {
  pid: number;
  pty: any;  // IPty from node-pty (will be properly typed when node-pty is available)
}

// 进程状态
export enum ProcessStatus {
  Alive = 'alive',
  Exited = 'exited',
}

// 进程信息
export interface ProcessInfo {
  pid: number;
  status: ProcessStatus;
  exitCode?: number;
  workingDirectory: string;
  command?: string;
}

// ProcessManager 接口
export interface IProcessManager {
  spawnTerminal(config: TerminalConfig): Promise<ProcessHandle>;
  killProcess(pid: number): Promise<void>;
  getProcessStatus(pid: number): ProcessInfo | null;
  listProcesses(): ProcessInfo[];
}
