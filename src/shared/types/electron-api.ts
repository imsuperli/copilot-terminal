import { ViewChangedPayload } from './ipc';
import { ProjectConfig } from './project-config';
import { QuickNavConfig } from './quick-nav';
import { Window, WindowStatus } from './window';
import { WindowGroup } from './window-group';
import { CustomCategory } from './custom-category';
import {
  FeatureSettings,
  IDEConfig,
  Settings,
  StatusLineConfig,
  TerminalSettings,
  TmuxSettings,
  Workspace,
} from './workspace';

export interface IpcResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateWindowConfig {
  name?: string;
  workingDirectory: string;
  command?: string;
}

export interface StartWindowConfig {
  windowId: string;
  paneId?: string;
  name: string;
  workingDirectory: string;
  command?: string;
}

export interface SplitPaneConfig {
  workingDirectory: string;
  command?: string;
  env?: Record<string, string>;
  name?: string;
  windowId?: string;
  paneId?: string;
}

export interface StartWindowResult {
  pid: number;
  status: WindowStatus;
}

export interface CheckPtyOutputResult {
  hasOutput: boolean;
}

export interface PtyWriteMetadata {
  source?: string;
}

export interface ShellProgramOption {
  command: string;
  path: string;
  isDefault: boolean;
}

export interface SelectAndScanFolderResult {
  folders: Array<{ name: string; path: string }>;
  parentPath: string | null;
}

export interface WindowStatusChangedPayload {
  windowId: string;
  status: WindowStatus;
  timestamp: string;
}

export interface PaneStatusChangedPayload {
  windowId: string;
  paneId: string;
  status: WindowStatus;
  timestamp: string;
}

export interface WindowGitBranchChangedPayload {
  windowId: string;
  gitBranch: string | undefined;
  timestamp: string;
}

export interface TmuxPaneTitleChangedPayload {
  tmuxPaneId: string;
  windowId: string;
  paneId: string;
  title: string;
}

export interface TmuxPaneStyleMetadata {
  borderColor?: string;
  activeBorderColor?: string;
  teamName?: string;
  agentName?: string;
  agentColor?: string;
}

export interface TmuxPaneStyleChangedPayload {
  tmuxPaneId: string;
  windowId: string;
  paneId: string;
  metadata: TmuxPaneStyleMetadata;
}

export interface TmuxWindowSyncedPayload {
  window: Window;
}

export interface TmuxWindowRemovedPayload {
  windowId: string;
}

export interface ProjectConfigUpdatedPayload {
  windowId: string;
  projectConfig: ProjectConfig | null;
}

export interface ClaudeModelUpdatedPayload {
  windowId: string;
  model?: string;
  modelId?: string;
  contextPercentage?: number;
  cost?: number;
}

export interface PtyDataPayload {
  windowId: string;
  paneId?: string;
  data: string;
  seq?: number;
}

export interface PtyHistorySnapshot {
  chunks: string[];
  lastSeq: number;
}

export interface RestoreResultPayload {
  windowId: string;
  pid: number | null;
  status: 'restoring' | 'error';
  error?: string;
}

export interface WorkspaceRestoreErrorPayload {
  error: string;
}

export interface CleanupProgressPayload {
  current: number;
  total: number;
}

export interface AppVersionInfo {
  version: string;
  name: string;
}

export type ElectronEventHandler<T> = (event: unknown, payload: T) => void;
export type ElectronSignalHandler = (event: unknown) => void;

export type SettingsPatch =
  & Partial<Omit<Settings, 'ides' | 'quickNav' | 'statusLine' | 'terminal' | 'tmux' | 'features' | 'customCategories'>>
  & {
    ides?: IDEConfig[];
    quickNav?: QuickNavConfig;
    statusLine?: Partial<StatusLineConfig>;
    terminal?: Partial<TerminalSettings>;
    tmux?: Partial<TmuxSettings>;
    features?: Partial<FeatureSettings>;
    customCategories?: CustomCategory[];
  };

export interface ElectronAPI {
  platform: string;
  ping: () => Promise<IpcResponse<string>>;
  getAppVersion: () => Promise<IpcResponse<AppVersionInfo>>;

  createWindow: (config: CreateWindowConfig) => Promise<IpcResponse<Window>>;
  killTerminal: (pid: number) => Promise<IpcResponse<void>>;
  getTerminalStatus: (pid: number) => Promise<IpcResponse<unknown>>;
  listTerminals: () => Promise<IpcResponse<unknown[]>>;

  closeWindow: (windowId: string) => Promise<IpcResponse<void>>;
  deleteWindow: (windowId: string) => Promise<IpcResponse<void>>;
  startWindow: (config: StartWindowConfig) => Promise<IpcResponse<StartWindowResult>>;
  checkPtyOutput: (windowId: string, paneId: string) => Promise<IpcResponse<CheckPtyOutputResult>>;
  startGitWatch: (windowId: string, cwd: string) => Promise<IpcResponse<void>>;
  stopGitWatch: (windowId: string) => Promise<IpcResponse<void>>;

  validatePath: (path: string) => Promise<IpcResponse<boolean>>;
  createDirectory: (path: string) => Promise<IpcResponse<string>>;
  selectDirectory: () => Promise<IpcResponse<string | null>>;
  selectExecutableFile: () => Promise<IpcResponse<string | null>>;
  selectImageFile: (defaultPath?: string) => Promise<IpcResponse<string | null>>;
  selectAndScanFolder: () => Promise<IpcResponse<SelectAndScanFolderResult>>;
  openFolder: (path: string) => Promise<IpcResponse<void>>;
  openInIDE: (ide: string, path: string) => Promise<IpcResponse<void>>;
  openExternalUrl: (url: string) => Promise<IpcResponse<void>>;

  getSettings: () => Promise<IpcResponse<Settings>>;
  updateSettings: (settings: SettingsPatch) => Promise<IpcResponse<Settings>>;
  getAvailableShells: () => Promise<IpcResponse<ShellProgramOption[]>>;
  scanIDEs: () => Promise<IpcResponse<IDEConfig[]>>;
  scanSpecificIDE: (ideName: string) => Promise<IpcResponse<string | null>>;
  getSupportedIDENames: () => Promise<IpcResponse<string[]>>;
  updateIDEConfig: (ideConfig: IDEConfig) => Promise<IpcResponse<IDEConfig[]>>;
  deleteIDEConfig: (ideId: string) => Promise<IpcResponse<IDEConfig[]>>;
  getIDEIcon: (iconPath: string) => Promise<IpcResponse<string>>;

  statusLineCheckClaudeInstalled: () => Promise<IpcResponse<boolean>>;
  statusLineCheckConfigured: () => Promise<IpcResponse<boolean>>;
  statusLineConfigure: () => Promise<IpcResponse<boolean>>;
  statusLineRemove: () => Promise<IpcResponse<boolean>>;
  statusLineRestore: () => Promise<IpcResponse<boolean>>;

  onWindowStatusChanged: (callback: ElectronEventHandler<WindowStatusChangedPayload>) => void;
  offWindowStatusChanged: (callback: ElectronEventHandler<WindowStatusChangedPayload>) => void;
  onPaneStatusChanged: (callback: ElectronEventHandler<PaneStatusChangedPayload>) => void;
  offPaneStatusChanged: (callback: ElectronEventHandler<PaneStatusChangedPayload>) => void;
  onWindowGitBranchChanged: (callback: ElectronEventHandler<WindowGitBranchChangedPayload>) => void;
  offWindowGitBranchChanged: (callback: ElectronEventHandler<WindowGitBranchChangedPayload>) => void;
  onTmuxPaneTitleChanged: (callback: ElectronEventHandler<TmuxPaneTitleChangedPayload>) => void;
  offTmuxPaneTitleChanged: (callback: ElectronEventHandler<TmuxPaneTitleChangedPayload>) => void;
  onTmuxPaneStyleChanged: (callback: ElectronEventHandler<TmuxPaneStyleChangedPayload>) => void;
  offTmuxPaneStyleChanged: (callback: ElectronEventHandler<TmuxPaneStyleChangedPayload>) => void;
  onTmuxWindowSynced: (callback: ElectronEventHandler<TmuxWindowSyncedPayload>) => void;
  offTmuxWindowSynced: (callback: ElectronEventHandler<TmuxWindowSyncedPayload>) => void;
  onTmuxWindowRemoved: (callback: ElectronEventHandler<TmuxWindowRemovedPayload>) => void;
  offTmuxWindowRemoved: (callback: ElectronEventHandler<TmuxWindowRemovedPayload>) => void;
  onProjectConfigUpdated: (callback: ElectronEventHandler<ProjectConfigUpdatedPayload>) => void;
  offProjectConfigUpdated: (callback: ElectronEventHandler<ProjectConfigUpdatedPayload>) => void;
  onClaudeModelUpdated: (callback: ElectronEventHandler<ClaudeModelUpdatedPayload>) => void;
  offClaudeModelUpdated: (callback: ElectronEventHandler<ClaudeModelUpdatedPayload>) => void;

  ptyWrite: (
    windowId: string,
    paneId: string | undefined,
    data: string,
    metadata?: PtyWriteMetadata,
  ) => Promise<IpcResponse<void>>;
  ptyResize: (windowId: string, paneId: string | undefined, cols: number, rows: number) => Promise<IpcResponse<void>>;
  getPtyHistory: (paneId: string) => Promise<IpcResponse<PtyHistorySnapshot>>;
  onPtyData: (callback: ElectronEventHandler<PtyDataPayload>) => void;
  offPtyData: (callback: ElectronEventHandler<PtyDataPayload>) => void;

  splitPane: (config: SplitPaneConfig) => Promise<IpcResponse<{ pid: number }>>;
  closePane: (windowId: string, paneId: string) => Promise<IpcResponse<void>>;

  switchToTerminalView: (windowId: string) => Promise<IpcResponse<void>>;
  switchToUnifiedView: () => Promise<IpcResponse<void>>;
  setActivePane: (windowId: string, paneId: string | null) => Promise<IpcResponse<void>>;
  onViewChanged: (callback: ElectronEventHandler<ViewChangedPayload>) => void;
  offViewChanged: (callback: ElectronEventHandler<ViewChangedPayload>) => void;

  saveWorkspace: (windows: Window[]) => Promise<IpcResponse<void>>;
  loadWorkspace: () => Promise<IpcResponse<Workspace>>;
  onWorkspaceLoaded: (callback: ElectronEventHandler<Workspace>) => void;
  offWorkspaceLoaded: (callback: ElectronEventHandler<Workspace>) => void;
  triggerAutoSave: (windows?: Window[], groups?: WindowGroup[]) => void;

  writeClipboardText: (text: string) => Promise<IpcResponse<void>>;
  readClipboardText: () => Promise<IpcResponse<string>>;

  notifyRendererReady: () => void;

  onWindowRestored: (callback: ElectronEventHandler<RestoreResultPayload>) => void;
  offWindowRestored: (callback: ElectronEventHandler<RestoreResultPayload>) => void;
  onWorkspaceRestoreError: (callback: ElectronEventHandler<WorkspaceRestoreErrorPayload>) => void;
  offWorkspaceRestoreError: (callback: ElectronEventHandler<WorkspaceRestoreErrorPayload>) => void;
  recoverFromBackup: () => Promise<IpcResponse<Workspace>>;

  onCleanupStarted: (callback: ElectronSignalHandler) => void;
  offCleanupStarted: (callback: ElectronSignalHandler) => void;
  onCleanupProgress: (callback: ElectronEventHandler<CleanupProgressPayload>) => void;
  offCleanupProgress: (callback: ElectronEventHandler<CleanupProgressPayload>) => void;

  // Group management
  createGroup: (name: string, windowIds: string[]) => Promise<IpcResponse<WindowGroup>>;
  deleteGroup: (groupId: string) => Promise<IpcResponse<void>>;
  archiveGroup: (groupId: string) => Promise<IpcResponse<void>>;
  unarchiveGroup: (groupId: string) => Promise<IpcResponse<void>>;
  renameGroup: (groupId: string, name: string) => Promise<IpcResponse<void>>;
  addWindowToGroup: (groupId: string, windowId: string, direction: 'horizontal' | 'vertical', targetWindowId: string | null) => Promise<IpcResponse<void>>;
  removeWindowFromGroup: (groupId: string, windowId: string) => Promise<IpcResponse<{ dissolved: boolean }>>;
  updateGroupSplitSizes: (groupId: string, splitPath: number[], sizes: number[]) => Promise<IpcResponse<void>>;
}
