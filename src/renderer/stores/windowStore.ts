import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Window, WindowStatus, Pane, LayoutNode } from '../types/window';
import {
  splitPane as splitPaneInLayout,
  closePane as closePaneInLayout,
  updatePaneInLayout,
  updateSplitSizes as updateSplitSizesInLayout,
  getAllPanes,
  findPaneNode,
} from '../utils/layoutHelpers';

// 全局标志：是否启用自动保存
let autoSaveEnabled = true;
const runtimeOnlyPaneFields = new Set<keyof Pane>([
  'status',
  'pid',
  'lastOutput',
  'title',
  'borderColor',
  'activeBorderColor',
  'teamName',
  'agentId',
  'agentName',
  'agentColor',
]);

/**
 * 触发自动保存
 * 通过 IPC 事件通知主进程触发保存
 * @param windows 当前窗口列表
 */
function triggerAutoSave(windows: Window[]): void {
  if (autoSaveEnabled && window.electronAPI) {
    window.electronAPI.triggerAutoSave(windows);
  }
}

/**
 * 设置自动保存开关
 */
export function setAutoSaveEnabled(enabled: boolean): void {
  autoSaveEnabled = enabled;
}

function isRuntimeOnlyPaneUpdate(updateKeys: string[]): boolean {
  return updateKeys.length > 0 && updateKeys.every((key) => runtimeOnlyPaneFields.has(key as keyof Pane));
}

/**
 * 窗口状态管理 Store 接口
 */
interface WindowStore {
  // 状态
  windows: Window[];
  activeWindowId: string | null;
  mruList: string[]; // 最近使用列表（窗口 ID）
  sidebarExpanded: boolean; // 侧边栏是否展开
  sidebarWidth: number; // 侧边栏宽度

  // Actions
  addWindow: (window: Window) => void;
  syncWindow: (window: Window) => void;
  removeWindow: (id: string) => void;
  updateWindow: (id: string, updates: Partial<Window>) => void;
  /**
   * @deprecated 遗留方法，会更新窗口的所有窗格状态为同一个值。
   * 请使用 updatePane 方法来更新单个窗格的状态。
   * 此方法仅为向后兼容保留，不应在新代码中使用。
   */
  updateWindowStatus: (id: string, status: WindowStatus) => void;
  archiveWindow: (id: string) => void;
  unarchiveWindow: (id: string) => void;
  setActiveWindow: (id: string | null) => void;
  clearWindows: () => void; // 清空所有窗口（用于工作区恢复）

  // Pane 相关
  updatePane: (windowId: string, paneId: string, updates: Partial<Pane>) => void;
  splitPaneInWindow: (windowId: string, targetPaneId: string, direction: 'horizontal' | 'vertical', newPane: Pane) => void;
  closePaneInWindow: (windowId: string, paneId: string, options?: { syncProcess?: boolean }) => void;
  updateSplitSizes: (windowId: string, splitPath: number[], sizes: number[]) => void;
  setActivePane: (windowId: string, paneId: string) => void;

  // MRU 相关
  updateMRU: (windowId: string) => void;
  getMRUWindows: () => Window[];

  // 侧边栏相关
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;

  // 辅助方法
  getWindowById: (id: string) => Window | undefined;
  getPaneById: (windowId: string, paneId: string) => Pane | undefined;
  getActiveWindows: () => Window[]; // 获取未归档的窗口
  getArchivedWindows: () => Window[]; // 获取已归档的窗口

  // Claude 模型相关
  updateClaudeModel: (windowId: string, model?: string, modelId?: string, contextPercentage?: number, cost?: number) => void;
}

/**
 * 创建窗口状态管理 Store
 * 使用 immer 中间件确保不可变更新
 */
export const useWindowStore = create<WindowStore>()(
  immer((set, get) => ({
    // 初始状态
    windows: [],
    activeWindowId: null,
    mruList: [],
    sidebarExpanded: false, // 默认折叠
    sidebarWidth: 200, // 默认宽度

    // 添加窗口
    addWindow: (window) => {
      set((state) => {
        state.windows.push(window);
        // 添加到 MRU 列表首位
        state.mruList = [window.id, ...state.mruList.filter(id => id !== window.id)];
      });
      // 触发自动保存，传递最新的窗口列表
      const windows = get().windows;
      triggerAutoSave(windows);
    },

    // 同步 window（存在则替换，不存在则新增）
    syncWindow: (window) => {
      set((state) => {
        const index = state.windows.findIndex((item) => item.id === window.id);
        if (index >= 0) {
          state.windows[index] = window;
        } else {
          state.windows.push(window);
        }

        if (!state.mruList.includes(window.id)) {
          state.mruList = [window.id, ...state.mruList];
        }
      });
      const windows = get().windows;
      triggerAutoSave(windows);
    },

    // 删除窗口
    removeWindow: (id) => {
      set((state) => {
        state.windows = state.windows.filter(w => w.id !== id);
        if (state.activeWindowId === id) {
          state.activeWindowId = null;
        }
        // 从 MRU 列表移除
        state.mruList = state.mruList.filter(wid => wid !== id);
      });
      // 触发自动保存，传递最新的窗口列表
      const windows = get().windows;
      triggerAutoSave(windows);
    },

    // 更新窗口（支持更新多个属性）
    updateWindow: (id, updates) => {
      set((state) => {
        const window = state.windows.find(w => w.id === id);
        if (window) {
          Object.assign(window, updates);
          window.lastActiveAt = new Date().toISOString();
        }
      });
      // 触发自动保存，传递最新的窗口列表
      const windows = get().windows;
      triggerAutoSave(windows);
    },

    /**
     * @deprecated 遗留方法，会更新窗口的所有窗格状态为同一个值。
     * 请使用 updatePane 方法来更新单个窗格的状态。
     * 此方法仅为向后兼容保留，不应在新代码中使用。
     */
    updateWindowStatus: (id, status) => {
      set((state) => {
        const window = state.windows.find(w => w.id === id);
        if (window) {
          // 更新所有窗格的状态
          const panes = getAllPanes(window.layout);
          panes.forEach(pane => {
            window.layout = updatePaneInLayout(window.layout, pane.id, { status });
          });
          window.lastActiveAt = new Date().toISOString();
        }
      });
      // 触发自动保存
      const windows = get().windows;
      triggerAutoSave(windows);
    },

    // 更新窗格
    updatePane: (windowId, paneId, updates) => {
      const updateKeys = Object.keys(updates);
      const isRuntimeOnlyUpdate = isRuntimeOnlyPaneUpdate(updateKeys);
      let didChange = false;

      set((state) => {
        const window = state.windows.find(w => w.id === windowId);
        if (window) {
          const paneNode = findPaneNode(window.layout, paneId);
          if (!paneNode) {
            return;
          }

          const hasActualChange = updateKeys.some((key) => {
            const paneKey = key as keyof Pane;
            return paneNode.pane[paneKey] !== updates[paneKey];
          });

          if (!hasActualChange) {
            return;
          }

          didChange = true;
          window.layout = updatePaneInLayout(window.layout, paneId, updates);
          if (!isRuntimeOnlyUpdate) {
            window.lastActiveAt = new Date().toISOString();
          }
        }
      });

      if (didChange && !isRuntimeOnlyUpdate) {
        const windows = get().windows;
        triggerAutoSave(windows);
      }
    },

    // 拆分窗格
    splitPaneInWindow: (windowId, targetPaneId, direction, newPane) => {
      set((state) => {
        const window = state.windows.find(w => w.id === windowId);
        if (window) {
          const newLayout = splitPaneInLayout(window.layout, targetPaneId, direction, newPane);
          if (newLayout) {
            window.layout = newLayout;
            // 保持当前激活的窗格不变，不自动切换到新窗格
            window.lastActiveAt = new Date().toISOString();
          }
        }
      });
      // 触发自动保存
      const windows = get().windows;
      triggerAutoSave(windows);
    },

    // 关闭窗格
    closePaneInWindow: (windowId, paneId, options) => {
      // 先调用 IPC 关闭 PTY 进程
      if (options?.syncProcess !== false && window.electronAPI) {
        window.electronAPI.closePane(windowId, paneId).catch((error) => {
          console.error('Failed to close pane:', error);
        });
      }

      set((state) => {
        const window = state.windows.find(w => w.id === windowId);
        if (window) {
          const newLayout = closePaneInLayout(window.layout, paneId);
          if (newLayout) {
            window.layout = newLayout;
            // 如果关闭的是当前激活的窗格，切换到第一个窗格
            if (window.activePaneId === paneId) {
              const panes = getAllPanes(newLayout);
              window.activePaneId = panes[0]?.id || '';
            }
            window.lastActiveAt = new Date().toISOString();
          }
        }
      });
      // 触发自动保存
      const windows = get().windows;
      triggerAutoSave(windows);
    },

    updateSplitSizes: (windowId, splitPath, sizes) => {
      let didChange = false;

      set((state) => {
        const window = state.windows.find(w => w.id === windowId);
        if (!window) {
          return;
        }

        const nextLayout = updateSplitSizesInLayout(window.layout, splitPath, sizes);
        if (nextLayout === window.layout) {
          return;
        }

        didChange = true;
        window.layout = nextLayout;
        window.lastActiveAt = new Date().toISOString();
      });

      if (didChange) {
        triggerAutoSave(get().windows);
      }
    },

    // 设置激活的窗格
    setActivePane: (windowId, paneId) => {
      let didSetActivePane = false;
      set((state) => {
        const window = state.windows.find(w => w.id === windowId);
        if (window) {
          window.activePaneId = paneId;
          window.lastActiveAt = new Date().toISOString();
          didSetActivePane = true;
        }
      });

      if (didSetActivePane) {
        window.electronAPI?.setActivePane?.(windowId, paneId).catch((error) => {
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to sync active pane:', error);
          }
        });
      }
    },

    // 归档窗口
    archiveWindow: (id) => {
      set((state) => {
        const window = state.windows.find(w => w.id === id);
        if (window) {
          window.archived = true;
          window.lastActiveAt = new Date().toISOString();
          console.log(`[WindowStore] Archived window: ${window.name} (id: ${id})`);
        }
        // 如果归档的是当前活跃窗口，清除活跃状态
        if (state.activeWindowId === id) {
          state.activeWindowId = null;
        }
      });
      // 触发自动保存
      const windows = get().windows;
      const archivedCount = windows.filter(w => w.archived).length;
      console.log(`[WindowStore] Triggering auto-save with ${windows.length} windows (${archivedCount} archived)`);
      triggerAutoSave(windows);
    },

    // 取消归档窗口
    unarchiveWindow: (id) => {
      set((state) => {
        const window = state.windows.find(w => w.id === id);
        if (window) {
          window.archived = false;
          window.lastActiveAt = new Date().toISOString();
        }
      });
      // 触发自动保存
      const windows = get().windows;
      triggerAutoSave(windows);
    },

    // 设置活跃窗口
    setActiveWindow: (id) => {
      set((state) => {
        state.activeWindowId = id;
        if (id) {
          const window = state.windows.find(w => w.id === id);
          if (window) {
            window.lastActiveAt = new Date().toISOString();
          }
          // 更新 MRU 列表
          state.mruList = [id, ...state.mruList.filter(wid => wid !== id)];
        }
      });
    },

    // 清空所有窗口（用于工作区恢复）
    clearWindows: () => {
      set((state) => {
        state.windows = [];
        state.activeWindowId = null;
        state.mruList = [];
      });
      // 不触发自动保存，因为这是恢复过程的一部分
    },

    // 更新 MRU 列表
    updateMRU: (windowId) => {
      set((state) => {
        state.mruList = [windowId, ...state.mruList.filter(id => id !== windowId)];
      });
    },

    // 获取按 MRU 排序的窗口列表
    getMRUWindows: () => {
      const { windows, mruList } = get();
      const windowMap = new Map(windows.map(w => [w.id, w]));
      return mruList
        .map(id => windowMap.get(id))
        .filter((w): w is Window => w !== undefined && !w.archived);
    },

    // 切换侧边栏展开/折叠
    toggleSidebar: () => {
      set((state) => {
        state.sidebarExpanded = !state.sidebarExpanded;
      });
    },

    // 设置侧边栏宽度
    setSidebarWidth: (width) => {
      set((state) => {
        state.sidebarWidth = Math.max(150, Math.min(400, width));
      });
    },

    // 根据 ID 查找窗口
    getWindowById: (id) => {
      return get().windows.find(w => w.id === id);
    },

    // 根据 ID 查找窗格
    getPaneById: (windowId, paneId) => {
      const window = get().windows.find(w => w.id === windowId);
      if (!window) return undefined;
      const paneNode = findPaneNode(window.layout, paneId);
      return paneNode?.pane;
    },

    // 获取未归档的窗口
    getActiveWindows: () => {
      return get().windows.filter(w => !w.archived);
    },

    // 获取已归档的窗口
    getArchivedWindows: () => {
      return get().windows.filter(w => w.archived);
    },

    // 更新 Claude 模型信息
    updateClaudeModel: (windowId, model, modelId, contextPercentage, cost) => {
      set((state) => {
        const window = state.windows.find(w => w.id === windowId);
        if (window) {
          window.claudeModel = model;
          window.claudeModelId = modelId;
          window.claudeContextPercentage = contextPercentage;
          window.claudeCost = cost;
        }
      });
    },
  }))
);

// Re-export types for convenience
export type { Window };
export { WindowStatus } from '../types/window';
