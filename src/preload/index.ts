import { contextBridge, ipcRenderer } from 'electron';

// 暴露受控的 IPC API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
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

  // File system
  validatePath: (path: string) => ipcRenderer.invoke('validate-path', path),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', { path }),

  // Status events
  onWindowStatusChanged: (callback: (event: unknown, payload: unknown) => void) => {
    ipcRenderer.on('window-status-changed', callback);
  },
  offWindowStatusChanged: (callback: (event: unknown, payload: unknown) => void) =>
    ipcRenderer.removeListener('window-status-changed', callback),

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
});
