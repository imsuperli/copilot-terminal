# 窗口组功能实现计划

## 背景

用户希望在终端应用中增加窗口组（Window Group）功能，允许同时打开多个窗口并排显示。当前应用支持单个窗口的多窗格布局（通过 tmux 兼容层），但终端视图一次只能显示一个窗口。窗口组功能将允许用户将多个窗口组合在一起，形成更复杂的工作空间布局。

## 核心需求

1. **窗口组布局**：支持自由拖拽布局，类似 VS Code 编辑器分割，可以形成复杂的嵌套布局
2. **激活行为**：点击组标签后，打开组内所有窗口的终端视图（多窗口并排显示）
3. **独立操作**：
   - 每个窗口可以独立启动/暂停/停止
   - 支持从组中移除窗口
   - 支持在组内关闭窗口（组内只剩一个窗口时自动解散组）
   - 支持组级别的批量操作（启动/暂停所有窗口）
4. **视觉标识**：组合图标（文件夹图标 + 数字徽章显示组内窗口数量）
5. **创建方式**：
   - 拖拽窗口到终端区域（根据鼠标位置提示分割方向）
   - 通过对话框创建（选择已有窗口或输入路径）
   - 拖拽 WindowCard 到 WindowCard（主界面）
6. **组内窗格**：保留 Window 的多窗格布局（一个组可以包含多个多窗格的 Window）
7. **快捷键**：不需要新增快捷键，使用现有的侧边栏和快速切换器

## 架构设计

### 数据结构

窗口组的布局设计完全复用 Window 的多窗格布局模式，使用递归树结构：

```typescript
// 窗口节点（叶子节点）- 引用 Window ID
interface WindowNode {
  type: 'window';
  id: string;  // 窗口 ID
}

// 拆分节点（分支节点）- 与 SplitNode 结构一致
interface GroupSplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  sizes: number[];  // 每个子节点的大小比例（总和为 1）
  children: GroupLayoutNode[];
}

type GroupLayoutNode = WindowNode | GroupSplitNode;

// 窗口组接口
interface WindowGroup {
  id: string;
  name: string;
  layout: GroupLayoutNode;  // 布局树根节点
  activeWindowId: string;   // 当前激活的窗口 ID
  createdAt: string;
  lastActiveAt: string;
  archived?: boolean;
}
```

### 状态管理扩展

在 `windowStore` 中添加：

- `groups: WindowGroup[]` - 窗口组列表
- `activeGroupId: string | null` - 当前激活的窗口组 ID
- `groupMruList: string[]` - 组的 MRU 列表
- 组相关 actions：`addGroup`, `removeGroup`, `updateGroup`, `archiveGroup` 等
- 组布局操作：`addWindowToGroup`, `removeWindowFromGroup`, `updateGroupSplitSizes` 等

激活状态管理：
- `activeWindowId` 和 `activeGroupId` 互斥
- 激活组时清空 `activeWindowId`，激活单窗口时清空 `activeGroupId`
- 终端视图根据 `activeGroupId` 是否为 null 决定显示单窗口还是组布局

### 持久化方案

升级 workspace.json 版本到 3.0，添加 `groups` 字段：

```json
{
  "version": "3.0",
  "windows": [...],
  "groups": [
    {
      "id": "group-uuid-1",
      "name": "前端项目组",
      "layout": {
        "type": "split",
        "direction": "horizontal",
        "sizes": [0.5, 0.5],
        "children": [
          { "type": "window", "id": "window-uuid-1" },
          { "type": "window", "id": "window-uuid-2" }
        ]
      },
      "activeWindowId": "window-uuid-1",
      "createdAt": "2026-03-13T10:00:00.000Z",
      "lastActiveAt": "2026-03-13T10:30:00.000Z"
    }
  ],
  "settings": {...},
  "lastSavedAt": "2026-03-13T10:30:00.000Z"
}
```

数据迁移：
- 2.0 -> 3.0：添加空的 `groups` 数组
- 加载后验证：移除引用不存在窗口的组节点
- 保存前验证：检查组内引用的窗口是否存在

## 关键文件

### 需要修改的文件

1. **src/shared/types/workspace.ts**
   - 添加 `groups: WindowGroup[]` 字段
   - 升级版本号到 '3.0'

2. **src/main/services/WorkspaceManager.ts**
   - 实现 2.0 -> 3.0 版本迁移逻辑
   - 添加组数据的保存和加载
   - 添加组完整性验证（移除引用不存在窗口的组）

3. **src/renderer/stores/windowStore.ts**
   - 添加组相关状态（groups, activeGroupId, groupMruList）
   - 添加组相关 actions（addGroup, removeGroup, updateGroup 等）
   - 添加组布局操作方法（addWindowToGroup, removeWindowFromGroup 等）

4. **src/shared/types/electron-api.ts**
   - 添加组相关 IPC 接口定义（createGroup, deleteGroup, startGroupWindows 等）

5. **src/main/index.ts**
   - 注册组相关 IPC 处理器

6. **src/renderer/components/CardGrid.tsx**
   - 扩展以支持显示 GroupCard
   - 支持拖拽 WindowCard 到 WindowCard 创建组

7. **src/renderer/components/layout/Sidebar.tsx**
   - 扩展以支持显示组和组内窗口
   - 显示组合图标（文件夹 + 数字徽章）

### 需要新增的文件

1. **src/shared/types/window-group.ts**
   - 定义 WindowGroup, GroupLayoutNode, WindowNode, GroupSplitNode

2. **src/main/services/GroupManager.ts**
   - 实现组管理服务（创建、删除、批量操作、完整性验证）

3. **src/renderer/components/GroupCard.tsx**
   - 组卡片组件（显示组名称、窗口数量、操作按钮）

4. **src/renderer/components/GroupView.tsx**
   - 组终端视图组件（顶部工具栏 + GroupSplitLayout）

5. **src/renderer/components/GroupSplitLayout.tsx**
   - 组布局渲染组件（递归渲染组布局树，类似 SplitLayout）
   - 每个 WindowNode 渲染一个完整的 TerminalView 组件
   - 支持拖拽调整窗口大小

6. **src/renderer/components/CreateGroupDialog.tsx**
   - 创建组对话框（选择窗口或输入路径）

7. **src/renderer/components/EditGroupPanel.tsx**
   - 编辑组面板（修改组名称、添加/移除窗口）

8. **src/renderer/components/dnd/DraggableWindowCard.tsx**
   - 可拖拽窗口卡片（使用 react-dnd）

9. **src/renderer/components/dnd/DropZone.tsx**
   - 拖拽目标区域（显示分割提示）

10. **src/renderer/utils/groupLayoutHelpers.ts**
    - 组布局操作工具函数（类似 layoutHelpers.ts）
    - 包含：findWindowNode, getAllWindows, addWindowToGroup, removeWindowFromGroup 等

11. **docs/window-group-feature.md**
    - 窗口组功能文档

## 实现步骤

### 阶段 1：数据结构和持久化（1-2 天）

1. 创建 `src/shared/types/window-group.ts`，定义 WindowGroup 相关类型
2. 修改 `src/shared/types/workspace.ts`，添加 groups 字段，升级版本号到 3.0
3. 修改 `src/main/services/WorkspaceManager.ts`：
   - 实现 2.0 -> 3.0 版本迁移逻辑
   - 添加组数据的保存和加载
   - 实现组完整性验证（移除引用不存在窗口的组节点）
4. 编写单元测试验证持久化逻辑

**验证方法**：
- 创建测试数据，保存到 workspace.json，重启应用后验证数据完整性
- 使用旧版 workspace.json（v2.0），验证迁移逻辑是否正确

### 阶段 2：状态管理（1-2 天）

1. 修改 `src/renderer/stores/windowStore.ts`：
   - 添加组相关状态（groups, activeGroupId, groupMruList）
   - 添加组相关 actions（addGroup, removeGroup, updateGroup, archiveGroup 等）
   - 添加组布局操作方法（addWindowToGroup, removeWindowFromGroup, updateGroupSplitSizes 等）
   - 添加辅助方法（getGroupById, getWindowsInGroup, updateGroupMRU 等）
2. 创建 `src/renderer/utils/groupLayoutHelpers.ts`，实现组布局操作工具函数
3. 编写单元测试验证状态管理逻辑

**验证方法**：
- 在浏览器控制台手动调用 store 方法，验证状态变化
- 使用 React DevTools 观察状态更新

### 阶段 3：主进程服务（1 天）

1. 创建 `src/main/services/GroupManager.ts`，实现组管理服务
2. 修改 `src/shared/types/electron-api.ts`，添加组相关 IPC 接口定义
3. 修改 `src/main/index.ts`，注册组相关 IPC 处理器
4. 修改 `src/preload/index.ts`，暴露组相关 API

**验证方法**：
- 使用 IPC 调试工具测试 IPC 通信
- 验证组操作是否正确触发主进程逻辑

### 阶段 4：UI 组件 - 主界面（2-3 天）

1. 创建 `src/renderer/components/GroupCard.tsx`，实现组卡片组件
2. 修改 `src/renderer/components/CardGrid.tsx`：
   - 扩展以支持显示 GroupCard
   - 实现组的创建、编辑、删除、归档操作
3. 创建 `src/renderer/components/CreateGroupDialog.tsx`，实现创建组对话框
4. 创建 `src/renderer/components/EditGroupPanel.tsx`，实现编辑组面板

**验证方法**：
- 在主界面创建组，验证 UI 显示
- 测试组的各种操作（编辑、删除、归档）

### 阶段 5：UI 组件 - 终端视图（3-4 天）

1. 创建 `src/renderer/components/GroupView.tsx`，实现组终端视图组件
2. 创建 `src/renderer/components/GroupSplitLayout.tsx`，实现组布局渲染组件：
   - 递归渲染组布局树（类似 SplitLayout）
   - 每个 WindowNode 渲染一个完整的 TerminalView 组件
   - 支持拖拽调整窗口大小
3. 修改 `src/renderer/components/layout/Sidebar.tsx`：
   - 扩展以支持显示组和组内窗口
   - 显示组合图标（文件夹 + 数字徽章）
4. 修改主应用路由，支持组视图的切换

**验证方法**：
- 点击组卡片，验证终端视图是否正确显示组布局
- 测试组内窗口的切换和调整大小

### 阶段 6：拖拽交互（2-3 天）

1. 安装 react-dnd 和 react-dnd-html5-backend 依赖
2. 创建 `src/renderer/components/dnd/DraggableWindowCard.tsx`，实现可拖拽窗口卡片
3. 创建 `src/renderer/components/dnd/DropZone.tsx`，实现拖拽目标区域
4. 修改 `src/renderer/components/CardGrid.tsx`，支持拖拽 WindowCard 到 WindowCard 创建组
5. 修改 `src/renderer/components/GroupSplitLayout.tsx`，支持拖拽窗口到组内调整布局
6. 修改 `src/renderer/components/layout/Sidebar.tsx`，支持拖拽窗口移出组

**验证方法**：
- 测试各种拖拽场景（WindowCard 到 WindowCard、窗口到终端区域）
- 验证拖拽提示是否正确显示
- 验证拖拽后的布局是否符合预期

### 阶段 7：边界情况和优化（1-2 天）

1. 处理组内只剩一个窗口的情况（自动解散组）
2. 处理归档窗口的组关系（归档窗口时从组中移除）
3. 处理组内窗口被删除的情况（从组布局中移除）
4. 优化性能（避免不必要的重渲染）
5. 添加错误处理和用户提示

**验证方法**：
- 测试各种边界情况（删除组内最后一个窗口、归档组内窗口）
- 使用 React Profiler 检查性能瓶颈

### 阶段 8：测试和文档（1 天）

1. 编写端到端测试
2. 更新 CLAUDE.md 文档
3. 创建 `docs/window-group-feature.md`，编写用户指南
4. 代码审查和重构

## 边界情况处理

### 组内只剩一个窗口

**策略**：自动解散组，将窗口恢复为独立窗口

在 `removeWindowFromGroup` 中检查：
- 如果移除后只剩一个窗口，删除组
- 保留剩余的窗口作为独立窗口

### 归档窗口的组关系

**策略**：归档窗口时，从所属组中移除

在 `archiveWindow` 中：
- 查找窗口所属的组
- 从组中移除窗口
- 如果组内只剩一个窗口，解散组

### 组内窗口被删除

**策略**：在 `deleteWindow` 时自动从组中移除

在 `deleteWindow` 中：
- 查找窗口所属的组
- 从组中移除窗口
- 如果组内只剩一个窗口，解散组

### 拖拽冲突

**策略**：使用拖拽状态锁，同一时间只允许一个拖拽操作

使用全局拖拽状态标志，在 `handleDragStart` 时检查并设置锁，在 `handleDragEnd` 时释放锁。

## 技术亮点

1. **架构一致性**：窗口组的布局树设计完全复用了 Window 的多窗格布局模式，降低学习成本
2. **数据完整性**：通过引用验证和孤儿清理机制，确保组数据始终有效
3. **渐进式迁移**：版本迁移策略支持从 1.0 -> 2.0 -> 3.0 的平滑升级
4. **性能优化**：TerminalView 组件保持挂载（使用 CSS display 控制），避免 xterm.js 重建
5. **用户体验**：支持多种创建方式（拖拽、对话框），提供直观的视觉反馈

## 验证计划

### 功能验证

1. **创建组**：
   - 通过对话框创建组
   - 拖拽 WindowCard 到 WindowCard 创建组
   - 拖拽窗口到终端区域创建组

2. **组操作**：
   - 编辑组名称
   - 添加窗口到组
   - 从组中移除窗口
   - 删除组
   - 归档组

3. **组内窗口操作**：
   - 独立启动/暂停/停止窗口
   - 在组内关闭窗口
   - 调整窗口大小

4. **布局调整**：
   - 拖拽调整窗口大小
   - 拖拽窗口到不同位置

5. **持久化**：
   - 创建组后重启应用，验证组是否正确恢复
   - 修改组布局后重启应用，验证布局是否正确恢复

### 边界情况验证

1. 删除组内最后一个窗口，验证组是否自动解散
2. 归档组内窗口，验证窗口是否从组中移除
3. 删除组内窗口，验证窗口是否从组中移除
4. 同时拖拽多个窗口，验证拖拽锁是否生效

### 性能验证

1. 创建包含 10 个窗口的组，验证渲染性能
2. 在组内频繁切换窗口，验证是否有卡顿
3. 使用 React Profiler 检查性能瓶颈
