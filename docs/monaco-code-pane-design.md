# Monaco Code Pane 设计方案

## 1. 背景

目标是在现有 terminal 窗口内新增一种 `Monaco code pane`，让用户在同一窗口中完成以下动作：

- 以当前本地工作目录作为项目根目录打开代码
- 浏览文件树
- 打开文件并编辑
- 查看哪些文件发生了修改
- 查看单文件 diff
- 与现有 terminal / browser pane 并列分屏

约束：

- 不破坏现有 terminal pane、browser pane、SSH、tmux、workspace restore、autosave、window/group 布局
- 不在本次方案中尝试嵌入外部 IDE，也不追求 JetBrains 级完整 IDE
- 只新增一种 pane，不重写现有窗口模型

## 2. 现状梳理

当前项目已经具备可复用的 pane 扩展基础：

- `Pane.kind` 当前支持 `terminal | browser`
- `SplitLayout` 已经按 pane 类型分发渲染
- `BrowserPane` 已经证明“非 PTY pane”是成立的产品形态
- `windowStore` 的布局、关闭、拆分、autosave 已经围绕通用 `Pane` 工作
- `WorkspaceManager` 已经对 browser pane 做了“非会话型 pane”的持久化和恢复特判

当前需要特别注意的代码约束：

- 很多地方把 `isBrowserPane()` 当成了“非 terminal pane”在用
- PTY 启动/关闭链路默认只认识 terminal pane
- `WorkspaceManager`、`windowHandlers`、`windowWorkingDirectory`、`sshWindowBindings` 都依赖“找第一个 terminal pane”这类逻辑

这意味着：

**Monaco pane 不是单纯多加一个组件就够了。必须把“browser 是唯一非 terminal pane”的隐含假设抽出来，改成“terminal 与非 terminal pane 分流”。**

## 3. 设计目标

### 3.1 必达目标

- 新增 `code` pane 类型
- 通过 toolbar 按钮在当前窗口内打开 `Monaco code pane`
- 根目录默认取当前本地 terminal pane 的 `cwd`
- 支持文件树、tab、多文件打开、编辑、保存
- 支持 Git modified/untracked 标记
- 支持查看单文件 diff
- 支持 workspace 持久化恢复 code pane 的“会话元数据”

### 3.2 非目标

- 不做 JetBrains/VS Code 扩展体系
- 不做 LSP/智能补全平台级架构
- 不做 debugger、断点、运行配置
- 不做 SSH 远程 code pane
- 不做浏览器级拖拽重排复制 browser pane 的所有交互
- 不把窗口变成“只有 code pane，没有 terminal pane”

## 4. 核心设计决策

### 4.1 选型：直接使用 `monaco-editor`

推荐依赖：

- `monaco-editor`

不建议首版引入：

- `@monaco-editor/react`
- `vite-plugin-monaco-editor`

原因：

- 当前项目已经有 `TerminalPane` 这种“手动 mount 外部渲染内核”的模式，直接挂 Monaco 更一致
- Electron + Vite 下 Monaco worker 需要精确控制，直接接入更可控
- 避免额外 loader / CDN / 插件副作用，降低对现有渲染构建链的影响

推荐实现方式：

- 通过 `?worker` 显式导入 Monaco worker
- 在 `src/renderer/utils/monacoEnvironment.ts` 中集中配置 `MonacoEnvironment.getWorker`

### 4.2 code pane 属于“非会话型 pane”

`code pane` 的本质和 `browser pane` 一样：

- 不启动 PTY
- 不参与 `start-window` / `split-pane` 的 PTY 生命周期
- 不参与 SSH 会话族逻辑
- 不参与 tmux pane 同步

建议抽象一个新的共享判断：

```ts
export function isCodePane(pane: Pane): boolean;
export function isTerminalPane(pane: Pane): boolean;
export function isSessionlessPane(pane: Pane): boolean; // browser + code
```

后续所有“进程、会话、SSH、tmux、工作目录”相关分支，都应该优先使用：

- `isTerminalPane`
- `isSessionlessPane`

而不是继续把 `isBrowserPane` 当泛化判断。

### 4.3 v1 保持“每个窗口至少有一个 terminal pane”

推荐规则：

- 可以在 terminal 窗口里拆出 code pane
- 不能把最后一个 terminal pane 关掉，导致窗口只剩 browser/code pane

原因：

- 当前 window 的运行态、状态聚合、working directory、SSH/本地判断都围绕 terminal pane 建立
- 可以显著减少对现有关闭、退出、归档、恢复链路的侵入
- 不会把“terminal window manager”演变成“完全独立的 IDE window”

这条规则应从“只防 browser-only”升级为“防 non-terminal-only”。

### 4.4 code pane 持久化“会话元数据”，不持久化编辑缓冲内容

持久化内容：

- `rootPath`
- `openFiles`
- `activeFilePath`
- `selectedPath`
- `viewMode`
- `diffTarget`

不持久化内容：

- Monaco model 实例
- 未刷盘的 buffer 内容
- tree cache
- git status cache
- watcher 订阅
- 临时搜索状态

原因：

- workspace.json 只存结构和轻量状态
- 避免 autosave 把大段代码内容写入 workspace
- 避免 renderer/runtime 对象污染持久化模型

## 5. 数据模型

### 5.1 `Pane` 扩展

文件：

- `src/shared/types/window.ts`

建议改动：

```ts
export type PaneKind = 'terminal' | 'browser' | 'code';

export interface CodePaneOpenFile {
  path: string;
  pinned?: boolean;
}

export interface CodePaneState {
  rootPath: string;
  openFiles: CodePaneOpenFile[];
  activeFilePath: string | null;
  selectedPath?: string | null;
  viewMode?: 'editor' | 'diff';
  diffTargetPath?: string | null;
}

export interface Pane {
  // existing fields...
  code?: CodePaneState;
}
```

### 5.2 Renderer 运行态状态

建议新增一个独立 runtime store，而不是把运行态塞进 `windowStore`：

文件建议：

- `src/renderer/stores/codePaneRuntimeStore.ts`

结构建议：

```ts
interface CodePaneRuntimeState {
  byPaneId: Record<string, {
    tree: Record<string, CodeTreeNode>;
    expandedPaths: string[];
    loadingPaths: string[];
    savingFiles: string[];
    dirtyFiles: string[];
    fileErrors: Record<string, string>;
    gitStatus: Record<string, GitFileStatus>;
    lastRefreshAt?: string;
  }>;
}

interface MonacoModelRegistry {
  modelsByFilePath: Map<string, monaco.editor.ITextModel>;
  refCounts: Map<string, number>;
}
```

原则：

- `windowStore` 继续只管理 serializable pane/window 状态
- `codePaneRuntimeStore` 管理 tree、watch、saving、dirty、模型引用

### 5.3 可选设置项

建议在 `src/shared/types/workspace.ts` 预留，但首版可以不开放 UI：

```ts
export interface CodePaneSettings {
  autoSaveMode: 'afterDelay' | 'manual';
  autoSaveDelayMs: number;
  fontSize: number;
  wordWrap: 'off' | 'on';
  tabSize: number;
  minimap: boolean;
}
```

推荐默认值：

- `autoSaveMode = afterDelay`
- `autoSaveDelayMs = 800`
- `fontSize = 13`
- `wordWrap = off`
- `tabSize = 2`

## 6. 功能范围

### 6.1 v1 MVP

- 从 toolbar 打开 code pane
- 文件树 lazy load
- 打开文本文件
- Monaco 编辑
- 保存
- tab 切换
- 快速打开文件名
- Git modified/untracked 标记
- 单文件 diff 视图
- 外部文件变化提示

### 6.2 v1.1

- 树节点展开状态持久化
- 右键菜单：Reveal in Folder / Copy Path / Open Diff
- 文件名搜索结果排序优化
- theme token 映射更完整

### 6.3 后续版本

- 内容搜索
- LSP / 诊断
- SSH code pane
- SCM panel

## 7. Renderer 架构

### 7.1 组件结构

建议新增文件：

- `src/renderer/components/CodePane.tsx`
- `src/renderer/components/code-pane/CodePaneToolbar.tsx`
- `src/renderer/components/code-pane/CodePaneSidebar.tsx`
- `src/renderer/components/code-pane/CodePaneTabs.tsx`
- `src/renderer/components/code-pane/CodePaneEditor.tsx`
- `src/renderer/components/code-pane/CodePaneDiffEditor.tsx`
- `src/renderer/components/code-pane/CodePaneStatusBar.tsx`
- `src/renderer/components/code-pane/CodePaneEmptyState.tsx`

推荐布局：

```text
CodePane
├─ Toolbar
├─ Body
│  ├─ Sidebar (file tree)
│  └─ Main
│     ├─ Tabs
│     ├─ Editor / DiffEditor
│     └─ Inline banners (external change, save error, binary file)
└─ StatusBar
```

### 7.2 Monaco 挂载方式

建议新增：

- `src/renderer/utils/monacoEnvironment.ts`
- `src/renderer/utils/codePane.ts`

实现要点：

- 只在首次使用时初始化 Monaco worker
- 使用 `editor.create` / `editor.createDiffEditor`
- 模型通过全局 registry 复用
- 关闭 tab 时只释放引用，不直接盲删 model

### 7.3 与现有 `SplitLayout` 的集成

文件：

- `src/renderer/components/SplitLayout.tsx`

改法：

- 保留 terminal/browser 渲染分支
- 新增 `isCodePane()` 分支
- browser 仍走当前 `DraggableBrowserPane`
- code pane 首版不做拖拽移动手柄

示意：

```ts
if (isBrowserPane(pane)) return <DraggableBrowserPane ... />;
if (isCodePane(pane)) return <CodePane ... />;
return <TerminalPane ... />;
```

### 7.4 与 `TerminalView` 的集成

文件：

- `src/renderer/components/TerminalView.tsx`

新增一个右上角按钮：

- 图标建议：`Code2` / `FileCode2` / `PanelRightOpen` 风格
- 文案建议：`Open Code Pane` / `Split Code Pane`

行为：

- 当前激活 pane 是本地 terminal：以该 pane 的 `cwd` 创建 code pane
- 当前激活 pane 是 browser/code：回退到当前窗口第一个本地 terminal pane 的 `cwd`
- 当前窗口没有本地 terminal pane：按钮禁用

标准 split 按钮建议保持“复制当前 pane 类型”的一致性：

- active terminal -> split terminal
- active browser -> split browser
- active code -> split code

这样不会引入额外心智负担。

### 7.5 快速打开文件

建议直接复用现有：

- `src/renderer/utils/fuzzySearch.ts`

v1 不需要做全文搜索。

## 8. Main 进程架构

### 8.1 新增 handler 模块

建议新增：

- `src/main/handlers/codePaneHandlers.ts`

并在：

- `src/main/handlers/index.ts`

中注册。

### 8.2 新增服务模块

建议新增：

- `src/main/services/code/CodeFileService.ts`
- `src/main/services/code/CodeGitService.ts`
- `src/main/services/code/CodePaneWatcherService.ts`

职责划分：

#### `CodeFileService`

- 校验 `rootPath`
- 校验访问路径必须在 `rootPath` 内
- 列目录
- 读文件
- 写文件
- 检测 binary / 文件过大

#### `CodeGitService`

- 判断 `rootPath` 是否在 git 仓库内
- 获取 modified/untracked/deleted 状态
- 获取单文件 diff 基线内容
- Git 不可用时平滑降级

#### `CodePaneWatcherService`

- 监听项目树变化
- 按 `rootPath` 复用 watcher
- 通过事件推送 renderer

### 8.3 IPC 设计

文件：

- `src/shared/types/electron-api.ts`
- `src/preload/index.ts`

建议新增请求：

```ts
codePaneListDirectory(config)
codePaneReadFile(config)
codePaneWriteFile(config)
codePaneGetGitStatus(config)
codePaneReadGitBaseFile(config)
codePaneWatchRoot(config)
codePaneUnwatchRoot(config)
```

建议新增事件：

```ts
onCodePaneFsChanged(callback)
offCodePaneFsChanged(callback)
```

### 8.4 IPC 请求结构

```ts
interface CodePaneListDirectoryConfig {
  rootPath: string;
  targetPath?: string; // 缺省表示 root
  includeHidden?: boolean;
}

interface CodePaneReadFileConfig {
  rootPath: string;
  filePath: string;
}

interface CodePaneWriteFileConfig {
  rootPath: string;
  filePath: string;
  content: string;
  expectedMtimeMs?: number;
}

interface CodePaneGitStatusConfig {
  rootPath: string;
}

interface CodePaneReadGitBaseFileConfig {
  rootPath: string;
  filePath: string;
}

interface CodePaneWatchRootConfig {
  paneId: string;
  rootPath: string;
}
```

### 8.5 返回结构

```ts
interface CodePaneTreeEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  mtimeMs?: number;
  hasChildren?: boolean;
}

interface CodePaneReadFileResult {
  content: string;
  mtimeMs: number;
  size: number;
  language: string;
  isBinary: boolean;
}

interface CodePaneWriteFileResult {
  mtimeMs: number;
}

interface CodePaneGitStatusEntry {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged?: boolean;
}

interface CodePaneFsChangedPayload {
  rootPath: string;
  changes: Array<{
    type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
    path: string;
  }>;
}
```

## 9. 文件与 Git 具体实现

### 9.1 路径安全

所有 `filePath` 必须满足：

- 绝对路径
- `resolve(filePath)` 位于 `resolve(rootPath)` 之下
- 禁止通过 `..` 跳出 root

建议集中封装：

- `assertPathWithinRoot(rootPath, targetPath)`

### 9.2 文件树

v1 采用 lazy load：

- 初始只加载 root 一级
- 展开目录时再请求子目录

忽略目录建议：

- `.git`
- `node_modules`
- `dist`
- `build`
- `.next`

首版可以写死，后续再做设置。

### 9.3 文件读取

只支持文本文件。

建议策略：

- 大于 2MB 的文件默认不直接打开
- 二进制文件直接提示“不支持预览”
- 文本编码首版只支持 UTF-8

### 9.4 保存策略

推荐首版：

- `afterDelay` 自动保存
- `Ctrl/Cmd+S` 手动触发立即保存
- pane 关闭前 flush 待保存队列

原因：

- 不需要在现有 window close/app quit 里追加复杂的“未保存文件确认”流程
- 对现有 terminal/window 生命周期侵入最小

冲突处理：

- 写入时带 `expectedMtimeMs`
- 如果磁盘版本已变化，返回冲突错误
- renderer 显示 `Reload / Overwrite` 二选一横幅

### 9.5 Git modified 与 diff

推荐主进程通过 git CLI 实现：

- 状态：`git status --porcelain=v1 -z`
- 基线内容：`git show HEAD:<path>`
- diff：可选 `git diff --no-ext-diff -- <path>`

原因：

- 当前项目还没有 git 状态服务
- 仅靠 `.git/HEAD` 无法得到 working tree 变更列表

降级策略：

- git 命令不可用：隐藏 SCM 标记和 diff 入口
- 非 git 仓库：正常编辑，但无 modified/diff 数据

Monaco diff editor 使用：

- 左侧：Git 基线内容
- 右侧：当前磁盘内容 / 当前 model 内容

## 10. 生命周期设计

### 10.1 创建 code pane

1. 用户点击 toolbar 的“Open Code Pane”
2. `TerminalView` 解析项目根目录
3. 调用 `createCodePaneDraft(newPaneId, rootPath)`
4. `splitPaneInWindow()` 插入布局
5. `setActivePane()` 激活新 pane
6. `CodePane` 挂载后拉取目录树和 git 状态

### 10.2 打开文件

1. 用户点击树节点
2. renderer 调用 `codePaneReadFile`
3. runtime registry 获取或创建 model
4. 更新 `pane.code.openFiles` 和 `activeFilePath`
5. `windowStore.updatePane()` 触发 workspace autosave

### 10.3 编辑与保存

1. Monaco model change
2. runtime store 标记 dirty
3. debounce 后触发 `codePaneWriteFile`
4. 保存成功后更新该文件 `mtimeMs`
5. 刷新 git 状态

### 10.4 外部文件变化

1. watcher 推送 `fs-changed`
2. 若文件未 dirty：自动 reload model
3. 若文件 dirty：显示冲突横幅，不自动覆盖
4. 若树节点变化：增量刷新对应目录

### 10.5 关闭 pane

1. 先 flush 当前 pane 的待保存任务
2. 释放 pane 对应的 model 引用
3. 调用 `closePaneInWindow`

### 10.6 关闭窗口/退出应用

为了不破坏现有退出链路，首版不引入全局“unsaved changes 阻塞退出”。

依赖前提：

- 自动保存应足够及时
- 关闭 pane/window 时应主动 flush

## 11. 与现有功能的兼容要求

### 11.1 不修改现有 terminal pane 的 PTY 行为

必须保证以下函数对 code pane 视作“不可启动 PTY”：

- `startWindowPanes`
- `startPaneForWindow`
- `startSplitPaneFromSource`
- `handlePaneExit`

### 11.2 不修改 browser pane 的行为

browser pane 现有：

- webview
- 自定义拖拽重排
- URL drop

这些逻辑全部保持原样，code pane 不复用 browser 的 drag handle。

### 11.3 working directory / project config / git branch 仍由 terminal pane 驱动

以下逻辑不应因为 code pane 激活而失效：

- `open folder`
- `open in IDE`
- git branch 监听
- project config 读取

实现方式：

- 所有“当前工作目录”获取逻辑继续回退到当前窗口的第一个本地 terminal pane

### 11.4 window 状态聚合不应被 code pane 干扰

首版依赖“窗口至少保留一个 terminal pane”规则。

不单独重写 `getAggregatedStatus()`，只需保证不会出现 non-terminal-only window。

## 12. 具体改动文件建议

### 12.1 需要修改的现有文件

- `src/shared/types/window.ts`
- `src/shared/types/electron-api.ts`
- `src/shared/utils/terminalCapabilities.ts`
- `src/preload/index.ts`
- `src/main/handlers/index.ts`
- `src/main/services/WorkspaceManager.ts`
- `src/main/handlers/workspaceHandlers.ts`
- `src/main/index.ts`
- `src/renderer/components/TerminalView.tsx`
- `src/renderer/components/SplitLayout.tsx`
- `src/renderer/stores/windowStore.ts`
- `src/renderer/utils/paneSessionActions.ts`
- `src/renderer/utils/windowWorkingDirectory.ts`
- `src/renderer/utils/sshWindowBindings.ts`

### 12.2 建议新增的文件

- `src/main/handlers/codePaneHandlers.ts`
- `src/main/services/code/CodeFileService.ts`
- `src/main/services/code/CodeGitService.ts`
- `src/main/services/code/CodePaneWatcherService.ts`
- `src/renderer/components/CodePane.tsx`
- `src/renderer/components/code-pane/*`
- `src/renderer/stores/codePaneRuntimeStore.ts`
- `src/renderer/utils/codePane.ts`
- `src/renderer/utils/monacoEnvironment.ts`
- `src/renderer/utils/codePaneLanguage.ts`

## 13. 测试策略

### 13.1 单元测试

- `terminalCapabilities`：`isCodePane / isSessionlessPane / isTerminalPane`
- `WorkspaceManager`：code pane sanitize / hydrate / reset 行为
- `windowStore`：code pane 更新触发 autosave，但不污染 runtime-only
- `CodeFileService`：路径逃逸、防 binary、防大文件、并发写
- `CodeGitService`：git 可用/不可用/非仓库场景

### 13.2 组件测试

- `TerminalView`：按钮显示与禁用条件
- `SplitLayout`：正确渲染 `CodePane`
- `CodePane`：打开文件、切 tab、自动保存、diff 切换

### 13.3 回归测试

- browser pane 仍可正常打开、拖拽、关闭
- terminal split/close/start 逻辑不变
- SSH window 不出现 code pane 入口
- workspace restore 不会尝试启动 code pane 对应 PTY

## 14. 实施阶段

### Phase 0：基础设施

- 新增类型与 capability helper
- 把“browser 是唯一非 terminal pane”的隐式分支抽象为 `isSessionlessPane`
- 接入 `monaco-editor` 和 worker 配置

### Phase 1：MVP

- `CodePane` 基础 UI
- 文件树
- 文本文件打开/编辑/保存
- pane 持久化
- toolbar 按钮

### Phase 2：SCM / Diff

- git status
- tree 状态徽标
- diff editor
- 外部修改提示

### Phase 3：Polish

- 快速打开
- 文件树性能优化
- 空态/错误态
- 快捷键与 status bar

## 15. 风险与规避

### 15.1 风险：把 code pane 错误地当成 terminal pane

规避：

- 明确新增 `isCodePane` 和 `isSessionlessPane`
- 全面替换“用 browser 代表非 terminal”的逻辑

### 15.2 风险：Monaco worker 在 Electron/Vite 下失效

规避：

- 不依赖 CDN / loader 魔法
- 通过 Vite worker import 显式配置

### 15.3 风险：大仓库文件树卡顿

规避：

- lazy load
- 忽略大目录
- watcher 按 rootPath 复用

### 15.4 风险：文件保存冲突导致用户误覆盖

规避：

- 写入带 `expectedMtimeMs`
- 冲突时明确弹出 `Reload / Overwrite`

## 16. 推荐的首版确认项

以下 4 项建议在进入实现前由你拍板：

1. **保存模型**
   推荐：`afterDelay` 自动保存，仍保留 `Ctrl/Cmd+S`

2. **窗口约束**
   推荐：v1 不允许关闭最后一个 terminal pane，避免窗口只剩 code/browser pane

3. **作用域**
   推荐：v1 只支持本地项目，不支持 SSH code pane

4. **Diff 语义**
   推荐：v1 先做 `HEAD vs 当前工作区文件`，不区分 staged/unstaged 视图

## 17. 结论

这个方案可以在不破坏现有 terminal/browser 功能的前提下，把 `Monaco` 作为第三种 pane 安全引入。

最关键的实现点不是 Monaco 本身，而是：

- 把现有“browser-only 特判”升级为“sessionless pane 分流”
- 把编辑器 runtime 状态和 workspace 持久化状态严格分层
- 把工作目录、SSH、tmux、PTY 生命周期继续锁定在 terminal pane 上

在这三个前提下，Monaco code pane 能较低风险地接入现有架构。
