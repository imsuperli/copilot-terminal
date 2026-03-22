# SSH 主进程架构设计

## 1. 目标

本文档细化 SSH 集成后主进程的架构设计，回答以下问题：

1. 现有 `ProcessManager` 应如何演进
2. 本地 PTY 与 SSH 会话如何统一管理
3. SSH backend 需要拆成哪些 service
4. IPC handler、session manager、profile store、vault、known_hosts 之间如何协作
5. 创建、连接、分屏、关闭、恢复、重连的主进程链路如何运作

本文档是以下两份文档的继续：

- [docs/ssh-terminal-integration-plan.md](./ssh-terminal-integration-plan.md)
- [docs/ssh-data-model-design.md](./ssh-data-model-design.md)

## 2. 当前主进程现状

### 2.1 现有核心模块

当前终端主链路主要由以下模块构成：

- `ProcessManager`
- `StatusPoller`
- `PtySubscriptionManager`
- `windowHandlers`
- `paneHandlers`
- `ptyHandlers`
- `workspaceHandlers`

其基本模式为：

1. handler 接收 IPC
2. `ProcessManager` 创建 node-pty 进程
3. 主进程把 PTY 输出通过 IPC 推给 renderer
4. `StatusPoller` 跟踪状态变化
5. `WorkspaceManager` 持久化窗口布局

### 2.2 当前架构的问题

对 SSH 集成来说，当前架构有三个关键限制：

1. `ProcessManager` 的中心对象是本地 PTY，而不是抽象会话
2. `pid` 被用于多处关键索引，不适合 SSH channel
3. handler 层默认所有 pane 都有本地工作目录

因此主进程必须从“本地进程管理器”演进为“统一终端会话管理器”。

## 3. 目标架构

### 3.1 总体分层

建议主进程演进为以下分层：

1. IPC Handler 层
2. Terminal Session Manager 层
3. Backend 层
4. SSH Support Services 层
5. Persistence 层

对应结构：

```text
renderer
  -> ipc handlers
    -> terminal session manager
      -> local terminal backend
      -> ssh terminal backend
        -> ssh connection multiplexer
        -> ssh profile store
        -> ssh vault service
        -> known hosts store
        -> forward service
      -> status publisher
      -> pty/session subscription manager
      -> workspace manager
```

### 3.2 核心设计原则

1. session manager 是所有 backend 的统一入口
2. backend 负责“如何创建会话”，manager 负责“如何管理会话”
3. handler 不直接碰具体 SSH 库
4. profile/vault/known_hosts 独立于 session manager
5. 本地会话链路与 SSH 会话链路在 data/resize/exit 层面完全对齐

## 4. 模块划分

## 4.1 TerminalSessionManager

建议将现有 `ProcessManager` 演进为此职责。

### 职责

- 创建 local / ssh session
- 维护 session 生命周期
- 维护 `windowId + paneId -> sessionId` 索引
- 维护 `sessionId -> session` 索引
- 维护 history buffer
- 提供统一的 `write / resize / close / subscribeData`
- 接收 backend 的 exit/data 事件并向外转发
- 为 `StatusPoller` 提供统一状态查询入口

### 非职责

- 不负责 profile 的持久化
- 不负责密码存储
- 不直接解析 host key 策略
- 不做 SSH 认证实现细节

### 推荐接口

```ts
interface ITerminalSessionManager {
  createSession(spec: TerminalSessionSpec): Promise<SessionHandle>
  killSession(sessionId: string): Promise<void>
  writeToSession(sessionId: string, data: string): void
  resizeSession(sessionId: string, cols: number, rows: number): void
  subscribeSessionData(sessionId: string, callback: (data: string) => void): () => void
  getSessionByPane(windowId: string, paneId?: string): ITerminalSession | null
  getSessionIdByPane(windowId: string, paneId?: string): string | null
  getSessionInfo(sessionId: string): SessionInfo | null
  listSessions(): SessionInfo[]
}
```

### 与现有 `ProcessManager` 的关系

首期不建议立即重命名文件和类名，以减少改动面。

建议演进策略：

- 先保留类名 `ProcessManager`
- 内部引入 session 概念
- 等 SSH 主链路稳定后，再做命名重构

## 4.2 LocalTerminalBackend

### 职责

- 基于 node-pty 创建本地 shell 会话
- 将 node-pty 包装为 `ITerminalSession`
- 提供本地能力元信息

### 非职责

- 不管理 pane 索引
- 不处理 workspace 恢复
- 不做 IPC 推送

### 推荐结构

```ts
class LocalTerminalBackend implements ITerminalBackend {
  kind = 'local'
  async createSession(spec: LocalSessionSpec): Promise<ITerminalSession>
}

class LocalTerminalSession implements ITerminalSession {
  // wraps node-pty instance
}
```

## 4.3 SSHTerminalBackend

### 职责

- 根据 profile 创建 SSH shell session
- 与 SSH multiplexer 协作实现连接复用
- 管理 SSH transport 与 shell channel 的绑定
- 将 SSH shell channel 包装为 `ITerminalSession`
- 注入 SSH 能力元信息

### 非职责

- 不负责 renderer 交互
- 不直接维护 workspace
- 不直接处理 handler 层参数校验

### 推荐结构

```ts
class SSHTerminalBackend implements ITerminalBackend {
  kind = 'ssh'
  constructor(
    private profileStore: SSHProfileStore,
    private vaultService: SSHVaultService,
    private knownHostsStore: SSHKnownHostsStore,
    private connectionMultiplexer: SSHConnectionMultiplexer,
    private eventBus: SSHEventBus,
  ) {}

  async createSession(spec: SSHSessionSpec): Promise<ITerminalSession>
}
```

## 4.4 SSHConnectionMultiplexer

### 目标

复用底层 SSH transport，避免：

- 一个窗口多个 SSH pane 时重复建立 TCP/SSH 连接
- 同 profile 拆分 pane 时重复认证
- 多个 pane 对同目标连接时浪费资源

### 职责

- 维护 `connectionKey -> shared SSH connection`
- 提供引用计数
- 当引用归零时关闭底层 transport
- 为每个 pane 提供独立 shell channel

### 推荐接口

```ts
interface ISharedSSHConnection {
  key: string
  openShellChannel(options?: OpenShellOptions): Promise<SSHShellChannel>
  openSFTP(): Promise<ISFTPSession>
  addRef(): void
  release(): Promise<void>
}

class SSHConnectionMultiplexer {
  getOrCreate(profile: SSHProfile): Promise<ISharedSSHConnection>
}
```

### connection key 组成

建议参考 Tabby，但按当前项目字段整理：

- host
- port
- user
- proxyCommand
- socksProxy
- httpProxy
- jumpHost 链

不建议包含：

- 临时远程目录
- paneId
- windowId

## 4.5 SSHProfileStore

### 职责

- 读写 `ssh-profiles.json`
- 提供 profile CRUD
- 提供 profile 查询与索引
- 负责 profile schema 校验和迁移

### 非职责

- 不保存密码
- 不管理运行中的 session

### 推荐接口

```ts
interface ISSHProfileStore {
  list(): Promise<SSHProfile[]>
  get(id: string): Promise<SSHProfile | null>
  create(input: SSHProfileInput): Promise<SSHProfile>
  update(id: string, patch: SSHProfilePatch): Promise<SSHProfile>
  remove(id: string): Promise<void>
}
```

## 4.6 SSHVaultService

### 职责

- 持久化 profile 对应的敏感凭据
- 为 SSH backend 提供认证材料
- 向外暴露“是否已保存密码”的状态

### 非职责

- 不直接参与 session 复用
- 不负责 host key 校验

## 4.7 SSHKnownHostsStore

### 职责

- 存储和查询已信任的 host key
- 支持 fingerprint 变更校验
- 向 renderer 提供 known_hosts 管理能力

### 推荐结构

```ts
interface KnownHostEntry {
  id: string
  host: string
  port: number
  algorithm: string
  digest: string
  createdAt: string
  updatedAt: string
}
```

### 非职责

- 不直接弹 UI
- 不做 session 生命周期管理

## 4.8 SSHForwardService

### 职责

- 管理 port forward 生命周期
- 支持 local / remote / dynamic forward
- 记录 forward 状态
- 对外提供查询与停止能力

### 建议独立原因

端口转发比 shell channel 生命周期更复杂，不建议混进 `SSHTerminalSession` 核心逻辑中。

## 4.9 SSHEventBus

### 目标

SSH 会有额外事件：

- 连接中
- 已连接
- host key 待确认
- 认证失败
- 重连中
- 延迟更新
- forward 变化

建议用一个主进程内部事件总线统一管理，再由 handler 或 manager 转发给 renderer。

### 推荐接口

```ts
type SSHEvent =
  | SSHConnectionStatusChangedEvent
  | SSHHostKeyPromptEvent
  | SSHLatencyUpdatedEvent
  | SSHForwardUpdatedEvent

interface ISSHEventBus {
  emit(event: SSHEvent): void
  subscribe(listener: (event: SSHEvent) => void): () => void
}
```

## 4.10 SessionOutputPublisher

当前主进程已有 PTY 输出订阅与 webContents.send 逻辑。

建议抽出一个统一输出发布器，负责：

- session data -> renderer IPC
- 历史序列号附加
- window 是否可用校验
- setImmediate 异步推送

这样 local 和 ssh 不用各自重复发送逻辑。

## 5. 推荐目录结构

建议新增目录结构如下：

```text
src/main/services/ssh/
  SSHConnectionMultiplexer.ts
  SSHTerminalBackend.ts
  SSHTerminalSession.ts
  SSHProfileStore.ts
  SSHVaultService.ts
  SSHKnownHostsStore.ts
  SSHForwardService.ts
  SSHEventBus.ts

src/main/handlers/
  sshProfileHandlers.ts
  sshSessionHandlers.ts
  sshForwardHandlers.ts
  sshKnownHostsHandlers.ts
```

如果首期不想文件过多，可先合并为：

- `SSHTerminalBackend.ts`
- `SSHProfileStore.ts`
- `SSHVaultService.ts`
- `SSHKnownHostsStore.ts`

但不建议把所有 SSH 代码堆进一个 handler 文件。

## 6. session manager 内部索引设计

### 6.1 核心索引

建议保留三类索引：

```ts
sessions: Map<string, ITerminalSession>
sessionInfoMap: Map<string, SessionInfo>
paneIndex: Map<string, string> // `${windowId}:${paneId}` -> sessionId
```

### 6.2 历史与输出缓存

现有 `ptyOutputBuffers` 和 `paneHistoryBuffers` 仍可保留，但要改成 session 语义：

```ts
sessionOutputBuffers: Map<string, string[]>
paneHistoryBuffers: Map<string, PaneHistoryBuffer>
```

说明：

- pane history 仍按 paneId 维度保存
- 输出缓冲应按 sessionId 保存

### 6.3 状态索引

建议保留：

```ts
sessionStatusMap: Map<string, SessionStatus>
```

但 renderer 看到的 pane/window 状态仍然使用现有 `WindowStatus`。

## 7. handler 分层设计

## 7.1 保持现有 handler 职责清晰

当前 handler 划分基本合理，不建议把 SSH 逻辑全部塞回：

- `windowHandlers.ts`
- `paneHandlers.ts`
- `ptyHandlers.ts`

建议：

- 保留原 handler 处理 local / 通用逻辑
- SSH 独有逻辑拆到独立 handler

## 7.2 windowHandlers 的演进

### 现有问题

当前 `create-window` 和 `start-window` 强依赖本地目录验证。

### 改造建议

保留：

- `create-window`
- `start-window`

语义只处理本地终端。

新增：

- `create-ssh-window`
- `start-ssh-pane`

原因：

- 首期兼容性更好
- 前端逻辑更清晰
- 错误边界更可控

后续如果需要统一入口，可再抽象为：

- `create-session-window`
- `start-pane`

但首期不建议一步到位。

## 7.3 paneHandlers 的演进

现有 `split-pane` 是本地 PTY 分裂逻辑。

建议：

- 保留 `split-pane` 处理 local pane
- 新增 `clone-ssh-pane` 处理 SSH pane

未来也可以统一成：

- `spawn-pane-from-source`

但首期分开更稳。

## 7.4 ptyHandlers 的演进

这些接口建议保留原命名：

- `pty-write`
- `pty-resize`
- `get-pty-history`

虽然名字叫 PTY，但行为层面已经可以覆盖 SSH shell session。

这是兼容改造成本最低的方案。

## 7.5 新增 SSH handlers

建议拆成四组：

### `sshProfileHandlers.ts`

负责：

- list/create/update/delete profile

### `sshSessionHandlers.ts`

负责：

- create ssh window
- start ssh pane
- test connection
- reconnect

### `sshForwardHandlers.ts`

负责：

- list/add/remove forward

### `sshKnownHostsHandlers.ts`

负责：

- list/remove known host
- approve/reject pending host key

## 8. 生命周期链路设计

## 8.1 新建 SSH 卡片

链路：

1. renderer 提交 profile 表单
2. `sshProfileHandlers.createSSHProfile`
3. `SSHProfileStore.create`
4. 如果用户提供密码或 passphrase，调用 `SSHVaultService`
5. 返回新 profile
6. renderer 生成 SSH 卡片数据并展示

说明：

- profile 创建与实际连接解耦
- 卡片可以“先保存、后连接”

## 8.2 点击 SSH 卡片进入终端

链路：

1. renderer 点击 SSH 卡片
2. 调用 `create-ssh-window`
3. `sshSessionHandlers` 查询 profile
4. 构造 SSH pane 数据
5. `TerminalSessionManager.createSession({ backend: 'ssh', ... })`
6. `SSHTerminalBackend.createSession`
7. `SSHConnectionMultiplexer.getOrCreate(profile)`
8. 获取 shared connection 并打开 shell channel
9. 包装为 `SSHTerminalSession`
10. manager 注册 session、建立索引、挂数据订阅
11. 返回 `Window`
12. renderer 进入现有 `TerminalView`

## 8.3 SSH pane 分屏

链路：

1. renderer 在 SSH pane 上点分屏
2. 创建新的 paneId 并先插入布局
3. 调用 `clone-ssh-pane` 或 `start-ssh-pane`
4. handler 从源 pane 或 profile 生成新的 `SSHSessionSpec`
5. `SSHTerminalBackend` 尝试复用 shared connection
6. 打开新 shell channel
7. 返回新 `sessionId`
8. renderer 更新 pane 运行态信息

### 关键点

- 分屏不应新建整条 SSH transport，优先新开 channel
- 分屏关闭时只关闭自己的 channel，不影响其他 pane

## 8.4 关闭 pane

链路：

1. renderer 调用 `close-pane(windowId, paneId)`
2. manager 通过 `paneIndex` 找到 `sessionId`
3. 调用 `killSession(sessionId)`
4. 若为 SSH pane：
   - 关闭 shell channel
   - `sharedConnection.release()`
   - 若引用为 0，则关闭 transport
5. 清理 history/output/subscription

## 8.5 关闭 window

链路：

1. renderer 调用 `close-window(windowId)`
2. manager 找出该 window 下所有 pane 对应的 session
3. 逐一关闭
4. 清理索引、状态、订阅

## 8.6 工作区恢复

链路：

1. `WorkspaceManager` 加载 workspace
2. 所有 pane 状态统一重置为 `Paused`
3. renderer 展示卡片
4. 用户手动启动 SSH pane
5. 主进程按 `profileId` 重新创建 session

首期建议不在 workspace 加载后自动连接 SSH，以降低风险。

## 8.7 host key 待确认链路

链路：

1. `SSHTerminalBackend` 建立连接时收到未知 host key
2. 查询 `SSHKnownHostsStore`
3. 未命中或 digest 变更
4. 通过 `SSHEventBus` 发送 `host-key-pending`
5. handler 转发给 renderer
6. renderer 弹确认 UI
7. 用户 approve/reject
8. handler 收到确认结果
9. 若 approve 且 `remember=true`，写入 `SSHKnownHostsStore`
10. backend 继续或终止连接

### 关键设计

主进程需要一个“待确认 host key 请求表”：

```ts
pendingHostKeyPrompts: Map<string, PendingHostKeyPrompt>
```

避免 renderer 回复时无法对应具体连接上下文。

## 8.8 认证失败链路

链路：

1. SSH backend 尝试认证
2. 失败后发 `auth-failed`
3. session manager 标记该 pane 状态
4. renderer 更新卡片/终端状态

如果需要二次输入密码：

- 首期建议不要在底层自动弹窗
- 统一交给 renderer 的认证表单处理

## 9. 状态管理设计

## 9.1 两层状态

主进程内部需要区分：

1. SessionStatus
   - `alive`
   - `exited`

2. SSH connection status
   - `connecting`
   - `connected`
   - `disconnected`
   - `reconnecting`
   - `auth-failed`
   - `host-key-pending`

renderer 仍聚合到现有 `WindowStatus`：

- `connecting` -> `Restoring`
- `connected` -> `Running` / `WaitingForInput`
- `disconnected` -> `Paused` / `Error`
- `auth-failed` -> `Error`

## 9.2 StatusPoller 的演进

当前 `StatusPoller` 偏本地进程状态轮询。

SSH 接入后建议：

- local session 继续可走现有状态检测
- ssh session 不依赖进程轮询，而依赖 backend 主动事件

因此 `StatusPoller` 应逐步演进为更泛化的 `SessionStatusCoordinator`。

首期可以采用折中方案：

- 保留 `StatusPoller`
- local session 继续轮询
- ssh session 直接由 backend 触发状态更新，不注册轮询

## 10. 错误模型设计

### 10.1 为什么需要统一错误模型

SSH 场景错误复杂度高于本地 PTY：

- 网络不可达
- DNS 失败
- host key 不匹配
- 认证失败
- 私钥读取失败
- agent 不可用
- jump host 失败
- proxyCommand 执行失败

如果全部只返回字符串，前端无法做针对性提示。

### 10.2 推荐错误码

```ts
type SSHErrorCode =
  | 'SSH_DNS_FAILED'
  | 'SSH_NETWORK_UNREACHABLE'
  | 'SSH_CONNECTION_TIMEOUT'
  | 'SSH_HOST_KEY_REJECTED'
  | 'SSH_HOST_KEY_MISMATCH'
  | 'SSH_AUTH_FAILED'
  | 'SSH_AGENT_UNAVAILABLE'
  | 'SSH_PRIVATE_KEY_LOAD_FAILED'
  | 'SSH_PROXY_COMMAND_FAILED'
  | 'SSH_JUMP_HOST_FAILED'
  | 'SSH_FORWARD_FAILED'
```

### 10.3 错误对象结构

```ts
interface SessionError {
  code: string
  message: string
  details?: Record<string, unknown>
}
```

handler 返回给 renderer 时应尽量保留 `code`。

## 11. 日志与调试设计

### 11.1 日志分类

建议新增 logger 分类：

- `session-manager`
- `local-backend`
- `ssh-backend`
- `ssh-multiplexer`
- `ssh-profile-store`
- `ssh-vault`
- `ssh-known-hosts`
- `ssh-forward`

### 11.2 日志原则

- 不输出密码、passphrase、私钥内容
- 可以输出 host、port、user
- 可以输出 profileId、sessionId、paneId

## 12. 初始化与依赖注入顺序

### 12.1 主进程启动时初始化顺序建议

1. `WorkspaceManager`
2. `SSHProfileStore`
3. `SSHVaultService`
4. `SSHKnownHostsStore`
5. `SSHEventBus`
6. `SSHConnectionMultiplexer`
7. `LocalTerminalBackend`
8. `SSHTerminalBackend`
9. `TerminalSessionManager`
10. `StatusPoller`
11. IPC handlers

### 12.2 HandlerContext 需要扩展

建议在 `HandlerContext` 中新增：

```ts
sshProfileStore?: ISSHProfileStore
sshVaultService?: ISSHVaultService
sshKnownHostsStore?: ISSHKnownHostsStore
sshForwardService?: ISSHForwardService
sshEventBus?: ISSHEventBus
terminalSessionManager?: ITerminalSessionManager
```

首期也可让 `processManager` 指向已演进后的统一 manager，减少上下文字段数量。

## 13. 研发阶段建议

## 13.1 阶段 A：不引入 SSH，先完成主进程抽象升级

目标：

- local backend 包装完成
- session manager 概念落地
- `windowId:paneId -> sessionId` 路由落地
- 原有 PTY 链路不回归

验收标准：

- 本地终端功能完全不变
- 代码中新增 backend 抽象但默认只注册 local

## 13.2 阶段 B：接 SSH backend 主链路

目标：

- profile store / vault / known_hosts 可用
- SSH window 可创建
- SSH pane 可分屏
- host key 流程可跑通

验收标准：

- 一条标准 SSH 登录链路稳定可用
- 与本地 pane 混合分屏不出架构问题

## 13.3 阶段 C：补专业能力

目标：

- port forward
- SFTP
- reconnect
- diagnostics

## 14. 关键实现建议

### 14.1 不要在 handler 里直接 new SSH session

原因：

- 会话生命周期无法集中管理
- 很容易绕过 manager 索引和清理逻辑

规则：

- handler 只组装 spec
- 一律交给 session manager/createSession

### 14.2 不要让 SSH backend 直接发 renderer IPC

原因：

- backend 变成 UI 感知代码
- 测试和复用困难

规则：

- backend 发内部事件
- manager 或 handler 统一转发 renderer

### 14.3 不要在 workspace 里写敏感数据

这是硬性约束，不应通过“先上线，后清理”妥协。

### 14.4 首期不要自动重连所有 SSH pane

建议先做：

- 手动重连
- 断线提示

再逐步加自动重连策略。

## 15. 测试建议

### 15.1 主进程单元测试

- session manager 索引维护
- local backend 包装行为
- ssh multiplexer 引用计数
- host key 待确认流程
- known_hosts 读写
- vault 不泄漏

### 15.2 集成测试

- `create-ssh-window`
- `start-ssh-pane`
- `clone-ssh-pane`
- `close-pane`
- `close-window`
- mixed split

### 15.3 回归测试

必须覆盖现有本地链路：

- create-window
- start-window
- split-pane
- pty-write
- pty-resize
- workspace restore

## 16. 结论

主进程侧的正确路线不是“在现有本地 PTY 代码旁边硬插 SSH 特判”，而是：

- 用统一 session manager 接管所有终端后端
- 用 backend 模式封装 local 与 ssh
- 用独立 store/service 管理 profile、vault、known_hosts、forward
- 用内部事件总线承接 SSH 的复杂状态变化

这样可以在不破坏现有主链路的前提下，把 SSH 做成真正可维护、可扩展的专业能力基础设施。

## 17. 下一步建议

下一份文档建议聚焦渲染层与交互流，内容应包括：

- SSH 卡片设计
- 新建/编辑 SSH 连接弹窗
- 终端页工具栏能力化
- host key / auth / reconnect UI 流程
- 搜索、筛选、标签、收藏的呈现方式

