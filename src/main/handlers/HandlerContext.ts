import { BrowserWindow } from 'electron';
import { ProcessManager } from '../services/ProcessManager';
import { StatusPoller } from '../services/StatusPoller';
import { ViewSwitcherImpl } from '../services/ViewSwitcher';
import { WorkspaceManagerImpl } from '../services/WorkspaceManager';
import { AutoSaveManagerImpl } from '../services/AutoSaveManager';
import { PtySubscriptionManager } from '../services/PtySubscriptionManager';
import { GitBranchWatcher } from '../services/GitBranchWatcher';
import { TmuxCompatService } from '../services/TmuxCompatService';
import { SSHProfileStore } from '../services/ssh/SSHProfileStore';
import { SSHVaultService } from '../services/ssh/SSHVaultService';
import { SSHKnownHostsStore } from '../services/ssh/SSHKnownHostsStore';
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
  gitBranchWatcher: GitBranchWatcher | null;
  tmuxCompatService?: TmuxCompatService | null;
  sshProfileStore?: SSHProfileStore | null;
  sshVaultService?: SSHVaultService | null;
  sshKnownHostsStore?: SSHKnownHostsStore | null;
  currentWorkspace: Workspace | null;
  getCurrentWorkspace: () => Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  syncProjectConfigWatchers?: () => Promise<void>;
}
