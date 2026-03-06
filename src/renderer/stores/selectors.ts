import { Window } from '../types/window';

/**
 * Store Selectors
 * 用于精确订阅 store 状态，避免不必要的重渲染
 */

interface WindowStoreState {
  windows: Window[];
  activeWindowId: string | null;
}

// 获取所有窗口
export const selectAllWindows = (state: WindowStoreState) => state.windows;

// 获取当前活跃窗口
export const selectActiveWindow = (state: WindowStoreState) => {
  if (!state.activeWindowId) return null;
  return state.windows.find((w) => w.id === state.activeWindowId) || null;
};

// 获取窗口总数
export const selectWindowCount = (state: WindowStoreState) => state.windows.length;
