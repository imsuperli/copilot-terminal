# Story 6.3: 启动时恢复工作区

Status: ready-for-dev

## Story

As a 用户,
I want 打开应用后自动恢复所有窗口配置和状态,
So that 可以立即继续昨天的工作，零重复配置。

## Acceptance Criteria

1. **Given** WorkspaceManager 服务和自动保存已实现（Story 6.1, 6.2）
   **When** 应用启动
   **Then** 系统自动加载 workspace.json 文件（FR5）

2. **Given** 工作区加载完成
   **When** 加载工作区
   **Then** 并行启动所有窗口的终端进程

3. **Given** 工作区加载完成
   **When** 启动终端进程
   **Then** 卡片网格立即渲染骨架屏，显示"恢复中"状态（灰色顶部线条）

4. **Given** 终端进程启动中
   **When** 进程启动完成
   **Then** 进程启动完成后，卡片切换为实际状态（蓝色/黄色/绿色/红色）

5. **Given** 工作区恢复进行中
   **When** 恢复 10+ 窗口
   **Then** 启动并恢复 10+ 窗口的时间 < 5s（NFR3）

6. **Given** 应用首次启动
   **When** 无 workspace.json 文件
   **Then** 首次启动（无 workspace.json）时显示空状态引导

7. **Given** 工作区加载失败
   **When** 加载失败
   **Then** 加载失败时显示错误提示，提供"从备份恢复"选项

8. **Given** 工作区恢复完成
   **When** 恢复后的窗口
   **Then** 恢复后的窗口保持原有的工作目录、启动命令、窗口名称

9. **Given** 工作区恢复完成
   **When** 用户看到恢复的窗口
   **Then** 用户无需任何手动配置即可开始工作

## Tasks / Subtasks

- [ ] Task 1: 创建工作区恢复管理器 (AC: 1-2)
  - [ ] 1.1 创建 `src/main/services/WorkspaceRestorer.ts`
  - [ ] 1.2 定义 WorkspaceRestorer 接口：`restoreWorkspace(workspace: Workspace): Promise<void>`
  - [ ] 1.3 实现 WorkspaceRestorerImpl 类
  - [ ] 1.4 注入 ProcessManager 和 StatusMonitor 依赖

- [ ] Task 2: 实现并行启动终端进程 (AC: 2)
  - [ ] 2.1 实现 `restoreWorkspace()` 方法
  - [ ] 2.2 遍历 workspace.windows 数组
  - [ ] 2.3 为每个窗口创建启动 Promise
  - [ ] 2.4 使用 Promise.all() 并行启动所有进程
  - [ ] 2.5 返回启动结果数组

- [ ] Task 3: 实现渐进式渲染 (AC: 3-4)
  - [ ] 3.1 在渲染进程中创建 `src/renderer/hooks/useWorkspaceRestore.ts`
  - [ ] 3.2 实现 `restoreWorkspace()` hook
  - [ ] 3.3 立即渲染卡片骨架屏（状态：Restoring）
  - [ ] 3.4 监听主进程的 `window-restored` IPC 事件
  - [ ] 3.5 事件触发时更新卡片状态（Running/Waiting/Completed/Error）

- [ ] Task 4: 实现 IPC 事件通知 (AC: 3-4)
  - [ ] 4.1 在主进程中定义 `window-restored` IPC 事件
  - [ ] 4.2 进程启动完成后，通过 IPC 事件通知渲染进程
  - [ ] 4.3 事件数据包含：windowId, status, pid
  - [ ] 4.4 确保事件推送不阻塞主进程

- [ ] Task 5: 集成到应用启动流程 (AC: 1-9)
  - [ ] 5.1 修改 `src/main/main.ts` 或应用入口
  - [ ] 5.2 应用启动时调用 WorkspaceManager.loadWorkspace()
  - [ ] 5.3 加载成功后调用 WorkspaceRestorer.restoreWorkspace()
  - [ ] 5.4 处理加载失败的情况
  - [ ] 5.5 通知渲染进程开始恢复

- [ ] Task 6: 实现错误处理和恢复 (AC: 6-7)
  - [ ] 6.1 创建 `src/renderer/components/WorkspaceRestoreError.tsx` 错误提示组件
  - [ ] 6.2 加载失败时显示错误提示
  - [ ] 6.3 提供"从备份恢复"按钮
  - [ ] 6.4 点击按钮时调用 WorkspaceManager.recoverFromBackup()
  - [ ] 6.5 恢复成功后重新启动恢复流程

- [ ] Task 7: 实现首次启动引导 (AC: 6)
  - [ ] 7.1 检查 workspace.json 是否存在
  - [ ] 7.2 如果不存在，显示空状态引导
  - [ ] 7.3 引导用户点击"+ 新建窗口"创建第一个窗口
  - [ ] 7.4 首次启动时不显示恢复进度

- [ ] Task 8: 实现性能优化 (AC: 5)
  - [ ] 8.1 使用 Promise.all() 并行启动所有进程
  - [ ] 8.2 测试 10 个窗口恢复时间，确保 < 3s
  - [ ] 8.3 测试 15 个窗口恢复时间，确保 < 5s
  - [ ] 8.4 优化进程启动顺序（可选）

- [ ] Task 9: 编写集成测试 (AC: 1-9)
  - [ ] 9.1 创建 `src/main/services/__tests__/WorkspaceRestorer.test.ts`
  - [ ] 9.2 测试工作区恢复：验证所有窗口进程启动
  - [ ] 9.3 测试并行启动：验证使用 Promise.all()
  - [ ] 9.4 测试 IPC 事件通知：验证事件正确发送
  - [ ] 9.5 创建 `src/renderer/hooks/__tests__/useWorkspaceRestore.test.ts`
  - [ ] 9.6 测试渐进式渲染：验证骨架屏和状态更新
  - [ ] 9.7 测试错误处理：验证加载失败时显示错误提示
  - [ ] 9.8 测试性能：验证恢复时间 < 5s

## Dev Notes

### 架构约束与技术要求

**工作区恢复机制设计（架构文档）：**

**职责：** 启动时快速恢复 10+ 窗口（< 5s）

**策略：**

1. **并行启动**
   - 同时启动所有终端进程
   - 使用 Promise.all 并发执行

2. **渐进式渲染**
   - 先渲染卡片骨架屏
   - 进程就绪后更新实际状态
   - 用户可立即看到界面，无需等待全部加载

3. **延迟状态检测**
   - 启动时不立即检测详细状态
   - 先标记为"恢复中"
   - 进程启动后再开始状态检测

**实现（架构文档）：**
```typescript
async function restoreWorkspace(workspace: Workspace): Promise<void> {
  const promises = workspace.windows.map(async (w) => {
    return await spawnTerminal(w);
  });

  // 等待所有进程启动（并行）
  const results = await Promise.all(promises);

  // 通知渲染进程更新状态
  for (const [windowId, result] of results.entries()) {
    mainWindow.webContents.send('window_restored', windowId, result);
  }
}
```

**性能目标（架构文档）：**
- 10 个窗口：< 3s
- 15 个窗口：< 5s

**数据流：**
```
1. 应用启动
   ↓
2. WorkspaceManager.loadWorkspace()
   ↓
3. 读取 workspace.json
   ↓
4. 并行启动所有终端进程
   ↓
5. 前端渲染卡片骨架屏（状态：Restoring）
   ↓
6. 进程启动完成，开始状态检测
   ↓
7. 前端更新卡片状态（Running/Waiting/etc）
```

### UX 规范要点

**工作区恢复体验（UX 设计文档 User Journey Flows）：**

**旅程 1：首次启动 & 日常恢复**
- 目标：打开软件 → 看到所有窗口状态 → 立即开始工作
- 启动时不显示 loading 页面，直接渲染卡片骨架
- 进程恢复在后台进行
- 卡片先显示"恢复中"状态，进程就绪后切换为实际状态
- 首次使用的空状态界面：居中显示"+ 新建你的第一个窗口"引导
- 目标：< 5s 完成全部恢复（10+ 窗口）

**关键设计决策：**
- 启动时不显示 loading 页面，直接渲染卡片骨架屏
- 进程恢复在后台进行
- 卡片先显示"恢复中"状态，进程就绪后切换为实际状态
- 首次使用的空状态界面：居中显示"+ 新建你的第一个窗口"引导

**加载/恢复状态（UX 设计文档 Empty States & Loading States）：**
- 卡片网格立即渲染，每张卡片显示骨架屏（灰色占位块）
- 顶部线条为灰色（恢复中状态）
- 进程就绪后，骨架屏淡出，实际内容淡入，顶部线条切换为实际状态色
- 不显示全局 loading 页面或进度条

### 技术实现指导

**WorkspaceRestorer 服务实现：**
```typescript
// src/main/services/WorkspaceRestorer.ts
import { ProcessManager } from './ProcessManager';
import { Workspace, Window } from '../types/workspace';

export class WorkspaceRestorerImpl implements WorkspaceRestorer {
  private processManager: ProcessManager;
  private mainWindow: BrowserWindow;

  constructor(processManager: ProcessManager, mainWindow: BrowserWindow) {
    this.processManager = processManager;
    this.mainWindow = mainWindow;
  }

  async restoreWorkspace(workspace: Workspace): Promise<void> {
    // 并行启动所有窗口的终端进程
    const promises = workspace.windows.map(async (window) => {
      try {
        const result = await this.processManager.spawnTerminal({
          workingDirectory: window.workingDirectory,
          command: window.command,
        });

        return {
          windowId: window.id,
          pid: result.pid,
          status: 'restoring',
        };
      } catch (error) {
        logger.error(`Failed to restore window ${window.id}:`, error);
        return {
          windowId: window.id,
          pid: null,
          status: 'error',
        };
      }
    });

    // 等待所有进程启动
    const results = await Promise.all(promises);

    // 通知渲染进程更新状态
    for (const result of results) {
      this.mainWindow.webContents.send('window-restored', result);
    }
  }
}
```

**渲染进程恢复 
```typescript
// src/renderer/hooks/useWorkspaceRestore.ts
import { useEffect } from 'react';
import { ipcRenderer } from 'electron';
import { useWindowStore } from '@/stores/windowStore';

export const useWorkspaceRestore = () => {
  const addWindow = useWindowStore((state) => state.addWindow);
  const updateWindowStatus = useWindowStore((state) => state.updateWindowStatus);

  useEffect(() => {
    // 监听 window-restored 事件
    const handler = (_: any, data: { windowId: string; pid: number | null; status: string }) => {
      updateWindowStatus(data.windowId, data.status);
    };

    ipcRenderer.on('window-restored', handler);

    return () => {
      ipcRenderer.removeListener('window-restored', handler);
    };
  }, [updateWindowStatus]);
};
```

**应用启动流程：**
```typescript
// src/main/main.ts
async function createWindow() {
  // 创建窗口
  const mainWindow = new BrowserWindow({ /* ... */ });

  // 加载工作区
  const workspace = await workspaceManager.loadWorkspace();

  // 恢复工作区
  if (workspace.windows.length > 0) {
    await workspaceRestorer.restoreWorkspace(workspace);
  }

  // 加载 HTML
  mainWindow.loadFile('index.html');
}

app.on('ready', createWindow);
```

### 防错指南

**常见 LLn1. 不要忘记并行启动 — 必须使用 Promise.all()，不能顺序启动
2. 不要忘记渐进式渲染 — 必须先显示骨架屏，后更新状态
3. 不要忘记错误处理 — 单个窗口启动失败不应影响其他窗口
4. 不要忘记清理事件监听器 — 必须在 hook 卸载时取消订阅
5. 不要忘记首次启动检查 — 必须检查 workspace.json 是否存在
6. 不要忘记性能测试 — 必须验证恢复时间 < 5s
7. 不要忘记备份恢复 — 加载失败时必须提供备份恢复选项
8. 不要忘记日志记录 — 必须记录恢复过程和错误

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
├── main/
│   ├── services/
│   │   ├── WorkspaceRestorer.ts                # 新建 - 工作区恢复服务
│   │   └── __tests__/
│   │       └── WorkspaceRestorer.test.ts       # 新建 - WorkspaceRestorer 测试
│   └── main.ts                        # 修改 - 集成恢复流程
├── renderer/
│   ├── components/
│   │   ├── WorkspaceRestoreError.tsx           # 新建 - 错误提示组件
│   │   └── __tests__/
│   │       └── WorkspaceRestoreError.test.tsx  # 新建 - 错误提示测试
│   └── hooks/
│       ├── useWorkspaceRestore.ts              # 新建 - 恢复 hook
│       └── __tests__/
│           └── useWorkspaceRestore.test.ts     # 新建 - hook 测试
└── shared/
    └── types/
        └── ipc.ts                              # 修改 - 添加 window-restored 事件
```

**与统一项目结构的对齐：**
- 主进程服务放在 `src/main/services/`
- 渲染进程 hooks 放在 `src/renderer/hooks/`
- 共享类型定义放在 `src/shared/types/`
- 测试文件在对应模块的 `__tests__/` 目录

### References

- [Source: epics.md#Story 6.3 - 启动时恢复工作区验收标准]
- [Source: epics.md#Epic 6: 工作区持久化]
- [Source: architecture.md#决策 4: 工作区恢复策略]
- [Source: architecture.md#数据流 - 启动流程]
- [Source: ux-design-specification.md#User Journey Flows - 旅程 1]
- [Source: ux-design-specification.md#Empty States & Loading States - 加载/恢复状态]
- [Source: 6-1-workspace-manager-service.md - WorkspaceManager 服务]
- [Source: 6-2-auto-save-workspace.md - 自动保存工作区]
- [Source: 2-1-process-management-service-infrastructure.md - ProcessManager 服务]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
