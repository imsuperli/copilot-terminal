# Story 2.3: 窗口列表状态管理

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发者,
I want 使用 Zustand 管理窗口列表状态,
So that 前端可以响应式地展示和更新窗口信息。

## Acceptance Criteria

1. **Given** 窗口创建功能已实现（Story 2.2）
   **When** 实现 Zustand store
   **Then** store 包含 windows 数组，存储所有窗口对象（FR2）

2. **Given** Zustand store 已实现
   **When** 窗口对象被创建
   **Then** 每个窗口对象包含：id, name, workingDirectory, command, status, pid, createdAt, lastActiveAt

3. **Given** Zustand store 已实现
   **When** 需要添加新窗口
   **Then** 提供 addWindow 方法添加新窗口

4. **Given** Zustand store 已实现
   **When** 需要删除窗口
   **Then** 提供 removeWindow 方法删除窗口

5. **Given** Zustand store 已实现
   **When** 需要更新窗口状态
   **Then** 提供 updateWindowStatus 方法更新窗口状态

6. **Given** Zustand store 已实现
   **When** 需要设置活跃窗口
   **Then** 提供 setActiveWindow 方法设置当前活跃窗口

7. **Given** Zustand store 已实现
   **When** store 状态发生变化
   **Then** 前端组件可以订阅 store 变化并自动重渲染

## Tasks / Subtasks

- [ ] Task 1: 安装 Zustand 依赖 (AC: 1)
  - [ ] 1.1 安装 zustand@4.x 核心库
  - [ ] 1.2 验证依赖安装成功
  - [ ] 1.3 确认 Zustand 与 React 18.x 兼容

- [ ] Task 2: 定义窗口相关类型 (AC: 2)
  - [ ] 2.1 创建 `src/renderer/types/window.ts`
  - [ ] 2.2 定义 Window 接口（id, name, workingDirectory, command, status, pid, createdAt, lastActiveAt）
  - [ ] 2.3 定义 WindowStatus 枚举（running, waiting, completed, error, restoring）
  - [ ] 2.4 导出所有类型供其他模块使用

- [ ] Task 3: 实现 Zustand 窗口状态 Store (AC: 1, 3, 4, 5, 6, 7)
  - [ ] 3.1 创建 `src/renderer/stores/windowStore.ts`
  - [ ] 3.2 定义 WindowStore 接口（windows, activeWindowId, actions）
  - [ ] 3.3 实现 addWindow 方法 - 添加新窗口到 windows 数组
  - [ ] 3.4 实现 removeWindow 方法 - 从 windows 数组中删除指定窗口
  - [ ] 3.5 实现 updateWindowStatus 方法 - 更新指定窗口的状态
  - [ ] 3.6 实现 setActiveWindow 方法 - 设置当前活跃窗口 ID
  - [ ] 3.7 实现 getWindowById 辅助方法 - 根据 ID 查找窗口
  - [ ] 3.8 实现 getWindowsByStatus 辅助方法 - 根据状态筛选窗口
  - [ ] 3.9 使用 immer 中间件确保不可变更新
  - [ ] 3.10 添加 TypeScript 类型推导支持

- [ ] Task 4: 实现 Store Selectors (AC: 7)
  - [ ] 4.1 创建 `src/renderer/stores/selectors.ts`
  - [ ] 4.2 实现 selectAllWindows selector - 获取所有窗口
  - [ ] 4.3 实现 selectActiveWindow selector - 获取当前活跃窗口
  - [ ] 4.4 实现 selectWindowsByStatus selector - 按状态筛选窗口
  - [ ] 4.5 实现 selectWindowCount selector - 获取窗口总数
  - [ ] 4.6 实现 selectStatusCounts selector - 获取各状态窗口数量统计

- [ ] Task 5: 编写单元测试 (AC: 1-7)
  - [ ] 5.1 创建 `src/renderer/stores/__tests__/windowStore.test.ts`
  - [ ] 5.2 测试 addWindow 方法 - 验证窗口正确添加
  - [ ] 5.3 测试 removeWindow 方法 - 验证窗口正确删除
  - [ ] 5.4 测试 updateWindowStatus 方法 - 验证状态正确更新
  - [ ] 5.5 测试 setActiveWindow 方法 - 验证活跃窗口正确设置
  - [ ] 5.6 测试 store 订阅机制 - 验证状态变化触发重渲染
  - [ ] 5.7 测试边界情况 - 删除不存在的窗口、更新不存在的窗口等

- [ ] Task 6: 创建示例组件验证 Store 集成 (AC: 7)
  - [ ] 6.1 创建 `src/renderer/components/WindowList.tsx` 示例组件
  - [ ] 6.2 使用 useWindowStore hook 订阅 windows 状态
  - [ ] 6.3 渲染窗口列表，验证响应式更新
  - [ ] 6.4 添加测试按钮触发 addWindow/removeWindow 操作
  - [ ] 6.5 验证组件在状态变化时自动重渲染

## Dev Notes

### 架构约束与技术要求

**前置依赖（必须已实现）：**
- Story 1.2: React + TypeScript 前端框架（React 18.x, TypeScript 5.x, Vite 5.x）
- Story 2.1: ProcessManager 服务（提供进程管理基础）
- Story 2.2: 创建新任务窗口（提供窗口创建流程，但 Zustand store 在本 Story 中实现）

**技术栈要求 [Source: architecture.md#技术栈总结]：**
- 状态管理: Zustand 4.x
- 前端框架: React 18.x + TypeScript 5.x
- 构建工具: Vite 5.x
- 测试框架: Jest + React Testing Library

**Zustand 版本与特性 [Source: architecture.md#状态管理]：**
- Zustand 4.x（最新稳定版）
- 轻量级（~1KB），无需 Provider 包裹
- 基于订阅模式，精确更新
- 完整 TypeScript 类型推导
- 支持 immer 中间件实现不可变更新
- 支持 selector 优化，避免不必要的重渲染

**Zustand Store 结构规范 [Source: architecture.md#状态管理]：**
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
  name: string;                  // 窗口名称（用户可自定义）
  workingDirectory: string;      // 工作目录路径
  command: string;               // 启动命令（如 "claude"）
  status: WindowStatus;          // 当前状态
  pid: number | null;            // 进程 PID
  createdAt: string;             // 创建时间（ISO 8601）
  lastActiveAt: string;          // 最后活跃时间
  model?: string;                // 使用的 AI 模型（如 "Claude Opus 4.6"）
  lastOutput?: string;           // 最新输出摘要（前 100 字符）
}

enum WindowStatus {
  Running = 'running',           // 运行中
  WaitingForInput = 'waiting',   // 等待输入
  Completed = 'completed',       // 已完成
  Error = 'error',               // 出错
  Restoring = 'restoring'        // 恢复中（启动时）
}
```

**性能要求 [Source: architecture.md#性能优化策略]：**
- 使用 Zustand selector 精确订阅，避免不必要的重渲染
- 批量更新状态（React 18 自动批处理）
- 避免频繁的全局状态更新
- 15+ 窗口时 UI 操作无明显卡顿（NFR4）

**项目结构规范：**
```
src/renderer/
├── stores/
│   ├── windowStore.ts              # Zustand 窗口状态管理 (新建)
│   ├── selectors.ts                # Store selectors (新建)
│   └── __tests__/
│       └── windowStore.test.ts     # 单元测试 (新建)
├── types/
│   └── window.ts                   # Window 和 WindowStatus 类型定义 (新建)
└── components/
    └── WindowList.tsx              # 示例组件验证 Store 集成 (新建)
```

### 关键实现细节

**Window 类型定义 (src/renderer/types/window.ts):**
```typescript
// 窗口状态枚举
export enum WindowStatus {
  Running = 'running',
  WaitingForInput = 'waiting',
  Completed = 'completed',
  Error = 'error',
  Restoring = 'restoring'
}

// 窗口接口
export interface Window {
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

**Zustand Store 实现 (src/renderer/stores/windowStore.ts):**
```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Window, WindowStatus } from '../types/window';

interface WindowStore {
  // 状态
  windows: Window[];
  activeWindowId: string | null;

  // Actions
  addWindow: (window: Window) => void;
  removeWindow: (id: string) => void;
  updateWindowStatus: (id: string, status: WindowStatus) => void;
  setActiveWindow: (id: string) => void;

  // 辅助方法
  getWindowById: (id: string) => Window | undefined;
  getWindowsByStatus: (status: WindowStatus) => Window[];
}

export const useWindowStore = create<WindowStore>()(
  immer((set, get) => ({
    // 初始状态
    windows: [],
    activeWindowId: null,

    // 添加窗口
    addWindow: (window) => set((state) => {
      state.windows.push(window);
    }),

    // 删除窗口
    removeWindow: (id) => set((state) => {
      state.windows = state.windows.filter(w => w.id !== id);
      if (state.activeWindowId === id) {
        state.activeWindowId = null;
      }
    }),

    // 更新窗口状态
    updateWindowStatus: (id, status) => set((state) => {
      const window = state.windows.find(w => w.id === id);
      if (window) {
        window.status = status;
        window.lastActiveAt = new Date().toISOString();
      }
    }),

    // 设置活跃窗口
    setActiveWindow: (id) => set((state) => {
      state.activeWindowId = id;
      const window = state.windows.find(w => w.id === id);
      if (window) {
        window.lastActiveAt = new Date().toISOString();
      }
    }),

    // 根据 ID 查找窗口
    getWindowById: (id) => {
      return get().windows.find(w => w.id === id);
    },

    // 根据状态筛选窗口
    getWindowsByStatus: (status) => {
      return get().windows.filter(w => w.status === status);
    },
  }))
);
```

**Selectors 实现 (src/renderer/stores/selectors.ts):**
```typescript
import { WindowStore } from './windowStore';
import { WindowStatus } from '../types/window';

// 获取所有窗口
export const selectAllWindows = (state: WindowStore) => state.windows;

// 获取当前活跃窗口
export const selectActiveWindow = (state: WindowStore) => {
  if (!state.activeWindowId) return null;
  return state.windows.find(w => w.id === state.activeWindowId) || null;
};

// 按状态筛选窗口
export const selectWindowsByStatus = (status: WindowStatus) => (state: WindowStore) => {
  return state.windows.filter(w => w.status === status);
};

// 获取窗口总数
export const selectWindowCount = (state: WindowStore) => state.windows.length;

// 获取各状态窗口数量统计
export const selectStatusCounts = (state: WindowStore) => {
  const counts = {
    running: 0,
    waiting: 0,
    completed: 0,
    error: 0,
    restoring: 0,
  };

  state.windows.forEach(w => {
    counts[w.status]++;
  });

  return counts;
};
```

**示例组件使用 (src/renderer/components/WindowList.tsx):**
```typescript
import React from 'react';
import { useWindowStore } from '../stores/windowStore';
import { selectAllWindows, selectStatusCounts } from '../stores/selectors';

export const WindowList: React.FC = () => {
  // 使用 selector 精确订阅
  const windows = useWindowStore(selectAllWindows);
  const statusCounts = useWindowStore(selectStatusCounts);
  const addWindow = useWindowStore(state => state.addWindow);
  const removeWindow = useWindowStore(state => state.removeWindow);

  return (
    <div>
      <h2>窗口列表 ({windows.length})</h2>
      <div>
        运行中: {statusCounts.running} |
        等待输入: {statusCounts.waiting} |
        已完成: {statusCounts.completed} |
        出错: {statusCounts.error}
      </div>
      <ul>
        {windows.map(window => (
          <li key={window.id}>
            {window.name} - {window.status}
            <button onClick={() => removeWindow(window.id)}>删除</button>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

### 常见陷阱与注意事项

**🚨 Zustand Immer 中间件使用陷阱：**
- ✅ 使用 immer 中间件确保不可变更新，避免直接修改状态
- ✅ 在 set 函数中可以直接修改 state（immer 会自动处理）
- ✅ 使用 `state.windows.push(window)` 而非 `state.windows = [...state.windows, window]`
- ❌ 不要在 immer 中返回新对象 — 直接修改 draft state
- ❌ 不要混用 immer 和手动不可变更新

**🚨 Selector 性能优化陷阱：**
- ✅ 使用 selector 精确订阅，只订阅需要的状态
- ✅ 避免在组件中订阅整个 store：`useWindowStore()` ❌
- ✅ 使用具名 selector：`useWindowStore(selectAllWindows)` ✅
- ✅ 对于复杂计算，使用 selector 缓存结果
- ❌ 不要在 selector 中创建新对象/数组 — 会导致每次都重渲染

**🚨 TypeScript 类型推导陷阱：**
- ✅ 使用 `create<WindowStore>()` 显式指定类型
- ✅ 使用 `immer` 中间件时需要双括号：`create<WindowStore>()(immer(...))`
- ✅ 确保所有 action 方法的参数和返回值类型正确
- ❌ 不要省略类型注解 — Zustand 的类型推导有限

**🚨 状态更新陷阱：**
- ✅ updateWindowStatus 更新状态时同时更新 lastActiveAt
- ✅ removeWindow 删除窗口时检查是否为活跃窗口，如果是则清空 activeWindowId
- ✅ setActiveWindow 设置活跃窗口时更新 lastActiveAt
- ❌ 不要忘记更新时间戳字段
- ❌ 不要在删除窗口后留下悬空的 activeWindowId

**🚨 数据一致性陷阱：**
- ✅ 窗口 ID 使用 UUID，确保唯一性
- ✅ 时间戳使用 ISO 8601 格式（`new Date().toISOString()`）
- ✅ 状态枚举值与架构文档保持一致
- ❌ 不要使用数组索引作为窗口 ID
- ❌ 不要使用 Date.now() 作为时间戳 — 使用 ISO 字符串

**🚨 测试陷阱：**
- ✅ 每个测试前重置 store 状态
- ✅ 测试边界情况：删除不存在的窗口、更新不存在的窗口
- ✅ 测试状态变化是否触发组件重渲染
- ❌ 不要在测试中直接修改 store 内部状态
- ❌ 不要忘记测试 selector 的正确性

### 与 Story 2.2 的集成关系

**Story 2.2 的依赖关系：**
- Story 2.2 的任务分解中提到了 Zustand store（Task 1），但实际实现在本 Story 中
- Story 2.2 需要等待本 Story 完成后才能完整实现窗口创建流程
- 本 Story 提供的 `addWindow` 方法将被 Story 2.2 的 CreateWindowDialog 调用

**集成流程：**
1. 本 Story 实现 Zustand store 和类型定义
2. Story 2.2 使用 `useWindowStore` hook 订阅状态
3. Story 2.2 的 CreateWindowDialog 调用 `addWindow` 添加新窗口
4. Story 2.2 的 WindowList 组件使用 selector 展示窗口列表

**注意事项：**
- 本 Story 完成后，Story 2.2 的 Task 1（实现 Zustand store）可以跳过
- 本 Story 的类型定义（Window, WindowStatus）将被 Story 2.2 复用
- 本 Story 的 selectors 将被后续 Story（3.1, 3.2, 3.3）复用

### 从前置故事学到的经验

**Story 2.1 (ProcessManager) 提供的基础：**
- ProcessManager 提供了进程管理能力（创建、监控、终止）
- 本 Story 的 Window 对象中的 pid 字段来自 ProcessManager
- 本 Story 的 WindowStatus 将在 Epic 4（状态检测）中与 ProcessManager 集成

**Story 2.2 (创建新任务窗口) 的衔接：**
- Story 2.2 需要本 Story 的 Zustand store 来保存窗口数据
- Story 2.2 的 CreateWindowDialog 将调用本 Story 的 `addWindow` 方法
- Story 2.2 的 IPC handler 返回的 Window 对象将直接添加到本 Story 的 store

**Story 1.2 (React + TypeScript) 提供的基础：**
- React 18.x 的自动批处理优化了状态更新性能
- TypeScript 5.x 提供了更好的类型推导
- Vite 5.x 的热重载加速了开发调试

### 测试验证清单

**依赖安装验证：**
- [ ] 执行 `npm install zustand` 成功安装
- [ ] 执行 `npm install zustand@4.x` 安装指定版本
- [ ] 验证 Zustand 与 React 18.x 兼容
- [ ] 执行 `npm run dev` 应用正常启动

**Store 功能验证：**
- [ ] addWindow 方法正确添加窗口到 windows 数组
- [ ] removeWindow 方法正确删除窗口
- [ ] removeWindow 删除活跃窗口时清空 activeWindowId
- [ ] updateWindowStatus 方法正确更新窗口状态
- [ ] updateWindowStatus 同时更新 lastActiveAt 时间戳
- [ ] setActiveWindow 方法正确设置活跃窗口
- [ ] setActiveWindow 同时更新 lastActiveAt 时间戳
- [ ] getWindowById 方法正确查找窗口
- [ ] getWindowsByStatus 方法正确筛选窗口

**Selector 功能验证：**
- [ ] selectAllWindows 正确返回所有窗口
- [ ] selectActiveWindow 正确返回当前活跃窗口
- [ ] selectWindowsByStatus 正确按状态筛选窗口
- [ ] selectWindowCount 正确返回窗口总数
- [ ] selectStatusCounts 正确统计各状态窗口数量

**响应式更新验证：**
- [ ] 组件使用 useWindowStore 订阅状态
- [ ] 状态变化时组件自动重渲染
- [ ] 使用 selector 时只在相关状态变化时重渲染
- [ ] 多个组件订阅同一状态时同步更新

**边界情况验证：**
- [ ] 删除不存在的窗口不抛出异常
- [ ] 更新不存在的窗口不抛出异常
- [ ] 设置不存在的窗口为活跃窗口不抛出异常
- [ ] windows 数组为空时 selectors 正常工作

**TypeScript 类型验证：**
- [ ] Window 接口所有字段类型正确
- [ ] WindowStatus 枚举值正确
- [ ] WindowStore 接口所有方法签名正确
- [ ] useWindowStore hook 类型推导正确
- [ ] Selectors 返回值类型正确

### Project Structure Notes

**新增文件：**
```
src/renderer/
├── stores/
│   ├── windowStore.ts              # Zustand 窗口状态管理 (新建)
│   ├── selectors.ts                # Store selectors (新建)
│   └── __tests__/
│       └── windowStore.test.ts     # 单元测试 (新建)
├── types/
│   └── window.ts                   # Window 和 WindowStatus 类型定义 (新建)
└── components/
    └── WindowList.tsx              # 示例组件验证 Store 集成 (新建)
```

**与统一项目结构的对齐：**
- 状态管理放在 `src/renderer/stores/` 目录
- 类型定义放在 `src/renderer/types/` 目录
- 组件放在 `src/renderer/components/` 目录
- 单元测试放在对应模块的 `__tests__/` 目录

**文件命名规范：**
- Store 文件使用 camelCase (如 `windowStore.ts`)
- 类型定义文件使用 camelCase (如 `window.ts`)
- 组件文件使用 PascalCase (如 `WindowList.tsx`)
- 测试文件使用 `.test.ts` 或 `.test.tsx` 后缀

**代码组织建议（为后续 Story 做准备）：**
- windowStore 是 Epic 2-6 的核心状态管理
- Story 3.1-3.4 将使用 windowStore 展示窗口列表
- Story 4.1-4.2 将使用 updateWindowStatus 更新状态
- Story 5.1-5.2 将使用 setActiveWindow 切换窗口
- Story 6.1-6.3 将使用 windowStore 持久化工作区

### References

- [Source: architecture.md#状态管理 - Zustand AppState 接口]
- [Source: architecture.md#数据模型设计 - Window, WindowStatus]
- [Source: architecture.md#性能优化策略 - Zustand selector 优化]
- [Source: architecture.md#技术栈总结 - Zustand 4.x]
- [Source: epics.md#Story 2.3 - 验收标准]
- [Source: epics.md#Epic 2: 终端进程管理 - Story 2.3]
- [Source: prd.md#功能需求 - FR2]
- [Source: 2-1-process-management-service-infrastructure.md - ProcessManager 实现细节]
- [Source: 2-2-create-new-task-window.md - Zustand Store 结构]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
