# 修复方案 #3: 主进程代码过于臃肿

**问题编号**: FIX-003
**优先级**: 🔴 高
**预计工作量**: 3-4 小时
**风险等级**: 中（大规模重构，但不改变功能）

---

## 1. 问题分析

### 1.1 当前问题

**文件**: `src/main/index.ts`
**行数**: 968 行（过大）

**问题**:
- 所有 IPC handlers 都在 `registerIPCHandlers()` 函数中（Line 368-935，约 567 行）
- 窗口创建、进程管理、工作区保存等逻辑混杂在一起
- 单个 handler 函数过长（如 create-window: 100+ 行）
- 难以测试和维护
- 新增功能时容易引入 bug

### 1.2 IPC Handlers 分类

**窗口管理** (5 个):
- create-window
- start-window
- close-window
- delete-window
- get-window-status

**进程管理** (4 个):
- create-terminal
- kill-terminal
- get-terminal-status
- list-terminals

**窗格管理** (2 个):
- split-pane
- close-pane

**PTY 通信** (3 个):
- pty-write
- pty-resize
- get-pty-history

**工作区管理** (3 个):
- save-workspace
- load-workspace
- recover-from-backup

**视图切换** (2 个):
- switch-to-terminal-view
- switch-to-unified-view

**文件系统** (3 个):
- validate-path
- select-directory
- open-folder

**其他** (1 个):
- ping

**总计**: 23 个 handlers

---

## 2. 解决方案设计

### 2.1 模块化架构

```
src/main/
├── index.ts                    # 主入口（简化到 < 300 行）
├── handlers/                   # IPC handlers 模块
│   ├── index.ts               # 统一注册入口
│   ├── windowHandlers.ts      # 窗口管理 (5 个)
│   ├── processHandlers.ts     # 进程管理 (4 个)
│   ├── paneHandlers.ts        # 窗格管理 (2 个)
│   ├── ptyHandlers.ts         # PTY 通信 (3 个)
│   ├── workspaceHandlers.ts   # 工作区管理 (3 个)
│   ├── viewHandlers.ts        # 视图切换 (2 个)
│   ├── fileHandlers.ts        # 文件系统 (3 个)
│   └── miscHandlers.ts        # 其他 (1 个)
├── services/                   # 服务类（已存在）
└── utils/                      # 工具类（已存在）
```

### 2.2 Handler 上下文对象

为了避免每个 handler 都需要传递大量参数，创建一个上下文对象：

```typescript
// src/main/handlers/HandlerContext.ts
export interface HandlerContext {
  mainWindow: BrowserWindow | null;
  processManager: ProcessManager | null;
  statusPoller: StatusPoller | null;
  viewSwitcher: ViewSwitcherImpl | null;
  workspaceManager: WorkspaceManagerImpl | null;
  autoSaveManager: AutoSaveManagerImpl | null;
  ptySubscriptionManager: PtySubscriptionManager | null;
  ptyOutputCache: Map<string, string[]>;
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
}
```

---

## 3. 实施步骤

### 步骤 1: 创建 HandlerContext 接口

**文件**: `src/main/handlers/HandlerContext.ts`

```typescript
import { BrowserWindow } from 'electron';
import { ProcessManager } from '../services/ProcessManager';
import { StatusPoller } from '../services/StatusPoller';
import { ViewSwitcherImpl } from '../services/ViewSwitcher';
import { WorkspaceManagerImpl } from '../services/WorkspaceManager';
import { AutoSaveManagerImpl } from '../services/AutoSaveManager';
import { PtySubscriptionManager } from '../services/PtySubscriptionManager';
import { Workspace } from '../types/workspace';

/**
 * IPC Handler 上下文
 * 包含所有 handlers 需要的共享资源
 */
export interface HandlerContext {
  mainWindow: BrowserWindow | null;
  processManager: ProcessManager | null;
  statusPoller: StatusPoller | null;
  viewSwitcher: ViewSwitcherImpl | null;
  workspaceManager: WorkspaceManagerImpl | null;
  autoSaveManager: AutoSaveManagerImpl | null;
  ptySubscriptionManager: PtySubscriptionManager | null;
  ptyOutputCache: Map<string, string[]>;
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
}

/**
 * 常量配置
 */
export const MAX_CACHE_SIZE = 1000; // 每个窗格最多缓存 1000 条输出
```

### 步骤 2: 创建窗口管理 handlers

**文件**: `src/main/handlers/windowHandlers.ts`

```typescript
import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { HandlerContext } from './HandlerContext';
import { PathValidator } from '../utils/pathValidator';
import { WindowStatus } from '../../renderer/types/window';

/**
 * 注册窗口管理相关的 IPC handlers
 */
export function registerWindowHandlers(ctx: HandlerContext) {
  // 创建窗口
  ipcMain.handle('create-window', async (_event, config: { name?: string; workingDirectory: string; command?: string }) => {
    // ... 移动 create-window 的实现代码
  });

  // 启动暂停的窗口
  ipcMain.handle('start-window', async (_event, { windowId, paneId, name, workingDirectory, command }) => {
    // ... 移动 start-window 的实现代码
  });

  // 关闭窗口
  ipcMain.handle('close-window', async (_event, { windowId }) => {
    // ... 移动 close-window 的实现代码
  });

  // 删除窗口
  ipcMain.handle('delete-window', async (_event, { windowId }) => {
    // ... 移动 delete-window 的实现代码
  });

  // 获取窗口状态（如果存在）
  // ipcMain.handle('get-window-status', async (_event, { windowId }) => {
  //   // ...
  // });
}
```

### 步骤 3: 创建其他 handlers 模块

类似地创建：
- `processHandlers.ts`
- `paneHandlers.ts`
- `ptyHandlers.ts`
- `workspaceHandlers.ts`
- `viewHandlers.ts`
- `fileHandlers.ts`
- `miscHandlers.ts`

### 步骤 4: 创建统一注册入口

**文件**: `src/main/handlers/index.ts`

```typescript
import { HandlerContext } from './HandlerContext';
import { registerWindowHandlers } from './windowHandlers';
import { registerProcessHandlers } from './processHandlers';
import { registerPaneHandlers } from './paneHandlers';
import { registerPtyHandlers } from './ptyHandlers';
import { registerWorkspaceHandlers } from './workspaceHandlers';
import { registerViewHandlers } from './viewHandlers';
import { registerFileHandlers } from './fileHandlers';
import { registerMiscHandlers } from './miscHandlers';

/**
 * 注册所有 IPC handlers
 */
export function registerAllHandlers(ctx: HandlerContext) {
  registerWindowHandlers(ctx);
  registerProcessHandlers(ctx);
  registerPaneHandlers(ctx);
  registerPtyHandlers(ctx);
  registerWorkspaceHandlers(ctx);
  registerViewHandlers(ctx);
  registerFileHandlers(ctx);
  registerMiscHandlers(ctx);
}
```

### 步骤 5: 简化 index.ts

**修改**: `src/main/index.ts`

```typescript
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { ProcessManager } from './services/ProcessManager';
import { StatusPoller } from './services/StatusPoller';
import { ViewSwitcherImpl } from './services/ViewSwitcher';
import { WorkspaceManagerImpl } from './services/WorkspaceManager';
import { AutoSaveManagerImpl } from './services/AutoSaveManager';
import { PtySubscriptionManager } from './services/PtySubscriptionManager';
import { Workspace } from './types/workspace';
import { registerAllHandlers } from './handlers';
import { HandlerContext } from './handlers/HandlerContext';

let mainWindow: BrowserWindow | null = null;
let processManager: ProcessManager | null = null;
let statusPoller: StatusPoller | null = null;
let viewSwitcher: ViewSwitcherImpl | null = null;
let workspaceManager: WorkspaceManagerImpl | null = null;
let autoSaveManager: AutoSaveManagerImpl | null = null;
let ptySubscriptionManager: PtySubscriptionManager | null = null;
let currentWorkspace: Workspace | null = null;

// PTY 输出缓存
const ptyOutputCache = new Map<string, string[]>();

// 退出标志
let isQuitting = false;

// 当前视图状态
let currentView: 'unified' | 'terminal' = 'unified';

// ... 保留 getDefaultShell, createWindow 等函数

app.whenReady().then(async () => {
  // 初始化所有服务
  workspaceManager = new WorkspaceManagerImpl();
  await workspaceManager.recoverFromCrash();
  autoSaveManager = new AutoSaveManagerImpl();
  processManager = new ProcessManager();
  ptySubscriptionManager = new PtySubscriptionManager();

  // 创建 handler 上下文
  const handlerContext: HandlerContext = {
    mainWindow,
    processManager,
    statusPoller,
    viewSwitcher,
    workspaceManager,
    autoSaveManager,
    ptySubscriptionManager,
    ptyOutputCache,
    currentWorkspace,
    setCurrentWorkspace: (workspace) => { currentWorkspace = workspace; },
  };

  // 注册所有 IPC handlers
  registerAllHandlers(handlerContext);

  createWindow();

  // ... 其他初始化代码
});

// ... 保留其他代码
```

---

## 4. 重构优先级

由于这是一个大规模重构，建议分阶段进行：

### 阶段 1: 基础设施（必须）
1. 创建 HandlerContext 接口
2. 创建 handlers/index.ts 统一入口

### 阶段 2: 核心 handlers（优先）
1. windowHandlers.ts（最复杂，最常用）
2. paneHandlers.ts（与窗口紧密相关）
3. ptyHandlers.ts（核心功能）

### 阶段 3: 其他 handlers（次要）
1. workspaceHandlers.ts
2. viewHandlers.ts
3. fileHandlers.ts
4. processHandlers.ts
5. miscHandlers.ts

### 阶段 4: 清理（最后）
1. 删除 index.ts 中的旧代码
2. 验证所有功能正常

---

## 5. 测试策略

### 5.1 单元测试

每个 handler 模块都应该有对应的测试文件：
- `windowHandlers.test.ts`
- `paneHandlers.test.ts`
- 等等

### 5.2 集成测试

确保重构后所有功能正常：
1. 创建窗口
2. 拆分窗格
3. 关闭窗格
4. 删除窗口
5. 工作区保存和恢复
6. 视图切换
7. 应用退出

---

## 6. 风险评估

### 6.1 风险

- **高风险**: 大规模代码移动，可能引入 bug
- **中风险**: 上下文对象可能导致状态管理混乱
- **低风险**: 只是代码组织，不改变逻辑

### 6.2 缓解措施

1. **分阶段重构** - 每次只移动一个模块
2. **保持功能不变** - 只移动代码，不修改逻辑
3. **充分测试** - 每个阶段都要测试
4. **Git 分支** - 在独立分支上进行重构
5. **代码审查** - 重构完成后仔细审查

---

## 7. 预期效果

### 7.1 代码组织

**重构前**:
- index.ts: 968 行

**重构后**:
- index.ts: ~250 行（主入口）
- handlers/index.ts: ~30 行（注册入口）
- handlers/HandlerContext.ts: ~30 行
- handlers/windowHandlers.ts: ~200 行
- handlers/paneHandlers.ts: ~100 行
- handlers/ptyHandlers.ts: ~100 行
- handlers/workspaceHandlers.ts: ~80 行
- handlers/viewHandlers.ts: ~40 行
- handlers/fileHandlers.ts: ~60 行
- handlers/processHandlers.ts: ~80 行
- handlers/miscHandlers.ts: ~20 行

**总计**: ~990 行（略有增加，但组织更清晰）

### 7.2 可维护性

- ✅ 每个模块职责单一
- ✅ 易于查找和修改
- ✅ 易于测试
- ✅ 易于新增功能

---

## 8. 验收标准

- [ ] HandlerContext 接口创建完成
- [ ] 所有 handlers 模块创建完成
- [ ] handlers/index.ts 统一注册入口创建完成
- [ ] index.ts 简化到 < 300 行
- [ ] 所有功能正常工作
- [ ] 编译通过，无错误
- [ ] 代码审查通过

---

## 9. 时间估算

- 阶段 1（基础设施）: 30 分钟
- 阶段 2（核心 handlers）: 2 小时
- 阶段 3（其他 handlers）: 1 小时
- 阶段 4（清理和测试）: 30 分钟

**总计**: 约 4 小时

---

**准备开始实施？请确认后我将开始重构。**
