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
import { ChatProviderVaultService } from '../services/chat/ChatProviderVaultService';
import { CodeFileService } from '../services/code/CodeFileService';
import { CodeGitService } from '../services/code/CodeGitService';
import { CodeProjectIndexService } from '../services/code/CodeProjectIndexService';
import { CodePaneWatcherService } from '../services/code/CodePaneWatcherService';
import { CodeRunProfileService } from '../services/code/CodeRunProfileService';
import { CodeTestService } from '../services/code/CodeTestService';
import { DebugAdapterSupervisor } from '../services/debug/DebugAdapterSupervisor';
import { LanguageFeatureService } from '../services/language/LanguageFeatureService';
import { LanguageProjectContributionService } from '../services/language/LanguageProjectContributionService';
import { PluginManager } from '../services/plugins/PluginManager';
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
  chatProviderVaultService?: ChatProviderVaultService | null;
  codeFileService?: CodeFileService | null;
  codeGitService?: CodeGitService | null;
  codeProjectIndexService?: CodeProjectIndexService | null;
  codePaneWatcherService?: CodePaneWatcherService | null;
  codeRunProfileService?: CodeRunProfileService | null;
  codeTestService?: CodeTestService | null;
  debugAdapterSupervisor?: DebugAdapterSupervisor | null;
  languageFeatureService?: LanguageFeatureService | null;
  languageProjectContributionService?: LanguageProjectContributionService | null;
  pluginManager?: PluginManager | null;
  currentWorkspace: Workspace | null;
  getMainWindow?: () => BrowserWindow | null;
  getCurrentWorkspace: () => Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  syncProjectConfigWatchers?: () => Promise<void>;
}
