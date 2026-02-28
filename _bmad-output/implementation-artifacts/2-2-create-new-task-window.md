# Story 2.2: 创建新任务窗口

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 通过对话框创建新的任务窗口并指定工作目录和启动命令,
So that 可以为不同项目启动独立的 CLI 环境。

## Acceptance Criteria

1. **Given** 进程管理服务已实现（Story 2.1）
   **When** 点击"新建窗口"按钮
   **Then** 显示新建窗口对话框，包含三个字段：窗口名称（可选）、工作目录（必填）、启动命令（可选）（FR1）

2. **Given** 新建窗口对话框已打开
   **When** 输入工作目录
   **Then** 工作目录支持手动输入和文件夹选择器

3. **Given** 新建窗口对话框已打开
   **When** 输入工作目录路径
   **Then** 立即验证路径是否存在，无效时显示红色内联错误提示

4. **Given** 新建窗口对话框已打开
   **When** 启动命令字段为空
   **Then** 默认打开系统 shell（Windows: pwsh.exe, macOS: zsh）

5. **Given** 新建窗口对话框已填写有效信息
   **When** 点击"创建"按钮
   **Then** 系统调用 ProcessManager 启动终端进程并创建窗口记录

6. **Given** 窗口创建成功
   **When** 进程启动完成
   **Then** 新窗口数据保存到 Zustand store，卡片出现在网格中

7. **Given** 新建窗口对话框已打开
   **When** 使用键盘操作
   **Then** 支持 Tab 键导航字段、Enter 键提交、Esc 键关闭

## Tasks / Subtasks

- [ ] Task 1: 实现 Zustand 窗口状态 Store (AC: 6)
  - [ ] 1.1 安装 zustand 依赖
  - [ ] 1.2 创建 `src/renderer/stores/windowStore.ts`
  - [ ] 1.3 定义 Window 接口（id, name, workingDirectory, command, status, pid, createdAt, lastActiveAt）
  - [ ] 1.4 定义 WindowStatus 枚举（running, waiting, completed, error, restoring）
  - [ ] 1.5 实现 addWindow 方法
  - [ ] 1.6 实现 removeWindow 方法
  - [ ] 1.7 实现 updateWindowStatus 方法
  - [ ] 1.8 实现 setActiveWindow 方法

- [ ] Task 2: 扩展 Preload API 暴露终端管理接口 (AC: 5)
  - [ ] 2.1 在 `src/preload/index.ts` 中添加 createWindow IPC 调用
  - [ ] 2.2 添加 Electron dialog.showOpenDialog 用于文件夹选择
  - [ ] 2.3 添加路径验证 IPC 调用（检查目录是否存在）
  - [ ] 2.4 更新 `src/renderer/global.d.ts` 类型定义

- [ ] Task 3: 实现主进程 IPC Handler — 创建窗口 (AC: 5)
  - [ ] 3.1 在 `src/main/index.ts` 注册 `create-window` IPC handler
  - [ ] 3.2 handler 接收 { name, workingDirectory, command } 参数
  - [ ] 3.3 调用 ProcessManager.spawnTerminal 创建 PTY 进程
  - [ ] 3.4 生成 UUID 作为窗口 ID
  - [ ] 3.5 返回完整的 Window 对象给渲染进程
  - [ ] 3.6 注册 `validate-path` IPC handler 验证目录路径
  - [ ] 3.7 注册 `select-directory` IPC handler 打开文件夹选择器

- [ ] Task 4: 实现新建窗口对话框 UI 组件 (AC: 1, 2, 3, 4, 7)
  - [ ] 4.1 创建 `src/renderer/components/CreateWindowDialog.tsx`
  - [ ] 4.2 使用 Radix UI Dialog 组件作为基础
  - [ ] 4.3 实现窗口名称输入字段（可选，placeholder: "窗口 #N"）
  - [ ] 4.4 实现工作目录输入字段（必填）+ 文件夹选择按钮
  - [ ] 4.5 实现启动命令输入字段（可选，placeholder: "默认打开 shell"）
  - [ ] 4.6 实现工作目录即时验证逻辑（debounce 300ms）
  - [ ] 4.7 实现无效路径的红色内联错误提示
  - [ ] 4.8 实现 Tab 键字段导航顺序：名称 → 目录 → 命令 → 创建按钮
  - [ ] 4.9 实现 Enter 键提交和 Esc 键关闭
  - [ ] 4.10 对话框打开时焦点自动定位到"工作目录"字段
  - [ ] 4.11 使用 Tailwind CSS 实现深色主题样式（匹配设计令牌）
  - [ ] 4.12 对话框宽度不超过 480px，居中显示，半透明遮罩层

- [ ] Task 5: 集成新建窗口触发入口 (AC: 1)
  - [ ] 5.1 在工具栏添加"+ 新建窗口"按钮（Primary 样式）
  - [ ] 5.2 按钮点击打开 CreateWindowDialog
  - [ ] 5.3 对话框提交后调用 IPC 创建窗口并更新 Zustand store

- [ ] Task 6: 编写测试 (AC: 1-7)
  - [ ] 6.1 CreateWindowDialog 组件渲染测试
  - [ ] 6.2 表单验证逻辑测试（路径验证、必填字段）
  - [ ] 6.3 键盘导航测试（Tab、Enter、Esc）
  - [ ] 6.4 Zustand store addWindow 方法测试
  - [ ] 6.5 IPC handler create-window 集成测试

## Dev Notes

### 架构约束与技术要求

**前置依赖（必须已实现）：**
- Story 1.3: Radix UI + Tailwind CSS 设计系统（Dialog 组件、设计令牌、深色主题）
- Story 1.4: 应用主窗口和基础布局（工具栏、主内容区、空状态）
- Story 2.1: ProcessManager 服务（node-pty 进程管理、IPC handlers）

**技术栈要求 [Source: architecture.md#技术栈总结]：**
- 前端框架: React 18.x + TypeScript 5.x
- UI 组件库: Radix UI 1.x（Dialog 组件）
- CSS 框架: Tailwind CSS 3.x
- 状态管理: Zustand 4.x
- 构建工具: Vite 5.x
- 终端集成: node-pty 1.x（通过 ProcessManager 服务调用）

**Radix UI Dialog 使用规范 [Source: ux-design-specification.md#Modal & Confirmation Patterns]：**
- 使用 `@radix-ui/react-dialog` 包
- 对话框居中显示，宽度不超过 480px
- 半透明深色遮罩层，点击遮罩层关闭
- 对话框打开时焦点自动定位到"工作目录"字段（最关键的必填项）
- 按钮布局：左侧"取消"（Secondary），右侧"创建"（Primary）
- 同一时间最多显示一个模态对话框

**表单设计规范 [Source: ux-design-specification.md#Form Patterns]：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| 窗口名称 | 文本输入 | 否 | 自动生成（如"窗口 #13"） | 用户可自定义 |
| 工作目录 | 文本输入 + 文件夹选择器 | 是 | 用户主目录 | 支持手动输入和浏览选择 |
| 启动命令 | 文本输入 | 否 | 空（打开默认 shell） | 如 `claude`、`opencode` |

**Zustand Store 结构 [Source: architecture.md#状态管理]：**
```typescript
interface AppState {
  windows: Window[]
  activeWindowId: string | null
  addWindow: (window: Window) => void
  removeWindow: (id: string) => void
  updateWindowStatus: (id: string, status: WindowStatus) => void
  setActiveWindow: (id: string) => void
}
```

**Window 数据模型 [Source: architecture.md#数据模型设计]：**
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
}

enum WindowStatus {
  Running = 'running',
  WaitingForInput = 'waiting',
  Completed = 'completed',
  Error = 'error',
  Restoring = 'restoring'
}
```

**IPC API 设计 [Source: architecture.md#API设计]：**
```typescript
// 渲染进程 → 主进程
ipcRenderer.invoke('create-window', {
  name: string,
  workingDirectory: string,
  command?: string
}): Promise<Window>

// 路径验证
ipcRenderer.invoke('validate-path', { path: string }): Promise<boolean>

// 文件夹选择器
ipcRenderer.invoke('select-directory'): Promise<string | null>
```

**Preload 安全规范 [Source: architecture.md#安全性设计]：**
- 使用 contextBridge.exposeInMainWorld 暴露 API
- contextIsolation: true（已在 Story 1.1 配置）
- nodeIntegration: false（已在 Story 1.1 配置）
- 启动命令参数化，避免 shell 注入
- 工作目录路径验证

**设计令牌（CSS 变量）[Source: ux-design-specification.md#Design System Foundation]：**
- 状态色: `--color-running`(蓝), `--color-waiting`(黄), `--color-completed`(绿), `--color-error`(红)
- 背景色: `--bg-app`, `--bg-card`, `--bg-card-hover`
- 文字色: `--text-primary`, `--text-secondary`, `--text-disabled`
- 间距: `--spacing-unit`(8px)
- 圆角: `--radius-card`

**按钮层级 [Source: ux-design-specification.md#Button Hierarchy]：**
- Primary: 实心填充 — "创建"按钮
- Secondary: 边框描边 — "取消"按钮
- 所有按钮最小点击区域 36x36px

**无障碍要求 [Source: ux-design-specification.md#Accessibility Strategy]：**
- Dialog: `role="dialog"`, `aria-labelledby` 指向标题
- 文字对比度 ≥ 4.5:1
- 焦点管理：对话框打开时捕获焦点，关闭时恢复焦点到触发元素
- 所有输入字段有 label 关联
- 错误提示使用 `aria-describedby` 关联到输入字段

### 关键实现细节

**工作目录验证实现：**
- 使用 debounce（300ms）避免频繁 IPC 调用
- 主进程使用 `fs.existsSync` 或 `fs.access` 验证路径
- 验证结果通过 IPC 返回给渲染进程
- 无效路径时在输入框下方显示红色内联错误："路径不存在"

**文件夹选择器实现：**
- 主进程使用 `dialog.showOpenDialog({ properties: ['openDirectory'] })`
- 选择结果通过 IPC 返回给渲染进程
- 选择后自动填充工作目录字段并触发验证

**窗口名称自动生成：**
- 如果用户未填写名称，自动生成 "窗口 #N"（N = 当前窗口数 + 1）
- 名称字段 placeholder 显示自动生成的名称

**创建流程：**
1. 用户填写表单 → 点击"创建"
2. 渲染进程调用 `window.electronAPI.createWindow({ name, workingDirectory, command })`
3. 主进程 IPC handler 调用 `processManager.spawnTerminal(config)`
4. 主进程生成 UUID，构建 Window 对象，返回给渲染进程
5. 渲染进程将 Window 对象添加到 Zustand store
6. React 组件自动重渲染，新卡片出现在网格中
7. 对话框关闭

### 常见陷阱与注意事项

**🚨 Radix UI Dialog 焦点管理：**
- ✅ Radix Dialog 自动管理焦点陷阱（对话框内焦点循环）
- ✅ 使用 `autoFocus` 或 `onOpenAutoFocus` 将初始焦点设置到工作目录字段
- ❌ 不要手动管理焦点 — Radix 已处理
- ❌ 不要忘记 `onCloseAutoFocus` 恢复焦点到触发按钮

**🚨 IPC 调用错误处理：**
- ✅ create-window 失败时在对话框内显示错误，不关闭对话框
- ✅ validate-path 失败时显示内联错误
- ❌ 不要使用 alert() 或 toast — 使用内联错误提示
- ❌ 不要在 IPC handler 中抛出未捕获异常

**🚨 Zustand Store 注意事项：**
- ✅ 使用 immer 中间件或展开运算符确保不可变更新
- ✅ 使用 selector 精确订阅，避免不必要的重渲染
- ❌ 不要在 store 中存储 PTY 实例（不可序列化）
- ❌ 不要在 store 中存储 React 组件引用

**🚨 路径验证陷阱：**
- ✅ Windows 路径使用反斜杠（`\`），macOS 使用正斜杠（`/`）
- ✅ 使用 Node.js path 模块处理路径
- ✅ 验证路径时检查目录是否存在且可访问
- ❌ 不要在渲染进程中直接使用 fs 模块 — 通过 IPC 调用主进程

**🚨 UX 注意事项：**
- ✅ 创建后不自动跳转到新窗口，让用户决定是否切入
- ✅ 对话框无过渡动画，追求即时感
- ✅ 错误提示使用红色文字，紧邻输入字段
- ❌ 不要使用弹窗/toast 显示错误 — 使用内联提示

### 前置故事智能分析

**Story 2.1 (ProcessManager) 提供的基础：**
- ProcessManager 类在 `src/main/services/ProcessManager.ts`
- 类型定义在 `src/main/types/process.ts`
- IPC handlers: `create-terminal`, `kill-terminal`, `get-terminal-status`
- 进程退出事件: `terminal-exited`
- 本 Story 需要在此基础上添加 `create-window` handler（封装 ProcessManager + 窗口元数据）

**Story 1.3 (UI 设计系统) 提供的基础：**
- Radix UI Dialog 组件可用
- Tailwind CSS 配置完成
- 设计令牌（CSS 变量）已定义
- Button 组件（Primary/Secondary）可用

**Story 1.4 (主窗口布局) 提供的基础：**
- 工具栏组件已实现
- 主内容区布局已实现
- 空状态组件已实现
- 本 Story 需要在工具栏中添加"新建窗口"按钮

### Project Structure Notes

**新增文件：**
```
src/
├── main/
│   └── index.ts                          # 修改 - 添加 create-window, validate-path, select-directory IPC handlers
├── preload/
│   └── index.ts                          # 修改 - 暴露 createWindow, validatePath, selectDirectory API
├── renderer/
│   ├── components/
│   │   └── CreateWindowDialog.tsx         # 新建 - 新建窗口对话框组件
│   ├── stores/
│   │   └── windowStore.ts                # 新建 - Zustand 窗口状态管理
│   ├── types/
│   │   └── window.ts                     # 新建 - Window 和 WindowStatus 类型定义
│   └── global.d.ts                       # 修改 - 添加新 API 类型定义
```

**与统一项目结构的对齐：**
- 渲染进程组件放在 `src/renderer/components/`
- 状态管理放在 `src/renderer/stores/`
- 类型定义放在 `src/renderer/types/`
- 主进程 IPC handlers 集中在 `src/main/index.ts`

### References

- [Source: architecture.md#技术栈选型 - React + TypeScript, Radix UI, Zustand]
- [Source: architecture.md#状态管理 - Zustand AppState 接口]
- [Source: architecture.md#数据模型设计 - Window, WindowStatus]
- [Source: architecture.md#API设计 - create-window IPC]
- [Source: architecture.md#安全性设计 - contextIsolation, 命令注入防护]
- [Source: ux-design-specification.md#Form Patterns - 新建窗口对话框]
- [Source: ux-design-specification.md#Modal & Confirmation Patterns - 对话框规范]
- [Source: ux-design-specification.md#Button Hierarchy - 按钮层级]
- [Source: ux-design-specification.md#Accessibility Strategy - 无障碍要求]
- [Source: ux-design-specification.md#旅程2 - 新建任务窗口用户旅程]
- [Source: epics.md#Story 2.2 - 验收标准]
- [Source: 2-1-process-management-service-infrastructure.md - ProcessManager 实现细节]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
