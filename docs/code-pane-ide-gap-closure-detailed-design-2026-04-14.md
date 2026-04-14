# CodePane IDE 差距补全实施顺序与详细设计（2026-04-14）

## 1. 文档定位

本文用于补充以下设计文档尚未完全覆盖、或已经设计但尚未完整落地的高优先级 IDE 能力：

- `docs/monaco-code-pane-design.md`
- `docs/code-pane-language-plugin-system-design.md`
- `docs/code-pane-ide-detailed-design-2026-04-13.md`
- `docs/code-pane-ide-p5-p9-detailed-design-2026-04-13.md`

前两份文档解决的是工作台和语言服务骨架问题；`P0-P9` 文档解决的是通用 IDE 骨架、Run/Test/Debug、Project Tool Window、Git 与性能体系问题。

当前还缺少的，是让 `CodePane` 真正接近 IntelliJ IDEA / PyCharm / GoLand 主力体验的“最后一公里能力”。

本文目标有两个：

1. 明确剩余高优先级差距的实施顺序
2. 给出可以直接开工的详细设计方案

## 2. 当前基线与关键差距

### 2.1 已具备能力

当前已具备的主干能力包括：

- 通用 `CodePane` 工作台
- 文件树、搜索、Problems、SCM
- definition / hover / references / document symbols
- completion / signature help / rename / formatting / workspace symbols
- search everywhere / recent files / recent locations / back / forward
- Run / Test / Debug 基础工具窗
- Java / Python / Go 项目模型与 `External Libraries`
- Git stage / unstage / discard / commit / stash / blame / history / branch graph
- Refactor preview / move / safe delete / rename
- runtime/perf 观测面板
- 插件平台类型与 capability resolver 基础设施

### 2.2 与 IDEA / PyCharm 的高优先级差距

按是否影响“主力使用”排序，当前仍有以下关键缺口：

1. 结构化导航表层不足
   - 缺少 `Breadcrumbs`
   - 缺少 `Quick Documentation`
   - 缺少 `Call Hierarchy / Type Hierarchy`
   - 缺少 `Inlay Hints / Semantic Tokens`
2. 调试深度不足
   - 缺少条件断点 / 日志断点
   - 缺少 Watch 持久化
   - 缺少异常断点 / attach model / breakpoint 管理
3. 项目环境管理不足
   - 缺少 Maven / Gradle reimport
   - 缺少 Python interpreter / environment 切换
   - 缺少 Go workspace / env 修复入口
4. Git 和冲突工作流不足
   - 缺少 chunk 级 stage/discard
   - 缺少三方冲突解决视图
   - 缺少 interactive rebase / branch 管理视图
5. 重构能力深度不足
   - 缺少稳定的 move package/class/module
   - 缺少 safe delete 深校验
   - 缺少批量重构预览增强
6. 插件运行时仍未接入主链路
   - `formatter / linter / test-provider / debug-adapter` 已有 platform schema，但未进入运行时闭环
7. 保存与质量门禁不足
   - 缺少 format on save / organize imports on save / lint on save
   - 缺少 Problems 与 linter 的统一质量门禁

## 3. 实施原则

### 3.1 优先级原则

优先实现会直接影响高频开发动作的能力：

1. 看代码更快
2. 跳转更准
3. 调试更稳
4. 项目环境更可控
5. Git / 重构闭环更完整

### 3.2 架构原则

- 继续坚持一个通用 `CodePane`
- Renderer 不直接理解 Maven / venv / go env 的细节
- 写操作继续走 preview / confirmation / failure fallback
- 新能力尽量通过 `Tool Window`、overlay、side panel、status item 承载
- 不再继续把复杂状态直接塞进 `CodePane.tsx`

### 3.3 交付原则

- 每一批功能必须可以单独回归
- 每一批功能都应有明确验收标准
- 每一批功能都应可在能力不足时优雅退化

## 4. 推荐实施顺序

## 4.1 P10：结构化导航与语义呈现

### P10-1：结构化导航表层

目标：

- 用最小实现成本显著提升代码阅读效率

范围：

- Breadcrumbs
- 当前符号路径显示
- Quick Documentation
- 当前光标上下文驱动的文档刷新

为什么先做：

- 不依赖新的语言后端协议扩展
- 基本可以复用现有 `document symbols` 和 `hover`
- 用户主观感知提升快

### P10-2：层级导航与语义呈现增强

范围：

- Call Hierarchy
- Type Hierarchy
- Inlay Hints
- Semantic Tokens
- 文档高亮强化与 symbol outline 联动

## 4.2 P11：调试深化

### P11-1：断点与会话管理增强

范围：

- 条件断点
- 日志断点
- Breakpoint 管理器
- Exception stop
- Attach / Launch 配置统一模型

### P11-2：调试上下文增强

范围：

- Watch 持久化
- 更完整的线程 / stack / scope 视图
- 会话恢复与断点同步

## 4.3 P12：项目环境管理

### P12-1：Java / Python / Go 环境控制面板

范围：

- Maven / Gradle reimport
- Python interpreter / venv / conda / poetry 选择
- Go env / work sync / module refresh

### P12-2：项目修复与状态透明化

范围：

- 语言导入阶段进度细化
- 常见环境异常诊断
- 一键修复入口

## 4.4 P13：Git 与重构深化

### P13-1：Git 可操作粒度增强

范围：

- hunk/chunk 级 stage / discard
- branch 管理
- interactive rebase 视图

### P13-2：冲突与重构深化

范围：

- 三方冲突解决视图
- move class / package / module
- safe delete 深校验
- change signature / extract / inline 深化

## 4.5 P14：插件运行时与保存质量链路

### P14-1：插件运行时接入

范围：

- formatter runtime 接入
- linter runtime 接入
- test provider 接入
- debug adapter 接入

### P14-2：保存质量门禁

范围：

- format on save
- organize imports on save
- lint on save
- quality gate status

## 5. 详细设计

## 5.1 P10-1：Breadcrumbs + Quick Documentation

### 5.1.1 目标

让用户在阅读和跳转代码时，始终能看到：

- 当前正在看的文件
- 当前光标位于哪个类 / 方法 / 函数 / 字段中
- 当前符号的快速文档

### 5.1.2 Renderer 设计

新增：

- `src/renderer/components/code-pane/BreadcrumbsBar.tsx`
- `src/renderer/components/code-pane/QuickDocumentationPanel.tsx`

扩展：

- `src/renderer/components/CodePane.tsx`

状态模型建议：

```ts
interface CodePaneBreadcrumbItem {
  id: string;
  label: string;
  kind: 'file' | 'symbol';
  lineNumber: number;
  column: number;
}

interface QuickDocumentationState {
  visible: boolean;
  loading: boolean;
  error: string | null;
  result: CodePaneHoverResult | null;
}
```

交互设计：

- `BreadcrumbsBar` 放在 tabs 下方、editor 上方
- 第一段始终是当前文件
- 后续段是当前光标所在的 symbol path
- 点击某个 breadcrumb 时，跳转到该 symbol 的 `selectionRange`
- `Quick Documentation` 通过 toolbar 按钮和快捷键触发
- 文档面板打开后，跟随当前光标位置刷新

### 5.1.3 Main / IPC 设计

本阶段不新增后端服务，只复用：

- `code-pane-get-document-symbols`
- `code-pane-get-hover`

### 5.1.4 数据流

1. 光标移动或焦点编辑器切换
2. Renderer 计算当前上下文文件
3. 基于当前文件请求 `document symbols`
4. Renderer 从 symbol tree 中提取 active symbol path
5. 面包屑渲染
6. 用户打开 Quick Documentation 时，请求当前光标的 `hover`
7. 文档面板渲染 `markdown/plaintext`

### 5.1.5 验收标准

- 打开任意支持符号的文件后可看到 breadcrumb
- 当前光标进入更深层 symbol 时，breadcrumb 可更新
- 点击 breadcrumb 可跳转回对应 symbol
- Quick Documentation 可在无 hover 数据时优雅显示 empty state

## 5.2 P10-2：Call Hierarchy / Type Hierarchy / Inlay / Semantic

### 5.2.1 Main

扩展：

- `LanguageFeatureService`
- `LanguageServerSupervisor`

新增能力：

- `prepareCallHierarchy`
- `getIncomingCalls`
- `getOutgoingCalls`
- `getTypeHierarchy`
- `getInlayHints`
- `getSemanticTokens`

### 5.2.2 Renderer

新增：

- `src/renderer/components/code-pane/tool-windows/HierarchyToolWindow.tsx`
- `src/renderer/components/code-pane/tool-windows/SemanticToolWindow.tsx`

扩展：

- `MonacoLanguageBridge`
- `CodePaneRuntimeStore`

### 5.2.3 验收标准

- 可以从当前 symbol 打开 call hierarchy
- 可以展开 incoming / outgoing calls
- 支持 type hierarchy 的语言可以展示 parent / child
- inlay hints 与 semantic tokens 在大文件下不明显拖慢编辑

## 5.3 P11：调试深化

### 5.3.1 统一模型补充

```ts
interface CodePaneBreakpoint {
  id?: string;
  filePath: string;
  lineNumber: number;
  condition?: string;
  logMessage?: string;
  enabled?: boolean;
}

interface DebugWatchExpression {
  id: string;
  expression: string;
  lastValue?: string;
  error?: string;
}
```

### 5.3.2 设计重点

- breakpoint 从“只有行号”升级为“可配置对象”
- watch 独立于 evaluate 历史
- attach / launch 统一进入 run/debug profile 模型
- exception stop 走语言无关模型，再由 driver 适配

### 5.3.3 风险

- 目前 debug driver 不是标准 DAP，需要先统一抽象层
- Java / Python / Go driver 能力不完全对齐，必须允许降级

## 5.4 P12：项目环境管理

### 5.4.1 设计重点

- 环境信息不止展示，还必须“可切换”
- 项目状态不止读取，还必须“可刷新 / 可重导 / 可修复”

### 5.4.2 Java

- `Maven/Gradle reimport`
- profiles 可见
- 常用 lifecycle / boot profile 入口

### 5.4.3 Python

- interpreter 选择
- venv / conda / poetry 状态切换
- 环境刷新

### 5.4.4 Go

- `go env`
- `go work sync`
- module cache / vendor 状态

## 5.5 P13：Git / Refactor 深化

### 5.5.1 Git

- 从文件级操作深化到 chunk/hunk 级操作
- 独立 branch 管理和 interactive rebase 视图
- 三方冲突解决视图

### 5.5.2 Refactor

- move class / package / module
- safe delete 深校验
- 统一 preview model 继续复用

## 5.6 P14：插件运行时与质量门禁

### 5.6.1 平台层到运行时闭环

当前已完成：

- manifest schema
- capability type
- capability resolver

仍需补完：

- formatter runtime supervisor
- linter runtime supervisor
- save pipeline hooks
- problems / diagnostics bridge
- test / debug runtime dispatch

### 5.6.2 保存质量链路

保存流程建议升级为：

```text
beforeSave
  -> format on save
  -> organize imports on save
  -> lint on save
  -> quality gate status update
  -> write file
```

要求：

- 每一步都可配置开关
- 任一步失败都不应导致编辑器不可保存
- 必须给出明确 feedback

## 6. 依赖关系

### 6.1 可立即开工批次

- `P10-1`

原因：

- 基本复用现有 `hover` / `document symbols`
- 不依赖新的 main process 协议扩展
- 风险低，收益高

### 6.2 需要前置抽象的批次

- `P11`
- `P14`

原因：

- 都涉及新的 runtime model
- 需要避免每种语言各自实现一套临时状态机

### 6.3 需要语言适配深入参与的批次

- `P12`
- `P13`

原因：

- 环境与重构都明显语言相关
- 必须通过 adapter / service 层统一输出结构

## 7. 风险与控制

### 7.1 主要风险

- `CodePane.tsx` 继续膨胀
- Renderer 直接承担过多状态装配
- 调试深化会暴露当前 driver 抽象不足
- 环境管理容易滑向语言特例堆砌
- 插件运行时如果直接接入保存链路，容易带来稳定性问题

### 7.2 控制策略

- 优先新增独立组件与独立 state slice
- 写操作继续走 preview / confirmation / fallback
- 运行时能力必须先有 trace / progress / error feedback
- 所有语言特化入口都走 adapter/service

## 8. 方案评估

本方案评估结论如下：

1. 实施顺序没有明显问题
   - `P10-1` 作为第一批开发项，依赖最少、收益最高
2. 当前架构可以承接第一批功能
   - `document symbols` 与 `hover` 已可复用
3. 调试深化与插件运行时不适合现在立刻并行开工
   - 应先补模型，再补能力
4. 项目环境管理与 Git/重构深化应在 `P10` 之后推进
   - 否则用户的日常阅读与跳转体验仍旧短板明显

因此：

- 方案可执行
- 无需先推翻现有架构
- 立即开始 `P10-1` 开发是合理选择

## 9. 当前开发起点

按照本文顺序，当前进度更新为：

- `P10-1`：`Breadcrumbs + Quick Documentation` 已启动并完成第一轮实现
- `P10-2`：先从 `Inlay Hints` 子项开始推进

后续继续按以下顺序推进：

1. `P10-2`
2. `P11`
3. `P12`
4. `P13`
5. `P14`
