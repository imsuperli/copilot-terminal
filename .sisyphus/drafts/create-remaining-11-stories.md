# Draft: 创建剩余 11 个故事文件

## 需求确认

**用户目标**: 为 ausome-terminal 项目创建剩余的 11 个故事文件

**当前状态**:
- 已完成: Epic 1 (1-1, 1-2, 1-3, 1-4) 和 Epic 2 (2-1, 2-2, 2-3, 2-4) - 共 8 个故事
- 待创建: Epic 3 (4个), Epic 4 (2个), Epic 5 (2个), Epic 6 (3个) - 共 11 个故事

**工作流信息**:
- 工作流路径: `_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml`
- 工作流引擎: `_bmad/core/tasks/workflow.xml`
- 支持 YOLO 模式（自动化执行，跳过所有确认）

## 研究发现

### 1. 架构和 UX 约束（来自 bg_5f407261）

**技术栈**:
- Electron 28.x+ + React 18.x + TypeScript 5.x + Vite 5.x
- UI: Radix UI (headless) + Tailwind CSS 3.x
- 状态管理: Zustand 4.x
- 终端: node-pty 1.x + xterm.js 5.x
- 测试: Jest + React Testing Library

**关键架构模式**:
- Main Process: ProcessManager, StatusDetector, WorkspaceManager
- Renderer Process: React 组件 + Zustand store + IPC bridge
- IPC 通信: `ipcRenderer.invoke()` 和 `ipcRenderer.on()`

**UX 设计原则**:
- 深色主题，暖色调背景
- 状态色: 蓝(运行中), 黄(等待), 绿(完成), 红(错误)
- 零过渡动画（追求即时感）
- 键盘导航支持（Tab/Enter/Esc）

### 2. 故事文件结构模板（来自 bg_0bd0b158）

**标准结构**:
1. Header: 标题, Status, 验证说明
2. Story: "As a... I want... So that..." 格式
3. Acceptance Criteria: Given-When-Then 格式 + FR/NFR 引用
4. Tasks / Subtasks: 层级化任务清单 + AC 映射
5. Dev Notes: 架构约束、技术要求、常见陷阱、测试清单
6. References: 源文档链接
7. Dev Agent Record: 模型、日志、完成记录

**命名规范**:
- 文件名: `{epic}-{story}-{kebab-case-title}.md`
- 组件: PascalCase (Button.tsx)
- 服务: PascalCase (ProcessManager.ts)
- 类型: kebab-case (process.ts)

### 3. 待创建的故事详情（来自 bg_ec63f64c）

**Epic 3: 统一视图与窗口展示** (4 个故事)
- 3-1: 窗口卡片组件（WindowCard）
- 3-2: 响应式卡片网格布局（CardGrid）
- 3-3: 状态统计栏（StatusBar）
- 3-4: 空状态与新建窗口入口

**Epic 4: 智能状态追踪** (2 个故事)
- 4-1: 状态检测服务（StatusDetector）
- 4-2: 实时状态更新机制

**Epic 5: 快速窗口切换** (2 个故事)
- 5-1: 终端视图（TerminalView）
- 5-2: 点击切换交互

**Epic 6: 工作区持久化** (3 个故事)
- 6-1: 工作区管理服务（WorkspaceManager）
- 6-2: 自动保存工作区
- 6-3: 启动时恢复工作区

## 技术决策

### 执行策略

**顺序 vs 并行**:
- ❌ 不能并行: 每个故事创建需要更新 sprint-status.yaml，存在写入冲突风险
- ✅ 必须顺序: 按 3-1 → 3-2 → ... → 6-3 的顺序依次创建
- 原因: 工作流会自动从 sprint-status.yaml 读取下一个 backlog 故事

**工作流执行模式**:
- 使用 YOLO 模式自动化执行
- 每个故事创建后自动更新 sprint-status.yaml 状态为 "ready-for-dev"
- 工作流会自动处理文件生成、模板填充、引用提取

### Agent 配置

**推荐 Category**: `unspecified-high`
- 原因: 故事创建需要深度分析多个文档（epics.md, architecture.md, ux-design-specification.md）
- 需要高质量的上下文理解和文档生成能力

**推荐 Skills**: 无需特殊技能
- 工作流已内置所有必要的文档分析和生成逻辑
- Agent 只需遵循工作流指令执行

## 依赖关系

### 故事间依赖

**Epic 3 内部依赖**:
- 3-2 依赖 3-1 (CardGrid 需要 WindowCard 组件)
- 3-3 依赖 3-2 (StatusBar 需要窗口列表数据)
- 3-4 依赖 3-2, 3-3 (空状态需要完整的 UI 框架)

**Epic 4 内部依赖**:
- 4-2 依赖 4-1 (实时更新需要 StatusDetector 服务)

**Epic 5 内部依赖**:
- 5-2 依赖 5-1 (切换交互需要 TerminalView 组件)

**Epic 6 内部依赖**:
- 6-2 依赖 6-1 (自动保存需要 WorkspaceManager 服务)
- 6-3 依赖 6-1, 6-2 (恢复需要保存和加载机制)

**跨 Epic 依赖**:
- Epic 3 依赖 Epic 2 (需要窗口列表状态管理)
- Epic 4 依赖 Epic 2 (需要进程管理服务)
- Epic 5 依赖 Epic 3 (需要 WindowCard 组件)
- Epic 6 依赖 Epic 2 (需要窗口配置数据结构)

## 开放问题

暂无 - 所有需求已明确
