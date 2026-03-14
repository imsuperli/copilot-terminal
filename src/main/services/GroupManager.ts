import { randomUUID } from 'crypto';
import { WindowGroup, GroupLayoutNode, WindowNode, GroupSplitNode } from '../../shared/types/window-group';

/**
 * GroupManager 接口
 * 负责窗口组的创建、删除、布局操作等
 */
export interface IGroupManager {
  createGroup(name: string, windowIds: string[]): WindowGroup;
  deleteGroup(groupId: string, groups: WindowGroup[]): WindowGroup[];
  archiveGroup(groupId: string, groups: WindowGroup[]): WindowGroup[];
  unarchiveGroup(groupId: string, groups: WindowGroup[]): WindowGroup[];
  renameGroup(groupId: string, name: string, groups: WindowGroup[]): WindowGroup[];
  addWindowToGroup(groupId: string, windowId: string, direction: 'horizontal' | 'vertical', targetWindowId: string | null, groups: WindowGroup[]): WindowGroup[];
  removeWindowFromGroup(groupId: string, windowId: string, groups: WindowGroup[]): { groups: WindowGroup[]; dissolved: boolean };
  updateGroupSplitSizes(groupId: string, splitPath: number[], sizes: number[], groups: WindowGroup[]): WindowGroup[];
}

/**
 * GroupManager 实现
 */
export class GroupManagerImpl implements IGroupManager {
  /**
   * 创建窗口组
   * @param name 组名称
   * @param windowIds 初始窗口 ID 列表（至少 2 个）
   */
  createGroup(name: string, windowIds: string[]): WindowGroup {
    if (windowIds.length < 2) {
      throw new Error('窗口组至少需要 2 个窗口');
    }

    const layout = this.buildInitialLayout(windowIds);
    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      name,
      layout,
      activeWindowId: windowIds[0],
      createdAt: now,
      lastActiveAt: now,
    };
  }

  /**
   * 删除窗口组
   */
  deleteGroup(groupId: string, groups: WindowGroup[]): WindowGroup[] {
    return groups.filter(g => g.id !== groupId);
  }

  /**
   * 归档窗口组
   */
  archiveGroup(groupId: string, groups: WindowGroup[]): WindowGroup[] {
    return groups.map(g =>
      g.id === groupId ? { ...g, archived: true } : g,
    );
  }

  /**
   * 取消归档窗口组
   */
  unarchiveGroup(groupId: string, groups: WindowGroup[]): WindowGroup[] {
    return groups.map(g =>
      g.id === groupId ? { ...g, archived: false } : g,
    );
  }

  /**
   * 重命名窗口组
   */
  renameGroup(groupId: string, name: string, groups: WindowGroup[]): WindowGroup[] {
    return groups.map(g =>
      g.id === groupId ? { ...g, name } : g,
    );
  }

  /**
   * 添加窗口到组
   * @param targetWindowId 目标窗口 ID（在其旁边插入），null 则追加到根节点
   * @param direction 分割方向
   */
  addWindowToGroup(
    groupId: string,
    windowId: string,
    direction: 'horizontal' | 'vertical',
    targetWindowId: string | null,
    groups: WindowGroup[],
  ): WindowGroup[] {
    return groups.map(g => {
      if (g.id !== groupId) return g;

      const newNode: WindowNode = { type: 'window', id: windowId };
      let newLayout: GroupLayoutNode;

      if (!targetWindowId) {
        // 追加到根节点
        newLayout = this.appendToRoot(g.layout, newNode, direction);
      } else {
        // 在目标窗口旁边插入
        newLayout = this.insertNextTo(g.layout, targetWindowId, newNode, direction);
      }

      return { ...g, layout: newLayout };
    });
  }

  /**
   * 从组中移除窗口
   * 返回更新后的组列表和是否解散了组
   */
  removeWindowFromGroup(
    groupId: string,
    windowId: string,
    groups: WindowGroup[],
  ): { groups: WindowGroup[]; dissolved: boolean } {
    let dissolved = false;

    const newGroups = groups.reduce<WindowGroup[]>((acc, g) => {
      if (g.id !== groupId) {
        acc.push(g);
        return acc;
      }

      const cleaned = this.removeNode(g.layout, windowId);
      if (!cleaned) {
        // 布局为空，解散组
        dissolved = true;
        return acc;
      }

      const windowCount = this.countWindows(cleaned);
      if (windowCount < 2) {
        // 不足 2 个窗口，解散组
        dissolved = true;
        return acc;
      }

      // 修正 activeWindowId
      const allIds = this.getAllWindowIds(cleaned);
      const activeWindowId = allIds.includes(g.activeWindowId)
        ? g.activeWindowId
        : allIds[0];

      acc.push({ ...g, layout: cleaned, activeWindowId });
      return acc;
    }, []);

    return { groups: newGroups, dissolved };
  }

  /**
   * 更新分割节点的大小比例
   * @param splitPath 从根节点到目标 split 节点的子节点索引路径
   * @param sizes 新的大小比例
   */
  updateGroupSplitSizes(
    groupId: string,
    splitPath: number[],
    sizes: number[],
    groups: WindowGroup[],
  ): WindowGroup[] {
    return groups.map(g => {
      if (g.id !== groupId) return g;
      const newLayout = this.updateSizesAtPath(g.layout, splitPath, sizes);
      return { ...g, layout: newLayout };
    });
  }

  // ---- 内部辅助方法 ----

  private buildInitialLayout(windowIds: string[]): GroupLayoutNode {
    if (windowIds.length === 1) {
      return { type: 'window', id: windowIds[0] };
    }

    const children: WindowNode[] = windowIds.map(id => ({ type: 'window', id }));
    const sizes = children.map(() => 1 / children.length);

    return {
      type: 'split',
      direction: 'horizontal',
      sizes,
      children,
    };
  }

  private appendToRoot(
    root: GroupLayoutNode,
    newNode: WindowNode,
    direction: 'horizontal' | 'vertical',
  ): GroupSplitNode {
    if (root.type === 'split' && root.direction === direction) {
      // 同方向，直接追加
      const newSize = 1 / (root.children.length + 1);
      const scaledSizes = root.sizes.map(s => s * (1 - newSize));
      return {
        ...root,
        children: [...root.children, newNode],
        sizes: [...scaledSizes, newSize],
      };
    }

    // 不同方向或叶子节点，包裹成新的 split
    return {
      type: 'split',
      direction,
      sizes: [0.5, 0.5],
      children: [root, newNode],
    };
  }

  private insertNextTo(
    layout: GroupLayoutNode,
    targetId: string,
    newNode: WindowNode,
    direction: 'horizontal' | 'vertical',
  ): GroupLayoutNode {
    if (layout.type === 'window') {
      if (layout.id === targetId) {
        return {
          type: 'split',
          direction,
          sizes: [0.5, 0.5],
          children: [layout, newNode],
        };
      }
      return layout;
    }

    // split 节点：检查直接子节点中是否有目标
    const targetIndex = layout.children.findIndex(
      c => c.type === 'window' && c.id === targetId,
    );

    if (targetIndex !== -1 && layout.direction === direction) {
      // 同方向的 split，直接在目标旁边插入
      const newChildren = [...layout.children];
      newChildren.splice(targetIndex + 1, 0, newNode);
      const newSize = 1 / newChildren.length;
      const scaledSizes = layout.sizes.map(s => s * (1 - newSize));
      scaledSizes.splice(targetIndex + 1, 0, newSize);
      return { ...layout, children: newChildren, sizes: scaledSizes };
    }

    // 递归处理子节点
    return {
      ...layout,
      children: layout.children.map(child =>
        this.insertNextTo(child, targetId, newNode, direction),
      ),
    };
  }

  private removeNode(layout: GroupLayoutNode, windowId: string): GroupLayoutNode | null {
    if (layout.type === 'window') {
      return layout.id === windowId ? null : layout;
    }

    const newChildren: GroupLayoutNode[] = [];
    const remainingSizes: number[] = [];

    layout.children.forEach((child, i) => {
      const cleaned = this.removeNode(child, windowId);
      if (cleaned) {
        newChildren.push(cleaned);
        remainingSizes.push(layout.sizes[i] ?? 0);
      }
    });

    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) return newChildren[0];

    // 重新规范化 sizes
    const total = remainingSizes.reduce((sum, s) => sum + s, 0);
    const normalizedSizes = total > 0
      ? remainingSizes.map(s => s / total)
      : remainingSizes.map(() => 1 / remainingSizes.length);

    return { ...layout, children: newChildren, sizes: normalizedSizes };
  }

  private updateSizesAtPath(
    layout: GroupLayoutNode,
    path: number[],
    sizes: number[],
  ): GroupLayoutNode {
    if (layout.type === 'window') return layout;

    if (path.length === 0) {
      // 到达目标节点
      return { ...layout, sizes };
    }

    const [head, ...rest] = path;
    return {
      ...layout,
      children: layout.children.map((child, i) =>
        i === head ? this.updateSizesAtPath(child, rest, sizes) : child,
      ),
    };
  }

  private countWindows(layout: GroupLayoutNode): number {
    if (layout.type === 'window') return 1;
    return layout.children.reduce((sum, c) => sum + this.countWindows(c), 0);
  }

  private getAllWindowIds(layout: GroupLayoutNode): string[] {
    if (layout.type === 'window') return [layout.id];
    return layout.children.flatMap(c => this.getAllWindowIds(c));
  }
}
