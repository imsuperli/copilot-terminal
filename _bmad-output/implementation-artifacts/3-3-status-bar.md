# Story 3.3: 状态统计栏（StatusBar）

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 在工具栏看到各状态的窗口数量统计,
So that 无需逐个扫视卡片即可掌握全局分布。

## Acceptance Criteria

1. **Given** 窗口卡片网格已实现（Story 3.2）
   **When** 实现 StatusBar 组件
   **Then** 工具栏显示状态统计：运行中 X · 等待输入 X · 已完成 X · 出错 X

2. **Given** StatusBar 组件已实现
   **When** 渲染状态统计
   **Then** 每个状态数字使用对应的状态色标注

3. **Given** StatusBar 组件已实现
   **When** 窗口状态发生变化
   **Then** 数字实时更新，响应窗口状态变化

4. **Given** StatusBar 组件已实现
   **When** 窗口宽度 < 640px
   **Then** 简化为图标 + 数字，省略文字标签

5. **Given** StatusBar 组件已实现
   **When** 状态变化时
   **Then** 支持 aria-live="polite"，屏幕阅读器自动播报

## Tasks / Subtasks

- [ ] Task 1: 创建 StatusBar 组件基础结构 (AC: 1, 2)
  - [ ] 1.1 创建 `src/renderer/components/StatusBar.tsx`
  - [ ] 1.2 定义 Props 接口：`StatusBarProps { windows: Window[] }`
  - [ ] 1.3 实现状态计数逻辑：从 windows 数组中统计各状态的窗口数量
  - [ ] 1.4 实现基础布局：水平排列，各状态项用 · 分隔
  - [ ] 1.5 实现状态项结构：状态文字标签 + 数字（使用对应状态色）
  - [ ] 1.6 复用 Story 3.1 的状态色映射系统（`getStatusColor` 工具函数）

- [ ] Task 2: 实现响应式布局（简化模式） (AC: 4)
  - [ ] 2.1 使用 Tailwind CSS 媒体查询：`< 640px` 时切换布局
  - [ ] 2.2 简化模式：隐藏文字标签，仅显示状态图标 + 数字
  - [ ] 2.3 定义状态图标：运行中（圆形脉冲图标）、等待输入（暂停图标）、已完成（勾选图标）、出错（叉号图标）
  - [ ] 2.4 图标使用对应的状态色
  - [ ] 2.5 确保简化模式下数字与图标对齐清晰

- [ ] Task 3: 实现实时更新机制 (AC: 3)
  - [ ] 3.1 从 Zustand store 订阅 windows 数组：`useWindowStore(state => state.windows)`
  - [ ] 3.2 使用 useMemo 缓存状态计数结果，避免不必要的重计算
  - [ ] 3.3 windows 数组变化时自动触发重新计算和重渲染
  - [ ] 3.4 确保状态更新无过渡动画，数字直接切换

- [ ] Task 4: 实现无障碍支持 (AC: 5)
  - [ ] 4.1 在 StatusBar 容器上添加 `aria-live="polite"` 属性
  - [ ] 4.2 添加 `aria-label`，描述当前状态统计（如 "窗口状态统计：运行中 8 个，等待输入 3 个，已完成 4 个，出错 0 个"）
  - [ ] 4.3 状态变化时，aria-label 自动更新
  - [ ] 4.4 确保屏幕阅读器可正确播报状态变化
  - [ ] 4.5 图标添加 `aria-hidden="true"`，避免重复播报

- [ ] Task 5: 集成到工具栏并测试 (AC: 1-5)
  - [ ] 5.1 在 `src/renderer/components/Toolbar.tsx` 中导入 StatusBar
  - [ ] 5.2 将 StatusBar 放置在工具栏右侧（应用名称左侧，新建窗口按钮右侧）
  - [ ] 5.3 测试不同窗口数量和状态分布下的显示效果
  - [ ] 5.4 测试响应式布局：窗口宽度 < 640px 时切换为简化模式
  - [ ] 5.5 测试实时更新：创建/删除/状态变化时数字正确更新
  - [ ] 5.6 测试无障碍：使用屏幕阅读器验证播报内容

- [ ] Task 6: 编写单元测试 (AC: 1-5)
  - [ ] 6.1 创建 `src/renderer/components/__tests__/StatusBar.test.tsx`
  - [ ] 6.2 测试状态计数逻辑：验证各状态窗口数量统计正确
  - [ ] 6.3 测试状态色应用：验证数字使用对应的状态色
  - [ ] 6.4 测试响应式布局：验证 < 640px 时切换为简化模式
  - [ ] 6.5 测试实时更新：验证 windows 数组变化时组件重渲染
  - [ ] 6.6 测试无障碍：验证 aria-live, aria-label 属性正确设置

## Dev Notes

### 架构约束与技术要求

**组件设计原则（架构文档）：**
- StatusBar 是全局状态感知组件，所有用户旅程都依赖它快速掌握全局分布
- 使用 React.memo 避免不必要的重渲染（性能优化）
- 使用 useMemo 缓存状态计数结果，避免每次渲染都重新计算
- 组件应该轻量、高性能，因为它会在每次窗口状态变化时更新

**数据模型（架构文档）：**
```typescript
interface Window {
  id: string;
  name: string;
  workingDirectory: string;
  command: string;
  status: WindowStatus;          // 用于统计
  pid: number | null;
  createdAt: string;
  lastActiveAt: string;
  model?: string;
  lastOutput?: string;
}

enum WindowStatus {
  Running = 'running',
  WaitingForInput = 'waiting',
  Completed = 'completed',
  Error = 'error',
  Restoring = 'restoring'
}
```

**Zustand Store 依赖（Story 2.3）：**
- Store 路径: `src/renderer/stores/windowStore.ts`
- `windows: Window[]` 数组存储所有窗口
- 组件通过 `useWindowStore(state => state.windows)` 订阅

**状态色映射系统（Story 3.1）：**
- 复用 `src/renderer/utils/statusHelpers.ts` 中的 `getStatusColor()` 和 `getStatusLabel()` 工具函数
- 状态色定义：running=蓝色（#3B82F6），waiting=黄色/琥珀色（#F59E0B），completed=绿色（#10B981），error=红色（#EF4444），restoring=灰色（#6B7280）

### UX 规范要点

**StatusBar 组件规范（UX 设计文档 Component Strategy）：**

**Purpose：** 在工具栏中一行展示各状态的窗口数量，用户无需逐个扫视卡片即可掌握全局分布。

**Content：** 各状态的窗口计数，如 "运行中 8 · 等待输入 3 · 已完成 4 · 出错 0"

**States：** 数字实时更新，对应状态色标注

**Accessibility：** aria-live="polite"，状态变化时屏幕阅读器自动播报

**响应式布局（UX 设计文档 Responsive Strategy）：**
- 窗口宽度 < 640px 时简化为图标 + 数字，省略文字标签
- 状态统计栏在 compact 模式下简化为图标 + 数字，省略文字标签

**视觉设计规范（UX 设计文档 Visual Design Foundation）：**

**颜色系统：**
- 状态色（高饱和度）：运行中=蓝色、等待输入=黄色/琥珀色、已完成=绿色、出错=红色
- 文字色：主文字使用低饱和度暖灰（`text-zinc-100`），状态数字使用对应状态色
- 分隔符：使用 · 字符，灰色（`text-zinc-500`）

**字体系统：**
- 状态标签：小字号（`text-sm`），正常字重
- 状态数字：小字号（`text-sm`），加粗（`font-semibold`），状态色

**间距系统：**
- 状态项之间间距：12px（`space-x-3`）
- 分隔符与状态项间距：8px（`mx-2`）

**无障碍要求（UX 设计文档 Accessibility Strategy）：**
- 状态色不仅依赖颜色，同时配合状态文字标签（运行中/等待输入/已完成/出错）
- aria-live="polite" 确保状态变化时屏幕阅读器自动播报
- aria-label 包含完整的状态统计信息
- 图标添加 aria-hidden="true"，避免重复播报

### 技术实现指导

**状态计数逻辑：**
```typescript
const statusCounts = useMemo(() => {
  return {
    running: windows.filter(w => w.status === WindowStatus.Running).length,
    waiting: windows.filter(w => w.status === WindowStatus.WaitingForInput).length,
    completed: windows.filter(w => w.status === WindowStatus.Completed).length,
    error: windows.filter(w => w.status === WindowStatus.Error).length,
  };
}, [windows]);
```

**响应式布局实现：**
```typescript
// 使用 Tailwind CSS 媒体查询
<div className="flex items-center space-x-3">
  {/* 标准模式（>= 640px）：文字标签 + 数字 */}
  <div className="hidden sm:flex items-center space-x-3">
    <span className="text-sm text-zinc-400">运行中</span>
    <span className="text-sm font-semibold text-blue-500">{statusCounts.running}</span>
    <span className="text-zinc-500">·</span>
    {/* 其他状态... */}
  </div>

  {/* 简化模式（< 640px）：图标 + 数字 */}
  <div className="flex sm:hidden items-center space-x-3">
    <div className="flex items-center space-x-1">
      <RunningIcon className="w-4 h-4 text-blue-500" aria-hidden="true" />
      <span className="text-sm font-semibold text-blue-500">{statusCounts.running}</span>
    </div>
    {/* 其他状态... */}
  </div>
</div>
```

**无障碍实现：**
```typescript
const ariaLabel = useMemo(() => {
  return `窗口状态统计：运行中 ${statusCounts.running} 个，等待输入 ${statusCounts.waiting} 个，已完成 ${statusCounts.completed} 个，出错 ${statusCounts.error} 个`;
}, [statusCounts]);

<div
  aria-live="polite"
  aria-label={ariaLabel}
  className="flex items-center space-x-3"
>
  {/* 状态项... */}
</div>
```

**图标选择：**
- 运行中：圆形脉冲图标（如 Lucide 的 `Circle` 或 `Activity`）
- 等待输入：暂停图标（如 Lucide 的 `Pause`）
- 已完成：勾选图标（如 Lucide 的 `Check` 或 `CheckCircle`）
- 出错：叉号图标（如 Lucide 的 `X` 或 `XCircle`）

**性能优化：**
- 使用 React.memo 包裹 StatusBar 组件
- 使用 useMemo 缓存状态计数和 aria-label
- 避免在渲染函数中直接计算，确保高性能

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要在每次渲染时重新计算状态计数 — 必须使用 useMemo 缓存
2. 不要忘记响应式布局 — < 640px 时必须切换为简化模式
3. 不要忘记无障碍属性 — aria-live, aria-label 是必需的
4. 不要使用过渡动画 — 数字更新必须直接切换，追求即时感
5. 不要硬编码状态色 — 复用 Story 3.1 的状态色映射系统
6. 不要忘记 React.memo — StatusBar 会频繁更新，必须优化性能
7. 不要忘记图标的 aria-hidden="true" — 避免屏幕阅读器重复播报
8. 不要在简化模式下省略状态色 — 图标和数字都必须使用对应状态色

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
└── renderer/
    ├── components/
    │   ├── StatusBar.tsx                      # 新建 - 状态统计栏组件
    │   ├── Toolbar.tsx                        # 修改 - 集成 StatusBar
    │   └── __tests__/
    │       └── StatusBar.test.tsx             # 新建 - StatusBar 测试
    └── utils/
        └── statusHelpers.ts                   # 复用 - 状态色/标签工具函数（Story 3.1）
```

**与统一项目结构的对齐：**
- 组件放在 `src/renderer/components/`
- 工具函数复用 `src/renderer/utils/statusHelpers.ts`（Story 3.1 已创建）
- 测试文件在对应模块的 `__tests__/` 目录

**依赖安装：**
- 图标库：如果项目未安装，需要安装 `lucide-react` 或类似图标库
- 如果 Story 3.1 已安装图标库，直接复用即可

### References

- [Source: epics.md#Story 3.3 - 状态统计栏验收标准]
- [Source: epics.md#Epic 3: 统一视图与窗口展示]
- [Source: architecture.md#数据模型设计 - Window, WindowStatus]
- [Source: architecture.md#前端框架 - React + TypeScript]
- [Source: architecture.md#状态管理 - Zustand]
- [Source: architecture.md#性能优化策略 - React.memo, useMemo]
- [Source: ux-design-specification.md#Component Strategy - StatusBar 组件规范]
- [Source: ux-design-specification.md#Visual Design Foundation - 颜色系统、字体系统、间距系统]
- [Source: ux-design-specification.md#Accessibility Strategy - 无障碍要求]
- [Source: ux-design-specification.md#Responsive Strategy - 响应式布局]
- [Source: 2-3-window-list-state-management.md - Zustand store windows 数组]
- [Source: 3-1-window-card-component.md - 状态色映射系统]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
