import { TerminalWindow } from './types/window'
import { Workspace } from '../main/types/workspace'

export interface ElectronAPI {
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

  // File system
  validatePath: (path: string) => Promise<boolean>
  selectDirectory: () => Promise<string | null>
  selectAndScanFolder: () => Promise<{ success: boolean; data?: { folders: Array<{ name: string; path: string }>; parentPath: string | null }; error?: string }>
  openFolder: (path: string) => Promise<void>

  // Status events
  onWindowStatusChanged: (callback: (event: unknown, payload: unknown) => void) => void
  offWindowStatusChanged: (callback: (event: unknown, payload: unknown) => void) => void

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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
