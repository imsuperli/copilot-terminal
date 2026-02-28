# Story 3.4: 空状态与新建窗口入口

Status: ready-for-dev

## Story

As a 用户,
I want 在没有窗口时看到引导提示，并有明确的新建入口,
So that 可以快速开始创建第一个任务窗口。

## Acceptance Criteria

1. **Given** 卡片网格和状态统计栏已实现（Story 3.2, 3.3）
   **When** 窗口列表为空
   **Then** 主内容区居中显示："创建你的第一个任务窗口"

2. **Given** 空状态界面已实现
   **When** 用户看到空状态
   **Then** 下方显示大号"+ 新建窗口"按钮

3. **Given** 空状态界面已实现
   **When** 用户点击"+ 新建窗口"按钮
   **Then** 打开新建窗口对话框（复用 Story 2.2）

4. **Given** 窗口列表不为空
   **When** 渲染卡片网格
   **Then** 工具栏显示"+ 新建窗口"按钮（Primary 样式）

5. **Given** 窗口列表不为空
   **When** 渲染卡片网格
   **Then** 卡片网格末尾显示虚线"+ 新建窗口"占位卡片（与普通卡片同高）

6. **Given** 新建窗口占位卡片已实现
   **When** 用户点击占位卡片
   **Then** 打开新建窗口对话框

7. **Given** 新建窗口占位卡片已实现
   **When** 鼠标悬停在占位卡片上
   **Then** 虚线高亮 + 背景微变

## Tasks / Subtasks

- [ ] Task 1: 创建空状态组件 (AC: 1-3)
  - [ ] 1.1 创建 `src/renderer/components/EmptyState.tsx`
  - [ ] 1.2 定义 Props 接口：`EmptyStateProps { onCreateWindow: () => void }`
  - [ ] 1.3 实现容器：使用 Flexbox 居中，占满主内容区
  - [ ] 1.4 实现文案：居中显示"创建你的第一个任务窗口"
  - [ ] 1.5 实现大号"+ 新建窗口"按钮（Primary 样式）
  - [ ] 1.6 按钮点击时调用 onCreateWindow 回调

- [ ] Task 2: 创建新建窗口占位卡片组件 (AC: 5-7)
  - [ ] 2.1 创建 `src/renderer/components/NewWindowCard.tsx`
  - [ ] 2.2 定义 Props 接口：`NewWindowCardProps { onClick: () => void }`
  - [ ] 2.3 实现虚线边框卡片（与 WindowCard 同高 160px）
  - [ ] 2.4 实现居中"+"图标（大号）
  - [ ] 2.5 实现"新建窗口"文字（小号）
  - [ ] 2.6 实现 hover 状态：虚线高亮 + 背景微变
  - [ ] 2.7 实现 focus 状态：清晰的焦点环
  - [ ] 2.8 添加 `role="button"`, `tabIndex={0}`, `aria-label="新建窗口"`

- [ ] Task 3: 集成到 CardGrid (AC: 1-7)
  - [ ] 3.1 修改 `src/renderer/components/CardGrid.tsx`
  - [ ] 3.2 添加条件渲染：windows.length === 0 时显示 EmptyState
  - [ ] 3.3 添加条件渲染：windows.length > 0 时显示卡片网格 + NewWindowCard
  - [ ] 3.4 NewWindowCard 放在网格末尾（使用 CSS Grid 自动排列）
  - [ ] 3.5 传递 onClick 回调到 EmptyState 和 NewWindowCard

- [ ] Task 4: 集成到工具栏 (AC: 4)
  - [ ] 4.1 修改 `src/renderer/components/Toolbar.tsx`
  - [ ] 4.2 添加"+ 新建窗口"按钮（Primary 样式）
  - [ ] 4.3 按钮仅在 windows.length > 0 时显示
  - [ ] 4.4 按钮点击时打开新建窗口对话框

- [ ] Task 5: 实现新建窗口对话框触发 (AC: 3, 6)
  - [ ] 5.1 创建 `src/renderer/hooks/useCreateWindowDialog.ts`（可选）
  - [ ] 5.2 管理对话框的打开/关闭状态
  - [ ] 5.3 从 EmptyState、NewWindowCard、Toolbar 按钮触发对话框打开
  - [ ] 5.4 对话框关闭后，如果创建成功，自动关闭对话框

- [ ] Task 6: 编写单元测试 (AC: 1-7)
  - [ ] 6.1 创建 `src/renderer/components/__tests__/EmptyState.test.tsx`
  - [ ] 6.2 测试空状态渲染：验证文案和按钮显示
  - [ ] 6.3 测试按钮点击：验证 onCreateWindow 回调被调用
  - [ ] 6.4 创建 `src/renderer/components/__tests__/NewWindowCard.test.tsx`
  - [ ] 6.5 测试占位卡片渲染：验证虚线边框、图标、文字
  - [ ] 6.6 测试 hover 和 focus 状态
  - [ ] 6.7 测试按钮点击：验证 onClick 回调被调用
  - [ ] 6.8 创建 `src/renderer/components/__tests__/CardGrid.test.tsx`
  - [ ] 6.9 测试条件渲染：windows 为空时显示 EmptyState，不为空时显示卡片网格 + NewWindowCard

## Dev Notes

### 架构约束与技术要求

**组件设计原则（架构文档）：**
- EmptyState 和 NewWindowCard 是可选的增强组件，不影响核心功能
- 使用 React.memo 避免不必要的重渲染
- 对话框状态应在父组件（App 或 MainLayout）管理，通过 props 传递

**数据模型（架构文档）：**
```typescript
interface Window {
  id: string;
  name: string;
  workingDirectory: string;
  command: string;
  status: WindowStatus;
  pid: number | null;
  createdAt: string;
  lastActiveAt: string;
  model?: string;
  lastOutput?: string;
}
```

**Zustand Store 依赖（Story 2.3）：**
- Store 路径: `src/renderer/stores/windowStore.ts`
- `windows: Window[]` 数组存储所有窗口
- 组件通过 `useWindowStore(state => state.windows)` 订阅

### UX 规范要点

**空状态设计（UX 设计文档 Empty States & Loading States）：**

**空状态（首次启动/无窗口）：**
- 居中显示引导文案："创建你的第一个任务窗口"
- 下方一个大号"+ 新建窗口"按钮
- 简洁、不花哨，不使用插图或吉祥物
- 背景保持应用标准深色，不做特殊处理

**新建窗口占位卡片（NewWindowCard）：**
- 虚线边框 + 居中"+"图标 + "新建窗口"文字
- Default 状态：虚线灰色
- Hover 状态：虚线高亮 + 背景微变
- 与普通卡片同高（160px），融入网格

**视觉设计规范（UX 设计文档 Visual Design Foundation）：**

**颜色系统：**
- 背景：应用标准深色（`bg-zinc-900`）
- 文字：低饱和度暖灰（`text-zinc-100`）
- 虚线边框：灰色（`border-zinc-600`）
- 虚线高亮（hover）：更亮的灰色（`border-zinc-400`）

**字体系统：**
- 引导文案：中等字号（`text-lg`），正常字重
- 按钮文字：标准字号（`text-base`），加粗（`font-semibold`）
- "+"图标：大号（`text-3xl` 或 `text-4xl`）

**间距系统：**
- 空状态容器内边距：充足留白
- 文案与按钮间距：24px（`space-y-6`）
- 占位卡片与其他卡片间距：12px（与 CardGrid 一致）

**无障碍要求（UX 设计文档 Accessibility Strategy）：**
- 空状态文案清晰，不依赖图标
- 按钮有清晰的焦点环
- 支持键盘导航（Tab 键）
- 支持 Enter/Space 键激活按钮
- aria-label 描述按钮功能

### 技术实现指导

**空状态组件实现：**
```typescript
export const EmptyState: React.FC<EmptyStateProps> = ({ onCreateWindow }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full space-y-6">
      <p className="text-lg text-zinc-100">创建你的第一个任务窗口</p>
      <button
        onClick={onCreateWindow}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
      >
        + 新建窗口
      </button>
    </div>
  );
};
```

**新建窗口占位卡片实现：**
```typescript
export const NewWindowCard: React.FC<NewWindowCardProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-zinc-600 rounded-lg hover:border-zinc-400 hover:bg-zinc-800 focus:ring-2 focus:ring-blue-500"
      role="button"
      tabIndex={0}
      aria-label="新建窗口"
    >
      <span className="text-4xl text-zinc-400 mb-2">+</span>
      <span className="text-sm text-zinc-400">新建窗口</span>
    </button>
  );
};
```

**CardGrid 条件渲染：**
```typescript
export const CardGrid: React.FC = () => {
  const windows = useWindowStore(state => state.windows);

  if (windows.length === 0) {
    return <EmptyState onCreateWindow={handleCreateWindow} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {windows.map(window => (
        <WindowCard key={window.id} window={window} />
      ))}
      <NewWindowCard onClick={handleCreateWindow} />
    </div>
  );
};
```

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要在空状态显示复杂的插图或吉祥物 — UX 明确要求"简洁、不花哨"
2. 不要忘记 NewWindowCard 的虚线边框 — 必须使用 `border-dashed`
3. 不要忘记 NewWindowCard 的 hover 状态 — 虚线高亮 + 背景微变
4. 不要硬编码对话框打开逻辑 — 应通过 props 回调传递
5. 不要忘记无障碍属性 — `role`, `aria-label`, `tabIndex` 是必需的
6. 不要让 NewWindowCard 高度与 WindowCard 不一致 — 必须都是 160px
7. 不要在空状态使用过渡动画 — 追求即时响应感
8. 不要忘记测试条件渲染 — 必须测试 windows 为空和不为空两种情况

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
└── renderer/
    ├── components/
    │   ├── EmptyState.tsx                      # 新建 - 空状态组件
    │   ├── NewWindowCard.tsx                   # 新建 - 新建窗口占位卡片
    │   ├── CardGrid.tsx                        # 修改 - 集成 EmptyState 和 NewWindowCard
    │   ├── Toolbar.tsx                         # 修改 - 添加"+ 新建窗口"按钮
    │   └── __tests__/
    │       ├── EmptyState.test.tsx             # 新建 - EmptyState 测试
    │       ├── NewWindowCard.test.tsx          # 新建 - NewWindowCard 测试
    │       └── CardGrid.test.tsx               # 修改 - CardGrid 测试
    └── hooks/
        └── useCreateWindowDialog.ts            # 新建（可选）- 对话框状态管理
```

**与统一项目结构的对齐：**
- 组件放在 `src/renderer/components/`
- 自定义 hooks 放在 `src/renderer/hooks/`
- 测试文件在对应模块的 `__tests__/` 目录

### References

- [Source: epics.md#Story 3.4 - 空状态与新建窗口入口验收标准]
- [Source: epics.md#Epic 3: 统一视图与窗口展示]
- [Source: architecture.md#数据模型设计 - Window]
- [Source: architecture.md#前端框架 - React + TypeScript]
- [Source: ux-design-specification.md#Component Strategy - NewWindowCard 组件规范]
- [Source: ux-design-specification.md#Empty States & Loading States - 空状态设计]
- [Source: ux-design-specification.md#Visual Design Foundation - 颜色系统、字体系统]
- [Source: ux-design-specification.md#Accessibility Strategy - 无障碍要求]
- [Source: 3-1-window-card-component.md - WindowCard 组件]
- [Source: 3-2-responsive-card-grid-layout.md - CardGrid 布局]
- [Source: 3-3-status-bar.md - StatusBar 组件]
- [Source: 2-2-create-new-task-window.md - 新建窗口对话框]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
