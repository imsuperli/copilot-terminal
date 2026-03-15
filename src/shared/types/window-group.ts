/**
 * 窗口组类型定义
 *
 * 窗口组允许将多个窗口组合在一起，形成复杂的工作空间布局。
 * 布局设计完全复用 Window 的多窗格布局模式，使用递归树结构。
 */

/**
 * 窗口节点（叶子节点）
 * 引用一个 Window ID
 */
export interface WindowNode {
  type: 'window';
  id: string;  // 窗口 ID
}

/**
 * 拆分节点（分支节点）
 * 与 Window 的 SplitNode 结构一致
 */
export interface GroupSplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  sizes: number[];  // 每个子节点的大小比例（总和为 1）
  children: GroupLayoutNode[];
}

/**
 * 组布局节点类型（递归）
 */
export type GroupLayoutNode = WindowNode | GroupSplitNode;

/**
 * 窗口组接口
 */
export interface WindowGroup {
  id: string;                    // UUID
  name: string;                  // 组名称（用户可自定义）
  layout: GroupLayoutNode;       // 布局树根节点
  activeWindowId: string;        // 当前激活的窗口 ID
  createdAt: string;             // 创建时间（ISO 8601）
  lastActiveAt: string;          // 最后活跃时间
  archived?: boolean;            // 是否已归档
}
