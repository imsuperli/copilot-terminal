# Story 2.4: 关闭和删除窗口

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 关闭或删除不再需要的任务窗口,
So that 可以清理工作区并释放系统资源。

## Acceptance Criteria

1. **Given** 窗口列表状态管理已实现（Story 2.3）
   **When** 右键点击窗口卡片或点击操作按钮
   **Then** 显示操作菜单，包含"关闭窗口"和"删除窗口"选项（FR3）

2. **Given** 操作菜单已显示
   **When** 选择"关闭窗口"
   **Then** 显示确认对话框："确定关闭？终端进程将被终止"

3. **Given** 操作菜单已显示
   **When** 选择"删除窗口"
   **Then** 显示确认对话框："确定删除？窗口配置将被移除"

4. **Given** 用户在确认对话框中点击"确认"
   **When** 操作为关闭或删除
   **Then** 系统终止对应的终端进程（FR16）

5. **Given** 关闭/删除操作确认后
   **When** 进程终止完成
   **Then** 窗口从 Zustand store 中移除

6. **Given** 窗口从 store 中移除后
   **When** UI 更新
   **Then** 窗口卡片从界面中消失，其他卡片自动重排

7. **Given** 确认对话框已打开
   **When** 使用键盘操作
   **Then** 支持 Esc 键取消，Enter 键确认

8. **Given** 确认对话框已打开
   **When** 对话框渲染完成
   **Then** 焦点在"取消"按钮上，防止误操作

## Tasks / Subtasks

- [ ] Task 1: 扩展 Preload API 暴露关闭/删除窗口接口 (AC: 4, 5)
  - [ ] 1.1 在 `src/preload/index.ts` 中添加 `closeWindow(windowId)` IPC 调用，映射到 `close-window` channel
  - [ ] 1.2 在 `src/preload/index.ts` 中添加 `deleteWindow(windowId)` IPC 调用，映射到 `delete-window` channel
  - [ ] 1.3 更新 `src/renderer/global.d.ts` 中 `ElectronAPI` 接口，添加 `closeWindow` 和 `deleteWindow` 方法签名

- [ ] Task 2: 实现主进程 IPC Handler — 关闭窗口和删除窗口 (AC: 4)
  - [ ] 2.1 在 `src/main/index.ts` 注册 `close-window` IPC handler
  - [ ] 2.2 handler 接收 `{ windowId: string }` 参数
  - [ ] 2.3 调用 ProcessManager.killProcess 终止对应 PTY 进程（FR16）
  - [ ] 2.4 关闭窗口：终止进程，通过 `window-closed` 事件通知渲染进程
  - [ ] 2.5 在 `src/main/index.ts` 注册 `delete-window` IPC handler
  - [ ] 2.6 删除窗口：终止进程 + 移除窗口配置记录
  - [ ] 2.7 错误处理：进程不存在或已退出时优雅处理，不抛异常

- [ ] Task 3: 实现右键上下文菜单组件 (AC: 1)
  - [ ] 3.1 创建 `src/renderer/components/WindowContextMenu.tsx`
  - [ ] 3.2 使用 Radix UI ContextMenu 组件作为基础
  - [ ] 3.3 菜单项包含："关闭窗口"和"删除窗口"两个选项
  - [ ] 3.4 菜单项使用 Tailwind CSS 样式，匹配深色主题
  - [ ] 3.5 将 ContextMenu 包裹在 WindowCard 组件外层（或集成到 WindowCard 中）
  - [ ] 3.6 菜单项支持键盘导航（上下箭头、Enter 选择、Esc 关闭）

- [ ] Task 4: 实现确认对话框组件 (AC: 2, 3, 7, 8)
  - [ ] 4.1 创建 `src/renderer/components/ConfirmDialog.tsx` 通用确认对话框
  - [ ] 4.2 使用 Radix UI AlertDialog 组件（专为破坏性操作设计，自带焦点管理）
  - [ ] 4.3 Props: `open`, `onConfirm`, `onCancel`, `title`, `description`, `confirmLabel`
  - [ ] 4.4 标题：明确说明操作（"关闭窗口" / "删除窗口"）
  - [ ] 4.5 正文：说明后果（"终端进程将被终止" / "窗口配置将被移除"）
  - [ ] 4.6 按钮布局：左侧"取消"（Secondary 样式），右侧"确认"（红色 Primary 样式）
  - [ ] 4.7 对话框打开时焦点自动定位到"取消"按钮（AlertDialog 默认行为，通过 `asChild` 在 Cancel 上设置）
  - [ ] 4.8 Esc 键 = 取消，Enter 键 = 确认
  - [ ] 4.9 半透明深色遮罩层，点击遮罩 = 取消
  - [ ] 4.10 对话框居中显示，宽度不超过 480px
  - [ ] 4.11 对话框关闭时恢复焦点到触发元素

- [ ] Task 5: 集成关闭/删除流程到 WindowCard (AC: 1-8)
  - [ ] 5.1 在 WindowCard 中集成 WindowContextMenu（右键触发）
  - [ ] 5.2 右键菜单选择操作后，设置 state 打开对应的 ConfirmDialog
  - [ ] 5.3 用户确认后：调用 `window.electronAPI.closeWindow(id)` 或 `window.electronAPI.deleteWindow(id)`
  - [ ] 5.4 IPC 调用成功后：调用 Zustand store 的 `removeWindow(id)` 从前端状态中移除
  - [ ] 5.5 卡片移除后，CSS Grid 自动重排剩余卡片（AC: 6）
  - [ ] 5.6 处理 IPC 调用失败的错误情况（显示错误提示或 console.error）

- [ ] Task 6: 编写单元测试 (AC: 1-8)
  - [ ] 6.1 创建 `src/renderer/components/__tests__/ConfirmDialog.test.tsx`
  - [ ] 6.2 测试对话框打开/关闭行为
  - [ ] 6.3 测试确认按钮触发 onConfirm 回调
  - [ ] 6.4 测试取消按钮触发 onCancel 回调
  - [ ] 6.5 测试 Esc 键关闭对话框
  - [ ] 6.6 创建 `src/renderer/components/__tests__/WindowContextMenu.test.tsx`
  - [ ] 6.7 测试右键菜单显示两个选项
  - [ ] 6.8 测试菜单项点击触发对应回调

## Dev Notes

### 架构约束与技术要求

**IPC 通道定义（架构文档）：**
- `close-window`: 关闭窗口 — 终止进程但保留配置（下次可恢复）
- `delete-window`: 删除窗口 — 终止进程 + 移除配置
- `window-closed`: 主进程 → 渲染进程事件，通知窗口已关闭
- 两个操作的区别：close 保留配置用于 Story 6.x 工作区恢复，delete 彻底移除

**IPC 调用签名（架构文档）：**
```typescript
// 渲染进程 → 主进程
ipcRenderer.invoke('close-window', { windowId: string }): Promise<void>
ipcRenderer.invoke('delete-window', { windowId: string }): Promise<void>

// 主进程 → 渲染进程（事件）
ipcRenderer.on('window-closed', (event, data: { windowId: string }) => {})
```

**前端 API 封装模式（架构文档）：**
```typescript
// src/api/windows.ts
windowsApi.close(windowId) → ipcRenderer.invoke('close-window', { windowId })
windowsApi.delete(windowId) → ipcRenderer.invoke('delete-window', { windowId })
```

**ProcessManager 依赖（Story 2.1）：**
- `killProcess(pid)` 方法终止指定进程
- 进程退出时触发 `process-exited` 事件
- 单个进程异常不影响其他进程（NFR7）
- 进程不存在时需优雅处理

**Zustand Store 依赖（Story 2.3）：**
- `removeWindow(id)` 方法从 windows 数组中删除指定窗口
- 前端组件订阅 store 变化自动重渲染
- Store 路径: `src/renderer/stores/windowStore.ts`

### UX 规范要点

**用户旅程 4（UX 设计文档）：**
- 入口：右键点击卡片 或 卡片悬停时显示的操作图标
- 流程：操作菜单 → 确认对话框 → 执行 → 卡片消失 + 状态栏更新
- 卡片移除时有微妙的退出动画（淡出），其他卡片自动重排

**确认对话框规范（UX 设计文档 Modal & Confirmation Patterns）：**
- 标题：明确说明操作（"关闭窗口" / "删除窗口"）
- 正文：说明后果（"终端进程将被终止" / "窗口配置将被移除"）
- 按钮：左侧"取消"（Secondary），右侧"确认"（红色 Primary）
- 焦点在"取消"按钮上（防止误操作）— 这是关键 UX 决策
- Esc = 取消，Enter = 确认
- 半透明深色遮罩层，点击遮罩 = 取消
- 对话框居中，宽度 ≤ 480px
- 同一时间最多一个模态对话框

**组件策略（UX 设计文档 Component Strategy）：**
- Dialog: Radix UI — 用于确认关闭/删除
- ContextMenu: Radix UI — 用于窗口卡片的操作菜单
- Button: Radix UI — 用于对话框确认/取消

**按钮层级（UX 设计文档 Button Hierarchy）：**
- Primary: 实心填充，红色（破坏性操作的确认按钮）
- Secondary: 边框描边，透明背景（取消按钮）

**无障碍要求（UX 设计文档）：**
- 对话框: `role="dialog"`, `aria-labelledby` 指向标题
- 对话框打开时捕获焦点，关闭时恢复焦点到触发元素
- 所有图标按钮必须有 `aria-label`
- 颜色不作为唯一信息传达手段
- 尊重 `prefers-reduced-motion`（卡片退出动画）

### 技术实现指导

**为什么用 Radix UI AlertDialog 而不是 Dialog：**
- AlertDialog 专为破坏性/确认操作设计
- 自动阻止点击遮罩关闭（需要明确选择确认或取消）
- 内置焦点管理，默认焦点到 Cancel 按钮
- 如果需要点击遮罩关闭，可改用 Dialog，但需手动管理焦点

**ContextMenu 实现注意事项：**
- Radix UI ContextMenu 需要包裹触发元素（WindowCard）
- `ContextMenu.Trigger` 包裹卡片，`ContextMenu.Content` 定义菜单内容
- 菜单项使用 `ContextMenu.Item`，支持 `onSelect` 回调
- 样式使用 Tailwind CSS 匹配深色主题（bg-zinc-800, text-zinc-100 等）

**关闭 vs 删除的实现差异：**
- 关闭（close）：主进程调用 `killProcess` → 进程终止 → 渲染进程调用 `removeWindow` 从 UI 移除。配置保留在内存/持久化中供 Story 6.x 恢复使用
- 删除（delete）：主进程调用 `killProcess` → 进程终止 → 清除配置记录 → 渲染进程调用 `removeWindow`
- 当前阶段（Story 6.x 未实现），两者行为基本一致，但 IPC channel 需分开注册，为后续工作区持久化做准备

**卡片退出动画（可选增强）：**
- 使用 CSS transition 或 Tailwind 的 `animate-` 类实现淡出
- 尊重 `prefers-reduced-motion` 媒体查询
- CSS Grid 的 `auto-fill` 会自动重排剩余卡片

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要自己实现 Dialog/ContextMenu — 必须使用 Radix UI 组件，它们提供完整的无障碍支持和焦点管理
2. 不要在确认对话框中把焦点放在"确认"按钮上 — UX 明确要求焦点在"取消"按钮，防止误操作
3. 不要忘记区分 close 和 delete 两个 IPC channel — 虽然当前行为类似，但必须分开实现
4. 不要在渲染进程直接调用 Node.js API — 必须通过 preload 暴露的 API 调用
5. 不要忘记错误处理 — 进程可能已经退出，killProcess 需要优雅处理
6. 不要创建新的 store — 复用 Story 2.3 的 windowStore，使用已有的 `removeWindow` 方法
7. ConfirmDialog 应设计为通用组件 — 后续 Story 可能复用（如工作区操作确认）

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
├── main/
│   └── index.ts                              # 修改 - 添加 close-window, delete-window IPC handlers
├── preload/
│   └── index.ts                              # 修改 - 添加 closeWindow, deleteWindow API
└── renderer/
    ├── components/
    │   ├── WindowContextMenu.tsx              # 新建 - 右键上下文菜单
    │   ├── ConfirmDialog.tsx                  # 新建 - 通用确认对话框
    │   └── __tests__/
    │       ├── ConfirmDialog.test.tsx          # 新建 - 确认对话框测试
    │       └── WindowContextMenu.test.tsx      # 新建 - 上下文菜单测试
    └── global.d.ts                            # 修改 - 添加 closeWindow, deleteWindow 类型
```

**与统一项目结构的对齐：**
- 渲染进程组件放在 `src/renderer/components/`
- 主进程 IPC handlers 集中在 `src/main/index.ts`
- Preload API 在 `src/preload/index.ts`
- 类型定义在 `src/renderer/global.d.ts`
- 测试文件在对应模块的 `__tests__/` 目录

**依赖安装：**
- 需要安装 `@radix-ui/react-context-menu` 和 `@radix-ui/react-alert-dialog`（如果 Story 2.2 未安装 Radix UI）
- 如果 Radix UI 已在 Story 1.3 或 2.2 中安装，直接使用即可

### References

- [Source: architecture.md#API设计 - close-window, delete-window IPC]
- [Source: architecture.md#API设计 - window-closed 事件]
- [Source: architecture.md#前端API封装 - windowsApi.close, windowsApi.delete]
- [Source: architecture.md#核心服务设计 - ProcessManager.killProcess]
- [Source: architecture.md#安全性设计 - contextIsolation, preload API]
- [Source: ux-design-specification.md#旅程4 - 窗口管理（关闭/删除）用户旅程]
- [Source: ux-design-specification.md#Modal & Confirmation Patterns - 确认对话框规范]
- [Source: ux-design-specification.md#Component Strategy - Dialog, ContextMenu, Button]
- [Source: ux-design-specification.md#Button Hierarchy - Primary/Secondary 按钮样式]
- [Source: ux-design-specification.md#Accessibility Strategy - 焦点管理、ARIA、键盘导航]
- [Source: epics.md#Story 2.4 - 验收标准]
- [Source: epics.md#Epic 2: 终端进程管理]
- [Source: prd.md#功能需求 - FR3, FR16]
- [Source: 2-1-process-management-service-infrastructure.md - ProcessManager killProcess 方法]
- [Source: 2-2-create-new-task-window.md - Radix UI Dialog 使用模式, Preload API 模式]
- [Source: 2-3-window-list-state-management.md - Zustand store removeWindow 方法]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
