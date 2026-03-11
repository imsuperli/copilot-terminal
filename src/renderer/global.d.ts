import { TerminalWindow } from './types/window'
import { Workspace } from '../main/types/workspace'

interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface ElectronAPI {
  platform: 'win32' | 'darwin' | 'linux'
  ping: () => Promise<string>

  // Terminal management
  createWindow: (config: {
    name?: string
    workingDirectory: string
    command?: string
  }) => Promise<{ success: boolean; data?: TerminalWindow; error?: string }>
  killTerminal: (pid: number) => Promise<void>
  getTerminalStatus: (pid: number) => Promise<string>
  listTerminals: () => Promise<any[]>

  // Window management
  closeWindow: (windowId: string) => Promise<void>
  deleteWindow: (windowId: string) => Promise<void>
  startWindow: (config: {
    windowId: string
    paneId?: string
    name: string
    workingDirectory: string
    command?: string
  }) => Promise<{ success: boolean; data?: { pid: number; status: string }; error?: string }>

  // File system
  validatePath: (path: string) => Promise<IpcResponse<boolean>>
  createDirectory: (path: string) => Promise<IpcResponse<string>>
  selectDirectory: () => Promise<IpcResponse<string | null>>
  selectExecutableFile: () => Promise<IpcResponse<string | null>>
  selectAndScanFolder: () => Promise<IpcResponse<{ folders: Array<{ name: string; path: string }>; parentPath: string | null }>>
  openFolder: (path: string) => Promise<void>
  openExternalUrl: (url: string) => Promise<void>

  // Settings
  getSettings: () => Promise<IpcResponse<Workspace['settings']>>
  updateSettings: (settings: unknown) => Promise<IpcResponse<Workspace['settings']>>
  getAvailableShells: () => Promise<IpcResponse<Array<{ command: string; label: string; isDefault: boolean }>>>

  // Status events
  onWindowStatusChanged: (callback: (event: unknown, payload: unknown) => void) => void
  offWindowStatusChanged: (callback: (event: unknown, payload: unknown) => void) => void
  onPaneStatusChanged: (callback: (event: unknown, payload: unknown) => void) => void
  offPaneStatusChanged: (callback: (event: unknown, payload: unknown) => void) => void
  onWindowGitBranchChanged: (callback: (event: unknown, payload: unknown) => void) => void
  offWindowGitBranchChanged: (callback: (event: unknown, payload: unknown) => void) => void

  // tmux events
  onTmuxPaneTitleChanged: (callback: (event: unknown, payload: { tmuxPaneId: string; windowId: string; paneId: string; title: string }) => void) => void
  offTmuxPaneTitleChanged: (callback: (event: unknown, payload: { tmuxPaneId: string; windowId: string; paneId: string; title: string }) => void) => void
  onTmuxPaneStyleChanged: (callback: (event: unknown, payload: { tmuxPaneId: string; windowId: string; paneId: string; metadata: unknown }) => void) => void
  offTmuxPaneStyleChanged: (callback: (event: unknown, payload: { tmuxPaneId: string; windowId: string; paneId: string; metadata: unknown }) => void) => void
  onTmuxWindowSynced: (callback: (event: unknown, payload: { window: TerminalWindow }) => void) => void
  offTmuxWindowSynced: (callback: (event: unknown, payload: { window: TerminalWindow }) => void) => void
  onTmuxWindowRemoved: (callback: (event: unknown, payload: { windowId: string }) => void) => void
  offTmuxWindowRemoved: (callback: (event: unknown, payload: { windowId: string }) => void) => void

  // PTY I/O
  ptyWrite: (windowId: string, data: string) => Promise<void>
  ptyResize: (windowId: string, cols: number, rows: number) => Promise<void>
  getPtyHistory: (windowId: string) => Promise<string[]>
  onPtyData: (callback: (event: unknown, payload: { windowId: string; data: string }) => void) => void
  offPtyData: (callback: (event: unknown, payload: { windowId: string; data: string }) => void) => void

  // View switching
  switchToTerminalView: (windowId: string) => Promise<void>
  switchToUnifiedView: () => Promise<void>
  onViewChanged: (callback: (event: unknown, payload: { view: 'unified' | 'terminal'; windowId?: string }) => void) => void
  offViewChanged: (callback: (event: unknown, payload: { view: 'unified' | 'terminal'; windowId?: string }) => void) => void

  // Workspace management
  saveWorkspace: (windows: TerminalWindow[]) => Promise<{ success: boolean; error?: string }>
  loadWorkspace: () => Promise<{ success: boolean; data?: Workspace; error?: string }>
  onWorkspaceLoaded: (callback: (event: unknown, workspace: Workspace) => void) => void
  offWorkspaceLoaded: (callback: (event: unknown, workspace: Workspace) => void) => void

  // Auto-save
  triggerAutoSave: (windows?: TerminalWindow[]) => void

  // Clipboard
  writeClipboardText: (text: string) => Promise<unknown>
  readClipboardText: () => Promise<unknown>

  // Workspace restore
  onWindowRestored: (callback: (event: unknown, result: unknown) => void) => void
  offWindowRestored: (callback: (event: unknown, result: unknown) => void) => void
  onWorkspaceRestoreError: (callback: (event: unknown, error: { error: string }) => void) => void
  offWorkspaceRestoreError: (callback: (event: unknown, error: { error: string }) => void) => void
  recoverFromBackup: () => Promise<{ success: boolean; data?: Workspace; error?: string }>

  // Renderer ready notification
  notifyRendererReady: () => void

  // Cleanup progress
  onCleanupStarted: (callback: () => void) => void
  offCleanupStarted: (callback: () => void) => void
  onCleanupProgress: (callback: (event: unknown, payload: { current: number; total: number }) => void) => void
  offCleanupProgress: (callback: (event: unknown, payload: { current: number; total: number }) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
