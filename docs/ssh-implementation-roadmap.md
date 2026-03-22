# SSH 实施路线图

## 1. 目标

本文档将前序设计文档收敛为可执行的研发路线图，明确：

- 分阶段实施顺序
- 每阶段改动范围
- 关键交付物
- 验收标准
- 风险控制点
- 测试要求

对应设计文档：

- [docs/ssh-terminal-integration-plan.md](./ssh-terminal-integration-plan.md)
- [docs/ssh-data-model-design.md](./ssh-data-model-design.md)
- [docs/ssh-main-process-architecture.md](./ssh-main-process-architecture.md)
- [docs/ssh-ui-flow.md](./ssh-ui-flow.md)

## 2. 总体实施策略

建议采用“先抽象、再接 SSH、最后做专业增强”的路线。

严禁一开始就直接做以下高风险动作：

- 直接把 Tabby SSH 代码拷进仓库
- 直接大面积重命名 `ProcessManager`
- 先做大而全的 SFTP / X11 / 批量运维
- 在主链路未稳定前引入过多 feature

### 推荐原则

1. 第一阶段不引入真实 SSH 也能落地底层抽象
2. 每阶段都保证现有本地终端功能不回归
3. 先打通 SSH shell 主链路，再做附属能力
4. 先做“能集成”，再做“很专业”

## 3. 阶段拆分

建议拆成 5 个阶段。

### 阶段 0：预备与防线建设

目标：

- 在开始改架构前补必要测试和 feature flag

### 阶段 1：统一会话抽象改造

目标：

- 把当前主进程从“本地 PTY 管理”提升为“统一 session 管理”
- 不引入真实 SSH 功能

### 阶段 2：SSH 数据层与主进程基础设施

目标：

- 完成 profile / vault / known_hosts / backend 基础设施

### 阶段 3：SSH MVP 接入前端

目标：

- 首页 SSH 卡片
- SSH 创建 / 连接 / 分屏 / 重连
- 与现有终端页融合

### 阶段 4：专业能力增强

目标：

- SFTP
- 端口转发
- 标签 / 收藏 / 快速切换增强

## 4. 阶段 0：预备与防线建设

## 4.1 目标

在进行架构改造前，先把风险最低的基础工作补齐。

## 4.2 具体任务

### 任务 A：引入 feature flag

建议新增设置项：

```ts
features?: {
  sshEnabled?: boolean
}
```

作用：

- 在开发中可逐步放开入口
- 若后续出现问题，可快速关闭 SSH 入口

### 任务 B：补回归测试覆盖

必须先加的测试：

- `create-window`
- `start-window`
- `split-pane`
- `close-pane`
- `close-window`
- `workspace restore`
- `CardGrid`
- `TerminalView`

目的：

- 后续 session 抽象改造时有回归防线

### 任务 C：识别并标记本地路径强依赖点

建议在代码中对以下位置加 TODO 注释或 issue 标记：

- 本地目录校验
- Git watcher
- openFolder/openInIDE
- projectConfigWatcher
- `pane.cwd` 作为本地路径使用的地方

## 4.3 交付物

- feature flag 落地
- 回归测试增强
- 风险点清单

## 4.4 验收标准

- 在不开启 SSH 的情况下，现有功能和 UI 无变化
- 新增测试全部通过

## 5. 阶段 1：统一会话抽象改造

## 5.1 目标

在不引入真实 SSH 连接能力的前提下，把当前本地 PTY 管理抽象为统一 session 管理。

这是全项目最关键的架构阶段。

## 5.2 任务拆解

### 任务 1：扩展 shared types

修改：

- `src/shared/types/window.ts`
- `src/main/types/process.ts`
- `src/shared/types/electron-api.ts`

引入：

- `backend`
- `sessionId`
- `capabilities`

要求：

- 老数据自动兼容为 `local`

### 任务 2：引入 `ITerminalSession`

在主进程定义统一 session 接口。

要求：

- `LocalTerminalSession` 包装 node-pty
- 当前本地终端链路全部改走统一接口

### 任务 3：改造 `ProcessManager` 内部索引

把核心索引改为：

- `sessionId -> session`
- `windowId:paneId -> sessionId`

同时保留兼容方法：

- `getPidByPane`

### 任务 4：统一输出与 history 路由

把以下能力从“按 pid”转为“按 sessionId / paneId”：

- subscribe data
- history snapshot
- resize
- write
- exit cleanup

### 任务 5：引入 capability 分流

先不接 SSH，只把 UI 和主进程中“本地特有能力”抽成 capability。

要处理的地方：

- 打开目录
- 用 IDE 打开
- Git watcher
- projectConfigWatcher

## 5.3 影响文件建议

重点文件：

- `src/shared/types/window.ts`
- `src/main/types/process.ts`
- `src/main/services/ProcessManager.ts`
- `src/main/handlers/ptyHandlers.ts`
- `src/main/handlers/windowHandlers.ts`
- `src/main/handlers/paneHandlers.ts`
- `src/renderer/components/TerminalView.tsx`
- `src/renderer/components/CardGrid.tsx`
- `src/renderer/components/WindowCard.tsx`

## 5.4 交付物

- 统一 session 抽象
- local backend 跑通
- capability 模型落地

## 5.5 验收标准

- 本地创建/启动/分屏/关闭功能完全正常
- workspace restore 无回归
- 相关测试全绿
- 代码中已经不存在“session 只能是本地 PTY”的假设

## 6. 阶段 2：SSH 数据层与主进程基础设施

## 6.1 目标

在主进程侧把 SSH 所需的基础设施搭好，但暂不追求完整前端体验。

## 6.2 任务拆解

### 任务 1：新增 shared SSH types

建议新增：

- `src/shared/types/ssh.ts`

内容：

- `SSHProfile`
- `ForwardedPortConfig`
- `KnownHostEntry`
- SSH 相关 IPC payload 类型

### 任务 2：实现 `SSHProfileStore`

职责：

- profile CRUD
- schema 校验
- 迁移兼容

建议加测试：

- create/update/remove/list
- 空文件 / 损坏文件恢复

### 任务 3：实现 `SSHVaultService`

首版目标：

- 能保存密码与 passphrase
- 不向 renderer 暴露明文读取接口

### 任务 4：实现 `SSHKnownHostsStore`

目标：

- 记录已信任 host key
- 支持 fingerprint 比对

### 任务 5：实现 `SSHConnectionMultiplexer`

目标：

- 同 profile 多 pane 共用一条底层连接
- 引用计数正确释放

### 任务 6：实现 `SSHTerminalBackend`

能力：

- 建立 SSH 连接
- 打开 shell channel
- onData/write/resize/exit
- host key 校验事件
- 认证失败事件

### 任务 7：新增 SSH handlers

新增：

- `sshProfileHandlers.ts`
- `sshSessionHandlers.ts`
- `sshKnownHostsHandlers.ts`

## 6.3 技术验证要求

阶段 2 必须先通过一轮主进程侧验证：

- 能手工创建 SSH session
- 能读取输出
- 能写入命令
- 能 resize
- 能正确关闭

即使暂时没有完整前端 UI，也要先验证底层链路。

## 6.4 交付物

- SSH profile store
- vault
- known_hosts
- ssh backend
- ssh handler 雏形

## 6.5 验收标准

- 能通过测试或临时调试入口创建 SSH shell session
- host key / auth failure 能正确冒泡
- session multiplexing 正常

## 7. 阶段 3：SSH MVP 接入前端

## 7.1 目标

把 SSH 作为一等用户功能接入现有 UI。

## 7.2 任务拆解

### 任务 1：新增 SSH 卡片

改造：

- `CardGrid.tsx`

新增：

- `SSHProfileCard.tsx`

要求：

- 卡片展示 profile 信息
- 支持连接、编辑、删除、收藏

### 任务 2：新增新建 / 编辑 SSH 弹窗

新增：

- `CreateSSHConnectionDialog.tsx`
- `EditSSHConnectionDialog.tsx`

要求：

- 基本信息
- 认证方式
- 连接方式
- 高级选项
- 测试连接

### 任务 3：接入 SSH window 创建

用户点击：

- SSH 卡片连接
- SSH 卡片菜单的“新窗口连接”

应进入现有 `TerminalView`。

### 任务 4：终端页工具栏能力化

改造：

- `TerminalView.tsx`

要求：

- 激活本地 pane 时显示本地动作
- 激活 SSH pane 时显示 SSH 动作

### 任务 5：host key 确认 UI

新增：

- `SSHHostKeyDialog.tsx`

要求：

- 首次连接与指纹变更分开文案
- 支持“本次接受 / 接受并记住 / 拒绝”

### 任务 6：认证补充输入 UI

新增：

- `SSHAuthPromptPanel.tsx`

要求：

- 支持 keyboard-interactive
- 支持密码补充
- 支持 passphrase 补充

### 任务 7：SSH 分屏

要求：

- SSH pane 可水平/垂直分屏
- 混合分屏可用
- SSH pane 继承 profile

### 任务 8：断线与重连

要求：

- 显示断线状态
- 原地重连
- 错误分类提示

## 7.3 建议影响文件

重点文件：

- `src/renderer/components/CardGrid.tsx`
- `src/renderer/components/TerminalView.tsx`
- `src/renderer/components/QuickSwitcher.tsx`
- `src/renderer/components/Sidebar.tsx`
- `src/renderer/stores/windowStore.ts`
- `src/preload/index.ts`
- `src/shared/types/electron-api.ts`

## 7.4 交付物

- SSH 卡片
- SSH 创建 / 编辑 UI
- SSH 终端页接入
- SSH 分屏
- host key / auth / reconnect UI

## 7.5 验收标准

- 用户能从首页创建并连接 SSH
- SSH 卡片可进入终端页
- SSH pane 可分屏
- local + ssh 混排无明显交互问题
- host key 与认证流程完整可用

## 8. 阶段 4：专业能力增强

## 8.1 目标

把 SSH 从“可用”提升到“专业”。

## 8.2 任务拆解

### 任务 1：SFTP 抽屉

新增：

- `SFTPDrawer.tsx`

首版能力：

- 浏览
- 上传
- 下载
- 删除
- 新建目录

### 任务 2：端口转发管理面板

新增：

- `SSHForwardPanel.tsx`

能力：

- 查看活动转发
- 新增 local / remote / dynamic
- 停止转发

### 任务 3：收藏与标签

要求：

- SSH profile 支持收藏
- 标签支持搜索与筛选
- 首页支持 `SSH / 收藏 / 标签` 维度

### 任务 4：QuickSwitcher 增强

要求：

- 运行中 SSH window
- SSH profile 资产项
- 收藏优先

### 任务 5：连接信息与诊断

建议新增：

- 延迟显示
- 连接链路信息
- jump host 展示
- forward 数量
- 错误详情面板

## 8.3 交付物

- SFTP
- 端口转发
- 收藏标签
- 诊断信息

## 8.4 验收标准

- SFTP 能用于基础远程文件操作
- forward 管理可用
- 首页 SSH 资产管理体验明显改善

## 9. 阶段 5：向 MobaXterm 靠拢

这一阶段不建议和主链路同时推进，但可作为长期规划。

建议能力：

- 服务器树视图
- 环境视图
- 会话模板
- 批量连接
- 批量执行
- 文件双栏
- 会话宏
- X11

## 10. 文件级实施建议

## 10.1 第一批文件

应优先修改：

- `src/shared/types/window.ts`
- `src/main/types/process.ts`
- `src/main/services/ProcessManager.ts`
- `src/shared/types/electron-api.ts`
- `src/preload/index.ts`

原因：

- 这是 session 抽象的中心

## 10.2 第二批文件

应在底层稳定后修改：

- `src/main/handlers/windowHandlers.ts`
- `src/main/handlers/paneHandlers.ts`
- `src/main/handlers/ptyHandlers.ts`
- 新增 SSH handlers

## 10.3 第三批文件

UI 接入阶段修改：

- `src/renderer/components/CardGrid.tsx`
- `src/renderer/components/TerminalView.tsx`
- `src/renderer/components/QuickSwitcher.tsx`
- `src/renderer/components/Sidebar.tsx`
- `src/renderer/stores/windowStore.ts`

## 11. 风险控制清单

## 11.1 阶段 1 风险

- 本地 PTY 路由被改坏
- sessionId 和 pid 混用导致状态错乱

控制措施：

- 保留兼容方法
- 先让 local backend 通过全部回归测试

## 11.2 阶段 2 风险

- SSH 库兼容性问题
- vault 方案不稳定
- host key 事件流不完整

控制措施：

- 先用最小可行能力打通 shell
- 暂缓 SFTP / forward
- 对 host key 流程做完整集成测试

## 11.3 阶段 3 风险

- UI 层被 backend 逻辑污染
- mixed pane 工具栏状态混乱

控制措施：

- 坚持 capability 模式
- 激活 pane 决定工具栏

## 11.4 阶段 4 风险

- SFTP 与 shell session 生命周期耦合
- port forward 复杂度影响稳定性

控制措施：

- SFTP 与 forward 独立服务化
- 不和 SSH MVP 主链路混做

## 12. 测试路线图

## 12.1 阶段 1 测试

- 单元测试
- renderer 组件回归测试
- workspace 恢复测试

## 12.2 阶段 2 测试

- 主进程 service 单测
- SSH backend 模拟测试
- known_hosts / vault 测试

## 12.3 阶段 3 测试

- E2E：创建 profile -> 连接 -> 进入终端 -> 分屏 -> 关闭
- host key 首次确认
- auth failure
- reconnect

## 12.4 阶段 4 测试

- SFTP 文件操作
- port forward 建立 / 关闭
- 收藏 / 标签 / 搜索

## 13. 人天与复杂度评估

以下为相对复杂度评估，不是精确工期。

### 阶段 0

- 复杂度：低
- 风险：低

### 阶段 1

- 复杂度：高
- 风险：高
- 原因：动到底层抽象和现有主链路

### 阶段 2

- 复杂度：高
- 风险：中高
- 原因：引入 SSH 基础设施

### 阶段 3

- 复杂度：中高
- 风险：中
- 原因：前后端融合与交互打磨

### 阶段 4

- 复杂度：中高
- 风险：中
- 原因：附加能力较多，但不再动主抽象

## 14. 推荐发布策略

### 14.1 内部灰度

建议先通过 feature flag 在内部灰度：

- 仅开发环境开启
- 或设置面板中手动开启

### 14.2 公开发布顺序

建议：

1. 发布 session 抽象重构版本，但不开放 SSH
2. 发布 SSH MVP beta
3. 发布 SFTP / forward 增强版本

### 14.3 不建议的发布方式

不建议把以下内容捆成一个大版本同时上线：

- session 重构
- SSH MVP
- SFTP
- forward
- 标签收藏

这样一旦出问题，很难定位。

## 15. 最终任务包建议

如果要开始正式开发，建议按以下任务包拆 issue。

### 任务包 A：Session 抽象重构

- 扩展 shared types
- local session wrapper
- `ProcessManager` 索引改造
- 本地回归测试

### 任务包 B：SSH 数据与服务层

- SSHProfileStore
- SSHVaultService
- SSHKnownHostsStore
- SSHConnectionMultiplexer
- SSHTerminalBackend

### 任务包 C：SSH IPC 与主进程链路

- ssh handlers
- preload / electron-api 扩展
- host key pending 流程

### 任务包 D：SSH UI MVP

- SSH 卡片
- SSH 创建 / 编辑弹窗
- host key dialog
- auth prompt panel
- TerminalView 工具栏能力化

### 任务包 E：SSH 高级能力

- SFTP drawer
- SSHForwardPanel
- 收藏 / 标签 / 快速切换增强

## 16. 结论

从研发实施角度，这个项目最重要的不是“先连上 SSH”，而是先把底层抽象改到正确方向。

正确的推进顺序应是：

1. 先把当前终端系统提升为统一 session 系统
2. 再把 SSH 作为 backend 接进来
3. 最后逐步补齐专业能力

如果按本文档路线推进，可以实现：

- 风险可控
- 本地链路不被破坏
- SSH 与现有终端完美融合
- 后续功能扩展有清晰边界

## 17. 文档链路汇总

本轮 SSH 方案文档已完整包括：

- [docs/ssh-terminal-integration-plan.md](./ssh-terminal-integration-plan.md)
- [docs/ssh-data-model-design.md](./ssh-data-model-design.md)
- [docs/ssh-main-process-architecture.md](./ssh-main-process-architecture.md)
- [docs/ssh-ui-flow.md](./ssh-ui-flow.md)
- [docs/ssh-implementation-roadmap.md](./ssh-implementation-roadmap.md)

后续若进入编码阶段，建议继续补充两类文档：

- 代码实现进度文档
- 测试用例与联调记录文档

