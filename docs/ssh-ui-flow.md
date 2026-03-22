# SSH 渲染层与交互流程设计

## 1. 目标

本文档定义 SSH 功能在渲染层的呈现方式与交互流程，覆盖：

- 首页 SSH 卡片
- 新建 / 编辑 SSH 连接
- 终端页工具栏
- 分屏与窗口组中的 SSH 表现
- host key 确认
- 认证补充输入
- 重连与断线提示
- 搜索、筛选、收藏、标签

本文档不讨论主进程细节，主进程设计见：

- [docs/ssh-main-process-architecture.md](./ssh-main-process-architecture.md)

## 2. 设计原则

### 2.1 不新增独立 SSH 页面

SSH 必须融入现有：

- 卡片主页
- 终端页
- 快速切换器
- 侧边栏
- 窗口组

用户不应该感觉是在用两个产品。

### 2.2 backend 不直接暴露给用户，能力差异才暴露

用户看到的是：

- 这是一个 SSH 连接
- 它可以重连、SFTP、端口转发

而不是：

- 这是另一个完全不同的 UI 系统

### 2.3 首屏信息要偏“资产视角”

SSH 不是目录型资源，而是服务器 / 环境资源。

因此首页卡片需要强调：

- 名称
- 用户
- 主机
- 环境标签
- 状态

而不是仅仅强调路径。

### 2.4 首版尽量减少阻塞式弹窗

建议优先使用：

- 卡片级状态
- 终端页顶部状态条
- 侧边抽屉
- 内联面板

仅在必要时使用模态：

- host key 首次确认
- 删除 profile

## 3. 信息架构

## 3.1 首页层级

首页卡片池统一由以下资源组成：

- 本地终端窗口卡片
- SSH 连接卡片
- 窗口组卡片

其中 SSH 连接卡片可以有两种实现方式：

1. `Window` 直接作为 SSH 卡片
2. `SSHProfile` 作为卡片，点击时生成窗口

### 推荐方案

推荐使用第二种：

- 首页主要展示 `SSHProfile` 卡片
- 点击后创建并进入 `Window`

原因：

- 更符合专业 SSH 工具的资产管理思路
- profile 与运行中 session 解耦
- 断开连接后卡片仍保留
- 用户更容易收藏和分组连接目标

### 与现有实现的融合方式

由于当前首页 `CardGrid` 以 `Window | Group` 为主，首期可以采用兼容方案：

- 首页引入第三类卡片 `SSHProfileCard`
- 保持 `WindowCard` 不变
- `CardGrid` 支持三类 item：
  - `window`
  - `group`
  - `ssh-profile`

## 3.2 终端页层级

终端页继续复用现有 `TerminalView`。

在终端页中，用户面对的是：

- 一个 `Window`
- 里面有一个或多个 pane
- pane 可以是 local 或 ssh

顶部工具栏按当前激活 pane 的能力变化。

## 4. 首页卡片设计

## 4.1 SSH 卡片信息组成

SSH 卡片建议展示：

- 主标题：`prod-web-01`
- 副标题：`root@10.0.0.21:22`
- 类型标识：`SSH`
- 标签：`prod` / `cn-shanghai` / `web`
- 收藏标记
- 最近连接时间
- 当前状态

### 状态定义

首页卡片状态建议使用：

- `未连接`
- `连接中`
- `已连接`
- `认证失败`
- `主机指纹待确认`
- `已断开`

### 卡片右上角状态区

建议保留状态圆点或状态徽章：

- 灰：未连接
- 蓝：连接中
- 绿：已连接
- 黄：待确认 / 重连中
- 红：失败 / 指纹冲突

## 4.2 SSH 卡片动作

鼠标悬停或右键菜单建议提供：

- 连接
- 新窗口连接
- 编辑
- 收藏 / 取消收藏
- 复制 SSH 命令
- 复制主机
- 打开 SFTP
- 查看转发
- 删除

### 首版推荐的主操作

主按钮只保留：

- `连接`

其余放入菜单，避免卡片过载。

## 4.3 SSH 卡片与本地卡片的视觉区分

建议只做轻量区分，不要割裂。

可区分元素：

- 类型徽章 `SSH`
- 标题下副标题展示 `user@host`
- 边框或顶部状态线可略带不同语义色
- 图标使用服务器/远程标记

不建议：

- 做完全不同的卡片结构
- 让 SSH 卡片比本地卡片大很多

## 4.4 空状态设计

在没有任何 SSH profile 时，建议在首页空状态中加入：

- `新建 SSH 连接`
- `导入 SSH 配置`

如果后续支持从 `~/.ssh/config` 导入，可在这里露入口。

## 5. 新建 / 编辑 SSH 连接弹窗

## 5.1 总体结构

建议新增独立弹窗：

- `CreateSSHConnectionDialog`
- `EditSSHConnectionDialog`

采用分区表单，而不是一屏堆满。

推荐布局：

1. 基本信息
2. 认证方式
3. 连接方式
4. 高级选项
5. 标签与备注

## 5.2 基本信息区

字段：

- 连接名称
- 主机
- 端口
- 用户名
- 默认远程目录
- 登录后命令

交互建议：

- 名称可自动建议为 `user@host`
- 端口默认 22
- 远程目录可选填

## 5.3 认证方式区

认证方式：

- 密码
- 私钥
- Agent
- Keyboard-interactive

### 密码认证

字段：

- 密码输入
- `记住密码`

### 私钥认证

字段：

- 私钥路径列表
- 添加私钥文件
- 私钥 passphrase
- `记住 passphrase`

### Agent 认证

字段：

- 使用本地 SSH agent
- agent forwarding

### Keyboard-interactive

首版表单不需要预定义问题，只需允许：

- 连接时动态补充输入

## 5.4 连接方式区

模式：

- Direct
- Jump Host
- Proxy Command
- SOCKS Proxy
- HTTP Proxy

交互建议：

- 用单选切换模式
- 切换后只显示当前模式相关字段

### Jump Host

字段：

- jump host profile 下拉选择

### Proxy Command

字段：

- proxy command 输入框
- 风险提示

### SOCKS / HTTP Proxy

字段：

- host
- port

## 5.5 高级选项区

字段：

- keepalive interval
- keepalive count max
- timeout
- verify host keys
- skip banner
- reuse session
- warn on close
- x11

首版原则：

- 默认折叠
- 对普通用户减少噪音

## 5.6 标签与备注区

字段：

- tags
- notes
- 自定义颜色
- 自定义图标

这部分对专业用户非常重要，因为他们通常管理大量主机。

## 5.7 弹窗底部动作

建议提供：

- 保存
- 保存并连接
- 测试连接
- 取消

### 测试连接的行为

点击后：

- 调用 `testSSHConnection`
- 返回连接可达性、延迟、host key 状态、认证是否通过
- 在弹窗内联展示结果

不建议：

- 一点击测试就直接创建窗口

## 6. 终端页设计

## 6.1 总体原则

继续复用现有 `TerminalView`。

核心改造点不在布局，而在顶部工具栏能力化。

## 6.2 顶部工具栏动作分层

建议把工具栏分为三组：

1. 通用动作
2. local pane 专属动作
3. ssh pane 专属动作

### 通用动作

- 返回
- 分屏
- 关闭 pane
- 归档 / 停止
- 窗口组操作

### local pane 专属

- 打开本地目录
- 用 IDE 打开
- Git 相关状态

### ssh pane 专属

- 重连
- SFTP
- 端口转发
- 查看连接信息
- 复制连接命令

## 6.3 SSH pane 顶部状态条

对于 SSH pane，建议在终端上方增加轻量状态条，显示：

- 当前主机
- 用户
- 连接状态
- RTT
- Jump Host 标记
- Forward 数量

例如：

`SSH  root@10.0.0.21  Connected  38ms  via bastion-prod  FWD:2`

### 状态条展示规则

- pane 激活时显示完整信息
- pane 非激活时只保留简化标签

## 6.4 SSH pane 标题

pane 标题建议优先级：

1. 用户自定义 title
2. profile 名称
3. `user@host`

如果已探测到远程 cwd，可附加：

- `prod-web-01  /srv/app`

## 7. 分屏交互设计

## 7.1 从 SSH pane 分屏

用户在 SSH pane 上点击水平或垂直分屏时：

- 新 pane 默认继承相同 profile
- 复用相同底层 SSH 连接
- 新开 shell channel
- 尝试继承当前远程目录

如果当前目录不可获取：

- 使用 profile 默认远程目录

### 用户感知

不应弹额外确认框。

这个行为应像本地分屏一样自然。

## 7.2 local 与 ssh 混合分屏

允许存在以下布局：

- 左边本地 pane，右边 SSH pane
- 上面 SSH pane，下面本地 pane

### 工具栏行为

以当前激活 pane 为准。

例如：

- 激活本地 pane 时显示 `打开目录`
- 激活 SSH pane 时显示 `SFTP`

## 7.3 关闭分屏行为

关闭 SSH pane 时：

- 如果是多 pane 窗口，只关闭该 shell channel
- 如果是最后一个 pane，则关闭整个 window session

用户体验上与本地 pane 行为保持一致。

## 8. 窗口组中的 SSH

## 8.1 组卡片

组卡片继续按聚合状态展示，不需要特殊设计。

但建议在组内窗口列表或 tooltip 中体现：

- 哪些窗口是 SSH
- 哪些窗口是 mixed

## 8.2 组内混合场景

允许：

- 组内有本地窗口
- 组内有 SSH 窗口
- 组内有 mixed 窗口

### 注意点

组级批量启动 / 停止时：

- SSH 窗口的启动语义应是“发起连接”
- SSH 窗口的停止语义应是“断开连接”

## 9. host key 交互流程

## 9.1 首次连接未知主机

流程：

1. 用户点击连接
2. 主进程发现 host key 未信任
3. renderer 打开确认模态
4. 展示：
   - 主机
   - 端口
   - 算法
   - fingerprint
   - 当前 profile 名称
5. 用户选择：
   - 仅本次接受
   - 接受并记住
   - 拒绝

### 文案重点

必须明确：

- 首次连接无法验证目标身份
- 若指纹不符合预期，存在中间人风险

## 9.2 已知主机指纹变化

这类情况风险更高，不建议沿用普通首次连接文案。

弹窗应强调：

- 已保存的主机指纹与当前主机不一致
- 可能是重装系统，也可能是攻击

建议动作：

- 拒绝连接
- 更新信任并继续

默认高亮动作应为 `拒绝连接`。

## 10. 认证补充输入流程

## 10.1 场景

以下场景需要额外交互：

- Keyboard-interactive
- 私钥 passphrase 缺失
- profile 未保存密码

## 10.2 交互形态

建议不要在系统级弹窗里多轮提问。

推荐方案：

- 在终端页顶部展示认证面板
- 或在侧边抽屉里展示认证补充输入

### 优点

- 用户知道自己是在为哪个会话输入
- 不阻断整个应用
- 多轮 keyboard-interactive 更自然

## 10.3 认证面板展示内容

- 会话名称
- 主机
- 当前请求类型
- 输入框列表
- `本次使用`
- `保存到 vault`
- 取消

## 11. 断线与重连流程

## 11.1 断线展示

SSH pane 断线后不建议立刻把终端清空。

建议行为：

- 保留已有终端输出
- 在顶部显示状态条：`Connection lost`
- 工具栏出现 `重连`
- pane 状态切换为 `Paused` 或 `Error`

## 11.2 手动重连

点击 `重连` 后：

- 保留原 pane
- 原地重新建立 session
- 成功后继续使用同一 pane

### 优点

- 对用户来说是恢复会话，不是新开一个标签

## 11.3 自动重连

首版建议不默认启用自动重连。

后续可以做 profile 级设置：

- Never
- On network loss only
- Always

## 12. SFTP 与端口转发入口

## 12.1 SFTP 入口

推荐两个入口：

- SSH pane 工具栏按钮
- SSH 卡片右键菜单

### 首版呈现方式

建议先做终端页右侧抽屉，而不是复杂双栏文件管理器。

右侧抽屉内容：

- 当前路径
- 文件列表
- 下载
- 上传
- 新建目录
- 删除
- 刷新

## 12.2 端口转发入口

推荐两个入口：

- SSH pane 工具栏按钮
- SSH 卡片右键菜单

点击后打开转发管理面板，展示：

- 已配置 forward
- 当前活动状态
- 新增 local / remote / dynamic forward
- 停止

## 13. 搜索、筛选、收藏、标签

## 13.1 搜索

首页搜索框应支持 SSH 维度：

- 名称
- 主机
- 用户
- 端口
- 标签
- 备注

### 搜索结果展示

建议搜索时，SSH profile 卡片和运行中的 SSH window 都能被命中。

## 13.2 筛选

建议在现有 tabs 或 filters 中增加：

- `本地`
- `SSH`
- `混合`
- `收藏`

如果当前 UI 不适合加太多 tab，可在筛选菜单中提供。

## 13.3 收藏

SSH profile 应支持收藏。

收藏逻辑：

- 首页置顶
- 快速切换优先
- 新建连接时优先推荐

## 13.4 标签

标签建议用于：

- 环境：`prod` / `staging` / `dev`
- 区域：`cn-shanghai` / `us-east`
- 业务：`web` / `db` / `cache`

标签展示位置：

- SSH 卡片
- 编辑连接弹窗
- 搜索结果

## 14. QuickSwitcher / Sidebar 设计

## 14.1 QuickSwitcher

应支持显示：

- SSH profile 资产项
- 运行中的 SSH window
- 本地 window
- group

### SSH 资产项显示

- `prod-web-01`
- `root@10.0.0.21`
- 状态标记

快捷操作建议：

- 回车连接
- `Cmd/Ctrl + Enter` 新窗口连接

## 14.2 Sidebar

侧边栏建议增加 SSH 识别：

- 图标区分
- 名称下显示 `user@host`
- 当前状态点

如果某 SSH window 是 mixed，则按现有窗口逻辑展示，但可以显示混合标记。

## 15. 失败与异常体验设计

## 15.1 连接失败

首版不要只吐一行英文错误。

应分类提示：

- 主机不可达
- 超时
- 认证失败
- host key 冲突
- agent 不可用
- jump host 失败

### UI 展现

建议在卡片或终端页顶部状态条展示一条可读错误，并允许：

- 重试
- 编辑连接
- 查看详情

## 15.2 Profile 删除限制

如果 profile 正被 pane 使用：

- 删除前必须提示影响

建议文案：

- 删除后运行中的 SSH pane 不立即断开，但后续恢复和重连会失效

更稳妥策略：

- 如果有活动 pane 使用该 profile，禁止删除，只允许归档或停用

## 16. 组件建议

建议新增组件：

- `SSHProfileCard.tsx`
- `CreateSSHConnectionDialog.tsx`
- `EditSSHConnectionDialog.tsx`
- `SSHConnectionStatusBar.tsx`
- `SSHHostKeyDialog.tsx`
- `SSHAuthPromptPanel.tsx`
- `SSHForwardPanel.tsx`
- `SFTPDrawer.tsx`
- `SSHBadge.tsx`

建议改造组件：

- `CardGrid.tsx`
- `WindowCard.tsx`
- `QuickSwitcher.tsx`
- `QuickSwitcherItem.tsx`
- `Sidebar.tsx`
- `TerminalView.tsx`
- `TerminalPane.tsx`

## 17. 实施优先级

### P0

- SSH 卡片
- 新建 / 编辑 SSH 连接弹窗
- SSH 终端页工具栏能力切换
- host key 确认
- 认证补充输入
- 断线状态与手动重连

### P1

- SFTP 抽屉
- 端口转发面板
- 收藏与标签
- QuickSwitcher 资产项

### P2

- 批量连接
- 服务器资产树
- 更高级的过滤器
- 双栏文件管理器

## 18. 结论

渲染层的核心目标不是“做一套 SSH 专属 UI”，而是：

- 在首页把 SSH 作为一等资产展示
- 在终端页把 SSH 作为一等 pane backend 展示
- 用 capability 机制控制交互差异
- 让用户在视觉和操作上感受到“统一终端系统”，而不是两个拼接功能

## 19. 下一步建议

UI 文档完成后，下一份应进入实施路线图，明确：

- 分阶段任务包
- 文件级修改范围
- 风险控制点
- 每阶段验收标准
- 测试矩阵

