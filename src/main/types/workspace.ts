import { Window } from '../../shared/types/window';

/**
 * IDE 配置
 */
export interface IDEConfig {
  id: string;              // 唯一标识符
  name: string;            // 显示名称（如 "VS Code", "IntelliJ IDEA"）
  command: string;         // 命令行命令（如 "code", "idea"）
  path?: string;           // 可执行文件路径（可选，如果在 PATH 中则不需要）
  enabled: boolean;        // 是否启用
  icon?: string;           // 图标名称（可选）
}

/**
 * Claude Code StatusLine 配置
 */
export interface StatusLineConfig {
  enabled: boolean;                    // 是否启用插件
  displayLocation: 'cli' | 'card' | 'both';  // 展示位置
  cliFormat: 'full' | 'compact';       // CLI 状态栏格式
  cardFormat: 'full' | 'compact' | 'badge';  // WindowCard 格式
  showModel: boolean;                  // 显示模型名称
  showContext: boolean;                // 显示上下文百分比
  showCost: boolean;                   // 显示成本
  showTime: boolean;                   // 显示会话时长
  showTokens: boolean;                 // 显示 Token 统计
}

/**
 * 工作区设置
 */
export interface Settings {
  notificationsEnabled: boolean;
  theme: 'dark' | 'light';
  autoSave: boolean;
  autoSaveInterval: number;  // 自动保存间隔（分钟）
  ides: IDEConfig[];         // IDE 配置列表
  statusLine?: StatusLineConfig;  // Claude Code StatusLine 配置
}

/**
 * 工作区配置
 * 包含所有窗口状态和应用设置
 */
export interface Workspace {
  version: string;           // 数据格式版本
  windows: Window[];         // 所有窗口配置
  settings: Settings;        // 应用设置
  lastSavedAt: string;       // 最后保存时间（ISO 8601）
}
