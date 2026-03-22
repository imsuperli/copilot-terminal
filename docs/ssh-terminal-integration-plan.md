# SSH 终端集成总体方案

## 1. 背景与目标

当前项目已经具备以下核心能力：

- 本地终端会话管理
- 多窗格分屏
- 统一卡片主页
- 窗口组
- 工作区持久化与恢复
- 基于 xterm 的终端渲染
- 主进程统一 PTY 生命周期管理

本次需求目标不是简单增加一个“远程连接弹窗”，而是将 SSH 能力作为本软件的一等能力，和本地终端在产品层与架构层实现真正融合。

目标效果：

- 首页新增 `SSH` 卡片类型
- 点击 SSH 卡片进入现有终端页
- SSH 与本地终端共用同一套终端视图、分屏能力、窗口组能力、快速切换能力
- SSH 可持久化、可恢复、可收藏、可搜索
- 连接体验和专业工具接近 MobaXterm，而不是停留在“能连上”

非目标：

- 首版不追求一次性完整覆盖 MobaXterm 的所有高级功能
- 不直接整体移植 `tabby-ssh` 的 Angular UI 和插件体系
- 不为了 SSH 接入破坏现有本地终端链路

## 2. 现状分析

### 2.1 当前项目的架构特点

当前项目的核心建模不是“一个目录对应一个终端”，而是：

- `Window` 表示一个终端窗口
- `layout` 表示一个递归布局树
- `Pane` 表示最小会话单元
- 主进程负责会话生命周期
- 渲染层只关心数据流、输出流和交互

这意味着当前项目天然适合扩展为“多后端终端系统”。

关键现状：

- `Window` 与 `Pane` 结构定义在 [src/shared/types/window.ts](../src/shared/types/window.ts)
- 主进程统一终端接口定义在 [src/main/types/process.ts](../src/main/types/process.ts)
- 终端创建和生命周期控制集中在 [src/main/services/ProcessManager.ts](../src/main/services/ProcessManager.ts)
- 卡片首页在 [src/renderer/components/CardGrid.tsx](../src/renderer/components/CardGrid.tsx)
- 终端页在 [src/renderer/components/TerminalView.tsx](../src/renderer/components/TerminalView.tsx)

### 2.2 当前架构对 SSH 集成的有利点

- 已有统一的数据流：输入、输出、resize、exit
- 已有窗格布局模型，天然支持 SSH pane 与本地 pane 混排
- 已有工作区 autosave 和恢复能力
- 已有卡片页和终端页，无需重新发明主交互模型
- 已有主进程 IPC 边界，适合新增 SSH backend

### 2.3 当前架构对 SSH 集成的不利点

当前项目很多地方默认 pane 对应“本地目录”：

- 创建窗口时强校验本地路径
- 启动窗口时强校验本地路径
- 卡片搜索按本地 `cwd`
- 终端页激活时默认启用本地 git watcher
- 卡片与工具栏会展示 `打开文件夹`、`用 IDE 打开`
- 工作区恢复时会重新读取本地 `copilot.json`

这些逻辑对 SSH pane 不成立，是首要改造点。

## 3. 对 Tabby 的评估结论

### 3.1 可以直接参考的部分

`../tabby` 中与本需求最相关的是 `tabby-ssh`：

- SSH profile 结构
- 认证链路
- host key 校验
- known_hosts 管理
- jump host
- proxy / socks / http proxy
- 端口转发
- 会话复用
- shell channel 和 resize/write 处理

建议重点参考：

- [../tabby/tabby-ssh/src/api/interfaces.ts](../../tabby/tabby-ssh/src/api/interfaces.ts)
- [../tabby/tabby-ssh/src/session/ssh.ts](../../tabby/tabby-ssh/src/session/ssh.ts)
- [../tabby/tabby-ssh/src/session/shell.ts](../../tabby/tabby-ssh/src/session/shell.ts)
- [../tabby/tabby-ssh/src/services/sshMultiplexer.service.ts](../../tabby/tabby-ssh/src/services/sshMultiplexer.service.ts)

### 3.2 不建议直接移植的部分

不建议直接搬运：

- Angular 组件
- Tabby Core 服务体系
- 插件注册与注入机制
- Tabby 的 profile UI
- Tabby 的 session 恢复机制

原因：

- 当前项目是 Electron + React + Zustand
- Tabby SSH 高度依赖 Angular DI 与 Tabby Core 基础设施
- 直接移植会把当前项目架构拉向“双体系并存”，维护成本极高

### 3.3 最终策略

采用“参考协议实现，重建适配层”的路线：

- 参考 Tabby 的 SSH profile 与能力边界
- 参考 Tabby 的 SSH session 流程
- 在当前项目中重建一个 SSH backend
- 通过统一会话接口接入现有终端 UI

## 4. 产品方案

### 4.1 首页呈现方案

首页保持现有卡片网格，不新增独立 SSH 页面。

新增两类卡片：

- 本地终端卡片
- SSH 终端卡片

SSH 卡片建议字段：

- 名称：用户自定义，如 `prod-web-01`
- 连接信息：`root@10.0.0.21:22`
- 类型标记：`SSH`
- 标签：环境、业务、区域
- 状态：未连接、连接中、已连接、认证失败、断开
- 附加状态：是否通过堡垒机、是否启用端口转发、最近连接时间

SSH 卡片快捷操作：

- 连接
- 断开
- 重连
- 编辑
- 复制 SSH 命令
- 打开 SFTP
- 管理端口转发

### 4.2 点击进入后的终端页方案

SSH 卡片点击后进入现有 `TerminalView`，不另起页面。

终端页使用同一套布局组件：

- `TerminalView`
- `SplitLayout`
- `TerminalPane`

区别只在 pane backend 不同。

顶部工具栏按能力显示动作：

- 本地 pane：打开文件夹、用 IDE 打开、Git 相关动作
- SSH pane：重连、SFTP、端口转发、复制连接串、查看 host key、会话信息

### 4.3 与分屏和窗口组的融合方式

目标是“完美融合”，因此必须支持以下组合：

- 本地 + 本地 分屏
- SSH + SSH 分屏
- 本地 + SSH 混合分屏
- SSH 窗口加入窗口组
- 混合窗口加入窗口组

窗口组层面不区分 backend，只看统一的 `Window` 与 `Pane` 状态聚合。

### 4.4 搜索与筛选

新增以下搜索维度：

- 名称
- 主机
- 用户
- 端口
- 标签
- 备注

新增以下筛选维度：

- 全部
- 本地
- SSH
- 活跃
- 已归档
- 收藏
- 环境分类

## 5. 总体技术方案

### 5.1 核心设计原则

1. SSH 不是一个独立子系统页面，而是终端会话的一种 backend
2. 前端终端 UI 尽量不感知 backend 差异，只感知能力差异
3. 敏感信息不能进入工作区 autosave
4. 保持现有本地终端链路稳定，SSH 作为增量演进
5. 优先抽象主进程会话层，不在渲染层堆过多分支逻辑

### 5.2 核心架构演进

现状：

- `ProcessManager` 只管理本地 PTY

目标：

- 将 `ProcessManager` 演进为统一会话管理器
- 本地 shell 和 SSH shell 都走统一 session 接口

建议抽象：

```ts
interface ITerminalSession {
  id: string
  kind: 'local' | 'ssh'
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(listener: (data: string) => void): Disposable
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): Disposable
  getMetadata(): TerminalSessionMetadata
  getCapabilities(): TerminalCapabilities
}
```

再引入 backend：

```ts
interface ITerminalBackend {
  kind: 'local' | 'ssh'
  createSession(spec: SessionSpec): Promise<ITerminalSession>
}
```

实现类：

- `LocalTerminalBackend`
- `SshTerminalBackend`
- `TerminalSessionManager`

## 6. 数据模型设计

### 6.1 现有问题

当前 `Pane` 只包含：

- `cwd`
- `command`
- `status`
- `pid`

这不足以表达 SSH 会话。

### 6.2 目标模型

建议为 `Pane` 引入 backend 与能力建模。

示意：

```ts
type PaneBackend = 'local' | 'ssh'

interface PaneBase {
  id: string
  backend: PaneBackend
  status: WindowStatus
  pid: number | null
  sessionId?: string
  title?: string
  lastOutput?: string
}

interface LocalPane extends PaneBase {
  backend: 'local'
  cwd: string
  command: string
}

interface SshPane extends PaneBase {
  backend: 'ssh'
  cwd: string
  command: string
  ssh: {
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
}

type Pane = LocalPane | SshPane
```

说明：

- `cwd` 字段可暂时保留，兼容现有搜索与展示逻辑
- 对 SSH pane，`cwd` 不再表示本地路径，而表示“显示路径”
- 后续再分离为 `displayPath` / `localCwd` / `remoteCwd`

### 6.3 Window 层建议扩展

建议给 `Window` 增加：

- `kind?: 'local' | 'ssh' | 'mixed'`
- `tags?: string[]`
- `favorite?: boolean`

其中：

- 单 backend 全本地窗口为 `local`
- 单 backend 全 SSH 窗口为 `ssh`
- 混合分屏窗口为 `mixed`

### 6.4 SSH Profile 模型

SSH profile 不建议直接塞进 `Workspace`。

建议新增持久化模型：

```ts
interface SSHProfile {
  id: string
  name: string
  host: string
  port: number
  user: string
  auth: 'password' | 'publicKey' | 'agent' | 'keyboardInteractive'
  privateKeys: string[]
  keepaliveInterval: number
  keepaliveCountMax: number
  readyTimeout: number | null
  jumpHostProfileId?: string
  agentForward?: boolean
  proxyCommand?: string
  socksProxyHost?: string
  socksProxyPort?: number
  httpProxyHost?: string
  httpProxyPort?: number
  reuseSession?: boolean
  forwardedPorts?: ForwardedPortConfig[]
  verifyHostKeys?: boolean
  tags?: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}
```

敏感字段单独处理：

- password
- private key passphrase
- keyboard-interactive 临时回答

## 7. 存储与安全方案

### 7.1 存储分层

建议拆成三层：

1. `workspace.json`
   - 保存窗口、布局、窗口组、运行恢复信息
   - 不保存密码

2. `ssh-profiles.json`
   - 保存主机、端口、用户、标签、转发配置、连接偏好

3. `vault`
   - 保存密码、passphrase、token

### 7.2 vault 方案建议

优先顺序：

- macOS：Keychain
- Windows：Credential Manager 或 DPAPI
- Linux：Secret Service，必要时回退加密本地文件

如果首版不想引入复杂跨平台原生依赖，可采用：

- 应用主密码
- AES 加密本地 vault 文件

但从专业性角度，后续建议接系统密钥链。

### 7.3 host key 与 known_hosts

首版必须支持：

- 首次连接展示 host key 指纹
- 用户确认后写入 known_hosts
- 指纹变更时强提醒
- 提供“拒绝连接”和“更新信任”流程

不建议首版默认关闭 host key 校验。

## 8. 主进程集成方案

### 8.1 当前主进程问题

当前窗口创建和启动都强依赖本地目录验证：

- `create-window`
- `start-window`
- `split-pane`

SSH 接入后需要按 backend 分流。

### 8.2 建议新增的主进程模块

新增目录建议：

- `src/main/services/ssh/SSHSessionManager.ts`
- `src/main/services/ssh/SSHSession.ts`
- `src/main/services/ssh/SSHShellSession.ts`
- `src/main/services/ssh/SSHProfileStore.ts`
- `src/main/services/ssh/SSHKnownHostsStore.ts`
- `src/main/services/ssh/SSHVaultService.ts`
- `src/main/services/ssh/SSHConnectionMultiplexer.ts`
- `src/main/services/ssh/SSHForwardService.ts`

### 8.3 与现有 ProcessManager 的关系

建议分两步演进：

第一步，低风险方案：

- 保留 `ProcessManager` 名称
- 将其内部 `ptys` 概念泛化为 `sessions`
- 本地 PTY 也包装成 `LocalTerminalSession`
- SSH 会话包装成 `SSHTerminalSession`

第二步，重构命名：

- `ProcessManager` 更名为 `TerminalSessionManager`
- `process.ts` 更名为 `session.ts`

首版建议先做第一步，避免一次性重构过大。

### 8.4 会话复用

参考 Tabby 的 multiplexer 思路，对下列维度生成复用 key：

- host
- port
- user
- proxyCommand
- socksProxy
- httpProxy
- jumpHost 链

复用策略：

- 同 profile 多个 pane 可共用底层 SSH transport
- 每个 pane 独立 shell channel
- pane 关闭仅关闭自己的 channel
- transport 在引用计数归零后断开

## 9. IPC 方案

### 9.1 现有 IPC 可复用部分

以下 IPC 可以继续复用，不区分 backend：

- `pty-write`
- `pty-resize`
- `get-pty-history`
- `close-pane`
- `close-window`

因为前端只是在操作“当前 pane 的输入输出通道”。

### 9.2 需要新增的 IPC

建议新增：

- `create-ssh-profile`
- `update-ssh-profile`
- `delete-ssh-profile`
- `list-ssh-profiles`
- `connect-ssh-profile`
- `create-ssh-window`
- `clone-ssh-pane`
- `ssh-test-connection`
- `ssh-list-known-hosts`
- `ssh-remove-known-host`
- `ssh-list-port-forwards`
- `ssh-add-port-forward`
- `ssh-remove-port-forward`
- `ssh-open-sftp`

### 9.3 事件流

建议新增事件：

- `ssh-connection-status-changed`
- `ssh-host-key-prompt`
- `ssh-auth-prompt`
- `ssh-port-forward-updated`
- `ssh-latency-updated`

## 10. 渲染层集成方案

### 10.1 首页卡片

需要改造：

- `CardGrid`
- `WindowCard`
- `CreateWindowDialog`
- `EditWindowPanel`

建议新增：

- `CreateSSHConnectionDialog`
- `EditSSHConnectionDialog`
- `SSHBadge`
- `SSHProfileSelector`

### 10.2 终端页

`TerminalView` 尽量保持不分叉，只引入 capability 判断。

建议新增：

```ts
interface TerminalCapabilities {
  canOpenLocalFolder: boolean
  canOpenInIDE: boolean
  canWatchGitBranch: boolean
  canReconnect: boolean
  canOpenSFTP: boolean
  canManagePortForwards: boolean
}
```

终端页顶部工具栏根据 capability 决定按钮显示。

### 10.3 TerminalPane

`TerminalPane` 不需要知道后端是本地还是 SSH，只需要：

- 继续写数据
- 继续 resize
- 继续消费输出
- 继续处理 exit

但要新增服务消息样式支持，例如：

- host key 提示
- 重连中
- 网络断开
- 端口转发状态

### 10.4 QuickSwitcher / Sidebar

SSH 项目需要在以下组件增加识别能力：

- `QuickSwitcher`
- `QuickSwitcherItem`
- `Sidebar`

展示建议：

- 名称
- `user@host`
- backend 标记
- 当前状态

## 11. 分屏行为设计

### 11.1 本地 pane 拆分

保持现状：

- 继承 `cwd`
- 继承 `command`

### 11.2 SSH pane 拆分

建议策略：

- 继承 profile
- 继承连接复用策略
- 继承认证上下文
- 尝试继承当前远程目录

远程目录继承分为两级：

1. 理想方案
   - 借助 shell integration / OSC / prompt hook 获取当前远程 cwd

2. 回退方案
   - 使用 profile 默认远程目录
   - 如果无默认目录，则登录后停留在远程 shell 默认目录

### 11.3 混合分屏

必须支持：

- 活跃 pane 是本地时拆出本地 pane
- 活跃 pane 是 SSH 时拆出 SSH pane

不建议在一次拆分操作中自动切换 backend。

## 12. 工作区恢复方案

### 12.1 恢复原则

本地与 SSH 分开处理。

本地 pane：

- 加载后状态重置为 `Paused`
- 恢复本地目录信息
- 恢复项目配置信息

SSH pane：

- 加载后状态重置为 `Paused`
- 恢复 profile 引用和展示信息
- 不恢复密码明文
- 连接时再从 vault 获取敏感数据

### 12.2 自动重连策略

首版建议：

- 恢复工作区后 SSH pane 默认不自动连接
- 用户点击启动再连接

增强版可提供设置：

- 不自动连接
- 恢复后自动连接收藏连接
- 恢复后自动连接上次活跃 SSH pane

## 13. 专业能力路线

### 13.1 P0：首版上线能力

- SSH 卡片
- SSH profile 管理
- password / public key / agent / keyboard-interactive
- host key 校验
- known_hosts
- jump host
- keepalive / timeout
- 会话复用
- SSH pane 分屏
- SSH 与本地混合分屏
- 工作区恢复

### 13.2 P1：增强能力

- 本地 / 远程 / 动态端口转发
- SFTP 面板
- 重连
- 最近连接
- 收藏与标签
- 连接测速与状态栏

### 13.3 P2：向 MobaXterm 靠拢

- 服务器资产树
- 环境分组
- 会话模板
- 批量执行
- 远程文件双栏
- X11
- 宏与片段

## 14. 风险点与应对

### 14.1 高风险：当前代码默认 pane 一定有本地路径

风险：

- 各类目录校验会阻断 SSH
- Git watcher 会误执行
- `openFolder/openInIDE` 会误显示
- `projectConfigWatcher` 不适用于 SSH

应对：

- 引入 capability 机制
- 所有本地路径相关逻辑按 backend 分流
- 对 SSH pane 禁用本地目录守卫和项目配置 watcher

### 14.2 高风险：`pid` 语义不再可靠

风险：

- SSH channel 无法自然映射为 OS pid
- 当前部分状态和生命周期逻辑以 pid 为主键

应对：

- 引入 `sessionId`
- `pid` 仅保留为本地后端兼容字段
- 新逻辑统一用 `sessionId + paneId`

### 14.3 高风险：敏感信息泄漏到 autosave

风险：

- workspace 保存密码
- passphrase 泄漏

应对：

- 设计上禁止敏感字段进入 workspace
- 所有敏感字段只进 vault
- 对保存链路加单测

### 14.4 中风险：远程 cwd 无法准确获取

风险：

- SSH pane 分屏体验差
- 重连后目录不一致

应对：

- 首版接受 fallback
- 第二阶段补 shell integration

### 14.5 中风险：跨平台依赖与打包

风险：

- SSH 库与 Electron 打包不稳定
- Windows/macOS/Linux 行为不一致

应对：

- 优先选纯 JS / Electron 兼容方案
- 先打通 macOS / Windows 主链路
- 加入 CI 打包验证

### 14.6 中风险：直接引入 Tabby 代码耦合太深

风险：

- 维护成本高
- 升级困难

应对：

- 只参考协议层逻辑
- 自建适配层
- 避免把 Angular / Tabby Core 代码直接落入主仓

## 15. 推荐实施路径

### 阶段一：架构铺底

- 扩展 `Pane` 数据结构，加入 backend 标识
- 为会话管理引入统一 session 抽象
- 把现有本地 PTY 包装成统一 session
- 梳理所有本地路径强依赖点
- 引入 capability 判断

交付结果：

- 不改 UI 外观，但底层已具备接 SSH 的技术基础

### 阶段二：SSH 主链路

- 引入 SSH profile 存储
- 引入 vault
- 实现 SSH backend
- 实现 host key 校验
- 实现 SSH 卡片创建与编辑
- 实现 SSH 连接进入现有终端页
- 实现 SSH pane 分屏

交付结果：

- 可稳定使用的 SSH 终端能力

### 阶段三：专业增强

- 端口转发 UI
- SFTP 面板
- 会话复用优化
- 最近连接与收藏
- 状态条与延迟指标
- 错误诊断与重连

交付结果：

- 接近专业 SSH 工具体验

## 16. 里程碑建议

### 里程碑 M1：底层抽象完成

- session abstraction 完成
- local backend 迁移完成
- capability 模型完成
- 单测通过

### 里程碑 M2：SSH MVP 完成

- SSH profile CRUD
- 连接成功
- host key 校验
- 基本认证方式完成
- SSH 卡片接入
- 终端页融合完成

### 里程碑 M3：专业能力完成

- 端口转发
- SFTP
- 会话复用
- 重连
- 标签与收藏

## 17. 测试策略

### 17.1 单元测试

- SSH profile 序列化与迁移
- workspace 不泄漏敏感信息
- capability 计算
- session manager 生命周期
- SSH multiplexer key 生成

### 17.2 集成测试

- 创建 SSH 卡片
- 点击卡片进入终端
- SSH pane 分屏
- SSH 与本地混合分屏
- host key 首次确认
- 认证失败提示
- 工作区恢复

### 17.3 手工测试矩阵

- Windows
- macOS
- Linux
- 密码认证
- 私钥认证
- agent 认证
- keyboard-interactive
- jump host
- 断网重连
- known_hosts 变更

## 18. 最终建议

基于当前代码结构，最优方案不是“把 Tabby 搬进来”，而是：

- 以现有项目为主架构
- 参考 Tabby 的 SSH 协议能力与实现细节
- 重建一个适配当前 Electron + React 体系的 SSH backend
- 把 SSH 建模为与本地终端并列的终端后端

这是唯一能同时满足以下目标的路线：

- 与当前本地终端完美融合
- 支持分屏和窗口组
- 首页使用 SSH 卡片呈现
- 逐步演进到专业 SSH 工具
- 保持当前项目的可维护性

## 19. 下一步实施建议

建议按以下顺序进入研发：

1. 先做“统一会话抽象 + Pane backend 建模”的底层改造
2. 再做“SSH profile / vault / known_hosts / SSH backend”
3. 然后接入“SSH 卡片 + 终端页 + 分屏”
4. 最后补“端口转发 / SFTP / 重连 / 专业增强”

如果进入实施阶段，下一份文档建议拆为：

- `docs/ssh-data-model-design.md`
- `docs/ssh-main-process-architecture.md`
- `docs/ssh-ui-flow.md`
- `docs/ssh-implementation-roadmap.md`

