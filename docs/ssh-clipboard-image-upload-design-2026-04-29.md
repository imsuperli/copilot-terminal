# SSH 远程图片上传并复制路径方案

## 背景

在本地运行 Codex CLI 或 Claude Code CLI 时，CLI 可以直接读取本机剪贴板中的图片并作为附件处理。

但在 SSH 远端会话中，这个能力天然缺失：

- CLI 运行在远端机器，无法直接访问本机系统剪贴板
- 即使远端 CLI 能读取图片路径，图片文件本身也并不在远端文件系统中

前一版思路是：在 SSH 会话中拦截图片粘贴，自动上传图片，并尝试识别当前是否运行的是 `codex` 或 `claude`，再自动将路径注入到当前终端输入。

这个方向存在两个核心问题：

1. 识别“当前前台程序是否真的是 Codex / Claude Code”很难做到长期稳定且准确
2. 自动向 PTY 注入路径有侵入性，容易影响 `vim`、`tmux`、`less`、`htop` 等其他终端程序

因此，本方案改为更保守、更稳健的实现：

- 在 SSH pane 中，检测到用户触发粘贴快捷键时，如果本机剪贴板里是图片：
  - 将图片上传到远端当前工作目录
  - 将远端图片路径写回本机剪贴板
  - 通过右上角提示告诉用户“图片已上传，路径已复制，请手动粘贴”
- 不自动向远端 PTY 注入任何文本

这可以解决“手动上传图片”的主要痛点，同时避免破坏其他终端程序的交互行为。

## 目标

### 目标行为

在 SSH pane 中：

- Windows/Linux 用户按 `Ctrl+V`
- macOS 用户按 `Cmd+V`

如果本机剪贴板中是图片，则：

1. 读取本机剪贴板图片
2. 转成 PNG 并写入本地临时文件
3. 上传到当前 SSH pane 对应的远端 `cwd`
4. 将远端文件路径写入本机剪贴板
5. 右上角提示用户上传成功和目标路径

如果本机剪贴板中不是图片，则维持现有文本粘贴行为，不改变用户习惯。

### 非目标

本方案明确不做以下事情：

- 不自动识别当前远端程序是不是 `codex` / `claude`
- 不自动向 PTY 注入远端图片路径
- 不尝试在远端 CLI 内部“模拟本地图片附件”
- 不处理任意文件类型上传
- 不处理剪贴板中的本地文件路径列表
- 不处理 HTML 片段中的内嵌图片

这些能力都可以在后续版本单独扩展，但不属于当前 P0 范围。

## 为什么这个方案更稳

### 不干扰终端程序

本方案不向 PTY 写入任何自动生成的内容，因此不会影响：

- `vim`
- `tmux`
- `less`
- `man`
- `htop`
- `python`
- `node`
- 其他交互式 TUI / REPL

用户仍然掌握最终输入时机，只是在粘贴图片后，获得一个已经上传好的远端文件路径。

### 不依赖前台进程识别

不再需要判断当前前台程序是不是 `codex` / `claude`。这避免了以下问题：

- SSH pane 的本地 `pid` 不是远端前台进程 PID
- `tmux` / `screen` 会掩盖真实前台程序
- 长时间运行任务时，仅靠启发式难以稳定判断“当前仍在 AI CLI 内”

### 与现有架构匹配

当前代码库已经具备该方案所需的大部分能力：

- `TerminalPane` 已实现粘贴快捷键拦截
- 主进程已具备系统剪贴板读写能力
- SSH pane 已有远端 `cwd` 运行时跟踪
- `ProcessManager` 已能复用现有 SSH 会话做 SFTP 上传

因此该方案只需要在现有架构上做小范围扩展。

## 用户交互设计

### 触发规则

仅在以下条件同时满足时启用图片上传逻辑：

1. 当前 pane 是 SSH pane
2. 当前触发的是“标准文本粘贴快捷键”
   - Windows/Linux: `Ctrl+V`
   - macOS: `Cmd+V`
3. 本机系统剪贴板中可直接读取到图片数据

否则全部回退到现有文本粘贴流程。

### 成功提示

建议显示右上角 toast：

- 标题：`图片已上传`
- 内容：`已上传到 /remote/path/example.png，路径已复制到剪贴板`

### 失败提示

建议显示右上角 toast：

- 标题：`图片上传失败`
- 内容：具体失败原因，例如：
  - `剪贴板中没有图片`
  - `远端目录不可写`
  - `SSH 会话未连接`
  - `上传失败，请检查网络连接`

### 用户体验说明

用户按下粘贴快捷键后：

- 若剪贴板是文本：和现在一样，直接粘贴文本
- 若剪贴板是图片：不会把图片内容送到终端，而是上传并复制远端路径

这是一个“SSH 图片粘贴”的专用行为，不与普通文本粘贴冲突。

## 剪贴板图片识别方案

### 核心原则

不要尝试通过“文件大小”“二进制内容”“文件扩展名”去猜是不是图片。

应当直接依赖 Electron 对系统剪贴板的图片读取能力：

- `clipboard.readImage()`
- `NativeImage.isEmpty()`

### 判定规则

主进程调用：

```ts
const image = clipboard.readImage();
const isClipboardImage = !image.isEmpty();
```

判定结果：

- `true`：按图片上传流程处理
- `false`：不是图片，继续现有文本粘贴流程

### 为什么这种方式可靠

它判断的是“系统剪贴板中是否存在可直接读取的图片对象”，而不是：

- 文件路径
- 任意二进制对象
- 自定义应用格式
- 其他非图片内容

因此不会误把：

- 可执行程序
- 普通文件
- 文件夹
- 大文件路径

当成图片。

## 远端上传路径策略

该功能需要支持“上传到哪里”这一行为的配置化，而不是固定写死为当前目录。

建议支持三种上传位置：

1. 当前位置
2. 临时缓存目录
3. 自定义目录

### 1. 当前位置

配置值：

```text
current-working-directory
```

行为：

- 上传到当前 SSH pane 的运行时远端 `cwd`

当前项目已经有 SSH `cwd` 跟踪能力，能够在 pane 运行期间随着 `cd` 等行为更新运行时目录。

优点：

- 最贴近当前工作上下文
- 用户后续手动粘贴路径最顺手

风险：

- 会在当前项目目录中留下图片文件

### 2. 临时缓存目录

配置值：

```text
temporary-directory
```

行为：

- 上传到远端临时缓存目录，而不是当前工作目录

建议优先级：

1. `~/.cache/synapse/images`
2. `/tmp`

优点：

- 不污染当前项目目录
- 更适合临时截图或一次性图片

风险：

- 某些系统会定期清理临时目录
- 路径离当前工作目录较远

### 3. 自定义目录

配置值：

```text
custom-directory
```

行为：

- 上传到用户配置的远端目录

示例：

```text
~/uploads/images
```

优点：

- 可控性最高
- 适合团队统一约定目录

风险：

- 目录可能不存在
- 目录可能没有写权限

### 文件命名规则

建议本地临时文件和远端最终文件统一采用确定性前缀：

```text
copilot-clipboard-YYYYMMDD-HHmmss.png
```

例如：

```text
copilot-clipboard-20260429-153012.png
```

这样有几个好处：

- 可读性高
- 基本避免命名冲突
- 上传后远端文件名稳定

### 位置解析与回退策略

不同上传位置配置使用不同的回退策略。

#### 当配置为“当前位置”

按顺序尝试：

1. 当前运行时 `cwd`
2. `~`
3. `/tmp`

只要某个目录上传成功，即视为成功。

#### 当配置为“临时缓存目录”

按顺序尝试：

1. `~/.cache/synapse/images`
2. `/tmp`

必要时可自动创建 `~/.cache/synapse/images`。

#### 当配置为“自定义目录”

只尝试：

1. 用户配置目录

若失败，直接报错，不自动回退到其他目录。

原因：

- 用户既然显式指定了目标目录，就不应悄悄上传到别处

### 关于“当前目录”的定义

这里的“当前目录”指的是：

- 当前 SSH shell 所在的运行时远端 `cwd`

而不是：

- `vim` 当前打开文件所在目录
- `tmux` 某个子 pane 的内部目录

这一点需要在文档和提示语中保持一致，避免用户误解。

## 技术方案

### 总体流程

```text
用户按粘贴快捷键
  ↓
TerminalPane 拦截标准粘贴键
  ↓
调用主进程：检测剪贴板是否为图片
  ↓
┌─────────────────────┬──────────────────────┐
│ 不是图片            │ 是图片               │
├─────────────────────┼──────────────────────┤
│ 继续现有文本粘贴    │ 读取图片并转 PNG      │
│                     │ 写本地临时文件        │
│                     │ 上传到远端 cwd        │
│                     │ 剪贴板改写为远端路径  │
│                     │ 显示成功提示          │
└─────────────────────┴──────────────────────┘
```

## 代码改动设计

### 1. Renderer：`TerminalPane.tsx`

文件：

- [src/renderer/components/TerminalPane.tsx](/data/data/com.termux/files/home/develop/synapse/src/renderer/components/TerminalPane.tsx)

现有逻辑里已经拦截了普通粘贴快捷键，并调用文本剪贴板读取。

需要改成：

1. 当前 pane 是 SSH pane 时，先请求主进程判断“是否为图片并尝试上传”
2. 若主进程返回“已按图片处理”，则终止文本粘贴流程
3. 若主进程返回“不是图片”，则继续现有文本粘贴

建议新增一层抽象方法：

```ts
const handled = await window.electronAPI.tryPasteSshClipboardImage(windowId, pane.id);
```

返回值语义：

- `handled: true`
  - 说明已按图片上传处理
  - renderer 不再执行文本粘贴
- `handled: false`
  - 说明不是图片
  - renderer 继续现有文本粘贴逻辑

### 2. Preload：新增 IPC 暴露

文件：

- [src/preload/index.ts](/data/data/com.termux/files/home/develop/synapse/src/preload/index.ts)

新增接口：

```ts
tryPasteSshClipboardImage: (windowId: string, paneId: string) =>
  ipcRenderer.invoke('try-paste-ssh-clipboard-image', { windowId, paneId })
```

同时补充共享类型定义。

### 3. Shared Types：新增 IPC 返回类型

文件：

- [src/shared/types/electron-api.ts](/data/data/com.termux/files/home/develop/synapse/src/shared/types/electron-api.ts)

建议新增：

```ts
export interface TryPasteSshClipboardImageResult {
  handled: boolean;
  remotePath?: string;
  width?: number;
  height?: number;
}
```

语义：

- `handled = false`
  - 剪贴板不是图片，renderer 应继续文本粘贴
- `handled = true`
  - 已按图片上传流程处理完毕

### 4. Main Handler：新增专用 handler

建议新增文件：

- `src/main/handlers/sshClipboardImageHandlers.ts`

职责：

1. 校验 pane 是否为 SSH pane
2. 读取系统剪贴板图片
3. 若不是图片，返回 `handled: false`
4. 若是图片：
   - 转 PNG
   - 写入本地临时文件
   - 获取远端目标目录
   - 调用现有 SSH/SFTP 上传能力
   - 生成远端完整路径
   - 将远端路径写回系统剪贴板
   - 返回 `handled: true`

### 5. Main：复用现有 SSH/SFTP 上传能力

优先复用已有接口：

- [src/main/services/ProcessManager.ts](/data/data/com.termux/files/home/develop/synapse/src/main/services/ProcessManager.ts)

现有 `uploadSSHSftpFiles(windowId, paneId, remotePath, localPaths)` 已能完成：

- 将本地文件上传到远端目录
- 远端文件名使用本地 basename

这正好适合当前方案：

1. 在本地生成带固定文件名的临时 PNG
2. 上传到远端目标目录
3. 远端最终文件名自动与本地临时文件名保持一致

因此 P0 不需要新增底层 buffer 上传能力。

### 6. 获取远端目标目录

目标目录的来源由设置决定。

#### `current-working-directory`

优先使用 pane 当前运行时 `cwd`。

来源建议：

- renderer 传入当前 paneId 和 windowId
- main 根据当前 workspace 中 pane 运行时状态读取 `cwd`

如果当前 pane 没有可信 `cwd`，则回退到：

1. pane 的 `ssh.remoteCwd`
2. `~`
3. `/tmp`

#### `temporary-directory`

直接走临时缓存目录策略：

1. `~/.cache/synapse/images`
2. `/tmp`

#### `custom-directory`

直接使用用户配置的目录。

## IPC 设计

### 请求

Channel:

```text
try-paste-ssh-clipboard-image
```

Payload:

```ts
{
  windowId: string;
  paneId: string;
}
```

### 返回

```ts
IpcResponse<TryPasteSshClipboardImageResult>
```

示例：

```ts
{
  success: true,
  data: {
    handled: false
  }
}
```

```ts
{
  success: true,
  data: {
    handled: true,
    remotePath: "/srv/app/copilot-clipboard-20260429-153012.png",
    width: 1440,
    height: 900
  }
}
```

```ts
{
  success: false,
  error: "图片上传失败：远端目录不可写"
}
```

## 临时文件设计

### 本地临时文件

建议写入系统临时目录：

```text
${tmpdir()}/copilot-clipboard-YYYYMMDD-HHmmss.png
```

### 清理策略

P0 方案建议采用“上传完成后立即删除本地临时文件”。

无论上传成功还是失败，都在 `finally` 中尝试删除本地临时文件。

远端文件不做自动删除，由用户自行使用，避免误删。

## 剪贴板覆盖策略

### 当前行为

当设置启用“上传成功后自动复制远端路径”时，上传成功后将本机剪贴板内容覆盖为远端路径。

例如：

```text
/srv/app/copilot-clipboard-20260429-153012.png
```

### 好处

- 用户可以立刻在当前远端终端中手动粘贴路径
- 与“只提示但不复制”的方案相比，交互更顺手

### 风险

- 原始图片剪贴板内容会被覆盖

### 配置化建议

建议将该行为直接纳入设置项，而不是写死。

可配置项：

- 上传成功后自动复制路径：开/关

## 路径转义问题

P0 阶段只复制“原始远端路径”，不自动生成 shell 转义版本。

原因：

- 本方案不自动注入到 shell
- 用户可能将路径粘贴到不同上下文：
  - shell 参数
  - Markdown
  - 聊天输入框
  - CLI prompt

因此复制原始路径更中性。

如果后续发现远端路径中经常出现空格等特殊字符，再考虑增加：

- “复制 shell-safe 路径”的二次操作

## 异常与边界场景

### 1. 剪贴板中没有图片

处理：

- 返回 `handled: false`
- renderer 继续现有文本粘贴

### 2. 当前 pane 不是 SSH pane

处理：

- 不走该功能
- 继续现有文本粘贴

### 3. SSH 连接断开

处理：

- 返回错误
- 显示 toast
- 不执行文本粘贴替代行为

原因：

用户本意是“粘贴图片”，不是粘贴文本。
如果剪贴板里真的是图片，就不应退化成空文本粘贴。

### 4. 当前远端目录不可写

处理：

- 若配置为“当前位置”
  - 按顺序回退：
    - 当前 `cwd`
    - `~`
    - `/tmp`
- 若配置为“临时缓存目录”
  - 按顺序回退：
    - `~/.cache/synapse/images`
    - `/tmp`
- 若配置为“自定义目录”
  - 直接报错，不自动回退

### 5. 图片过大

P0 暂不压缩，但建议加入保护：

- 若 `toPNG()` 后字节数超过阈值，提示用户
- 建议阈值可先设为 `20 MB`

过大时两种选择：

- 直接拒绝
- 或允许继续上传但提示可能较慢

P0 更建议“提示但允许上传”。

### 6. 本地临时文件写入失败

处理：

- 返回错误
- 显示 toast

## 设置项设计

该功能建议从第一版开始就做成可配置，而不是默认写死。

用户最关心的两个问题是：

1. 图片上传后保存到哪里
2. 上传成功后是否自动复制远端路径

### 推荐配置模型

文件：

- [src/shared/types/workspace.ts](/data/data/com.termux/files/home/develop/synapse/src/shared/types/workspace.ts)

建议新增：

```ts
export interface SSHClipboardImageSettings {
  enabled: boolean;
  uploadLocation: 'current-working-directory' | 'temporary-directory' | 'custom-directory';
  customUploadDirectory?: string;
  copyRemotePathAfterUpload: boolean;
  maxUploadBytes?: number;
}
```

并在 `Settings` 中加入：

```ts
export interface Settings {
  // ...
  sshClipboardImage?: SSHClipboardImageSettings;
}
```

如果后续 SSH 配置模块继续扩展，也可以再迁移到更嵌套的结构中。

### 字段说明

- `enabled`
  - 是否启用 SSH 图片粘贴上传功能
- `uploadLocation`
  - 控制上传位置
  - `current-working-directory`
  - `temporary-directory`
  - `custom-directory`
- `customUploadDirectory`
  - 当使用自定义目录时的远端路径
- `copyRemotePathAfterUpload`
  - 上传成功后是否将远端路径写回本机剪贴板
- `maxUploadBytes`
  - 允许上传的最大图片大小

### 默认值建议

```json
{
  "sshClipboardImage": {
    "enabled": true,
    "uploadLocation": "current-working-directory",
    "customUploadDirectory": "",
    "copyRemotePathAfterUpload": true,
    "maxUploadBytes": 20971520
  }
}
```

默认值解释：

- 默认启用
- 默认保存到当前位置
- 默认自动复制远端路径
- 默认最大 20 MB

### 设置面板设计

文件：

- [src/renderer/components/SettingsPanel.tsx](/data/data/com.termux/files/home/develop/synapse/src/renderer/components/SettingsPanel.tsx)

建议在 SSH 相关设置区域增加以下配置项：

1. `启用 SSH 图片粘贴上传`
2. `上传位置`
   - `当前位置`
   - `临时缓存目录`
   - `自定义目录`
3. `自定义目录`
   - 仅当 `上传位置 = 自定义目录` 时显示
4. `上传成功后自动复制远端路径`
5. `最大图片大小（MB）`

### 设置文案建议

- `启用 SSH 图片粘贴上传`
  - `在 SSH 终端中粘贴图片时，自动上传到远端目录`
- `上传位置`
  - `控制图片在远端服务器上的保存位置`
- `当前位置`
  - `保存到当前 SSH 会话所在目录`
- `临时缓存目录`
  - `保存到远端临时目录，避免污染当前项目目录`
- `自定义目录`
  - `保存到你指定的远端目录`
- `上传成功后自动复制远端路径`
  - `便于在终端中手动粘贴该图片路径`

### 配置对运行时行为的影响

#### 配置为“当前位置”

```text
Ctrl+V / Cmd+V
  -> 检测到剪贴板是图片
  -> 上传到当前 cwd
  -> 成功后复制该远端路径
```

#### 配置为“临时缓存目录”

```text
Ctrl+V / Cmd+V
  -> 检测到剪贴板是图片
  -> 上传到 ~/.cache/synapse/images 或 /tmp
  -> 成功后复制该远端路径
```

#### 配置为“自定义目录”

```text
Ctrl+V / Cmd+V
  -> 检测到剪贴板是图片
  -> 上传到用户指定目录
  -> 成功后复制该远端路径
```

## 测试计划

### 单元测试

1. 剪贴板识别
- `readImage().isEmpty() === true`
- `readImage().isEmpty() === false`

2. 上传目录选择
- `current-working-directory` 下当前 `cwd` 成功
- `current-working-directory` 下当前 `cwd` 失败，回退 `~`
- `current-working-directory` 下 `~` 失败，回退 `/tmp`
- `temporary-directory` 下优先使用 `~/.cache/synapse/images`
- `temporary-directory` 下回退 `/tmp`
- `custom-directory` 下使用用户配置目录

3. 返回值语义
- 不是图片返回 `handled: false`
- 是图片返回 `handled: true`

4. 临时文件清理
- 上传成功后删除
- 上传失败后删除

### 集成测试

1. SSH pane 文本粘贴不回归
- 剪贴板是文本
- `Ctrl+V` / `Cmd+V` 继续按原逻辑粘贴文本

2. SSH pane 图片上传
- 剪贴板是图片
- 上传成功
- 本机剪贴板被改写为远端路径
- 未向 PTY 注入任何内容
- `uploadLocation` 三种配置都生效

3. 非 SSH pane 不受影响
- 本地终端继续按原逻辑处理粘贴

4. 失败场景
- SSH 断开
- 目录不可写
- 临时文件写入失败

### 手工验证场景

建议覆盖：

- 远端普通 shell
- 远端 `vim`
- 远端 `tmux`
- 远端 `codex`
- 远端 `claude`

验证点统一为：

- 图片能上传
- 路径能复制
- 不会自动污染当前终端输入

## 实施顺序

### P0

1. 新增主进程图片上传 IPC
2. Renderer 在 SSH pane 粘贴键上接入“先试图片，失败则走文本”
3. 本地临时文件写入和上传
4. 上传成功后复制远端路径
5. 成功/失败 toast

### P1

1. 增加上传大小阈值
2. 增加设置项
3. 支持“当前位置 / 临时缓存目录 / 自定义目录”
4. 增加更清晰的提示文案

### P2

1. 支持“复制了本地图片文件路径”的场景
2. 支持自动压缩
3. 支持保留原图片剪贴板或提供恢复能力

## 与旧方案对比

### 旧方案

- 识别当前是不是 `codex` / `claude`
- 上传图片
- 自动向 PTY 注入 `--image path` 或其他路径文本

### 新方案

- 不识别前台程序
- 上传图片
- 将远端路径复制到本机剪贴板
- 用户手动粘贴

### 取舍结论

新方案牺牲了一点“自动化程度”，换来了：

- 更低误判率
- 更少对终端程序的干扰
- 更简单的实现路径
- 更高的可维护性

对于当前项目，这是更适合先落地的方案。

## 结论

该方案具备以下特点：

- 可落地
- 与现有架构匹配
- 风险可控
- 不依赖远端前台程序识别
- 不破坏其他终端程序行为

建议作为 SSH 图片粘贴能力的第一阶段实现方案推进。
