import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserWindow } from 'electron';
import { ViewSwitcherImpl } from '../ViewSwitcher';

describe('ViewSwitcher', () => {
  let mockWindow: BrowserWindow;
  let viewSwitcher: ViewSwitcherImpl;

  beforeEach(() => {
    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
    } as unknown as BrowserWindow;

    viewSwitcher = new ViewSwitcherImpl(mockWindow);
  });

  describe('初始状态', () => {
    it('应该初始化为统一视图', () => {
      expect(viewSwitcher.getCurrentView()).toBe('unified');
    });

    it('应该初始化时没有活跃窗口', () => {
      expect(viewSwitcher.getActiveWindowId()).toBeNull();
    });
  });

  describe('switchToTerminalView', () => {
    it('应该切换到终端视图', () => {
      viewSwitcher.switchToTerminalView('window-123');

      expect(viewSwitcher.getCurrentView()).toBe('terminal');
      expect(viewSwitcher.getActiveWindowId()).toBe('window-123');
    });

    it('应该发送 view-changed 事件到渲染进程', () => {
      viewSwitcher.switchToTerminalView('window-123');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('view-changed', {
        view: 'terminal',
        windowId: 'window-123',
      });
    });

    it('窗口已销毁时不应该发送事件', () => {
      vi.mocked(mockWindow.isDestroyed).mockReturnValue(true);

      viewSwitcher.switchToTerminalView('window-123');

      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('switchToCanvasView', () => {
    it('应该切换到画布视图', () => {
      viewSwitcher.switchToCanvasView('canvas-123');

      expect(viewSwitcher.getCurrentView()).toBe('canvas');
      expect(viewSwitcher.getActiveWindowId()).toBeNull();
      expect(viewSwitcher.getActiveCanvasWorkspaceId()).toBe('canvas-123');
    });

    it('应该发送画布 view-changed 事件到渲染进程', () => {
      viewSwitcher.switchToCanvasView('canvas-123');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('view-changed', {
        view: 'canvas',
        canvasWorkspaceId: 'canvas-123',
      });
    });
  });

  describe('switchToUnifiedView', () => {
    it('应该切换到统一视图', () => {
      viewSwitcher.switchToTerminalView('window-123');
      viewSwitcher.switchToUnifiedView();

      expect(viewSwitcher.getCurrentView()).toBe('unified');
      expect(viewSwitcher.getActiveWindowId()).toBeNull();
    });

    it('应该发送 view-changed 事件到渲染进程', () => {
      viewSwitcher.switchToUnifiedView();

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('view-changed', {
        view: 'unified',
      });
    });

    it('窗口已销毁时不应该发送事件', () => {
      vi.mocked(mockWindow.isDestroyed).mockReturnValue(true);

      viewSwitcher.switchToUnifiedView();

      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('视图切换流程', () => {
    it('应该支持多次切换', () => {
      viewSwitcher.switchToTerminalView('window-1');
      expect(viewSwitcher.getCurrentView()).toBe('terminal');
      expect(viewSwitcher.getActiveWindowId()).toBe('window-1');

      viewSwitcher.switchToUnifiedView();
      expect(viewSwitcher.getCurrentView()).toBe('unified');
      expect(viewSwitcher.getActiveWindowId()).toBeNull();

      viewSwitcher.switchToTerminalView('window-2');
      expect(viewSwitcher.getCurrentView()).toBe('terminal');
      expect(viewSwitcher.getActiveWindowId()).toBe('window-2');
    });

    it('应该在切换窗口时更新活跃窗口 ID', () => {
      viewSwitcher.switchToTerminalView('window-1');
      expect(viewSwitcher.getActiveWindowId()).toBe('window-1');

      viewSwitcher.switchToTerminalView('window-2');
      expect(viewSwitcher.getActiveWindowId()).toBe('window-2');
    });
  });
});
