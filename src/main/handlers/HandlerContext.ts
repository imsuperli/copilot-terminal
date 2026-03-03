import { BrowserWindow } from 'electron';
import { ProcessManager } from '../services/ProcessManager';
import { StatusPoller } from '../services/StatusPoller';
import { ViewSwitcherImpl } from '../services/ViewSwitcher';
import { WorkspaceManagerImpl } from '../services/WorkspaceManager';
import { AutoSaveManagerImpl } from '../services/AutoSaveManager';
import { PtySubscriptionManager } from '../services/PtySubscriptionManager';
import { Workspace } from '../types/workspace';

/**
 * IPC Handler 上下文
 * 包含所有 handlers 需要的共享资源
 */
export interface HandlerContext {
  mainWindow: BrowserWindow | null;
  processManager: ProcessManager | null;
  statusPoller: StatusPoller | null;
  viewSwitcher: ViewSwitcherImpl | null;
  workspaceManager: WorkspaceManagerImpl | null;
  autoSaveManager: AutoSaveManagerImpl | null;
  ptySubscriptionManager: PtySubscriptionManager | null;
  ptyOutputCache: Map<string, string[]>;
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
}

/**
 * 常量配置
 */
export const MAX_CACHE_SIZE = 1000; // 每个窗格最多缓存 1000 条输出
