# Claude Code Agent Teams tmux 模拟开发指南

本文档面向后续维护者，说明在 `copilot-terminal` 中模拟 `tmux` 以兼容 `Claude Code Agent Teams` 的完整开发方案、实现原理、关键数据流、Windows 适配细节、调试方法与踩坑经验。

这份文档关注的是“怎么做出来、为什么这么做、哪里容易出问题”；命令清单与兼容面范围可配合 `docs/claude-code-tmux-compatibility.md` 一起看。

## 1. 背景与问题定义

`Claude Code` 的 `agent teams` / `tmux teammate mode` 默认假设自己运行在真实 `tmux` 环境中。它会：

- 检测 `tmux -V`
- 读取当前 pane / session / window 信息
- 调用 `split-window` 创建 teammate panes
- 调用 `send-keys` 在新 pane 中启动各个 agent
- 调用 `select-layout`、`resize-pane`、`select-pane`、`set-option` 调整布局和样式

但 `copilot-terminal` 的实际架构是：

- Electron 主进程
- 渲染进程中的 xterm.js
- 主进程里的 node-pty / ConPTY
- 自定义窗口/窗格布局，而不是真实 tmux

因此核心问题不是“实现一个完整 tmux”，而是：

> 让 Claude Code 误以为自己正在操作 tmux，同时把它发出的 tmux 命令转译成我们自己的 pane / layout / process 操作。

## 2. 设计目标

### 2.1 目标

- 支持在当前终端窗格中启动 `Claude Code Agent Teams`
- 支持 leader + 多个 teammate pane 的自动创建与布局调整
- 支持各 teammate pane 的独立输入、独立输出、独立标题/颜色
- 支持 Windows 环境下无真实 tmux 的运行模式
- 尽量少侵入现有终端架构

### 2.2 非目标

- 不实现完整 tmux 终端复用器
- 不追求兼容所有 tmux 子命令
- 不模拟 tmux server/client 的全部状态机
- 不替代 Claude Code 内部 task 管理逻辑

## 3. 整体方案概览

整体方案可以概括为 4 层：

1. **环境伪装层**：给 PTY 注入 `TMUX`、`TMUX_PANE`、`AUSOME_TMUX_RPC` 等变量，让 Claude Code 认为自己在 tmux 中。
2. **命令劫持层**：把 `tmux` 命令解析到我们自己的 `tmux-shim.js`。
3. **RPC 桥接层**：`tmux-shim` 不直接处理命令，而是通过 named pipe / Unix socket 把请求发回 Electron 主进程。
4. **兼容实现层**：主进程中的 `TmuxCompatService` 解析并执行这些“伪 tmux 命令”，最终映射到现有的 pane/layout/process 能力上。

## 4. 核心架构

### 4.1 关键模块

- `src/main/services/ProcessManager.ts`
  - 负责 PTY 创建
  - 注入 tmux 兼容环境变量
  - 确保 tmux RPC server 已启动
  - 注入 fake tmux 到 `PATH` / `Path`

- `resources/bin/tmux-shim.js`
  - 伪装成 `tmux` 可执行命令
  - 处理 `tmux -V` 快速路径
  - 其余命令通过 RPC 发给主进程
  - 支持文件日志，便于脱离 DevTools 调试

- `src/main/services/TmuxRpcServer.ts`
  - 为每个 window 建立一个 RPC server
  - Windows 用 named pipe，Unix 用 local socket
  - 接收 `tmux-shim` 请求并回传 JSON 响应

- `src/main/services/TmuxCompatService.ts`
  - tmux 兼容核心
  - 解析命令、维护 pane/session/window 映射
  - 把 tmux 命令翻译成应用自己的布局与进程操作
  - 处理 Windows 下 `send-keys` 启动命令转译

- `src/main/services/TmuxCommandParser.ts`
  - 负责把 `tmux` 命令参数解析成统一结构

- `src/renderer/stores/windowStore.ts`
  - 负责渲染层布局状态同步

- `src/renderer/components/TerminalPane.tsx`
  - 根据 pane metadata 显示 agent 名称、颜色、标题等

### 4.2 调用链

```text
Claude Code
  -> 调用 tmux <args>
  -> 命中 resources/bin/tmux-shim.js
  -> 读取 AUSOME_TMUX_RPC / TMUX_PANE / windowId
  -> 通过 named pipe / socket 发 RPC
  -> TmuxRpcServer 收到请求
  -> TmuxCompatService 执行兼容逻辑
  -> 调用 ProcessManager / 更新 windowStore / 发送 renderer 事件
  -> 返回 stdout / stderr / exitCode 给 tmux-shim
  -> Claude Code 继续执行下一步
```

## 5. 环境变量设计

启动兼容模式后，会向 PTY 注入以下关键变量：

- `TMUX`
  - 作用：让 Claude Code 认定当前运行在 tmux 环境中
  - Windows 示例：`\\.\pipe\ausome-tmux-default,<pid>,0`

- `TMUX_PANE`
  - 作用：当前 pane 的伪 tmux pane id
  - 示例：`%1`、`%3`

- `AUSOME_TERMINAL_WINDOW_ID`
  - 作用：应用内部 window id

- `AUSOME_TERMINAL_PANE_ID`
  - 作用：应用内部 pane id

- `AUSOME_TMUX_RPC`
  - 作用：tmux-shim 与主进程通信的 RPC 地址
  - Windows 为 named pipe，Unix 为 socket

- `AUSOME_TMUX_LOG_FILE`
  - 作用：日志文件路径

- `AUSOME_TMUX_DEBUG`
  - 作用：开启更详细调试

## 6. 为什么要“按窗口”启动 RPC server

一个重要设计点是：**RPC server 按 window 粒度创建，而不是全局单例**。

原因：

- Claude Code 的 tmux 操作天然围绕“当前窗口”展开
- 同一个应用中可能同时存在多个独立工作窗口
- 用 `windowId` 切分后，路由更简单，隔离更清晰
- 可以通过 `AUSOME_TMUX_RPC` 精确定位到当前窗口上下文

对应实现：

- `ProcessManager.spawnTerminal()` 在创建 PTY 前调用 `ensureTmuxRpcServer`
- `TmuxCompatService.ensureRpcServer(windowId)` 保证重复调用时不会破坏已有 server

这是一个关键点：

> 仅仅把 `AUSOME_TMUX_RPC` 注入到环境里是不够的，主进程必须真的先 `listen` 起来。

## 7. pane / window / session 的映射策略

我们并没有真实 tmux，因此需要建立一层“伪 tmux 标识”到真实应用对象的映射。

### 7.1 pane 映射

- 对外暴露：`%1`、`%2`、`%3`
- 对内真实对象：`windowId + paneId`

维护两张表：

- `tmuxPaneId -> { windowId, paneId }`
- `{ windowId, paneId } -> tmuxPaneId`

这样可以：

- 让 Claude Code 持续使用稳定的 `%n` pane id
- 让我们在内部继续使用 UUID 风格 pane id

### 7.2 session / window 映射

Claude Code 需要 `session_name`、`window_index`、`window_name` 等信息。

实现原则：

- 对 Claude 暴露“足够像 tmux”的 session/window 视图
- 不强求完全复刻 tmux 内部结构
- 只保证 Claude 当前用到的格式字段与命令能工作

## 8. tmux-shim 的职责边界

`tmux-shim.js` 应该做得尽量薄，只负责：

- 读取环境变量
- 把参数打包成 RPC 请求
- 把响应回显给 stdout/stderr
- 处理极少数无需 RPC 的快速路径，例如 `tmux -V`

不建议把复杂业务逻辑放在 shim 里，原因：

- shim 在每次命令调用时都会重新启动
- 调试困难
- 状态管理不适合放在独立短生命周期进程里
- 主进程里更容易获取 window/pane/store/process 上下文

## 9. 兼容层的命令语义

当前实现的重点不是“命令名匹配”，而是“语义兼容”。

例如：

- `split-window`
  - 语义：创建新 pane，并插入当前布局树

- `select-layout`
  - 语义：把当前布局切换为 `main-vertical`、`tiled` 等近似布局

- `send-keys`
  - 语义：向目标 pane 的 PTY 写入命令串

- `select-pane -T`
  - 语义：设置 pane 标题

- `set-option pane-border-style`
  - 语义：设置 pane 边框/标题颜色

关键经验：

> 只要 Claude Code 看到的“结果”符合预期，就没必要 1:1 复制 tmux 的所有内部行为。

## 10. send-keys 是最关键、也最容易出问题的部分

`send-keys` 是 Agent Teams 真正“拉起 teammate”的关键命令。

Claude Code 在类 Unix 环境里通常会发出类似命令：

```bash
cd <cwd> && env KEY=VALUE ... <claude_executable> --agent-id ... --team-name ...
```

在 Windows 下如果直接把这串字符串原样写进 PowerShell/cmd，通常会失败，因此必须转译。

### 10.1 转译策略

当前逻辑会在 Windows 下识别这类 Unix 风格命令，并根据 shell 类型转成：

- PowerShell：
  - `Set-Location -LiteralPath ...`
  - `$env:FOO='bar'`
  - `& 'node' '...cli.js' ...`

- cmd：
  - `cd /d ...`
  - `set FOO=bar`
  - `node ...cli.js ...`

### 10.2 为什么要额外补环境变量

在 teammate 启动链路里，除了 Claude 原本带的 env 之外，我们还会额外补：

- `TMUX`
- `TMUX_PANE`
- `AUSOME_TERMINAL_WINDOW_ID`
- `AUSOME_TERMINAL_PANE_ID`
- `AUSOME_TMUX_RPC`
- `AUSOME_TMUX_LOG_FILE`

原因是：

- 新创建的 teammate pane 需要继承自己的 tmux 视角
- 后续它自己也会继续调用 `tmux`
- 如果没有这些 env，它会在第二跳调用时失去上下文

## 11. Windows 适配的几个关键坑

### 11.1 PATH 与 Path 要同时写

Windows 环境变量大小写不完全等价，很多程序实际读取的是 `Path` 而不是 `PATH`。

因此注入 fake tmux 目录时要同时写：

- `PATH`
- `Path`

否则会出现：

- 在某些 shell / 某些启动方式下 `tmux -V` 找不到
- 手工改 `$env:PATH` 有效，但应用启动的 pane 里无效

### 11.2 named pipe 字符串转义极其容易写错

Windows 命名管道运行时必须长成：

```text
\\.\pipe\ausome-tmux-<windowId>
```

在 TypeScript/JavaScript 字符串字面量中，反斜杠要再转义一层。

一个典型坑是：

- 代码里看起来像对的
- 运行时却变成 `\.pipe...`
- 最终表现为 `connect ENOENT` 或 `listen EACCES`

经验：

- 不只看源码字符串，要看**运行时日志里的真实值**
- 最好给 `TmuxRpcServer.getSocketPath()` 和环境注入做回归测试

### 11.3 `.js` 入口不能直接当可执行文件跑

这是 Windows 下最隐蔽的坑之一。

Claude teammate 的启动命令里，实际可执行入口可能是：

```text
...\@anthropic-ai\claude-code\cli.js
```

如果 PowerShell 直接执行：

```powershell
& '...\cli.js' ...
```

Windows 可能会按系统文件关联去“打开这个 js 文件”，而不是用 Node 执行它。表现就是：

- 弹出多个文本编辑器窗口
- pane 中只打印启动命令，然后立刻回到提示符
- agent 实际上根本没有启动

正确做法是：

```powershell
& 'node' '...\cli.js' ...
```

因此现在的 Windows 转译逻辑中，遇到 `.js` / `.cjs` / `.mjs` 会强制显式用 `node` 启动。

### 11.4 `tmux` 能跑并不代表 Agent Teams 一定能跑

很多时候你会看到：

- `tmux -V` 正常
- `TMUX_PANE` 也正常

但团队创建仍失败。原因通常是：

- RPC server 没有真正启动
- 新 teammate pane 的启动命令没有继承 tmux 环境
- Windows 命令转译错误

所以排障不要只停留在“tmux 命令存在”。

## 12. 为什么日志必须落文件，而不是只看控制台

实际排障中，很多关键链路发生在：

- 被创建出来的 teammate 子进程
- fake tmux shim 进程
- Electron 主进程

这些日志不一定稳定出现在主进程/渲染进程 DevTools 里，因此必须让：

- `tmux-shim.js`
- `TmuxCompatService`

都支持写同一个文件日志，例如：

```text
%TEMP%\copilot-terminal-tmux-debug.log
```

这样才能把一次完整失败路径串起来看。

## 13. 推荐的调试思路

### 13.1 先判断是哪一层坏了

建议按下面顺序定位：

1. **tmux 是否被 shim 接管**
   - `tmux -V` 是否输出 fake 版本

2. **环境变量是否注入成功**
   - `TMUX`
   - `TMUX_PANE`
   - `AUSOME_TMUX_RPC`

3. **RPC server 是否真的启动**
   - 看日志里是否有 `Starting RPC server` / `RPC server started`

4. **shim 是否真的连上 server**
   - 看是否有 `connected to RPC server`
   - 若是 `connect ENOENT`，优先怀疑 server 未启动或 pipe 路径不对

5. **send-keys 的启动命令是否正确**
   - Windows 下重点看是否显式使用 `node`

6. **pane 是否创建后立刻退出**
   - 看 `pid` 分配、PTY 输出、退出事件

### 13.2 常见症状与对应判断

#### 症状：`tmux: The term 'tmux' is not recognized`

优先检查：

- fake tmux 目录是否注入到 `PATH` / `Path`
- `tmux.autoInjectPath` 是否开启

#### 症状：`connect ENOENT \\.\pipe\...`

优先检查：

- 主进程是否在该窗口创建 PTY 前启动了 RPC server
- pipe 路径字符串是否转义正确

#### 症状：弹出 4 个文本编辑器

优先检查：

- 是否直接执行了 `cli.js`
- 是否应该改为 `node cli.js`

#### 症状：有 pane，但 pane 里无输出且立刻回到提示符

优先检查：

- `send-keys` 转译是否正确
- teammate 进程是否真正启动
- env 是否完整继承

#### 症状：`No task found with ID: moderator@...`

这个报错来自 Claude Code 自己的 task 管理逻辑，不是我们 tmux 兼容层直接抛的。

我们需要判断它是：

- Claude Code 自身的瞬时竞态
- 还是某个 teammate pane 启动失败后引发的连锁异常

## 14. 测试策略

建议分三层测试。

### 14.1 单元测试

- `tmux-shim` 参数与 RPC 协议
- `TmuxCommandParser` 解析结果
- `TmuxRpcServer` socket/path/请求处理
- `TmuxCompatService` 各命令语义

### 14.2 回归测试

重点覆盖历史踩坑：

- Windows pipe 路径格式
- `ProcessManager` 创建 PTY 前确保 RPC server 启动
- `buildTmuxEnvironment()` 与 `TmuxCompatService.getRpcSocketPath()` 一致
- Windows `.js` 入口必须走 `node`

### 14.3 集成测试

验证完整链路：

- `tmux-shim -> RPC -> TmuxCompatService`
- `split-window -> send-keys -> pane metadata -> renderer 同步`

## 15. 配置与启用方式

### 15.1 Claude Code 侧

目前需要开启实验特性：

```json
{
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
}
```

### 15.2 Copilot Terminal / 上层宿主侧

如果宿主支持分屏偏好，需要开启：

```json
{
  "preferences": {
    "tmuxSplitPanes": true
  }
}
```

### 15.3 应用自身设置

当前实现依赖应用设置中的 tmux 兼容配置：

- `tmux.enabled`
- `tmux.autoInjectPath`
- `tmux.enableForAllPanes`

其中最关键的是：

- `tmux.enabled = true`
- `tmux.autoInjectPath = true`

## 16. 现阶段实现边界

当前设计已经足以支撑 Claude Code Agent Teams 的主链路，但仍需认识到边界：

- 我们兼容的是 Claude 当前真实调用到的 tmux 子集
- 后续 Claude Code 升级后，命令集或行为可能变化
- 任何新增能力都应优先通过日志 + 命令抓取来确认真实调用，而不是猜测实现

## 17. 后续可优化项

- 为用户提供更直观的“退出分屏/关闭团队”入口
- 在 Windows 下优先解析并注入 `node.exe` 绝对路径，而非依赖 `PATH`
- 为 `send-keys` 转译增加更多 shell 方言兼容
- 增加一份“故障排查手册”面向非开发者
- 在设置页中暴露 tmux 调试开关与日志路径

## 18. 最重要的经验总结

如果只记住几条，请记住下面这些：

1. **不要实现完整 tmux，只实现 Claude 真正用到的那一小部分。**
2. **环境变量注入不是全部，RPC server 必须真实启动。**
3. **Windows 下 `PATH` 和 `Path` 都要写。**
4. **Windows named pipe 的反斜杠转义要看运行时，不要只看源码。**
5. **`.js` 入口在 Windows 下必须优先显式走 `node`。**
6. **关键日志一定要落文件，不要只依赖 DevTools。**
7. **遇到 Claude 内部 task 报错时，先区分是不是我们自己的 pane/进程没拉起来。**

## 19. 相关代码索引

- `resources/bin/tmux-shim.js`
- `src/main/services/ProcessManager.ts`
- `src/main/services/TmuxRpcServer.ts`
- `src/main/services/TmuxCompatService.ts`
- `src/main/services/TmuxCommandParser.ts`
- `src/shared/types/tmux.ts`
- `src/renderer/stores/windowStore.ts`
- `src/renderer/components/TerminalPane.tsx`
- `src/main/index.ts`

## 20. 建议阅读顺序

如果你是第一次接手这块代码，推荐按这个顺序读：

1. 本文档
2. `docs/claude-code-tmux-compatibility.md`
3. `resources/bin/tmux-shim.js`
4. `src/main/services/TmuxRpcServer.ts`
5. `src/main/services/TmuxCompatService.ts`
6. `src/main/services/ProcessManager.ts`

这样最容易先建立整体心智模型，再进入细节。
