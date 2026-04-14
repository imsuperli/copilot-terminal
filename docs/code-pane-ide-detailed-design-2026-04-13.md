# CodePane IDE 化详细设计（2026-04-13）

## 1. 文档定位

本文是以下两份文档的细化与落地方案：

- `docs/monaco-code-pane-design.md`
- `docs/code-pane-language-plugin-system-design.md`

目标不是再起一套新架构，而是在现有实现基础上，把 `CodePane` 演进成更接近 IntelliJ IDEA 的工作台体验，同时保持一个通用 `CodePane` 兼容 Java、Python、Go 等语言。

后续阶段设计见：

- `docs/code-pane-ide-p5-p9-detailed-design-2026-04-13.md`

## 2. 目标

### 2.1 产品目标

- 以 IntelliJ IDEA 作为体验基准，优先对齐 Java / Maven / Spring Boot 项目体验
- 保持一个通用 `CodePane`，不为每种语言单独做一套 pane
- 明确区分“文件树索引完成”和“语言工作区已就绪”
- 支持本地源码、依赖源码、虚拟文档三类跳转
- 在 `CodePane` 中提供更完整的 Git 工作台能力，而不只是改动列表
- 左侧工作区支持折叠 / 展开、拖拽调宽、记忆宽度

### 2.2 范围内能力

- Explorer / Search / SCM / Problems 四类左侧视图
- 统一语言能力层
- 语言工作区状态与项目导入反馈
- Git 文件树、分支关系、合并态可视化
- 依赖源码 / External Libraries

### 2.3 非目标

- 不做完整 JetBrains / VS Code 扩展宿主
- 不在首版做 debugger、run configuration、test runner
- 不在首版做完整 Git GUI 客户端
- 不让第三方插件直接注入 Renderer UI 或 Main 进程逻辑

## 3. 现状梳理

当前已有能力和边界如下：

- `src/renderer/components/CodePane.tsx`
  - 承担编辑器壳、文件树、搜索、SCM、Problems、状态栏、跳转等几乎所有 UI 逻辑
- `src/renderer/services/code/MonacoLanguageBridge.ts`
  - 已把 Monaco 的 definition / hover / references / document symbols 接到了主进程
- `src/main/services/language/LanguageFeatureService.ts`
  - 作为语言能力统一入口
- `src/main/services/language/LanguageServerSupervisor.ts`
  - 负责 LSP 进程生命周期与请求转发
- `src/main/services/language/LanguagePluginResolver.ts`
  - 负责语言插件解析、优先级、默认设置合并
- `src/main/services/code/CodeProjectIndexService.ts`
  - 负责文件树索引
- `src/main/services/code/CodeGitService.ts`
  - 目前只提供 Git status 和读取 HEAD 基线文件

当前主要问题：

- `CodePane.tsx` 过大，UI、运行态、异步流程耦合严重
- “索引完成”只代表文件树可用，不代表语言工作区可用
- SCM 面板只有改动列表，缺少仓库总览、分支关系、合并态、冲突态
- 左侧栏宽度写死为 `260px`，不能隐藏也不能调宽
- Git 只按需拉取，没有仓库级 watcher 和增量状态模型
- 一些 IntelliJ 风格体验缺少统一的就绪状态和操作反馈

## 4. 总体架构

### 4.1 核心原则

- 保持一个通用 `CodePane`
- 语言差异放到“语言工作区适配层”
- Git 差异放到“仓库状态层”
- UI 只消费统一状态，不直接理解 Maven、venv、go mod
- 持久态与运行态分离

### 4.2 三层架构

```text
CodePane Workbench UI
  ├─ Activity Rail / Sidebar / Editor / StatusBar
  ├─ MonacoLanguageBridge
  └─ CodePaneRuntimeStore

CodePane Application Layer
  ├─ LanguageFeatureService
  ├─ LanguageWorkspaceService
  ├─ CodeGitService (Facade)
  ├─ CodeProjectIndexService
  └─ CodePaneWatcherService

Provider / Adapter Layer
  ├─ LanguageServerSupervisor
  ├─ LanguageProjectAdapterRegistry
  ├─ JavaProjectAdapter / PythonProjectAdapter / GoProjectAdapter
  ├─ CodeGitRepositoryService
  ├─ CodeGitGraphService
  └─ CodeGitWatcherService
```

### 4.3 关键边界

- `CodePane`
  - 只负责工作台壳、交互、布局、状态展示
- `MonacoLanguageBridge`
  - 只负责 Monaco Provider 与 IPC 的桥接
- `LanguageFeatureService`
  - 只负责统一能力调用，不持有语言特定 UI 逻辑
- `LanguageWorkspaceService`
  - 负责“语言工作区是否已准备好”的状态机
- `LanguageProjectAdapter`
  - 负责语言特定的项目导入、依赖源码、环境探测
- `CodeGitService`
  - 作为 Git facade，对 Renderer 暴露统一 Git 查询与订阅接口

## 5. 详细模块设计

### 5.1 Renderer 结构重构

建议把当前 `CodePane.tsx` 拆成以下模块：

- `src/renderer/components/code-pane/CodePaneShell.tsx`
  - 负责整体布局和装配
- `src/renderer/components/code-pane/CodePaneActivityRail.tsx`
  - 左侧图标栏，始终保留
- `src/renderer/components/code-pane/CodePaneSidebar.tsx`
  - 可折叠、可调宽的侧栏容器
- `src/renderer/components/code-pane/ExplorerView.tsx`
  - 文件树与依赖树
- `src/renderer/components/code-pane/SearchView.tsx`
  - 文件名 / 内容搜索
- `src/renderer/components/code-pane/ScmView.tsx`
  - Git 仓库总览、变更树、分支图
- `src/renderer/components/code-pane/ProblemsView.tsx`
  - diagnostics 列表
- `src/renderer/components/code-pane/EditorArea.tsx`
  - tabs、monaco、diff、read-only 虚拟文档
- `src/renderer/components/code-pane/CodePaneStatusBar.tsx`
  - 文件索引、语言工作区、Git、光标、文件信息

同时拆出 hook：

- `useCodePaneDocuments`
- `useCodePaneSidebar`
- `useCodePaneIndex`
- `useCodePaneGit`
- `useCodePaneLanguage`
- `useCodePaneDiagnostics`

### 5.2 Main 进程服务拆分

#### 5.2.1 语言服务侧

- 保留 `LanguageFeatureService`
- 保留 `LanguageServerSupervisor`
- 新增 `LanguageWorkspaceService`
- 新增 `LanguageProjectAdapterRegistry`
- 新增 `src/main/services/language/adapters/JavaProjectAdapter.ts`
- 新增 `src/main/services/language/adapters/PythonProjectAdapter.ts`
- 新增 `src/main/services/language/adapters/GoProjectAdapter.ts`

#### 5.2.2 Git 服务侧

建议把当前 `CodeGitService` 升级为 facade，内部拆为：

- `CodeGitRepositoryService`
  - 仓库识别、分支、upstream、ahead/behind、合并态
- `CodeGitStatusService`
  - 改用 `git status --porcelain=v2 --branch -z`
- `CodeGitGraphService`
  - 生成最近提交图、分支装饰、merge commit 信息
- `CodeGitWatcherService`
  - 监听 `.git/HEAD`、`.git/index`、`MERGE_HEAD` 等文件变化

`CodeGitService` 对外仍保留统一入口，避免 Renderer 直接依赖多个 handler。

### 5.3 运行态状态存储

建议新增：

- `src/renderer/stores/codePaneRuntimeStore.ts`

职责：

- 保存不可持久化的运行态
- 降低 `CodePane.tsx` 本地状态数量
- 避免整棵组件树频繁重渲染

建议存储内容：

- 文件树运行态
- 目录加载态
- Monaco model registry
- Git 仓库快照
- 语言工作区状态
- 依赖树 / 虚拟文档缓存

## 6. 数据模型

### 6.1 `Pane.code` 持久态扩展

建议在 `src/shared/types/window.ts` 中扩展：

```ts
export type CodePaneSidebarView = 'files' | 'search' | 'scm' | 'problems';

export interface CodePaneSidebarState {
  visible: boolean;
  activeView: CodePaneSidebarView;
  width: number;
  lastExpandedWidth?: number;
}

export interface CodePaneLayoutState {
  sidebar: CodePaneSidebarState;
}

export interface CodePaneState {
  rootPath: string;
  openFiles: CodePaneOpenFile[];
  activeFilePath: string | null;
  selectedPath?: string | null;
  expandedPaths?: string[];
  viewMode?: 'editor' | 'diff';
  diffTargetPath?: string | null;
  layout?: CodePaneLayoutState;
}
```

约束：

- 默认宽度 `300`
- 最小宽度 `220`
- 最大宽度 `520`
- 隐藏后保留 `lastExpandedWidth`

说明：

- 这是 `CodePane` 内部左侧工作区宽度
- 与 `TerminalView` 里整个 `CodePane` 的 70/30 分屏不是一回事

### 6.2 Renderer 运行态

```ts
interface CodePaneRuntimeState {
  byPaneId: Record<string, {
    index: CodePaneIndexRuntimeState;
    git: CodePaneGitRuntimeState;
    language: CodePaneLanguageRuntimeState;
    tree: CodePaneTreeRuntimeState;
    documents: CodePaneDocumentRuntimeState;
  }>;
}
```

### 6.3 语言工作区状态

建议新增共享类型：

```ts
type LanguageWorkspacePhase =
  | 'idle'
  | 'starting'
  | 'detecting-project'
  | 'importing-project'
  | 'indexing-workspace'
  | 'ready'
  | 'degraded'
  | 'error';

interface CodePaneLanguageWorkspaceState {
  pluginId: string;
  languageId: string;
  projectRoot: string;
  runtimeState: 'idle' | 'starting' | 'running' | 'stopped' | 'error';
  phase: LanguageWorkspacePhase;
  message?: string;
  progressText?: string;
  readyFeatures: Array<
    'definition'
    | 'hover'
    | 'references'
    | 'completion'
    | 'rename'
    | 'formatting'
    | 'workspaceSymbol'
  >;
  latencyMs?: number;
  timestamp: string;
}
```

目标是彻底区分：

- 文件树可用了没有
- 语言服务进程起了没有
- Maven / Gradle / venv / go mod 导入完成没有
- 语义分析可用了没有

### 6.4 Git 仓库状态

建议新增：

```ts
type GitOperationState =
  | 'idle'
  | 'merge'
  | 'rebase'
  | 'cherry-pick'
  | 'revert'
  | 'bisect';

interface CodePaneGitRepositorySummary {
  repoRootPath: string;
  currentBranch?: string;
  upstreamBranch?: string;
  detachedHead?: boolean;
  headSha?: string;
  aheadCount: number;
  behindCount: number;
  operation: GitOperationState;
  hasConflicts: boolean;
  mergeBaseSha?: string;
  mergeTargetBranch?: string;
  lastFetchedAt?: string;
}

interface CodePaneGitChangeTreeNode {
  path: string;
  type: 'file' | 'directory';
  section: 'staged' | 'unstaged' | 'untracked' | 'conflicted';
  status?: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  children?: CodePaneGitChangeTreeNode[];
}

interface CodePaneGitGraphCommit {
  sha: string;
  shortSha: string;
  parents: string[];
  subject: string;
  author: string;
  timestamp: number;
  refs: string[];
  isHead: boolean;
  isMergeCommit: boolean;
  lane: number;
  laneCount: number;
}
```

## 7. 语言架构设计

### 7.1 为什么仍然只有一个 `CodePane`

`CodePane` 只理解三件事：

- 通用编辑器能力
- 通用工作台区域
- 通用状态显示

它不直接理解：

- Maven
- Spring Boot
- Python venv
- Go modules

语言差异由 `LanguageProjectAdapter` 提供结构化贡献：

```ts
interface LanguageWorkbenchContribution {
  dependencySections?: Array<{
    id: string;
    title: string;
    rootItems: DependencyTreeItem[];
  }>;
  statusItems?: Array<{
    id: string;
    label: string;
    tone?: 'info' | 'warning' | 'error';
  }>;
  commands?: Array<{
    id: string;
    title: string;
  }>;
}
```

这样一个 `CodePane` 可以兼容所有语言：

- 有 adapter 的语言，得到 richer project UX
- 没有 adapter 的语言，仍然使用通用 LSP 能力

### 7.2 能力矩阵

统一能力层先覆盖：

- definition
- hover
- references
- document symbols
- workspace symbols
- completion
- signature help
- rename
- code actions
- formatting
- semantic tokens
- inlay hints

其中：

- `LanguageFeatureService` 负责统一入口
- `MonacoLanguageBridge` 负责注册 provider
- `LanguageServerSupervisor` 负责请求、超时、缓存、会话复用

### 7.3 Java / Python / Go 的差异化处理

#### Java

- 项目探测：`pom.xml` / `build.gradle*`
- 项目导入：Maven / Gradle import
- 依赖源码：`jdt://` 虚拟文档与 `java/classFileContents`
- 依赖视图：`External Libraries`
- 状态提示：`Importing Maven project`、`Resolving classpath`

#### Python

- 解释器探测：`.venv`、`venv`、`poetry`、`pyenv`
- 环境状态：当前 interpreter、site-packages 路径
- 依赖跳转：venv / stub / installed package source
- 状态提示：`Resolving interpreter`、`Indexing environment`

#### Go

- 项目探测：`go.mod`、`go.work`
- 依赖来源：module cache、vendor
- 状态提示：`Loading packages`、`Resolving module graph`

## 8. Git 工作台设计

### 8.1 目标体验

SCM 视图不再只是“改动列表”，而是一个轻量仓库工作台，至少包含：

- 当前分支与 upstream
- ahead / behind
- merge / rebase / cherry-pick 状态
- conflict 列表
- Git 变更树
- 最近提交图

### 8.2 SCM 视图结构

建议 `ScmView` 拆成 4 个区块：

1. `Repository Summary`
- 当前分支
- upstream
- ahead / behind
- operation 状态
- 冲突数

2. `Branch Graph`
- 最近 40 到 80 条提交
- lane 视图
- branch/tag/HEAD 装饰
- merge commit 高亮

3. `Changes Tree`
- `Conflicted`
- `Staged`
- `Unstaged`
- `Untracked`

4. `Quick Actions`
- Open Diff
- Reveal in Explorer
- Refresh
- Copy Branch Name

### 8.3 Git 文件树

这里需要区分两棵树：

- Explorer Tree
  - 项目完整文件树
  - 节点上叠加 Git badge、diagnostics badge
- Changes Tree
  - 仅展示有 Git 变更的文件夹与文件
  - 按 `staged / unstaged / untracked / conflicted` 分区

这样用户既可以看完整项目，也能快速聚焦 Git 变化。

### 8.4 分支合并可视化

“能直观看清分支合并情况”优先做下面这几层，而不是直接做完整 GitKraken：

1. 仓库摘要层
- 当前分支
- upstream 分支
- ahead / behind
- merge base
- 当前是否在 merge / rebase 中

2. 图形提交层
- 展示最近提交图
- merge commit 使用特殊节点样式
- 当前分支与 upstream 用 refs 装饰

3. 冲突与合并提示层
- 有 `MERGE_HEAD` 时显示 `Merge in progress`
- 有 `rebase-merge` / `rebase-apply` 时显示 `Rebase in progress`
- 冲突文件提升到最上方

建议命令：

- `git status --porcelain=v2 --branch -z`
- `git rev-parse --show-toplevel`
- `git rev-parse --abbrev-ref HEAD`
- `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`
- `git merge-base HEAD @{upstream}`
- `git log --graph --decorate=short --date-order --pretty=format:%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%ct -n 60 --all`

### 8.5 Git watcher 设计

新增 `CodeGitWatcherService`，监听：

- `.git/HEAD`
- `.git/index`
- `.git/refs/heads/*`
- `.git/refs/remotes/*`
- `.git/MERGE_HEAD`
- `.git/CHERRY_PICK_HEAD`
- `.git/REBASE_HEAD`
- `.git/rebase-merge`
- `.git/rebase-apply`

刷新策略：

- 200ms 到 500ms debounce
- 分支关系变化刷新 summary + graph
- index 变化只刷新 changes tree
- 大仓库 graph 按需刷新，避免每次 index 变化都重跑 `git log`

## 9. 左侧工作区折叠 / 展开 / 调宽设计

### 9.1 结构

`CodePane` 左侧区域拆为两部分：

- `ActivityRail`
  - 固定宽度 `44px`
  - 始终可见
- `Sidebar`
  - 可显示 / 隐藏
  - 可拖拽调宽

布局如下：

```text
| ActivityRail | Sidebar(optional, resizable) | Editor Area |
```

### 9.2 行为规则

- 点击当前激活视图图标，再次点击可折叠侧栏
- 侧栏隐藏后，仅保留 `ActivityRail`
- 点击任意图标时自动恢复到上次宽度
- 拖拽分隔条可调整宽度
- 双击分隔条恢复默认宽度 `300`
- `Ctrl+B` 绑定到侧栏显示 / 隐藏

### 9.3 状态持久化

状态存到 `pane.code.layout.sidebar`：

- `visible`
- `activeView`
- `width`
- `lastExpandedWidth`

原因：

- 不同 `CodePane` 可以记忆不同工作习惯
- workspace restore 后可恢复上次布局

### 9.4 渲染实现

不建议继续写死 `w-[260px]`。建议改为：

- 内联 `style={{ width: sidebarWidth }}`
- 使用专门的 `ResizeHandle` 组件
- 拖拽逻辑通过 pointer events 实现
- 宽度更新用 `requestAnimationFrame` 节流

## 10. 依赖源码与 External Libraries

### 10.1 目标

- Java 依赖源码和 class 内容不仅要能跳转，还要可浏览
- Python / Go 也要有类似“依赖视图”的统一体验

### 10.2 统一模型

在 Explorer 中增加可选 section：

- `Project`
- `External Libraries`

其中：

- Java：jar / source attachment / class virtual document
- Python：site-packages / stdlib / interpreter paths
- Go：module cache / vendor / stdlib

这些 section 由 `LanguageProjectAdapter` 提供，`ExplorerView` 统一渲染。

## 11. IPC 合约扩展

建议在 `src/shared/types/electron-api.ts` 增加以下接口：

```ts
interface CodePaneGetGitRepositoryConfig {
  rootPath: string;
}

interface CodePaneGetGitGraphConfig {
  rootPath: string;
  limit?: number;
}

interface CodePaneGitRepositoryChangedPayload {
  rootPath: string;
  summary: CodePaneGitRepositorySummary;
}

interface CodePaneLanguageWorkspaceChangedPayload {
  rootPath: string;
  state: CodePaneLanguageWorkspaceState;
}
```

建议新增 handler：

- `code-pane-git-repository`
- `code-pane-git-graph`
- `code-pane-git-change-tree`
- `onCodePaneGitRepositoryChanged`
- `onCodePaneLanguageWorkspaceChanged`

## 12. 关键交互流程

### 12.1 打开 `CodePane`

1. `CodePane` 读取持久态布局
2. 启动文件树 watcher 与索引
3. 拉取 Git repository summary
4. 解析语言插件
5. 启动 `LanguageWorkspaceService`
6. 状态栏分别展示：
   - 文件树索引
   - Git 状态
   - 语言工作区状态

### 12.2 Ctrl/Cmd 点击跳转

1. Renderer hover 预取 definition
2. 命中缓存则直接跳转
3. 本地文件打开 editor
4. 依赖源码或虚拟文档走 read-only 模型
5. 若语言工作区未 ready，则显示明确 loading 文案

### 12.3 Merge / Rebase 中查看仓库状态

1. `CodeGitWatcherService` 发现 `MERGE_HEAD` 或 `rebase-merge`
2. 触发 repository summary 更新
3. `ScmView` 顶部显示 banner
4. 冲突文件进入 `Conflicted` 分区
5. Branch Graph 保留当前 HEAD 与 upstream 关系

## 13. 性能与稳定性

### 13.1 文件树

- 文件树索引只负责目录与文件名，不负责语言分析
- 使用忽略规则，严格排除 `target`、`build`、`.idea`、`node_modules` 等目录
- 大目录采用 lazy load
- Explorer 渲染需要支持列表虚拟化

### 13.2 语言服务

- 同一 `projectRoot + pluginId + settings` 共用一个 session
- `definition / hover / references` 增加短 TTL 缓存
- 请求取消与过期结果丢弃
- 慢请求单独在状态栏显示，不把 stderr warning 误报成主进程错误

### 13.3 Git

- `status` 与 `graph` 分开缓存
- `index` 变更不强制刷新 graph
- graph 首屏只取有限提交数
- renderer 不直接处理大字符串，graph 解析放在 main

## 14. 分阶段实施

### P0：工作台稳定化

- 拆出 `CodePaneShell`、`Sidebar`、`StatusBar`
- 引入 `pane.code.layout.sidebar`
- 实现左侧栏折叠 / 展开 / 调宽

### P1：可观测的语言工作区

- 新增 `LanguageWorkspaceService`
- 状态栏展示 `starting / importing / indexing / ready`
- Java 先接入 Maven / Gradle 导入反馈

### P2：Git 工作台

- `CodeGitService` 内部拆分为 repository / status / graph / watcher
- SCM 面板加入 Repository Summary、Changes Tree、Branch Graph
- Explorer 叠加 Git decorations

### P3：IDEA 风格导航增强

- completion
- signature help
- rename
- formatting
- workspace symbol
- find usages / usages panel

### P4：依赖树与多语言 project UX

- Java `External Libraries`
- Python interpreter / site-packages
- Go modules / stdlib

## 15. 需要修改的主要文件

### 15.1 现有文件

- `src/shared/types/window.ts`
- `src/shared/types/electron-api.ts`
- `src/main/services/code/CodeGitService.ts`
- `src/main/services/code/CodeProjectIndexService.ts`
- `src/main/services/language/LanguageFeatureService.ts`
- `src/main/services/language/LanguageServerSupervisor.ts`
- `src/renderer/components/CodePane.tsx`
- `src/renderer/services/code/MonacoLanguageBridge.ts`

### 15.2 建议新增文件

- `src/main/services/language/LanguageWorkspaceService.ts`
- `src/main/services/language/adapters/LanguageProjectAdapter.ts`
- `src/main/services/language/adapters/JavaProjectAdapter.ts`
- `src/main/services/language/adapters/PythonProjectAdapter.ts`
- `src/main/services/language/adapters/GoProjectAdapter.ts`
- `src/main/services/code/CodeGitRepositoryService.ts`
- `src/main/services/code/CodeGitGraphService.ts`
- `src/main/services/code/CodeGitWatcherService.ts`
- `src/renderer/stores/codePaneRuntimeStore.ts`
- `src/renderer/components/code-pane/CodePaneShell.tsx`
- `src/renderer/components/code-pane/CodePaneActivityRail.tsx`
- `src/renderer/components/code-pane/CodePaneSidebar.tsx`
- `src/renderer/components/code-pane/ExplorerView.tsx`
- `src/renderer/components/code-pane/ScmView.tsx`
- `src/renderer/components/code-pane/CodePaneStatusBar.tsx`

## 16. 决策结论

这套方案的关键结论如下：

- 继续坚持一个通用 `CodePane`
- 语言差异通过 `LanguageProjectAdapter` 承载
- Git 仓库能力独立成仓库状态层，不再只是拉一次 `git status`
- 左侧工作区升级为真正的 workbench sidebar，支持隐藏和宽度调节
- UI 上必须明确展示“文件树索引”和“语言工作区导入”的不同阶段

如果后续按这个方案推进，优先级建议是：

1. 先把侧栏布局与状态栏状态模型做对
2. 再把 Java 工作区可观测性补齐
3. 再做 Git 工作台
4. 最后把依赖树和多语言 project UX 接起来
