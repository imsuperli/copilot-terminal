# Story 6.2: 自动保存工作区

Status: ready-for-dev

## Story

As a 用户,
I want 窗口变化时系统自动保存工作区配置,
So that 关闭应用后不会丢失任何窗口配置。

## Acceptance Criteria

1. **Given** WorkspaceManager 服务已实现（Story 6.1）
   **When** 窗口列表发生变化（新建、删除、状态更新）
   **Then** 系统自动触发工作区保存（FR4）

2. **Given** 自动保存已实现
   **When** 保存操作执行
   **Then** 保存操作异步执行，不阻塞 UI

3. **Given** 自动保存已实现
   **When** 保存失败
   **Then** 保存失败时记录错误日志，不影响应用运行

4. **Given** 自动保存已实现
   **When** 频繁修改窗口
   **Then** 保存间隔至少 1 秒（防止频繁写入）

5. **Given** 自动保存已实现
   **When** 应用正常关闭
   **Then** 应用正常关闭时立即保存最新状态

6. **Given** 自动保存已实现
   **When** 保存工作区
   **Then** 保存的配置包含所有窗口的：id, name, workingDirectory, command, status, pid, createdAt, lastActiveAt

7. **Given** 自动保存已实现
   **When** 保存工作区
   **Then** 保存的配置包含全局设置：notificationsEnabled, theme, autoSave, autoSaveInterval

## Tasks / Subtasks

- [ ] Task 1: 创建自动保存管理器 (AC: 1-4)
  - [ ] 1.1 创建 `src/main/services/AutoSaveManager.ts`
  - [ ] 1.2 定义 AutoSaveManager 接口：`startAutoSave(workspaceManager: WorkspaceManager, getWorkspace: () => Workspace): void`
  - [ ] 1.3 定义 AutoSaveManager 接口：`stopAutoSave(): void`
  - [ ] 1.4 实现 AutoSaveManagerImpl 类
  - [ ] 1.5 添加 `saveTimer: NodeJS.Timeout | null` 用于防抖

- [ ] Task 2: 实现防抖保存机制 (AC: 4)
  - [ ] 2.1 实现 `triggerSave()` 方法
  - [ ] 2.2 如果已有待处理的保存，清除旧的定时器
  - [ ] 2.3 设置新的定时器，延迟 1 秒后执行保存
  - [ ] 2.4 确保频繁修改时只保存一次

- [ ] Task 3: 实现异步保存 (AC: 2-3)
  - [ ] 3.1 实现 `performSave()` 方法
  - [ ] 3.2 调用 WorkspaceManager.saveWorkspace()
  - [ ] 3.3 使用 try-catch 捕获异常
  - [ ] 3.4 保存失败时记录错误日志，不抛出异常
  - [ ] 3.5 确保保存操作不阻塞主进程

- [ ] Task 4: 集成到 Zustand store (AC: 1)
  - [ ] 4.1 修改 `src/renderer/stores/windowStore.ts`
  - [ ] 4.2 在 addWindow, removeWindow, updateWindowStatus 等 action 中触发保存
  - [ ] 4.3 通过 IPC 事件通知主进程触发保存
  - [ ] 4.4 定义 `trigger-auto-save` IPC 事件

- [ ] Task 5: 实现主进程保存触发 (AC: 1)
  - [ ] 5.1 在主进程中注册 IPC 事件处理器
  - [ ] 5.2 处理 `trigger-auto-save` 事件：调用 AutoSaveManager.triggerSave()
  - [ ] 5.3 确保事件处理不阻塞主进程

- [ ] Task 6: 实现应用关闭时的保存 (AC: 5)
  - [ ] 6.1 监听 Electron 的 `before-quit` 事件
  - [ ] 6.2 在应用关闭前立即保存工作区
  - [ ] 6.3 使用同步保存或等待异步保存完成
  - [ ] 6.4 确保保存完成后再关闭应用

- [ ] Task 7: 实现日志记录 (AC: 3)
  - [ ] 7.1 创建 `src/main/utils/logger.ts`（如果未创建）
  - [ ] 7.2 在保存成功时记录 INFO 日志
  - [ ] 7.3 在保存失败时记录 ERROR 日志
  - [ ] 7.4 日志包含时间戳和错误信息

- [ ] Task 8: 集成到应用初始化 (AC: 1-7)
  - [ ] 8.1 在主进程初始化时创建 AutoSaveManager 实例
  - [ ] 8.2 调用 `startAutoSave()` 启动自动保存
  - [ ] 8.3 应用关闭时调用 `stopAutoSave()` 停止自动保存
  - [ ] 8.4 清理定时器，避免内存泄漏

- [ ] Task 9: 编写单元测试 (AC: 1-7)
  - [ ] 9.1 创建 `src/main/services/__tests__/AutoSaveManager.test.ts`
  - [ ] 9.2 测试防抖机制：验证频繁修改时只保存一次
  - [ ] 9.3 测试异步保存：验证保存操作不阻塞主进程
  - [ ] 9.4 测试错误处理：验证保存失败时记录日志
  - [ ] 9.5 测试应用关闭：验证关闭前保存工作区
  - [ ] 9.6 测试定时器清理：验证 stopAutoSave 清理定时器

## Dev Notes

### 架构约束与技术要求

**自动保存机制设计（架构文档）：**

**职责：** 在窗口变化时自动保存工作区配置

**实现策略：**
- 防抖保存：频繁修改时只保存一次
- 异步保存：不阻塞 UI
- 错误处理：保存失败时记录日志，不影响应用运行
- 应用关闭时立即保存

**核心实现（架构文档）：**
```typescript
class AutoSaveManagerImpl implements AutoSaveManager {
  private saveTimer: NodeJS.Timeout | null = null;
  private workspaceManager: WorkspaceManager | null = null;
  private getWorkspace: (() => Workspace) | null = null;

  startAutoSave(workspaceManager: WorkspaceManager, getWorkspace: () => Workspace): void {
    this.workspaceManager = workspaceManager;
    this.getWorkspace = getWorkspace;
  }

  triggerSave(): void {
    // 清除旧的定时器
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // 设置新的定时器，延迟 1 秒后执行保存
    this.saveTimer = setTimeout(() => {
      this.performSave();
    }, 1000);
  }

  private async performSave(): Promise<void> {
    try {
      const workspace = this.getWorkspace?.();
      if (workspace && this.workspaceManager) {
        await this.workspaceManager.saveWorkspace(workspace);
        logger.info('Workspace saved successfully');
      }
    } catch (error) {
      logger.error('Failed to save workspace:', error);
    }
  }

  stopAutoSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}
```

**数据流：**
```
1. 窗口变化（新建、删除、状态更新）
   ↓
2. Zustand store action 触发
   ↓
3. 通过 IPC 事件通知主进程
   ↓
4. AutoSaveManager.triggerSave()
   ↓
5. 防抖定时器（1 秒）
   ↓
6. AutoSaveManager.performSave()
   ↓
7. WorkspaceManager.saveWorkspace()
   ↓
8. 文件写入完成
```

### UX 规范要点

**自动保存体验（UX 设计文档）：**

**关键设计决策：**
- 自动保存在后台进行，用户无感知
- 保存失败不影响应用运行
- 应用关闭前确保保存完成

### 技术实现指导

**防抖保存实现：**
```typescript
class AutoSaveManagerImpl {
  private saveTimer: NodeJS.Timeout | null = null;

  triggerSave(): void {
    // 清除旧的定时器
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // 设置新的定时器，延迟 1 秒后执行保存
    this.saveTimer = setTimeout(() => {
      this.performSave();
    }, 1000);
  }

  stopAutoSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}
```

**应用关闭时的保存：**
```typescript
// 在主进程中
app.on('before-quit', async (event) => {
  // 等待保存完成
  await autoSaveManager.performSave();
});
```

**IPC 事件处理：**
```typescript
// 主进程
ipcMain.on('trigger-auto-save', () => {
  autoSaveManager.triggerSave();
});

// 渲染进程（Zustand store）
const useWindowStore = create<WindowStore>((set) => ({
  addWindow: (window) => {
    set((state) => ({
      windows: [...state.windows, window],
    }));
    ipcRenderer.send('trigger-auto-save');
  },
}));
```

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要忘记清理定时器 — stopAutoSave 必须清理 setTimeout
2. 不要在保存时阻塞主进程 — 必须使用异步操作
3. 不要忘记错误处理 — 保存失败时必须记录日志
4. 不要忘记防抖机制 — 必须实现 1 秒延迟
5. 不要忘记应用关闭时的保存 — 必须监听 before-quit 事件
6. 不要忘记日志记录 — 必须记录保存成功和失败
7. 不要忘记内存泄漏 — 必须清理定时器和事件监听器
8. 不要忘记测试频繁修改 — 必须验证防抖机制正确

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
├── main/
│   ├── services/
│   │   ├── AutoSaveManager.ts                  # 新建 - 自动保存管理器
│   │   └── __tests__/
│   │       └── AutoSaveManager.test.ts         # 新建 - AutoSaveManager 测试
│   └── utils/
│       └── logger.ts                           # 新建（可选）- 日志工具
├── renderer/
│   └── stores/
│       └── windowStore.ts                      # 修改 - 添加 IPC 事件触发
└── shared/
    └── types/
        └── ipc.ts                              # 修改 - 添加 trigger-auto-save 事件
```

**与统一项目结构的对齐：**
- 主进程服务放在 `src/main/services/`
- 工具函数放在 `src/main/utils/`
- 测试文件在对应模块的 `__tests__/` 目录

### References

- [Source: epics.md#Story 6.2 - 自动保存工作区验收标准]
- [Source: epics.md#Epic 6: 工作区持久化]
- [Source: architecture.md#WorkspaceManager 服务设计]
- [Source: architecture.md#数据流 - 启动流程]
- [Source: ux-design-specification.md#User Journey Flows - 旅程 1]
- [Source: 6-1-workspace-manager-service.md - WorkspaceManager 服务]
- [Source: 2-3-window-list-state-management.md - Zustand store]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
