import type { ElectronAPI } from '../shared/types/electron-api';

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }

  var electronAPI: ElectronAPI
}

export {};
