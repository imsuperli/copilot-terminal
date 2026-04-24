import { Window, WindowStatus, LayoutNode, Pane } from '../types/window';
import { WindowGroup, GroupLayoutNode } from '../types/window-group';

/**
 * 获取窗口状态的优先级
 *
 * 优先级规则：Running > WaitingForInput > Restoring > Error > Inactive
 *
 * @param status 窗口状态
 * @returns 状态优先级（数值越大优先级越高）
 */
export function getStatusPriority(status: WindowStatus): number {
  const priorities: Record<WindowStatus, number> = {
    [WindowStatus.Running]: 5,
    [WindowStatus.WaitingForInput]: 4,
    [WindowStatus.Restoring]: 3,
    [WindowStatus.Error]: 2,
    [WindowStatus.Completed]: 1,
    [WindowStatus.Paused]: 1
  };

  return priorities[status] ?? 0;
}

/**
 * 从布局树中递归提取所有窗格
 *
 * @param layout 布局节点（可能是窗格节点或拆分节点）
 * @returns 所有窗格的数组
 */
function extractPanesFromLayout(layout: LayoutNode): Pane[] {
  if (layout.type === 'pane') {
    return [layout.pane];
  }

  if (layout.type === 'split' && Array.isArray(layout.children)) {
    return layout.children.flatMap(child => extractPanesFromLayout(child));
  }

  return [];
}

/**
 * 计算窗口的状态
 *
 * 窗口状态 = 该窗口所有窗格中优先级最高的窗格状态
 *
 * @param window 窗口对象
 * @returns 窗口的整体状态
 */
export function getWindowStatus(window: Window): WindowStatus {
  // 从布局树中提取所有窗格
  const panes = extractPanesFromLayout(window.layout);

  // 边界情况：空窗格数组返回 Completed（文档中称为 Exited）
  if (panes.length === 0) {
    return WindowStatus.Completed;
  }

  // 找到优先级最高的窗格状态
  let highestStatus = panes[0].status;
  let highestPriority = getStatusPriority(highestStatus);

  for (const pane of panes) {
    const priority = getStatusPriority(pane.status);
    if (priority > highestPriority) {
      highestStatus = pane.status;
      highestPriority = priority;
    }
  }

  return highestStatus;
}

/**
 * 从组布局树中递归提取所有窗口 ID
 *
 * @param layout 组布局节点（可能是窗口节点或拆分节点）
 * @returns 所有窗口 ID 的数组
 */
function extractWindowIdsFromGroupLayout(layout: GroupLayoutNode): string[] {
  if (layout.type === 'window') {
    return [layout.id];
  }

  if (layout.type === 'split' && Array.isArray(layout.children)) {
    return layout.children.flatMap(child => extractWindowIdsFromGroupLayout(child));
  }

  return [];
}

/**
 * 计算窗口组的状态
 *
 * 窗口组状态 = 该窗口组所有窗口中优先级最高的窗口状态
 * 而每个窗口的状态 = 该窗口所有窗格中优先级最高的窗格状态
 *
 * @param group 窗口组对象
 * @param windows 所有窗口的数组
 * @returns 窗口组的整体状态
 */
export function getGroupStatus(group: WindowGroup, windows: Window[]): WindowStatus {
  // 从组布局中提取所有窗口 ID
  const windowIds = extractWindowIdsFromGroupLayout(group.layout);

  // 过滤出属于该组的窗口
  const groupWindows = windows.filter(w => windowIds.includes(w.id));

  // 边界情况：空窗口数组返回 Completed（文档中称为 Exited）
  if (groupWindows.length === 0) {
    return WindowStatus.Completed;
  }

  // 找到优先级最高的窗口状态
  let highestStatus = getWindowStatus(groupWindows[0]);
  let highestPriority = getStatusPriority(highestStatus);

  for (const window of groupWindows) {
    const windowStatus = getWindowStatus(window);
    const priority = getStatusPriority(windowStatus);
    if (priority > highestPriority) {
      highestStatus = windowStatus;
      highestPriority = priority;
    }
  }

  return highestStatus;
}
