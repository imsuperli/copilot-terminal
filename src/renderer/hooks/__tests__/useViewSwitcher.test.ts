import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useViewSwitcher } from '../useViewSwitcher';
import { useWindowStore } from '../../stores/windowStore';
import { createSinglePaneWindow } from '../../utils/layoutHelpers';

describe('useViewSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store
    useWindowStore.setState({
      windows: [],
      activeWindowId: null,
      canvasWorkspaces: [],
      activeCanvasWorkspaceId: null,
    });
  });

  describe('初始状态', () => {
    it('应该初始化为统一视图', () => {
      const { result } = renderHook(() => useViewSwitcher());

      expect(result.current.currentView).toBe('unified');
      expect(result.current.activeWindowId).toBeNull();
      expect(result.current.activeCanvasWorkspaceId).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('应该注册 view-changed 事件监听器', () => {
      renderHook(() => useViewSwitcher());

      expect(window.electronAPI.onViewChanged).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.onViewChanged).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('switchToTerminalView', () => {
    it('应该调用 IPC 命令', async () => {
      vi.mocked(window.electronAPI.switchToTerminalView).mockResolvedValue(undefined);
      const terminalWindow = createSinglePaneWindow('Test', 'D:\\repo', 'pwsh.exe');
      useWindowStore.setState({ windows: [terminalWindow], activeWindowId: null });
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToTerminalView('window-123');
      });

      expect(window.electronAPI.switchToTerminalView).toHaveBeenCalledWith('window-123');
    });

    it('应该更新 store 中的 activeWindowId', async () => {
      vi.mocked(window.electronAPI.switchToTerminalView).mockResolvedValue(undefined);
      const terminalWindow = createSinglePaneWindow('Test', 'D:\\repo', 'pwsh.exe');
      terminalWindow.id = 'window-123';
      useWindowStore.setState({ windows: [terminalWindow], activeWindowId: null });
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToTerminalView('window-123');
      });

      const storeState = useWindowStore.getState();
      expect(storeState.activeWindowId).toBe('window-123');
    });

    it('应该立即更新本地 terminal 视图状态并清除画布激活状态', async () => {
      vi.mocked(window.electronAPI.switchToTerminalView).mockResolvedValue(undefined);
      const terminalWindow = createSinglePaneWindow('Test', 'D:\\repo', 'pwsh.exe');
      terminalWindow.id = 'window-123';
      useWindowStore.setState({
        windows: [terminalWindow],
        activeCanvasWorkspaceId: 'canvas-123',
      });
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToTerminalView('window-123');
      });

      expect(result.current.currentView).toBe('terminal');
      expect(result.current.activeWindowId).toBe('window-123');
      expect(result.current.activeCanvasWorkspaceId).toBeNull();
      expect(useWindowStore.getState().activeCanvasWorkspaceId).toBeNull();
    });

    it('应该同步当前窗口的 active pane 到主进程', async () => {
      vi.mocked(window.electronAPI.switchToTerminalView).mockResolvedValue(undefined);
      const terminalWindow = createSinglePaneWindow('Test', 'D:\\repo', 'pwsh.exe');
      terminalWindow.id = 'window-123';
      useWindowStore.setState({ windows: [terminalWindow], activeWindowId: null });
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToTerminalView('window-123');
      });

      expect(window.electronAPI.setActivePane).toHaveBeenCalledWith('window-123', terminalWindow.activePaneId);
    });

    it('应该处理错误', async () => {
      const error = new Error('切换失败');
      vi.mocked(window.electronAPI.switchToTerminalView).mockRejectedValue(error);
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToTerminalView('window-123');
      });

      expect(result.current.error).toBe('切换失败');
    });

    it('错误应该在 3 秒后自动清除', async () => {
      vi.useFakeTimers();
      const error = new Error('切换失败');
      vi.mocked(window.electronAPI.switchToTerminalView).mockRejectedValue(error);
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToTerminalView('window-123');
      });

      expect(result.current.error).toBe('切换失败');

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.error).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('switchToUnifiedView', () => {
    it('应该调用 IPC 命令', async () => {
      vi.mocked(window.electronAPI.switchToUnifiedView).mockResolvedValue(undefined);
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToUnifiedView();
      });

      expect(window.electronAPI.switchToUnifiedView).toHaveBeenCalledTimes(1);
    });

    it('应该处理错误', async () => {
      const error = new Error('切换失败');
      vi.mocked(window.electronAPI.switchToUnifiedView).mockRejectedValue(error);
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToUnifiedView();
      });

      expect(result.current.error).toBe('切换失败');
    });

    it('应该立即清除本地的画布激活状态', async () => {
      vi.mocked(window.electronAPI.switchToUnifiedView).mockResolvedValue(undefined);
      useWindowStore.setState({
        activeCanvasWorkspaceId: 'canvas-123',
      });
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToCanvasView('canvas-123');
      });

      expect(result.current.currentView).toBe('canvas');
      expect(useWindowStore.getState().activeCanvasWorkspaceId).toBe('canvas-123');

      await act(async () => {
        await result.current.switchToUnifiedView();
      });

      expect(result.current.currentView).toBe('unified');
      expect(result.current.activeCanvasWorkspaceId).toBeNull();
      expect(useWindowStore.getState().activeCanvasWorkspaceId).toBeNull();
    });
  });

  describe('switchToCanvasView', () => {
    it('应该调用 IPC 命令', async () => {
      vi.mocked(window.electronAPI.switchToCanvasView).mockResolvedValue(undefined);
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToCanvasView('canvas-123');
      });

      expect(window.electronAPI.switchToCanvasView).toHaveBeenCalledWith('canvas-123');
    });

    it('应该立即更新本地的视图和激活画布', async () => {
      vi.mocked(window.electronAPI.switchToCanvasView).mockResolvedValue(undefined);
      const { result } = renderHook(() => useViewSwitcher());

      await act(async () => {
        await result.current.switchToCanvasView('canvas-123');
      });

      expect(result.current.currentView).toBe('canvas');
      expect(result.current.activeCanvasWorkspaceId).toBe('canvas-123');
      expect(useWindowStore.getState().activeCanvasWorkspaceId).toBe('canvas-123');
    });
  });

  describe('view-changed 事件处理', () => {
    it('应该更新 currentView 和 activeWindowId', () => {
      let viewChangedHandler: ((event: unknown, payload: any) => void) | null = null;
      vi.mocked(window.electronAPI.onViewChanged).mockImplementation((handler) => {
        viewChangedHandler = handler;
      });

      const { result } = renderHook(() => useViewSwitcher());

      act(() => {
        viewChangedHandler?.(null, { view: 'terminal', windowId: 'window-123' });
      });

      expect(result.current.currentView).toBe('terminal');
      expect(result.current.activeWindowId).toBe('window-123');
    });

    it('应该更新 store 中的 activeWindowId', () => {
      let viewChangedHandler: ((event: unknown, payload: any) => void) | null = null;
      vi.mocked(window.electronAPI.onViewChanged).mockImplementation((handler) => {
        viewChangedHandler = handler;
      });

      renderHook(() => useViewSwitcher());

      act(() => {
        viewChangedHandler?.(null, { view: 'terminal', windowId: 'window-123' });
      });

      const storeState = useWindowStore.getState();
      expect(storeState.activeWindowId).toBe('window-123');
    });

    it('切换到统一视图时应该清除 activeWindowId', () => {
      let viewChangedHandler: ((event: unknown, payload: any) => void) | null = null;
      vi.mocked(window.electronAPI.onViewChanged).mockImplementation((handler) => {
        viewChangedHandler = handler;
      });

      const { result } = renderHook(() => useViewSwitcher());

      act(() => {
        viewChangedHandler?.(null, { view: 'terminal', windowId: 'window-123' });
      });

      expect(result.current.activeWindowId).toBe('window-123');

      act(() => {
        viewChangedHandler?.(null, { view: 'unified' });
      });

      expect(result.current.currentView).toBe('unified');
      expect(result.current.activeWindowId).toBeNull();
    });

    it('切换到画布视图时应该更新 activeCanvasWorkspaceId', () => {
      let viewChangedHandler: ((event: unknown, payload: any) => void) | null = null;
      vi.mocked(window.electronAPI.onViewChanged).mockImplementation((handler) => {
        viewChangedHandler = handler;
      });

      const { result } = renderHook(() => useViewSwitcher());

      act(() => {
        viewChangedHandler?.(null, { view: 'canvas', canvasWorkspaceId: 'canvas-123' });
      });

      expect(result.current.currentView).toBe('canvas');
      expect(result.current.activeCanvasWorkspaceId).toBe('canvas-123');
      expect(useWindowStore.getState().activeCanvasWorkspaceId).toBe('canvas-123');
    });
  });

  describe('清理', () => {
    it('应该在卸载时取消事件监听', () => {
      const { unmount } = renderHook(() => useViewSwitcher());

      unmount();

      expect(window.electronAPI.offViewChanged).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.offViewChanged).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
