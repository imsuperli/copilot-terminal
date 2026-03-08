import { useCallback, useEffect, useState } from 'react';
import { useWindowStore } from '../stores/windowStore';
import { useI18n } from '../i18n';

export interface UseViewSwitcherReturn {
  currentView: 'unified' | 'terminal';
  activeWindowId: string | null;
  switchToTerminalView: (windowId: string) => Promise<void>;
  switchToUnifiedView: () => Promise<void>;
  error: string | null;
}

/**
 * useViewSwitcher hook
 * 管理应用内视图切换（统一视图 ↔ 终端视图）
 */
export const useViewSwitcher = (): UseViewSwitcherReturn => {
  const [currentView, setCurrentView] = useState<'unified' | 'terminal'>('unified');
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setActiveWindow = useWindowStore((state) => state.setActiveWindow);
  const { t } = useI18n();

  const switchToTerminalView = useCallback(async (windowId: string) => {
    try {
      setError(null);
      await window.electronAPI.switchToTerminalView(windowId);
      setActiveWindow(windowId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('viewSwitch.toTerminalFailed');
      setError(errorMessage);
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to switch to terminal view:', err);
      }
    }
  }, [setActiveWindow, t]);

  const switchToUnifiedView = useCallback(async () => {
    try {
      setError(null);
      await window.electronAPI.switchToUnifiedView();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('viewSwitch.toUnifiedFailed');
      setError(errorMessage);
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to switch to unified view:', err);
      }
    }
  }, [t]);

  useEffect(() => {
    const handler = (_event: unknown, payload: { view: 'unified' | 'terminal'; windowId?: string }) => {
      setCurrentView(payload.view);
      setActiveWindowId(payload.windowId || null);

      // 更新 store 中的 activeWindowId
      if (payload.view === 'terminal' && payload.windowId) {
        setActiveWindow(payload.windowId);
      }
    };

    window.electronAPI.onViewChanged(handler);

    return () => {
      window.electronAPI.offViewChanged(handler);
    };
  }, [setActiveWindow]);

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
    switchToTerminalView,
    switchToUnifiedView,
    error,
  };
};
