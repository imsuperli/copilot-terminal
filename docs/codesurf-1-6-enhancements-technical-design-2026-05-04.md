# CodeSurf 1-6 Enhancements Technical Design

## Scope

本设计文档对应当前 `feat/canvas-workspace` 分支上的 CodeSurf-inspired 1-6 增强实现，目标是把以下能力以“叠加增强”的方式接入 Synapse，而不是替换既有工作流：

1. Session aggregation and restore
2. Task activity stream
3. Plan panel / todo extraction
4. Task artifact archive
5. Browser login-state sync
6. Extension / MCP capability enhancements

约束：

- 不改变本地终端、SSH 终端、画布、布局记忆的原有行为
- 不重构现有 SSH Chat 小侧栏定位
- 新能力默认是可选入口、可忽略面板、显式触发动作

## Architecture

### Main Process

新增服务：

- `src/main/services/SessionAggregationService.ts`
  - 聚合 Claude Code 与 Codex 会话索引
  - Claude 来源：`~/.claude/projects/**/*.jsonl`
  - Codex 来源：`~/.codex/state_5.sqlite` + rollout jsonl
  - 输出 `AggregatedSessionEntry[]` / `AggregatedSessionDetail`

- `src/main/services/TaskArtifactService.ts`
  - 将对话/计划等沉淀内容写入 `app.getPath('userData')/artifacts`
  - `artifact-index.json` 维护最近记录索引

- `src/main/services/BrowserSyncService.ts`
  - 当前阶段为 macOS Chrome profile 的显式 Cookie 导入
  - 导入目标分区：`persist:synapse-browser`
  - 不改变浏览器 pane 默认启动逻辑

- `src/main/services/McpCapabilityService.ts`
  - 基于 `AgentController` 暴露的 `McpHub` 汇总已注册 server/tool 快照
  - 目标是可见性与诊断，不重建执行栈

新增 IPC：

- `list-aggregated-sessions`
- `get-aggregated-session-detail`
- `restore-aggregated-session`
- `save-task-artifact`
- `list-task-artifacts`
- `delete-task-artifact`
- `list-browser-sync-profiles`
- `get-browser-sync-state`
- `sync-browser-profile`
- `get-mcp-server-snapshots`

### Preload / Shared Types

新增共享类型：

- `src/shared/types/task.ts`
- `src/shared/types/browser-sync.ts`

扩展已有类型：

- `src/shared/types/chat.ts`
  - Chat pane 新增 `activity` / `plan` / `aggregatedSessions` / `artifacts`
- `src/shared/types/electron-api.ts`
  - 新增 enhancement IPC API
- `src/shared/types/workspace.ts`
  - `settings.browserSync`

### Renderer

接入点：

- `src/renderer/components/ChatPane.tsx`
  - 聚合历史恢复
  - 活动流摘要
  - 计划面板
  - 产物归档与列表

- `src/renderer/components/SettingsPanel.tsx`
  - Browser sync section

- `src/renderer/components/settings/PluginCenter.tsx`
  - MCP visibility summary
  - Plugin capability summary

辅助模块：

- `src/renderer/utils/taskActivity.ts`
- `src/renderer/utils/taskPlan.ts`
- `src/renderer/components/chat/TaskPlanPane.tsx`

## Feature Notes

### 1. Session Aggregation and Restore

用户价值：

- 不需要记住 Claude/Codex 原始路径或单独打开外部工具
- 可以把历史问题排查或开发上下文快速带回当前 ChatPane

当前实现：

- ChatPane 历史菜单中新增 “外部会话”
- 选择后以 `history-only` 方式恢复消息记录
- 恢复动作写入 activity stream

边界：

- 当前不尝试恢复外部工具的真实执行态
- 只恢复 transcript，不接管外部工具生命周期

### 2. Task Activity Stream

用户价值：

- 快速知道一次任务经历了什么，而不是翻完整 transcript
- 能看到恢复历史、产物保存、画布相关动作等关键事件

当前实现：

- 从 chat messages、agent timeline、canvas activity、artifact save 动作合成统一活动流
- ChatPane 顶部显示最近活动摘要

### 3. Plan Panel / Todo Extraction

用户价值：

- 从 assistant 输出中提取出明确步骤，减少用户自己再整理
- 对长任务尤其有帮助，但不会强制改变短任务路径

当前实现：

- 从 assistant checklist 风格文本中提取 `TaskPlanItem[]`
- 右侧可展开 plan panel
- 计划状态按 `pending/running/completed/...` 显示

### 4. Task Artifact Archive

用户价值：

- 把一次排查或分析沉淀为可再次打开的记录
- 避免复制粘贴到外部临时文件

当前实现：

- ChatPane 顶部新增归档按钮
- 对话 transcript 以 markdown 保存
- 若当前提取到了 plan，也同步保存一个 plan artifact
- 顶部摘要区展示最近产物，可打开所在路径或删除索引项

### 5. Browser Login-State Sync

用户价值：

- 内置浏览器访问需要登录的站点时，减少重复登录
- 明确知道当前是否已经同步、同步到了哪个 profile

当前实现：

- 设置页 Advanced 中新增 Browser Sync section
- 用户显式点击 profile 的 “同步” 按钮后才导入
- 同步结果写入 workspace settings 的 `browserSync`

边界：

- 当前阶段不自动双向同步
- 不拦截浏览器 pane 默认打开逻辑
- 非 macOS 平台只展示 unsupported 状态

### 6. Extension / MCP Capability Enhancements

用户价值：

- 用户能看见“扩展到底给软件带来了什么”
- 出现能力缺失时，能判断是插件未装、未启用，还是 MCP 未暴露

当前实现：

- Plugin Center 新增 Capability Overview
- MCP summary：server + tool 数量 + tool 列表
- Plugin capability summary：按 capability type 汇总已安装插件

## Non-Regression Strategy

本轮实现明确遵守以下非回归原则：

- 不修改终端创建/启动逻辑
- 不修改 SSH pane 的连接/恢复逻辑
- 不修改画布布局记忆与卡片布局结构
- 不替换现有 ChatPane 的发送、取消、检查点、历史恢复主链路
- 所有新入口都位于：
  - 历史菜单附加分组
  - ChatPane 顶部附加按钮
  - ChatPane transcript 顶部附加摘要卡
  - Settings / PluginCenter 新 section

## Validation

已执行：

- `npm run build:main`
- `npm run build:renderer:typecheck`

建议继续执行的 focused tests：

- `src/renderer/components/__tests__/ChatPane.test.tsx`
- `src/renderer/components/__tests__/SettingsPanel.test.tsx`

后续建议：

- 为聚合会话恢复补 ChatPane focused test
- 为 Browser Sync section 补 SettingsPanel focused test
- 为 Plugin Center MCP summary 补 focused test

## Remaining Practical Follow-ups

当前实现已经形成闭环，但仍有可继续增强的点：

- artifact 正文按需读取，而不是只做索引摘要
- aggregated session detail 悬浮预览
- Browser sync 更多浏览器来源
- MCP summary 与 plugin capability summary 的交叉映射
