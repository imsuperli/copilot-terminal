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

  // File system
  validatePath: (path: string) => ipcRenderer.invoke('validate-path', path),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
});
