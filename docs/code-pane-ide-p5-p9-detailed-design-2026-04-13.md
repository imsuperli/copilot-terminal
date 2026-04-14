# CodePane IDE 后续阶段详细设计（P5-P9，2026-04-13）

## 1. 文档定位

本文是以下文档的后续设计：

- `docs/monaco-code-pane-design.md`
- `docs/code-pane-language-plugin-system-design.md`
- `docs/code-pane-ide-detailed-design-2026-04-13.md`

其中：

- `docs/code-pane-ide-detailed-design-2026-04-13.md` 主要覆盖 `P0-P4`
- 本文覆盖 `P5-P9`

目标是在现有 `CodePane` 基础上，继续向 IntelliJ IDEA / PyCharm / GoLand 靠拢，但仍然坚持一个通用 `CodePane`，不为每种语言拆出独立 pane。

## 2. 当前基线

截至 `P4`，当前已具备的核心能力如下：

- Workbench 侧栏折叠 / 展开 / 调宽 / 宽度记忆
- 文件树索引与语言工作区状态分离
- Git 仓库总览、改动树、提交图
- definition / hover / references / document symbols
- completion / signature help / rename / formatting / workspace symbols
- find usages / usages panel
- Java / Python / Go 的 `External Libraries`
- 本地文件、虚拟文档、依赖文件的统一只读打开

这意味着后续阶段不再需要重新搭工作台骨架，重点转向四类高频开发闭环能力：

1. 高效写代码
2. 运行 / 测试 / 调试
3. 项目模型与语言特化 UX
4. 重构与 Git 深度工作流

## 3. 设计目标

### 3.1 产品目标

- 继续保持一个通用 `CodePane`
- 以 IntelliJ IDEA / PyCharm 作为体验基准
- 优先覆盖高频开发动作，而不是补低频“看起来像 IDE”的功能
- 所有新增能力都必须支持跨语言退化
- 没有适配器的语言至少可用通用能力
- 出问题时必须优雅降级，不阻断文件浏览、编辑、保存、diff、Git

### 3.2 范围内能力

- `P5`：代码动作与导航效率基线
- `P6`：Run / Test / Debug
- `P7`：Project Tool Windows
- `P8`：Refactor + Git 深度工作流
- `P9`：框架特化、体验打磨、性能体系

### 3.3 非目标

- 不做 JetBrains / VS Code 级任意插件宿主
- 不在本阶段做 SSH 远程 code pane
- 不把运行、测试、调试直接绑死在某一种语言上
- 不允许语言插件直接注入 Renderer 组件树
- 不在没有统一模型前直接堆叠语言特例按钮

## 4. 总体演进原则

### 4.1 一个 CodePane，不分裂

`CodePane` 继续是唯一编辑器工作台：

- Explorer / Search / SCM / Problems 仍保留
- 新能力通过 `Tool Window` 承载
- Java / Python / Go 的差异继续通过 `LanguageProjectAdapter` 输出结构化贡献

### 4.2 三层架构继续成立

```text
CodePane Workbench UI
  ├─ ActivityRail / Sidebar / Editor / ToolWindowHost / StatusBar
  ├─ MonacoLanguageBridge
  ├─ CommandPalette / SearchEverywhere
  └─ CodePaneRuntimeStore

Application Layer
  ├─ LanguageFeatureService
  ├─ LanguageProjectContributionService
  ├─ WorkbenchCommandRegistry
  ├─ CodeNavigationHistoryService
  ├─ CodeRunProfileService
  ├─ CodeTestService
  ├─ CodeRefactorService
  ├─ CodeGitOperationService
  └─ DebugAdapterSupervisor

Provider / Adapter Layer
  ├─ LanguageServerSupervisor
  ├─ Debug Adapter Runtime
  ├─ LanguageProjectAdapterRegistry
  ├─ Java / Python / Go adapters
  ├─ Run target resolvers
  └─ Test discovery adapters
```

### 4.3 统一运行态模型

建议新增以下通用模型，避免每个阶段继续向 `CodePane.tsx` 塞状态：

```ts
interface WorkbenchCommand {
  id: string;
  title: string;
  category?: string;
  enabled?: boolean;
}

interface ToolWindowDescriptor {
  id: 'run' | 'debug' | 'tests' | 'project' | 'history' | 'refactor-preview';
  title: string;
  placement: 'bottom' | 'right' | 'left';
  visible: boolean;
}

interface RunProfile {
  id: string;
  kind: 'application' | 'test' | 'task';
  languageId: string;
  displayName: string;
  workingDirectory: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  debuggable: boolean;
}

interface TestItem {
  id: string;
  label: string;
  kind: 'file' | 'suite' | 'case';
  filePath?: string;
  children?: TestItem[];
}

interface DebugSession {
  id: string;
  profileId: string;
  state: 'starting' | 'running' | 'paused' | 'stopped' | 'error';
}

interface RefactorPlan {
  id: string;
  title: string;
  edits: CodePaneTextEdit[];
}

interface ProjectContribution {
  dependencySections?: CodePaneExternalLibrarySection[];
  statusItems?: Array<{ id: string; label: string; tone?: 'info' | 'warning' | 'error' }>;
  commandGroups?: Array<{ id: string; title: string; commands: WorkbenchCommand[] }>;
  treeSections?: Array<{ id: string; title: string; items: TestItem[] }>;
  detailCards?: Array<{ id: string; title: string; lines: string[] }>;
}
```

## 5. P5：代码动作与导航效率基线

### 5.1 目标

把“能跳转”升级成“能高频写代码”。

这是最接近日常 IntelliJ / PyCharm 使用体感的一层，优先级高于 Debug。

### 5.2 范围

- Code Actions / Quick Fix / Intention Actions
- Auto Import / Organize Imports
- Document Highlight
- Implementations / Type Hierarchy / Call Hierarchy
- Inlay Hints
- Semantic Tokens
- Search Everywhere / Quick Open
- Recent Files / Recent Locations
- Back / Forward
- Quick Documentation
- Next / Previous Problem

### 5.3 架构设计

#### 5.3.1 Main

扩展：

- `src/main/services/language/LanguageFeatureService.ts`
- `src/main/services/language/LanguageServerSupervisor.ts`

新增：

- `src/main/services/code/CodeNavigationHistoryService.ts`
- `src/main/services/code/CodeSearchEverywhereService.ts`
- `src/main/services/code/WorkbenchCommandRegistry.ts`
- `src/main/services/code/CodeActionExecutionService.ts`

`LanguageFeatureService` 需要统一新增能力：

- `getCodeActions`
- `resolveCodeAction`
- `runCodeActionCommand`
- `getImplementations`
- `getDocumentHighlights`
- `getInlayHints`
- `getSemanticTokens`
- `prepareCallHierarchy`
- `getIncomingCalls`
- `getOutgoingCalls`

#### 5.3.2 Renderer

扩展：

- `src/renderer/services/code/MonacoLanguageBridge.ts`

新增建议：

- `src/renderer/components/code-pane/CommandPalette.tsx`
- `src/renderer/components/code-pane/SearchEverywhereDialog.tsx`
- `src/renderer/components/code-pane/BreadcrumbsBar.tsx`
- `src/renderer/stores/codePaneRuntimeStore.ts`

`CodePane` 只负责装配：

- 命令面板入口
- search everywhere overlay
- breadcrumbs
- navigation history
- problems 跳转

### 5.4 IPC 合约

建议新增：

- `code-pane-get-code-actions`
- `code-pane-run-code-action`
- `code-pane-get-implementations`
- `code-pane-get-document-highlights`
- `code-pane-get-inlay-hints`
- `code-pane-get-semantic-tokens`
- `code-pane-call-hierarchy`
- `code-pane-search-everywhere`
- `code-pane-get-recent-locations`

### 5.5 语言适配要求

#### Java

- Auto import
- Implement / Override
- Organize imports
- JavaDoc quick documentation

#### Python

- Import fix
- Stub / runtime symbol quick documentation
- Simple implementations / usages hierarchy

#### Go

- Organize imports
- Implementations
- Interface callers

### 5.6 验收标准

- 未解析符号可以一键导包
- `Ctrl+B`、`Ctrl+Alt+B`、`Alt+7`、`Ctrl+E`、`Ctrl+Shift+A` 路径顺畅
- Search Everywhere 能跨文件、符号、命令统一检索
- 编辑器内有稳定的高亮、提示、导航历史

## 6. P6：Run / Test / Debug

### 6.1 目标

补齐完整开发闭环。

`Run / Test / Debug` 是当前与 IDEA / PyCharm 差距最大的功能段。

### 6.2 范围

- Run Configuration
- Run current file / main target
- Test discovery / test tree / rerun failed
- Debugger 基础能力
- Breakpoint / Variables / Call Stack / Evaluate Expression

### 6.3 分阶段落地

#### P6a：Run + Test

- 运行当前文件
- 运行主程序
- 测试发现与测试树
- 按文件 / suite / case 运行测试
- 失败重跑
- Run console

#### P6b：Debug

- Launch / Attach
- Breakpoints
- Pause / Continue / Step Over / Step Into / Step Out
- Variables / Watches / Evaluate
- Exception stop

### 6.4 架构设计

新增：

- `src/main/services/code/CodeRunProfileService.ts`
- `src/main/services/code/CodeRunTargetResolverService.ts`
- `src/main/services/code/CodeTestService.ts`
- `src/main/services/debug/DebugAdapterSupervisor.ts`
- `src/main/services/debug/DebugSessionStore.ts`

Renderer 新增建议：

- `src/renderer/components/code-pane/tool-windows/RunToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/TestsToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/DebugToolWindow.tsx`

现有终端体系继续复用：

- 运行和测试优先复用现有进程 / PTY
- Debug 单独引入 DAP runtime

### 6.5 统一模型

建议通用 `RunProfile.kind`：

- `application`
- `test`
- `task`

`DebugSession` 必须和语言解耦，Renderer 不直接理解：

- `jdtls`
- `debugpy`
- `dlv`

### 6.6 IPC 合约

建议新增：

- `code-pane-list-run-targets`
- `code-pane-run-target`
- `code-pane-stop-run-target`
- `code-pane-list-tests`
- `code-pane-run-tests`
- `code-pane-rerun-failed-tests`
- `code-pane-debug-start`
- `code-pane-debug-stop`
- `code-pane-debug-evaluate`
- `code-pane-set-breakpoint`
- `code-pane-remove-breakpoint`

### 6.7 语言适配要求

#### Java

- 识别 `main` 类
- 识别 Spring Boot app
- 识别 JUnit 4/5
- Debug 走 Java debug adapter

#### Python

- 识别 script / module
- 识别 pytest
- Debug 走 `debugpy`

#### Go

- 识别 `package main`
- 识别 `go test`
- Debug 走 `dlv`

### 6.8 验收标准

- 编辑器行内可直接运行 / 调试目标
- 有统一 Run / Tests / Debug tool windows
- 测试失败结果与代码位置可联动
- 调试会话状态可观测、可停止、可恢复焦点

## 7. P7：Project Tool Windows

### 7.1 目标

补齐项目模型，不再只剩文件树。

重点不是“多一个面板”，而是让用户理解：

- 当前项目怎么导入
- 当前环境是什么
- 当前依赖在哪
- 当前项目能执行哪些语言相关命令

### 7.2 范围

- Java Maven / Gradle 面板
- Python Interpreter / Environment 面板
- Go Modules / Workspace 面板
- Project 状态卡片
- Adapter Commands

### 7.3 架构设计

新增：

- `src/main/services/language/LanguageProjectModelService.ts`
- `src/main/services/language/LanguageProjectCommandService.ts`

扩展：

- `src/main/services/language/LanguageProjectContributionService.ts`
- `src/main/services/language/adapters/LanguageProjectAdapter.ts`

`LanguageProjectAdapter` 除了 `dependencySections`，还应继续扩展：

- `statusItems`
- `commandGroups`
- `detailCards`
- `treeSections`

Renderer 新增建议：

- `src/renderer/components/code-pane/tool-windows/ProjectToolWindow.tsx`
- `src/renderer/components/code-pane/project/ProjectStatusCards.tsx`
- `src/renderer/components/code-pane/project/ProjectCommandList.tsx`

### 7.4 IPC 合约

建议新增：

- `code-pane-get-project-contribution`
- `code-pane-refresh-project-model`
- `code-pane-run-project-command`

### 7.5 语言适配要求

#### Java

- Maven / Gradle projects
- Profiles
- Lifecycle / common goals
- Reimport project

#### Python

- Current interpreter
- venv / conda / poetry state
- site-packages / package list
- 环境刷新命令

#### Go

- `go.mod` / `go.work`
- module graph 摘要
- `go env`
- vendor / module cache 状态

### 7.6 验收标准

- 用户不用离开 `CodePane` 就能看懂项目环境
- 语言适配输出统一结构，不把 Maven/venv/go mod 逻辑写死在 Renderer
- Project 面板允许手动刷新与执行常用命令

## 8. P8：Refactor + Git 深度工作流

### 8.1 目标

把 `CodePane` 从“能看 Git”升级成“能完成开发提交前的大部分重构与版本控制动作”。

### 8.2 范围

- Refactor Preview
- Rename file / symbol / package
- Move / Safe Delete / Extract / Inline / Change Signature
- Git stage / unstage / discard
- Commit / amend / stash
- Branch checkout / cherry-pick / rebase continue / abort
- Blame / File History / Line History
- Conflict resolution assist

### 8.3 架构设计

新增：

- `src/main/services/code/CodeRefactorService.ts`
- `src/main/services/code/CodeRefactorPreviewService.ts`
- `src/main/services/code/CodeGitOperationService.ts`
- `src/main/services/code/CodeGitHistoryService.ts`
- `src/main/services/code/CodeGitBlameService.ts`

Renderer 新增建议：

- `src/renderer/components/code-pane/tool-windows/RefactorPreviewToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/GitHistoryToolWindow.tsx`
- `src/renderer/components/code-pane/scm/CommitComposer.tsx`
- `src/renderer/components/code-pane/scm/BlameGutter.tsx`

### 8.4 统一 Preview 模型

不论来自：

- refactor preview
- git compare
- move / rename preview

都统一进入一套 preview model，避免 Renderer 出现多套 diff 预览实现。

```ts
interface PreviewChangeSet {
  id: string;
  title: string;
  files: Array<{
    filePath: string;
    edits: CodePaneTextEdit[];
  }>;
}
```

### 8.5 IPC 合约

建议新增：

- `code-pane-prepare-refactor`
- `code-pane-apply-refactor`
- `code-pane-git-stage`
- `code-pane-git-unstage`
- `code-pane-git-discard`
- `code-pane-git-commit`
- `code-pane-git-stash`
- `code-pane-git-history`
- `code-pane-git-blame`

### 8.6 语言适配要求

#### Java

- 文件 / 包级 rename 后更新 imports
- Extract / Inline / Change Signature

#### Python

- Rename / Move 时更新 imports
- Safe Delete 要保守，允许 preview 强确认

#### Go

- Rename / Move 兼容 module import path
- 优先依赖 `gopls` 提供的 workspace edit

### 8.7 验收标准

- 所有高风险重构必须先 preview 再 apply
- Git 不再只有只读状态展示
- 常见提交前工作可以在 `CodePane` 内完成

## 9. P9：框架特化、体验打磨、性能体系

### 9.1 目标

在通用 IDE 能力具备后，再逐步逼近各语言专用 IDE 的“专业感”。

### 9.2 范围

- Spring Boot / pytest / Django / FastAPI / GoLand 风格补强
- Editor split / preview tab / local history / bookmarks / TODO view
- 性能与可观测性体系
- 插件能力继续扩到 formatter / linter / code-action-provider / test-provider / debug-adapter

### 9.3 框架特化方向

#### Java / Spring Boot

- Bean 导航
- `@RequestMapping` 导航
- 配置项跳转
- Spring Boot Run Dashboard

#### Python

- pytest 参数化识别
- Django / FastAPI 项目入口识别
- 当前 interpreter 与运行目标绑定

#### Go

- benchmark / example 支持
- `go generate`
- interface implementers
- delve attach / package debug

### 9.4 性能与稳定性

新增建议：

- `CodePaneRuntimeStore`
- Tool Window 懒加载
- 列表虚拟化
- 语言请求取消
- TTL 缓存
- 过期结果丢弃
- 慢请求面板
- 索引 / 导入 / 测试发现 / 调试启动的详细进度

### 9.5 平台能力扩展

插件系统继续受控扩展到：

- `formatter`
- `linter`
- `code-action-provider`
- `test-provider`
- `debug-adapter`

仍保持：

- 外部进程运行
- 声明式 manifest
- 失败自动降级
- feature flag 可回滚

### 9.6 验收标准

- 大项目下搜索、跳转、运行、调试、Git 操作都有明确反馈
- 常见语言框架有一层“项目感知”
- 性能问题可观测，不再依赖用户猜测

## 10. 推荐实施顺序

建议不要机械按功能数量推进，而是按用户收益和系统依赖推进：

1. `P5`
   先补写代码效率基线
2. `P6a`
   先做 Run + Test
3. `P7`
   把 Project Tool Window 与 adapter 命令体系补上
4. `P6b`
   在已有 Run/Test 模型基础上接 Debug
5. `P8`
   做 Refactor Preview 与 Git 深度工作流
6. `P9`
   做框架特化、性能与平台扩展

## 11. 关键依赖关系

### 11.1 P5 对后续阶段的支撑

`P5` 会先产出：

- `WorkbenchCommandRegistry`
- `CodeNavigationHistoryService`
- `CodePaneRuntimeStore`

这些能力会直接被：

- `P6` 的 run / debug 命令
- `P7` 的 project commands
- `P8` 的 refactor preview

复用。

### 11.2 P6 与 P7 的关系

`P6` 的 run / test 需要 project model，但不要求先把完整 tool window 做完。

因此：

- `run target resolver` 可以先落
- `Project Tool Window` 可以随后消费同一份 model

### 11.3 P8 对 Preview 基础设施的依赖

在没有统一 preview model 前，不建议直接做重构套件和深度 Git 操作，否则会在 Renderer 形成重复的 diff 预览逻辑。

## 12. 风险与控制

### 12.1 风险

- `CodePane.tsx` 仍然过大，如果不继续拆分，后续开发会越来越难维护
- DAP 接入复杂度明显高于 LSP
- 测试发现与运行目标识别天然带语言差异
- Python 环境识别存在多种变体，不能依赖单一路径规则
- Git 深度操作是高风险写操作，必须先做好 preview 与确认链路

### 12.2 控制策略

- 优先拆出 runtime store 与 tool window host
- 新能力先走 feature flag
- 写操作都走 preview / confirmation
- 继续坚持失败自动降级
- 慢请求与长任务必须有状态反馈

## 13. 需要新增的主要文件

### 13.1 Main

- `src/main/services/code/WorkbenchCommandRegistry.ts`
- `src/main/services/code/CodeNavigationHistoryService.ts`
- `src/main/services/code/CodeSearchEverywhereService.ts`
- `src/main/services/code/CodeActionExecutionService.ts`
- `src/main/services/code/CodeRunProfileService.ts`
- `src/main/services/code/CodeRunTargetResolverService.ts`
- `src/main/services/code/CodeTestService.ts`
- `src/main/services/code/CodeRefactorService.ts`
- `src/main/services/code/CodeRefactorPreviewService.ts`
- `src/main/services/code/CodeGitOperationService.ts`
- `src/main/services/code/CodeGitHistoryService.ts`
- `src/main/services/code/CodeGitBlameService.ts`
- `src/main/services/debug/DebugAdapterSupervisor.ts`
- `src/main/services/debug/DebugSessionStore.ts`
- `src/main/services/language/LanguageProjectModelService.ts`
- `src/main/services/language/LanguageProjectCommandService.ts`

### 13.2 Renderer

- `src/renderer/stores/codePaneRuntimeStore.ts`
- `src/renderer/components/code-pane/ToolWindowHost.tsx`
- `src/renderer/components/code-pane/CommandPalette.tsx`
- `src/renderer/components/code-pane/SearchEverywhereDialog.tsx`
- `src/renderer/components/code-pane/BreadcrumbsBar.tsx`
- `src/renderer/components/code-pane/tool-windows/RunToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/DebugToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/TestsToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/ProjectToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/RefactorPreviewToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/GitHistoryToolWindow.tsx`

## 14. 决策结论

`P5-P9` 的核心结论如下：

- 后续阶段仍然坚持一个通用 `CodePane`
- 优先补高频开发闭环，而不是先补低频“像 IDE”的装饰功能
- `P5` 应优先于 Debug
- `Run / Test / Debug` 必须走统一模型，不为每语言单独造 UI
- `Project Tool Window` 必须消费 adapter 贡献，不让 Renderer 直接理解 Maven / venv / go mod
- `Refactor` 与深度 Git 操作必须建立在统一 preview 基础上
- 性能与状态可观测性必须跟功能一起演进

如果按本方案推进，`CodePane` 才有可能从“带代码面板的终端”真正演进到“可作为主力使用的通用 IDE 工作台”。
