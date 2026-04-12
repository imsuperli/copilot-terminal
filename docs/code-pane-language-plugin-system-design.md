# CodePane 语言插件系统设计

## 1. 背景

当前 `CodePane` 已经具备以下能力：

- 基于 `monaco-editor` 的代码浏览与编辑
- 文件树、搜索、自动保存、Git 状态、diff
- `CodePaneWatcherService` 驱动的文件系统刷新
- `SettingsPanel` 中已有一个“插件”页，但当前仅承载内置的 `Claude StatusLine` 特例

当前 `CodePane` 不具备统一的语言服务平台层：

- TypeScript / JavaScript 主要依赖 Monaco 自带能力
- Java、Python、Go、Rust 等语言没有项目级跳转、hover、references、diagnostics
- 仓库中没有通用的插件注册、下载、安装、启用、更新、卸载机制

如果继续把语言能力直接硬编码到应用内，会带来三个问题：

1. 安装包体持续膨胀，Java / Python / Go / Rust 等运行时和语言服务器会迅速推高交付成本。
2. 每种语言的生命周期、依赖检查、环境探测都不同，直接写死会让主进程越来越难维护。
3. 用户需求并不一致，很多人只需要 1-2 种语言，没有必要让所有人承担全部语言依赖。

因此，推荐把“主流语言支持”设计成一套受限插件系统：应用内提供统一平台，语言能力通过插件下载安装并启用。

## 2. 目标

### 2.1 必达目标

- 在设置页中提供插件发现、安装、启用、禁用、更新、卸载能力
- 支持 `CodePane` 语言能力插件化，首要能力是 `language-server`
- 插件安装在应用 `userData` 下，不打入主安装包
- 插件安装为应用级，启用可细分为“全局默认”和“工作区覆盖”
- 插件故障时不影响现有 `CodePane` 编辑、保存、diff、文件树、Git 等功能
- 平台架构对未来能力可扩展，不只局限于 `language-server`
- 兼容现有内置 `Claude StatusLine` 插件入口，不要求立即推翻重做

### 2.2 非目标

- 不支持任意第三方 JS 直接注入 Electron 主进程或渲染进程
- 不做 VS Code / JetBrains 级别的开放扩展宿主
- 不做 SSH 远程 code pane 的插件执行
- 不做插件脚本直接访问应用内部私有 API
- 不在首版实现 formatter / debugger / test runner / SCM provider 全量能力
- 不要求首版就支持完整的在线社区市场和开放投稿生态

## 3. 设计原则

### 3.1 安全优先

插件是“受限能力包”，不是“任意代码扩展”。

平台允许插件声明：

- 支持的语言
- 激活条件
- 语言服务器启动方式
- 下载地址、校验值、平台产物
- 自定义设置 schema

平台不允许插件：

- 在 Electron 主进程中注册任意代码 hook
- 在渲染进程中执行任意脚本
- 动态扩展 preload 暴露面
- 直接操作非插件授权范围的应用内部状态

### 3.2 平台与能力解耦

应用核心只负责：

- 插件目录管理
- 清单解析
- 下载与校验
- 生命周期管理
- LSP 桥接
- 设置页和工作区状态

具体语言能力由插件产物承担：

- `jdtls`
- `pyright` / `basedpyright`
- `gopls`
- `rust-analyzer`

### 3.3 默认不影响现有行为

没有安装任何语言插件时：

- `CodePane` 继续保持今天的行为
- TS / JS 继续使用 Monaco 原生能力
- Java / Python 继续只是语法高亮和基础编辑

安装但未启用插件时：

- 不拉起语言服务器
- 不更改现有交互

插件故障时：

- 降级回现有编辑器行为
- 不阻断文件读取、编辑、保存、diff

### 3.4 惰性加载

- 应用启动时不主动下载市场数据
- 应用启动时不预热所有插件
- 打开设置页的插件板块或进入需要语言能力的项目时，才触发相应逻辑

## 4. 关键决策

### 4.1 做“受限插件平台”，不做“任意扩展宿主”

这是整套方案最关键的边界。

推荐把 v1 插件能力限制为：

- `language-server`

后续可以逐步扩展到：

- `formatter`
- `linter`
- `statusline-adapter`
- `code-action-provider`

但这些能力仍然应通过“声明式 manifest + 外部子进程”接入，而不是允许插件任意运行应用内代码。

### 4.2 安装是应用级，启用是工作区级

推荐拆成两层状态：

- 应用级安装状态：插件是否已经下载到本地、当前版本是多少、校验是否通过
- 工作区级启用状态：当前工作区是否启用这个插件、是否覆盖全局默认、是否对某语言显式绑定某插件

这样可以避免两个极端：

- 只做全局启用：会导致一个 Java 项目装的插件影响所有工作区
- 只做工作区安装：同一个插件在多个工作区重复下载，管理复杂

### 4.3 统一语言平台，但保留现有 Monaco 内建能力

对于 TS / JS，不应该在首版强行替换掉 Monaco 现有能力。

推荐规则：

- JS / TS 默认继续使用 Monaco 内建能力
- 外部语言插件只有在满足以下条件时才接管：
  - 插件 manifest 显式声明支持接管内建语言服务
  - 用户在设置中显式启用“覆盖内建语言能力”

这样可以避免首版插件系统反而把现在可用的 TS / JS 体验打坏。

### 4.4 插件运行在子进程，不运行在 Electron 进程内

插件运行方式统一抽象为 `Runtime Adapter`：

- `binary`
- `node`
- `java`
- `python`

这些 runtime 最终都以子进程形式运行。

平台负责：

- 组装命令行
- 注入最小必要环境变量
- 管理 stdio / socket / 退出码 / 重启策略

插件本身不进入 Electron 的主进程或渲染进程执行。

### 4.5 首版市场只做“官方受控目录”

为了降低安全和兼容压力，推荐 v1 市场只支持官方维护的目录源：

- 应用请求一个官方 catalog JSON
- catalog 只列出平台认可的插件版本和下载地址
- 安装时校验 `sha256`

本地 sideload 可以保留，但应作为开发 / 高级用户能力，不在首版默认入口里强调。

## 5. 总体架构

```text
SettingsPanel / CodePane
        │
        ▼
Renderer Plugin UI + Monaco Language Bridge
        │ IPC
        ▼
Plugin Handlers / Language Handlers
        │
        ├─ PluginCatalogService
        ├─ PluginRegistryStore
        ├─ PluginInstallerService
        ├─ PluginManager
        ├─ LanguagePluginResolver
        ├─ LanguageServerSupervisor
        └─ LanguageFeatureService
                 │
                 ├─ External LSP Process (binary / node / java / python)
                 └─ Diagnostics / hover / definition / references / symbols
```

职责分层如下：

- `PluginCatalogService`
  - 拉取远端市场目录
  - 缓存 catalog
  - 过滤平台兼容性

- `PluginRegistryStore`
  - 维护本地已安装插件注册表
  - 维护安装路径、版本、校验状态、状态摘要

- `PluginInstallerService`
  - 下载产物
  - 校验哈希
  - 解包
  - 原子替换版本目录
  - 回滚失败安装

- `PluginManager`
  - 汇总 catalog 与 registry
  - 对外提供安装、启用、禁用、更新、卸载接口
  - 协调设置层和运行时层

- `LanguagePluginResolver`
  - 根据文件语言、项目类型、工作区覆盖规则决定使用哪个插件

- `LanguageServerSupervisor`
  - 负责 LSP 进程生命周期
  - 以 `rootPath + pluginId + runtime profile` 为 key 复用会话

- `LanguageFeatureService`
  - 接收 renderer 请求
  - 把 definition / hover / references / diagnostics 等能力桥接到 Monaco

## 6. 数据模型

## 6.1 新增类型文件

推荐新增：

- `src/shared/types/plugin.ts`
- `src/main/services/plugins/*`
- `src/main/services/language/*`

避免把插件类型继续堆到 `workspace.ts` 或 `electron-api.ts` 里。

## 6.2 插件 manifest

每个插件解包后根目录包含 `plugin.json`。

建议结构：

```json
{
  "schemaVersion": 1,
  "id": "com.copilot-terminal.java",
  "name": "Java Language Support",
  "publisher": "copilot-terminal",
  "version": "1.0.0",
  "description": "Java support powered by Eclipse JDT Language Server.",
  "homepage": "https://example.com/plugins/java",
  "license": "EPL-2.0",
  "categories": ["language"],
  "engines": {
    "app": "^3.0.0"
  },
  "capabilities": [
    {
      "type": "language-server",
      "languages": ["java"],
      "fileExtensions": [".java"],
      "projectIndicators": ["pom.xml", "build.gradle", "settings.gradle", "gradlew"],
      "priority": 100,
      "takesOverBuiltinLanguageService": false,
      "workspaceMode": "per-root",
      "features": {
        "definition": true,
        "hover": true,
        "references": true,
        "documentSymbol": true,
        "workspaceSymbol": true,
        "diagnostics": true,
        "completion": true,
        "rename": false,
        "codeAction": false
      },
      "runtime": {
        "type": "java",
        "entry": "server/plugins/org.eclipse.equinox.launcher.jar",
        "args": [
          "-configuration",
          "server/config",
          "-data",
          "${workspaceStorage}"
        ],
        "env": {}
      },
      "requirements": [
        {
          "type": "java",
          "version": ">=17"
        }
      ]
    }
  ],
  "settingsSchema": {
    "java.home": {
      "type": "string",
      "title": "JDK Home",
      "scope": "global"
    }
  }
}
```

### manifest 设计要点

- `schemaVersion`：为未来演进保留升级空间
- `capabilities[]`：一个插件未来可声明多种能力，不限于语言服务
- `workspaceMode`
  - `per-root`：同一根目录复用一个服务实例
  - `per-pane`：极少数能力需要为每个 pane 单独启动
- `requirements[]`：声明前置依赖，便于设置页提前做环境检查
- `settingsSchema`：平台渲染设置 UI，不让插件自定义任意界面代码

## 6.3 市场 catalog

远端 catalog 只承载“可发现和可下载元数据”，不承载运行时代码。

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-04-12T00:00:00.000Z",
  "plugins": [
    {
      "id": "com.copilot-terminal.java",
      "name": "Java Language Support",
      "publisher": "copilot-terminal",
      "latestVersion": "1.0.0",
      "summary": "Java support powered by Eclipse JDT Language Server.",
      "categories": ["language"],
      "tags": ["java", "jdtls", "lsp"],
      "platforms": [
        {
          "os": "darwin",
          "arch": "arm64",
          "downloadUrl": "https://example.com/plugins/java/1.0.0/darwin-arm64.zip",
          "sha256": "..."
        },
        {
          "os": "win32",
          "arch": "x64",
          "downloadUrl": "https://example.com/plugins/java/1.0.0/win32-x64.zip",
          "sha256": "..."
        }
      ]
    }
  ]
}
```

### catalog 设计要点

- catalog 与安装包 manifest 解耦，降低远端查询体积
- 安装前先拿 catalog 判断兼容平台和版本
- 下载后仍以包内 `plugin.json` 为最终可信元数据来源

## 6.4 本地插件注册表

推荐单独存储在：

- `${userData}/plugins/registry.json`

示例：

```json
{
  "schemaVersion": 1,
  "plugins": {
    "com.copilot-terminal.java": {
      "source": "marketplace",
      "installedVersion": "1.0.0",
      "installPath": "/.../plugins/packages/com.copilot-terminal.java/1.0.0",
      "enabledByDefault": false,
      "status": "installed",
      "lastCheckedAt": "2026-04-12T00:00:00.000Z",
      "lastKnownHealth": "ok"
    }
  }
}
```

### 为什么不把安装状态放进 `workspace.json`

- 插件是应用资源，不是工作区资源
- 多工作区共享同一份安装产物
- 工作区切换不应该触发插件重新下载
- 减少 `workspace.json` 体积和职责膨胀

## 6.5 工作区设置扩展

当前 `Settings` 在 `workspace.json` 中保存。推荐新增一段工作区级插件设置：

```ts
interface WorkspacePluginSettings {
  enabledPluginIds?: string[];
  disabledPluginIds?: string[];
  languageBindings?: Record<string, string>;
  pluginSettings?: Record<string, Record<string, unknown>>;
}
```

并在 `Settings` 中新增：

```ts
plugins?: WorkspacePluginSettings;
```

语义：

- `enabledPluginIds`
  - 当前工作区显式启用的插件
- `disabledPluginIds`
  - 当前工作区显式禁用的插件
- `languageBindings`
  - 例如 `"java" -> "com.copilot-terminal.java"`
- `pluginSettings`
  - 工作区级覆盖项，例如 Java 项目的 workspace data 路径

### 启用优先级

需要把“全局默认”和“工作区覆盖”定义成固定规则，避免实现期出现分叉。

推荐优先级：

1. `disabledPluginIds`
2. `enabledPluginIds`
3. `registry.enabledByDefault`
4. 未启用

解释：

- 如果某插件同时出现在工作区启用和禁用列表，以禁用为准
- 如果工作区没有显式配置，则回退到应用级默认启用状态
- 这样可以确保“全局默认”只作为默认值，不覆盖工作区明确选择

## 7. 本地目录布局

推荐目录：

```text
${userData}/
  workspace.json
  plugins/
    registry.json
    catalog-cache.json
    packages/
      com.copilot-terminal.java/
        1.0.0/
          plugin.json
          server/
          assets/
    downloads/
      *.tmp
    runtime/
      logs/
        com.copilot-terminal.java.log
      workspace/
        com.copilot-terminal.java/
          <hash(resolvedProjectRoot)>/
```

设计原因：

- `packages/` 只放不可变版本目录，更新时写新目录，避免原地覆盖
- `downloads/` 放临时文件，安装成功后清理
- `runtime/` 放日志和语言服务器工作目录，不污染包目录

## 8. 生命周期设计

## 8.1 市场发现

触发时机：

- 用户打开设置页的插件板块
- 用户手动点击刷新
- 可选的后台低频刷新

流程：

1. `SettingsPanel` 请求 `list-plugin-catalog`
2. 主进程 `PluginCatalogService` 读取缓存
3. 缓存过期时发起网络请求
4. 返回兼容当前平台的插件列表

### 性能要求

- 启动阶段不主动联网
- catalog 请求失败不影响设置页其他部分
- 允许只显示“已安装插件”，不阻塞界面渲染

## 8.2 安装

流程：

1. 用户点击安装
2. 主进程读取 catalog，定位当前平台产物
3. 下载到 `downloads/*.tmp`
4. 校验 `sha256`
5. 解压到临时目录
6. 读取并校验 `plugin.json`
7. 原子移动到版本目录
8. 写入 `registry.json`
9. 返回安装结果

失败策略：

- 任一步失败都不覆盖现有安装版本
- 保留必要日志
- 清理临时目录

## 8.3 启用

启用分两层：

- 全局默认启用
- 当前工作区启用

推荐 UI 行为：

- 安装后不自动启用，避免用户未理解依赖要求就改变编辑器行为
- 支持“安装并在当前工作区启用”

## 8.4 激活

当 `CodePane` 打开文件或进入项目后：

1. `LanguagePluginResolver` 根据 `rootPath + file language + project indicators + workspace bindings` 选择插件
2. 校验插件是否已安装、已启用、满足 runtime requirements
3. `LanguageServerSupervisor` 为该 `resolvedProjectRoot` 启动或复用 LSP 会话
4. Renderer 通过 Monaco provider 发起 definition / hover / references 请求

### 项目根目录解析

`CodePane` 当前只有 `rootPath`，但真正的语言服务器工作根目录未必等于它。

因此推荐在激活前增加一个 `ProjectRootResolver`：

1. 先看工作区是否存在显式覆盖
2. 再依据插件声明的 `projectIndicators` 自下而上寻找项目根
3. 如果没有找到，再回退到 `CodePane.rootPath`

输出结果用于：

- `LanguageServerSupervisor` 的 session key
- 插件 runtime 的工作目录
- `${workspaceStorage}` 占位符展开

这样可以避免以下问题：

- monorepo 中所有子项目错误复用同一份语言服务器
- Java / Python 插件把仓库根误判为项目根

## 8.5 更新

推荐策略：

- 首版只做手动更新
- 更新前下载并校验新版本
- 新版本健康检查成功后切换注册表指向
- 保留旧版本，供回滚或清理任务使用

运行中的语言服务器建议继续维持旧版本实例，直到：

- 当前会话关闭
- 用户手动重启语言服务
- 或重新打开项目

不要在运行中强切版本，避免把已有编辑会话打断。

## 8.6 禁用和卸载

禁用：

- 仅改变启用状态
- 如有运行中的语言服务器，则做优雅关闭

卸载：

- 若有工作区仍引用该插件，先提示并阻止直接删除
- 卸载只移除安装产物和注册表记录，不改写其他工作区业务状态

## 9. 语言服务架构

## 9.1 LanguagePluginResolver

推荐解析顺序：

1. 当前工作区 `languageBindings`
2. 当前工作区显式启用的插件
3. 全局默认启用插件
4. 内建 Monaco 语言能力

冲突时：

- 如果多个插件都匹配同一语言且优先级相同，设置页必须给出显式绑定入口
- 不允许隐式随机选择

## 9.2 LanguageServerSupervisor

职责：

- 按 session key 复用服务实例
- 管理启动、退出、崩溃、重启、空闲回收
- 维护从 `rootPath` 到语言服务器的映射

推荐 session key：

```text
pluginId + resolvedProjectRoot + runtimeProfileHash
```

这样可以做到：

- 同一项目多个 `CodePane` 共享一份 Java / Python / Go 语言服务器
- 不同项目互相隔离
- 不同 runtime 配置不会错误复用

## 9.3 Runtime Adapter

建议抽象统一接口：

```ts
interface PluginRuntimeAdapter {
  supports(runtime: PluginRuntime): boolean;
  validate(runtime: PluginRuntime, plugin: InstalledPlugin): Promise<ValidationResult>;
  spawn(runtime: PluginRuntime, context: SpawnContext): Promise<SpawnResult>;
}
```

首版支持：

- `binary`
  - 直接启动插件目录里的可执行文件
- `node`
  - 使用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 以 Node 模式运行插件 JS 入口
- `java`
  - 调用系统 `java`，或使用插件设置中指定的 `java.home`
- `python`
  - 调用用户指定解释器或自动发现的解释器

### 设计注意点

- adapter 只处理 runtime，不处理语言逻辑
- 这样后续 formatter、linter 也可复用相同 runtime 抽象

## 9.4 LanguageFeatureService

对 renderer 暴露统一接口：

- `code-pane-get-definition`
- `code-pane-get-hover`
- `code-pane-get-references`
- `code-pane-get-document-symbols`
- `code-pane-prepare-rename`
- `code-pane-rename`
- `code-pane-request-completion`
- `code-pane-resolve-code-action`

首版建议优先实现：

- definition
- hover
- references
- documentSymbol
- diagnostics

这些能力对“点击跳转”和基础 IDE 感知最关键。

## 9.5 Diagnostics 推送

diagnostics 不适合全都走请求-响应模式。

推荐：

1. `LanguageServerSupervisor` 接收 LSP `publishDiagnostics`
2. 主进程缓存每个文件的最新 diagnostics
3. 通过 IPC event 推送给 renderer
4. Renderer 将 diagnostics 转成 Monaco markers

这样：

- 能与现有 `refreshProblems()` 体系对接
- 不阻塞编辑交互

## 9.6 与现有 CodePane 的集成

`CodePane` 现有文件读写、Git 状态、diff、watcher 流程不需要改写。

新增层只放在“语言语义能力”上：

- model 创建后注册到 `MonacoLanguageBridge`
- Monaco provider 调用主进程语言接口
- 文件保存时通知 LSP `didSave`
- 内容变更时做节流 `didChange`

不应让插件层接管以下能力：

- 文件读写
- 目录树
- Git 状态
- diff
- 外部文件变更 watcher

这样可保证现有功能稳定。

## 10. 设置页与插件中心设计

## 10.1 插件页结构

复用现有 `SettingsPanel` 的“插件”页，但升级为通用插件中心。

推荐区块：

- 已安装插件
- 可下载插件
- 内置插件
- 更新可用

其中：

- `Claude StatusLine` 作为“内置插件”卡片继续保留
- 语言插件作为“可下载插件”卡片展示

### 内置插件兼容策略

现有 `Claude StatusLine` 不要求第一阶段迁移到新的安装器、registry、runtime pipeline。

推荐做法：

- UI 层先统一展示模型，把它标记为 `source = builtin`
- 行为层仍继续复用现有 `statusLineHandlers` 和配置链路
- 等通用插件平台稳定后，再决定是否把它迁移到统一 registry

这样可以避免在语言插件平台落地时顺带重写现有稳定功能。

## 10.2 插件卡片信息

每张卡片至少显示：

- 名称
- 发布者
- 类型标签
- 支持语言
- 当前状态
  - 未安装
  - 已安装
  - 已启用
  - 需要配置
  - 更新可用
  - 启动失败
- 版本号
- 操作按钮
  - 安装
  - 启用
  - 禁用
  - 更新
  - 卸载
  - 配置

## 10.3 工作区绑定体验

对于同一语言存在多个插件的情况，设置页需要提供：

- 默认语言绑定
- 当前工作区覆盖

例如：

- 全局默认：`python -> com.copilot-terminal.python`
- 当前工作区：`python -> com.company.internal.python`

## 10.4 依赖检查体验

如果插件依赖未满足，不能只报错。

设置页应给出结构化状态：

- Java 插件：未找到 JDK 17+
- Python 插件：未检测到可用解释器
- Node 插件：Node runtime 初始化失败

并提供相应操作：

- 自动探测
- 手动选择路径
- 打开帮助文档

## 11. 安全设计

## 11.1 不允许插件进入应用进程

这是必须坚持的底线：

- 不把插件 JS `require` 进主进程
- 不在渲染进程动态执行插件脚本
- 不在 preload 暴露插件自定义 API

插件只能作为外部进程被拉起，并通过标准协议通信。

## 11.2 受控市场

首版建议：

- 只信任官方 catalog
- 下载源域名固定
- 每个产物必须带 `sha256`

后续如果做开放市场，再考虑：

- 额外签名
- 发布者信任体系
- 风险分级

## 11.3 运行时限制

平台应限制：

- 只允许从插件目录或显式声明的系统运行时启动命令
- 环境变量白名单传递
- 日志文件大小上限
- 自动重启次数上限
- 超时与健康检查

## 11.4 用户可见性

用户应能看到：

- 插件安装来源
- 当前版本
- 最近启动错误
- 最近更新时间
- 运行时要求

这样出了问题才可诊断。

## 12. 兼容性与非回归策略

## 12.1 对现有功能零侵入

以下功能必须保持原样：

- `TerminalPane`
- `BrowserPane`
- Chat
- SSH
- 工作区持久化
- `CodePane` 的文件树、编辑、保存、diff、Git 状态

插件系统只新增服务和 UI，不重写现有主链路。

## 12.2 默认空平台

默认状态：

- 没有已安装语言插件
- 没有后台运行语言服务
- 不在启动阶段请求市场

这样可以保证发布插件系统后，不会影响不使用该功能的用户。

## 12.3 渐进接入 CodePane

推荐接入顺序：

1. 只加插件中心和安装逻辑
2. 只加 definition / hover / diagnostics
3. 再扩 completion / rename / code actions

避免第一版就一次性改动整个编辑器交互面。

## 12.4 失败自动降级

当插件不可用时：

- definition 请求返回空结果
- diagnostics 清空对应 markers
- UI 仅显示状态提示，不中断编辑

用户仍然可以像今天一样打开和编辑文件。

## 12.5 渐进发布与 kill switch

为了进一步降低对现有功能的影响，推荐在首轮上线阶段增加平台级开关：

- `features.codePluginsEnabled`

行为建议：

- 关闭时：设置页不展示外部语言插件入口，`CodePane` 不注册语言插件 provider
- 打开时：才启用插件中心与语言服务链路

这样可以在开发、灰度和正式发布之间保留清晰的回滚路径。

## 13. 推荐模块拆分

## 13.1 主进程

建议新增：

- `src/main/services/plugins/PluginCatalogService.ts`
- `src/main/services/plugins/PluginRegistryStore.ts`
- `src/main/services/plugins/PluginInstallerService.ts`
- `src/main/services/plugins/PluginManager.ts`
- `src/main/services/plugins/PluginManifestValidator.ts`
- `src/main/services/language/LanguagePluginResolver.ts`
- `src/main/services/language/LanguageServerSupervisor.ts`
- `src/main/services/language/LanguageFeatureService.ts`
- `src/main/services/language/runtime/NodeRuntimeAdapter.ts`
- `src/main/services/language/runtime/JavaRuntimeAdapter.ts`
- `src/main/services/language/runtime/PythonRuntimeAdapter.ts`
- `src/main/services/language/runtime/BinaryRuntimeAdapter.ts`

新增 handler：

- `src/main/handlers/pluginHandlers.ts`
- `src/main/handlers/languageHandlers.ts`

并在 `HandlerContext` 中增加：

- `pluginManager`
- `languageFeatureService`

## 13.2 Shared

建议新增：

- `src/shared/types/plugin.ts`

扩展：

- `src/shared/types/workspace.ts`
- `src/shared/types/electron-api.ts`

## 13.3 Preload

新增 API：

- `listPlugins`
- `listPluginCatalog`
- `installPlugin`
- `uninstallPlugin`
- `updatePlugin`
- `setPluginEnabled`
- `setWorkspacePluginBinding`
- `onPluginRuntimeStateChanged`
- `onCodePaneDiagnosticsChanged`

## 13.4 Renderer

建议新增：

- `src/renderer/hooks/usePluginCatalog.ts`
- `src/renderer/hooks/useInstalledPlugins.ts`
- `src/renderer/components/settings/PluginCenter.tsx`
- `src/renderer/components/settings/PluginCard.tsx`
- `src/renderer/components/settings/PluginDetailDrawer.tsx`
- `src/renderer/services/code/MonacoLanguageBridge.ts`

## 14. 实施路线

## 14.1 Phase 0：平台地基

- 定义 `plugin.ts`
- 增加本地 `registry.json`
- 增加插件目录结构
- 增加 `PluginManager` 基础服务
- 设置页先展示“内置插件 + 空的外部插件区”

目标：

- 不接入 `CodePane`
- 先把插件平台骨架跑通

## 14.2 Phase 1：本地安装与 sideload

- 支持从本地 zip / package 安装
- 支持安装、卸载、启用、禁用
- 做 manifest 校验和目录原子写入

目标：

- 不依赖线上市场即可验证插件生命周期

## 14.3 Phase 2：LSP 桥接 MVP

- 增加 `LanguageServerSupervisor`
- 增加 Monaco definition / hover / diagnostics 桥接
- 首个语言建议先做 Python 或 Go

目标：

- 验证整条“安装 -> 启用 -> 语言服务 -> Monaco”链路

## 14.4 Phase 3：市场与更新

- 增加官方 catalog
- 增加更新检查
- 增加版本切换和回滚

## 14.5 Phase 4：Java 插件

- 接入 `jdtls`
- 增加 JDK 检测
- 增加 Maven / Gradle 项目标记识别
- 优化 workspace data 目录和索引缓存

Java 不建议作为第一个插件来验证平台，因为它对运行时、索引、项目导入的要求最高。

## 15. 风险与缓解

## 15.1 Java 复杂度高

风险：

- 启动慢
- JDK 要求高
- Maven / Gradle 导入复杂
- 索引数据体积大

缓解：

- 先用 Python / Go 验证平台
- Java 单独做 requirements 检测和 setup 向导

## 15.2 Node runtime 跨平台细节

风险：

- `ELECTRON_RUN_AS_NODE=1` 的行为需要在打包后验证

缓解：

- 把 `node` adapter 明确独立成一个 runtime adapter
- 必要时可切换为捆绑独立 Node runtime 的策略

## 15.3 开放市场安全边界

风险：

- 下载不可信产物
- 发布者难以治理

缓解：

- v1 只做官方受控 catalog
- 本地 sideload 只作为高级入口

## 15.4 插件把现有体验拖慢

风险：

- 启动即扫描
- 打开文件即阻塞

缓解：

- 启动不联网
- 插件页按需加载
- LSP 初始化异步，不阻塞 editor surface

## 16. 自审结论

这套架构是合理的，原因如下：

1. 它复用了现有项目已经成熟的 `main service + IPC handler + preload + renderer hook` 分层，而不是引入第二套架构。
2. 它把插件严格限制为“受控能力包 + 外部进程”，避免 Electron 应用最危险的任意扩展宿主问题。
3. 它把“安装状态”和“工作区启用状态”拆开，能在多工作区场景下保持清晰的数据边界。
4. 它允许现有 `CodePane` 继续工作，不要求一次性替换掉 Monaco 的已有能力。
5. 它能逐步扩展到 formatter、linter、statusline-adapter，而不会把 v1 设计锁死在某一个语言实现上。

这套架构仍有两个明确前提：

- 首版必须坚持“官方受控 catalog + 受限 capability”，不能中途放松成任意插件。
- Java 不应作为平台验证的第一语言，应该在平台链路通过后单独推进。

在这两个前提下，这个方案具备：

- 可落地性
- 可扩展性
- 对现有功能的低侵入性

推荐按该设计推进。
