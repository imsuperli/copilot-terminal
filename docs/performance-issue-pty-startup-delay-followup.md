# PTY 启动延迟问题跟进（2026-03-09）

## 新增发现

在阅读 `docs/performance-issue-pty-startup-delay.md` 并核对现有代码后，确认当前仍存在两个会放大启动延迟的逻辑问题：

### 1. 终端视图切换前存在额外的 3 秒等待

文件：`src/renderer/hooks/useWindowSwitcher.ts`

当窗口处于 `Paused` 状态时，`useWindowSwitcher` 会：

1. 先调用 `startWindow` 启动 PTY
2. 然后轮询 `check-pty-output`
3. 最长等待 3000ms 后才切换到终端视图

这意味着即使 PTY 已经启动，只要“输出就绪判断”不准确，用户也会被额外卡住 3 秒。

### 2. `check-pty-output` 读取了一个会被订阅流程清空的缓冲区

相关文件：
- `src/main/services/ProcessManager.ts`
- `src/main/handlers/windowHandlers.ts`

现有链路：

1. `spawnTerminal()` 初始化 `ptyOutputBuffers`
2. `start-window` 里立刻调用 `processManager.subscribePtyData()`
3. `subscribePtyData()` 会同步回放缓冲数据，然后 `delete(pid)` 清空 `ptyOutputBuffers`
4. `check-pty-output` 再去调用 `hasPtyOutput()`，但它读取的仍然是 `ptyOutputBuffers`

结果：

- 一旦主进程订阅过 PTY 数据，`hasPtyOutput()` 很容易永远返回 `false`
- `useWindowSwitcher` 就会白等完整的 3 秒超时

这比文档里记录的“IPC 早期消息监听时机”更直接地解释了“为什么总是卡 3 秒”。

### 3. `ptyDataBus` 的全局监听器会在空闲时被卸载

文件：`src/renderer/api/ptyDataBus.ts`

虽然 `App.tsx` 已经提前导入 `ptyDataBus`，但之前的实现会在最后一个 pane 取消订阅时调用 `offPtyData()`。

这会让“提前注册全局监听器”的收益只在首次进入终端时有效；用户返回卡片页后，如果此时 PTY 又产生早期输出，仍可能因为没有全局监听器而错过。

## 本次修复

### 1. 启动 PTY 后立即切换到终端视图

文件：`src/renderer/hooks/useWindowSwitcher.ts`

移除了 `check-pty-output` 的轮询等待。现在只要 `startWindow` 完成，就立刻切到终端视图，由前端总线负责承接稍后到达的输出。

### 2. 让 `ptyDataBus` 在应用生命周期内保持全局监听

文件：`src/renderer/api/ptyDataBus.ts`

保留“提前订阅 + 早期缓冲 + 订阅后回放”的模型，但不再在 pane 全部卸载时取消全局监听器。

## 修复后预期行为

1. 点击卡片恢复 `Paused` 窗口后，不再额外卡住 3 秒
2. 终端视图会尽快切换出来
3. 即使 `TerminalPane` 稍后挂载，也能收到早期 PTY 输出
4. 点击卡片后不会再被前端额外轮询逻辑阻塞

## 仍建议继续观察的点

`useConptyDll: true` 在 Windows 上仍可能引入真实的 PTY 初始化耗时；这部分会影响“提示符何时真正出现”，但它不应该再造成当前这种稳定的 3 秒 UI 卡顿。

后续如果还要继续压缩首屏时间，建议重点测量：

- `pty.spawn()` 到首次 `onData()` 的真实耗时
- `useConptyDll: true/false` 的差异
- PowerShell profile / shell integration 自身的启动成本

## 2026-03-09 本地 benchmark 结论

使用本机对 `@homebridge/node-pty-prebuilt-multiarch` 做最小复现后，确认：

- `useConptyDll: false`
  - `pwsh.exe` 大约 `600-700ms` 出现 prompt
  - `pwsh.exe -NoProfile` 仍然大约 `700ms` 出现 prompt
  - `cmd.exe` 大约 `200ms` 出现首屏
- `useConptyDll: true`
  - 会先在 `150ms` 左右收到两段很短的设备握手序列（如 `ESC [ 1 t`、`ESC [ c`）
  - 但真正的 shell banner / prompt 会推迟到 `3.2s ~ 3.7s`
  - 这个现象对 `pwsh.exe`、`pwsh.exe -NoProfile`、`cmd.exe` 都成立

这说明：

1. 问题**不在 PowerShell profile**；`-NoProfile` 也一样慢。
2. 问题**不在 React / xterm / IPC 主链路**；renderer 已经能在 100~200ms 收到前两段输出。
3. 问题更像是 `useConptyDll: true` 切到 bundled OpenConsole / conpty.dll 路径后，**shell 真正 attach 并开始输出首屏内容的阶段被显著拉长**。

从 `node-pty` 本地源码也能确认这一点：

- `useConptyDll: false` 时，native 层从 `kernel32.dll` 加载系统 `CreatePseudoConsole`
- `useConptyDll: true` 时，会改成加载包内的 `conpty.dll`
- 安装脚本会同时复制 `conpty.dll` 和 `OpenConsole.exe`

因此，这个开关不是“调一个小行为”，而是**切换到底层 console host 实现**。

## 当前决策

既然不同机器上可能都存在兼容性差异，`useConptyDll` 不再适合作为硬编码的系统策略。

更合理的方案是：

- 默认关闭 `bundled conpty.dll`
- 在设置面板中提供高级开关，让用户自行开启
- 保留环境变量覆盖，方便诊断和回归测试

## 2026-03-09 ????????????????????? PTY ???

???????????????????

- ????????`useConptyDll: true` ?????? prompt ??? `3~4s`
- ????????????????????????????

??????? PTY ????????? **Renderer ??? xterm ??????**?

1. ??????????? `close-window`???????? `killProcess()` ?? PTY ??
2. ????????????????????
3. `TerminalPane` ????? `pane.id` ?????? pane ?????????? xterm ??
4. ?????????????? prompt?????? shell ???? ready

???????????

- ? `pane.pid` ?????? `TerminalPane` ????
- ?????????? prompt ??????????????? PTY ???????

????????????

- **?????**????????????????
- ??????????? xterm ?????????????

