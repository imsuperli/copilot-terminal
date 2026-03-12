# 当前代码库架构走查与质量审查

审查日期：2026-03-11

## 审查范围

本次走查重点覆盖了以下区域：

- 主进程启动与服务编排：`src/main/index.ts`
- PTY / 状态轮询 / 工作区持久化：`src/main/services/*`
- IPC 暴露面与类型边界：`src/preload/index.ts`、`src/renderer/global.d.ts`
- 渲染层窗口、终端、多窗格布局与全局 store：`src/renderer/App.tsx`、`src/renderer/components/*`、`src/renderer/stores/windowStore.ts`
- tmux 兼容层：`src/main/services/TmuxCompatService.ts`

## 总体判断

当前项目已经形成了相对清晰的 Electron 主进程 / preload / React 渲染层分层，也有不少显式的服务对象和测试。但从架构与长期维护的角度看，当前代码存在几个明显问题：

- 主进程中的启动编排和 tmux 兼容层过于集中，已经出现“大类 + 全局可变状态”趋势。
- 渲染层存在“隐藏但不卸载”的终端实例保活策略，窗口数量上来后会直接放大内存和事件监听成本。
- 持久化模型混入了太多运行态字段，导致 autosave 和备份链路对普通 UI 操作也产生 IO 压力。
- IPC 合同和共享类型的静态校验已经失真，说明类型系统没有真正起到边界守卫作用。

下面按严重度列出具体问题。

## 修复进展

- 2026-03-12：已修复问题 5“拖拽调整窗格大小只存在于组件局部状态，不能持久化，也无法回写布局树”。
- 修复内容：新增 `src/renderer/utils/layoutHelpers.ts` 的 `updateSplitSizes(...)` 和 `src/renderer/stores/windowStore.ts` 的 `updateSplitSizes(...)` action；`src/renderer/components/SplitLayout.tsx` 在拖拽过程中仍使用局部 state 预览，但会在 `mouseup` 时把最终 `sizes` 写回 store 和布局树，并触发 autosave。
- 回归测试：补充 `src/renderer/utils/__tests__/layoutHelpers.test.ts` 与 `src/renderer/components/__tests__/SplitLayout.test.tsx`，覆盖嵌套 split 的尺寸更新和拖拽结束后写回 store 的路径。
- 2026-03-12：已修复问题 4“所有 `TerminalView` / `TerminalPane` 都常驻挂载，窗口数增长时会线性放大内存和监听器成本”。
- 修复内容：`src/renderer/App.tsx` 从“为所有窗口都挂载一个 `TerminalView` 再用 CSS 隐藏”改为“只挂载当前活跃窗口的一个 `TerminalView`，并在切窗时通过 `key` 强制释放旧实例”。这会直接卸载后台窗口里的 xterm 实例、`ResizeObserver`、`window.resize` 监听和 PTY 数据订阅。
- 回归测试：新增 `src/renderer/__tests__/App.terminalMounting.test.tsx`，覆盖“多窗口存在时只挂载当前活跃 `TerminalView`”。
- 2026-03-12：已修复问题 1“`ProcessManager` 在真实 PTY 路径里忽略了用户传入的 `command`”。
- 修复内容：`src/main/services/ProcessManager.ts` 现在会把 `command` 解析为实际传给 `node-pty` 的 `file + args`，再调用 `pty.spawn(file, args, options)`，不再把参数在真实 PTY 路径里丢掉；同时保留“显式 shell 路径带空格但没有参数”的兼容解析。
- 回归测试：补充 `src/main/services/__tests__/ProcessManager.test.ts`，覆盖“显式 shell 路径 + 参数”与“显式 shell 路径带空格但无参数”两种真实 PTY 启动场景。
- 2026-03-12：已修复问题 2“拆分窗格新创建的 PTY 没有注册到 `StatusPoller`”。
- 修复内容：`src/main/handlers/paneHandlers.ts` 在 `split-pane` 成功后补上了 `statusPoller.addPane(windowId, paneId, pid)`，并在 `close-pane` 时补上 `statusPoller.removePane(paneId)`，保证注册与清理对称。
- 回归测试：新增 `src/main/handlers/__tests__/paneHandlers.test.ts`，覆盖 split 后接入轮询链路与 close-pane 清理轮询状态；同时复跑了 `src/main/services/__tests__/StatusPoller.test.ts`。
- 2026-03-12：已修复问题 3“`StatusPoller` 的活跃窗格优化没有接入运行时，导致可见 pane 也按 5 秒轮询”。
- 修复内容：新增 `set-active-pane` IPC，把 renderer 当前活动 pane 同步回 main；窗口切换时由 `useViewSwitcher` 发送当前 `activePaneId`，pane 切换时由 `windowStore.setActivePane(...)` 发送更新，切回 unified view 时由主进程调用 `StatusPoller.clearActivePane()` 降回非活跃轮询。
- 回归测试：新增 `src/main/handlers/__tests__/viewHandlers.test.ts` 与 `src/renderer/stores/__tests__/windowStore.activePaneSync.test.ts`，并补充 `src/renderer/hooks/__tests__/useViewSwitcher.test.ts`、`src/main/services/__tests__/StatusPoller.test.ts`，覆盖 active pane 同步与清空后的轮询节奏。
- 下一条建议继续修复：问题 6“工作区持久化混入大量运行态字段，且几乎所有 UI 操作都会触发保存”。在当前剩余问题里，这是最直接的 IO 写放大来源。

## 主要问题

### 1. `ProcessManager` 在真实 PTY 路径里忽略了用户传入的 `command`

- 严重度：高
- 影响：`create-window`、`start-window`、`split-pane`、tmux 内部创建 pane 虽然都传入了命令，但在真实 PTY 分支里最终永远只会拉起默认 shell。功能表面上支持“自定义命令”，实际运行时并不生效。
- 依据：`src/main/services/ProcessManager.ts:753-755` 读取了 `config.command`，但 `src/main/services/ProcessManager.ts:813` 实际调用的是 `pty.spawn(shell, [], ptySpawnOptions)`，没有使用 `command`。
- 建议：把“shell 启动”和“执行具体 command”拆开建模。若要支持任意命令，应明确生成 `shell + args` 或 `executable + args`，并补一条在真实 `node-pty` 路径下验证命令生效的测试。

### 2. 拆分窗格新创建的 PTY 没有注册到 `StatusPoller`

- 严重度：高
- 影响：拆分出来的新 pane 只会在前端本地被标记为 `Running`，但后续不会进入状态轮询链路，状态可能长期停留在初始值，和主窗口 / 恢复窗口的行为不一致。
- 依据：`src/main/handlers/windowHandlers.ts:99-100` 与 `src/main/handlers/windowHandlers.ts:175-176` 都在创建后调用了 `statusPoller?.addWindow(...)`；但 `src/main/handlers/paneHandlers.ts:17-45` 只做了 `spawnTerminal` 和 PTY 订阅，没有任何 `statusPoller?.addPane(...)` 或等价逻辑。前端拆分入口在 `src/renderer/components/TerminalView.tsx:155-178`，会假定新 pane 已完整接入运行态。
- 建议：在 `split-pane` handler 中补上 `statusPoller?.addPane(windowId, paneId, pid)`，同时补回归测试，覆盖“split 后状态从 running -> waiting/completed”的事件流。

### 3. `StatusPoller` 的活跃窗格优化没有接入运行时，导致可见 pane 也按 5 秒轮询

- 严重度：高
- 影响：设计上活跃 pane 应该 1 秒轮询、非活跃 5 秒轮询；但当前运行时没有把“当前活动窗口/窗格”同步回主进程，因此所有 pane 实际都按非活跃间隔轮询。用户能感知到的结果是：当前正在看的 pane，状态更新仍然可能慢 5 秒。
- 依据：`src/main/services/StatusPoller.ts:89-123` 提供了 `setActivePane` / `setActiveWindow`，`src/main/services/StatusPoller.ts:150-152` 明确区分了 1 秒与 5 秒轮询。实际运行时，视图切换只更新 renderer store 和 view state：`src/renderer/hooks/useViewSwitcher.ts:24-29`、`src/renderer/hooks/useViewSwitcher.ts:51-67`、`src/main/handlers/viewHandlers.ts:7-24`。代码库中 `StatusPoller.setActivePane` / `setActiveWindow` 的调用只出现在测试里。
- 建议：增加一个显式 IPC，把活动 windowId / paneId 从 renderer 推回 main；或直接把活动态判断迁移到主进程拥有的 source of truth 中。

### 4. 所有 `TerminalView` / `TerminalPane` 都常驻挂载，窗口数增长时会线性放大内存和监听器成本

- 严重度：高
- 影响：当前不是“只渲染激活终端”，而是“渲染所有终端，再用 CSS 隐藏”。每个 pane 都会初始化一个 xterm 实例、注册 `ResizeObserver`、`window.resize` 监听、键盘处理和 PTY 订阅。窗口越多，后台仍常驻的终端实例越多，性能上限会很差。
- 依据：`src/renderer/App.tsx:259-282` 对所有窗口执行 `windows.map(...)`，仅通过 `display: none` 控制可见性；`src/renderer/components/TerminalPane.tsx:257-470` 在 mount 时无条件初始化 xterm、监听 resize、注册 PTY 数据订阅与剪贴板/键盘逻辑。
- 建议：至少改成“仅挂载活跃 TerminalView + 可选缓存最近一个”；若确实要保活，也应建立显式的虚拟化或挂起机制，把隐藏 pane 的终端实例和观察器释放掉。

### 5. 拖拽调整窗格大小只存在于组件局部状态，不能持久化，也无法回写布局树

- 严重度：中
- 影响：用户拖拽后的尺寸比例不会进入 store 和工作区持久化。一旦组件重挂载、视图切换、tmux 同步或应用重启，比例就会丢失。
- 依据：`src/renderer/components/SplitLayout.tsx:86-131` 使用局部 `sizes` state 响应拖拽，但没有任何 store action 或 IPC 回写；`src/renderer/components/SplitLayout.tsx:98-100` 还会在外部 `splitNode.sizes` 变化时直接覆盖局部状态。
- 建议：把尺寸变更纳入布局树更新动作，例如新增 `updateSplitSizes(windowId, splitPath, sizes)`，并让 autosave 保存真实的布局比例，而不是组件内部瞬态。

### 6. 工作区持久化混入大量运行态字段，且几乎所有 UI 操作都会触发保存

- 严重度：中
- 影响：当前不仅保存结构性数据，还会在切换活动 pane、切换窗口、更新 Claude 模型等操作后触发 autosave。主进程每次保存都会写 `workspace.json` 并轮转备份，导致普通交互也持续产生命中磁盘的保存链路。
- 依据：`src/renderer/stores/windowStore.ts:20-23` 会把整份 `windows` 发送给主进程；`src/renderer/stores/windowStore.ts:265-328` 在 `setActivePane`、`setActiveWindow` 后立即触发保存；`src/renderer/stores/windowStore.ts:395-406` 在更新 Claude 运行态信息后也触发保存。主进程侧 `src/main/services/AutoSaveManager.ts:58-67` 只有 300ms 防抖，而 `src/main/services/WorkspaceManager.ts:52-98` 每次保存都会落盘并执行备份。
- 建议：区分“可持久化工作区状态”和“运行态状态”。像 `activePaneId`、Claude 指标、临时 UI MRU 等至少应重新评估是否进入持久层。备份也应只在结构性变更或退出时执行，而不是对每次 focus 变化都执行。

### 7. 渲染层的类型安全实际上没有被纳入构建，导致 IPC 合同和共享类型已经漂移

- 严重度：中
- 影响：renderer 当前缺少真正的 TypeScript 边界守卫，preload 暴露面、renderer 声明和共享类型已经出现不一致，但不会在构建阶段被拦住。这会持续放大“运行时才发现问题”的概率。
- 依据：`package.json:11-13` 的 build 只执行主进程 `tsc` 和 statusline `tsc`，没有执行 `tsc -p tsconfig.renderer.json`；而 `tsconfig.renderer.json:1-17` 是存在的。合同漂移的直接例子包括：
- 依据：`src/preload/index.ts:18-22` 暴露了 `startWindow`、`checkPtyOutput`、`startGitWatch`、`stopGitWatch`，但 `src/renderer/global.d.ts:18-27` 完全没有声明这些方法。
- 依据：`src/preload/index.ts:109-114` 的 `ptyWrite` / `ptyResize` / `getPtyHistory` 签名已经变成 pane 级别；`src/renderer/global.d.ts:47-52` 仍是旧的 window 级签名。
- 依据：共享 `Window` 类型在 `src/shared/types/window.ts:82-92` 没有 Claude 相关字段，但 `src/renderer/stores/windowStore.ts:399-402` 直接把这些字段写回 window 对象。
- 建议：把 renderer `tsc --noEmit` 加进 build / CI；同时让 preload 暴露定义从单一源生成，避免手写两份接口。

### 8. `TmuxCompatService` 和主进程 bootstrap 已经过大，并依赖可变全局状态与 `any`

- 严重度：中
- 影响：tmux 兼容层已经承担了命令解析执行、session/window/pane 索引、布局树改写、PTY 生命周期、RPC server 协调、renderer 同步等多种职责；主进程入口也持有大量全局单例与共享可变状态。这类结构短期能跑，但后续很难稳定演进。
- 依据：`src/main/services/TmuxCompatService.ts` 当前约 2421 行；类入口和状态定义集中在 `src/main/services/TmuxCompatService.ts:63-99`，命令总分发在 `src/main/services/TmuxCompatService.ts:103-169`，运行态和 store 同步逻辑在 `src/main/services/TmuxCompatService.ts:465-540`，布局改写与 pane/window 合并拆分逻辑又散落在 `src/main/services/TmuxCompatService.ts:1265-1394`、`src/main/services/TmuxCompatService.ts:2609-2704`。主进程入口 `src/main/index.ts:18-29`、`src/main/index.ts:170-295` 也通过全局变量持有这些单例，并把 `currentWorkspace` 作为共享可变对象传给服务，`src/main/index.ts:191-198` 还使用了 `state: any` 的更新接口。
- 建议：拆分出独立的 `tmux session registry`、`layout mutation service`、`runtime binding service`、`rpc adapter`；主进程入口则收敛成依赖装配层，不直接承载业务协同。

### 9. 核心文件中存在编码损坏注释与遗留备份文件，增加了维护噪音

- 严重度：低
- 影响：注释乱码会直接降低可读性，备份/旧实现文件会让“当前真实入口”更难分辨，尤其在多人协作或后续重构中会持续增加认知成本。
- 依据：注释编码损坏示例见 `src/renderer/components/TerminalView.tsx:24-26`、`src/main/services/TmuxCompatService.ts:61-62`。遗留文件示例：`src/renderer/components/SettingsPanel.tsx.backup`、`src/renderer/components/TerminalView.tsx.backup`、`src/renderer/components/TerminalView.old.tsx`。
- 建议：统一 UTF-8 编码并清理遗留备份文件，只保留当前实现和 Git 历史。

## 逐项解决方案与对现有功能的影响

### 1. `ProcessManager` 忽略 `command`

- 解决方案：
- 将 `spawnTerminal` 的输入拆成两类模式：`shell` 模式和 `exec` 模式。
- 如果保留“在 shell 中执行命令”的语义，则统一生成平台相关参数，例如 Windows 下 `pwsh -NoExit -Command <cmd>`，Unix 下 `bash -lc <cmd>`。
- 如果需要支持直接执行可执行文件，则将 `command` 解析为 `file + args`，并让 `pty.spawn(file, args, options)` 直接使用解析后的值。
- 为真实 `node-pty` 路径补集成测试，明确验证 `command` 不为空时最终启动结果。
- 对现有功能的影响：
- 当前“总是打开默认 shell”的行为会被纠正，`CreateWindow`、恢复窗口、tmux 创建 pane、自定义命令入口的行为会更符合 UI 预期。
- 若部分现有逻辑默认依赖“传了 command 但仍进 shell”，修复后可能改变启动语义，尤其是 `command` 中包含 shell 内建命令时。
- 需要同步检查 `copilot.json`、设置项、tmux 兼容层里传入的 `command` 是否都符合新的语义约定。

### 2. 拆分窗格未注册 `StatusPoller`

- 解决方案：
- 在 `split-pane` handler 中，创建 PTY 成功后立即调用 `statusPoller.addPane(windowId, paneId, pid)`。
- 在 `close-pane`、tmux pane 移除、窗口关闭等路径上继续保持对称清理，确保 `removePane` 覆盖完整。
- 增加回归测试，覆盖 split 后 pane 的状态事件流。
- 对现有功能的影响：
- 拆分 pane 的状态将首次与主 pane 一致，状态圆点、聚合状态、自动归档判断会更准确。
- 会增加少量轮询开销，但这是正确性修复，不属于额外无效开销。
- 若当前有依赖“split 出来的 pane 不刷新状态”的隐式 UI 假设，修复后界面状态变化会更频繁，但应视为正向修正。

### 3. 活跃 pane 状态没有同步回主进程

- 解决方案：
- 新增轻量 IPC，例如 `set-active-pane` / `set-active-window`，在前端切换终端视图、切换 pane、切回 unified view 时同步给主进程。
- 主进程把该状态喂给 `StatusPoller.setActivePane()`，统一决定当前轮询节奏。
- 若后续主进程引入自己的窗口状态源，也可把“当前活跃 pane”直接存入主进程状态容器，避免 renderer 驱动。
- 对现有功能的影响：
- 当前 pane 的状态更新会更及时，运行中/等待输入的切换延迟会从最差 5 秒缩到 1 秒。
- 非激活 pane 仍保持低频轮询，总体 CPU 成本不会线性上升。
- 若切换事件过多，需要做幂等和去重，避免频繁 IPC；但这比当前错误轮询策略更可控。

### 4. 所有终端实例常驻挂载

- 解决方案：
- 将 `App` 改为仅挂载当前活跃 `TerminalView`，其他窗口只保留轻量元数据。
- 如果担心切换成本，可只缓存“最近一个终端视图”，而不是缓存全部。
- 对隐藏窗口引入“挂起”机制：取消 `ResizeObserver`、全局 resize 监听和焦点逻辑，必要时销毁 xterm 实例并保留 PTY 数据历史。
- 对现有功能的影响：
- 内存占用、监听器数量和布局重算成本会显著下降，多窗口场景下切换和启动更稳。
- 终端切换时可能出现一次性重建成本，需要通过 PTY 历史回放或增量回放避免白屏。
- 依赖“切回窗口时保留完整滚动位置、选择态、瞬时 UI 状态”的行为可能改变，需要决定哪些状态必须保留。

### 5. 窗格尺寸拖拽不持久化

- 解决方案：
- 在 store 中新增布局尺寸更新 action，把 `SplitNode.sizes` 真正写回布局树。
- `SplitLayout` 只负责交互，拖拽结束时提交更新，拖拽过程中可局部 state 预览，释放鼠标时再写回 store。
- 自动保存时保存真实布局树中的 `sizes`，恢复工作区时直接还原。
- 对现有功能的影响：
- 用户拖拽后的布局比例将能跨视图切换、跨重启保留，行为更符合预期。
- 拖拽结束时会产生一次额外 store 更新和 autosave，但这是结构性变更，值得持久化。
- 若 tmux 兼容层也会改写布局，需要统一“谁是最终布局来源”，否则可能发生覆盖。

### 6. 运行态字段进入工作区持久化，autosave 写放大

- 解决方案：
- 明确拆分 `WorkspaceSnapshot` 和 `RuntimeState`。
- 仅把窗口结构、目录、命令、归档状态、布局比例等放进持久层。
- 把 `activePaneId`、Claude 指标、临时 focus、MRU、实时状态等迁出持久层，改为运行时 store。
- `AutoSaveManager` 只在结构性变更时落盘；备份只在显著变更或退出时执行，而不是每次自动保存都执行。
- 对现有功能的影响：
- 磁盘写入频率会明显下降，长时间运行时更稳定。
- 一部分“临时态恢复”能力会消失，例如重启后不一定回到完全相同的活跃 pane 或临时模型展示值。
- 这是合理取舍，因为这些信息本质是运行态；若确实要恢复，应单独设计轻量 session snapshot，而不是混入主工作区文件。

### 7. renderer 类型检查未纳入构建，IPC 合同漂移

- 解决方案：
- 在 `build` 或 CI 中增加 `tsc -p tsconfig.renderer.json --noEmit`。
- 把 preload 暴露面收敛到单一类型源，例如 `src/shared/types/electron-api.ts`，由 preload 和 renderer 共用。
- 清理 `global.d.ts` 中的旧签名，消除 pane 级和 window 级 API 的双轨定义。
- 对现有功能的影响：
- 短期内会暴露一批现有类型错误，构建门槛会上升，但这正是需要尽快发现的问题。
- 不会直接改变运行时功能，但会限制“先改 preload、后补类型”的松散开发方式。
- 长期看会显著降低 IPC 改造和重构时的回归概率。

### 8. `TmuxCompatService` 与主进程 bootstrap 过大

- 解决方案：
- 把 `TmuxCompatService` 按职责拆成多个模块：
- `TmuxCommandDispatcher`
- `TmuxSessionRegistry`
- `TmuxLayoutMutator`
- `TmuxRuntimeBinder`
- `TmuxRpcFacade`
- 主进程 `index.ts` 只做依赖装配，改为显式创建 `AppServices` 容器，避免散落的全局 `let` 和 `any`。
- 将 `currentWorkspace` 的更新改为受控仓储接口，而不是直接把可变对象透传给多个服务。
- 对现有功能的影响：
- 短期重构风险较高，尤其对 tmux teammate 模式、pane/window 同步、恢复逻辑影响最大。
- 如果按边界分阶段抽离，并保持测试护栏，运行时功能不应改变，但中途会经历一段“双实现并存”或“适配层过渡”时期。
- 这是中期工程，适合在前 1-7 项稳定后进行。

### 9. 编码损坏注释与备份文件

- 解决方案：
- 统一仓库文本文件为 UTF-8，无 BOM，修复乱码注释。
- 删除 `.backup`、`.old` 等遗留文件，仅保留 Git 历史中的旧实现。
- 对注释做一次精简，只保留解释设计决策和边界条件的内容。
- 对现有功能的影响：
- 正常情况下对运行时零影响。
- 但删除遗留文件前要确认没有测试、脚本或人工流程仍引用这些文件。
- 这是低风险高收益的清理项，适合和类型收敛一起做。

## 建议的修复优先级

1. 先修复功能正确性问题：`ProcessManager` 命令失效、split pane 未注册 `StatusPoller`、活跃 pane 状态同步缺失。
2. 再处理渲染层性能：把 `TerminalView` 改成按需挂载，并把 pane resize 比例纳入 store。
3. 紧接着收敛持久化模型：拆分运行态与持久态，降低 autosave + backup 的写放大。
4. 同时补齐质量护栏：把 renderer `tsc` 接入构建，统一 preload / renderer IPC 类型来源。
5. 最后做结构重构：拆解 `TmuxCompatService` 和主进程全局装配逻辑。

## 验证记录

- `npm run build` 未能完成，但失败原因来自当前工作区里已修改的 `src/renderer/components/SettingsPanel.tsx` JSX 结构不匹配，不属于本次新增问题。报错位置包括 `SettingsPanel.tsx:484`、`SettingsPanel.tsx:835` 等。
- `npm test -- --run src/main/services/__tests__/ProcessManager.test.ts` 通过。
- `npm test -- --run src/main/services/__tests__/StatusPoller.test.ts` 通过。
- `npm test -- --run src/main/handlers/__tests__/paneHandlers.test.ts src/main/services/__tests__/StatusPoller.test.ts` 通过。
- `npm test -- --run src/main/handlers/__tests__/viewHandlers.test.ts src/main/services/__tests__/StatusPoller.test.ts src/renderer/hooks/__tests__/useViewSwitcher.test.ts src/renderer/stores/__tests__/windowStore.activePaneSync.test.ts` 通过。
- `npm test -- --run src/renderer/__tests__/App.terminalMounting.test.tsx` 通过。
- `npm test -- --run src/renderer/utils/__tests__/layoutHelpers.test.ts src/renderer/components/__tests__/SplitLayout.test.tsx` 通过。

## 补充说明

现有单测对 `ProcessManager` 和 `StatusPoller` 的关键正确性路径已经补齐到位，包括：

- 真实 `node-pty` 路径下 `command` 是否被正确拆分并传给 `pty.spawn(...)`。
- `split-pane` 后新 pane 是否进入状态轮询。
- 运行时切换活动窗口 / 活动 pane 后主进程轮询节奏是否按活跃态切换。

后续更值得优先补的，将是渲染层性能与按需挂载相关的行为测试。
