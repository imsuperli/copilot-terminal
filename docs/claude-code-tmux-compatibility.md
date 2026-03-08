# Claude Code Agent Teams 的 tmux 兼容清单与落地方案

## 文档目的

本文档用于回答两个问题：

1. 为了兼容 Claude Code 的 `agent teams` / `tmux teammate mode`，本项目到底需要兼容哪些 `tmux` 命令。
2. 本项目应当如何在现有 Electron + xterm.js + node-pty 架构上实现这层兼容能力，以及会对现有功能产生什么影响。

## 结论

- 本项目**不需要实现完整 tmux**。
- 本项目需要实现的是一层 **tmux command shim / compatibility layer**，只兼容 Claude Code 当前真实会调用到的那部分命令。
- 如果目标是“用户在本软件的 pane 中运行 `claude`，Claude 自动创建团队并把当前界面切成左 leader / 右多个 teammate pane”，则需要：
  - 让 Claude 进程认为自己运行在 tmux 环境中。
  - 让 Claude 调用到的 `tmux` 命令被本软件接管。
  - 将这些 `tmux` 命令转换为本软件自己的 pane / layout / process 操作。

## 信息来源

- 本清单基于本地已安装的 `@anthropic-ai/claude-code` 包实际代码梳理。
- 本地版本：`2.1.63`
- 主要来源文件：`node_modules/@anthropic-ai/claude-code/cli.js`

## 范围划分

为了避免“全部支持”这个目标失控，必须先划分范围：

- **P0：Agent Teams 当前窗口内分屏核心能力**
  - 支持当前 pane 里正在运行的 Claude 自动拉起 teammates。
  - 支持左 leader、右 teammates 的布局。
  - 支持每个 teammate pane 独立输入与对话。
- **P1：Pane 样式与状态能力**
  - 支持 pane 标题、边框色、边框状态。
- **P2：外部 swarm session 能力**
  - 支持 Claude 不在“当前窗口内分屏”，而是在单独的 tmux session / window 中组织 teammates。
- **P3：Pane hide/show 能力**
  - 支持 break/join 这种“隐藏 pane / 重新挂回 pane”的模式。
- **P4：其他 tmux 工作流能力**
  - 包括 worktree / attach / switch session 等，不是 agent teams 当前窗口内分屏的核心路径。

如果只做“当前软件内自动分屏的 agent teams”，建议先做 P0 + P1，P2/P3/P4 作为后续阶段。

## 真实 tmux 命令清单

下面列出的命令均是在本地 `claude-code` 包中真实看到的调用，按功能分组。

### P0：Agent Teams 当前窗口内分屏核心命令

#### 1. `tmux -V`

- 用途：检测 tmux 是否可用。
- 最低兼容要求：
  - 命令返回 `exit code 0`
  - `stdout` 返回任意合法版本串即可，例如 `tmux 3.4`
- 备注：这是 shim 的最基本健康检查接口。

#### 2. `tmux display-message -p #{pane_id}`

- 用途：获取当前 pane id。
- 期望输出：当前 pane id，例如 `%1`
- 最低兼容要求：
  - 支持 `-p`
  - 支持格式串 `#{pane_id}`

#### 3. `tmux display-message -t <pane> -p #{session_name}:#{window_index}`

- 用途：获取当前 pane 所属 window target。
- 期望输出：`<session>:<index>`，例如 `ausome:0`
- 最低兼容要求：
  - 支持 `-t <target>`
  - 支持格式串 `#{session_name}:#{window_index}`

#### 4. `tmux list-panes -t <target> -F #{pane_id}`

- 用途：列出某个 window 内的 pane。
- 期望输出：一行一个 pane id。
- 最低兼容要求：
  - 支持 `-t <target>`
  - 支持 `-F #{pane_id}`

#### 5. `tmux split-window -t <target> -h -l 70% -P -F #{pane_id}`

- 用途：第一次创建 teammate pane，把 leader 和 teammate 拆成左右布局。
- 期望输出：新 pane id。
- 最低兼容要求：
  - 支持 `split-window`
  - 支持 `-t`
  - 支持 `-h`
  - 支持 `-l 70%`
  - 支持 `-P -F #{pane_id}`

#### 6. `tmux split-window -t <target> -v -P -F #{pane_id}`

#### 7. `tmux split-window -t <target> -h -P -F #{pane_id}`

- 用途：后续创建 teammate pane，按 Claude 自己的布局算法继续右侧分裂。
- 期望输出：新 pane id。
- 最低兼容要求：
  - 支持 `-v` / `-h`
  - 支持 `-P -F #{pane_id}`

#### 8. `tmux select-layout -t <target> main-vertical`

- 用途：把当前 window 重排为“左 leader / 右 teammates”的主从布局。
- 最低兼容要求：
  - 支持 `main-vertical`
  - 对应到本软件内部时，必须把 layout 重新组织成左一列 + 右多列/多行的树形布局

#### 9. `tmux resize-pane -t <pane> -x 30%`

- 用途：把 leader pane 宽度固定到约 30%。
- 最低兼容要求：
  - 支持 `-x 30%`
  - 对应到本软件内部时，必须真正修改 layout size，而不是只改前端临时状态

#### 10. `tmux send-keys -t <pane> <command> Enter`

- 用途：向新 pane 写入启动命令，真正拉起 teammate Claude 进程。
- 最低兼容要求：
  - 支持 `-t`
  - 支持文本写入
  - 支持 `Enter` 键
- 实现注意：
  - 这里不是“直接 spawn Claude”那么简单，因为 Claude 传进去的是一整段 shell 命令。
  - 典型命令形态是：
    - `cd <cwd> && env ... <claude_executable> --agent-id ... --team-name ...`
  - 所以最稳妥的实现是：目标 pane 先运行 shell，再把完整命令文本写进去，最后补一个回车。

#### 11. `tmux kill-pane -t <pane>`

- 用途：关闭 teammate pane。
- 最低兼容要求：
  - 关闭 pane 对应的 PTY 与进程
  - 更新布局树
  - 更新活动 pane

### P1：Pane 样式与状态命令

#### 12. `tmux select-pane -t <pane> -P bg=default,fg=<color>`

- 用途：设置 pane 的选中/边框颜色。
- 最低兼容要求：
  - 可以不完全模拟 tmux 样式语法
  - 但必须能把颜色映射到 pane UI 元数据

#### 13. `tmux select-pane -t <pane> -T <title>`

- 用途：设置 pane 标题。
- 最低兼容要求：
  - 把 title 持久化到 pane metadata
  - 在 pane header / 边框中可见

#### 14. `tmux set-option -p -t <pane> pane-border-style fg=<color>`

#### 15. `tmux set-option -p -t <pane> pane-active-border-style fg=<color>`

#### 16. `tmux set-option -p -t <pane> pane-border-format #[fg=<color>,bold] #{pane_title} #[default]`

#### 17. `tmux set-option -w -t <window> pane-border-status top`

- 用途：设置 pane 边框显示方式、边框标题与窗口级边框状态。
- 最低兼容要求：
  - 可以做成“兼容语义”而不是完整 tmux 渲染器
  - 也就是：
    - `pane-border-status top` -> 我们显示顶部 pane header
    - `pane-border-format ... #{pane_title}` -> 我们渲染 pane title
    - 颜色参数 -> 我们渲染 header / border color

### P2：外部 swarm session 命令

这组命令用于 Claude 不在“当前 pane 所在窗口里分屏”，而是在单独 tmux session 中组织 teammates。若本项目第一阶段只支持当前窗口内分屏，这组命令可以延期。

#### 18. `tmux -L <socket> has-session -t <session>`

- 用途：检查 swarm session 是否存在。
- 最低兼容要求：
  - 支持全局参数 `-L <socket>`
  - 支持基于 session name 的查询

#### 19. `tmux -L <socket> new-session -d -s <session> -n <window> -P -F #{pane_id}`

- 用途：创建外部 swarm session 的初始 window 和 pane。
- 期望输出：初始 pane id。

#### 20. `tmux -L <socket> list-windows -t <session> -F #{window_name}`

- 用途：列出 session 里的 window。
- 期望输出：一行一个 window name。

#### 21. `tmux -L <socket> new-window -t <session> -n <window> -P -F #{pane_id}`

- 用途：在已有 session 中创建新的 swarm view window。
- 期望输出：新 pane id。

#### 22. `tmux -L <socket> list-panes -t <target> -F #{pane_id}`

#### 23. `tmux -L <socket> split-window -t <target> (-v|-h) -P -F #{pane_id}`

#### 24. `tmux -L <socket> select-layout -t <target> tiled`

- 用途：外部 swarm session 里，teammates 常用 `tiled` 布局而不是 `main-vertical`。

### P3：Pane hide/show 命令

#### 25. `tmux new-session -d -s <hidden_session>`

- 用途：创建隐藏容器 session。

#### 26. `tmux break-pane -d -s <pane> -t <hidden_session>:`

- 用途：把 pane 从当前窗口拆出去，挂到隐藏 session。

#### 27. `tmux join-pane -h -s <pane> -t <window>`

- 用途：把隐藏 pane 重新加入目标 window。

#### 28. `tmux select-layout -t <window> main-vertical`

#### 29. `tmux resize-pane -t <pane> -x 30%`

- 用途：重新挂回后恢复 leader / teammates 布局。

### P4：其他相关 tmux 命令

这组不是当前窗口内分屏 agent teams 的核心，但在 Claude Code 包里真实存在，通常与 worktree / 会话切换流程有关。

#### 30. `tmux kill-session -t <session>`

- 用途：销毁整个 tmux session。

#### 31. `tmux switch-client -t <session>`

- 用途：把当前 tmux client 切到某个 session。

#### 32. `tmux attach-session -t <session>`

- 用途：附着到某个 tmux session。

## 需要兼容的输出与退出码规范

tmux shim 除了“命令名兼容”，还必须兼容下面这些行为：

### 1. pane / session / window 标识符风格

- pane id 建议模拟 tmux 风格：`%1`、`%2`、`%3`
- session 建议使用字符串名：`ausome`、`swarm` 等
- window target 建议兼容：
  - `<session>:<index>`
  - `<session>:<windowName>`

### 2. 常用 format 字段

最低要识别：

- `#{pane_id}`
- `#{session_name}:#{window_index}`
- `#{window_name}`

### 3. `-P -F #{pane_id}`

凡是创建 pane 的命令，只要 Claude 带了 `-P -F #{pane_id}`，就必须：

- `stdout` 输出新 pane id
- `exit code = 0`

### 4. 错误处理

- 成功：`exit code = 0`
- 失败：`exit code != 0`
- `stderr` 里给出简短错误信息

### 5. 全局参数 `-L <socket>`

- 即使本项目内部不使用真实 tmux socket，也必须能解析 `-L`
- 推荐把 `-L <socket>` 当成“命名空间 / 虚拟 session domain”处理

## 本项目推荐实现方案

## 总体思路

不要在本项目里接入真正 tmux，而是实现三层：

1. **fake tmux executable**
   - 一个被放到 `PATH` 前面的 `tmux` shim。
   - Claude 调用 `tmux` 时，实际执行的是我们的 shim。
2. **TmuxCompatService**
   - 主进程中的兼容服务，负责解析和执行 tmux 子命令。
3. **Pane/Layout/Process adapters**
   - 把 tmux 语义映射到现有 pane、layout、PTY、window 状态系统。

## 为什么必须做 fake tmux executable

因为 Claude Code 不是通过 API 调我们的应用，它是直接执行 shell 命令：

- `tmux split-window ...`
- `tmux send-keys ...`
- `tmux select-layout ...`

所以我们的系统必须在命令行层面接住这些调用。

## 启动链路设计

### 1. 当 pane 启动 shell 时注入环境变量

为每个 pane 的 shell 注入：

- `AUSOME_TERMINAL_WINDOW_ID=<windowId>`
- `AUSOME_TERMINAL_PANE_ID=<paneId>`
- `AUSOME_TMUX_RPC=<named-pipe-or-local-socket>`
- `TMUX=<fake-value>`
- `TMUX_PANE=<paneId-like-%1>`

说明：

- `TMUX` / `TMUX_PANE` 是为了让 Claude Code 误以为自己运行在 tmux 里。
- 没有这两个变量，Claude 可能不会走当前窗口内 tmux teammate 路径。

### 2. 把 fake tmux 放到 PATH 前面

当用户在 pane 中执行 `claude` 时，Claude 以后再执行 `tmux ...`，命中的应该是我们的 shim，而不是系统真实 tmux。

推荐做法：

- 在应用 resources 下提供：
  - Windows：`tmux.cmd` 或 `tmux.exe`
  - macOS/Linux：`tmux`
- 在启动 shell / pane 时，把该目录 prepend 到 `PATH`

### 3. fake tmux 通过 RPC 请求主进程

fake tmux 不直接改 UI，而是把请求转给主进程兼容服务，例如：

```json
{
  "argv": ["split-window", "-t", "%1", "-h", "-l", "70%", "-P", "-F", "#{pane_id}"],
  "windowId": "win-1",
  "paneId": "%1",
  "namespace": "default"
}
```

主进程返回：

```json
{
  "exitCode": 0,
  "stdout": "%2\n",
  "stderr": ""
}
```

### 4. 主进程服务把 tmux 语义映射到现有架构

映射关系建议如下：

- `display-message` -> 查询当前 pane / window 元数据
- `list-panes` -> 从 layout 树里取 pane 列表
- `split-window` -> 创建新 pane + spawn shell PTY + 返回 pane id
- `select-layout main-vertical` -> 改写 layout 树与 sizes
- `select-layout tiled` -> 生成平铺布局树
- `resize-pane` -> 修改 layout size
- `send-keys` -> 向目标 pane 的 PTY 写文本 + 回车
- `kill-pane` -> 关闭 pane 与 PTY
- `select-pane -T/-P` / `set-option` -> 修改 pane 的 UI metadata

## 结合当前代码，具体要改什么

## 一、进程层

现状：

- `ProcessManager` 当前会创建 shell PTY，但 `config.command` 在真实 PTY 路径里没有真正执行。
- `config.env` 也没有合并进 `cleanEnv`。

相关文件：

- `src/main/services/ProcessManager.ts`
- `src/main/types/process.ts`

必须调整：

1. 让 pane shell 的环境变量可控。
2. 真正把 `env` 合并进 PTY 环境。
3. 为所有 pane 注入 fake tmux 所需环境变量。
4. 为 shell 注入 shim PATH。

影响：

- 这是现有终端启动链路的基础变更。
- 任何 pane 的环境都会受到影响，因此必须加功能开关，避免误伤普通终端场景。

## 二、布局层

现状：

- layout 树里有 `sizes`，但 `SplitLayout` 组件内部又维护了自己的本地 `sizes` 状态。
- 当前拖拽调整大小不会回写 store。

相关文件：

- `src/shared/types/window.ts`
- `src/renderer/components/SplitLayout.tsx`
- `src/renderer/stores/windowStore.ts`

必须调整：

1. 新增 store 级 layout 操作：
   - `applyMainVerticalLayout(windowId)`
   - `applyTiledLayout(windowId)`
   - `resizePaneToRatio(windowId, paneId, ratio)`
   - `movePane(windowId, paneId, targetGroup)`
2. `SplitLayout` 改成完全受 store 驱动，而不是本地临时 sizes。
3. `select-layout` 和 `resize-pane` 都必须更新 store，并触发持久化。

影响：

- 这是对现有分屏逻辑影响最大的地方。
- 如果不把布局状态收口到 store，tmux shim 根本没法可靠控制布局。

## 三、pane 元数据层

现状：

- Pane 结构里只有 `cwd`、`command`、`status`、`pid` 等基础字段。
- 没有 pane title、pane border style、agent name、team name、agent color。

相关文件：

- `src/shared/types/window.ts`
- `src/renderer/components/TerminalPane.tsx`

必须调整：

建议为 `Pane` 增加：

- `title?: string`
- `borderColor?: string`
- `teamName?: string`
- `agentId?: string`
- `agentName?: string`
- `agentColor?: string`
- `teammateMode?: 'tmux' | 'in-process' | 'auto'`

影响：

- 现有 pane UI 需要补一个轻量 header 区，展示标题与颜色。
- 这也是 `set-option` / `select-pane -T/-P` 的落地点。

## 四、tmux 兼容服务层

这是新功能的核心新增模块，建议新增：

- `src/main/services/TmuxCompatService.ts`
- `src/main/services/TmuxCommandParser.ts`
- `src/shared/types/tmux.ts`

职责：

- 解析 shim 传来的 `argv`
- 管理虚拟 session / window / pane namespace
- 调用现有 `ProcessManager`、`windowStore` 对应能力
- 返回 tmux 风格 stdout / stderr / exit code

影响：

- 主进程会新增一套长期驻留服务。
- 需要处理并发命令与顺序一致性，特别是 `split-window` 后马上 `send-keys` 的情况。

## 五、shim 可执行文件

建议新增：

- `resources/bin/tmux` 或平台对应包装器

职责：

- 接收命令行参数
- 读取 `AUSOME_TMUX_RPC`、`AUSOME_TERMINAL_WINDOW_ID`、`AUSOME_TERMINAL_PANE_ID`
- 发起本地 RPC
- 把结果原样写到 stdout / stderr
- 用返回的 `exitCode` 退出

影响：

- 打包时要把 shim 带进安装包。
- Windows、macOS、Linux 都要各自考虑启动方式。

## 为什么 `send-keys` 不能偷懒

Claude 不是只发“启动一个 agent”这个抽象动作，而是发一整段 shell 命令。

所以 `send-keys` 必须尽量保留 tmux 语义：

- 向目标 pane 的 shell 写入完整文本
- 再写一个回车

如果把它改成“直接 spawn 一个新进程”，会带来问题：

- `cd <cwd>` 不生效
- `env A=B C=D command ...` 这种 shell 语义丢失
- 命令拼接与 quoting 容易失真

因此，最稳的实现是：

- `split-window` 创建新 pane 时先启动 shell
- `send-keys` 再向这个 shell 注入命令

## 对现有功能的影响

## 1. 对普通终端功能的影响

- 如果全局启用 fake tmux，用户在 pane 里自己手动输入 `tmux`，执行到的将是我们的 shim，而不是系统 tmux。
- 这会改变用户预期。

建议：

- 增加设置项：`Enable Claude tmux compatibility`
- 仅在开启后，为 pane 注入 fake tmux 环境
- 或仅对“Claude 专用窗口 / pane”注入 fake tmux PATH

## 2. 对分屏功能的影响

- 当前分屏更多是“用户驱动 split”，tmux 兼容后会新增“程序驱动 split / layout mutation”。
- 这要求分屏系统从“UI 组件本地状态”升级成“store / service 可编程状态”。

风险：

- 若仍保留本地 `sizes` 作为真相来源，tmux 命令与前端状态可能打架。

## 3. 对窗口恢复与自动保存的影响

- pane title、agent metadata、layout mode、layout sizes 都要进入 workspace 持久化。
- 恢复工作区时，要能恢复 team pane 的外观与逻辑结构。

风险：

- 旧工作区数据结构需要兼容升级。

## 4. 对进程管理的影响

- 会新增一类“由 Claude 经 tmux shim 间接创建”的 pane 进程。
- 这些 pane 不是用户直接点 split 创建的，但本质仍然是 PTY。

风险：

- orphan process 清理、pane close、window delete 时要保证一起收敛。

## 5. 对跨平台的影响

- 你的项目明显有 Windows 适配逻辑，因此 fake tmux 比接真 tmux 更合适。
- 但各平台的 shim 启动方式、PATH 注入、IPC 通道实现不同，需要单独处理。

## 推荐分阶段实施

### 第一阶段：只做当前窗口内的 team pane

目标：

- Claude 在当前 pane 中运行
- 自动 split 当前窗口
- 左 leader / 右 teammates
- 每个 teammate 独立对话

实现范围：

- `-V`
- `display-message`
- `list-panes`
- `split-window`
- `select-layout main-vertical`
- `resize-pane`
- `send-keys`
- `kill-pane`
- `select-pane`
- `set-option`

### 第二阶段：补外部 session / tiled / hide/show

实现范围：

- `-L`
- `has-session`
- `new-session`
- `list-windows`
- `new-window`
- `select-layout tiled`
- `break-pane`
- `join-pane`

### 第三阶段：补 worktree / attach / switch 等周边能力

实现范围：

- `kill-session`
- `switch-client`
- `attach-session`

## 现阶段的关键判断

- 若目标只是“复现 Claude 在 tmux 中的 team pane 自动分屏体验”，本项目**可以做**。
- 但要接受一个事实：这不是“改几个命令就好”，而是要在现有终端系统上增加一层 **tmux 兼容抽象层**。
- 真正的根本工作不在 `tmux` 命令解析本身，而在：
  - 布局状态中心化
  - pane 元数据扩展
  - shell 环境注入
  - 进程与 pane 生命周期一致性

## 建议的最终实现原则

- **兼容 Claude 会用到的 tmux 命令，不追求完整 tmux。**
- **让 tmux shim 成为协议入口，让主进程服务成为唯一真相来源。**
- **让布局、pane 元数据、进程生命周期都落在现有 store / service，而不是散落在 UI 组件里。**

