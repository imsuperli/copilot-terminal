import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Radix UI ScrollArea uses ResizeObserver which is not available in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Mock window.electronAPI for all renderer tests
Object.defineProperty(window, 'electronAPI', {
  value: {
    platform: 'win32',
    ping: vi.fn().mockResolvedValue('pong'),
    createWindow: vi.fn().mockResolvedValue({}),
    createSSHWindow: vi.fn().mockResolvedValue({ success: true, data: {} }),
    killTerminal: vi.fn().mockResolvedValue(undefined),
    getTerminalStatus: vi.fn().mockResolvedValue('alive'),
    listTerminals: vi.fn().mockResolvedValue([]),
    closeWindow: vi.fn().mockResolvedValue(undefined),
    deleteWindow: vi.fn().mockResolvedValue(undefined),
    startWindow: vi.fn().mockResolvedValue({ success: true }),
    startSSHPane: vi.fn().mockResolvedValue({ success: true, data: { pid: 1001, sessionId: 'ssh-session-1', status: 'waiting' } }),
    cloneSSHPane: vi.fn().mockResolvedValue({ success: true, data: { pid: 1002, sessionId: 'ssh-session-2' } }),
    validatePath: vi.fn().mockResolvedValue({ success: true, data: true }),
    createDirectory: vi.fn().mockResolvedValue({ success: true }),
    selectDirectory: vi.fn().mockResolvedValue({ success: true, data: null }),
    selectExecutableFile: vi.fn().mockResolvedValue({ success: true, data: null }),
    selectImageFile: vi.fn().mockResolvedValue({ success: true, data: null }),
    openFolder: vi.fn().mockResolvedValue(undefined),
    onWindowStatusChanged: vi.fn(),
    offWindowStatusChanged: vi.fn(),
    onPaneStatusChanged: vi.fn(),
    offPaneStatusChanged: vi.fn(),
    onWindowGitBranchChanged: vi.fn(),
    offWindowGitBranchChanged: vi.fn(),
    onTmuxPaneTitleChanged: vi.fn(),
    offTmuxPaneTitleChanged: vi.fn(),
    onTmuxPaneStyleChanged: vi.fn(),
    offTmuxPaneStyleChanged: vi.fn(),
    onTmuxWindowSynced: vi.fn(),
    offTmuxWindowSynced: vi.fn(),
    onTmuxWindowRemoved: vi.fn(),
    offTmuxWindowRemoved: vi.fn(),
    ptyWrite: vi.fn().mockResolvedValue(undefined),
    ptyResize: vi.fn().mockResolvedValue(undefined),
    getPtyHistory: vi.fn().mockResolvedValue({ success: true, data: { chunks: [], lastSeq: 0 } }),
    onPtyData: vi.fn(),
    offPtyData: vi.fn(),
    splitPane: vi.fn().mockResolvedValue({ success: true }),
    closePane: vi.fn().mockResolvedValue({ success: true }),
    switchToTerminalView: vi.fn().mockResolvedValue(undefined),
    switchToUnifiedView: vi.fn().mockResolvedValue(undefined),
    setActivePane: vi.fn().mockResolvedValue(undefined),
    onViewChanged: vi.fn(),
    offViewChanged: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({ success: true, data: { language: 'zh-CN', ides: [], quickNav: { items: [] }, terminal: { useBundledConptyDll: false, defaultShellProgram: '' } } }),
    updateSettings: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getAvailableShells: vi.fn().mockResolvedValue({ success: true, data: [
      { command: 'pwsh.exe', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', isDefault: true },
      { command: 'powershell.exe', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', isDefault: false },
      { command: 'cmd.exe', path: 'C:\\Windows\\System32\\cmd.exe', isDefault: false },
    ] }),
    getSupportedIDENames: vi.fn().mockResolvedValue({ success: true, data: [] }),
    scanIDEs: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getIDEIcon: vi.fn().mockResolvedValue({ success: true, data: '' }),
    deleteIDEConfig: vi.fn().mockResolvedValue({ success: true, data: [] }),
    updateIDEConfig: vi.fn().mockResolvedValue({ success: true, data: [] }),
    scanSpecificIDE: vi.fn().mockResolvedValue({ success: true, data: '' }),
    listSSHProfiles: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getSSHProfile: vi.fn().mockResolvedValue({ success: false, error: 'not found' }),
    createSSHProfile: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateSSHProfile: vi.fn().mockResolvedValue({ success: true, data: {} }),
    deleteSSHProfile: vi.fn().mockResolvedValue({ success: true }),
    getSSHCredentialState: vi.fn().mockResolvedValue({ success: true, data: { hasPassword: false, hasPassphrase: false } }),
    setSSHPassword: vi.fn().mockResolvedValue({ success: true }),
    clearSSHPassword: vi.fn().mockResolvedValue({ success: true }),
    setSSHPrivateKeyPassphrase: vi.fn().mockResolvedValue({ success: true }),
    clearSSHPrivateKeyPassphrase: vi.fn().mockResolvedValue({ success: true }),
    listKnownHosts: vi.fn().mockResolvedValue({ success: true, data: [] }),
    removeKnownHost: vi.fn().mockResolvedValue({ success: true }),
    statusLineConfigure: vi.fn().mockResolvedValue({ success: true }),
    statusLineRemove: vi.fn().mockResolvedValue({ success: true }),
    saveWorkspace: vi.fn().mockResolvedValue({ success: true }),
    loadWorkspace: vi.fn().mockResolvedValue({ success: true, data: {} }),
    onWorkspaceLoaded: vi.fn(),
    offWorkspaceLoaded: vi.fn(),
    triggerAutoSave: vi.fn(),
    writeClipboardText: vi.fn().mockResolvedValue(undefined),
    readClipboardText: vi.fn().mockResolvedValue({ success: true, data: '' }),
    notifyRendererReady: vi.fn(),
    onWindowRestored: vi.fn(),
    offWindowRestored: vi.fn(),
    onWorkspaceRestoreError: vi.fn(),
    offWorkspaceRestoreError: vi.fn(),
    recoverFromBackup: vi.fn().mockResolvedValue({ success: true, data: {} }),
    onCleanupStarted: vi.fn(),
    offCleanupStarted: vi.fn(),
    onCleanupProgress: vi.fn(),
    offCleanupProgress: vi.fn(),
    openInIDE: vi.fn().mockResolvedValue({ success: true }),
    startGitWatch: vi.fn().mockResolvedValue({ success: true }),
    stopGitWatch: vi.fn().mockResolvedValue({ success: true }),
    openExternalUrl: vi.fn().mockResolvedValue({ success: true }),
    onProjectConfigUpdated: vi.fn(),
    offProjectConfigUpdated: vi.fn(),
    onClaudeModelUpdated: vi.fn(),
    offClaudeModelUpdated: vi.fn(),
  },
  writable: true,
});
