# macOS 终端修复方案设计

> 日期: 2026-03-20 | 版本: 1.1.1

---

## 一、核心问题：为什么 Windows 能用 Agent Teams 分窗格，macOS 不行？

### 技术原因

Agent Teams 分窗格功能依赖 tmux 兼容层，工作流程：

```
Claude Code 执行 `tmux split-window`
  → Shell 在 PATH 中找到 tmux 可执行文件
  → 实际执行的是 resources/bin/ 下的假 tmux shim
  → shim 通过 RPC 通知 Copilot Terminal 主进程
  → 主进程创建新的 PTY 进程 + 原生分窗格 UI
```

两个平台的 shim 文件对比：

| 平台 | Shim 文件 | 执行方式 | 权限要求 |
|------|-----------|----------|----------|
| Windows | `tmux.cmd` | `node "%~dp0tmux-shim.js" %*` | 无需执行权限，`.cmd` 文件由 cmd.exe 直接解释 |
| macOS | `tmux` | `exec node "$(dirname "$0")/tmux-shim.js" "$@"` | **需要 `chmod +x` 执行权限** |

**根因**：`electron-builder` 打包时，`asarUnpack: resources/bin/**/*` 将 shim 文件解压到 `app.asar.unpacked` 目录，但 **不保证保留文件的执行权限**。macOS 严格检查文件权限，导致 shell 执行 `resources/bin/tmux` 时报 "Permission denied"。

Windows 不受影响是因为 `.cmd` 文件不需要执行权限——Windows 的命令解释器直接读取并执行批处理文件内容。

---

## 二、六大场景分析

### 场景 1：macOS + tmux 兼容开启 + 未安装真实 tmux

这是 Agent Teams 的标准使用场景。

| | 当前行为 | 期望行为 |
|---|---------|---------|
| Claude Code 执行 `tmux split-window` | ❌ Permission denied | ✅ RPC → 原生分窗格 |
| 用户手动输入 `tmux` | ❌ Permission denied | ✅ 提示 "tmux 未安装"（shim 检测到非 Agent Teams 调用，尝试 passthrough，找不到真实 tmux） |

### 场景 2：macOS + tmux 兼容开启 + 已安装真实 tmux

| | 当前行为 | 期望行为 |
|---|---------|---------|
| Claude Code 执行 `tmux split-window` | ❌ Permission denied | ✅ RPC → 原生分窗格 |
| 用户手动输入 `tmux` | ❌ Permission denied | ✅ Passthrough → 启动真实 tmux |
| 用户手动输入 `tmux ls` | ❌ Permission denied | ✅ Passthrough → 列出真实 tmux 会话 |

### 场景 3：macOS + tmux 兼容关闭 + 已安装真实 tmux

tmux 兼容关闭时，PATH 不注入 shim 目录，不设置 TMUX 环境变量。

| | 当前行为 | 期望行为 |
|---|---------|---------|
| 用户手动输入 `tmux` | ✅ 启动真实 tmux（文本渲染在终端内） | ✅ 不变 |
| Claude Code 使用 Agent Teams | ❌ 无 tmux 可用，功能不可用 | ⚠️ 不变（需要用户开启 tmux 兼容） |

### 场景 4：macOS + tmux 兼容开启 + 用户在终端内启动了真实 tmux

这是最复杂的冲突场景。用户通过完整路径 `/opt/homebrew/bin/tmux` 或 `/usr/bin/tmux` 绕过 shim 启动了真实 tmux。

**环境变量状态**：
```
# Copilot Terminal 注入的（shell 启动时）：
TMUX=/tmp/tmux-501/default,<electron-pid>,0    ← 假值
AUSOME_TMUX_RPC=/tmp/ausome-tmux-<windowId>.sock
TMUX_PANE=%1

# 用户启动真实 tmux 后，真实 tmux 覆盖：
TMUX=/tmp/tmux-501/default,<real-tmux-pid>,0   ← 真值（PID 不同）
TMUX_PANE=%0                                    ← 真实 pane ID
# AUSOME_TMUX_RPC 仍然存在（继承自父进程）
```

| | 当前行为 | 期望行为 |
|---|---------|---------|
| 用户在真实 tmux 内操作 | ✅ 正常（真实 tmux 渲染） | ✅ 不变 |
| 在真实 tmux 内启动 Claude Code | ⚠️ Claude Code 执行 `tmux split-window` → shim 拦截 → RPC 到 Copilot Terminal → 在 Copilot Terminal UI 创建分窗格，但用户看到的是真实 tmux 界面，新窗格出现在"外面"，造成混乱 | ✅ shim 检测到处于真实 tmux 内 → passthrough 到真实 tmux → 分窗格在真实 tmux 内渲染 |

**冲突检测方法**：

shim 启动时，比较当前 `TMUX` 环境变量与 Copilot Terminal 注入的预期值。如果不一致，说明用户进入了真实 tmux 会话，应 passthrough。

具体实现：ProcessManager 注入一个额外环境变量 `AUSOME_TMUX_EXPECTED_TMUX`，值等于注入的假 `TMUX` 值。shim 对比：

```javascript
const expectedTmux = process.env.AUSOME_TMUX_EXPECTED_TMUX;
const currentTmux = process.env.TMUX;

if (expectedTmux && currentTmux && expectedTmux !== currentTmux) {
  // 当前处于真实 tmux 内，passthrough 到真实 tmux
  execRealTmux();
}
```

### 场景 5：macOS + tmux 兼容开启 + 用户先启动真实 tmux，再在其中打开 Copilot Terminal 管理的 shell

这个场景不会发生。Copilot Terminal 的 shell 是由 ProcessManager 直接 spawn 的 PTY 进程，不会嵌套在用户的真实 tmux 内。

### 场景 6：Windows + 所有场景

| | 当前行为 | 修改后行为 |
|---|---------|-----------|
| Agent Teams 分窗格 | ✅ 正常工作 | ✅ 不变 |
| 用户输入 `tmux` | shim 拦截，RPC 处理 | 如果添加 passthrough：尝试找真实 tmux → Windows 上不存在 → 报错 "tmux: command not found" |

Windows 上不存在真实 tmux（WSL 除外，但 WSL 是独立环境），所以 passthrough 逻辑不会产生副作用。

---

## 三、修改方案设计

### 修改点 1：修复 tmux shim 执行权限

**改什么**：`electron-builder.yml` 添加 `afterPack` hook，确保打包后 shim 文件有执行权限。

**修改前**：
```yaml
# electron-builder.yml
asarUnpack:
  - dist/statusline/**/*
  - resources/bin/**/*
```

**修改后**：
```yaml
# electron-builder.yml
asarUnpack:
  - dist/statusline/**/*
  - resources/bin/**/*
afterPack: ./scripts/after-pack.js
```

```javascript
// scripts/after-pack.js
const { chmod } = require('fs/promises');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName === 'darwin' || context.electronPlatformName === 'linux') {
    const shimPath = path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents/Resources/app.asar.unpacked/resources/bin/tmux'
    );
    await chmod(shimPath, 0o755).catch(() => {});
  }
};
```

**对 Windows 的影响**：无。`afterPack` 通过 `electronPlatformName` 判断平台，Windows 打包时不执行。

---

### 修改点 2：tmux shim 添加 Passthrough 逻辑

**改什么**：`resources/bin/tmux`（shell 脚本）和 `tmux-shim.js` 添加智能路由。

**核心逻辑**：

```
shim 被调用
  ├─ AUSOME_TMUX_RPC 未设置？ → passthrough 到真实 tmux
  ├─ TMUX ≠ AUSOME_TMUX_EXPECTED_TMUX？ → 处于真实 tmux 内 → passthrough
  ├─ 命令是 P0 支持的？(split-window, send-keys, list-panes, ...) → RPC 处理
  └─ 命令不支持？(new-session, attach, 无参数启动) → passthrough 到真实 tmux
```

**修改前** (`tmux-shim.js:70-73`)：
```javascript
if (!rpcPath) {
  process.stderr.write('tmux-shim: AUSOME_TMUX_RPC not set\n');
  process.exit(1);
}
```

**修改后** (`tmux-shim.js`)：
```javascript
const { execFileSync } = require('child_process');

// P0 支持的命令集（通过 RPC 处理）
const RPC_COMMANDS = new Set([
  'display-message', 'list-panes', 'split-window', 'send-keys',
  'select-layout', 'select-pane', 'resize-pane', 'kill-pane', 'set-option',
]);

function findRealTmux() {
  // 从 PATH 中查找真实 tmux，跳过 shim 所在目录
  const shimDir = __dirname;
  const pathDirs = (process.env.PATH || '').split(':');
  for (const dir of pathDirs) {
    if (dir === shimDir) continue;
    const candidate = path.join(dir, 'tmux');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function execRealTmux() {
  const realTmux = findRealTmux();
  if (!realTmux) {
    process.stderr.write('tmux: command not found\n');
    process.exit(127);
  }
  try {
    // 清除假 TMUX 环境变量，避免真实 tmux 误判
    const env = { ...process.env };
    delete env.AUSOME_TMUX_RPC;
    delete env.AUSOME_TMUX_EXPECTED_TMUX;
    // 保留真实 TMUX（如果在真实 tmux 内）或清除假 TMUX
    if (env.TMUX === env.AUSOME_TMUX_EXPECTED_TMUX) {
      delete env.TMUX;
      delete env.TMUX_PANE;
    }
    const result = execFileSync(realTmux, argv, { env, stdio: 'inherit' });
    process.exit(0);
  } catch (e) {
    process.exit(e.status || 1);
  }
}

// 判断是否应该 passthrough
const shouldPassthrough =
  !rpcPath ||                                                          // 无 RPC 路径
  (process.env.AUSOME_TMUX_EXPECTED_TMUX &&
   process.env.TMUX !== process.env.AUSOME_TMUX_EXPECTED_TMUX) ||     // 处于真实 tmux 内
  (argv.length === 0) ||                                               // 无参数启动 tmux
  (argv.length > 0 && !RPC_COMMANDS.has(argv[0]));                     // 非 P0 命令

if (shouldPassthrough) {
  execRealTmux();
}

// 否则走 RPC 逻辑（现有代码）...
```

**对 Windows 的影响**：

- `tmux.cmd` 调用的是同一个 `tmux-shim.js`，passthrough 逻辑同样生效
- Windows 上 `findRealTmux()` 找不到真实 tmux → 返回 "tmux: command not found"
- 对 Agent Teams 正常使用路径（P0 命令）无影响，仍走 RPC

---

### 修改点 3：ProcessManager 注入 AUSOME_TMUX_EXPECTED_TMUX

**改什么**：`src/main/services/ProcessManager.ts` 的 `buildTmuxEnvironment()` 方法。

**修改前** (`ProcessManager.ts:987-998`)：
```typescript
return {
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
  TMUX: tmuxValue,
  TMUX_PANE: tmuxPaneId,
  // ...
};
```

**修改后**：
```typescript
return {
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
  TMUX: tmuxValue,
  TMUX_PANE: tmuxPaneId,
  AUSOME_TMUX_EXPECTED_TMUX: tmuxValue,  // 新增：供 shim 检测真实 tmux 冲突
  // ...
};
```

**对 Windows 的影响**：仅多注入一个环境变量，无功能影响。

---

### 修改点 4：exit 退出后的终端处理

**改什么**：`src/renderer/components/TerminalPane.tsx`，监听 pane 状态变为 Completed/Error 时显示提示。

**修改前**：
- Shell 退出后，终端画面冻结，无任何提示
- 键盘输入被 `ptyWrite` 发送到已销毁的 PTY，静默丢弃
- 用户被困在"死"终端中

**修改后**：
```
Shell 退出
  → StatusDetector 标记为 Completed/Error
  → StatusPoller 广播 pane-status-changed
  → TerminalPane 收到状态变更
  → 在 xterm.js 中写入提示文本：
      "\r\n\x1b[90m[进程已退出，退出码: 0] 按任意键重启终端\x1b[0m"
  → 切换到"等待重启"模式：
      - 下一次 onData 事件不发送到 PTY
      - 而是触发 window:start IPC 重新创建 PTY
      - 清屏并恢复正常输入模式
```

视觉效果：
```
licheng@mac ~/project $ exit
logout

[进程已退出，退出码: 0] 按任意键重启终端 _
```

**对 Windows 的影响**：完全相同的行为，跨平台通用。Windows 上 `exit` 退出 PowerShell/cmd 后同样显示提示。

---

### 修改点 5：macOS xterm.js 键盘适配

**改什么**：`src/renderer/components/TerminalPane.tsx` 的 Terminal 初始化配置。

**修改前** (`TerminalPane.tsx:373-410`)：
```typescript
const terminal = new Terminal({
  cols: 80,
  rows: 30,
  // ... 无 macOS 特定配置
});
```

**修改后**：
```typescript
const isMac = navigator.platform.startsWith('Mac') ||
              navigator.userAgent.includes('Macintosh');

const terminal = new Terminal({
  cols: 80,
  rows: 30,
  macOptionIsMeta: isMac,           // Option 键作为 Meta/Alt（vim/emacs 必需）
  macOptionClickForcesSelection: true, // Option+Click 选择文本而非发送转义序列
  // ... 其余配置不变
});
```

**对 Windows 的影响**：无。`macOptionIsMeta` 和 `macOptionClickForcesSelection` 仅在 macOS 上生效，xterm.js 在非 macOS 平台自动忽略这两个选项。

---

## 四、场景验证矩阵

修改完成后，各场景的预期行为：

### macOS

| 场景 | tmux 兼容 | 真实 tmux | 用户操作 | 预期结果 |
|------|-----------|-----------|----------|----------|
| A1 | 开启 | 未安装 | Claude Code Agent Teams | ✅ 原生分窗格 |
| A2 | 开启 | 未安装 | 用户输入 `tmux` | ⚠️ "tmux: command not found" |
| A3 | 开启 | 已安装 | Claude Code Agent Teams | ✅ 原生分窗格 |
| A4 | 开启 | 已安装 | 用户输入 `tmux` | ✅ 启动真实 tmux（passthrough） |
| A5 | 开启 | 已安装 | 用户在真实 tmux 内用 Claude Code | ✅ Agent Teams 使用真实 tmux 分窗格 |
| A6 | 关闭 | 已安装 | 用户输入 `tmux` | ✅ 启动真实 tmux |
| A7 | 关闭 | 已安装 | Claude Code Agent Teams | ❌ 不可用（需开启 tmux 兼容） |
| A8 | 关闭 | 未安装 | Claude Code Agent Teams | ❌ 不可用 |
| B1 | 任意 | 任意 | 用户输入 `exit` | ✅ 显示退出提示，按任意键重启 |
| B2 | 任意 | 任意 | 用户在 vim 中使用 Option 键 | ✅ Option 作为 Meta/Alt |

### Windows

| 场景 | 修改后行为 | 与修改前对比 |
|------|-----------|-------------|
| Agent Teams 分窗格 | ✅ 正常 | 无变化 |
| 用户输入 `tmux`（P0 命令） | ✅ RPC 处理 | 无变化 |
| 用户输入 `tmux`（无参数） | "tmux: command not found" | 之前：RPC 报错。现在：更友好的提示 |
| 用户输入 `exit` | ✅ 显示退出提示 | 之前：卡住。现在：可重启 |
| xterm.js macOption 配置 | 不生效（非 macOS） | 无变化 |

---

## 五、关于"用户在终端内启动真实 tmux 后使用 Agent Teams"的详细说明

这是最需要仔细处理的场景。分两种情况：

### 情况 A：tmux 兼容开启 + 用户启动真实 tmux

```
Copilot Terminal
  └─ PTY (zsh)                    ← TMUX=fake, AUSOME_TMUX_RPC=socket
       └─ /usr/bin/tmux           ← 用户手动启动真实 tmux
            └─ zsh (tmux pane)    ← TMUX=real（被真实 tmux 覆盖）, AUSOME_TMUX_RPC=socket（继承）
                 └─ claude code
                      └─ tmux split-window  ← shim 检测 TMUX≠EXPECTED → passthrough → 真实 tmux 处理
```

结果：Claude Code 的 Agent Teams 在真实 tmux 内创建分窗格，用户在真实 tmux 界面中看到分窗格效果。这是合理的——用户选择了使用真实 tmux，Agent Teams 就应该在真实 tmux 内工作。

Copilot Terminal 的原生分窗格 UI 不会被触发，不会出现"窗格出现在错误位置"的混乱。

### 情况 B：tmux 兼容关闭 + 用户启动真实 tmux

```
Copilot Terminal
  └─ PTY (zsh)                    ← 无 TMUX, 无 AUSOME_TMUX_RPC
       └─ tmux                    ← 真实 tmux
            └─ zsh (tmux pane)    ← TMUX=real
                 └─ claude code
                      └─ tmux split-window  ← 直接执行真实 tmux（shim 不在 PATH 中）
```

结果：完全使用真实 tmux，Copilot Terminal 不参与。Agent Teams 的分窗格在真实 tmux 内以文本方式渲染。

### 两种情况的用户体验对比

| | 情况 A（兼容开启 + 真实 tmux） | 情况 B（兼容关闭 + 真实 tmux） |
|---|---|---|
| 分窗格渲染 | 真实 tmux 文本渲染 | 真实 tmux 文本渲染 |
| Copilot Terminal 感知 | 不感知（passthrough） | 不感知（shim 不在 PATH） |
| 用户体验 | 一致 | 一致 |

两种情况下用户体验一致，这是正确的——当用户主动进入真实 tmux 后，所有 tmux 操作都应该由真实 tmux 处理。

---

## 六、修改范围总结

| 文件 | 修改类型 | 影响平台 |
|------|----------|----------|
| `electron-builder.yml` | 添加 afterPack hook | macOS/Linux |
| `scripts/after-pack.js` | 新增文件 | macOS/Linux |
| `resources/bin/tmux-shim.js` | 添加 passthrough 逻辑 | 全平台 |
| `src/main/services/ProcessManager.ts` | 注入 AUSOME_TMUX_EXPECTED_TMUX | 全平台 |
| `src/renderer/components/TerminalPane.tsx` | exit 处理 + macOptionIsMeta | 全平台 |

总计修改 4 个现有文件 + 1 个新增文件。对 Windows 现有功能零影响。
