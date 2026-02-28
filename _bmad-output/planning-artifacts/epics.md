---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - 'prd.md'
  - 'architecture.md'
  - 'ux-design-specification.md'
---

# ausome-terminal - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for ausome-terminal, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**工作区管理：**
- FR1: 用户可以创建新的任务窗口，指定工作目录和启动命令
- FR2: 用户可以查看所有任务窗口的列表
- FR3: 用户可以关闭/删除任务窗口
- FR4: 系统可以保存所有窗口配置（工作目录、启动命令）
- FR5: 系统可以在应用重启后自动恢复所有窗口配置和状态

**窗口状态管理：**
- FR6: 系统可以自动检测每个窗口的运行状态（运行中/等待输入/已完成/出错）
- FR7: 系统可以实时更新窗口状态显示
- FR8: 用户可以查看每个窗口的当前工作目录
- FR9: 用户可以查看每个窗口的当前运行状态
- FR10: 系统可以通过视觉编码区分不同状态的窗口（颜色编码）

**窗口交互：**
- FR11: 用户可以点击窗口卡片进入对应的 CLI 窗口
- FR12: 系统可以在窗口切换时保持 CLI 的所有原生功能和操作
- FR13: 系统可以快速响应窗口切换操作

**进程管理：**
- FR14: 系统可以启动终端进程（Windows Terminal + pwsh7 或 macOS 默认终端）
- FR15: 系统可以监控终端进程的运行状态
- FR16: 系统可以终止终端进程

**平台支持：**
- FR17: 系统可以在 Windows 平台上运行
- FR18: 系统可以在 macOS 平台上运行
- FR19: 系统可以在 Windows 上支持 Windows Terminal + pwsh7 组合
- FR20: 系统可以在 macOS 上支持默认终端 + zsh/bash 组合

**数据持久化：**
- FR21: 系统可以将工作区配置保存到本地存储
- FR22: 系统可以从本地存储加载工作区配置
- FR23: 系统可以在应用崩溃或异常退出后恢复工作区状态

### NonFunctional Requirements

**性能：**
- NFR1: 窗口切换操作响应时间 < 500ms
- NFR2: 窗口状态更新延迟 < 1s
- NFR3: 应用启动并恢复工作区（10+ 窗口）时间 < 5s
- NFR4: 管理 15+ 窗口时，UI 操作无明显卡顿

**可靠性：**
- NFR5: 工作区配置数据零丢失——应用崩溃或异常退出后，工作区配置可完整恢复
- NFR6: 管理 10+ 窗口时运行稳定，无崩溃
- NFR7: 单个终端进程异常不影响其他窗口和应用整体稳定性

**集成：**
- NFR8: 与 Windows Terminal + pwsh7 集成时，不影响终端的原生功能和操作
- NFR9: 与 macOS 默认终端 + zsh/bash 集成时，不影响终端的原生功能和操作
- NFR10: 状态检测机制不影响终端进程的正常运行和性能

**安全：**
- NFR11: 工作区配置数据仅存储在本地，不上传到任何远程服务器
- NFR12: 不收集或传输用户遥测数据

### Additional Requirements

**架构相关需求：**
- 使用 Electron 作为桌面应用框架
- 前端采用 React + TypeScript + Radix UI + Tailwind CSS
- 状态管理使用 Zustand
- 使用 node-pty 进行终端集成（PTY 进程管理）
- 使用 robotjs / node-window-manager 进行窗口切换
- 使用 fs-extra 进行文件操作
- 使用 pidusage 进行进程监控
- 数据持久化使用本地 JSON 文件（原子写入 + 备份）
- 存储路径：Windows: `%APPDATA%/ausome-terminal/workspace.json`，macOS: `~/Library/Application Support/ausome-terminal/workspace.json`

**UX 相关需求：**
- 采用深色主题，低饱和度暖色调配色
- 窗口卡片使用圆弧形彩色顶部线条区分状态（蓝色=运行中、黄色=等待输入、绿色=已完成、红色=出错）
- 响应式网格卡片布局，自动调整每行卡片数量
- 工具栏显示状态统计（各状态窗口数量）
- 支持键盘导航（Tab/Enter/Esc）
- 符合 WCAG 2.1 AA 无障碍标准
- 所有交互无过渡动画，追求即时响应感
- 空状态引导用户创建第一个窗口
- 启动时显示卡片骨架屏，进程恢复在后台进行

### FR Coverage Map

**工作区管理：**
- FR1: Epic 2 - 用户可以创建新的任务窗口，指定工作目录和启动命令
- FR2: Epic 2, Epic 3 - 用户可以查看所有任务窗口的列表
- FR3: Epic 2 - 用户可以关闭/删除任务窗口
- FR4: Epic 6 - 系统可以保存所有窗口配置（工作目录、启动命令）
- FR5: Epic 6 - 系统可以在应用重启后自动恢复所有窗口配置和状态

**窗口状态管理：**
- FR6: Epic 4 - 系统可以自动检测每个窗口的运行状态（运行中/等待输入/已完成/出错）
- FR7: Epic 4 - 系统可以实时更新窗口状态显示
- FR8: Epic 3 - 用户可以查看每个窗口的当前工作目录
- FR9: Epic 3 - 用户可以查看每个窗口的当前运行状态
- FR10: Epic 3 - 系统可以通过视觉编码区分不同状态的窗口（颜色编码）

**窗口交互：**
- FR11: Epic 5 - 用户可以点击窗口卡片进入对应的 CLI 窗口
- FR12: Epic 5 - 系统可以在窗口切换时保持 CLI 的所有原生功能和操作
- FR13: Epic 5 - 系统可以快速响应窗口切换操作

**进程管理：**
- FR14: Epic 2 - 系统可以启动终端进程（Windows Terminal + pwsh7 或 macOS 默认终端）
- FR15: Epic 2 - 系统可以监控终端进程的运行状态
- FR16: Epic 2 - 系统可以终止终端进程

**平台支持：**
- FR17: Epic 1 - 系统可以在 Windows 平台上运行
- FR18: Epic 1 - 系统可以在 macOS 平台上运行
- FR19: Epic 2 - 系统可以在 Windows 上支持 Windows Terminal + pwsh7 组合
- FR20: Epic 2 - 系统可以在 macOS 上支持默认终端 + zsh/bash 组合

**数据持久化：**
- FR21: Epic 6 - 系统可以将工作区配置保存到本地存储
- FR22: Epic 6 - 系统可以从本地存储加载工作区配置
- FR23: Epic 6 - 系统可以在应用崩溃或异常退出后恢复工作区状态

## Epic List

### Epic 1: 项目初始化与基础架构
建立 Electron 应用基础框架，用户可以启动应用并看到基本界面。
**FRs covered:** FR17, FR18

### Epic 2: 终端进程管理
用户可以创建、查看和管理终端任务窗口，每个窗口运行独立的终端进程。
**FRs covered:** FR1, FR2, FR3, FR14, FR15, FR16, FR19, FR20

### Epic 3: 统一视图与窗口展示
用户可以在统一界面中查看所有任务窗口的基本信息（工作目录、状态）。
**FRs covered:** FR2, FR8, FR9, FR10

### Epic 4: 智能状态追踪
系统自动检测并实时更新每个窗口的运行状态，用户一眼看到哪些窗口需要介入。
**FRs covered:** FR6, FR7

### Epic 5: 快速窗口切换
用户可以点击窗口卡片快速切换到对应的 CLI 环境，在应用内查看和操作终端。
**FRs covered:** FR11, FR12, FR13

### Epic 6: 工作区持久化
用户关闭应用后，下次打开自动恢复所有窗口配置和状态，零重复配置。
**FRs covered:** FR4, FR5, FR21, FR22, FR23

## Epic 1: 项目初始化与基础架构

建立 Electron 应用基础框架，用户可以启动应用并看到基本界面。

### Story 1.1: Electron 应用脚手架搭建

As a 开发者,
I want 创建基础 Electron 项目结构并配置主进程和渲染进程,
So that 可以在 Windows 和 macOS 平台上启动应用。

**Acceptance Criteria:**

**Given** 开发环境已安装 Node.js 20.x+
**When** 执行 npm install 和 npm run dev
**Then** Electron 应用成功启动，显示空白窗口
**And** 主进程和渲染进程正确通信（IPC 基础配置）
**And** 应用可以在 Windows 和 macOS 上运行（FR17, FR18）
**And** 开发环境支持热重载

### Story 1.2: React + TypeScript 前端框架集成

As a 开发者,
I want 集成 React、TypeScript 和 Vite 构建工具,
So that 可以使用现代前端技术栈开发 UI。

**Acceptance Criteria:**

**Given** Electron 应用脚手架已搭建（Story 1.1）
**When** 配置 React + TypeScript + Vite
**Then** 渲染进程可以渲染 React 组件
**And** TypeScript 类型检查正常工作
**And** Vite 热重载在开发模式下正常工作
**And** 可以成功构建生产版本

### Story 1.3: UI 设计系统基础

As a 开发者,
I want 集成 Radix UI、Tailwind CSS 并建立深色主题设计令牌,
So that 可以快速实现符合 UX 规范的界面组件。

**Acceptance Criteria:**

**Given** React 前端框架已集成（Story 1.2）
**When** 配置 Radix UI 和 Tailwind CSS
**Then** Tailwind CSS 样式正常应用
**And** 深色主题设计令牌已定义（背景色、文字色、状态色、间距、圆角）
**And** 可以使用 Radix UI 的基础组件（Button, Dialog, Tooltip）
**And** 设计令牌通过 CSS 变量定义，支持未来主题扩展

### Story 1.4: 应用主窗口与基础布局

As a 用户,
I want 打开应用后看到基础界面布局,
So that 可以开始使用应用的核心功能。

**Acceptance Criteria:**

**Given** UI 设计系统基础已建立（Story 1.3）
**When** 启动应用
**Then** 显示应用主窗口，包含顶部工具栏和主内容区
**And** 工具栏显示应用名称和版本号
**And** 主内容区显示空状态提示（"创建你的第一个任务窗口"）
**And** 界面使用深色主题，符合 UX 设计规范
**And** 窗口最小尺寸为 480x360px
**And** 窗口可以调整大小，布局自适应

## Epic 2: 终端进程管理

用户可以创建、查看和管理终端任务窗口，每个窗口运行独立的终端进程。

### Story 2.1: 进程管理服务基础架构

As a 开发者,
I want 创建 ProcessManager 服务封装 node-pty 进程操作,
So that 可以跨平台启动、监控和终止终端进程。

**Acceptance Criteria:**

**Given** Electron 应用基础框架已建立（Epic 1）
**When** 实现 ProcessManager 服务
**Then** 可以使用 node-pty 创建 PTY 进程（FR14）
**And** Windows 平台启动 pwsh.exe（FR19）
**And** macOS 平台启动 zsh 或 bash（FR20）
**And** 可以监控进程状态（存活/退出）（FR15）
**And** 可以终止进程（FR16）
**And** 进程退出时触发事件通知
**And** 单个进程异常不影响其他进程（NFR7）

### Story 2.2: 创建新任务窗口

As a 用户,
I want 通过对话框创建新的任务窗口并指定工作目录和启动命令,
So that 可以为不同项目启动独立的 CLI 环境。

**Acceptance Criteria:**

**Given** 进程管理服务已实现（Story 2.1）
**When** 点击"新建窗口"按钮
**Then** 显示新建窗口对话框，包含三个字段：窗口名称（可选）、工作目录（必填）、启动命令（可选）（FR1）
**And** 工作目录支持手动输入和文件夹选择器
**And** 工作目录输入后立即验证路径是否存在，无效时显示错误提示
**And** 启动命令为空时默认打开 shell
**And** 点击"创建"后，系统启动终端进程并创建窗口记录
**And** 新窗口数据保存到 Zustand store
**And** 对话框支持 Tab 键导航和 Enter 键提交
**And** 对话框支持 Esc 键关闭

### Story 2.3: 窗口列表状态管理

As a 开发者,
I want 使用 Zustand 管理窗口列表状态,
So that 前端可以响应式地展示和更新窗口信息。

**Acceptance Criteria:**

**Given** 窗口创建功能已实现（Story 2.2）
**When** 实现 Zustand store
**Then** store 包含 windows 数组，存储所有窗口对象（FR2）
**And** 每个窗口对象包含：id, name, workingDirectory, command, status, pid, createdAt, lastActiveAt
**And** 提供 addWindow 方法添加新窗口
**And** 提供 removeWindow 方法删除窗口
**And** 提供 updateWindowStatus 方法更新窗口状态
**And** 提供 setActiveWindow 方法设置当前活跃窗口
**And** 前端组件可以订阅 store 变化并自动重渲染

### Story 2.4: 关闭和删除窗口

As a 用户,
I want 关闭或删除不再需要的任务窗口,
So that 可以清理工作区并释放系统资源。

**Acceptance Criteria:**

**Given** 窗口列表状态管理已实现（Story 2.3）
**When** 右键点击窗口卡片或点击操作按钮
**Then** 显示操作菜单，包含"关闭窗口"和"删除窗口"选项（FR3）
**And** 选择"关闭窗口"时，显示确认对话框："确定关闭？终端进程将被终止"
**And** 选择"删除窗口"时，显示确认对话框："确定删除？窗口配置将被移除"
**And** 用户确认后，系统终止对应的终端进程（FR16）
**And** 窗口从 Zustand store 中移除
**And** 窗口卡片从界面中消失，其他卡片自动重排
**And** 确认对话框支持 Esc 键取消，Enter 键确认
**And** 焦点在"取消"按钮上，防止误操作

## Epic 3: 统一视图与窗口展示

用户可以在统一界面中查看所有任务窗口的基本信息（工作目录、状态）。

### Story 3.1: 窗口卡片组件（WindowCard）

As a 用户,
I want 在卡片中查看每个窗口的关键信息和状态,
So that 可以快速识别窗口身份和当前状态。

**Acceptance Criteria:**

**Given** 窗口列表状态管理已实现（Epic 2）
**When** 实现 WindowCard 组件
**Then** 卡片顶部显示圆弧形彩色线条（4px，状态色）（FR10）
**And** 第一行显示窗口名称（左）和状态标签（右）（FR9）
**And** 第二行显示工作目录路径（等宽字体）（FR8）
**And** 第三行显示最新输出摘要
**And** 第四行显示使用模型（左）和最后活跃时间（右）
**And** 状态色映射：蓝色=运行中，黄色=等待输入，绿色=已完成，红色=出错，灰色=恢复中
**And** 卡片支持 hover 状态（背景色微变）
**And** 卡片支持键盘焦点状态（清晰的焦点环）
**And** 卡片最小宽度 280px，高度约 160px（方框比例）
**And** 工作目录路径过长时截断，悬停显示完整路径（Tooltip）

### Story 3.2: 响应式卡片网格布局（CardGrid）

As a 用户,
I want 在网格中查看所有窗口卡片,
So that 可以一屏看到尽可能多的窗口状态。

**Acceptance Criteria:**

**Given** WindowCard 组件已实现（Story 3.1）
**When** 实现 CardGrid 布局容器
**Then** 使用 CSS Grid 响应式布局：`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`（FR2）
**And** 卡片间距 12px
**And** 窗口宽度 < 640px 时显示 1 列
**And** 窗口宽度 640px-1024px 时显示 2 列
**And** 窗口宽度 1024px-1440px 时显示 3 列
**And** 窗口宽度 > 1440px 时显示 4+ 列
**And** 15+ 窗口时支持滚动，使用自定义滚动条样式
**And** 卡片按创建时间或最后活跃时间排序

### Story 3.3: 状态统计栏（StatusBar）

As a 用户,
I want 在工具栏看到各状态的窗口数量统计,
So that 无需逐个扫视卡片即可掌握全局分布。

**Acceptance Criteria:**

**Given** 窗口卡片网格已实现（Story 3.2）
**When** 实现 StatusBar 组件
**Then** 工具栏显示状态统计：运行中 X · 等待输入 X · 已完成 X · 出错 X
**And** 每个状态数字使用对应的状态色标注
**And** 数字实时更新，响应窗口状态变化
**And** 窗口宽度 < 640px 时简化为图标 + 数字，省略文字标签
**And** 支持 aria-live="polite"，状态变化时屏幕阅读器自动播报

### Story 3.4: 空状态与新建窗口入口

As a 用户,
I want 在没有窗口时看到引导提示，并有明确的新建入口,
So that 可以快速开始创建第一个任务窗口。

**Acceptance Criteria:**

**Given** 卡片网格和状态统计栏已实现（Story 3.2, 3.3）
**When** 窗口列表为空
**Then** 主内容区居中显示："创建你的第一个任务窗口"
**And** 下方显示大号"+ 新建窗口"按钮
**And** 点击按钮打开新建窗口对话框（复用 Story 2.2）
**When** 窗口列表不为空
**Then** 工具栏显示"+ 新建窗口"按钮（Primary 样式）
**And** 卡片网格末尾显示虚线"+ 新建窗口"占位卡片（与普通卡片同高）
**And** 两个入口都可以触发新建窗口对话框
**And** 虚线卡片支持 hover 状态（虚线高亮 + 背景微变）

## Epic 4: 智能状态追踪

系统自动检测并实时更新每个窗口的运行状态，用户一眼看到哪些窗口需要介入。

### Story 4.1: 状态检测服务（StatusDetector）

As a 开发者,
I want 创建 StatusDetector 服务实现智能状态检测逻辑,
So that 系统可以自动识别窗口的运行状态。

**Acceptance Criteria:**

**Given** 进程管理服务已实现（Epic 2）
**When** 实现 StatusDetector 服务
**Then** 可以检测进程是否存活（FR6）
**And** 可以获取进程 CPU 使用率（使用 pidusage 库）
**And** 可以监听 PTY 输出事件（通过 node-pty 的 data 事件）
**And** 可以记录最后输出时间
**And** 状态检测逻辑：运行中（CPU > 1% 或最近 5s 内有输出）
**And** 状态检测逻辑：等待输入（CPU < 1% 且最近 5s 内无输出且进程存活）
**And** 状态检测逻辑：已完成（进程退出且退出码 = 0）
**And** 状态检测逻辑：出错（进程退出且退出码 ≠ 0 或进程崩溃）
**And** 状态检测延迟 < 1s（NFR2）
**And** 状态检测不影响终端进程性能（NFR10）

### Story 4.2: 实时状态更新机制

As a 用户,
I want 窗口状态变化时界面自动更新,
So that 可以实时看到哪些窗口需要介入。

**Acceptance Criteria:**

**Given** StatusDetector 服务已实现（Story 4.1）
**When** 实现状态更新机制
**Then** 主进程定期检测所有窗口状态（轮询间隔 1s）（FR7）
**And** 状态变化时通过 IPC 事件推送到渲染进程（window-status-changed）
**And** 渲染进程接收事件后更新 Zustand store
**And** WindowCard 组件自动重渲染，更新顶部线条颜色和状态标签
**And** StatusBar 组件自动更新状态统计数字
**And** 状态更新无过渡动画，直接切换颜色（追求即时感）
**And** 活跃窗口检测间隔 1s，非活跃窗口检测间隔 5s（性能优化）
**And** 状态更新延迟 < 1s（NFR2）

## Epic 5: 快速窗口切换

用户可以点击窗口卡片快速切换到对应的 CLI 环境，在应用内查看和操作终端。

### Story 5.1: 终端视图（TerminalView）

As a 用户,
I want 切入窗口后在应用内看到终端的全屏视图,
So that 可以专注在当前任务的 CLI 操作上。

**Acceptance Criteria:**

**Given** WindowCard 组件已实现（Epic 3）
**When** 实现 TerminalView 组件
**Then** 顶部显示窄条（高度约 40px），包含返回按钮、当前窗口名称、状态标签
**And** 终端内容区占满剩余空间，显示 PTY 输出
**And** 终端内容区使用 xterm.js 渲染终端输出
**And** 终端支持所有原生功能：输入、输出、颜色、光标（FR12）
**And** 支持划选复制：选中文本自动复制到剪贴板
**And** 支持右键粘贴：右键点击粘贴剪贴板内容
**And** 可选支持 Ctrl+Shift+C/V 快捷键
**And** 返回按钮点击后返回统一视图
**And** 支持 Esc 键快捷键返回统一视图
**And** 终端获得焦点后，所有键盘输入传递给 PTY 进程
**And** 终端视图自适应窗口大小

### Story 5.2: 点击切换交互

As a 用户,
I want 点击窗口卡片立即在应用内切换到对应的终端视图,
So that 可以快速进入任务上下文继续工作。

**Acceptance Criteria:**

**Given** TerminalView 组件已实现（Story 5.1）
**When** 用户点击窗口卡片
**Then** 渲染进程调用主进程的 switch-to-terminal-view IPC 命令（FR11）
**And** 主进程通知渲染进程切换到对应的 TerminalView
**And** 应用内视图从统一视图切换到终端视图
**And** 用户可以立即在终端中操作，无需额外配置
**And** 视图切换响应时间 < 100ms（纯 UI 切换，FR13）
**And** 切换过程无过渡动画，追求即时感
**And** 支持键盘导航：Tab 键移动焦点，Enter/Space 键激活
**And** 切换失败时显示内联错误提示，不使用弹窗
**And** Zustand store 更新 activeWindowId，标记当前活跃窗口

## Epic 6: 工作区持久化

用户关闭应用后，下次打开自动恢复所有窗口配置和状态，零重复配置。

### Story 6.1: 工作区管理服务（WorkspaceManager）

As a 开发者,
I want 创建 WorkspaceManager 服务实现工作区配置的保存和加载,
So that 可以持久化窗口配置并在应用重启后恢复。

**Acceptance Criteria:**

**Given** 窗口列表状态管理已实现（Epic 2）
**When** 实现 WorkspaceManager 服务
**Then** 可以将工作区配置保存到本地 JSON 文件（FR21）
**And** Windows 平台存储路径：`%APPDATA%/ausome-terminal/workspace.json`
**And** macOS 平台存储路径：`~/Library/Application Support/ausome-terminal/workspace.json`
**And** 使用 fs-extra 库进行文件操作
**And** 使用原子写入机制：写临时文件 → 重命名覆盖
**And** 保存时自动创建备份（保留最近 3 个版本）
**And** 可以从本地文件加载工作区配置（FR22）
**And** 加载时校验 JSON 格式和版本
**And** 崩溃恢复：启动时检查临时文件，恢复未完成的写入（FR23）
**And** 数据格式包含：version, windows[], settings, lastSavedAt
**And** 工作区配置数据零丢失（NFR5）

### Story 6.2: 自动保存工作区

As a 用户,
I want 窗口变化时系统自动保存工作区配置,
So that 关闭应用后不会丢失任何窗口配置。

**Acceptance Criteria:**

**Given** WorkspaceManager 服务已实现（Story 6.1）
**When** 窗口列表发生变化（新建、删除、状态更新）
**Then** 系统自动触发工作区保存（FR4）
**And** 保存操作异步执行，不阻塞 UI
**And** 保存失败时记录错误日志，不影响应用运行
**And** 保存间隔至少 1 秒（防止频繁写入）
**And** 应用正常关闭时立即保存最新状态
**And** 保存的配置包含所有窗口的：id, name, workingDirectory, command, status, pid, createdAt, lastActiveAt
**And** 保存的配置包含全局设置：notificationsEnabled, theme, autoSave, autoSaveInterval

### Story 6.3: 启动时恢复工作区

As a 用户,
I want 打开应用后自动恢复所有窗口配置和状态,
So that 可以立即继续昨天的工作，零重复配置。

**Acceptance Criteria:**

**Given** WorkspaceManager 服务和自动保存已实现（Story 6.1, 6.2）
**When** 应用启动
**Then** 系统自动加载 workspace.json 文件（FR5）
**And** 并行启动所有窗口的终端进程
**And** 卡片网格立即渲染骨架屏，显示"恢复中"状态（灰色顶部线条）
**And** 进程启动完成后，卡片切换为实际状态（蓝色/黄色/绿色/红色）
**And** 启动并恢复 10+ 窗口的时间 < 5s（NFR3）
**And** 首次启动（无 workspace.json）时显示空状态引导
**And** 加载失败时显示错误提示，提供"从备份恢复"选项
**And** 恢复后的窗口保持原有的工作目录、启动命令、窗口名称
**And** 用户无需任何手动配置即可开始工作

