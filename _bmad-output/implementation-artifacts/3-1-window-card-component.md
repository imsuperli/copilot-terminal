# Story 3.1: 窗口卡片组件（WindowCard）

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 在卡片中查看每个窗口的关键信息和状态,
So that 可以快速识别窗口身份和当前状态。

## Acceptance Criteria

1. **Given** 窗口列表状态管理已实现（Epic 2）
   **When** 实现 WindowCard 组件
   **Then** 卡片顶部显示圆弧形彩色线条（4px，状态色）（FR10）

2. **Given** WindowCard 组件已实现
   **When** 渲染卡片内容
   **Then** 第一行显示窗口名称（左）和状态标签（右）（FR9）

3. **Given** WindowCard 组件已实现
   **When** 渲染卡片内容
   **Then** 第二行显示工作目录路径（等宽字体）（FR8）

4. **Given** WindowCard 组件已实现
   **When** 渲染卡片内容
   **Then** 第三行显示最新输出摘要

5. **Given** WindowCard 组件已实现
   **When** 渲染卡片内容
   **Then** 第四行显示使用模型（左）和最后活跃时间（右）

6. **Given** WindowCard 组件已实现
   **When** 渲染不同状态的窗口
   **Then** 状态色映射：蓝色=运行中，黄色=等待输入，绿色=已完成，红色=出错，灰色=恢复中

7. **Given** WindowCard 组件已实现
   **When** 鼠标悬停在卡片上
   **Then** 卡片支持 hover 状态（背景色微变）

8. **Given** WindowCard 组件已实现
   **When** 使用键盘导航
   **Then** 卡片支持键盘焦点状态（清晰的焦点环）

9. **Given** WindowCard 组件已实现
   **When** 渲染卡片
   **Then** 卡片最小宽度 280px，高度约 160px（方框比例）

10. **Given** WindowCard 组件已实现
    **When** 工作目录路径过长
    **Then** 路径截断，悬停显示完整路径（Tooltip）

## Tasks / Subtasks

- [x] Task 1: 创建 WindowCard 组件基础结构 (AC: 1-5, 9)
  - [x] 1.1 创建 `src/renderer/components/WindowCard.tsx`
  - [x] 1.2 定义 Props 接口：`WindowCardProps { window: Window, onClick?: () => void, onContextMenu?: () => void }`
  - [x] 1.3 实现卡片容器：使用 Tailwind CSS 设置最小宽度 280px，高度约 160px
  - [x] 1.4 实现圆弧形彩色顶部线条（4px 高度，圆角与卡片一致，状态色）
  - [x] 1.5 实现第一行：窗口名称（左对齐，加粗）+ 状态标签（右对齐，小号字体）
  - [x] 1.6 实现第二行：工作目录路径（等宽字体，灰色）
  - [x] 1.7 添加分割线（极细、低对比度）
  - [x] 1.8 实现第三行：最新输出摘要（灰色，截断）
  - [x] 1.9 实现第四行：使用模型（左）+ 最后活跃时间（右，小号字体）

- [x] Task 2: 实现状态色映射系统 (AC: 6)
  - [x] 2.1 在 `src/renderer/styles/theme.ts` 或 Tailwind config 中定义状态色变量
  - [x] 2.2 状态色定义：running=蓝色（#3B82F6），waiting=黄色/琥珀色（#F59E0B），completed=绿色（#10B981），error=红色（#EF4444），restoring=灰色（#6B7280）
  - [x] 2.3 创建 `getStatusColor(status: WindowStatus)` 工具函数，返回对应的 Tailwind 类名
  - [x] 2.4 创建 `getStatusLabel(status: WindowStatus)` 工具函数，返回中文状态标签
  - [x] 2.5 在 WindowCard 中应用状态色到顶部线条

- [x] Task 3: 实现交互状态（hover, focus, active） (AC: 7, 8)
  - [x] 3.1 添加 hover 状态：背景色从 `bg-zinc-800` 变为 `bg-zinc-750`（微变）
  - [x] 3.2 添加 active/pressed 状态：背景色再深一级 `bg-zinc-700`
  - [x] 3.3 添加 focus 状态：2px 实线焦点环，高对比度颜色（`ring-2 ring-blue-500`）
  - [x] 3.4 设置 `role="button"` 和 `tabIndex={0}`，使卡片可通过键盘导航
  - [x] 3.5 添加 `aria-label`，包含窗口名称、状态、工作目录信息
  - [x] 3.6 支持 Enter/Space 键激活（触发 onClick）

- [x] Task 4: 实现工作目录路径截断与 Tooltip (AC: 10)
  - [x] 4.1 使用 Radix UI Tooltip 组件包裹工作目录路径
  - [x] 4.2 路径文本使用 `truncate` 或 `line-clamp-1` 截断
  - [x] 4.3 Tooltip 内容显示完整路径
  - [x] 4.4 Tooltip 样式匹配深色主题（bg-zinc-900, text-zinc-100）
  - [x] 4.5 Tooltip 延迟 500ms 显示，避免误触

- [x] Task 5: 集成到 CardGrid 并测试 (AC: 1-10)
  - [x] 5.1 在 `src/renderer/components/CardGrid.tsx` 中导入 WindowCard
  - [x] 5.2 从 Zustand store 读取 windows 数组
  - [x] 5.3 使用 `windows.map()` 渲染 WindowCard 列表
  - [x] 5.4 传递 onClick 回调（切换到终端视图）
  - [x] 5.5 传递 onContextMenu 回调（打开右键菜单，Story 2.4 已实现）
  - [x] 5.6 测试不同状态的卡片渲染（running, waiting, completed, error, restoring）
  - [x] 5.7 测试 hover, focus, active 交互状态
  - [x] 5.8 测试路径截断和 Tooltip 显示

- [x] Task 6: 编写单元测试 (AC: 1-10)
  - [x] 6.1 创建 `src/renderer/components/__tests__/WindowCard.test.tsx`
  - [x] 6.2 测试卡片渲染：验证窗口名称、状态标签、工作目录、输出摘要、模型、时间显示
  - [x] 6.3 测试状态色映射：验证不同状态对应的顶部线条颜色
  - [x] 6.4 测试交互状态：验证 hover, focus, active 类名应用
  - [x] 6.5 测试键盘导航：验证 Enter/Space 键触发 onClick
  - [x] 6.6 测试无障碍：验证 role, aria-label, tabIndex 属性
  - [x] 6.7 测试 Tooltip：验证路径截断和完整路径显示

## Dev Notes

### 架构约束与技术要求

**组件设计原则（架构文档）：**
- WindowCard 是核心 UI 组件，所有用户旅程都依赖它
- 使用 React.memo 避免不必要的重渲染（性能优化）
- 使用 useMemo 缓存计算结果（如状态色、格式化时间）
- 使用 useCallback 稳定回调函数引用

**数据模型（架构文档）：**
```typescript
interface Window {
  id: string;                    // UUID
  name: string;                  // 窗口名称
  workingDirectory: string;      // 工作目录路径
  command: string;               // 启动命令
  status: WindowStatus;          // 当前状态
  pid: number | null;            // 进程 PID
  createdAt: string;             // 创建时间（ISO 8601）
  lastActiveAt: string;          // 最后活跃时间
  model?: string;                // 使用的 AI 模型
  lastOutput?: string;           // 最新输出摘要
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

**Radix UI 组件使用（架构文档）：**
- Tooltip: `@radix-ui/react-tooltip` — 用于工作目录路径悬停提示
- 已在 Story 1.3 中安装，直接使用

### UX 规范要点

**WindowCard 组件规范（UX 设计文档 Component Strategy）：**

**Anatomy（结构）：**
- 圆弧形彩色顶部线条（4px，状态色，圆角与卡片一致）
- 第一行：窗口名称（左）+ 状态标签（右）
- 第二行：工作目录路径（等宽字体）
- 分割线
- 第三行：最新输出摘要
- 第四行：使用模型（左）+ 最后活跃时间（右）

**States（状态）：**
| 状态 | 顶部线条色 | 状态标签 | 说明 |
|------|-----------|---------|------|
| 运行中 | 蓝色 | "运行中" | 进程正在执行 |
| 等待输入 | 黄色/琥珀色 | "等待输入" | 需要用户介入 |
| 已完成 | 绿色 | "已完成" | 进程正常结束 |
| 出错 | 红色 | "出错" | 进程异常退出 |
| 恢复中 | 灰色 | "恢复中" | 启动时进程恢复中 |

**交互状态：**
- Default：标准卡片样式
- Hover：背景色微变（`bg-zinc-800` → `bg-zinc-750`）
- Active/Pressed：背景色再深一级（`bg-zinc-700`）
- Focused：清晰的焦点环（`ring-2 ring-blue-500`）

**Actions：** 点击进入 CLI 窗口、右键打开操作菜单

**Accessibility：** `role="button"`，`aria-label` 包含窗口名称和状态，支持 Tab 键导航和 Enter/Space 激活

**视觉设计规范（UX 设计文档 Visual Design Foundation）：**

**颜色系统：**
- 应用背景：接近纯黑，带微暖色调（避免纯 #000000）
- 卡片背景：`bg-zinc-800`（比应用背景略浅）
- 悬停背景：`bg-zinc-750`（比卡片背景略浅）
- 主文字：低饱和度暖灰（`text-zinc-100`），非纯白
- 次要文字：更浅的灰色（`text-zinc-400`），用于工作目录、时间
- 边框/分割线：极细、低对比度（`border-zinc-700`）

**字体系统：**
- 窗口名称：中等字号（`text-base`），加粗（`font-semibold`）
- 状态标签：小字号（`text-xs`），正常字重
- 工作目录：标准字号（`text-sm`），等宽字体（`font-mono`）
- 输出摘要：小字号（`text-sm`），弱化色
- 模型/时间：小字号（`text-xs`），弱化色

**间距系统：**
- 卡片内边距：16px（`p-4`）
- 行间距：8px（`space-y-2`）
- 卡片圆角：8px（`rounded-lg`）
- 顶部线条圆角：与卡片圆角一致（`rounded-t-lg`）

**卡片尺寸：**
- 最小宽度：280px（`min-w-[280px]`）
- 高度：约 160px（`h-40`），方框比例
- 顶部线条高度：4px（`h-1`）

**无障碍要求（UX 设计文档 Accessibility Strategy）：**
- 状态色不仅依赖颜色，同时配合状态文字标签
- 文字与背景对比度 ≥ 4.5:1（WCAG AA）
- 焦点指示器对比度 ≥ 3:1
- 所有交互元素支持键盘导航
- `aria-label` 包含完整信息：`[窗口名称], 状态: [状态], 工作目录: [路径]`
- 尊重 `prefers-reduced-motion`（如有动画）

### 技术实现指导

**为什么使用 React.memo：**
- WindowCard 会被大量渲染（10-15+ 个）
- 避免父组件（CardGrid）更新时所有卡片重渲染
- 仅当 window 对象变化时才重渲染

**状态色实现方式：**
```typescript
// 方案 1: Tailwind 动态类名（推荐）
const statusColorMap = {
  running: 'bg-blue-500',
  waiting: 'bg-amber-500',
  completed: 'bg-green-500',
  error: 'bg-red-500',
  restoring: 'bg-gray-500'
};

// 方案 2: CSS 变量（如需更灵活的主题系统）
// 在 theme.ts 中定义 --color-running, --color-waiting 等
```

**时间格式化：**
- 使用 `date-fns` 或 `dayjs` 格式化 `lastActiveAt`
- 显示相对时间（如 "2 分钟前"）或绝对时间（如 "14:30"）
- 使用 `useMemo` 缓存格式化结果

**路径截断：**
- 使用 Tailwind 的 `truncate` 类（`overflow-hidden text-ellipsis whitespace-nowrap`）
- 或使用 `line-clamp-1`（单行截断）
- Tooltip 显示完整路径

**Radix UI Tooltip 使用：**
```typescript
import * as Tooltip from '@radix-ui/react-tooltip';

<Tooltip.Provider>
  <Tooltip.Root delayDuration={500}>
    <Tooltip.Trigger asChild>
      <span className="truncate">{workingDirectory}</span>
    </Tooltip.Trigger>
    <Tooltip.Content className="bg-zinc-900 text-zinc-100 px-2 py-1 rounded">
      {workingDirectory}
    </Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
```

**键盘导航实现：**
```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onClick?.();
  }
};

<div
  role="button"
  tabIndex={0}
  onKeyDown={handleKeyDown}
  onClick={onClick}
  aria-label={`${window.name}, 状态: ${getStatusLabel(window.status)}, 工作目录: ${window.workingDirectory}`}
>
  {/* 卡片内容 */}
</div>
```

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要使用纯白文字（#FFFFFF） — 必须使用低饱和度暖灰（`text-zinc-100`），符合 UX 规范
2. 不要使用纯黑背景（#000000） — 必须使用带暖色调的深色（`bg-zinc-900`）
3. 不要忘记 React.memo — WindowCard 会被大量渲染，必须优化性能
4. 不要忘记无障碍属性 — `role`, `aria-label`, `tabIndex` 是必需的
5. 不要在卡片内直接调用 IPC — 通过 props 传递回调函数，保持组件纯粹
6. 不要硬编码状态色 — 使用状态色映射系统，便于后续主题扩展
7. 不要忘记 Tooltip — 工作目录路径截断后必须提供完整路径查看方式
8. 不要使用过渡动画 — UX 明确要求"无过渡动画，追求即时响应感"

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
└── renderer/
    ├── components/
    │   ├── WindowCard.tsx                     # 新建 - 窗口卡片组件
    │   ├── CardGrid.tsx                       # 修改 - 集成 WindowCard
    │   └── __tests__/
    │       └── WindowCard.test.tsx            # 新建 - WindowCard 测试
    ├── styles/
    │   └── theme.ts                           # 修改（可选）- 状态色定义
    └── utils/
        └── statusHelpers.ts                   # 新建 - 状态色/标签工具函数
```

**与统一项目结构的对齐：**
- 组件放在 `src/renderer/components/`
- 工具函数放在 `src/renderer/utils/`
- 测试文件在对应模块的 `__tests__/` 目录
- 样式/主题配置在 `src/renderer/styles/`

**依赖安装：**
- `@radix-ui/react-tooltip`（如果 Story 1.3 未安装）
- `date-fns` 或 `dayjs`（时间格式化）
- 如果 Radix UI 已在 Story 1.3 中安装，直接使用即可

### References

- [Source: epics.md#Story 3.1 - 窗口卡片组件验收标准]
- [Source: epics.md#Epic 3: 统一视图与窗口展示]
- [Source: architecture.md#数据模型设计 - Window, WindowStatus]
- [Source: architecture.md#前端框架 - React + TypeScript]
- [Source: architecture.md#UI组件库 - Radix UI + Tailwind CSS]
- [Source: architecture.md#性能优化策略 - React.memo, useMemo]
- [Source: ux-design-specification.md#Component Strategy - WindowCard 组件规范]
- [Source: ux-design-specification.md#Visual Design Foundation - 颜色系统、字体系统、间距系统]
- [Source: ux-design-specification.md#Accessibility Strategy - 无障碍要求]
- [Source: ux-design-specification.md#Design Direction Decision - 方框形卡片设计]
- [Source: 2-3-window-list-state-management.md - Zustand store windows 数组]
- [Source: 2-4-close-and-delete-window.md - Radix UI 组件使用模式]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

无

### Completion Notes List

✅ **Task 1-4 完成** (2026-02-28)
- 创建了 WindowCard 组件，实现了所有 UI 元素：圆弧形状态线条、窗口名称、状态标签、工作目录、输出摘要、模型和时间
- 创建了状态辅助工具函数 (getStatusColor, getStatusLabel)
- 实现了所有交互状态：hover, focus, active
- 实现了键盘导航支持 (Enter/Space)
- 实现了工作目录路径截断和 Tooltip
- 使用 React.memo 优化性能
- 使用 useMemo 和 useCallback 缓存计算结果和回调函数
- 安装了 date-fns 用于时间格式化
- 扩展了 Tailwind 配置，添加了 zinc-750 颜色

✅ **Task 5 完成** (2026-02-28)
- 创建了 CardGrid 组件，集成 WindowCard
- 从 Zustand store 读取 windows 数组
- 实现了响应式网格布局
- 传递了 onClick 和 onContextMenu 回调
- 更新了 App.tsx，根据窗口数量显示 CardGrid 或 EmptyState

✅ **Task 6 完成** (2026-02-28)
- 创建了 WindowCard 单元测试 (19 个测试用例)
- 创建了 CardGrid 集成测试 (4 个测试用例)
- 所有测试通过
- 测试覆盖：渲染、状态色、交互状态、键盘导航、无障碍、Tooltip

### File List

新建文件：
- src/renderer/components/WindowCard.tsx
- src/renderer/components/CardGrid.tsx
- src/renderer/utils/statusHelpers.ts
- src/renderer/components/__tests__/WindowCard.test.tsx
- src/renderer/components/__tests__/CardGrid.test.tsx

修改文件：
- src/renderer/App.tsx
- tailwind.config.js
- package.json (添加 date-fns 依赖)
- package-lock.json
