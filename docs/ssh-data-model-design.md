# SSH 数据结构与主进程接口设计

## 1. 目标

本文档是 `docs/ssh-terminal-integration-plan.md` 的细化设计，重点解决四个问题：

1. SSH 接入后，`Window` / `Pane` / `Workspace` 如何建模
2. 主进程如何把本地 PTY 和 SSH 会话统一成一套接口
3. 渲染层与主进程之间需要哪些 IPC 契约
4. 如何在不破坏现有本地终端能力的前提下完成迁移

本文档只覆盖数据模型与接口设计，不展开 UI 交互细节。

## 2. 设计原则

### 2.1 向后兼容优先

现有数据结构和页面逻辑大量依赖以下字段：

- `window.layout`
- `pane.cwd`
- `pane.command`
- `pane.status`
- `pane.pid`

因此 SSH 接入首期不宜一次性推翻原模型，而应采用“保留旧字段语义，增量扩展”的策略。

### 2.2 backend 与 capability 分离

系统内部需要区分：

- pane 来自哪个 backend
- pane 拥有哪些能力

backend 用于主进程创建正确的 session。

capability 用于渲染层决定是否展示：

- 打开本地目录
- 用 IDE 打开
- Git watch
- 端口转发
- SFTP
- 重连

### 2.3 敏感信息不进 Workspace

以下字段不能保存到 `workspace.json`：

- SSH 密码
- 私钥 passphrase
- keyboard-interactive 的临时回答
- 运行期 token

workspace 只保存：

- 连接 profile 引用
- 连接展示信息
- 恢复所需的非敏感元数据

## 3. 数据模型总览

建议新增三层模型：

1. `Pane` / `Window` 运行时模型
2. `SSHProfile` 配置模型
3. `TerminalSession` 主进程会话模型

对应存储：

- `workspace.json`
- `ssh-profiles.json`
- `vault`

## 4. Window / Pane 模型设计

### 4.1 当前模型的问题

当前 `Pane` 结构不足以表达 SSH：

- 无 backend 类型
- 无 profile 引用
- 无 session 唯一标识
- 无连接能力描述
- `pid` 被当作唯一会话身份，不适用于 SSH

### 4.2 首期推荐模型

建议保留现有 `Pane` 基本字段，同时增加 SSH 扩展。

```ts
export type PaneBackend = 'local' | 'ssh'

export interface PaneCapabilities {
  canOpenLocalFolder: boolean
  canOpenInIDE: boolean
  canWatchGitBranch: boolean
  canReconnect: boolean
  canOpenSFTP: boolean
  canManagePortForwards: boolean
  canCloneSession: boolean
}

export interface SshPaneBinding {
  profileId: string
  host: string
  port: number
  user: string
  authType: 'password' | 'publicKey' | 'agent' | 'keyboardInteractive'
  remoteCwd?: string
  jumpHostProfileId?: string
  proxyCommand?: string
  reuseSession?: boolean
}

export interface Pane {
  id: string
  cwd: string
  command: string
  status: WindowStatus
  pid: number | null
  sessionId?: string
  backend?: PaneBackend
  capabilities?: PaneCapabilities
  ssh?: SshPaneBinding
  lastOutput?: string
  title?: string
  borderColor?: string
  activeBorderColor?: string
  teamName?: string
  agentId?: string
  agentName?: string
  agentColor?: string
  teammateMode?: 'tmux' | 'in-process' | 'auto'
}
```

### 4.3 字段说明

#### `backend`

用途：

- `local` 表示本地 shell pane
- `ssh` 表示 SSH shell pane

兼容策略：

- 老数据缺失时默认推断为 `local`

#### `sessionId`

用途：

- 取代 `pid` 成为跨 backend 的运行态会话主键
- 主进程所有输入输出路由最终应基于 `sessionId`

兼容策略：

- 首期允许 `pid` 与 `sessionId` 并存
- 本地 pane 启动时两个字段都赋值
- SSH pane 只强依赖 `sessionId`

#### `cwd`

首期继续保留，作为“展示路径”使用。

语义：

- 对 `local` pane，表示本地工作目录
- 对 `ssh` pane，表示展示用远程路径，可能是：
  - 当前远程目录
  - 默认远程目录
  - profile 级别显示路径

后续二期可再拆为：

- `displayPath`
- `localCwd`
- `remoteCwd`

#### `command`

语义：

- `local` pane：本地 shell 程序
- `ssh` pane：远程 shell 或登录后启动命令

#### `capabilities`

渲染层不直接根据 backend 写死逻辑，而是根据 capability 判断。

例如：

- `backend === 'ssh'` 不一定总能 `canOpenSFTP`
- 某些 local pane 未来也可能禁用 `canWatchGitBranch`

### 4.4 Window 扩展建议

建议为 `Window` 增加以下可选字段：

```ts
export type WindowKind = 'local' | 'ssh' | 'mixed'

export interface Window {
  id: string
  name: string
  layout: LayoutNode
  activePaneId: string
  createdAt: string
  lastActiveAt: string
  archived?: boolean
  projectConfig?: ProjectConfig
  gitBranch?: string
  kind?: WindowKind
  tags?: string[]
  favorite?: boolean
  claudeModel?: string
  claudeModelId?: string
  claudeContextPercentage?: number
  claudeCost?: number
}
```

#### `kind` 推断规则

- 所有 pane 为 `local` 时：`local`
- 所有 pane 为 `ssh` 时：`ssh`
- pane 混合时：`mixed`

首期可不持久化，运行时动态推导也可。

## 5. SSH Profile 模型设计

### 5.1 目标

SSH profile 是“可复用的连接模板”，不是一个运行中的 pane。

profile 用于：

- 首页 SSH 卡片
- 快捷连接
- 新建 SSH 窗口
- SSH pane 拆分继承
- 工作区恢复时重新绑定

### 5.2 推荐结构

```ts
export type SSHAuthType =
  | 'password'
  | 'publicKey'
  | 'agent'
  | 'keyboardInteractive'

export type PortForwardType =
  | 'local'
  | 'remote'
  | 'dynamic'

export interface ForwardedPortConfig {
  id: string
  type: PortForwardType
  host: string
  port: number
  targetAddress: string
  targetPort: number
  description?: string
}

export interface SSHProfile {
  id: string
  name: string
  host: string
  port: number
  user: string
  auth: SSHAuthType
  privateKeys: string[]
  keepaliveInterval: number
  keepaliveCountMax: number
  readyTimeout: number | null
  verifyHostKeys: boolean
  x11: boolean
  skipBanner: boolean
  jumpHostProfileId?: string
  agentForward: boolean
  warnOnClose: boolean
  proxyCommand?: string
  socksProxyHost?: string
  socksProxyPort?: number
  httpProxyHost?: string
  httpProxyPort?: number
  reuseSession: boolean
  forwardedPorts: ForwardedPortConfig[]
  remoteCommand?: string
  defaultRemoteCwd?: string
  tags: string[]
  notes?: string
  icon?: string
  color?: string
  createdAt: string
  updatedAt: string
}
```

### 5.3 与 Tabby 字段的关系

建议尽量兼容 Tabby SSH 的核心字段命名，便于：

- 参考实现
- 导入 profile
- 后续做迁移工具

但要做两点调整：

1. `jumpHost` 改名为 `jumpHostProfileId`
   - 语义更清晰

2. `password` 不放在 profile
   - 放入 vault

## 6. Vault 模型设计

### 6.1 敏感信息单独存储

建议提供逻辑模型：

```ts
export interface SSHVaultEntry {
  profileId: string
  password?: string
  privateKeyPassphrases?: Record<string, string>
  updatedAt: string
}
```

运行时接口：

```ts
export interface ISSHVaultService {
  get(profileId: string): Promise<SSHVaultEntry | null>
  set(profileId: string, entry: SSHVaultEntry): Promise<void>
  patch(profileId: string, patch: Partial<SSHVaultEntry>): Promise<void>
  remove(profileId: string): Promise<void>
}
```

### 6.2 首期实现建议

首期允许采用加密 JSON 文件实现，但接口层要抽象出来，方便未来替换为：

- macOS Keychain
- Windows Credential Manager / DPAPI
- Linux Secret Service

## 7. 主进程 Session 模型设计

### 7.1 问题定义

当前主进程抽象是 `IPty`，本质上只适配本地 node-pty。

SSH 接入后需要一个更高层的运行时抽象。

### 7.2 推荐抽象

```ts
export type SessionBackend = 'local' | 'ssh'

export interface SessionMetadata {
  sessionId: string
  backend: SessionBackend
  paneId?: string
  windowId?: string
  pid: number | null
  displayName?: string
  cwd?: string
}

export interface ITerminalSession {
  readonly sessionId: string
  readonly backend: SessionBackend
  readonly pid: number | null

  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): Promise<void> | void

  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }

  getMetadata(): SessionMetadata
}
```

### 7.3 backend 接口

```ts
export interface LocalSessionSpec {
  backend: 'local'
  workingDirectory: string
  command?: string
  env?: Record<string, string>
  windowId?: string
  paneId?: string
}

export interface SSHSessionSpec {
  backend: 'ssh'
  profileId: string
  windowId?: string
  paneId?: string
  remoteCwd?: string
  command?: string
  cols?: number
  rows?: number
}

export type TerminalSessionSpec = LocalSessionSpec | SSHSessionSpec

export interface ITerminalBackend {
  readonly kind: SessionBackend
  createSession(spec: TerminalSessionSpec): Promise<ITerminalSession>
}
```

### 7.4 主进程管理器职责

建议把现有 `ProcessManager` 演进为统一会话管理器，职责包括：

- 创建本地/SSH session
- 维护 `paneId -> sessionId`
- 维护 `sessionId -> session`
- 统一分发 data / exit
- 统一记录 history
- 统一处理 resize / write / close

建议运行时索引：

```ts
sessions: Map<string, ITerminalSession>
sessionInfo: Map<string, SessionInfo>
paneIndex: Map<string, string> // windowId:paneId -> sessionId
```

## 8. SessionInfo 设计

当前 `ProcessInfo` 依赖 `pid`。建议新增泛化后的 `SessionInfo`：

```ts
export enum SessionStatus {
  Alive = 'alive',
  Exited = 'exited',
}

export interface SessionInfo {
  sessionId: string
  backend: SessionBackend
  pid: number | null
  status: SessionStatus
  exitCode?: number
  workingDirectory?: string
  command?: string
  profileId?: string
  windowId?: string
  paneId?: string
}
```

迁移策略：

- 首期保留 `ProcessInfo`
- 新增 `SessionInfo`
- 本地链路逐步切到 `SessionInfo`

## 9. 能力模型设计

### 9.1 为什么需要 capability

当前渲染层里很多功能直接假设 pane 是本地：

- 打开目录
- 用 IDE 打开
- 启动 Git watcher
- 读取项目配置

如果只靠 `backend` 判断，会在 UI 层堆积条件分支。

因此建议能力显式化。

### 9.2 计算规则

#### local pane 默认能力

```ts
{
  canOpenLocalFolder: true,
  canOpenInIDE: true,
  canWatchGitBranch: true,
  canReconnect: false,
  canOpenSFTP: false,
  canManagePortForwards: false,
  canCloneSession: true,
}
```

#### ssh pane 默认能力

```ts
{
  canOpenLocalFolder: false,
  canOpenInIDE: false,
  canWatchGitBranch: false,
  canReconnect: true,
  canOpenSFTP: true,
  canManagePortForwards: true,
  canCloneSession: true,
}
```

### 9.3 计算位置

建议在主进程创建 session 或生成 pane 数据时计算并注入，渲染层只消费。

## 10. Workspace 持久化设计

### 10.1 workspace 保存内容

`workspace.json` 仍然保存：

- windows
- groups
- settings
- lastSavedAt

但其中 pane 持久化时要遵循：

- 保存 `backend`
- 保存 `ssh.profileId`
- 保存 `ssh.host/port/user` 作为冗余展示信息
- 不保存密码与 passphrase
- 不保存运行态 session 实体

### 10.2 示例

```json
{
  "id": "pane-1",
  "backend": "ssh",
  "cwd": "/srv/app",
  "command": "bash",
  "ssh": {
    "profileId": "profile-prod-web-01",
    "host": "10.0.0.21",
    "port": 22,
    "user": "root",
    "authType": "publicKey",
    "remoteCwd": "/srv/app",
    "reuseSession": true
  }
}
```

### 10.3 恢复规则

恢复时：

- `backend` 缺失则按 `local` 处理
- `ssh.profileId` 存在则恢复为 SSH pane
- 所有 pane 状态仍重置为 `Paused`
- `sessionId` 不持久化

## 11. IPC 契约设计

## 11.1 设计原则

- 保留现有 PTY IPC 命名，避免大规模前端重写
- 新增 SSH 管理类 IPC
- 会话 I/O 层尽量继续复用现有 `pty-*` 调用

### 11.2 现有 IPC 继续沿用

以下接口不区分 backend：

```ts
ptyWrite(windowId, paneId, data, metadata?)
ptyResize(windowId, paneId, cols, rows)
getPtyHistory(paneId)
closePane(windowId, paneId)
closeWindow(windowId)
```

实现要求：

- 主进程通过 `windowId + paneId -> sessionId -> session` 路由到正确 backend

### 11.3 新增 profile 管理 IPC

```ts
createSSHProfile(config: SSHProfileInput): Promise<IpcResponse<SSHProfile>>
updateSSHProfile(profileId: string, patch: SSHProfilePatch): Promise<IpcResponse<SSHProfile>>
deleteSSHProfile(profileId: string): Promise<IpcResponse<void>>
listSSHProfiles(): Promise<IpcResponse<SSHProfile[]>>
getSSHProfile(profileId: string): Promise<IpcResponse<SSHProfile>>
```

其中：

```ts
type SSHProfileInput = Omit<SSHProfile, 'id' | 'createdAt' | 'updatedAt'>
type SSHProfilePatch = Partial<SSHProfileInput>
```

### 11.4 新增 vault IPC

```ts
getSSHCredentialState(profileId: string): Promise<IpcResponse<{
  hasPassword: boolean
  hasPassphrase: boolean
}>>

setSSHPassword(profileId: string, password: string): Promise<IpcResponse<void>>
clearSSHPassword(profileId: string): Promise<IpcResponse<void>>
setSSHPrivateKeyPassphrase(profileId: string, keyPath: string, passphrase: string): Promise<IpcResponse<void>>
clearSSHPrivateKeyPassphrase(profileId: string, keyPath: string): Promise<IpcResponse<void>>
```

说明：

- 不提供“读取明文密码”给渲染层
- 渲染层只负责设置，不负责回显

### 11.5 新增 SSH 窗口与 pane IPC

```ts
createSSHWindow(config: {
  name?: string
  profileId: string
  remoteCwd?: string
  command?: string
}): Promise<IpcResponse<Window>>

startSSHPane(config: {
  windowId: string
  paneId: string
  profileId: string
  remoteCwd?: string
  command?: string
}): Promise<IpcResponse<{
  sessionId: string
  pid: number | null
  status: WindowStatus
}>>

cloneSSHPane(config: {
  sourceWindowId: string
  sourcePaneId: string
  targetWindowId: string
  targetPaneId: string
}): Promise<IpcResponse<{
  sessionId: string
  pid: number | null
}>>
```

### 11.6 新增连接测试与诊断 IPC

```ts
testSSHConnection(config: {
  profileId: string
}): Promise<IpcResponse<{
  ok: boolean
  latencyMs?: number
  banner?: string
  errorCode?: string
  errorMessage?: string
}>>
```

### 11.7 新增 known_hosts IPC

```ts
listKnownHosts(): Promise<IpcResponse<KnownHostEntry[]>>
removeKnownHost(entryId: string): Promise<IpcResponse<void>>
```

### 11.8 新增端口转发 IPC

```ts
listPortForwards(sessionId: string): Promise<IpcResponse<ActivePortForward[]>>
addPortForward(sessionId: string, config: ForwardedPortConfig): Promise<IpcResponse<ActivePortForward>>
removePortForward(sessionId: string, forwardId: string): Promise<IpcResponse<void>>
```

### 11.9 新增 SSH 事件

```ts
onSSHConnectionStatusChanged(payload: {
  windowId: string
  paneId: string
  sessionId?: string
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'auth-failed' | 'host-key-pending'
  message?: string
})

onSSHHostKeyPrompt(payload: {
  profileId: string
  host: string
  port: number
  algorithm: string
  fingerprint: string
  digest: string
})

onSSHLatencyUpdated(payload: {
  windowId: string
  paneId: string
  latencyMs: number
})
```

### 11.10 host key 确认 IPC

```ts
approveSSHHostKey(payload: {
  profileId: string
  host: string
  port: number
  algorithm: string
  digest: string
  remember: boolean
}): Promise<IpcResponse<void>>

rejectSSHHostKey(payload: {
  profileId: string
  host: string
  port: number
  algorithm: string
  digest: string
}): Promise<IpcResponse<void>>
```

## 12. Session 路由设计

### 12.1 当前路由方式

当前输入输出主要通过：

- `windowId`
- `paneId`
- `pid`

做关联。

### 12.2 新路由方式

建议统一采用：

1. 渲染层发 `windowId + paneId`
2. 主进程通过 `paneIndex` 找到 `sessionId`
3. 再由 `sessionId` 找到具体 `ITerminalSession`

原因：

- 渲染层无需感知 `sessionId`
- 和当前 IPC 调用方式最接近
- 不破坏大量现有代码

## 13. 迁移方案

### 13.1 第一步：类型扩展

修改：

- `src/shared/types/window.ts`
- `src/main/types/process.ts`
- `src/shared/types/electron-api.ts`

新增：

- `PaneBackend`
- `PaneCapabilities`
- `SshPaneBinding`
- `SessionInfo`
- `SSHProfile`

### 13.2 第二步：主进程会话管理器增量演进

保留 `ProcessManager` 对外名称，内部做以下演进：

- `ptys` -> `sessions`
- `processes` -> `sessionInfo`
- `getPidByPane` 继续保留，但内部实际走 `sessionId`
- 新增 `getSessionIdByPane`

### 13.3 第三步：local backend 包装

新增：

- `LocalTerminalSession`

将 node-pty 实例包装成 `ITerminalSession`。

这样 SSH backend 接入时，调用方不需要双写逻辑。

### 13.4 第四步：前端能力开关接入

先不改业务交互，只做保护：

- local pane 才允许 open folder
- local pane 才允许 IDE 打开
- local pane 才允许 git watch

### 13.5 第五步：SSH profile 与 SSH window

在底层抽象完成后再接入：

- SSH profile store
- SSH vault
- SSH pane/window 创建链路

## 14. 兼容性与回滚策略

### 14.1 老工作区兼容

规则：

- 老 pane 缺 `backend` 时自动补 `local`
- 老 pane 缺 `capabilities` 时运行时生成
- 老 workspace 不需要迁移脚本，加载时补齐即可

### 14.2 回滚策略

如果 SSH 功能首批上线后需要紧急关闭：

- 保留类型扩展
- 通过 feature flag 关闭 SSH 入口
- 已存在的 SSH pane 在首页可隐藏并提示“不支持此版本”

更稳妥的方式是在设置里引入：

- `features.sshEnabled`

## 15. 建议落地文件

### 15.1 类型定义

建议新增或修改：

- `src/shared/types/window.ts`
- `src/shared/types/ssh.ts`
- `src/shared/types/electron-api.ts`
- `src/main/types/process.ts`

### 15.2 主进程服务

建议新增：

- `src/main/services/ssh/SSHProfileStore.ts`
- `src/main/services/ssh/SSHVaultService.ts`
- `src/main/services/ssh/SSHKnownHostsStore.ts`
- `src/main/services/ssh/SSHTerminalBackend.ts`
- `src/main/services/ssh/SSHTerminalSession.ts`
- `src/main/services/ssh/SSHConnectionMultiplexer.ts`

### 15.3 IPC handler

建议新增：

- `src/main/handlers/sshProfileHandlers.ts`
- `src/main/handlers/sshSessionHandlers.ts`
- `src/main/handlers/sshForwardHandlers.ts`

## 16. 开发顺序建议

按最小风险路径，建议顺序如下：

1. 扩展 shared types，引入 `backend` / `sessionId` / `capabilities`
2. 本地会话包装成统一 `ITerminalSession`
3. 将 `ProcessManager` 内部索引改造成支持 `sessionId`
4. 接入 capability 分流，消除本地路径硬依赖
5. 落 SSH profile/vault/known_hosts
6. 实现 SSH backend
7. 打通 SSH window / pane 创建与恢复

## 17. 结论

这一版设计的核心思路是：

- 不推翻现有 `Window` / `Pane` 模型
- 通过 `backend + sessionId + capabilities + ssh binding` 增量扩展
- 主进程引入统一 session 抽象，逐步淡化 `pid` 的中心地位
- IPC 保持最大兼容，只在 SSH 管理维度新增接口

这样可以在控制风险的前提下，把 SSH 真正做成现有终端系统中的一等能力，而不是挂在边上的特殊功能。

