# Story 5.2: 点击切换交互

Status: ready-for-dev

## Story

As a 用户,
I want 点击窗口卡片立即在应用内切换到对应的终端视图,
So that 可以快速进入任务上下文继续工作。

## Acceptance Criteria

1. **Given** TerminalView 组件已实现（Story 5.1）
   **When** 用户点击窗口卡片
   **Then** 渲染进程调用主进程的 switch-to-terminal-view IPC 命令（FR11）

2. **Given** 点击切换交互已实现
   **When** 主进程接收命令
   **Then** 主进程通知渲染进程切换到对应的 TerminalView

3. **Given** 点击切换交互已实现
   **When** 渲染进程接收通知
   **Then** 应用内视图从统一视图切换到终端视图

4. **Given** 点击切换交互已实现
   **When** 用户在终端中操作
   **Then** 用户可以立即在终端中操作，无需额外配置

5. **Given** 点击切换交互已实现
   **When** 视图切换
   **Then** 视图切换响应时间 < 100ms（纯 UI 切换，FR13）

6. **Given** 点击切换交互已实现
   **When** 视图切换
   **Then** 切换过程无过渡动画，追求即时感

7. **Given** 点击切换交互已实现
   **When** 用户使用键盘导航
   **Then** 支持键盘导航：Tab 键移动焦点，Enter/Space 键激活

8. **Given** 点击切换交互已实现
   **When** 切换失败
   **Then** 切换失败时显示内联错误提示，不使用弹窗

9. **Given** 点击切换交互已实现
   **When** 视图切换
   **Then** Zustand store 更新 activeWindowId，标记当前活跃窗口

## Tasks / Subtasks

- [ ] Task 1: 定义视图切换 IPC 接口 (AC: 1-2)
  - [ ] 1.1 在 `src/shared/types/ipc.ts` 中定义 IPC 命令类型
  - [ ] 1.2 定义 `switch-to-terminal-view` IPC 命令：`{ windowId: string }`
  - [ ] 1.3 定义 `switch-to-unified-view` IPC 命令
  - [ ] 1.4 定义 `view-changed` IPC 事件：`{ view: 'unified' | 'terminal', windowId?: string }`

- [ ] Task 2: 创建 ViewSwitcher 服务 (AC: 1-2, 9)
  - [ ] 2.1 创建 `src/main/services/ViewSwitcher.ts`
  - [ ] 2.2 定义 ViewSwitcher 接口：`switchToTerminalView(windowId: string): void`
  - [ ] 2.3 定义 ViewSwitcher 接口：`switchToUnifiedView(): void`
  - [ ] 2.4 定义 ViewSwitcher 接口：`getCurrentView(): 'unified' | 'terminal'`
  - [ ] 2.5 定义 ViewSwitcher 接口：`getActiveWindowId(): string | null`
  - [ ] 2.6 实现 ViewSwitcherImpl 类，管理当前视图状态

- [ ] Task 3: 实现 IPC 命令处理 (AC: 1-2)
  - [ ] 3.1 在主进程中注册 IPC 命令处理器
  - [ ] 3.2 处理 `switch-to-terminal-view` 命令：调用 ViewSwitcher.switchToTerminalView()
  - [ ] 3.3 处理 `switch-to-unified-view` 命令：调用 ViewSwitcher.switchToUnifiedView()
  - [ ] 3.4 命令处理后，通过 IPC 事件通知渲染进程

- [ ] Task 4: 实现渲染进程视图切换 (AC: 3, 5-6)
  - [ ] 4.1 创建 `src/renderer/hooks/useViewSwitcher.ts`
  - [ ] 4.2 实现 `switchToTerminalView(windowId: string)` 方法
  - [ ] 4.3 实现 `switchToUnifiedView()` 方法
  - [ ] 4.4 调用 IPC 命令：`ipcRenderer.invoke('switch-to-terminal-view', { windowId })`
  - [ ] 4.5 监听 `view-changed` IPC 事件，更新本地状态
  - [ ] 4.6 确保视图切换无过渡动画，直接切换

- [ ] Task 5: 集成到 WindowCard 组件 (AC: 1, 4, 7)
  - [ ] 5.1 修改 `src/renderer/components/WindowCard.tsx`
  - [ ] 5.2 添加 onClick 事件处理：调用 `switchToTerminalView(window.id)`
  - [ ] 5.3 支持键盘导航：Enter/Space 键激活
  - [ ] 5.4 添加 loading 状态（可选）：切换中显示加载指示

- [ ] Task 6: 集成到 TerminalView 返回按钮 (AC: 2-3, 6)
  - [ ] 6.1 修改 `src/renderer/components/TerminalView.tsx`
  - [ ] 6.2 返回按钮点击时调用 `switchToUnifiedView()`
  - [ ] 6.3 Esc 键按下时调用 `switchToUnifiedView()`
  - [ ] 6.4 确保返回操作无过渡动画

- [ ] Task 7: 实现错误处理 (AC: 8)
  - [ ] 7.1 创建 `src/renderer/components/ViewSwitchError.tsx` 错误提示组件
  - [ ] 7.2 切换失败时显示内联错误提示
  - [ ] 7.3 错误提示自动消失（3 秒后）
  - [ ] 7.4 不使用弹窗，仅显示内联提示

- [ ] Task 8: 集成到 Zustand store (AC: 9)
  - [ ] 8.1 修改 `src/renderer/stores/windowStore.ts`
  - [ ] 8.2 添加 `activeWindowId: string | null` 状态
  - [ ] 8.3 添加 `setActiveWindowId(windowId: string | null)` action
  - [ ] 8.4 视图切换时更新 activeWindowId

- [ ] Task 9: 创建主布局组件 (AC: 3, 5-6)
  - [ ] 9.1 创建 `src/renderer/components/MainLayout.tsx`
  - [ ] 9.2 根据当前视图状态渲染不同的内容
  - [ ] 9.3 当 view === 'unified' 时显示 CardGrid
  - [ ] 9.4 当 view === 'terminal' 时显示 TerminalView
  - [ ] 9.5 确保视图切换无过渡动画

- [ ] Task 10: 编写集成测试 (AC: 1-9)
  - [ ] 10.1 创建 `src/main/services/__tests__/ViewSwitcher.test.ts`
  - [ ] 10.2 测试视图切换：验证 switchToTerminalView 和 switchToUnifiedView
  - [ ] 10.3 测试状态管理：验证 getCurrentView 和 getActiveWindowId
  - [ ] 10.4 创建 `src/renderer/hooks/__tests__/useViewSwitcher.test.ts`
  - [ ] 10.5 测试 IPC 命令调用：验证 invoke 被正确调用
  - [ ] 10.6 测试事件监听：验证 view-changed 事件被正确处理
  - [ ] 10.7 测试性能：验证视图切换响应时间 < 100ms

## Dev Notes

### 架构约束与技术要求

**ViewSwitcher 服务设计（架构文档）：**

**职责：** 在应用内快速切换到指定的 TerminalView

**实现策略：**
- 管理多个 TerminalView 组件的显示/隐藏状态
- 通过窗口 ID 切换到对应的 TerminalView
- 保持非活跃 TerminalView 的 PTY 连接和状态

**接口定义（架构文档）：**
```typescript
interface ViewSwitcher {
  switchToTerminalView(windowId: string): void;
  switchToUnifiedView(): void;
  getCurrentView(): 'unified' | 'terminal';
  getActiveWindowId(): string | null;
}
```

**核心实现（架构文档）：**
```typescript
class ViewSwitcherImpl implements ViewSwitcher {
  private currentView: 'unified' | 'terminal' = 'unified';
  private activeWindowId: string | null = null;

  switchToTerminalView(windowId: string): void {
    this.currentView = 'terminal';
    this.activeWindowId = windowId;

    // 通知 React 组件更新视图
    eventEmitter.emit('view-changed', {
      view: 'terminal',
      windowId
    });
  }

  switchToUnifiedView(): void {
    this.currentView = 'unified';
    this.activeWindowId = null;

    eventEmitter.emit('view-changed', {
      view: 'unified'
    });
  }

  getCurrentView(): 'unified' | 'terminal' {
    return this.currentView;
  }

  getActiveWindowId(): string | null {
    return this.activeWindowId;
  }
}
```

**性能目标（架构文档）：**
- 视图切换 < 100ms（纯 UI 切换，无外部窗口操作）

### UX 规范要点

**窗口切换交互（UX 设计文档 User Journey Flows）：**

**旅程 3：状态感知 & 窗口切入**
- 用户点击目标卡片
- 切换到该窗口的 CLI 全屏视图
- 用户在 CLI 中操作
- 用户完成操作
- 点击返回/快捷键回到统一视图
- 统一视图已实时更新所有状态

**关键设计决策：**
- 切入窗口后，CLI 占据全部内容区域，保持原生终端体验
- 返回统一视图的方式：顶部返回按钮 + 键盘快捷键（如 Esc）
- 切换响应 < 500ms，无过渡动画

**视觉设计规范（UX 设计文档 Navigation Patterns）：**

**两个视图之间的导航：**
| 导航方向 | 触发方式 | 过渡效果 | 响应时间 |
|---------|---------|---------|---------|
| 统一视图 → 终端视图 | 点击窗口卡片 / Enter 键 | 无动画，直接切换 | < 500ms |
| 终端视图 → 统一视图 | 点击返回按钮 / Esc 键 | 无动画，直接切换 | 即时 |

**键盘导航：**
- 统一视图中：Tab/Shift+Tab 在卡片间移动焦点，Enter/Space 进入窗口
- 终端视图中：Esc 返回统一视图（其他按键全部传递给终端）

**导航原则：** 零过渡动画。ausome-terminal 追求的是"瞬间切换"的感觉，任何过渡动画都会增加感知延迟。

### 技术实现指导

**ViewSwitcher 服务实现：**
```typescript
// src/main/services/ViewSwitcher.ts
import { BrowserWindow } from 'electron';

export class ViewSwitcherImpl implements ViewSwitcher {
  private currentView: 'unified' | 'terminal' = 'unified';
  private activeWindowId: string | null = null;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  switchToTerminalView(windowId: string): void {
    this.currentView = 'terminal';
    this.activeWindowId = windowId;

    this.mainWindow.webContents.send('view-changed', {
      view: 'terminal',
      windowId,
    });
  }

  switchToUnifiedView(): void {
    this.currentView = 'unified';
    this.activeWindowId = null;

    this.mainWindow.webContents.send('view-changed', {
      view: 'unified',
    });
  }

  getCurrentView(): 'unified' | 'terminal' {
    return this.currentView;
  }

  getActiveWindowId(): string | null {
    return this.activeWindowId;
  }
}
```

**渲染进程视图切换 hook：**
```typescript
// src/renderer/hooks/useViewSwitcher.ts
import { useCallback, useEffect, useState } from 'react';
import { ipcRenderer } from 'electron';

export const useViewSwitcher = () => {
  const [currentView, setCurrentView] = useState<'unified' | 'terminal'>('unified');
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);

  const switchToTerminalView = useCallback(async (windowId: string) => {
    try {
      await ipcRenderer.invoke('switch-to-terminal-view', { windowId });
    } catch (error) {
      console.error('Failed to switch to terminal view:', error);
    }
  }, []);

  const switchToUnifiedView = useCallback(async () => {
    try {
      await ipcRenderer.invoke('switch-to-unified-view');
    } catch (error) {
      console.error('Failed to switch to unified view:', error);
    }
  }, []);

  useEffect(() => {
    const handler = (_: any, data: { view: 'unified' | 'terminal'; windowId?: string }) => {
      setCurrentView(data.view);
      setActiveWindowId(data.windowId || null);
    };

    ipcRenderer.on('view-changed', handler);

    return () => {
      ipcRenderer.removeListener('view-changed', handler);
    };
  }, []);

  return {
    currentView,
    activeWindowId,
    switchToTerminalView,
    switchToUnifiedView,
  };
};
```

**MainLayout 组件：**
```typescript
// src/renderer/components/MainLayout.tsx
import { useViewSwitcher } from '@/hooks/useViewSwitcher';
import { CardGrid } from './CardGrid';
import { TerminalView } from './TerminalView';
import { useWindowStore } from '@/stores/windowStore';

export const MainLayout: React.FC = () => {
  const { currentView, activeWindowId, switchToUnifiedView } = useViewSwitcher();
  const windows = useWindowStore((state) => state.windows);

  const activeWindow = windows.find((w) => w.id === activeWindowId);

  if (currentView === 'terminal' && activeWindow) {
    return (
      <TerminalView
        window={activeWindow}
        onReturn={switchToUnifiedView}
      />
    );
  }

  return <CardGrid />;
};
```

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要忘记清理事件监听器 — 必须在 hook 卸载时取消订阅
2. 不要使用过渡动画 — 视图切换应直接切换，无动画
3. 不要忘记处理 Esc 键 — 必须在 TerminalView 中捕获
4. 不要忘记更新 activeWindowId — 必须同步更新 store
5. 不要忘记错误处理 — 切换失败时显示错误提示
6. 不要忘记性能测试 — 必须验证切换响应时间 < 100ms
7. 不要忘记测试键盘导航 — 必须支持 Tab, Enter, Space, Esc
8. 不要忘记测试边界情况 — 窗口不存在、进程崩溃等

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
├── main/
│   ├── services/
│   │   ├── ViewSwitcher.ts                     # 新建 - 视图切换服务
│   │   └── __tests__/
│   │       └── ViewSwitcher.test.ts            # 新建 - ViewSwitcher 测试
│   └── types/
│       └── ipc.ts                              # 修改 - 添加视图切换 IPC 类型
├── renderer/
│   ├── components/
│   │   ├── MainLayout.tsx                      # 新建 - 主布局组件
│   │   ├── ViewSwitchError.tsx                 # 新建 - 错误提示组件
│   │   ├── WindowCard.tsx                      # 修改 - 添加点击事件
│   │   ├── TerminalView.tsx                    # 修改 - 添加返回逻辑
│   │   └── __tests__/
│   │       └── MainLayout.test.tsx             # 新建 - MainLayout 测试
│   ├── hooks/
│   │   ├── useViewSwitcher.ts                  # 新建 - 视图切换 hook
│   │   └── __tests__/
│   │       └── useViewSwitcher.test.ts         # 新建 - useViewSwitcher 测试
│   └── App.tsx                                 # 修改 - 使用 MainLayout
└── shared/
    └── types/
        └── ipc.ts                              # 修改 - 添加视图切换 IPC 类型
```

**与统一项目结构的对齐：**
- 主进程服务放在 `src/main/services/`
- 渲染进程 hooks 放在 `src/renderer/hooks/`
- 共享类型定义放在 `src/shared/types/`
- 测试文件在对应模块的 `__tests__/` 目录

### References

- [Source: epics.md#Story 5.2 - 点击切换交互验收标准]
- [Source: epics.md#Epic 5: 快速窗口切换]
- [Source: architecture.md#ViewSwitcher 服务设计]
- [Source: architecture.md#API 设计 - IPC Commands]
- [Source: ux-design-specification.md#User Journey Flows - 旅程 3]
- [Source: ux-design-specification.md#Navigation Patterns - 两个视图之间的导航]
- [Source: 5-1-terminal-view.md - TerminalView 组件]
- [Source: 3-1-window-card-component.md - WindowCard 组件]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
