# CodeSurf 1-6 Enhancements PRD

## 背景

Synapse 已经具备以下核心能力：

- 本地终端、远程 SSH 终端、代码窗格、浏览器窗格、Chat 窗格
- 画布工作区、模板、活动记录、报告导出
- Chat/Agent 运行时、对话历史、检查点恢复
- 插件中心、语言能力运行时、基础 MCP 摘要

当前缺口不是“再做一个新工作流”，而是缺少把这些能力串成完整任务闭环的增强层：

1. 会话来源分散，CLI 与应用内任务难以统一回看
2. Agent 活动、计划、证据、产物分散在不同界面与临时状态中
3. 浏览器窗格能访问网页，但难复用用户已有登录态
4. 插件与 MCP 能力存在，但可见性、诊断性、可管理性不够强

本次增强要求全部满足以下原则：

- 只做增强，不替换已有本地终端、SSH 终端、画布、布局记忆、Chat SSH 小功能
- 新能力必须默认安全、可回退、可忽略
- 现有创建终端、进入终端、拆分窗格、SSH 排障主流程不变
- 优先复用 Synapse 与 CodeSurf 现有模块和数据结构，不从零重写

## 范围

本次实现的 1-6 能力：

1. Session aggregation and restore
2. Task activity stream
3. Plan panel / todo extraction
4. Task artifact archive
5. Browser login-state sync
6. Extension / MCP capability enhancements

## 非目标

- 不做通用后台 job/daemon 体系
- 不把 SSH Chat 小窗扩成通用 sidecar
- 不重构现有终端生命周期与 SSH 会话管理主链路
- 不做新的布局系统替换现有布局记忆
- 不做完全独立的新工作台应用

## 最终形态

### 1. 会话聚合与恢复

在 ChatPane 新增“聚合会话”入口，用户可以看到三类会话：

- 当前 Synapse 窗格内历史会话
- 本机 Claude Code CLI 会话
- 本机 Codex CLI 会话

用户可按工作目录、分支、来源、更新时间筛选，并将外部会话恢复到当前 ChatPane。

恢复策略：

- Synapse 原生会话：完整恢复消息与 agent 快照
- Claude/Codex 外部会话：解析外部会话文件，转换为只读可回看历史，并在当前 ChatPane 建立新 conversation 快照

### 2. 任务活动流

在 ChatPane 顶部与画布活动面板之外，新增统一任务活动流视图，聚合：

- 用户发送消息
- agent 状态变化
- tool call / tool result
- approval / interaction
- checkpoint / report / artifact 保存
- 来自画布“提问 AI / 发到便签 / 导出报告”的关键事件

活动流是摘要流，不是完整 transcript 副本。

### 3. 计划面板

在 ChatPane 新增可折叠右侧 Plan Panel。

数据来源按优先级：

1. 外部 Claude todo 文件
2. agent timeline 中显式计划/步骤类事件
3. assistant 文本中解析出的 checklist / numbered plan

面板职责：

- 展示当前任务步骤
- 标记 pending / running / completed / blocked
- 显示最后更新时间和来源
- 支持一键复制到便签或画布报告

### 4. 任务产物归档

新增主进程 artifact archive 服务，把任务沉淀物统一保存到应用用户数据目录：

- Chat conversation snapshot
- Agent snapshot
- Plan snapshot
- 画布导出报告
- 选中证据摘录
- 外部 CLI 会话恢复镜像

产物按 workspace / conversation / timestamp 分层，支持列出、打开、删除。

### 5. 浏览器登录态同步

在设置中新增“浏览器登录态同步”分区。

第一阶段目标：

- macOS 支持从 Chrome profile 同步 cookies 到 Synapse 浏览器 partition
- 支持读取 profile 列表
- 支持一键同步
- 支持查看最近同步时间与结果

扩展预留：

- 书签读取
- 历史搜索
- 多 profile 选择

该能力是显式触发增强，不改变当前浏览器窗格默认行为。

### 6. 插件 / MCP 能力增强

在 PluginCenter 中增强以下能力：

- 更明确的 capability 可视化
- requirement/health/runtimeState 展示加强
- MCP 能力摘要面板
- 插件与 MCP 对 Chat/Agent 可用工具的映射说明
- 对“已启用、已安装、可安装、不可用原因”的诊断展示

MCP 本阶段重点是“管理与诊断闭环”，不是重写完整执行栈。

## 用户入口

### ChatPane

- 顶部 history 按钮扩展为“历史 / 聚合会话 / 产物”
- 右侧新增可折叠 plan panel
- Transcript 顶部新增 activity filter / plan toggle / artifact quick save

### Settings

- Chat/Advanced 下新增 Session Sources 与 Browser Sync
- Plugin tab 内新增 MCP / Capability Summary 区块

### Canvas

- 现有 activity/export 不改
- 新增“发送到产物归档”“从计划生成便签”“从聚合会话恢复到聊天块”

## 数据模型

新增共享类型：

- `AggregatedSessionSource`
- `AggregatedSessionEntry`
- `AggregatedSessionMessage`
- `TaskActivityEvent`
- `TaskPlanItem`
- `TaskArtifactRecord`
- `BrowserSyncProfile`
- `BrowserSyncState`
- `McpServerConfigSnapshot`
- `McpToolSnapshot`

持久化位置：

- Workspace JSON 中持久化 lightweight summaries
- 大体积 artifact 单独落盘到 `app.getPath('userData')/artifacts/...`
- 会话聚合索引为 lightweight cache，不镜像全文

## 架构设计

### A. Session Aggregation Service

主进程新增 `SessionAggregationService`

职责：

- 读取 Synapse 本地 conversation history
- 扫描 `~/.claude/projects/**/*.jsonl`
- 扫描 `~/.codex/state_*.sqlite` + `threads`
- 生成轻量聚合列表
- 在用户点击恢复时再惰性解析详细内容

原则：

- 索引只保存元数据，不复制全文
- 恢复时才解析 messages / timeline
- 支持按 cwd 与当前工作区关联

### B. Activity Stream Builder

Renderer 新增 `taskActivity.ts`

职责：

- 从 ChatPane messages、agent timeline、canvasActivity、artifact save 动作中生成统一 `TaskActivityEvent[]`
- 保证去重与时间排序
- 输出给 ChatPane 活动流和画布关联视图

### C. Plan Extraction

主规则：

- Claude todo JSON 优先
- agent timeline 的 reasoning/context-summary/tool-result 中识别计划状态
- assistant 文本回退抽取 numbered list / checklist

该模块为纯函数，不引入后台运行器。

### D. Artifact Archive Service

主进程新增 `TaskArtifactService`

职责：

- 安全文件名处理
- JSON/Markdown 原子写入
- 列表与删除
- 返回 lightweight metadata 给 renderer

### E. Browser Sync Service

主进程新增 `BrowserSyncService`

第一阶段平台策略：

- macOS：支持 Chrome profile 列表与 cookie 同步
- 其他平台：展示不可用说明，但不报错

实现策略：

- 直接复用 CodeSurf 的 profile / cookie 读取思路
- 不引入新的长期后台同步
- 不改变现有 `persist:synapse-browser` 分区

### F. MCP / Plugin Capability Summary

新增主进程 `McpCapabilityService`

职责：

- 读取当前已注册 MCP tools
- 输出 server/tool summary
- 暴露给设置页与 ChatPane 只读展示

## 兼容性与非回归要求

必须保证以下行为不变：

- 主界面创建本地/SSH 终端卡片逻辑
- 终端界面左下角加号创建并进入终端逻辑
- 现有本地终端与 SSH 终端启动方式
- 现有 ChatPane 基本对话、检查点、历史恢复
- 现有画布活动、模板、导出报告
- 现有浏览器窗格导航与分区隔离
- 现有插件安装/卸载/启用/语言能力流程

防回归策略：

- 新入口默认折叠或按需打开
- 新服务失败时静默降级，不影响原功能
- Browser Sync 失败只影响同步按钮状态，不影响浏览器窗格使用
- 外部会话解析失败只影响对应来源条目，不影响当前会话

## 分阶段实现顺序

### Phase 1

- 共享类型
- SessionAggregationService
- TaskArtifactService
- IPC 定义
- 文档与测试基线

### Phase 2

- ChatPane 聚合会话列表
- 外部会话恢复
- Activity stream
- Plan extraction 与右侧面板

### Phase 3

- Artifact archive UI
- Canvas 关联动作
- Browser sync settings + service

### Phase 4

- PluginCenter capability summary
- MCP summary panel
- 全链路测试与回归修复

## 测试策略

### 单元测试

- session parsing
- codex sqlite thread listing
- plan extraction
- activity stream normalization
- artifact path safety
- browser sync profile listing normalization

### 组件测试

- ChatPane aggregate session menu
- ChatPane plan panel
- PluginCenter capability summary
- Settings browser sync section

### 回归测试

- CustomTitleBar
- App terminal/canvas view switching
- CreateWindowDialog
- CanvasWorkspaceView
- BrowserPane
- ChatPane basic send/history/checkpoint

## 风险

### 外部会话格式变化

缓解：

- 采用 best-effort parser
- 只依赖少量稳定字段
- 失败时跳过单条记录

### Chrome cookie 同步平台差异

缓解：

- 第一阶段限制 macOS
- 其他平台明确标注 not supported yet

### 产物文件膨胀

缓解：

- 列表只加载元数据
- artifact 正文按需读取
- 为后续归档清理预留 TTL/limit 机制

## 交付标准

满足以下条件才算完成：

- 用户能在 ChatPane 看见 Claude/Codex/Synapse 聚合会话
- 用户能恢复外部会话到当前 ChatPane
- 用户能看到统一任务活动流
- 用户能看到并使用计划面板
- 用户能保存并查看任务产物归档
- 用户能在设置中显式同步浏览器登录态
- 用户能在插件中心看到增强后的 capability/MCP 概览
- 原有本地终端、SSH 终端、画布与浏览器主流程不受影响
