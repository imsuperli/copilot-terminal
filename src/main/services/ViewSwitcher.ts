import { BrowserWindow } from 'electron';
import { ViewChangedPayload } from '../../shared/types/ipc';

export interface ViewSwitcher {
  switchToTerminalView(windowId: string): void;
  switchToCanvasView(canvasWorkspaceId: string): void;
  switchToUnifiedView(): void;
  getCurrentView(): 'unified' | 'terminal' | 'canvas';
  getActiveWindowId(): string | null;
  getActiveCanvasWorkspaceId(): string | null;
}

export class ViewSwitcherImpl implements ViewSwitcher {
  private currentView: 'unified' | 'terminal' | 'canvas' = 'unified';
  private activeWindowId: string | null = null;
  private activeCanvasWorkspaceId: string | null = null;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  switchToTerminalView(windowId: string): void {
    this.currentView = 'terminal';
    this.activeWindowId = windowId;
    this.activeCanvasWorkspaceId = null;

    const payload: ViewChangedPayload = { view: 'terminal', windowId };
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('view-changed', payload);
    }
  }

  switchToCanvasView(canvasWorkspaceId: string): void {
    this.currentView = 'canvas';
    this.activeWindowId = null;
    this.activeCanvasWorkspaceId = canvasWorkspaceId;

    const payload: ViewChangedPayload = { view: 'canvas', canvasWorkspaceId };
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('view-changed', payload);
    }
  }

  switchToUnifiedView(): void {
    this.currentView = 'unified';
    this.activeWindowId = null;
    this.activeCanvasWorkspaceId = null;

    const payload: ViewChangedPayload = { view: 'unified' };
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('view-changed', payload);
    }
  }

  getCurrentView(): 'unified' | 'terminal' | 'canvas' {
    return this.currentView;
  }

  getActiveWindowId(): string | null {
    return this.activeWindowId;
  }

  getActiveCanvasWorkspaceId(): string | null {
    return this.activeCanvasWorkspaceId;
  }
}
