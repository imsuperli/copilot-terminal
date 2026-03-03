# 窗格架构梳理

## 核心设计理念

**单窗格和多窗格使用完全相同的逻辑，没有分别实现。**

单窗格只是多窗格的特例（窗格数量 = 1），整个系统采用统一的递归树结构来处理。

## 数据结构

### 布局树（LayoutNode）

```typescript
type LayoutNode = PaneNode | SplitNode;

// 叶子节点：单个窗格
interface PaneNode {
  type: 'pane';
  id: string;
  pane: Pane;
}

// 分支节点：拆分容器
interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  sizes: number[];
  children: LayoutNode[];
}
```

**关键点**：
- 单窗格时，layout 就是一个 PaneNode
- 多窗格时，layout 是一个 SplitNode，包含多个子节点
- 子节点可以是 PaneNode 或 SplitNode（支持嵌套拆分）

## 组件层次

### 1. TerminalView（顶层容器）

**职责**：
- 显示窗口信息（名称、窗格数量、状态圆点）
- 提供拆分按钮
- 管理侧边栏、快速切换器等

**复用逻辑**：
- 使用 `getPaneCount(layout)` 获取窗格总数
- 使用 `getAllPanes(layout)` 获取所有窗格
- 无论单窗格还是多窗格，都显示状态圆点（统一样式）

### 2. SplitLayout（递归布局渲染器）

**职责**：
- 递归渲染布局树
- 根据节点类型选择渲染方式

**复用逻辑**：
```typescript
if (layout.type === 'pane') {
  // 渲染单个窗格
  return <TerminalPane ... />;
}

// 渲染拆分容器
return <SplitContainer ... />;
```

**关键优化**：
- 计算窗格总数 `getPaneCount(layout)`
- 只有多个窗格时才传递 `onClose` 回调
- 单窗格时 `onClose = undefined`，不显示关闭按钮

### 3. SplitContainer（拆分容器）

**职责**：
- 渲染拆分节点的子节点
- 提供拖拽调整大小功能
- 渲染分隔条

**复用逻辑**：
- 递归调用 `SplitLayout` 渲染每个子节点
- 子节点可以是单窗格或嵌套拆分

### 4. TerminalPane（单个窗格）

**职责**：
- 渲染 xterm.js 终端
- 显示状态圆点（右上角）
- 显示关闭按钮（悬浮时，仅多窗格）
- 显示选中边框

**复用逻辑**：
- 所有窗格使用同一个组件
- 通过 `isActive` 控制选中状态
- 通过 `onClose` 是否存在控制关闭按钮显示

**样式统一**：
- 所有窗格都显示右上角状态圆点
- 选中时显示外围边框（颜色根据状态变化）
- 未选中时无边框

## 状态管理

### 窗格状态（WindowStatus）

```typescript
enum WindowStatus {
  Running,        // 运行中 - 闪烁动画
  WaitingForInput, // 等待输入 - 呼吸灯动画
  Paused,         // 暂停 - 静态
  Error,          // 错误 - 静态
  Completed,      // 完成 - 静态
  Restoring,      // 启动中 - 静态
}
```

### 状态圆点（StatusDot）

**统一组件**：
- 所有地方使用同一个 `StatusDot` 组件
- 位置：
  1. WindowCard 右侧（主界面卡片）
  2. TerminalView 顶部工具栏
  3. TerminalPane 右上角

**动画效果**：
- Running：`animate-blink`（1秒闪烁）
- WaitingForInput：`animate-breathe`（2秒呼吸）
- 其他：静态显示

## 工具函数（layoutHelpers.ts）

### 复用的核心函数

```typescript
// 获取所有窗格
getAllPanes(layout: LayoutNode): Pane[]

// 获取窗格数量
getPaneCount(layout: LayoutNode): number

// 获取聚合状态
getAggregatedStatus(layout: LayoutNode): WindowStatus

// 拆分窗格
splitPane(layout, targetPaneId, direction, newPane): LayoutNode

// 关闭窗格
closePane(layout, paneId): LayoutNode

// 更新窗格
updatePaneInLayout(layout, paneId, updates): LayoutNode
```

**关键点**：
- 所有函数都是递归实现
- 自动处理单窗格和多窗格的情况
- 无需特殊判断

## 交互流程

### 拆分窗格

1. 用户点击拆分按钮
2. `TerminalView.handleSplitPane()` 创建新窗格
3. 调用 `splitPaneInWindow()` 更新布局树
4. `splitPane()` 将 PaneNode 转换为 SplitNode
5. SplitLayout 重新渲染，显示两个窗格

### 关闭窗格

1. 用户悬浮到窗格右上角，点击关闭按钮
2. `TerminalPane.onClose()` 触发
3. 调用 `closePaneInWindow()` 更新布局树
4. `closePane()` 移除窗格节点
5. 如果 SplitNode 只剩一个子节点，提升该子节点
6. SplitLayout 重新渲染

**特殊情况**：
- 只有一个窗格时，`onClose = undefined`，不显示关闭按钮
- 无法关闭最后一个窗格

## 总结

### 优点

1. **统一的数据结构**：树形结构自然支持单窗格和多窗格
2. **递归算法**：所有操作都是递归实现，代码简洁
3. **组件复用**：所有窗格使用同一个 TerminalPane 组件
4. **样式一致**：单窗格和多窗格的样式完全相同

### 关键设计决策

1. **单窗格 = 多窗格的特例**：不需要特殊处理
2. **状态圆点统一显示**：无论窗格数量，都显示圆点
3. **关闭按钮条件显示**：只有多窗格时才显示
4. **选中状态通过边框表示**：不使用顶部彩色边框

### 未来扩展

如果需要支持更复杂的布局（如标签页、浮动窗口），只需：
1. 扩展 LayoutNode 类型
2. 在 SplitLayout 中添加新的渲染分支
3. 无需修改 TerminalPane 组件
