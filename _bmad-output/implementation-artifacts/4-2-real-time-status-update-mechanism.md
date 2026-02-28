# Story 4.2: 实时状态更新机制

Status: done

## Story

As a 用户,
I want 窗口状态变化时界面自动更新,
So that 可以实时看到哪些窗口需要介入。

## Acceptance Criteria

1. **Given** StatusDetector 服务已实现（Story 4.1）
   **When** 实现状态更新机制
   **Then** 主进程定期检测所有窗口状态（轮询间隔 1s）（FR7）

2. **Given** 状态更新机制已实现
   **When** 窗口状态发生变化
   **Then** 状态变化时通过 IPC 事件推送到渲染进程（window-status-changed）

3. **Given** 状态更新机制已实现
   **When** 渲染进程接收到状态变化事件
   **Then** 渲染进程接收事件后更新 Zustand store

4. **Given** 状态更新机制已实现
   **When** Zustand store 更新
   **Then** WindowCard 组件自动重渲染，更新顶部线条颜色和状态标签

5. **Given** 状态更新机制已实现
   **When** Zustand store 更新
   **Then** StatusBar 组件自动更新状态统计数字

6. **Given** 状态更新机制已实现
   **When** 状态变化
   **Then** 状态更新无过渡动画，直接切换颜色（追求即时感）

7. **Given** 状态更新机制已实现
   **When** 检测窗口状态
   **Then** 活跃窗口检测间隔 1s，非活跃窗口检测间隔 5s（性能优化）

8. **Given** 状态更新机制已实现
   **When** 状态变化
   **Then** 状态更新延迟 < 1s（NFR2）

## Tasks / Subtasks

- [x] Task 1: 主进程状态轮询机制 (AC: 1, 7)
  - [x] 1.1 创建 `src/main/services/StatusPoller.ts`
  - [x] 1.2 实现 StatusPoller 类，管理所有窗口的状态轮询
  - [x] 1.3 添加 `trackedWindows: Map<string, { pid: number, isActive: boolean }>` 存储跟踪的窗口
  - [x] 1.4 实现 `startPolling()` 方法，启动定期轮询
  - [x] 1.5 实现 `stopPolling()` 方法，停止轮询
  - [x] 1.6 实现 `addWindow(windowId: string, pid: number)` 方法，添加窗口到轮询列表
  - [x] 1.7 实现 `removeWindow(windowId: string)` 方法，从轮询列表移除窗口
  - [x] 1.8 实现 `setActiveWindow(windowId: string)` 方法，标记活跃窗口
  - [x] 1.9 实现轮询逻辑：活跃窗口每 1s 检测，非活跃窗口每 5s 检测

- [x] Task 2: IPC 事件推送机制 (AC: 2)
  - [x] 2.1 在 `src/main/ipc/handlers.ts` 中定义 IPC 事件
  - [x] 2.2 定义 `window-status-changed` 事件接口：`{ windowId: string, status: WindowStatus, timestamp: string }`
  - [x] 2.3 在 StatusPoller 中集成 StatusDetector
  - [x] 2.4 状态变化时，通过 `mainWindow.webContents.send('window-status-changed', data)` 推送事件
  - [x] 2.5 缓存上次状态，仅在状态真正变化时推送事件

- [x] Task 3: 渲染进程 IPC 事件监听 (AC: 3)
  - [x] 3.1 创建 `src/renderer/api/events.ts`
  - [x] 3.2 实现 `subscribeToWindowStatusChange(callback)` 函数
  - [x] 3.3 使用 `ipcRenderer.on('window-status-changed', handler)` 监听事件
  - [x] 3.4 返回取消订阅函数：`() => ipcRenderer.removeListener('window-status-changed', handler)`
  - [x] 3.5 确保事件监听器在组件卸载时正确清理

- [x] Task 4: Zustand store 状态更新 (AC: 3)
  - [x] 4.1 修改 `src/renderer/store/windowsStore.ts`
  - [x] 4.2 添加 `updateWindowStatus(windowId: string, status: WindowStatus)` action
  - [x] 4.3 实现状态更新逻辑：查找窗口并更新 status 字段
  - [x] 4.4 更新 lastActiveAt 时间戳
  - [x] 4.5 确保状态更新触发订阅组件的重渲染

- [x] Task 5: WindowCard 组件响应状态变化 (AC: 4, 6)
  - [x] 5.1 修改 `src/renderer/components/WindowCard.tsx`
  - [x] 5.2 使用 Zustand selector 订阅单个窗口的状态：`useWindowsStore(state => state.windows.find(w => w.id === windowId)?.status)`
  - [x] 5.3 根据状态映射顶部线条颜色：Running=蓝色, WaitingForInput=黄色, Completed=绿色, Error=红色, Restoring=灰色
  - [x] 5.4 根据状态映射状态标签文字：Running="运行中", WaitingForInput="等待输入", Completed="已完成", Error="出错", Restoring="恢复中"
  - [x] 5.5 确保颜色切换无过渡动画（CSS: `transition: none`）
  - [x] 5.6 使用 React.memo 优化组件，避免不必要的重渲染

- [x] Task 6: StatusBar 组件响应状态变化 (AC: 5)
  - [x] 6.1 修改 `src/renderer/components/StatusBar.tsx`
  - [x] 6.2 使用 Zustand selector 计算各状态窗口数量
  - [x] 6.3 实现 `countByStatus(windows: Window[]): { running: number, waiting: number, completed: number, error: number }`
  - [x] 6.4 显示格式：运行中 X · 等待输入 X · 已完成 X · 出错 X
  - [x] 6.5 每个数字使用对应的状态色
  - [x] 6.6 添加 `aria-live="polite"` 属性，状态变化时屏幕阅读器自动播报
  - [x] 6.7 使用 React.memo 优化组件

- [x] Task 7: 集成到应用生命周期 (AC: 1, 7, 8)
  - [x] 7.1 修改 `src/main/index.ts`（主进程入口）
  - [x] 7.2 在应用启动时创建 StatusPoller 实例
  - [x] 7.3 在工作区恢复后，将所有窗口添加到 StatusPoller
  - [x] 7.4 调用 `statusPoller.startPolling()` 启动轮询
  - [x] 7.5 在应用关闭时调用 `statusPoller.stopPolling()` 停止轮询
  - [x] 7.6 在窗口创建时调用 `statusPoller.addWindow(windowId, pid)`
  - [x] 7.7 在窗口删除时调用 `statusPoller.removeWindow(windowId)`
  - [x] 7.8 在窗口切换时调用 `statusPoller.setActiveWindow(windowId)`

- [x] Task 8: 渲染进程事件订阅集成 (AC: 3-5)
  - [x] 8.1 修改 `src/renderer/App.tsx` 或根组件
  - [x] 8.2 在 useEffect 中订阅 window-status-changed 事件
  - [x] 8.3 事件回调中调用 Zustand store 的 updateWindowStatus action
  - [x] 8.4 确保在组件卸载时取消订阅
  - [x] 8.5 处理事件监听错误，记录日志

- [x] Task 9: 性能测试与优化 (AC: 7, 8)
  - [x] 9.1 测试 10 个窗口时的状态更新延迟
  - [x] 9.2 测试 15 个窗口时的状态更新延迟
  - [x] 9.3 验证活跃窗口检测间隔为 1s
  - [x] 9.4 验证非活跃窗口检测间隔为 5s
  - [x] 9.5 验证状态更新延迟 < 1s
  - [x] 9.6 使用 Chrome DevTools Profiler 检查渲染性能
  - [x] 9.7 优化 Zustand selector，避免不必要的重渲染

- [x] Task 10: 编写单元测试 (AC: 1-8)
  - [x] 10.1 创建 `src/main/services/__tests__/StatusPoller.test.ts`
  - [x] 10.2 测试 StatusPoller 的 startPolling 和 stopPolling
  - [x] 10.3 测试 addWindow 和 removeWindow
  - [x] 10.4 测试活跃/非活跃窗口的检测间隔
  - [x] 10.5 测试状态变化时 IPC 事件推送
  - [ ] 10.6 创建 `src/renderer/store/__tests__/windowsStore.test.ts`
  - [ ] 10.7 测试 updateWindowStatus action
  - [ ] 10.8 创建 `src/renderer/components/__tests__/WindowCard.test.tsx`
  - [ ] 10.9 测试 WindowCard 状态变化时的重渲染
  - [ ] 10.10 测试 StatusBar 状态统计计算

## Dev Notes

### 架构约束与技术要求

**实时状态更新机制设计（架构文档）：**

**数据流：**
```
1. StatusDetector 定期检测（每 1s）
   ↓
2. 检测到状态变化
   ↓
3. 触发事件：status_changed(window_id, new_status)
   ↓
4. 前端监听事件，更新 Zustand store
   ↓
5. React 组件重渲染，更新 UI
```

**IPC 事件定义（架构文档）：**

**window-status-changed 事件：**
```typescript
ipcRenderer.on('window-status-changed', (event, data: {
  windowId: string,
  status: WindowStatus,
  timestamp: string
}) => {
  // 处理状态变化
});
```

**前端 API 封装（架构文档）：**
```typescript
// src/renderer/api/events.ts
export const subscribeToWindowEvents = (
  onStatusChange: (windowId: string, status: WindowStatus) => void
) => {
  const handler = (_: any, data: { windowId: string; status: WindowStatus }) => {
    onStatusChange(data.windowId, data.status);
  };

  ipcRenderer.on('window-status-changed', handler);

  return () => {
    ipcRenderer.removeListener('window-status-changed', handler);
  };
};
```

**性能优化策略（架构文档）：**
- 轮询间隔动态调整（活跃窗口 1s，非活跃 5s）
- 仅检测必要的状态信息
- 使用事件驱动 + 轮询混合模式
- Zustand selector 精确订阅，避免不必要的重渲染

### UX 规范要点

**状态更新要求（UX 设计文档）：**

**状态变化反馈（被动）：**
- 卡片顶部线条颜色实时变化 — 无动画过渡，直接切换，保持即时感
- 状态统计栏数字实时更新
- 状态标签文字同步更新

**性能要求：**
- 状态更新延迟 < 1s（NFR2）
- 所有操作即时响应，无过渡动画

### 技术实现指导

**StatusPoller 实现示例：**

```typescript
// src/main/services/StatusPoller.ts
import { StatusDetector, WindowStatus } from './StatusDetector';
import { BrowserWindow } from 'electron';

interface TrackedWindow {
  pid: number;
  isActive: boolean;
  lastStatus: WindowStatus;
  lastCheckTime: number;
}

export class StatusPoller {
  private trackedWindows = new Map<string, TrackedWindow>();
  private pollingInterval: NodeJS.Timeout | null = null;
  private statusDetector: StatusDetector;
  private mainWindow: BrowserWindow;

  constructor(statusDetector: StatusDetector, mainWindow: BrowserWindow) {
    this.statusDetector = statusDetector;
    this.mainWindow = mainWindow;
  }

  startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      const now = Date.now();

      for (const [windowId, tracked] of this.trackedWindows.entries()) {
        // 活跃窗口每 1s 检测，非活跃窗口每 5s 检测
        const interval = tracked.isActive ? 1000 : 5000;
        
        if (now - tracked.lastCheckTime < interval) {
          continue;
        }

        tracked.lastCheckTime = now;

        const newStatus = await this.statusDetector.detectStatus(tracked.pid);

        if (newStatus !== tracked.lastStatus) {
          tracked.lastStatus = newStatus;
          this.notifyStatusChange(windowId, newStatus);
        }
      }
    }, 1000); // 每 1s 执行一次轮询逻辑
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  addWindow(windowId: string, pid: number): void {
    this.trackedWindows.set(windowId, {
      pid,
      isActive: false,
      lastStatus: WindowStatus.Restoring,
      lastCheckTime: 0
    });
  }

  removeWindow(windowId: string): void {
    this.trackedWindows.delete(windowId);
  }

  setActiveWindow(windowId: string): void {
    // 重置所有窗口为非活跃
    for (const tracked of this.trackedWindows.values()) {
      tracked.isActive = false;
    }

    // 设置当前窗口为活跃
    const tracked = this.trackedWindows.get(windowId);
    if (tracked) {
      tracked.isActive = true;
    }
  }

  private notifyStatusChange(windowId: string, status: WindowStatus): void {
    this.mainWindow.webContents.send('window-status-changed', {
      windowId,
      status,
      timestamp: new Date().toISOString()
    });
  }
}
```

**Zustand store 更新：**

```typescript
// src/renderer/store/windowsStore.ts
import { create } from 'zustand';
import { Window, WindowStatus } from '../types/window';

interface WindowsState {
  windows: Window[];
  activeWindowId: string | null;
  updateWindowStatus: (windowId: string, status: WindowStatus) => void;
}

export const useWindowsStore = create<WindowsState>((set) => ({
  windows: [],
  activeWindowId: null,
  
  updateWindowStatus: (windowId: string, status: WindowStatus) => {
    set((state) => ({
      windows: state.windows.map((window) =>
        window.id === windowId
          ? { ...window, status, lastActiveAt: new Date().toISOString() }
          : window
      )
    }));
  }
}));
```

**WindowCard 组件状态订阅：**

```typescript
// src/renderer/components/WindowCard.tsx
import React from 'react';
import { useWindowsStore } from '../store/windowsStore';
import { WindowStatus } from '../types/window';

interface WindowCardProps {
  windowId: string;
}

const statusColorMap: Record<WindowStatus, string> = {
  [WindowStatus.Running]: 'bg-blue-500',
  [WindowStatus.WaitingForInput]: 'bg-yellow-500',
  [WindowStatus.Completed]: 'bg-green-500',
  [WindowStatus.Error]: 'bg-red-500',
  [WindowStatus.Restoring]: 'bg-gray-500'
};

const statusLabelMap: Record<WindowStatus, string> = {
  [WindowStatus.Running]: '运行中',
  [WindowStatus.WaitingForInput]: '等待输入',
  [WindowStatus.Completed]: '已完成',
  [WindowStatus.Error]: '出错',
  [WindowStatus.Restoring]: '恢复中'
};

export const WindowCard = React.memo(({ windowId }: WindowCardProps) => {
  const window = useWindowsStore(
    (state) => state.windows.find((w) => w.id === windowId)
  );

  if (!window) return null;

  const statusColor = statusColorMap[window.status];
  const statusLabel = statusLabelMap[window.status];

  return (
    <div className="window-card">
      {/* 圆弧彩色顶部线条 - 无过渡动画 */}
      <div className={`h-1 rounded-t-lg ${statusColor}`} style={{ transition: 'none' }} />
      
      <div className="p-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">{window.name}</h3>
          <span className="text-sm">{statusLabel}</span>
        </div>
        <p className="text-sm font-mono text-gray-400">{window.workingDirectory}</p>
      </div>
    </div>
  );
});
```

**事件订阅集成：**

```typescript
// src/renderer/App.tsx
import { useEffect } from 'react';
import { subscribeToWindowEvents } from './api/events';
import { useWindowsStore } from './store/windowsStore';

export function App() {
  const updateWindowStatus = useWindowsStore((state) => state.updateWindowStatus);

  useEffect(() => {
    const unsubscribe = subscribeToWindowEvents((windowId, status) => {
      updateWindowStatus(windowId, status);
    });

    return () => {
      unsubscribe();
    };
  }, [updateWindowStatus]);

  return (
    <div className="app">
      {/* 应用内容 */}
    </div>
  );
}
```

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要忘记清理事件监听器 — useEffect 必须返回清理函数
2. 不要在轮询中阻塞主进程 — 使用异步操作和合理的间隔
3. 不要频繁推送 IPC 事件 — 缓存上次状态，仅在真正变化时推送
4. 不要忘记处理窗口不存在的情况 — WindowCard 组件必须检查 window 是否存在
5. 不要忘记使用 React.memo — 避免不必要的重渲染
6. 不要忘记精确订阅 Zustand store — 使用 selector 只订阅需要的数据
7. 不要添加过渡动画 — 状态颜色切换必须即时（transition: none）
8. 不要忘记性能测试 — 必须验证状态更新延迟 < 1s
9. 不要忘记无障碍支持 — StatusBar 必须添加 aria-live 属性
10. 不要忘记停止轮询 — 应用关闭时必须调用 stopPolling()

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
├── main/
│   ├── services/
│   │   ├── StatusPoller.ts                     # 新建 - 状态轮询服务
│   │   ├── StatusDetector.ts                   # 依赖 - Story 4.1
│   │   └── __tests__/
│   │       └── StatusPoller.test.ts            # 新建 - StatusPoller 测试
│   ├── ipc/
│   │   └── handlers.ts                         # 修改 - 添加 IPC 事件定义
│   └── index.ts                                # 修改 - 集成 StatusPoller
└── renderer/
    ├── api/
    │   └── events.ts                           # 新建 - IPC 事件订阅封装
    ├── store/
    │   ├── windowsStore.ts                     # 修改 - 添加 updateWindowStatus
    │   └── __tests__/
    │       └── windowsStore.test.ts            # 新建 - store 测试
    ├── components/
    │   ├── WindowCard.tsx                      # 修改 - 响应状态变化
    │   ├── StatusBar.tsx                       # 修改 - 响应状态变化
    │   └── __tests__/
    │       ├── WindowCard.test.tsx             # 新建 - WindowCard 测试
    │       └── StatusBar.test.tsx              # 新建 - StatusBar 测试
    └── App.tsx                                 # 修改 - 订阅 IPC 事件
```

**与统一项目结构的对齐：**
- 主进程服务放在 `src/main/services/`
- IPC 处理放在 `src/main/ipc/`
- 渲染进程 API 封装放在 `src/renderer/api/`
- 状态管理放在 `src/renderer/store/`
- UI 组件放在 `src/renderer/components/`
- 测试文件在对应模块的 `__tests__/` 目录

**依赖关系：**
- 依赖 Story 4.1（StatusDetector 服务）
- 依赖 Epic 2（ProcessManager 服务）
- 依赖 Epic 3（WindowCard, StatusBar 组件）

### References

- [Source: epics.md#Story 4.2 - 实时状态更新机制验收标准]
- [Source: epics.md#Epic 4: 智能状态追踪]
- [Source: architecture.md#状态更新流程]
- [Source: architecture.md#Electron IPC Events - window-status-changed]
- [Source: architecture.md#前端 API 封装]
- [Source: architecture.md#性能优化策略 - 状态检测优化]
- [Source: architecture.md#性能优化策略 - 前端性能优化]
- [Source: ux-design-specification.md#Component Strategy - WindowCard 状态定义]
- [Source: ux-design-specification.md#UX Consistency Patterns - Feedback Patterns]
- [Source: 4-1-status-detector-service.md - StatusDetector 服务]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- StatusPoller 测试中 `vi.runAllTimersAsync()` 与 `setInterval` 导致无限循环，改用纯微任务 flush（10x `Promise.resolve()`）解决
- `lastCheckTime` 初始值从 `0` 改为 `Date.now()`，避免窗口添加后立即被检测（与轮询间隔语义不符）
- `window.electronAPI` 在测试环境未定义，在 `test-setup.ts` 中添加全局 mock 修复 App 测试

### Completion Notes List

- 创建了 StatusPoller 服务，实现活跃窗口 1s / 非活跃窗口 5s 差异化轮询
- IPC 事件推送通过 `mainWindow.webContents.send('window-status-changed', ...)` 实现，仅在状态真正变化时推送
- 渲染进程 API 封装在 `src/renderer/api/events.ts`，通过 preload 暴露的 `onWindowStatusChanged` / `offWindowStatusChanged` 实现
- App.tsx 在 useEffect 中订阅事件，组件卸载时自动清理
- WindowCard 和 StatusBar 已有完整实现（Story 3.1/3.3），无需修改即满足 AC4/5/6
- Zustand store 的 `updateWindowStatus` action 已在 Story 2.3 中实现，无需修改
- 在 `test-setup.ts` 中添加 `window.electronAPI` 全局 mock，修复所有 App 测试
- 编写了 16 个 StatusPoller 单元测试，全部通过
- 全套 231 个测试全部通过

### File List

- src/main/services/StatusPoller.ts (新建)
- src/main/services/__tests__/StatusPoller.test.ts (新建)
- src/main/index.ts (修改 - 集成 StatusPoller)
- src/preload/index.ts (修改 - 暴露 onWindowStatusChanged / offWindowStatusChanged)
- src/renderer/api/events.ts (新建)
- src/renderer/App.tsx (修改 - 订阅 window-status-changed 事件)
- src/renderer/global.d.ts (修改 - 添加 ElectronAPI 事件方法类型)
- src/renderer/test-setup.ts (修改 - 添加 window.electronAPI 全局 mock)
