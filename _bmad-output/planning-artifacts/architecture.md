---
stepsCompleted: [1]
inputDocuments: ['prd.md', 'ux-design-specification.md']
workflowType: 'architecture'
project_name: 'ausome-terminal'
user_name: '立哥'
date: '2026-02-28'
lastModified: '2026-03-02'
majorChanges: ['技术栈从 Tauri + Rust 改为 Electron + Node.js', '新增窗格拆分功能', '新增多种窗口切换方式（Sidebar/QuickSwitcher/TabSwitcher）']
---

# Architecture Decision Document - ausome-terminal

_本文档通过协作式架构决策流程逐步构建，记录 ausome-terminal 项目的核心架构决策。_

## 项目上下文

**项目名称：** ausome-terminal

**项目类型：** 桌面应用（Desktop Application）

**核心定位：** 面向 AI CLI 工具开发者的任务管理软件，作为 shell 工具的增强包装层

**目标平台：** Windows + macOS（MVP）

**核心能力：**
- 统一视图管理多个 CLI 任务窗口
- 智能状态追踪（运行中/等待输入/已完成/出错）
- 工作区持久化（关闭后自动恢复）
- 快速窗口切换（< 500ms）
- 窗格拆分（支持水平和垂直拆分，单窗口多终端）
- 多种切换方式（侧边栏、快速切换器、Tab 循环）

## 架构决策概览

### 核心架构原则

1. **性能优先** — 窗口切换 < 500ms，状态更新 < 1s，启动恢复 < 5s
2. **跨平台一致性** — Windows + macOS 共享核心代码，最小化平台特定代码
3. **进程隔离** — 单个终端进程异常不影响应用整体稳定性
4. **数据零丢失** — 工作区配置持久化，崩溃后可完整恢复
5. **离线优先** — 所有核心功能完全离线可用

### 关键技术挑战

1. **进程管理** — 跨平台启动、监控、终止终端进程
2. **状态感知** — 自动检测窗口状态（运行中/等待输入/已完成/出错）
3. **窗口切换** — 快速切换到指定终端窗口（< 500ms）
4. **工作区恢复** — 启动时快速恢复 10+ 窗口（< 5s）
5. **窗格拆分** — 单窗口内支持多终端窗格，动态布局管理
6. **布局持久化** — 保存和恢复复杂的窗格拆分布局

## 技术栈选型

### 桌面应用框架：Electron

**决策：** 采用 Electron 作为桌面应用框架

**理由：**

1. **生态成熟**
   - 大量成功案例（VS Code、Slack、Discord、Figma）
   - 丰富的第三方库和工具链
   - 社区活跃，问题解决快，文档完善

2. **跨平台支持**
   - Windows + macOS + Linux 统一代码库
   - 跨平台 API 一致性好，减少平台特定代码
   - 原生系统集成能力（进程管理、文件系统、窗口管理）

3. **开发效率**
   - 前后端都使用 JavaScript/TypeScript，技术栈统一
   - Node.js 生态丰富，进程管理、文件操作库成熟
   - 热重载开发体验，调试工具完善（Chrome DevTools）

4. **终端集成能力**
   - node-pty 库成熟稳定，跨平台终端集成方案完善
   - 大量终端应用案例（Hyper、Terminus、Tabby）
   - 进程管理、PTY 操作、窗口切换 API 完善

5. **打包与分发**
   - electron-builder 打包工具成熟
   - 支持自动更新（electron-updater）
   - 代码签名、公证流程完善

**替代方案对比：**

| 框架 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| Electron | 成熟生态，终端集成方案完善 | 体积大（~100MB），内存占用高（~150MB） | ✅ 最佳选择 |
| Tauri | 性能好，体积小，Rust 安全 | 终端集成复杂，需要 Rust 开发，学习曲线陡 | ❌ 开发效率低 |
| Flutter | 跨平台一致性好 | 终端集成复杂，社区支持弱 | ❌ 终端集成风险高 |
| Qt | 原生性能，成熟稳定 | C++ 开发效率低，UI 现代化难 | ❌ 开发效率低 |

**性能权衡：**
- 虽然 Electron 体积和内存占用较大，但对于桌面应用来说可接受
- 终端集成的成熟度和开发效率优先级更高
- 用户机器通常有足够的内存（8GB+），~150MB 内存占用可接受

### 前端框架：React + TypeScript

**决策：** 采用 React + TypeScript

**理由：**

1. **生态成熟**
   - 组件库丰富（Radix UI / Shadcn/ui）
   - 工具链完善（Vite、ESLint、Prettier）
   - 社区活跃，问题解决快

2. **开发效率**
   - TypeScript 类型安全，减少运行时错误
   - React Hooks 简化状态管理
   - 组件化开发，代码复用性高

3. **性能优化**
   - Virtual DOM 高效更新
   - React.memo / useMemo 优化渲染
   - 支持 Concurrent Mode（未来）

4. **团队熟悉度**
   - 开发者（立哥）熟悉 React 生态
   - 降低学习成本，加快开发速度

**替代方案对比：**

| 框架 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| Vue 3 | 学习曲线平缓，性能好 | 生态不如 React，组件库少 | ❌ 生态劣势 |
| Svelte | 编译时优化，性能最佳 | 生态小，组件库少，风险高 | ❌ 生态风险 |
| React | 生态最成熟，组件库丰富 | 相对复杂，需要状态管理 | ✅ 最佳选择 |

### UI 组件库：Radix UI + Tailwind CSS

**决策：** 采用 Radix UI（无头组件）+ Tailwind CSS

**理由：**

1. **视觉自由度**
   - Radix UI 无预设样式，完全自定义
   - 可实现 Auto-Claude 式的独特视觉风格
   - 深色主题、圆弧彩色线条、轻量边框

2. **交互质量**
   - Radix UI 处理复杂交互逻辑（焦点管理、键盘导航）
   - 内置无障碍支持（ARIA 属性、屏幕阅读器）
   - 生产级质量，经过大量项目验证

3. **开发效率**
   - Tailwind CSS 原子化 CSS，快速实现样式
   - 无需手写 CSS，减少样式冲突
   - 按需生成，打包体积小

4. **性能友好**
   - Radix UI 体积小（~50KB）
   - Tailwind CSS 按需生成，无冗余代码
   - 无运行时开销

**组件选型：**

| 组件 | 用途 | 来源 |
|------|------|------|
| Dialog | 新建窗口、确认对话框 | Radix UI |
| ContextMenu | 窗口卡片右键菜单 | Radix UI |
| Tooltip | 工作目录路径悬停提示 | Radix UI |
| ScrollArea | 15+ 窗口滚动 | Radix UI |
| WindowCard | 窗口状态卡片 | 自定义 |
| StatusBar | 状态统计栏 | 自定义 |
| TerminalView | 终端视图（支持多窗格） | 自定义 |
| TerminalPane | 单个终端窗格 | 自定义 |
| SplitLayout | 窗格拆分布局容器 | 自定义 + react-resizable-panels |
| Sidebar | 侧边栏窗口列表 | 自定义 |
| QuickSwitcher | 快速切换器 | 自定义 |
| TabSwitcher | Tab 循环切换器 | 自定义 |

### 状态管理：Zustand

**决策：** 采用 Zustand 作为全局状态管理

**理由：**

1. **简洁轻量**
   - API 简单，学习成本低
   - 体积小（~1KB），无性能负担
   - 无需 Provider 包裹，使用灵活

2. **性能优秀**
   - 基于订阅模式，精确更新
   - 避免不必要的重渲染
   - 支持 selector 优化

3. **TypeScript 友好**
   - 完整类型推导
   - 类型安全的 store 定义

4. **适合场景**
   - 窗口列表状态
   - 当前活跃窗口
   - 全局设置（提醒偏好等）

**状态结构：**

```typescript
interface AppState {
  windows: Window[]
  activeWindowId: string | null
  settings: Settings
  addWindow: (window: Window) => void
  removeWindow: (id: string) => void
  updateWindowStatus: (id: string, status: WindowStatus) => void
  setActiveWindow: (id: string) => void
}
```

### 数据持久化：本地 JSON 文件

**决策：** 使用本地 JSON 文件存储工作区配置

**理由：**

1. **简单可靠**
   - 无需数据库，降低复杂度
   - 人类可读，便于调试和备份
   - 跨平台一致性好

2. **性能足够**
   - 10+ 窗口配置，JSON 文件 < 10KB
   - 读写速度快（< 10ms）
   - 符合 < 5s 启动恢复要求

3. **数据安全**
   - 原子写入（写临时文件 + 重命名）
   - 崩溃后可恢复
   - 定期备份（保留最近 3 个版本）

**存储路径：**
- Windows: `%APPDATA%/ausome-terminal/workspace.json`
- macOS: `~/Library/Application Support/ausome-terminal/workspace.json`

**数据结构：**

```json
{
  "version": "1.0",
  "windows": [
    {
      "id": "uuid",
      "name": "项目 A",
      "workingDirectory": "/path/to/project-a",
      "command": "claude",
      "status": "running",
      "createdAt": "2026-02-28T10:00:00Z",
      "lastActiveAt": "2026-02-28T12:30:00Z"
    }
  ],
  "settings": {
    "notificationsEnabled": true,
    "theme": "dark"
  }
}
```

## 系统架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                  Electron Application                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │      Renderer Process (React + TypeScript)       │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  UI Layer                                        │   │
│  │  - WindowCard (窗口卡片)                        │   │
│  │  - TerminalView (终端视图)                      │   │
│  │  - StatusBar (状态统计)                         │   │
│  │  - Dialogs (对话框)                             │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  State Management (Zustand)                      │   │
│  │  - Windows State                                 │   │
│  │  - Active Window                                 │   │
│  │  - Settings                                      │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  IPC Bridge (Electron IPC)                       │   │
│  │  - ipcRenderer.invoke() 调用主进程              │   │
│  │  - ipcRenderer.on() 监听主进程事件              │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↕                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │      Main Process (Node.js + TypeScript)         │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  Core Services                                   │   │
│  │  - ProcessManager (进程管理 - node-pty)         │   │
│  │  - StatusDetector (状态检测)                    │   │
│  │  - WorkspaceManager (工作区管理)                │   │
│  │  - WindowSwitcher (窗口切换 - robotjs)          │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  Platform Abstraction Layer                      │   │
│  │  - Windows: node-pty + robotjs + win32 API       │   │
│  │  - macOS: node-pty + robotjs + AppleScript       │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  Data Layer                                      │   │
│  │  - JSON 文件读写 (fs-extra)                      │   │
│  │  - 原子写入 + 备份                               │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↕                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Operating System                         │   │
│  │  - Terminal Processes (PTY - bash/zsh/pwsh)      │   │
│  │  - File System                                   │   │
│  │  - Window Management                             │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 分层职责

**Renderer Process（渲染进程）**
- 职责：UI 渲染、用户交互、状态展示
- 技术：React + TypeScript + Radix UI + Tailwind CSS
- 关键组件：WindowCard、TerminalView、StatusBar
- 性能要求：渲染 15+ 窗口卡片无卡顿
- 通信方式：通过 Electron IPC 与主进程通信

**Main Process（主进程）**
- 职责：进程管理、状态检测、数据持久化、窗口管理
- 技术：Node.js + TypeScript + node-pty + robotjs
- 关键服务：ProcessManager、StatusDetector、WorkspaceManager、WindowSwitcher
- 性能要求：状态检测 < 1s，进程启动 < 2s
- 通信方式：通过 Electron IPC 响应渲染进程请求

**Platform Abstraction Layer（平台抽象层）**
- 职责：封装平台特定 API，提供统一接口
- 技术：Node.js 条件导入 + 平台特定库
- 关键接口：TerminalLauncher、WindowFocuser、ProcessMonitor
- 目标：90% 代码跨平台共享

### 核心服务设计

#### ProcessManager（进程管理服务）

**职责：** 启动、监控、终止终端进程

**接口：**

```typescript
interface ProcessManager {
  spawnTerminal(config: TerminalConfig): Promise<ProcessHandle>;
  killProcess(pid: number): Promise<void>;
  getProcessStatus(pid: number): ProcessStatus;
  listProcesses(): ProcessInfo[];
}
```

**实现要点：**
- 使用 `node-pty` 库创建 PTY（伪终端）进程
- Windows: 启动 `pwsh.exe` 或 `cmd.exe`
- macOS: 启动 `zsh` 或 `bash`
- 进程监控：监听 PTY 的 `exit` 事件
- 进程隔离：单个进程崩溃不影响其他进程

**核心实现：**

```typescript
import * as pty from 'node-pty';

class ProcessManagerImpl implements ProcessManager {
  private processes = new Map<number, pty.IPty>();

  async spawnTerminal(config: TerminalConfig): Promise<ProcessHandle> {
    const shell = process.platform === 'win32' ? 'pwsh.exe' : 'zsh';

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: config.workingDirectory,
      env: process.env,
    });

    this.processes.set(ptyProcess.pid, ptyProcess);

    ptyProcess.onExit(({ exitCode }) => {
      this.handleProcessExit(ptyProcess.pid, exitCode);
    });

    return {
      pid: ptyProcess.pid,
      pty: ptyProcess,
    };
  }

  async killProcess(pid: number): Promise<void> {
    const ptyProcess = this.processes.get(pid);
    if (ptyProcess) {
      ptyProcess.kill();
      this.processes.delete(pid);
    }
  }
}
```

#### StatusDetector（状态检测服务）

**职责：** 自动检测窗口状态（运行中/等待输入/已完成/出错）

**检测策略：**

1. **运行中（Running）**
   - 进程存活 + CPU 使用率 > 1%
   - 或：进程存活 + 最近 5s 内有输出

2. **等待输入（WaitingForInput）**
   - 进程存活 + CPU 使用率 < 1%
   - 且：最近 5s 内无输出
   - 且：终端光标可见（通过 PTY 检测）

3. **已完成（Completed）**
   - 进程退出 + 退出码 = 0

4. **出错（Error）**
   - 进程退出 + 退出码 ≠ 0
   - 或：进程崩溃

**技术实现：**
- 使用 `node-pty` 的 PTY 实例监听输出
- 监听 `data` 事件获取 stdout/stderr 输出
- 使用 `pidusage` 库检测 CPU 使用率
- 定期轮询（每 1s）+ 事件驱动（进程退出）

**接口：**

```typescript
interface StatusDetector {
  detectStatus(pid: number): WindowStatus;
  subscribeStatusChange(callback: (pid: number, status: WindowStatus) => void): void;
}
```

**核心实现：**

```typescript
import pidusage from 'pidusage';

class StatusDetectorImpl implements StatusDetector {
  private lastOutputTime = new Map<number, number>();
  private cpuUsage = new Map<number, number>();

  async detectStatus(pid: number): Promise<WindowStatus> {
    // 检查进程是否存活
    if (!this.isProcessAlive(pid)) {
      const exitCode = this.getExitCode(pid);
      return exitCode === 0 ? WindowStatus.Completed : WindowStatus.Error;
    }

    // 获取 CPU 使用率
    const stats = await pidusage(pid);
    const cpu = stats.cpu;

    // 获取最后输出时间
    const lastOutput = this.lastOutputTime.get(pid) || 0;
    const timeSinceOutput = Date.now() - lastOutput;

    // 判断状态
    if (cpu > 1.0 || timeSinceOutput < 5000) {
      return WindowStatus.Running;
    }

    return WindowStatus.WaitingForInput;
  }

  onPtyData(pid: number, data: string): void {
    this.lastOutputTime.set(pid, Date.now());
  }
}
```

#### WorkspaceManager（工作区管理服务）

**职责：** 保存和恢复工作区配置

**接口：**

```typescript
interface WorkspaceManager {
  saveWorkspace(workspace: Workspace): Promise<void>;
  loadWorkspace(): Promise<Workspace>;
  backupWorkspace(): Promise<void>;
}
```

**实现要点：**
- 使用 `fs-extra` 库进行文件操作
- 原子写入：写临时文件 → 重命名覆盖
- 定期备份：保留最近 3 个版本
- 崩溃恢复：启动时检查临时文件，恢复未完成的写入
- 数据验证：加载时校验 JSON 格式和版本

**核心实现：**

```typescript
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';

class WorkspaceManagerImpl implements WorkspaceManager {
  private workspacePath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.workspacePath = path.join(userDataPath, 'workspace.json');
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    const tempPath = `${this.workspacePath}.tmp`;

    // 写入临时文件
    await fs.writeJson(tempPath, workspace, { spaces: 2 });

    // 原子重命名
    await fs.rename(tempPath, this.workspacePath);

    // 备份
    await this.backupWorkspace();
  }

  async loadWorkspace(): Promise<Workspace> {
    if (await fs.pathExists(this.workspacePath)) {
      return await fs.readJson(this.workspacePath);
    }
    return this.getDefaultWorkspace();
  }
}
```

#### ViewSwitcher（视图切换服务）

**职责：** 在应用内快速切换到指定的 TerminalView

**实现策略：**

- 管理多个 TerminalView 组件的显示/隐藏状态
- 通过窗口 ID 切换到对应的 TerminalView
- 保持非活跃 TerminalView 的 PTY 连接和状态

**接口：**

```typescript
interface ViewSwitcher {
  switchToTerminalView(windowId: string): void;
  switchToUnifiedView(): void;
  getCurrentView(): 'unified' | 'terminal';
  getActiveWindowId(): string | null;
}
```

**核心实现：**

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

**性能目标：** 视图切换 < 100ms（纯 UI 切换，无外部窗口操作）

### 窗口切换系统架构

ausome-terminal 提供了多种窗口切换方式，满足不同场景的需求：

#### 1. Sidebar（侧边栏）

**职责：** 在终端视图中提供持久可见的窗口列表

**特性：**
- 默认折叠状态（32px 宽），仅显示状态指示点
- 展开状态（150-400px 可调整），显示窗口名称和路径
- 支持拖拽调整宽度
- 分为"活跃终端"和"归档终端"两个标签页
- 点击窗口项立即切换

**实现：**
```typescript
interface SidebarState {
  isExpanded: boolean;           // 是否展开
  width: number;                 // 展开时的宽度（150-400px）
  currentTab: 'active' | 'archived';  // 当前标签页
}

// 切换展开/折叠
function toggleSidebar(): void {
  sidebarState.isExpanded = !sidebarState.isExpanded;
}

// 调整宽度
function resizeSidebar(newWidth: number): void {
  sidebarState.width = Math.max(150, Math.min(400, newWidth));
}
```

**快捷键：**
- `Ctrl+B`: 切换侧边栏展开/折叠
- `Ctrl+1~9`: 切换到第 N 个窗口

#### 2. QuickSwitcher（快速切换器）

**职责：** 提供模糊搜索的快速窗口切换

**特性：**
- 模糊搜索窗口名称和路径
- 键盘导航（↑↓ 或 Ctrl+N/P）
- 高亮匹配字符
- 显示所有窗口（包括归档）
- 当前窗口排在第一位

**实现：**
```typescript
interface QuickSwitcherState {
  isOpen: boolean;
  query: string;                 // 搜索关键词
  selectedIndex: number;         // 当前选中的索引
  filteredWindows: Window[];     // 过滤后的窗口列表
}

// 模糊匹配算法
function fuzzyMatch(query: string, text: string): boolean {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  let queryIndex = 0;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === queryLower.length;
}

// 过滤窗口
function filterWindows(query: string, windows: Window[]): Window[] {
  return windows
    .filter(w => fuzzyMatch(query, w.name) || fuzzyMatch(query, getCwd(w)))
    .sort((a, b) => {
      // 当前窗口排在最前面
      if (a.id === currentWindowId) return -1;
      if (b.id === currentWindowId) return 1;
      return 0;
    });
}
```

**快捷键：**
- `Ctrl+P`: 打开快速切换器
- `↑↓` 或 `Ctrl+N/P`: 选择窗口
- `Enter`: 切换到选中窗口
- `Esc`: 关闭

#### 3. TabSwitcher（Tab 循环切换）

**职责：** 基于 MRU（Most Recently Used）顺序的快速切换

**特性：**
- 按 MRU 顺序显示最近使用的窗口
- 按住 Ctrl 键，按 Tab 循环切换
- 松开 Ctrl 键确认切换
- 水平显示最近 8 个窗口的预览
- 类似 Alt+Tab 的交互体验

**实现：**
```typescript
interface TabSwitcherState {
  isOpen: boolean;
  selectedIndex: number;         // 当前选中的索引
  direction: 'forward' | 'backward';  // 切换方向
}

// MRU 列表管理
interface MRUManager {
  mruList: string[];             // 窗口 ID 列表，按最近使用排序

  // 更新 MRU 列表（窗口切换时调用）
  updateMRU(windowId: string): void {
    // 移除旧位置
    this.mruList = this.mruList.filter(id => id !== windowId);
    // 添加到最前面
    this.mruList.unshift(windowId);
  }

  // 获取 MRU 窗口列表
  getMRUWindows(): Window[] {
    return this.mruList
      .map(id => getWindowById(id))
      .filter(w => w !== null);
  }
}

// Tab 切换逻辑
function handleTabSwitch(direction: 'forward' | 'backward'): void {
  const mruWindows = getMRUWindows();

  if (direction === 'forward') {
    selectedIndex = (selectedIndex + 1) % mruWindows.length;
  } else {
    selectedIndex = (selectedIndex - 1 + mruWindows.length) % mruWindows.length;
  }
}

// Ctrl 键释放时确认切换
function handleCtrlRelease(): void {
  const selectedWindow = mruWindows[selectedIndex];
  if (selectedWindow) {
    switchToWindow(selectedWindow.id);
  }
  closeTabSwitcher();
}
```

**快捷键：**
- `Ctrl+Tab`: 向前循环
- `Ctrl+Shift+Tab`: 向后循环
- 松开 `Ctrl`: 确认切换

#### 4. 键盘快捷键系统

**实现：**
```typescript
interface KeyboardShortcuts {
  onCtrlTab: () => void;         // Ctrl+Tab
  onCtrlShiftTab: () => void;    // Ctrl+Shift+Tab
  onCtrlP: () => void;           // Ctrl+P
  onCtrlB: () => void;           // Ctrl+B
  onCtrlNumber: (num: number) => void;  // Ctrl+1~9
  onEscape: () => void;          // Esc
  enabled: boolean;              // 是否启用
}

// 快捷键监听
function useKeyboardShortcuts(shortcuts: KeyboardShortcuts): void {
  useEffect(() => {
    if (!shortcuts.enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        shortcuts.onCtrlTab();
      }

      // Ctrl+Shift+Tab
      if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        shortcuts.onCtrlShiftTab();
      }

      // Ctrl+P
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        shortcuts.onCtrlP();
      }

      // Ctrl+B
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        shortcuts.onCtrlB();
      }

      // Ctrl+1~9
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const num = parseInt(e.key);
        shortcuts.onCtrlNumber(num);
      }

      // Esc
      if (e.key === 'Escape') {
        shortcuts.onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
```

**特殊处理：**
- 在终端输入时，`Ctrl+Enter` 和 `Shift+Enter` 插入换行符（用于 Claude Code 等多行输入场景）
- 快速切换器和 Tab 切换器打开时，禁用其他快捷键
- Esc 键优先级：关闭切换器 > 返回统一视图

#### 窗口切换性能优化

**目标：** 所有切换方式响应时间 < 100ms

**优化策略：**
1. **TerminalView 组件保持挂载**
   - 所有窗口的 TerminalView 始终挂载
   - 使用 CSS `display: none` 隐藏非活跃窗口
   - 避免 xterm.js 重新初始化导致的双光标问题

2. **MRU 列表缓存**
   - MRU 列表存储在 Zustand store 中
   - 窗口切换时立即更新
   - 持久化到 workspace.json

3. **模糊搜索优化**
   - 使用简单的字符匹配算法（O(n)）
   - 限制搜索结果数量（最多 50 个）
   - 防抖输入（debounce 100ms）

4. **虚拟滚动**
   - 侧边栏窗口列表超过 20 个时使用虚拟滚动
   - 仅渲染可见区域的窗口项

## 关键技术决策

### 决策 1：终端集成方式

**问题：** 如何与终端工具集成？

**方案对比：**

| 方案 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| 内嵌终端（node-pty + xterm.js） | 完全控制，跨平台一致，精确状态检测 | 需要实现终端渲染 | ✅ 最佳选择 |
| 包装现有终端 | 保持原生体验，功能完整 | 无法实现精确状态检测，平台特定代码多 | ❌ 无法实现核心功能 |
| 纯 CLI 工具 | 开发简单 | 无 GUI，不符合需求 | ❌ 不符合需求 |

**最终决策：** 使用 node-pty 创建内嵌 PTY 终端 + xterm.js 渲染

**理由：**
1. 完全控制终端进程和输出
2. 跨平台一致性好（node-pty 封装了平台差异）
3. 可以直接监听输出，实现精确的状态检测
4. VS Code Terminal 证明此方案成熟可行
5. 保留核心终端功能（划选复制、右键粘贴、所有 shell 命令）

**实现方式：**
- 使用 `node-pty` 创建 PTY 进程
- 使用 `xterm.js` 在应用内渲染终端内容
- 监听 `data` 事件获取输出
- 监听 `exit` 事件检测进程退出
- 通过 `write()` 方法发送用户输入
- 实现划选复制和右键粘贴功能

### 决策 2：状态检测实现

**问题：** 如何自动检测窗口状态（运行中/等待输入/已完成/出错）？

**方案对比：**

| 方案 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| 纯进程监控 | 简单，跨平台 | 无法区分运行中/等待输入 | ❌ 功能不足 |
| PTY + 输出分析 | 准确度高，可检测等待输入 | 实现复杂，性能开销 | ✅ 最佳选择 |
| 用户手动标记 | 实现简单 | 用户体验差，失去自动化优势 | ❌ 违背核心价值 |

**最终决策：** PTY + 输出分析 + CPU 监控

**检测逻辑：**

```typescript
function detectStatus(pid: number): WindowStatus {
  if (!isProcessAlive(pid)) {
    return exitCode === 0 ? WindowStatus.Completed : WindowStatus.Error;
  }

  const cpuUsage = getCpuUsage(pid);
  const lastOutputTime = getLastOutputTime(pid);
  const timeSinceOutput = Date.now() - lastOutputTime;

  if (cpuUsage > 1.0 || timeSinceOutput < 5000) {
    return WindowStatus.Running;
  }

  if (isCursorVisible(pid)) {
    return WindowStatus.WaitingForInput;
  }

  return WindowStatus.Running; // 默认
}
```

**性能优化：**
- 轮询间隔 1s（平衡准确性和性能）
- 仅监控活跃窗口的详细状态
- 非活跃窗口仅检查进程存活

### 决策 3：窗口切换实现

**问题：** 如何实现 < 500ms 的窗口切换？

**Windows 实现：**

```typescript
async function focusWindowWindows(pid: number): Promise<void> {
  // 1. 查找窗口句柄（缓存优化）
  const window = windowManager.getWindows().find(w => w.processId === pid);

  // 2. 置前窗口
  if (window) {
    window.bringToTop();
    window.restore(); // 如果最小化则恢复
  }
}
```

**macOS 实现：**

```typescript
async function focusWindowMacOS(pid: number): Promise<void> {
  // 1. 激活终端应用
  const { execSync } = require('child_process');
  execSync(`osascript -e 'tell application "Terminal" to activate'`);

  // 2. 切换到指定标签页（通过 AppleScript）
  const script = `tell application "Terminal" to set frontmost of window id ${windowId} to true`;
  execSync(`osascript -e '${script}'`);
}
```

**性能优化：**
- 缓存 PID → 窗口句柄映射
- 预编译 AppleScript
- 异步执行，不阻塞 UI

### 决策 4：工作区恢复策略

**问题：** 如何在 < 5s 内恢复 10+ 窗口？

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

**实现：**

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

**性能目标：**
- 10 个窗口：< 3s
- 15 个窗口：< 5s

### 决策 5：窗格拆分实现

**问题：** 如何在单个窗口内支持多个终端窗格？

**方案对比：**

| 方案 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| 多个独立窗口 | 实现简单，窗口管理由 OS 负责 | 无法在单个逻辑窗口内管理多个终端，布局不灵活 | ❌ 不符合需求 |
| Tab 标签页 | 实现简单，类似浏览器 | 无法同时查看多个终端，不支持分屏 | ❌ 功能不足 |
| 树形布局 + 递归拆分 | 灵活，支持任意复杂布局，可持久化 | 实现复杂，需要布局算法 | ✅ 最佳选择 |

**最终决策：** 使用树形布局结构 + 递归拆分

**核心设计：**

1. **布局树结构**
   ```typescript
   // 叶子节点：窗格
   interface PaneNode {
     type: 'pane';
     id: string;
     pane: Pane;  // 包含 PTY 进程信息
   }

   // 分支节点：拆分
   interface SplitNode {
     type: 'split';
     direction: 'horizontal' | 'vertical';
     sizes: number[];  // 子节点大小比例
     children: LayoutNode[];
   }

   type LayoutNode = PaneNode | SplitNode;
   ```

2. **拆分操作**
   ```typescript
   function splitPane(
     windowId: string,
     paneId: string,
     direction: 'horizontal' | 'vertical'
   ): void {
     // 1. 找到要拆分的窗格节点
     const paneNode = findPaneNode(layout, paneId);

     // 2. 创建新窗格（继承当前窗格的 cwd 和 command）
     const newPane = createPane({
       cwd: paneNode.pane.cwd,
       command: paneNode.pane.command,
     });

     // 3. 创建拆分节点，替换原窗格节点
     const splitNode: SplitNode = {
       type: 'split',
       direction,
       sizes: [0.5, 0.5],  // 默认均分
       children: [paneNode, newPaneNode],
     };

     // 4. 更新布局树
     replaceNode(layout, paneId, splitNode);

     // 5. 启动新窗格的 PTY 进程
     spawnPTY(newPane);
   }
   ```

3. **关闭窗格操作**
   ```typescript
   function closePane(windowId: string, paneId: string): void {
     // 1. 找到窗格节点的父节点
     const parent = findParentNode(layout, paneId);

     // 2. 如果父节点是拆分节点，移除该窗格
     if (parent.type === 'split') {
       const siblings = parent.children.filter(c => c.id !== paneId);

       // 3. 如果只剩一个子节点，提升该节点替换父节点
       if (siblings.length === 1) {
         replaceNode(layout, parent.id, siblings[0]);
       } else {
         // 4. 重新分配大小比例
         parent.children = siblings;
         redistributeSizes(parent);
       }
     }

     // 5. 终止窗格的 PTY 进程
     killPTY(paneId);
   }
   ```

4. **布局渲染**
   ```typescript
   function renderLayout(node: LayoutNode): React.ReactNode {
     if (node.type === 'pane') {
       // 渲染终端窗格
       return <TerminalPane pane={node.pane} />;
     }

     if (node.type === 'split') {
       // 递归渲染拆分布局
       return (
         <SplitContainer direction={node.direction} sizes={node.sizes}>
           {node.children.map(child => renderLayout(child))}
         </SplitContainer>
       );
     }
   }
   ```

5. **大小调整**
   - 使用 `react-resizable-panels` 库实现拖拽调整
   - 拖拽时实时更新 `sizes` 数组
   - 调整后触发 xterm.js 的 `fit()` 重新计算终端大小

**实现要点：**
- 每个窗格对应一个独立的 PTY 进程
- 每个窗格有独立的 xterm.js 实例
- 布局树持久化到 workspace.json
- 支持任意深度的嵌套拆分
- 最后一个窗格不允许关闭

**性能优化：**
- 非活跃窗格的 xterm.js 实例保持挂载，使用 CSS 隐藏
- 拖拽调整时使用 `requestAnimationFrame` 优化渲染
- 限制最大窗格数量（建议不超过 6 个）

**用户体验：**
- 拆分时新窗格继承当前窗格的工作目录和命令
- 活跃窗格有明显的视觉高亮（蓝色边框）
- 点击窗格激活，支持键盘导航
- 窗格工具栏显示状态和关闭按钮

## 数据模型设计

### 核心实体

#### Pane（窗格）

```typescript
interface Pane {
  id: string;                    // UUID
  cwd: string;                   // 工作目录路径
  command: string;               // 启动命令（如 "pwsh.exe"）
  status: WindowStatus;          // 当前状态
  pid: number | null;            // 进程 PID
  lastOutput?: string;           // 最新输出摘要（前 100 字符）
}
```

**说明：** 窗格是终端的最小单位，每个窗格对应一个独立的 PTY 进程。窗口可以包含多个窗格（通过拆分）。

#### LayoutNode（布局节点）

布局采用树形结构，支持递归拆分：

```typescript
// 窗格节点（叶子节点）
interface PaneNode {
  type: 'pane';
  id: string;                    // 窗格 ID
  pane: Pane;                    // 窗格数据
}

// 拆分节点（分支节点）
interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';  // 拆分方向
  sizes: number[];               // 每个子节点的大小比例（总和为 1）
  children: LayoutNode[];        // 子节点列表
}

// 布局节点类型（递归）
type LayoutNode = PaneNode | SplitNode;
```

**布局示例：**

```
单窗格：
{ type: 'pane', id: 'pane-1', pane: {...} }

水平拆分（左右）：
{
  type: 'split',
  direction: 'horizontal',
  sizes: [0.5, 0.5],
  children: [
    { type: 'pane', id: 'pane-1', pane: {...} },
    { type: 'pane', id: 'pane-2', pane: {...} }
  ]
}

复杂嵌套拆分：
{
  type: 'split',
  direction: 'horizontal',
  sizes: [0.5, 0.5],
  children: [
    { type: 'pane', id: 'pane-1', pane: {...} },
    {
      type: 'split',
      direction: 'vertical',
      sizes: [0.5, 0.5],
      children: [
        { type: 'pane', id: 'pane-2', pane: {...} },
        { type: 'pane', id: 'pane-3', pane: {...} }
      ]
    }
  ]
}
```

#### Window（窗口）

```typescript
interface Window {
  id: string;                    // UUID
  name: string;                  // 窗口名称（用户可自定义）
  layout: LayoutNode;            // 布局树（根节点）
  activePaneId: string;          // 当前激活的窗格 ID
  createdAt: string;             // 创建时间（ISO 8601）
  lastActiveAt: string;          // 最后活跃时间
  archived?: boolean;            // 是否已归档
}
```

**重要变更：** 窗口不再直接包含单个终端的信息（workingDirectory、command、status、pid），而是通过 `layout` 树管理多个窗格。这支持了窗格拆分功能。

**向后兼容：** 旧版单窗格窗口会在加载时自动迁移为新的布局结构：

```typescript
// 旧版窗口
interface LegacyWindow {
  id: string;
  name: string;
  workingDirectory: string;
  command: string;
  status: WindowStatus;
  pid: number | null;
  // ...
}

// 迁移逻辑
function migrateLegacyWindow(legacy: LegacyWindow): Window {
  return {
    id: legacy.id,
    name: legacy.name,
    layout: {
      type: 'pane',
      id: uuidv4(),
      pane: {
        id: uuidv4(),
        cwd: legacy.workingDirectory,
        command: legacy.command,
        status: legacy.status,
        pid: legacy.pid,
      }
    },
    activePaneId: /* pane id */,
    createdAt: legacy.createdAt,
    lastActiveAt: legacy.lastActiveAt,
    archived: legacy.archived,
  };
}
```

#### WindowStatus（窗口状态）

```typescript
enum WindowStatus {
  Running = 'running',           // 运行中
  WaitingForInput = 'waiting',   // 等待输入
  Completed = 'completed',       // 已完成
  Error = 'error',               // 出错
  Restoring = 'restoring'        // 恢复中（启动时）
}
```

#### Workspace（工作区）

```typescript
interface Workspace {
  version: string;               // 数据格式版本（如 "2.0"）
  windows: Window[];             // 窗口列表
  mruList: string[];             // MRU 窗口 ID 列表（Most Recently Used）
  settings: Settings;            // 全局设置
  lastSavedAt: string;           // 最后保存时间
}
```

**MRU 列表说明：**
- 记录窗口的最近使用顺序
- 用于 Ctrl+Tab 切换时的排序
- 窗口切换时自动更新
- 持久化到 workspace.json

#### Settings（设置）

```typescript
interface Settings {
  notificationsEnabled: boolean;  // 是否开启主动提醒
  theme: 'dark' | 'light';        // 主题（MVP 仅支持 dark）
  autoSave: boolean;              // 是否自动保存工作区
  autoSaveInterval: number;       // 自动保存间隔（秒）
}
```

### 数据流

**启动流程：**

```
1. 用户打开应用
   ↓
2. WorkspaceManager.load_workspace()
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

**状态更新流程：**

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

**窗口切换流程：**

```
1. 用户点击窗口卡片
   ↓
2. 前端调用：invoke('focus_window', { pid })
   ↓
3. WindowSwitcher.focus_window(pid)
   ↓
4. 平台特定 API 切换窗口
   ↓
5. 返回成功/失败
   ↓
6. 前端更新 activeWindowId
```

## API 设计

### Electron IPC Commands（渲染进程 → 主进程）

#### 窗口管理

```typescript
// 渲染进程调用
ipcRenderer.invoke('create-window', {
  name: string,
  workingDirectory: string,
  command?: string
}): Promise<Window>
```

创建新的任务窗口。

**参数：**
- `name`: 窗口名称
- `workingDirectory`: 工作目录路径
- `command`: 启动命令（可选，默认打开 shell）

**返回：** 创建的窗口对象

**错误：**
- 工作目录不存在
- 终端进程启动失败

---

```typescript
ipcRenderer.invoke('close-window', { windowId: string }): Promise<void>
```

关闭窗口（终止进程但保留配置）。

---

```typescript
ipcRenderer.invoke('delete-window', { windowId: string }): Promise<void>
```

删除窗口（终止进程并移除配置）。

---

```typescript
ipcRenderer.invoke('split-pane', {
  workingDirectory: string,
  command: string,
  windowId: string,
  paneId: string
}): Promise<{ pid: number }>
```

拆分窗格，创建新的 PTY 进程。

**参数：**
- `workingDirectory`: 新窗格的工作目录
- `command`: 新窗格的启动命令
- `windowId`: 所属窗口 ID
- `paneId`: 新窗格 ID

**返回：** 新窗格的进程 PID

---

```typescript
ipcRenderer.invoke('close-pane', {
  windowId: string,
  paneId: string
}): Promise<void>
```

关闭窗格，终止 PTY 进程。

---

```typescript
ipcRenderer.invoke('focus-window', { pid: number }): Promise<void>
```

切换到指定窗口。

**性能要求：** < 500ms

---

```typescript
ipcRenderer.invoke('get-windows'): Promise<Window[]>
```

获取所有窗口列表。

#### 工作区管理

```typescript
ipcRenderer.invoke('save-workspace'): Promise<void>
```

手动保存工作区配置。

---

```typescript
ipcRenderer.invoke('load-workspace'): Promise<Workspace>
```

加载工作区配置。

#### 设置管理

```typescript
ipcRenderer.invoke('get-settings'): Promise<Settings>
```

获取全局设置。

---

```typescript
ipcRenderer.invoke('update-settings', { settings: Settings }): Promise<void>
```

更新全局设置。

### Electron IPC Events（主进程 → 渲染进程）

#### window-created

窗口创建成功。

```typescript
ipcRenderer.on('window-created', (event, data: { window: Window }) => {
  // 处理窗口创建
});
```

#### window-status-changed

窗口状态变化。

```typescript
ipcRenderer.on('window-status-changed', (event, data: {
  windowId: string,
  status: WindowStatus,
  timestamp: string
}) => {
  // 处理状态变化
});
```

#### window-closed

窗口关闭。

```typescript
ipcRenderer.on('window-closed', (event, data: { windowId: string }) => {
  // 处理窗口关闭
});
```

#### workspace-saved

工作区保存成功。

```typescript
ipcRenderer.on('workspace-saved', (event, data: { timestamp: string }) => {
  // 处理保存成功
});
```

#### error

错误事件。

```typescript
ipcRenderer.on('error', (event, data: { message: string, code: string }) => {
  // 处理错误
});
```

### 前端 API 封装

```typescript
// src/api/windows.ts
export const windowsApi = {
  create: (name: string, workingDirectory: string, command?: string) =>
    ipcRenderer.invoke('create-window', { name, workingDirectory, command }),

  close: (windowId: string) =>
    ipcRenderer.invoke('close-window', { windowId }),

  delete: (windowId: string) =>
    ipcRenderer.invoke('delete-window', { windowId }),

  focus: (pid: number) =>
    ipcRenderer.invoke('focus-window', { pid }),

  getAll: () =>
    ipcRenderer.invoke('get-windows'),
};

// src/api/events.ts
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

## 性能优化策略

### 前端性能优化

1. **虚拟滚动**
   - 15+ 窗口时使用虚拟滚动（react-window）
   - 仅渲染可见区域的卡片
   - 减少 DOM 节点数量

2. **React 优化**
   - WindowCard 使用 React.memo 避免不必要的重渲染
   - 使用 useMemo 缓存计算结果
   - 使用 useCallback 稳定回调函数引用

3. **状态更新优化**
   - Zustand selector 精确订阅
   - 批量更新状态（React 18 自动批处理）
   - 避免频繁的全局状态更新

4. **资源加载优化**
   - 代码分割（React.lazy + Suspense）
   - Tailwind CSS 按需生成
   - 图标使用 SVG sprite

### 后端性能优化

1. **进程管理优化**
   - 进程启动并行化（Promise.all）
   - 缓存进程信息，减少系统调用
   - 使用 node-pty 的高效 PTY 实现

2. **状态检测优化**
   - 轮询间隔动态调整（活跃窗口 1s，非活跃 5s）
   - 仅检测必要的状态信息
   - 使用事件驱动 + 轮询混合模式

3. **窗口切换优化**
   - 缓存 PID → 窗口句柄映射
   - 预编译 AppleScript（macOS）
   - 异步执行，不阻塞主进程

4. **数据持久化优化**
   - 增量保存（仅保存变更的窗口）
   - 异步写入，不阻塞 UI
   - 使用 fs-extra 的高效文件操作

### 内存优化

1. **前端内存优化**
   - 及时清理事件监听器
   - 避免内存泄漏（useEffect cleanup）
   - 限制历史记录数量

2. **后端内存优化**
   - 使用 Node.js 的垃圾回收机制
   - 限制 PTY 输出缓冲区大小
   - 定期清理僵尸进程
   - 避免内存泄漏（及时清理事件监听器）

### 性能监控

**关键指标：**
- 窗口切换响应时间（目标 < 500ms）
- 状态更新延迟（目标 < 1s）
- 启动恢复时间（目标 < 5s）
- 内存占用（目标 < 100MB）
- CPU 占用（目标 < 5%）

**性能监控：**
- 开发环境：React DevTools Profiler + Chrome DevTools
- 生产环境：Electron 内置性能 API
- 日志记录：关键操作的耗时

## 安全性设计

### 数据安全

1. **本地存储安全**
   - 工作区配置仅存储在本地
   - 不上传到任何远程服务器
   - 文件权限：仅当前用户可读写

2. **敏感信息保护**
   - 不存储终端输出内容（仅存储摘要）
   - 不记录用户输入
   - 不收集遥测数据

3. **数据完整性**
   - 原子写入防止数据损坏
   - 定期备份（保留最近 3 个版本）
   - 加载时校验数据格式

### 进程安全

1. **进程隔离**
   - 每个终端进程独立运行
   - 单个进程崩溃不影响其他进程
   - 应用崩溃不影响终端进程（进程继续运行）

3. **权限控制**
   - 最小权限原则
   - 仅请求必要的系统权限
   - Electron 的 contextIsolation 和 nodeIntegration 配置

3. **命令注入防护**
   - 启动命令参数化，避免 shell 注入
   - 工作目录路径验证
   - 禁止执行任意系统命令

### 依赖安全

1. **依赖审计**
   - 定期运行 `npm audit`（Node.js 依赖）
   - 及时更新有安全漏洞的依赖

2. **供应链安全**
   - 锁定依赖版本（Cargo.lock / package-lock.json）
   - 使用官方源（crates.io / npm registry）
   - 审查第三方依赖代码

## 错误处理与日志

### 错误处理策略

**分类：**

1. **用户错误**
   - 工作目录不存在
   - 启动命令无效
   - 权限不足

   **处理：** 友好的错误提示，引导用户修正

2. **系统错误**
   - 进程启动失败
   - 文件读写失败
   - 窗口切换失败

   **处理：** 记录日志，提示用户重试或联系支持

3. **致命错误**
   - 数据损坏
   - 内存不足
   - 系统 API 不可用

   **处理：** 记录日志，安全退出，保护数据

### 错误恢复

1. **自动恢复**
   - 进程崩溃自动重启（可选）
   - 数据损坏时从备份恢复
   - 网络错误自动重试

2. **用户介入**
   - 无法自动恢复时提示用户
   - 提供手动恢复选项
   - 提供错误报告功能

### 日志系统

**日志级别：**
- ERROR: 错误事件
- WARN: 警告事件
- INFO: 关键操作（启动、关闭、窗口创建）
- DEBUG: 调试信息（仅开发环境）

**日志存储：**
- Windows: `%APPDATA%/ausome-terminal/logs/`
- macOS: `~/Library/Logs/ausome-terminal/`
- 日志轮转：每天一个文件，保留最近 7 天

**日志内容：**
- 时间戳
- 日志级别
- 模块名称
- 消息内容
- 上下文信息（窗口 ID、进程 PID 等）

**隐私保护：**
- 不记录终端输出内容
- 不记录用户输入
- 不记录工作目录路径（仅记录是否存在）

## 测试策略

### 单元测试

**后端（Node.js + TypeScript）：**
- ProcessManager: 进程启动、监控、终止
- StatusDetector: 状态检测逻辑
- WorkspaceManager: 数据读写、备份恢复
- ViewSwitcher: 视图切换逻辑

**前端（TypeScript）：**
- Zustand store: 状态管理逻辑
- API 封装: 调用正确性
- 工具函数: 数据转换、格式化

**工具：**
- Node.js: Jest + ts-jest
- TypeScript: Jest + React Testing Library

**覆盖率目标：** > 80%

### 集成测试

**测试场景：**
1. 创建窗口 → 启动进程 → 检测状态 → 切换窗口 → 关闭窗口
2. 保存工作区 → 关闭应用 → 重新打开 → 恢复工作区
3. 多窗口并行管理（10+ 窗口）
4. 进程崩溃恢复
5. 数据损坏恢复

**工具：**
- Electron 集成测试框架（Spectron 或 Playwright）
- 模拟终端进程（使用 node-pty）

### 端到端测试

**测试场景：**
1. 首次启动 → 创建窗口 → 使用 → 关闭
2. 日常使用 → 恢复工作区 → 管理多窗口
3. 异常场景 → 进程崩溃 → 数据恢复

**工具：**
- Playwright（自动化 UI 测试）
- 真实终端环境

### 性能测试

**测试指标：**
- 窗口切换响应时间
- 状态更新延迟
- 启动恢复时间
- 内存占用
- CPU 占用

**测试场景：**
- 10 个窗口
- 15 个窗口
- 20 个窗口（压力测试）

**工具：**
- Node.js: benchmark.js 或 clinic.js
- 前端: Lighthouse（性能分析）

### 跨平台测试

**测试平台：**
- Windows 10/11
- macOS 12+（Intel + Apple Silicon）

**测试内容：**
- 功能一致性
- 性能一致性
- UI 一致性

## 部署与发布

### 构建流程

**开发构建：**

```bash
# 前端开发服务器
npm run dev

# Electron 开发模式（热重载）
npm run electron:dev
```

**生产构建：**

```bash
# 构建前端 + 打包应用
npm run build
npm run electron:build
```

**输出：**
- Windows: `.exe` 安装程序（NSIS）
- macOS: `.dmg` 磁盘镜像 + `.app` 应用包

### CI/CD 流程

**GitHub Actions 工作流：**

1. **测试流程**（每次 push/PR）
   - 运行单元测试
   - 运行集成测试
   - 代码质量检查（clippy / eslint）

2. **构建流程**（每次 tag）
   - 跨平台构建（Windows + macOS）
   - 生成安装包
   - 上传到 GitHub Releases

3. **发布流程**（手动触发）
   - 创建 Release Notes
   - 发布到 GitHub Releases
   - 触发自动更新检查

### 版本管理

**版本号规则：** 语义化版本（Semantic Versioning）

- MAJOR.MINOR.PATCH（如 1.0.0）
- MAJOR: 不兼容的 API 变更
- MINOR: 向后兼容的功能新增
- PATCH: 向后兼容的问题修复

**发布节奏：**
- MVP: 3 个月内完成 1.0.0
- 后续: 每 2-4 周一个小版本
- 紧急修复: 随时发布 Patch 版本

### 自动更新（Post-MVP）

**更新检查：**
- 启动时检查 GitHub Releases API
- 发现新版本时提示用户
- 用户确认后下载安装

**更新流程：**
1. 下载新版本安装包
2. 验证签名
3. 关闭当前应用
4. 安装新版本
5. 启动新版本

**技术方案：**
- electron-updater（基于 Squirrel）
- 基于 GitHub Releases
- 无需自建服务器

## 开发路线图

### Phase 1: MVP 开发（3 个月）

**Month 1: 核心基础**
- ✅ 技术栈搭建（Electron + React + TypeScript）
- ✅ 基础 UI 框架（Radix UI + Tailwind CSS）
- ✅ 进程管理服务（ProcessManager - node-pty）
- ✅ 数据持久化（WorkspaceManager - fs-extra）

**Month 2: 核心功能**
- ✅ 统一视图（WindowCard + CardGrid）
- ✅ 窗口切换（WindowSwitcher - robotjs）
- ✅ 状态检测（StatusDetector - pidusage）
- ✅ 工作区恢复

**Month 3: 打磨与测试**
- ✅ 性能优化（< 500ms 切换，< 5s 恢复）
- ✅ 跨平台测试（Windows + macOS）
- ✅ 自用验证（连续 30 天）
- ✅ 文档编写（README + 用户指南）

**MVP 交付标准：**
- 所有核心功能可用
- 性能达标
- 自用验证通过
- 无已知严重 Bug

### Phase 2: 开源发布（3-6 个月）

**Month 4: 开源准备**
- 代码清理与重构
- 开源协议选择（MIT / Apache 2.0）
- 贡献指南编写
- Issue/PR 模板

**Month 5-6: 社区建设**
- GitHub 发布
- 社区反馈收集
- Bug 修复
- 功能迭代

**目标：**
- GitHub Stars 达到 30,000+
- 建立活跃社区
- 用户留存率 > 50%

### Phase 3: 功能扩展（6-12 个月）

**Post-MVP 功能：**
- 系统托盘和后台运行
- 系统通知
- 窗口别名/自定义命名
- 按状态分组排序
- 自动更新
- 更多终端工具支持
- Linux 平台支持

**Vision 功能：**
- 任务进度估算
- 历史记录和任务统计
- 团队协作功能
- 智能并行任务编排

## 风险与缓解

### 技术风险

**风险 1: 状态检测准确率不足**
- 影响：核心功能体验差，用户放弃使用
- 概率：中
- 缓解：
  - 早期原型验证
  - 多种检测策略组合（CPU + 输出 + 光标）
  - 允许用户手动标记状态（降级方案）

**风险 2: 窗口切换性能不达标**
- 影响：用户体验差于 Alt+Tab，产品失去价值
- 概率：低
- 缓解：
  - 性能基准测试
  - 缓存优化
  - 异步执行

**风险 3: 跨平台兼容性问题**
- 影响：某个平台功能不可用
- 概率：中
- 缓解：
  - 平台抽象层设计
  - 早期跨平台测试
  - 优先保证 Windows 可用（主要用户群）

**风险 4: Electron 性能问题**
- 影响：内存占用高，启动慢
- 概率：低
- 缓解：
  - 性能优化（虚拟滚动、React 优化）
  - 延迟加载非核心功能
  - 用户机器通常有足够资源（8GB+ 内存）

### 资源风险

**风险 4: 开发时间超出预期**
- 影响：MVP 延期，自用验证推迟
- 概率：低（Electron 生态成熟，开发效率高）
- 缓解：
  - 严格控制 MVP 范围
  - 使用成熟的 npm 库（node-pty、robotjs）
  - 延后非核心功能

### 市场风险

**风险 5: 用户需求不真实**
- 影响：开源后无人使用
- 概率：低
- 缓解：
  - 自用验证（如果自己都不用，说明需求不真实）
  - 早期用户访谈
  - 小范围内测

**风险 6: 竞品出现**
- 影响：市场被抢占
- 概率：低
- 缓解：
  - 快速迭代，保持领先
  - 开源社区建设，形成护城河
  - 专注核心价值（智能状态感知）

## 成功指标

### MVP 阶段

- ✅ 自用验证通过：连续使用 30 天无回退
- ✅ 性能达标：窗口切换 < 500ms，状态更新 < 1s，启动恢复 < 5s
- ✅ 稳定性达标：管理 10+ 窗口无崩溃
- ✅ 核心功能完整：统一视图、状态追踪、工作区恢复

### 开源阶段

- 🎯 GitHub Stars 达到 30,000+
- 🎯 用户留存率 > 50%（下载后持续使用）
- 🎯 社区活跃度：每周 > 10 个 Issue/PR
- 🎯 用户反馈正面：> 80% 好评

### 长期目标

- 🎯 成为 AI CLI 工具开发者的标配工具
- 🎯 支持 3 大平台（Windows + macOS + Linux）
- 🎯 月活用户 > 10,000
- 🎯 从"窗口管理"进化到"智能任务编排"

## 附录

### 技术栈总结

| 层级 | 技术选型 | 版本 |
|------|---------|------|
| 桌面框架 | Electron | 28.x+ |
| 主进程语言 | Node.js + TypeScript | 20.x+ |
| 前端框架 | React | 18.x |
| 前端语言 | TypeScript | 5.x |
| UI 组件库 | Radix UI | 1.x |
| CSS 框架 | Tailwind CSS | 3.x |
| 状态管理 | Zustand | 4.x |
| 构建工具 | Vite | 5.x |
| 终端集成 | node-pty | 1.x |
| 终端渲染 | xterm.js | 5.x |
| 文件操作 | fs-extra | 11.x |
| 进程监控 | pidusage | 3.x |\n| 布局拆分 | react-resizable-panels | 2.x |
| UUID 生成 | uuid | 9.x |
| 测试框架 | Jest + React Testing Library | latest |

### 参考资料

**技术文档：**
- Electron 官方文档: https://www.electronjs.org/
- Node.js 官方文档: https://nodejs.org/
- React 官方文档: https://react.dev/
- Radix UI 文档: https://www.radix-ui.com/
- node-pty 文档: https://github.com/microsoft/node-pty
- xterm.js 文档: https://xtermjs.org/

**设计灵感：**
- Auto-Claude: 多会话 AI 编码工具
- Windows Terminal: 现代终端体验
- VS Code: 桌面应用性能优化

**竞品分析：**
- tmux: 终端复用器（CLI）
- screen: 终端会话管理（CLI）
- iTerm2: macOS 终端增强

---

**文档版本：** 1.0
**最后更新：** 2026-02-28
**作者：** 立哥

