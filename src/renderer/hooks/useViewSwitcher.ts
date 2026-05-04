import { useCallback, useEffect, useState } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { useI18n } from '../i18n';
import { getAllPanes } from '../utils/layoutHelpers';

export interface UseViewSwitcherReturn {
  currentView: 'unified' | 'terminal' | 'canvas';
  activeWindowId: string | null;
  activeCanvasWorkspaceId: string | null;
  switchToTerminalView: (windowId: string) => Promise<void>;
  switchToCanvasView: (canvasWorkspaceId: string) => Promise<void>;
  switchToUnifiedView: () => Promise<void>;
  error: string | null;
}

/**
 * useViewSwitcher hook
 * 管理应用内视图切换（统一视图 ↔ 终端视图）
 */
export const useViewSwitcher = (): UseViewSwitcherReturn => {
  const [currentView, setCurrentView] = useState<'unified' | 'terminal' | 'canvas'>('unified');
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [activeCanvasWorkspaceId, setActiveCanvasWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setActiveWindow = useWindowStore((state) => state.setActiveWindow);
  const setActiveCanvasWorkspace = useWindowStore((state) => state.setActiveCanvasWorkspace);
  const { t } = useI18n();

  const syncActivePane = useCallback((windowId: string) => {
    const activeWindow = useWindowStore.getState().getWindowById(windowId);
    if (!activeWindow || !window.electronAPI?.setActivePane) {
      return;
    }

    const paneIds = getAllPanes(activeWindow.layout).map((pane) => pane.id);
    const paneId = activeWindow.activePaneId && paneIds.includes(activeWindow.activePaneId)
      ? activeWindow.activePaneId
      : (paneIds[0] ?? null);

    if (!paneId) {
      return;
    }

    window.electronAPI.setActivePane(windowId, paneId).catch((syncError) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to sync active pane:', syncError);
      }
    });
  }, []);

  const switchToTerminalView = useCallback(async (windowId: string) => {
    try {
      setError(null);
      setCurrentView('terminal');
      setActiveWindowId(windowId);
      setActiveCanvasWorkspaceId(null);
      setActiveCanvasWorkspace(null);
      await window.electronAPI.switchToTerminalView(windowId);
      setActiveWindow(windowId);
      syncActivePane(windowId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('viewSwitch.toTerminalFailed');
      setError(errorMessage);
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to switch to terminal view:', err);
      }
    }
  }, [setActiveWindow, syncActivePane, t]);

  const switchToUnifiedView = useCallback(async () => {
    try {
      setError(null);
      setCurrentView('unified');
      setActiveWindowId(null);
      setActiveCanvasWorkspaceId(null);
      setActiveWindow(null);
      setActiveCanvasWorkspace(null);
      useWindowStore.getState().setActiveGroup(null);
      await window.electronAPI.switchToUnifiedView();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('viewSwitch.toUnifiedFailed');
      setError(errorMessage);
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to switch to unified view:', err);
      }
    }
  }, [t]);

  const switchToCanvasView = useCallback(async (canvasWorkspaceId: string) => {
    const previousState = {
      currentView,
      activeWindowId,
      activeCanvasWorkspaceId,
      storeActiveWindowId: useWindowStore.getState().activeWindowId,
      storeActiveCanvasWorkspaceId: useWindowStore.getState().activeCanvasWorkspaceId,
      storeActiveGroupId: useWindowStore.getState().activeGroupId,
    };

    try {
      setError(null);
      setCurrentView('canvas');
      setActiveWindowId(null);
      setActiveCanvasWorkspaceId(canvasWorkspaceId);
      setActiveWindow(null);
      useWindowStore.getState().setActiveGroup(null);
      setActiveCanvasWorkspace(canvasWorkspaceId);
      await window.electronAPI.switchToCanvasView(canvasWorkspaceId);
    } catch (err) {
      setCurrentView(previousState.currentView);
      setActiveWindowId(previousState.activeWindowId);
      setActiveCanvasWorkspaceId(previousState.activeCanvasWorkspaceId);
      setActiveWindow(previousState.storeActiveWindowId);
      useWindowStore.getState().setActiveGroup(previousState.storeActiveGroupId);
      setActiveCanvasWorkspace(previousState.storeActiveCanvasWorkspaceId);
      const errorMessage = err instanceof Error ? err.message : t('viewSwitch.toCanvasFailed');
      setError(errorMessage);
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to switch to canvas view:', err);
      }
    }
  }, [activeCanvasWorkspaceId, activeWindowId, currentView, setActiveCanvasWorkspace, setActiveWindow, t]);

  useEffect(() => {
    const handler = (
      _event: unknown,
      payload: { view: 'unified' | 'terminal' | 'canvas'; windowId?: string; canvasWorkspaceId?: string },
    ) => {
      setCurrentView(payload.view);
      setActiveWindowId(payload.windowId || null);
      setActiveCanvasWorkspaceId(payload.canvasWorkspaceId || null);

      // 更新 store 中的 activeWindowId 和 activeGroupId
      if (payload.view === 'terminal' && payload.windowId) {
        const { activeGroupId } = useWindowStore.getState();
        if (!activeGroupId) {
          setActiveWindow(payload.windowId);
        }
      } else if (payload.view === 'canvas' && payload.canvasWorkspaceId) {
        setActiveWindow(null);
        const { setActiveGroup } = useWindowStore.getState();
        setActiveGroup(null);
        setActiveCanvasWorkspace(payload.canvasWorkspaceId);
      } else if (payload.view === 'unified') {
        // 切换到统一视图时，清除 activeWindowId 和 activeGroupId
        const { setActiveGroup } = useWindowStore.getState();
        setActiveWindow(null);
        setActiveGroup(null);
        setActiveCanvasWorkspace(null);
      }
    };

    window.electronAPI.onViewChanged(handler);

    return () => {
      window.electronAPI.offViewChanged(handler);
    };
  }, [setActiveCanvasWorkspace, setActiveWindow]);

  // 错误自动清除（3秒后）
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return {
    currentView,
    activeWindowId,
    activeCanvasWorkspaceId,
    switchToTerminalView,
    switchToCanvasView,
    switchToUnifiedView,
    error,
  };
};
