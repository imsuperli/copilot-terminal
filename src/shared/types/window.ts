import { ProjectConfig } from './project-config';

/**
 * 窗口状态枚举
 * 定义窗口在生命周期中的各种状态
 */
export enum WindowStatus {
  Running = 'running',           // 运行中
  WaitingForInput = 'waiting',   // 等待输入
  Completed = 'completed',       // 已完成
  Error = 'error',               // 出错
  Restoring = 'restoring',       // 恢复中（启动时）
  Paused = 'paused'              // 暂停（未启动）
}

/**
 * 窗格接口
 * 表示一个终端窗格的状态（拆分后的单个终端）
 */
export interface Pane {
  id: string;                    // UUID
  cwd: string;                   // 工作目录路径
  command: string;               // 启动命令（如 "pwsh.exe"）
  status: WindowStatus;          // 当前状态
  pid: number | null;            // 进程 PID
  lastOutput?: string;           // 最新输出摘要（前 100 字符）

  // tmux 兼容层扩展字段（用于 Claude Code Agent Teams）
  /** Pane 标题（通过 tmux select-pane -T 设置） */
  title?: string;

  /** 边框颜色（通过 tmux select-pane -P 或 set-option 设置） */
  borderColor?: string;

  /** 激活时的边框颜色（通过 tmux set-option pane-active-border-style 设置） */
  activeBorderColor?: string;

  /** 团队名称（Claude Agent Teams） */
  teamName?: string;

  /** Agent ID（唯一标识符） */
  agentId?: string;

  /** Agent 名称（显示名称） */
  agentName?: string;

  /** Agent 颜色（用于 UI 标识） */
  agentColor?: string;

  /** Teammate 模式：tmux（真实 tmux）、in-process（进程内模拟）、auto（自动检测） */
  teammateMode?: 'tmux' | 'in-process' | 'auto';
}

/**
 * 布局节点 - 窗格节点（叶子节点）
 */
export interface PaneNode {
  type: 'pane';
  id: string;                    // 窗格 ID
  pane: Pane;                    // 窗格数据
}

/**
 * 布局节点 - 拆分节点（分支节点）
 */
export interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';  // 拆分方向
  sizes: number[];               // 每个子节点的大小比例（总和为 1）
  children: LayoutNode[];        // 子节点列表
}

/**
 * 布局节点类型（递归）
 */
export type LayoutNode = PaneNode | SplitNode;

/**
 * 窗口接口
 * 表示一个终端窗口的完整状态（可包含多个窗格）
 */
export interface Window {
  id: string;                    // UUID
  name: string;                  // 窗口名称（用户可自定义）
  layout: LayoutNode;            // 布局树（根节点）
  activePaneId: string;          // 当前激活的窗格 ID
  createdAt: string;             // 创建时间（ISO 8601）
  lastActiveAt: string;          // 最后活跃时间
  archived?: boolean;            // 是否已归档
  projectConfig?: ProjectConfig; // 项目配置（从 copilot.json 读取）
  gitBranch?: string;            // Git 分支名称（如果是 git 仓库）
}

/**
 * @deprecated 使用 Window 接口代替
 * 保留用于向后兼容
 */
export type TerminalWindow = Window;

/**
 * 旧版窗口接口（用于数据迁移）
 */
export interface LegacyWindow {
  id: string;
  name: string;
  workingDirectory: string;
  command: string;
  status: WindowStatus;
  pid: number | null;
  createdAt: string;
  lastActiveAt: string;
  model?: string;
  lastOutput?: string;
  archived?: boolean;
}
