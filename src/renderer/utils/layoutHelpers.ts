import { v4 as uuidv4 } from 'uuid';
import {
  Window,
  LegacyWindow,
  LayoutNode,
  PaneNode,
  SplitNode,
  Pane,
  WindowStatus,
} from '../types/window';

type PauseCollapseResult = {
  layout: PaneNode;
  activePaneId: string;
};

/**
 * 从旧版 Window 迁移到新版 Window
 */
export function migrateLegacyWindow(legacy: LegacyWindow): Window {
  const paneId = uuidv4();
  const pane: Pane = {
    id: paneId,
    cwd: legacy.workingDirectory,
    command: legacy.command,
    status: legacy.status,
    pid: legacy.pid,
    lastOutput: legacy.lastOutput,
  };

  const layout: PaneNode = {
    type: 'pane',
    id: paneId,
    pane,
  };

  return {
    id: legacy.id,
    name: legacy.name,
    layout,
    activePaneId: paneId,
    createdAt: legacy.createdAt,
    lastActiveAt: legacy.lastActiveAt,
    archived: legacy.archived,
  };
}

/**
 * 创建单窗格的 Window
 */
export function createSinglePaneWindow(
  name: string,
  cwd: string,
  command: string
): Window {
  const windowId = uuidv4();
  const paneId = uuidv4();

  const pane: Pane = {
    id: paneId,
    cwd,
    command,
    status: WindowStatus.Paused,
    pid: null,
  };

  const layout: PaneNode = {
    type: 'pane',
    id: paneId,
    pane,
  };

  return {
    id: windowId,
    name,
    layout,
    activePaneId: paneId,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
}

/**
 * 在布局树中查找窗格节点
 */
export function findPaneNode(
  layout: LayoutNode,
  paneId: string
): PaneNode | null {
  if (layout.type === 'pane') {
    return layout.id === paneId ? layout : null;
  }

  // SplitNode: 递归查找子节点
  for (const child of layout.children) {
    const found = findPaneNode(child, paneId);
    if (found) return found;
  }

  return null;
}

/**
 * 获取布局树中的所有窗格（优化版：避免创建临时数组）
 */
export function getAllPanes(layout: LayoutNode): Pane[] {
  // 防御性检查：如果 layout 为 undefined 或 null，返回空数组
  if (!layout) {
    console.warn('[getAllPanes] Layout is undefined or null');
    return [];
  }

  const result: Pane[] = [];

  function collect(node: LayoutNode) {
    if (!node) return;

    if (node.type === 'pane') {
      result.push(node.pane);
    } else {
      node.children.forEach(collect);
    }
  }

  collect(layout);
  return result;
}

/**
 * 拆分窗格（在指定窗格位置创建拆分）
 */
export function splitPane(
  layout: LayoutNode,
  targetPaneId: string,
  direction: 'horizontal' | 'vertical',
  newPane: Pane
): LayoutNode | null {
  if (layout.type === 'pane') {
    if (layout.id === targetPaneId) {
      // 找到目标窗格，创建拆分节点
      const newPaneNode: PaneNode = {
        type: 'pane',
        id: newPane.id,
        pane: newPane,
      };

      const splitNode: SplitNode = {
        type: 'split',
        direction,
        sizes: [0.5, 0.5], // 默认均分
        children: [layout, newPaneNode],
      };

      return splitNode;
    }
    return layout;
  }

  // SplitNode: 递归处理子节点
  const newChildren = layout.children.map(child =>
    splitPane(child, targetPaneId, direction, newPane)
  );

  // 检查是否有子节点被修改
  const hasChanges = newChildren.some((child, i) => child !== layout.children[i]);
  if (!hasChanges) return layout;

  return {
    ...layout,
    children: newChildren.filter((child): child is LayoutNode => child !== null),
  };
}

/**
 * 关闭窗格（从布局树中移除）
 */
export function closePane(
  layout: LayoutNode,
  paneId: string
): LayoutNode | null {
  if (layout.type === 'pane') {
    // 如果是要关闭的窗格，返回 null
    return layout.id === paneId ? null : layout;
  }

  let hasChanges = false;
  const newChildren: LayoutNode[] = [];
  const remainingSizes: number[] = [];

  // SplitNode: 递归处理子节点，仅在当前层子节点数量变化时重算 sizes
  layout.children.forEach((child, index) => {
    const nextChild = closePane(child, paneId);
    if (nextChild !== child) {
      hasChanges = true;
    }
    if (nextChild !== null) {
      newChildren.push(nextChild);
      remainingSizes.push(layout.sizes[index] ?? 0);
    }
  });

  if (!hasChanges) {
    return layout;
  }

  // 如果没有子节点了，返回 null
  if (newChildren.length === 0) {
    return null;
  }

  // 如果只剩一个子节点，折叠 SplitNode，直接返回该子节点
  if (newChildren.length === 1) {
    return newChildren[0];
  }

  const sizesChanged = newChildren.length !== layout.children.length;
  const newSizes = sizesChanged
    ? normalizeSizes(remainingSizes)
    : layout.sizes;

  return {
    ...layout,
    children: newChildren,
    sizes: newSizes,
  };
}

function hasStrongTmuxAgentMarker(pane: Pane): boolean {
  return Boolean(
    pane.teamName
    || pane.agentId
    || pane.agentName
    || pane.agentColor
  );
}

function hasWeakTmuxAgentMarker(pane: Pane): boolean {
  return Boolean(
    pane.title
    || pane.borderColor
    || pane.activeBorderColor
    || pane.teammateMode === 'tmux'
  );
}

export function isTmuxAgentPane(pane: Pane): boolean {
  return hasStrongTmuxAgentMarker(pane) || hasWeakTmuxAgentMarker(pane);
}

function sanitizePaneForPause(pane: Pane): Pane {
  return {
    ...pane,
    status: WindowStatus.Paused,
    pid: null,
  };
}

export function collapseTmuxAgentPanesForPause(layout: LayoutNode): PauseCollapseResult | null {
  const panes = getAllPanes(layout);
  if (panes.length <= 1) {
    return null;
  }

  const strongMarkerCount = panes.filter(hasStrongTmuxAgentMarker).length;
  const weakMarkerCount = panes.filter(hasWeakTmuxAgentMarker).length;
  if (strongMarkerCount === 0 && weakMarkerCount < 2) {
    return null;
  }

  const paneToKeep = panes.find((pane) => !isTmuxAgentPane(pane))
    || panes.find((pane) => !hasStrongTmuxAgentMarker(pane))
    || panes[0];

  const sanitizedPane = sanitizePaneForPause(paneToKeep);
  return {
    layout: {
      type: 'pane',
      id: sanitizedPane.id,
      pane: sanitizedPane,
    },
    activePaneId: sanitizedPane.id,
  };
}

function normalizeSizes(sizes: number[]): number[] {
  const normalizedSizes = sizes.map(size =>
    Number.isFinite(size) && size > 0 ? size : 0
  );
  const total = normalizedSizes.reduce((sum, size) => sum + size, 0);

  if (total <= 0) {
    return sizes.map(() => 1 / sizes.length);
  }

  return normalizedSizes.map(size => size / total);
}

/**
 * 更新布局树中的窗格数据
 */
export function updatePaneInLayout(
  layout: LayoutNode,
  paneId: string,
  updates: Partial<Pane>
): LayoutNode {
  if (layout.type === 'pane') {
    if (layout.id === paneId) {
      return {
        ...layout,
        pane: {
          ...layout.pane,
          ...updates,
        },
      };
    }
    return layout;
  }

  // SplitNode: 递归更新子节点
  let didChange = false;
  const nextChildren = layout.children.map((child) => {
    const nextChild = updatePaneInLayout(child, paneId, updates);
    if (nextChild !== child) {
      didChange = true;
    }
    return nextChild;
  });

  if (!didChange) {
    return layout;
  }

  return {
    ...layout,
    children: nextChildren,
  };
}

/**
 * 更新布局树中某个 split 节点的 sizes
 * splitPath 使用子节点索引描述从根 split 到目标 split 的路径；根 split 为 []
 */
export function updateSplitSizes(
  layout: LayoutNode,
  splitPath: number[],
  sizes: number[]
): LayoutNode {
  if (layout.type !== 'split') {
    return layout;
  }

  if (splitPath.length === 0) {
    if (sizes.length !== layout.children.length) {
      return layout;
    }

    const nextSizes = normalizeSizes(sizes);
    const didChange = nextSizes.some((size, index) => size !== layout.sizes[index]);
    if (!didChange) {
      return layout;
    }

    return {
      ...layout,
      sizes: nextSizes,
    };
  }

  const [childIndex, ...restPath] = splitPath;
  const targetChild = layout.children[childIndex];
  if (!targetChild || targetChild.type !== 'split') {
    return layout;
  }

  const nextChild = updateSplitSizes(targetChild, restPath, sizes);
  if (nextChild === targetChild) {
    return layout;
  }

  return {
    ...layout,
    children: layout.children.map((child, index) => (
      index === childIndex ? nextChild : child
    )),
  };
}

/**
 * 获取窗口的聚合状态（基于所有窗格的状态）
 */
export function getAggregatedStatus(layout: LayoutNode): WindowStatus {
  // 防御性检查：如果 layout 为 undefined 或 null，返回暂停状态
  if (!layout) {
    console.warn('[getAggregatedStatus] Layout is undefined or null');
    return WindowStatus.Paused;
  }

  const panes = getAllPanes(layout);

  // 如果有任何窗格在运行，则窗口状态为运行中
  if (panes.some(p => p.status === WindowStatus.Running)) {
    return WindowStatus.Running;
  }

  // 如果有任何窗格在启动中，则窗口状态为启动中
  if (panes.some(p => p.status === WindowStatus.Restoring)) {
    return WindowStatus.Restoring;
  }

  // 如果有任何窗格在等待输入，则窗口状态为等待输入
  if (panes.some(p => p.status === WindowStatus.WaitingForInput)) {
    return WindowStatus.WaitingForInput;
  }

  // 如果有任何窗格出错，则窗口状态为出错
  if (panes.some(p => p.status === WindowStatus.Error)) {
    return WindowStatus.Error;
  }

  // 如果所有窗格都已完成，则窗口状态为已完成
  if (panes.every(p => p.status === WindowStatus.Completed)) {
    return WindowStatus.Completed;
  }

  // 如果所有窗格都暂停，则窗口状态为暂停
  if (panes.every(p => p.status === WindowStatus.Paused)) {
    return WindowStatus.Paused;
  }

  // 默认返回暂停
  return WindowStatus.Paused;
}

/**
 * 计算布局树的深度
 */
export function getLayoutDepth(layout: LayoutNode): number {
  if (layout.type === 'pane') {
    return 1;
  }

  const childDepths = layout.children.map(child => getLayoutDepth(child));
  return 1 + Math.max(...childDepths);
}

/**
 * 获取布局树中的窗格数量
 */
export function getPaneCount(layout: LayoutNode): number {
  return getAllPanes(layout).length;
}
