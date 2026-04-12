# Chat Agent Full Port Design

## Goal

将当前仓库里的 `ChatPane + chatHandlers + ChatService + ToolExecutor` 轻量链路，升级为接近 `Chaterm` 的完整 agent 子系统，而不是“普通对话 + 几个函数调用”。

目标不是补几个 prompt，而是完整迁入以下能力：

- 可靠的任务型 Agent 控制流
- 面向远端 SSH 的真实执行与上下文采集
- 可视化思考内容、工具调用、命令输出、审批状态
- 结构化的工具结果与可持续会话状态
- 上下文窗口管理、输出 offload、历史恢复
- 可扩展的 skills / MCP / knowledge base 接入
- 交互式命令检测与用户输入回流

## Why Current Chat Is Weak

当前实现弱，不是模型本身的问题，而是架构层级不够。

现状的核心问题：

- 只有 `ChatPane -> chat-send -> ChatService -> ToolExecutor` 一条直线，没有 Agent Controller / Task Runtime。
- 对话状态只是一串 `messages`，没有“任务态”“执行态”“审批态”“交互态”“上下文管理态”。
- SSH 只是一个被动的 `sshContext` 参数，不负责连接建立、会话复用、系统信息预取、交互处理。
- UI 只能显示最终消息和简单工具卡片，缺少 reasoning、partial tool call、command output timeline、interaction prompt。
- 没有类似 `Chaterm` 的 `Task.recursivelyMakeRequests()` 这种任务循环。
- 没有类似 `Chaterm` 的 `RemoteTerminalManager`，所以 chat 不能被视为“远端执行代理”。
- 没有 context truncation / offload / tool-result normalization / skills / MCP / KB。

结论：如果要达到“可靠、高智能的 chat agent”，必须整体迁入 `Chaterm` 的 Agent 分层，而不是继续在现有 `ChatService` 上打补丁。

## Chaterm Architecture To Port

从 `~/chaterm-analysis/Chaterm/src/main/agent` 抽象出的核心结构如下：

### 1. Controller Layer

来源：

- `src/main/agent/core/controller/index.ts`

职责：

- 管理 Task 生命周期
- 处理 renderer/webview 消息
- 管理全局 `McpHub`
- 管理全局 `SkillsManager`
- 恢复历史任务
- 初始化 task metadata / title / model usage

这是当前仓库完全缺失的一层。

### 2. Task Runtime Layer

来源：

- `src/main/agent/core/task/index.ts`

职责：

- 维护单个 agent task 的完整状态
- 递归发起模型请求
- 增量解析 assistant 输出
- 调度工具调用
- 管理审批
- 管理 reasoning / partial output / tool result
- 维护 command context、running process、connected hosts
- 管理上下文裁剪和 tool result flush

这是整个 agent 的核心。当前仓库没有等价物。

### 3. Prompt & Context Layer

来源：

- `src/main/agent/core/prompts/system.ts`
- `src/main/agent/core/context/context-management/ContextManager.ts`
- `src/main/agent/core/context/context-tracking/ModelContextTracker.ts`

职责：

- 构造系统提示词
- 注入环境详情
- 注入 host/system info
- 跟踪上下文窗口使用率
- 在对话过长时自动截断并总结

当前仓库只有一个非常薄的 `buildSystemPrompt()`，远远不够。

### 4. Assistant Message Parsing Layer

来源：

- `src/main/agent/core/assistant-message/*`

职责：

- 解析 streaming assistant text
- 识别 reasoning / tool use / partial tool blocks
- 将 assistant 输出拆成结构化 timeline block

这层决定 UI 能不能“看到思考、工具调用、半截输出”。

### 5. Remote Terminal Integration Layer

来源：

- `src/main/agent/integrations/remote-terminal/index.ts`
- `src/main/agent/integrations/remote-terminal/marker-based-runner.ts`
- `src/main/agent/services/interaction-detector/*`

职责：

- 建立/复用远端连接
- 在现有 shell stream 上可靠执行命令
- 捕获 stdout/stderr
- 识别 pager / TUI / prompt / password / confirmation
- 将用户输入回灌到正在运行的远端命令

这层是“chat 真正能操作远端服务器”的关键。

### 6. Tooling & Result Normalization Layer

来源：

- `src/main/agent/shared/ToolResult.ts`
- `src/main/agent/services/glob/*`
- `src/main/agent/services/grep/*`
- `src/main/agent/services/search/remote.ts`

职责：

- 工具调用标准化
- 工具结果结构化
- 大输出 offload
- remote/local 搜索分层

当前仓库的 `ToolExecutor` 过于薄，结果结构不够丰富。

### 7. Extension Layer

来源：

- `src/main/agent/services/skills/SkillsManager.ts`
- `src/main/agent/services/mcp/McpHub.ts`
- knowledge base 相关模块

职责：

- 技能激活
- MCP tools/resources
- 知识库检索
- 任务辅助上下文

这是后续能力扩展层。

## Target Architecture In This Repository

建议在当前仓库内新增独立 agent 子系统，而不是继续把所有逻辑塞进 `src/main/services/chat/*`。

目标目录结构：

```text
src/main/agent/
  api/
  core/
    controller/
    task/
    prompts/
    context/
    security/
    storage/
    assistant-message/
  integrations/
    remote-terminal/
    local-terminal/
  services/
    interaction-detector/
    skills/
    mcp/
    web-fetch/
    search/
  shared/

src/shared/types/agent.ts
src/shared/types/agentTimeline.ts

src/renderer/components/agent/
  AgentPane.tsx
  AgentTimeline.tsx
  ReasoningBlock.tsx
  ToolCallBlock.tsx
  CommandOutputBlock.tsx
  InteractionPrompt.tsx
  ApprovalCard.tsx
```

## Current Repository Mapping

可以复用的现有基础设施：

- `src/main/services/ProcessManager.ts`
- `src/main/services/ssh/*`
- `src/main/handlers/*`
- `src/preload/index.ts`
- `src/renderer/stores/windowStore.ts`
- `src/renderer/components/ChatPane.tsx`
- `src/shared/types/chat.ts`

必须重构或替换的现有 chat 模块：

- `src/main/services/chat/ChatService.ts`
- `src/main/services/chat/ToolExecutor.ts`
- `src/main/handlers/chatHandlers.ts`
- `src/renderer/components/ChatPane.tsx`

处理原则：

- `ChatService` 不再作为终极核心，只保留为 provider streaming adapter。
- `chatHandlers` 不再直接运行 agent loop，而是转为 `AgentController` 的 IPC 入口。
- `ChatPane` 不再只是 message list，而是改造成 `AgentPane` 风格 timeline。

## UI Target State

最终 chat 对话框必须不是普通聊天窗口，而是任务执行面板。

必须显示：

- 用户消息
- assistant 文本回复
- reasoning 内容
- 工具调用卡片
- 工具参数
- 工具执行状态
- 审批请求
- 命令输出增量流
- 交互检测提示
- 任务级错误
- 上下文截断提醒

推荐 timeline block 类型：

- `user_message`
- `assistant_text`
- `assistant_reasoning`
- `tool_call_pending`
- `tool_call_running`
- `tool_call_result`
- `command_output_partial`
- `command_output_final`
- `interaction_request`
- `approval_request`
- `approval_result`
- `system_notice`
- `context_truncated`

## State Model

当前 `ChatMessage[]` 不足以承载 agent UI。

需要新增：

- `AgentTaskState`
- `AgentTimelineEvent[]`
- `AgentExecutionState`
- `AgentToolCall`
- `AgentToolResult`
- `AgentInteractionState`
- `AgentApprovalState`

建议：

- `windowStore` 里对 chat pane 的状态升级为 `pane.agent`，逐步废弃 `pane.chat.messages` 的单维模型。
- timeline event 必须可持久化恢复。

## IPC Design

新增主通道：

- `agent-start-task`
- `agent-send-user-message`
- `agent-cancel-task`
- `agent-submit-approval`
- `agent-submit-interaction`
- `agent-dismiss-interaction`
- `agent-activate-skill`

新增推送事件：

- `agent-state-updated`
- `agent-timeline-event`
- `agent-tool-approval-request`
- `agent-interaction-needed`
- `agent-interaction-closed`
- `agent-command-output`
- `agent-task-title-updated`

现有 `chat-stream-*` 通道保留一段时间做兼容，最终废弃。

## Execution Design

### Phase A: Provider Adapter

保留并收编当前：

- `ChatService.streamAnthropic`
- `ChatService.streamResponses`
- `ChatService.streamOpenAIChatCompletions`

但角色变成：

- 仅负责 LLM streaming adapter
- 不再直接决定业务逻辑

### Phase B: Agent Task Loop

迁入类似 `Task.recursivelyMakeChatermRequests()` 的循环：

1. flush pending tool results
2. prepare request
3. 注入 environment details / context refs / skill context / KB context
4. 调用 provider adapter
5. streaming parse assistant output
6. partial 呈现 reasoning / tool blocks
7. 工具执行
8. tool result 写回 conversation history
9. 继续下一轮，直到 completion

### Phase C: Remote Terminal Runtime

目标：

- chat 不再只依赖“某个 pane 里碰巧有 SSH session”
- agent 可以明确绑定一个或多个 remote target
- 通过 `ProcessManager` / SSH session pool 建立可执行上下文

需要增加：

- `AgentRemoteTerminalManager`
- `AgentCommandSessionRegistry`
- `AgentInteractionRegistry`

如果要复刻 `Chaterm` 体验，必须支持：

- partial output
- marker-based execution
- prompt/confirmation/password/pager 检测
- 用户继续输入

## Security Design

不能只保留当前的危险命令审批。

需要迁入：

- command parse
- security level
- block / ask / auto-approve
- 会话级 read-only auto-approve
- 审批 UI 反馈与可追溯 timeline

目标目录：

- `src/main/agent/core/security/*`

## Context & Memory Design

必须迁入的能力：

- context window usage tracking
- conversation truncation
- history summary insertion
- offloaded tool output
- task resume

否则会出现：

- 对话越长越傻
- 反复丢失远端事实
- 命令输出污染上下文

## Skills / MCP / KB Design

完整移植需要分层进行：

第一阶段不要求全部上线，但架构必须预留。

最终要支持：

- `use_skill`
- `use_mcp_tool`
- `access_mcp_resource`
- `summarize_to_knowledge`
- KB 检索注入

## Migration Strategy

### Phase 0

完成项：

- 强化 prompt，禁止假装执行
- chat 默认优先绑定 SSH pane
- 只读远端环境预探测

这只是止血，不是完整方案。

### Phase 1

在当前仓库新增 `src/main/agent/*` 骨架：

- `controller`
- `task`
- `shared`
- `assistant-message`
- `prompts`

同时新增基础共享类型和 renderer timeline store。

### Phase 2

迁移最小可用完整 agent runtime：

- AgentController
- AgentTask
- streaming parse
- structured timeline
- tool approval
- partial command output

### Phase 3

迁移 remote-terminal 与 interaction-detector：

- 远端命令执行 registry
- interaction IPC
- pager/password/prompt/TUI 检测
- 用户输入回流

### Phase 4

迁移 context manager / offload / task persistence。

### Phase 5

迁移 skills / MCP / KB。

## Acceptance Criteria

最终完成标准必须满足：

- 用户问“这台服务器是什么系统”，agent 直接执行真实只读探测，而不是口头承诺。
- UI 能看到 reasoning、tool call、tool result、command output。
- 遇到 sudo/password/pager/TUI 时，UI 能提示并接受用户输入。
- 输出长日志时不会把上下文打爆，需 offload + read_file 回读。
- 断开后可恢复 task。
- 混合窗口中 chat 默认选择 SSH target。
- 工具调用全链路可审计。

## Implementation Decision

决定采用：

- 架构迁移，而不是继续增强旧 `ChatPane` 直连模式。
- 新旧并行一段时间：先在现有仓库中引入 `agent` 子系统，再逐步让 `ChatPane` 切换到新 runtime。

下一步实现从 `Phase 1` 开始：

1. 新建 `src/main/agent/shared` 类型层
2. 新建 `AgentController`
3. 新建 `AgentTask`
4. 新建 assistant stream parser
5. 让 renderer 先切到 timeline event 渲染模型
