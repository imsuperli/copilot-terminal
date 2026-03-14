import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWindowStore } from '../../windowStore';
import type { WindowGroup, GroupLayoutNode } from '@/shared/types/window-group';

/**
 * 窗口组功能单元测试
 *
 * 测试范围：
 * - 组的创建、删除、更新
 * - 组布局操作
 * - 组与窗口的关系管理
 * - 边界情况处理
 */
describe('windowStore - Window Groups', () => {
  beforeEach(() => {
    // 重置 store 状态
    useWindowStore.setState({
      windows: [],
      groups: [],
      activeWindowId: null,
      activeGroupId: null,
      groupMruList: [],
    });
  });

  describe('addGroup', () => {
    it('should add a group to the store', () => {
      // TODO: 实现测试
      // 1. 创建测试窗口
      // 2. 创建组
      // 3. 验证组被添加到 store
      // 4. 验证组的 MRU 列表更新
    });

    it('should add multiple groups', () => {
      // TODO: 实现测试
    });

    it('should validate group layout references existing windows', () => {
      // TODO: 实现测试
      // 验证组布局中引用的窗口必须存在
    });
  });

  describe('removeGroup', () => {
    it('should remove a group by id', () => {
      // TODO: 实现测试
    });

    it('should clear activeGroupId when removing active group', () => {
      // TODO: 实现测试
    });

    it('should restore windows to independent state when removing group', () => {
      // TODO: 实现测试
      // 验证删除组后，组内窗口恢复为独立窗口
    });
  });

  describe('updateGroup', () => {
    it('should update group name', () => {
      // TODO: 实现测试
    });

    it('should update group layout', () => {
      // TODO: 实现测试
    });

    it('should update group activeWindowId', () => {
      // TODO: 实现测试
    });

    it('should update lastActiveAt when updating group', () => {
      // TODO: 实现测试
    });
  });

  describe('archiveGroup', () => {
    it('should archive a group', () => {
      const store = useWindowStore.getState();

      // 创建测试窗口
      const window1 = {
        id: 'window-1',
        name: 'Window 1',
        workingDirectory: '/test/path1',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-1' },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window2 = {
        id: 'window-2',
        name: 'Window 2',
        workingDirectory: '/test/path2',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-2' },
        activePaneId: 'pane-2',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addWindow(window1);
      store.addWindow(window2);

      // 创建组
      const group: WindowGroup = {
        id: 'group-1',
        name: 'Test Group',
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
          ],
        },
        activeWindowId: 'window-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addGroup(group);

      // 归档组
      store.archiveGroup('group-1');

      // 验证组被归档
      const archivedGroup = store.getGroupById('group-1');
      expect(archivedGroup).toBeDefined();
      expect(archivedGroup?.archived).toBe(true);
    });

    it('should archive all windows in the group', () => {
      const store = useWindowStore.getState();

      // 创建测试窗口
      const window1 = {
        id: 'window-1',
        name: 'Window 1',
        workingDirectory: '/test/path1',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-1' },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window2 = {
        id: 'window-2',
        name: 'Window 2',
        workingDirectory: '/test/path2',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-2' },
        activePaneId: 'pane-2',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addWindow(window1);
      store.addWindow(window2);

      // 创建组
      const group: WindowGroup = {
        id: 'group-1',
        name: 'Test Group',
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
          ],
        },
        activeWindowId: 'window-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addGroup(group);

      // 归档组
      store.archiveGroup('group-1');

      // 验证组内所有窗口都被归档
      const archivedWindow1 = store.getWindowById('window-1');
      const archivedWindow2 = store.getWindowById('window-2');

      expect(archivedWindow1).toBeDefined();
      expect(archivedWindow1?.archived).toBe(true);
      expect(archivedWindow2).toBeDefined();
      expect(archivedWindow2?.archived).toBe(true);
    });

    it('should clear activeGroupId when archiving active group', () => {
      const store = useWindowStore.getState();

      // 创建测试窗口
      const window1 = {
        id: 'window-1',
        name: 'Window 1',
        workingDirectory: '/test/path1',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-1' },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window2 = {
        id: 'window-2',
        name: 'Window 2',
        workingDirectory: '/test/path2',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-2' },
        activePaneId: 'pane-2',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addWindow(window1);
      store.addWindow(window2);

      // 创建组
      const group: WindowGroup = {
        id: 'group-1',
        name: 'Test Group',
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
          ],
        },
        activeWindowId: 'window-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addGroup(group);
      store.setActiveGroup('group-1');

      // 验证组被激活
      expect(store.activeGroupId).toBe('group-1');

      // 归档组
      store.archiveGroup('group-1');

      // 验证 activeGroupId 被清空
      expect(store.activeGroupId).toBeNull();
    });
  });

  describe('addWindowToGroup', () => {
    it('should add a window to group layout', () => {
      // TODO: 实现测试
    });

    it('should remove window from independent windows list', () => {
      // TODO: 实现测试
    });

    it('should update group window count', () => {
      // TODO: 实现测试
    });
  });

  describe('removeWindowFromGroup', () => {
    it('should remove a window from group layout', () => {
      // TODO: 实现测试
    });

    it('should restore window to independent state', () => {
      // TODO: 实现测试
    });

    it('should dissolve group when only one window remains', () => {
      // TODO: 实现测试
      // 这是关键的边界情况：组内只剩一个窗口时自动解散
    });
  });

  describe('updateGroupSplitSizes', () => {
    it('should update split sizes in group layout', () => {
      // TODO: 实现测试
    });

    it('should validate split sizes sum to 1', () => {
      // TODO: 实现测试
    });
  });

  describe('setActiveGroup', () => {
    it('should set active group id', () => {
      // TODO: 实现测试
    });

    it('should clear activeWindowId when setting active group', () => {
      // TODO: 实现测试
      // 验证 activeWindowId 和 activeGroupId 互斥
    });

    it('should update group MRU list', () => {
      // TODO: 实现测试
    });

    it('should update group lastActiveAt', () => {
      // TODO: 实现测试
    });
  });

  describe('getGroupById', () => {
    it('should return group by id', () => {
      // TODO: 实现测试
    });

    it('should return undefined for non-existent group', () => {
      // TODO: 实现测试
    });
  });

  describe('getWindowsInGroup', () => {
    it('should return all windows in a group', () => {
      // TODO: 实现测试
    });

    it('should return windows in correct order', () => {
      // TODO: 实现测试
    });

    it('should handle nested split layouts', () => {
      // TODO: 实现测试
    });
  });

  describe('Edge Cases - Group with One Window', () => {
    it('should dissolve group when removing window leaves only one', () => {
      const store = useWindowStore.getState();

      // 创建测试窗口
      const window1 = {
        id: 'window-1',
        name: 'Window 1',
        workingDirectory: '/test/path1',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-1' },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window2 = {
        id: 'window-2',
        name: 'Window 2',
        workingDirectory: '/test/path2',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-2' },
        activePaneId: 'pane-2',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addWindow(window1);
      store.addWindow(window2);

      // 创建包含 2 个窗口的组
      const group: WindowGroup = {
        id: 'group-1',
        name: 'Test Group',
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
          ],
        },
        activeWindowId: 'window-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addGroup(group);

      // 从组中移除一个窗口
      store.removeWindowFromGroupLayout('group-1', 'window-1');

      // 验证组被解散
      const dissolvedGroup = store.getGroupById('group-1');
      expect(dissolvedGroup).toBeUndefined();

      // 验证剩余窗口仍然存在
      const remainingWindow = store.getWindowById('window-2');
      expect(remainingWindow).toBeDefined();
    });

    it('should dissolve group when deleting window leaves only one', () => {
      const store = useWindowStore.getState();

      // 创建测试窗口
      const window1 = {
        id: 'window-1',
        name: 'Window 1',
        workingDirectory: '/test/path1',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-1' },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window2 = {
        id: 'window-2',
        name: 'Window 2',
        workingDirectory: '/test/path2',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-2' },
        activePaneId: 'pane-2',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addWindow(window1);
      store.addWindow(window2);

      // 创建包含 2 个窗口的组
      const group: WindowGroup = {
        id: 'group-1',
        name: 'Test Group',
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
          ],
        },
        activeWindowId: 'window-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addGroup(group);

      // 删除一个窗口
      store.removeWindow('window-1');

      // 验证组被解散
      const dissolvedGroup = store.getGroupById('group-1');
      expect(dissolvedGroup).toBeUndefined();

      // 验证剩余窗口仍然存在
      const remainingWindow = store.getWindowById('window-2');
      expect(remainingWindow).toBeDefined();
    });

    it('should dissolve group when archiving window leaves only one', () => {
      const store = useWindowStore.getState();

      // 创建测试窗口
      const window1 = {
        id: 'window-1',
        name: 'Window 1',
        workingDirectory: '/test/path1',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-1' },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window2 = {
        id: 'window-2',
        name: 'Window 2',
        workingDirectory: '/test/path2',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-2' },
        activePaneId: 'pane-2',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addWindow(window1);
      store.addWindow(window2);

      // 创建包含 2 个窗口的组
      const group: WindowGroup = {
        id: 'group-1',
        name: 'Test Group',
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
          ],
        },
        activeWindowId: 'window-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addGroup(group);

      // 归档一个窗口
      store.archiveWindow('window-1');

      // 验证组被解散
      const dissolvedGroup = store.getGroupById('group-1');
      expect(dissolvedGroup).toBeUndefined();

      // 验证剩余窗口仍然存在且未被归档
      const remainingWindow = store.getWindowById('window-2');
      expect(remainingWindow).toBeDefined();
      expect(remainingWindow?.archived).toBeUndefined();

      // 验证被归档的窗口
      const archivedWindow = store.getWindowById('window-1');
      expect(archivedWindow).toBeDefined();
      expect(archivedWindow?.archived).toBe(true);
    });
  });

  describe('Edge Cases - Archive Window in Group', () => {
    it('should remove window from group when archiving', () => {
      const store = useWindowStore.getState();

      // 创建测试窗口
      const window1 = {
        id: 'window-1',
        name: 'Window 1',
        workingDirectory: '/test/path1',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-1' },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window2 = {
        id: 'window-2',
        name: 'Window 2',
        workingDirectory: '/test/path2',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-2' },
        activePaneId: 'pane-2',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window3 = {
        id: 'window-3',
        name: 'Window 3',
        workingDirectory: '/test/path3',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-3' },
        activePaneId: 'pane-3',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addWindow(window1);
      store.addWindow(window2);
      store.addWindow(window3);

      // 创建包含 3 个窗口的组
      const group: WindowGroup = {
        id: 'group-1',
        name: 'Test Group',
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.33, 0.33, 0.34],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
            { type: 'window', id: 'window-3' },
          ],
        },
        activeWindowId: 'window-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addGroup(group);

      // 归档一个窗口
      store.archiveWindow('window-1');

      // 验证窗口被归档
      const archivedWindow = store.getWindowById('window-1');
      expect(archivedWindow).toBeDefined();
      expect(archivedWindow?.archived).toBe(true);

      // 验证窗口从组中移除
      const updatedGroup = store.getGroupById('group-1');
      expect(updatedGroup).toBeDefined();

      const windowsInGroup = store.getWindowsInGroup('group-1');
      expect(windowsInGroup).toHaveLength(2);
      expect(windowsInGroup.find(w => w.id === 'window-1')).toBeUndefined();
      expect(windowsInGroup.find(w => w.id === 'window-2')).toBeDefined();
      expect(windowsInGroup.find(w => w.id === 'window-3')).toBeDefined();

      // 验证组仍然存在（因为还有 2 个窗口）
      expect(updatedGroup).toBeDefined();
    });

    it('should update group window count after archiving', () => {
      const store = useWindowStore.getState();

      // 创建测试窗口
      const window1 = {
        id: 'window-1',
        name: 'Window 1',
        workingDirectory: '/test/path1',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-1' },
        activePaneId: 'pane-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window2 = {
        id: 'window-2',
        name: 'Window 2',
        workingDirectory: '/test/path2',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-2' },
        activePaneId: 'pane-2',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      const window3 = {
        id: 'window-3',
        name: 'Window 3',
        workingDirectory: '/test/path3',
        command: 'bash',
        status: 'Running' as const,
        layout: { type: 'pane' as const, id: 'pane-3' },
        activePaneId: 'pane-3',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addWindow(window1);
      store.addWindow(window2);
      store.addWindow(window3);

      // 创建包含 3 个窗口的组
      const group: WindowGroup = {
        id: 'group-1',
        name: 'Test Group',
        layout: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.33, 0.33, 0.34],
          children: [
            { type: 'window', id: 'window-1' },
            { type: 'window', id: 'window-2' },
            { type: 'window', id: 'window-3' },
          ],
        },
        activeWindowId: 'window-1',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };

      store.addGroup(group);

      // 验证初始窗口数量
      const windowsInGroupBefore = store.getWindowsInGroup('group-1');
      expect(windowsInGroupBefore).toHaveLength(3);

      // 归档一个窗口
      store.archiveWindow('window-1');

      // 验证窗口数量更新
      const windowsInGroupAfter = store.getWindowsInGroup('group-1');
      expect(windowsInGroupAfter).toHaveLength(2);
    });
  });

  describe('Edge Cases - Delete Window in Group', () => {
    it('should remove window from group when deleting', () => {
      // TODO: 实现测试
      // 场景：组内有 3 个窗口，删除一个后组仍然存在
    });

    it('should update group window count after deleting', () => {
      // TODO: 实现测试
    });
  });

  describe('Edge Cases - Data Integrity', () => {
    it('should remove group nodes referencing non-existent windows', () => {
      // TODO: 实现测试
      // 场景：加载 workspace 时，组引用了不存在的窗口
    });

    it('should dissolve group if all windows are invalid', () => {
      // TODO: 实现测试
    });

    it('should handle corrupted group layout tree', () => {
      // TODO: 实现测试
    });
  });

  describe('Edge Cases - Extreme Scenarios', () => {
    it('should handle group with many windows (20+)', () => {
      // TODO: 实现测试
    });

    it('should handle deeply nested split layout', () => {
      // TODO: 实现测试
    });

    it('should handle empty group name', () => {
      // TODO: 实现测试
    });
  });

  describe('Integration with Existing Features', () => {
    it('should maintain window MRU list when switching between group and window', () => {
      // TODO: 实现测试
    });

    it('should preserve window pane layout when adding to group', () => {
      // TODO: 实现测试
      // 验证窗口的多窗格布局在加入组后不受影响
    });

    it('should handle archived groups correctly', () => {
      // TODO: 实现测试
    });
  });
});
