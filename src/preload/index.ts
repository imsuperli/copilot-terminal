import { contextBridge, ipcRenderer } from 'electron';

// 暴露受控的 IPC API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  ping: () => ipcRenderer.invoke('ping'),

  // Terminal management
  createWindow: (config: { name?: string; workingDirectory: string; command?: string }) =>
    ipcRenderer.invoke('create-window', config),
  killTerminal: (pid: number) => ipcRenderer.invoke('kill-terminal', pid),
  getTerminalStatus: (pid: number) => ipcRenderer.invoke('get-terminal-status', pid),
  listTerminals: () => ipcRenderer.invoke('list-terminals'),

  // Window management
  closeWindow: (windowId: string) => ipcRenderer.invoke('close-window', { windowId }),
  deleteWindow: (windowId: string) => ipcRenderer.invoke('delete-window', { windowId }),
  startWindow: (config: { windowId: string; paneId?: string; name: string; workingDirectory: string; command: string }) =>
    ipcRenderer.invoke('start-window', config),
  checkPtyOutput: (windowId: string, paneId: string) => ipcRenderer.invoke('check-pty-output', { windowId, paneId }),
  startGitWatch: (windowId: string, cwd: string) => ipcRenderer.invoke('start-git-watch', { windowId, cwd }),
  stopGitWatch: (windowId: string) => ipcRenderer.invoke('stop-git-watch', { windowId }),

  // File system
  validatePath: (path: string) => ipcRenderer.invoke('validate-path', path),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectAndScanFolder: () => ipcRenderer.invoke('select-and-scan-folder'),
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', { path }),
  openInIDE: (ide: string, path: string) => ipcRenderer.invoke('open-in-ide', { ide, path }),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', { url }),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: unknown) => ipcRenderer.invoke('update-settings', settings),
  scanIDEs: () => ipcRenderer.invoke('scan-ides'),
  scanSpecificIDE: (ideName: string) => ipcRenderer.invoke('scan-specific-ide', ideName),
  getSupportedIDENames: () => ipcRenderer.invoke('get-supported-ide-names'),
  updateIDEConfig: (ideConfig: unknown) => ipcRenderer.invoke('update-ide-config', ideConfig),
  deleteIDEConfig: (ideId: string) => ipcRenderer.invoke('delete-ide-config', ideId),
  getIDEIcon: (iconPath: string) => ipcRenderer.invoke('get-ide-icon', iconPath),

  // StatusLine
  statusLineCheckClaudeInstalled: () => ipcRenderer.invoke('statusline-check-claude-installed'),
  statusLineCheckConfigured: () => ipcRenderer.invoke('statusline-check-configured'),
  statusLineConfigure: () => ipcRenderer.invoke('statusline-configure'),
  statusLineRemove: () => ipcRenderer.invoke('statusline-remove'),
  statusLineRestore: () => ipcRenderer.invoke('statusline-restore'),

  // Status events
  onWindowStatusChanged: (callback: (event: unknown, payload: unknown) => void) => {
    ipcRenderer.on('window-status-changed', callback);
  },
  offWindowStatusChanged: (callback: (event: unknown, payload: unknown) => void) =>
    ipcRenderer.removeListener('window-status-changed', callback),
  onPaneStatusChanged: (callback: (event: unknown, payload: unknown) => void) => {
    ipcRenderer.on('pane-status-changed', callback);
  },
  offPaneStatusChanged: (callback: (event: unknown, payload: unknown) => void) =>
    ipcRenderer.removeListener('pane-status-changed', callback),
  onWindowGitBranchChanged: (callback: (event: unknown, payload: unknown) => void) => {
    ipcRenderer.on('window-git-branch-changed', callback);
  },
  offWindowGitBranchChanged: (callback: (event: unknown, payload: unknown) => void) =>
    ipcRenderer.removeListener('window-git-branch-changed', callback),

  // Tmux pane metadata events
  onTmuxPaneTitleChanged: (callback: (event: unknown, payload: { tmuxPaneId: string; windowId: string; paneId: string; title: string }) => void) => {
    ipcRenderer.on('tmux:pane-title-changed', callback);
  },
  offTmuxPaneTitleChanged: (callback: (event: unknown, payload: { tmuxPaneId: string; windowId: string; paneId: string; title: string }) => void) => {
    ipcRenderer.removeListener('tmux:pane-title-changed', callback);
  },
  onTmuxPaneStyleChanged: (callback: (event: unknown, payload: { tmuxPaneId: string; windowId: string; paneId: string; metadata: unknown }) => void) => {
    ipcRenderer.on('tmux:pane-style-changed', callback);
  },
  offTmuxPaneStyleChanged: (callback: (event: unknown, payload: { tmuxPaneId: string; windowId: string; paneId: string; metadata: unknown }) => void) => {
    ipcRenderer.removeListener('tmux:pane-style-changed', callback);
  },
  onTmuxWindowSynced: (callback: (event: unknown, payload: { window: unknown }) => void) => {
    ipcRenderer.on('tmux:window-synced', callback);
  },
  offTmuxWindowSynced: (callback: (event: unknown, payload: { window: unknown }) => void) => {
    ipcRenderer.removeListener('tmux:window-synced', callback);
  },
  onTmuxWindowRemoved: (callback: (event: unknown, payload: { windowId: string }) => void) => {
    ipcRenderer.on('tmux:window-removed', callback);
  },
  offTmuxWindowRemoved: (callback: (event: unknown, payload: { windowId: string }) => void) => {
    ipcRenderer.removeListener('tmux:window-removed', callback);
  },

  // Project config updates
  onProjectConfigUpdated: (callback: (event: unknown, payload: { windowId: string; projectConfig: unknown }) => void) => {
    ipcRenderer.on('project-config-updated', callback);
  },
  offProjectConfigUpdated: (callback: (event: unknown, payload: { windowId: string; projectConfig: unknown }) => void) => {
    ipcRenderer.removeListener('project-config-updated', callback);
  },

  // Claude model updates
  onClaudeModelUpdated: (callback: (event: unknown, payload: { windowId: string; model?: string; modelId?: string; contextPercentage?: number; cost?: number }) => void) => {
    ipcRenderer.on('claude-model-updated', callback);
  },
  offClaudeModelUpdated: (callback: (event: unknown, payload: { windowId: string; model?: string; modelId?: string; contextPercentage?: number; cost?: number }) => void) => {
    ipcRenderer.removeListener('claude-model-updated', callback);
  },

  // PTY I/O
  ptyWrite: (windowId: string, paneId: string | undefined, data: string) =>
    ipcRenderer.invoke('pty-write', { windowId, paneId, data }),
  ptyResize: (windowId: string, paneId: string | undefined, cols: number, rows: number) =>
    ipcRenderer.invoke('pty-resize', { windowId, paneId, cols, rows }),
  getPtyHistory: (paneId: string) =>
    ipcRenderer.invoke('get-pty-history', { paneId }),
  onPtyData: (callback: (event: unknown, payload: { windowId: string; paneId?: string; data: string }) => void) => {
    ipcRenderer.on('pty-data', callback);
  },
  offPtyData: (callback: (event: unknown, payload: { windowId: string; paneId?: string; data: string }) => void) => {
    ipcRenderer.removeListener('pty-data', callback);
  },

  // Pane management
  splitPane: (config: unknown) =>
    ipcRenderer.invoke('split-pane', config),
  closePane: (windowId: string, paneId: string) =>
    ipcRenderer.invoke('close-pane', { windowId, paneId }),

  // View switching
  switchToTerminalView: (windowId: string) =>
    ipcRenderer.invoke('switch-to-terminal-view', { windowId }),
  switchToUnifiedView: () =>
    ipcRenderer.invoke('switch-to-unified-view'),
  onViewChanged: (callback: (event: unknown, payload: { view: 'unified' | 'terminal'; windowId?: string }) => void) => {
    ipcRenderer.on('view-changed', callback);
  },
  offViewChanged: (callback: (event: unknown, payload: { view: 'unified' | 'terminal'; windowId?: string }) => void) => {
    ipcRenderer.removeListener('view-changed', callback);
  },

  // Workspace management
  saveWorkspace: (windows: unknown[]) =>
    ipcRenderer.invoke('save-workspace', windows),
  loadWorkspace: () =>
    ipcRenderer.invoke('load-workspace'),
  onWorkspaceLoaded: (callback: (event: unknown, workspace: unknown) => void) => {
    ipcRenderer.on('workspace-loaded', callback);
  },
  offWorkspaceLoaded: (callback: (event: unknown, workspace: unknown) => void) => {
    ipcRenderer.removeListener('workspace-loaded', callback);
  },

  // Auto-save
  triggerAutoSave: (windows?: unknown[]) =>
    ipcRenderer.send('trigger-auto-save', windows),

  // Clipboard
  writeClipboardText: (text: string) =>
    ipcRenderer.invoke('clipboard-write-text', text),
  readClipboardText: () =>
    ipcRenderer.invoke('clipboard-read-text'),

  // 通知主进程渲染完成
  notifyRendererReady: () => ipcRenderer.send('renderer-ready'),

  // Workspace restore
  onWindowRestored: (callback: (event: unknown, result: unknown) => void) => {
    ipcRenderer.on('window-restored', callback);
  },
  offWindowRestored: (callback: (event: unknown, result: unknown) => void) => {
    ipcRenderer.removeListener('window-restored', callback);
  },
  onWorkspaceRestoreError: (callback: (event: unknown, error: unknown) => void) => {
    ipcRenderer.on('workspace-restore-error', callback);
  },
  offWorkspaceRestoreError: (callback: (event: unknown, error: unknown) => void) => {
    ipcRenderer.removeListener('workspace-restore-error', callback);
  },
  recoverFromBackup: () =>
    ipcRenderer.invoke('recover-from-backup'),

  // Cleanup progress
  onCleanupStarted: (callback: () => void) => {
    ipcRenderer.on('cleanup-started', callback);
  },
  offCleanupStarted: (callback: () => void) => {
    ipcRenderer.removeListener('cleanup-started', callback);
  },
  onCleanupProgress: (callback: (event: unknown, payload: { current: number; total: number }) => void) => {
    ipcRenderer.on('cleanup-progress', callback);
  },
  offCleanupProgress: (callback: (event: unknown, payload: { current: number; total: number }) => void) => {
    ipcRenderer.removeListener('cleanup-progress', callback);
  },
});
