import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Window, WindowStatus, Pane, LayoutNode } from '../types/window';
import { WindowGroup, GroupLayoutNode } from '../../shared/types/window-group';
import {
  splitPane as splitPaneInLayout,
  closePane as closePaneInLayout,
  updatePaneInLayout,
  updateSplitSizes as updateSplitSizesInLayout,
  getAllPanes,
  findPaneNode,
  collapseTmuxAgentPanesForPause,
} from '../utils/layoutHelpers';
import {
  getAllWindowIds,
  removeWindowFromGroup as removeWindowFromGroupLayout,
  updateGroupSplitSizes as updateGroupSplitSizesInLayout,
  addWindowToGroup as addWindowToGroupInLayout,
  getWindowCount,
} from '../utils/groupLayoutHelpers';

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
  'teammateMode',
]);

/**
 * 触发自动保存
 * 通过 IPC 事件通知主进程触发保存
 * @param windows 当前窗口列表
 * @param groups 当前窗口组列表
 */
function triggerAutoSave(windows: Window[], groups?: WindowGroup[]): void {
  if (autoSaveEnabled && window.electronAPI) {
    window.electronAPI.triggerAutoSave(windows, groups);
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

  // 组相关状态
  groups: WindowGroup[]; // 窗口组列表
  activeGroupId: string | null; // 当前激活的窗口组 ID
  groupMruList: string[]; // 组的 MRU 列表

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
  pauseWindowState: (windowId: string) => void;
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

  // 组相关 Actions
  addGroup: (group: WindowGroup) => void;
  removeGroup: (id: string) => void;
  updateGroup: (id: string, updates: Partial<WindowGroup>) => void;
  archiveGroup: (id: string) => void;
  unarchiveGroup: (id: string) => void;
  setActiveGroup: (id: string | null) => void;
  clearGroups: () => void; // 清空所有组（用于工作区恢复）

  // 组布局操作
  addWindowToGroupLayout: (groupId: string, targetWindowId: string, newWindowId: string, direction: 'horizontal' | 'vertical') => void;
  removeWindowFromGroupLayout: (groupId: string, windowId: string) => void;
  updateGroupSplitSizes: (groupId: string, splitPath: number[], sizes: number[]) => void;
  setActiveWindowInGroup: (groupId: string, windowId: string) => void;

  // 组 MRU 相关
  updateGroupMRU: (groupId: string) => void;
  getMRUGroups: () => WindowGroup[];

  // 组辅助方法
  getGroupById: (id: string) => WindowGroup | undefined;
  getWindowsInGroup: (groupId: string) => Window[];
  getActiveGroups: () => WindowGroup[]; // 获取未归档的组
  getArchivedGroups: () => WindowGroup[]; // 获取已归档的组
  findGroupByWindowId: (windowId: string) => WindowGroup | undefined; // 查找包含指定窗口的组
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

    // 组相关初始状态
    groups: [],
    activeGroupId: null,
    groupMruList: [],

    // 添加窗口
    addWindow: (window) => {
      set((state) => {
        state.windows.push(window);
        // 添加到 MRU 列表首位
        state.mruList = [window.id, ...state.mruList.filter(id => id !== window.id)];
      });
      // 触发自动保存，传递最新的窗口列表和组列表
      const { windows, groups } = get();
      triggerAutoSave(windows, groups);
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
      const { windows, groups } = get();
      triggerAutoSave(windows, groups);
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

        // 从所属组中移除窗口
        const groupIndex = state.groups.findIndex(g =>
          getAllWindowIds(g.layout).includes(id)
        );
        if (groupIndex >= 0) {
          const group = state.groups[groupIndex];
          const newLayout = removeWindowFromGroupLayout(group.layout, id);
          if (!newLayout || getWindowCount(newLayout) < 2) {
            // 组内不足 2 个窗口，解散组
            state.groups.splice(groupIndex, 1);
            if (state.activeGroupId === group.id) {
              state.activeGroupId = null;
            }
            state.groupMruList = state.groupMruList.filter(gid => gid !== group.id);
          } else {
            group.layout = newLayout;
            if (group.activeWindowId === id) {
              group.activeWindowId = getAllWindowIds(newLayout)[0];
            }
          }
        }
      });
      // 触发自动保存，传递最新的窗口列表和组列表
      const { windows, groups } = get();
      triggerAutoSave(windows, groups);
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
      // 触发自动保存，传递最新的窗口列表和组列表
      const { windows, groups } = get();
      triggerAutoSave(windows, groups);
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
      const { windows, groups } = get();
      triggerAutoSave(windows, groups);
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
        const { windows, groups } = get();
        triggerAutoSave(windows, groups);
      }
    },

    pauseWindowState: (windowId) => {
      let didChange = false;
      let shouldAutoSave = false;

      set((state) => {
        const window = state.windows.find(w => w.id === windowId);
        if (!window) {
          return;
        }

        const collapsed = collapseTmuxAgentPanesForPause(window.layout);
        if (collapsed) {
          window.layout = collapsed.layout;
          window.activePaneId = collapsed.activePaneId;
          window.lastActiveAt = new Date().toISOString();
          didChange = true;
          shouldAutoSave = true;
          return;
        }

        const panes = getAllPanes(window.layout);
        const needsPauseUpdate = panes.some((pane) => (
          pane.status !== WindowStatus.Paused || pane.pid !== null
        ));

        if (!needsPauseUpdate) {
          return;
        }

        didChange = true;
        for (const pane of panes) {
          window.layout = updatePaneInLayout(window.layout, pane.id, {
            status: WindowStatus.Paused,
            pid: null,
          });
        }
      });

      if (didChange && shouldAutoSave) {
        const { windows, groups } = get();
        triggerAutoSave(windows, groups);
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
      const { windows, groups } = get();
      triggerAutoSave(windows, groups);
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
      const { windows, groups } = get();
      triggerAutoSave(windows, groups);
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
        const { windows, groups } = get();
        triggerAutoSave(windows, groups);
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

        // 从所属组中移除窗口
        const groupIndex = state.groups.findIndex(g =>
          getAllWindowIds(g.layout).includes(id)
        );
        if (groupIndex >= 0) {
          const group = state.groups[groupIndex];
          const newLayout = removeWindowFromGroupLayout(group.layout, id);
          if (!newLayout || getWindowCount(newLayout) < 2) {
            // 组内不足 2 个窗口，解散组
            state.groups.splice(groupIndex, 1);
            if (state.activeGroupId === group.id) {
              state.activeGroupId = null;
            }
            state.groupMruList = state.groupMruList.filter(gid => gid !== group.id);
          } else {
            group.layout = newLayout;
            if (group.activeWindowId === id) {
              group.activeWindowId = getAllWindowIds(newLayout)[0];
            }
          }
        }
      });
      // 触发自动保存
      const { windows, groups } = get();
      const archivedCount = windows.filter(w => w.archived).length;
      console.log(`[WindowStore] Triggering auto-save with ${windows.length} windows (${archivedCount} archived)`);
      triggerAutoSave(windows, groups);
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
      const { windows, groups } = get();
      triggerAutoSave(windows, groups);
    },

    // 设置活跃窗口（与 activeGroupId 互斥）
    setActiveWindow: (id) => {
      set((state) => {
        state.activeWindowId = id;
        // 激活单窗口时清空 activeGroupId
        if (id) {
          state.activeGroupId = null;
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
        state.groups = [];
        state.activeGroupId = null;
        state.groupMruList = [];
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

    // ==================== 组相关 Actions ====================

    // 添加组
    addGroup: (group) => {
      set((state) => {
        state.groups.push(group);
        state.groupMruList = [group.id, ...state.groupMruList.filter(id => id !== group.id)];
      });
      triggerAutoSave(get().windows, get().groups);
    },

    // 删除组（不删除组内窗口）
    removeGroup: (id) => {
      set((state) => {
        state.groups = state.groups.filter(g => g.id !== id);
        if (state.activeGroupId === id) {
          state.activeGroupId = null;
        }
        state.groupMruList = state.groupMruList.filter(gid => gid !== id);
      });
      triggerAutoSave(get().windows, get().groups);
    },

    // 更新组
    updateGroup: (id, updates) => {
      set((state) => {
        const group = state.groups.find(g => g.id === id);
        if (group) {
          Object.assign(group, updates);
          group.lastActiveAt = new Date().toISOString();
        }
      });
      triggerAutoSave(get().windows, get().groups);
    },

    // 归档组
    archiveGroup: (id) => {
      set((state) => {
        const group = state.groups.find(g => g.id === id);
        if (group) {
          group.archived = true;
          group.lastActiveAt = new Date().toISOString();

          // 归档组内所有窗口
          const windowIds = getAllWindowIds(group.layout);
          windowIds.forEach(windowId => {
            const window = state.windows.find(w => w.id === windowId);
            if (window && !window.archived) {
              window.archived = true;
              window.lastActiveAt = new Date().toISOString();
            }
          });
        }
        if (state.activeGroupId === id) {
          state.activeGroupId = null;
        }
      });
      triggerAutoSave(get().windows, get().groups);
    },

    // 取消归档组
    unarchiveGroup: (id) => {
      set((state) => {
        const group = state.groups.find(g => g.id === id);
        if (group) {
          group.archived = false;
          group.lastActiveAt = new Date().toISOString();

          // 取消归档组内所有窗口
          const windowIds = getAllWindowIds(group.layout);
          windowIds.forEach(windowId => {
            const window = state.windows.find(w => w.id === windowId);
            if (window && window.archived) {
              window.archived = false;
              window.lastActiveAt = new Date().toISOString();
            }
          });
        }
      });
      triggerAutoSave(get().windows, get().groups);
    },

    // 设置活跃组（与 activeWindowId 互斥）
    setActiveGroup: (id) => {
      set((state) => {
        state.activeGroupId = id;
        // 激活组时清空 activeWindowId
        if (id) {
          state.activeWindowId = null;
          const group = state.groups.find(g => g.id === id);
          if (group) {
            group.lastActiveAt = new Date().toISOString();
          }
          state.groupMruList = [id, ...state.groupMruList.filter(gid => gid !== id)];
        }
      });
    },

    // 清空所有组
    clearGroups: () => {
      set((state) => {
        state.groups = [];
        state.activeGroupId = null;
        state.groupMruList = [];
      });
    },

    // ==================== 组布局操作 ====================

    // 添加窗口到组布局
    addWindowToGroupLayout: (groupId, targetWindowId, newWindowId, direction) => {
      set((state) => {
        const group = state.groups.find(g => g.id === groupId);
        if (!group) return;

        // 如果布局是单个窗口节点，创建拆分
        if (group.layout.type === 'window') {
          if (group.layout.id === targetWindowId) {
            group.layout = {
              type: 'split',
              direction,
              sizes: [0.5, 0.5],
              children: [
                group.layout,
                { type: 'window', id: newWindowId },
              ],
            };
          }
        } else {
          // 使用工具函数在布局树中添加
          const newLayout = addWindowToGroupInLayout(group.layout, targetWindowId, newWindowId, direction);
          if (newLayout) {
            group.layout = newLayout;
          }
        }
        group.lastActiveAt = new Date().toISOString();
      });
      triggerAutoSave(get().windows, get().groups);
    },

    // 从组中移除窗口
    removeWindowFromGroupLayout: (groupId, windowId) => {
      set((state) => {
        const groupIndex = state.groups.findIndex(g => g.id === groupId);
        if (groupIndex < 0) return;

        const group = state.groups[groupIndex];
        const newLayout = removeWindowFromGroupLayout(group.layout, windowId);

        if (!newLayout || getWindowCount(newLayout) < 2) {
          // 组内不足 2 个窗口，解散组
          state.groups.splice(groupIndex, 1);
          if (state.activeGroupId === groupId) {
            state.activeGroupId = null;
          }
          state.groupMruList = state.groupMruList.filter(gid => gid !== groupId);
        } else {
          group.layout = newLayout;
          if (group.activeWindowId === windowId) {
            group.activeWindowId = getAllWindowIds(newLayout)[0];
          }
          group.lastActiveAt = new Date().toISOString();
        }
      });
      triggerAutoSave(get().windows, get().groups);
    },

    // 更新组布局的 split sizes
    updateGroupSplitSizes: (groupId, splitPath, sizes) => {
      let didChange = false;

      set((state) => {
        const group = state.groups.find(g => g.id === groupId);
        if (!group) return;

        const nextLayout = updateGroupSplitSizesInLayout(group.layout, splitPath, sizes);
        if (nextLayout === group.layout) return;

        didChange = true;
        group.layout = nextLayout;
        group.lastActiveAt = new Date().toISOString();
      });

      if (didChange) {
        const { windows, groups } = get();
        triggerAutoSave(windows, groups);
      }
    },

    // 设置组内激活的窗口
    setActiveWindowInGroup: (groupId, windowId) => {
      set((state) => {
        const group = state.groups.find(g => g.id === groupId);
        if (group) {
          group.activeWindowId = windowId;
          group.lastActiveAt = new Date().toISOString();
        }
      });
    },

    // ==================== 组 MRU 相关 ====================

    // 更新组 MRU 列表
    updateGroupMRU: (groupId) => {
      set((state) => {
        state.groupMruList = [groupId, ...state.groupMruList.filter(id => id !== groupId)];
      });
    },

    // 获取按 MRU 排序的组列表
    getMRUGroups: () => {
      const { groups, groupMruList } = get();
      const groupMap = new Map(groups.map(g => [g.id, g]));
      return groupMruList
        .map(id => groupMap.get(id))
        .filter((g): g is WindowGroup => g !== undefined && !g.archived);
    },

    // ==================== 组辅助方法 ====================

    // 根据 ID 查找组
    getGroupById: (id) => {
      return get().groups.find(g => g.id === id);
    },

    // 获取组内的所有窗口
    getWindowsInGroup: (groupId) => {
      const { groups, windows } = get();
      const group = groups.find(g => g.id === groupId);
      if (!group) return [];

      const windowIds = getAllWindowIds(group.layout);
      const windowMap = new Map(windows.map(w => [w.id, w]));
      return windowIds
        .map(id => windowMap.get(id))
        .filter((w): w is Window => w !== undefined);
    },

    // 获取未归档的组
    getActiveGroups: () => {
      return get().groups.filter(g => !g.archived);
    },

    // 获取已归档的组
    getArchivedGroups: () => {
      return get().groups.filter(g => g.archived);
    },

    // 查找包含指定窗口的组
    findGroupByWindowId: (windowId) => {
      return get().groups.find(g =>
        getAllWindowIds(g.layout).includes(windowId)
      );
    },
  }))
);

// Re-export types for convenience
export type { Window };
export type { WindowGroup } from '../../shared/types/window-group';
export { WindowStatus } from '../types/window';
