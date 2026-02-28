# Story 3.2: 响应式卡片网格布局（CardGrid）

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 在网格中查看所有窗口卡片,
So that 可以一屏看到尽可能多的窗口状态。

## Acceptance Criteria

1. **Given** WindowCard 组件已实现（Story 3.1）
   **When** 实现 CardGrid 布局容器
   **Then** 使用 CSS Grid 响应式布局：`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`（FR2）

2. **Given** CardGrid 布局已实现
   **When** 渲染卡片网格
   **Then** 卡片间距 12px

3. **Given** CardGrid 布局已实现
   **When** 窗口宽度 < 640px
   **Then** 显示 1 列

4. **Given** CardGrid 布局已实现
   **When** 窗口宽度 640px-1024px
   **Then** 显示 2 列

5. **Given** CardGrid 布局已实现
   **When** 窗口宽度 1024px-1440px
   **Then** 显示 3 列

6. **Given** CardGrid 布局已实现
   **When** 窗口宽度 > 1440px
   **Then** 显示 4+ 列

7. **Given** CardGrid 布局已实现
   **When** 窗口数量 15+ 个
   **Then** 支持滚动，使用自定义滚动条样式

8. **Given** CardGrid 布局已实现
   **When** 渲染卡片列表
   **Then** 卡片按创建时间或最后活跃时间排序

## Tasks / Subtasks

- [ ] Task 1: 创建 CardGrid 组件基础结构 (AC: 1, 2)
  - [ ] 1.1 创建 `src/renderer/components/CardGrid.tsx`
  - [ ] 1.2 使用 CSS Grid 布局：`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
  - [ ] 1.3 设置卡片间距：`gap-3`（12px）
  - [ ] 1.4 设置容器内边距：`p-6`（24px）
  - [ ] 1.5 从 Zustand store 读取 windows 数组：`useWindowStore(state => state.windows)`

- [ ] Task 2: 实现响应式列数自适应 (AC: 3-6)
  - [ ] 2.1 验证 CSS Grid 的 `auto-fill` + `minmax(280px, 1fr)` 自动处理列数
  - [ ] 2.2 测试窗口宽度 < 640px 时显示 1 列
  - [ ] 2.3 测试窗口宽度 640px-1024px 时显示 2 列
  - [ ] 2.4 测试窗口宽度 1024px-1440px 时显示 3 列
  - [ ] 2.5 测试窗口宽度 > 1440px 时显示 4+ 列
  - [ ] 2.6 无需手动断点切换，Grid 自动处理

- [ ] Task 3: 实现滚动与自定义滚动条 (AC: 7)
  - [ ] 3.1 设置容器高度：`h-full overflow-y-auto`
  - [ ] 3.2 使用 Radix UI ScrollArea 组件（可选，提供更好的跨平台滚动体验）
  - [ ] 3.3 或使用 Tailwind 自定义滚动条样式：`scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900`
  - [ ] 3.4 测试 15+ 窗口时滚动流畅性

- [ ] Task 4: 实现卡片排序逻辑 (AC: 8)
  - [ ] 4.1 创建排序工具函数：`sortWindows(windows: Window[], sortBy: 'createdAt' | 'lastActiveAt')`
  - [ ] 4.2 默认按 `lastActiveAt` 降序排序（最近活跃的在前）
  - [ ] 4.3 使用 `useMemo` 缓存排序结果，避免每次渲染都排序
  - [ ] 4.4 （可选）支持用户切换排序方式（Post-MVP 功能）

- [ ] Task 5: 集成 WindowCard 并渲染 (AC: 1-8)
  - [ ] 5.1 导入 WindowCard 组件
  - [ ] 5.2 使用 `windows.map()` 渲染 WindowCard 列表
  - [ ] 5.3 传递 `key={window.id}`
  - [ ] 5.4 传递 `window={window}` props
  - [ ] 5.5 传递 `onClick` 回调：切换到终端视图（调用 ViewSwitcher 或更新 Zustand store 的 activeWindowId）
  - [ ] 5.6 传递 `onContextMenu` 回调：打开右键菜单（Story 2.4 已实现）
  - [ ] 5.7 测试不同数量的窗口渲染（1 个、5 个、10 个、15+ 个）

- [ ] Task 6: 处理空状态 (AC: 1-8)
  - [ ] 6.1 检查 `windows.length === 0`
  - [ ] 6.2 如果为空，渲染空状态组件（Story 3.4 将实现）
  - [ ] 6.3 如果不为空，渲染 CardGrid

- [ ] Task 7: 编写单元测试 (AC: 1-8)
  - [ ] 7.1 创建 `src/renderer/components/__tests__/CardGrid.test.tsx`
  - [ ] 7.2 测试 Grid 布局：验证 `grid-template-columns` 样式
  - [ ] 7.3 测试卡片间距：验证 `gap` 样式
  - [ ] 7.4 测试卡片渲染：验证 windows 数组中的每个窗口都渲染了 WindowCard
  - [ ] 7.5 测试排序：验证卡片按 lastActiveAt 降序排列
  - [ ] 7.6 测试空状态：验证 windows 为空时不渲染 CardGrid
  - [ ] 7.7 测试滚动：验证 15+ 窗口时容器可滚动

## Dev Notes

### 架构约束与技术要求

**响应式布局策略（架构文档）：**
- 使用 CSS Grid 的 `auto-fill` + `minmax(280px, 1fr)` 实现自动列数调整
- 卡片最小宽度 280px，确保内容可读性
- 卡片最大宽度不限，随容器拉伸
- 无需手动断点切换，Grid 自动处理

**性能优化（架构文档）：**
- 使用 `useMemo` 缓存排序结果
- 15+ 窗口时考虑使用虚拟滚动（react-window），但 MVP 阶段可先不实现
- WindowCard 已使用 React.memo，避免不必要的重渲染

**Zustand Store 依赖（Story 2.3）：**
- Store 路径: `src/renderer/stores/windowStore.ts`
- `windows: Window[]` 数组存储所有窗口
- 使用 selector 精确订阅：`useWindowStore(state => state.windows)`

### UX 规范要点

**CardGrid 组件规范（UX 设计文档 Component Strategy）：**

**Purpose：** 响应式网格布局容器，自动调整每行卡片数量

**Implementation：** `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`，卡片间距 12px

**States：**
- 空状态（无窗口时显示引导）— Story 3.4 实现
- 正常状态（1-14 个窗口）
- 滚动状态（15+ 窗口）

**响应式策略（UX 设计文档 Responsive Design & Accessibility）：**

| 窗口宽度 | 卡片列数 | 说明 |
|---------|---------|------|
| < 640px | 1 列 | 窄窗口/分屏 |
| 640px - 1024px | 2 列 | 标准窗口 |
| 1024px - 1440px | 3 列 | 宽窗口 |
| > 1440px | 4+ 列 | 超宽/大屏 |

**自适应机制：**
- 使用 CSS Grid 的 `auto-fill` + `minmax(280px, 1fr)` 实现自动列数调整
- 卡片最小宽度 280px，确保内容可读性
- 卡片最大宽度不限，随容器拉伸
- 无需手动断点切换，Grid 自动处理

**滚动条样式（UX 设计文档 Visual Design Foundation）：**
- 使用自定义滚动条样式，匹配深色主题
- 滚动条轨道：`bg-zinc-900`
- 滚动条滑块：`bg-zinc-700`
- 滚动条宽度：细（`scrollbar-thin`）

**间距系统（UX 设计文档 Visual Design Foundation）：**
- 卡片间距：12px（`gap-3`）
- 容器内边距：24px（`p-6`）

### 技术实现指导

**CSS Grid 自动列数实现：**
```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  padding: 24px;
}
```

**Tailwind CSS 实现：**
```tsx
<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-6 h-full overflow-y-auto">
  {sortedWindows.map(window => (
    <WindowCard key={window.id} window={window} onClick={...} />
  ))}
</div>
```

**排序逻辑：**
```typescript
const sortedWindows = useMemo(() => {
  return [...windows].sort((a, b) => {
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });
}, [windows]);
```

**Radix UI ScrollArea 使用（可选）：**
```typescript
import * as ScrollArea from '@radix-ui/react-scroll-area';

<ScrollArea.Root className="h-full">
  <ScrollArea.Viewport className="h-full">
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-6">
      {/* WindowCard 列表 */}
    </div>
  </ScrollArea.Viewport>
  <ScrollArea.Scrollbar orientation="vertical">
    <ScrollArea.Thumb />
  </ScrollArea.Scrollbar>
</ScrollArea.Root>
```

**虚拟滚动（Post-MVP）：**
- 15+ 窗口时性能足够，MVP 阶段无需虚拟滚动
- 如需实现，使用 `react-window` 或 `react-virtual`
- 虚拟滚动与 CSS Grid 结合较复杂，建议 Post-MVP 再考虑

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要手动写媒体查询断点 — CSS Grid 的 `auto-fill` + `minmax` 自动处理列数
2. 不要忘记 `useMemo` 缓存排序结果 — 避免每次渲染都排序
3. 不要在 CardGrid 中直接调用 IPC — 通过 props 传递回调函数
4. 不要忘记 `key={window.id}` — React 列表渲染必需
5. 不要使用固定高度 — 使用 `h-full` 让容器占满可用空间
6. 不要忘记处理空状态 — windows 为空时应显示引导界面（Story 3.4）
7. 不要过早优化虚拟滚动 — MVP 阶段 15 个窗口性能足够

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
└── renderer/
    ├── components/
    │   ├── CardGrid.tsx                       # 新建 - 卡片网格布局
    │   └── __tests__/
    │       └── CardGrid.test.tsx              # 新建 - CardGrid 测试
    └── utils/
        └── sortHelpers.ts                     # 新建（可选）- 排序工具函数
```

**与统一项目结构的对齐：**
- 组件放在 `src/renderer/components/`
- 工具函数放在 `src/renderer/utils/`
- 测试文件在对应模块的 `__tests__/` 目录

**依赖安装：**
- `@radix-ui/react-scroll-area`（可选，如需更好的滚动体验）
- 如果使用 Tailwind 自定义滚动条，需要安装 `tailwind-scrollbar` 插件（可选）

### References

- [Source: epics.md#Story 3.2 - 响应式卡片网格布局验收标准]
- [Source: epics.md#Epic 3: 统一视图与窗口展示]
- [Source: architecture.md#前端性能优化 - useMemo, React.memo]
- [Source: architecture.md#UI组件库 - Radix UI ScrollArea]
- [Source: ux-design-specification.md#Component Strategy - CardGrid 组件规范]
- [Source: ux-design-specification.md#Responsive Design & Accessibility - 响应式策略]
- [Source: ux-design-specification.md#Visual Design Foundation - 间距系统]
- [Source: ux-design-specification.md#Design Direction Decision - 网格卡片布局]
- [Source: 3-1-window-card-component.md - WindowCard 组件使用]
- [Source: 2-3-window-list-state-management.md - Zustand store windows 数组]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
