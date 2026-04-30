# macOS `node-pty` `spawn-helper` 权限问题复盘

> 日期：2026-04-30
> 关联提交：`7fff69b fix: repair macOS node-pty spawn-helper permissions`

## 1. 问题现象

macOS 下打开或恢复终端 pane 时，主进程创建 PTY 失败，前端报错如下：

```text
paneSessionActions.ts:205 Failed to start pane cf258c69-1675-4e52-9b26-6c9cb4215584: Error: posix_spawnp failed.
    at startPaneForWindow (paneSessionActions.ts:175:11)
    at async paneSessionActions.ts:198:24
    at async Promise.all (:5173/index 0)
    at async startWindowPanes (paneSessionActions.ts:195:3)
    at async useWindowSwitcher.ts:32:9
```

从用户视角看，表现为：

- 新 pane 无法启动。
- 切换窗口时部分 pane 恢复失败。
- 日志只看到 `posix_spawnp failed`，表面上像 shell 路径或 cwd 问题。

## 2. 根因

这次问题不在 shell 命令本身，而在 `node-pty` 的 macOS 辅助可执行文件 `spawn-helper`。

`node-pty` 在 macOS 上会通过预编译产物里的 `spawn-helper` 协助拉起 PTY。只要这个文件缺少可执行权限，`pty.spawn(...)` 就会在底层触发 `posix_spawnp failed`。

这类问题有两个特点：

- 报错离业务代码较远，前端堆栈看不出是 `spawn-helper` 权限问题。
- 即使 `command` 是合法的 `/bin/zsh` 或 `/bin/bash`，仍然会失败，因为真正出错的是 `node-pty` 的中间 helper。

## 3. 修复方案

修复点放在 PTY 创建入口，而不是依赖安装或打包流程。

实现位置：

- [ProcessManager.ts](/data/data/com.termux/files/home/develop/synapse/src/main/services/ProcessManager.ts#L1113)

核心做法：

1. 在 `createRealPty(...)` 里先调用 `ensureNodePtySpawnHelperExecutable()`。
2. 仅在 `darwin` 平台执行修复。
3. 扫描可能存在的 `spawn-helper` 路径：
   - `process.cwd()/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper`
   - `process.cwd()/node_modules/node-pty/prebuilds/darwin-x64/spawn-helper`
   - `__dirname` 回溯到项目根后的同类路径
4. 发现文件后统一执行 `chmodSync(helperPath, 0o755)`。
5. 如果 `chmod` 失败，只记录错误，不阻塞其他候选路径检查。

这样做的理由：

- 修复发生在真正使用 PTY 之前，时机最稳定。
- 同时覆盖开发环境和编译后运行环境可能出现的不同路径。
- 不依赖用户手工 `chmod`，也不要求重新安装依赖。

## 4. 测试补充

新增了回归测试：

- [ProcessManager.test.ts](/data/data/com.termux/files/home/develop/synapse/src/main/services/__tests__/ProcessManager.test.ts#L175)

测试思路：

1. 仅在 macOS 上运行。
2. 构造临时目录下的 `node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper`。
3. 先把权限设置成 `0o600`，模拟缺少执行位。
4. 切换 `cwd` 到该临时目录后调用 `spawnTerminal(...)`。
5. 断言 helper 最终权限被修复为 `0o755`。

这个测试的价值不在于验证 `node-pty` 本身，而是锁住我们自己的防线：

- 以后如果重构 `ProcessManager`，不会把这段修复逻辑意外删掉。
- 一旦候选路径或调用时机变化，测试会尽快暴露问题。

## 5. 排查经验

以后在 macOS 遇到类似 `posix_spawnp failed` 时，优先按下面顺序看：

1. shell 路径是否存在，例如 `/bin/zsh`。
2. `cwd` 是否存在且可访问。
3. `node-pty` 相关 helper 是否存在、是否有执行权限。
4. 是否只在 macOS 失败、Windows/Linux 正常。
5. 是否和依赖重装、产物复制、打包解压后权限丢失有关。

可直接检查：

```bash
ls -l node_modules/node-pty/prebuilds/darwin-*/spawn-helper
```

如果看到权限里没有执行位，例如 `-rw-------`，基本就能定位到这次同类问题。

## 6. 为什么把修复写在运行时

理论上也可以在安装依赖或打包阶段修权限，但这次选择运行时修复，主要因为：

- 开发环境最先暴露问题，运行时修复能立即覆盖。
- `node_modules` 的实际位置在不同启动方式下可能不同，运行时更容易兜底。
- 这个操作幂等，重复执行 `chmod 755` 成本很低。

代价也明确：

- 每次创建 PTY 前都会检查几个候选路径。
- 但检查量很小，相比一次 PTY 启动成本可忽略。

## 7. 后续建议

- 如果未来引入打包产物中的独立 `node_modules` 或自定义 PTY 发行目录，需要同步更新候选路径列表。
- 若后续发现打包版也会丢权限，可以再叠加 `afterPack` 修复；但运行时兜底建议保留。
- 如果再次出现同类报错，优先保留 `Failed to spawn PTY` 的主进程日志，因为其中会同时打印 `cwdExists` 和 `executableExists`，便于快速排除伪线索。

## 8. 结论

这次问题本质上是 macOS 对可执行权限更严格，而 `node-pty` 的 `spawn-helper` 一旦失去执行位，就会以 `posix_spawnp failed` 的形式在业务层表现出来。

可复用的经验是：

- 不要只盯着业务命令本身。
- 对带有本地 helper 的三方库，要把“辅助二进制权限”纳入排查范围。
- 对这类平台差异问题，优先在运行时入口做轻量、幂等、可测试的兜底。
