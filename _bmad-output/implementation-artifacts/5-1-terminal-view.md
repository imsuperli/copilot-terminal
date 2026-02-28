# Story 5.1: 终端视图（TerminalView）

Status: ready-for-dev

## Story

As a 用户,
I want 切入窗口后在应用内看到终端的全屏视图,
So that 可以专注在当前任务的 CLI 操作上。

## Acceptance Criteria

1. **Given** WindowCard 组件已实现（Epic 3）
   **When** 实现 TerminalView 组件
   **Then** 顶部显示窄条（高度约 40px），包含返回按钮、当前窗口名称、状态标签

2. **Given** TerminalView 组件已实现
   **When** 渲染终端内容区
   **Then** 终端内容区占满剩余空间，显示 PTY 输出

3. **Given** TerminalView 组件已实现
   **When** 渲染终端内容
   **Then** 终端内容区使用 xterm.js 渲染终端输出

4. **Given** TerminalView 组件已实现
   **When** 在终端中操作
   **Then** 终端支持所有原生功能：输入、输出、颜色、光标（FR12）

5. **Given** TerminalView 组件已实现
   **When** 选中终端文本
   **Then** 支持划选复制：选中文本自动复制到剪贴板

6. **Given** TerminalView 组件已实现
   **When** 右键点击终端
   **Then** 支持右键粘贴：右键点击粘贴剪贴板内容

7. **Given** TerminalView 组件已实现
   **When** 用户点击返回按钮
   **Then** 返回按钮点击后返回统一视图

8. **Given** TerminalView 组件已实现
   **When** 用户按下 Esc 键
   **Then** 支持 Esc 键快捷键返回统一视图

9. **Given** TerminalView 组件已实现
   **When** 终端获得焦点
   **Then** 所有键盘输入传递给 PTY 进程

10. **Given** TerminalView 组件已实现
    **When** 调整应用窗口大小
    **Then** 终端视图自适应窗口大小

## Tasks / Subtasks

- [ ] Task 1: 安装和配置 xterm.js (AC: 3)
  - [ ] 1.1 安装 xterm.js：`npm install xterm`
  - [ ] 1.2 安装 xterm.js CSS：`npm install xterm-addon-fit`
  - [ ] 1.3 在 `src/renderer/styles/xterm.css` 中导入 xterm 样式
  - [ ] 1.4 配置 xterm 主题（深色主题，匹配应用风格）

- [ ] Task 2: 创建 TerminalView 组件基础结构 (AC: 1-2, 10)
  - [ ] 2.1 创建 `src/renderer/components/TerminalView.tsx`
  - [ ] 2.2 定义 Props 接口：`TerminalViewProps { window: Window, onReturn: () => void }`
  - [ ] 2.3 实现容器：使用 Flexbox 纵向布局，占满整个内容区
  - [ ] 2.4 实现顶部窄条（高度 40px）：返回按钮 + 窗口名称 + 状态标签
  - [ ] 2.5 实现终端内容区：占满剩余空间（flex-1）
  - [ ] 2.6 使用 useRef 创建终端容器 DOM 元素

- [ ] Task 3: 集成 xterm.js 渲染终端 (AC: 2-4)
  - [ ] 3.1 在 useEffect 中初始化 xterm.js Terminal 实例
  - [ ] 3.2 配置 Terminal 选项：cols, rows, theme, fontFamily, fontSize
  - [ ] 3.3 将 Terminal 挂载到容器 DOM 元素
  - [ ] 3.4 使用 FitAddon 自动调整终端大小
  - [ ] 3.5 监听窗口 resize 事件，动态调整终端大小
  - [ ] 3.6 清理：组件卸载时销毁 Terminal 实例

- [ ] Task 4: 实现 PTY 输出渲染 (AC: 2-4)
  - [ ] 4.1 从 ProcessManager 获取 PTY 实例或输出流
  - [ ] 4.2 监听 PTY 的 `data` 事件
  - [ ] 4.3 将 PTY 输出写入 xterm.js Terminal：`terminal.write(data)`
  - [ ] 4.4 支持 ANSI 颜色和格式化（xterm.js 原生支持）

- [ ] Task 5: 实现用户输入传递 (AC: 4, 9)
  - [ ] 5.1 监听 xterm.js 的 `data` 事件（用户输入）
  - [ ] 5.2 将用户输入写入 PTY：`ptyProcess.write(data)`
  - [ ] 5.3 确保所有键盘输入都传递给 PTY（包括特殊键如 Ctrl+C）
  - [ ] 5.4 测试常见命令：ls, cd, npm, python 等

- [ ] Task 6: 实现划选复制功能 (AC: 5)
  - [ ] 6.1 xterm.js 原生支持划选复制
  - [ ] 6.2 配置 Terminal 选项：`selectionBackground: '#0087ff'`
  - [ ] 6.3 监听选中事件，自动复制到剪贴板
  - [ ] 6.4 使用 Electron 的 `clipboard` API 实现复制

- [ ] Task 7: 实现右键粘贴功能 (AC: 6)
  - [ ] 7.1 监听终端容器的 `contextmenu` 事件
  - [ ] 7.2 右键点击时，从剪贴板读取内容
  - [ ] 7.3 将剪贴板内容写入 PTY
  - [ ] 7.4 使用 Electron 的 `clipboard` API 实现粘贴

- [ ] Task 8: 实现返回按钮和快捷键 (AC: 7-8)
  - [ ] 8.1 实现返回按钮：点击时调用 onReturn 回调
  - [ ] 8.2 监听键盘事件：Esc 键按下时调用 onReturn 回调
  - [ ] 8.3 确保 Esc 键不被 PTY 捕获（需要在 xterm.js 之前处理）
  - [ ] 8.4 添加返回按钮的 hover 和 focus 状态

- [ ] Task 9: 实现窗口自适应 (AC: 10)
  - [ ] 9.1 使用 ResizeObserver 监听容器大小变化
  - [ ] 9.2 容器大小变化时，调用 FitAddon.fit() 重新计算终端大小
  - [ ] 9.3 确保终端大小与容器大小同步
  - [ ] 9.4 测试窗口缩放、最大化、最小化等操作

- [ ] Task 10: 编写单元测试 (AC: 1-10)
  - [ ] 10.1 创建 `src/renderer/components/__tests__/TerminalView.test.tsx`
  - [ ] 10.2 测试组件渲染：验证顶部窄条和终端内容区显示
  - [ ] 10.3 测试 xterm.js 初始化：验证 Terminal 实例创建
  - [ ] 10.4 测试 PTY 输出渲染：验证输出正确显示在终端
  - [ ] 10.5 测试用户输入传递：验证输入正确发送到 PTY
  - [ ] 10.6 测试返回按钮和 Esc 键：验证回调被调用
  - [ ] 10.7 测试窗口自适应：验证终端大小随容器变化

## Dev Notes

### 架构约束与技术要求

**TerminalView 组件设计（架构文档）：**

**职责：** 切入窗口后的 CLI 全屏视图，保持终端原生体验

**Anatomy：** 
- 顶部窄条（返回按钮 + 当前窗口名称 + 状态）
- 终端内容区（占满剩余空间）

**Actions：** 返回统一视图（按钮或 Esc 快捷键）

**Accessibility：** 终端区域获得焦点后，所有键盘输入传递给终端进程

**技术实现（架构文档）：**
- 使用 `node-pty` 创建 PTY 进程
- 使用 `xterm.js` 在应用内渲染终端内容
- 监听 `data` 事件获取输出
- 监听 `exit` 事件检测进程退出
- 通过 `write()` 方法发送用户输入
- 实现划选复制和右键粘贴功能

**性能目标（架构文档）：**
- 视图切换 < 100ms（纯 UI 切换，无外部窗口操作）
- 终端输出实时显示，无明显延迟

### UX 规范要点

**TerminalView 设计（UX 设计文档 Component Strategy）：**

**Purpose：** 切入窗口后的 CLI 全屏视图，保持终端原生体验

**Anatomy：**
- 顶部窄条（返回按钮 + 当前窗口名称 + 状态）
- 终端内容区（占满剩余空间）

**Actions：** 返回统一视图（按钮或 Esc 快捷键）

**Accessibility：** 终端区域获得焦点后，所有键盘输入传递给终端进程

**视觉设计规范（UX 设计文档 Visual Design Foundation）：**

**颜色系统：**
- 背景：应用标准深色（`bg-zinc-900`）
- 文字：低饱和度暖灰（`text-zinc-100`）
- 返回按钮：Ghost 样式（无边框，仅图标）

**字体系统：**
- 窗口名称：中等字号（`text-base`），加粗（`font-semibold`）
- 状态标签：小字号（`text-xs`）
- 终端文字：等宽字体（`font-mono`）

**间距系统：**
- 顶部窄条高度：40px
- 顶部窄条内边距：8px（`px-2 py-2`）
- 返回按钮大小：32x32px

**无障碍要求（UX 设计文档 Accessibility Strategy）：**
- 返回按钮有清晰的焦点环
- 支持键盘导航（Tab 键）
- Esc 键返回统一视图
- 终端内容可被屏幕阅读器访问（xterm.js 支持）

### 技术实现指导

**xterm.js 初始化：**
```typescript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const terminal = new Terminal({
  cols: 80,
  rows: 30,
  theme: {
    background: '#0f0f0f',
    foreground: '#e0e0e0',
    cursor: '#e0e0e0',
  },
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 12,
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(containerElement);
fitAddon.fit();
```

**PTY 输出渲染：**
```typescript
// 监听 PTY 输出
ptyProcess.onData((data: string) => {
  terminal.write(data);
});

// 监听用户输入
terminal.onData((data: string) => {
  ptyProcess.write(data);
});
```

**划选复制实现：**
```typescript
import { clipboard } from 'electron';

terminal.onSelectionChange(() => {
  const selection = terminal.getSelection();
  if (selection) {
    clipboard.writeText(selection);
  }
});
```

**右键粘贴实现：**
```typescript
containerElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const text = clipboard.readText();
  terminal.write(text);
});
```

**窗口自适应：**
```typescript
const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
});

resizeObserver.observe(containerElement);

// 清理
return () => {
  resizeObserver.disconnect();
};
```

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要忘记安装 xterm.js 和 xterm-addon-fit — 必须先安装依赖
2. 不要忘记导入 xterm.css — 样式必须加载
3. 不要忘记配置 xterm 主题 — 必须匹配应用深色主题
4. 不要忘记清理 Terminal 实例 — 组件卸载时必须销毁
5. 不要忘记处理 Esc 键 — 必须在 xterm.js 之前捕获
6. 不要忘记实现窗口自适应 — 必须使用 ResizeObserver
7. 不要忘记测试特殊键 — Ctrl+C, Ctrl+D, Tab 等
8. 不要忘记测试复制粘贴 — 必须在不同平台测试

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
└── renderer/
    ├── components/
    │   ├── TerminalView.tsx                    # 新建 - 终端视图组件
    │   └── __tests__/
    │       └── TerminalView.test.tsx           # 新建 - TerminalView 测试
    └── styles/
        └── xterm.css                           # 新建 - xterm.js 样式导入
```

**与统一项目结构的对齐：**
- 组件放在 `src/renderer/components/`
- 样式放在 `src/renderer/styles/`
- 测试文件在对应模块的 `__tests__/` 目录

**依赖安装：**
```bash
npm install xterm xterm-addon-fit
```

### References

- [Source: epics.md#Story 5.1 - 终端视图验收标准]
- [Source: epics.md#Epic 5: 快速窗口切换]
- [Source: architecture.md#决策 1: 终端集成方式]
- [Source: architecture.md#TerminalView 组件设计]
- [Source: ux-design-specification.md#Component Strategy - TerminalView 组件规范]
- [Source: ux-design-specification.md#Visual Design Foundation - 颜色系统、字体系统]
- [Source: ux-design-specification.md#Accessibility Strategy - 无障碍要求]
- [Source: 3-1-window-card-component.md - WindowCard 组件]
- [Source: 2-1-process-management-service-infrastructure.md - ProcessManager 服务]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
