# 隐藏 Claude Code Agent 初始化长命令方案

## 问题描述

当使用 Synapse 的 tmux 兼容层启动 Claude Code Agent Teams 时，Claude Code 会自动输入一条非常长的初始化命令，例如：

```powershell
Set-Location -LiteralPath 'D:\tmp'; $env:CLAUDECODE = '1'; $env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'; $env:ANTHROPIC_BASE_URL = 'https://subus.imds.ai/'; $env:TMUX = '\.pipeausome-tmux-default,44236,0'; $env:TMUX_PANE = '%3'; $env:AUSOME_TERMINAL_WINDOW_ID = 'd5658017-b574-414d-b02c-7441881bbcb8'; $env:AUSOME_TERMINAL_PANE_ID = '342f8da9-d7bc-4699-a3b9-30274b846c1d'; $env:AUSOME_TMUX_RPC = '\\.\pipe\ausome-tmux-d5658017-b574-414d-b02c-7441881bbcb8'; $env:AUSOME_TMUX_LOG_FILE = 'C:\Users\licheng2\AppData\Local\Temp\synapse-tmux-debug.log'; & 'node' 'D:\ProgramData\nodejs\node\_global\node_modules\@anthropic-ai\claude-code\cli.js' '--agent-id' 'con-debater@crystalline-wishing-scott' '--agent-name' 'con-debater' '--team-name' 'crystalline-wishing-scott' '--agent-color' 'green' '--parent-session-id' 'cc1d2799-965c-4fcd-82d5-44067190f6f0' '--agent-type' 'general-purpose' '--dangerously-skip-permissions' '--model' 'claude-opus-4-6'
```

**问题影响：**
- 命令长度约 950 字符，在终端中占据 10+ 行
- 严重干扰用户体验和视觉焦点
- Shell 历史记录被污染
- 难以阅读和理解终端输出

## 方案对比

### 方案 A：包装脚本（已否决）

**思路：** 创建跨平台包装脚本（.ps1/.sh/.bat），将长命令封装为短命令。

**缩短效果分析：**
- 原始命令：~950 字符
- 包装脚本版本：~350 字符（仍占 3-4 行）
- 节省：63%

**问题：**
1. **缩短效果有限**：虽然减少了 63%，但 Claude Code 的参数本身就很长（agent-id、parent-session-id 等），无法进一步压缩
2. **跨平台复杂度高**：需要维护 3 种不同格式的脚本
   - PowerShell: `.ps1`
   - Bash/Zsh: `.sh`
   - CMD: `.bat`
3. **解析复杂**：需要解析 Claude Code 的命令格式，提取参数并重构命令
4. **维护成本高**：Claude Code 更新命令格式时，解析逻辑也要同步更新
5. **容错性差**：命令格式变化会导致解析失败

### 方案 B：完全隐藏命令输入（推荐）

**思路：** 在 tmux 兼容层拦截 Claude Code 的初始化命令，不发送到 PTY，而是显示简短提示并在后台静默执行。

**用户看到的效果：**
```powershell
PS D:\tmp> # Starting Claude Code agent: con-debater (green)
```

**优点：**
1. **视觉效果最佳**：只显示一行简短提示
2. **跨平台统一**：不需要维护多个脚本文件
3. **实现简单**：不需要解析和重构命令
4. **维护成本低**：Claude Code 命令格式变化不影响实现
5. **Shell 历史干净**：不记录长命令

**缺点：**
1. 用户无法直接看到完整命令（可通过调试模式查看）
2. 需要在 PTY 层面处理命令执行

## 推荐方案详细设计

### 架构层次

```
Claude Code (send-keys 命令)
    ↓
TmuxRpcServer (接收 RPC 请求)
    ↓
TmuxCompatService.handleSendKeys() ← 【拦截点】
    ↓
ProcessManager.write() (写入 PTY)
    ↓
Shell 进程
```

### 实现步骤

#### 1. 命令检测

在 `TmuxCompatService.handleSendKeys()` 中检测 Claude Code agent 初始化命令：

**检测特征：**
- 包含 `claude-code` 或 `cli.js`
- 包含 `--agent-id` 和 `--agent-name` 参数
- 设置多个环境变量（CLAUDECODE、TMUX、AUSOME_* 等）

**检测逻辑：**
```typescript
private isClaudeCodeAgentInit(keys: string): boolean {
  return (
    keys.includes('claude-code') &&
    keys.includes('--agent-id') &&
    keys.includes('--agent-name')
  );
}
```

#### 2. 提取关键信息

从原始命令中提取用户关心的信息：
- Agent 名称（`--agent-name`）
- Agent 颜色（`--agent-color`）
- 工作目录（`Set-Location` 或 `cd`）

**提取逻辑：**
```typescript
private extractAgentInfo(keys: string): {
  name: string;
  color: string;
  cwd: string;
} {
  const nameMatch = keys.match(/--agent-name['"]?\s+['"]?([^'"]+)/);
  const colorMatch = keys.match(/--agent-color['"]?\s+['"]?([^'"]+)/);
  const cwdMatch = keys.match(/Set-Location.*?['"]([^'"]+)|cd\s+['"]?([^'"]+)/);

  return {
    name: nameMatch?.[1] || 'unknown',
    color: colorMatch?.[1] || 'default',
    cwd: cwdMatch?.[1] || cwdMatch?.[2] || ''
  };
}
```

#### 3. 显示简短提示

根据 Shell 类型生成简短提示命令：

**PowerShell:**
```powershell
Write-Host "# Starting Claude Code agent: con-debater (green)" -ForegroundColor Gray
```

**Bash/Zsh:**
```bash
echo -e "\033[90m# Starting Claude Code agent: con-debater (green)\033[0m"
```

**CMD:**
```cmd
echo # Starting Claude Code agent: con-debater (green)
```

#### 4. 后台执行原始命令

使用 Shell 的静默执行机制：

**PowerShell:**
```typescript
// 方法 1：使用 Start-Process -NoNewWindow -Wait
const silentCmd = `Start-Process -NoNewWindow -Wait -FilePath "powershell" -ArgumentList "-NoProfile", "-Command", "${escapedOriginalCmd}"`;

// 方法 2：重定向输出到 $null（但保留 stderr）
const silentCmd = `${originalCmd} > $null`;

// 方法 3：使用 Invoke-Expression（推荐）
const silentCmd = `Invoke-Expression "${escapedOriginalCmd}"`;
```

**Bash/Zsh:**
```typescript
// 直接执行，不显示命令本身
const silentCmd = originalCmd; // bash 不会回显通过程序输入的命令
```

**CMD:**
```typescript
// 使用 @echo off
const silentCmd = `@echo off\n${originalCmd}\n@echo on`;
```

#### 5. 完整处理流程

```typescript
async handleSendKeys(
  windowId: string,
  paneId: string | undefined,
  keys: string,
  literalKeys: boolean
): Promise<void> {
  // 1. 检测是否为 Claude Code agent 初始化命令
  if (this.isClaudeCodeAgentInit(keys)) {
    // 2. 提取关键信息
    const agentInfo = this.extractAgentInfo(keys);

    // 3. 生成简短提示
    const promptCmd = this.generatePromptCommand(agentInfo);

    // 4. 发送提示到终端
    await this.processManager.write(windowId, paneId, promptCmd + '\n');

    // 5. 后台执行原始命令（不显示）
    await this.processManager.write(windowId, paneId, keys + '\n');

    // 6. 记录日志（调试用）
    if (this.config.debug) {
      console.log('[TmuxCompat] Hidden Claude Code init command:', keys);
    }

    return;
  }

  // 非 Claude Code 命令，正常处理
  await this.processManager.write(windowId, paneId, keys + '\n');
}
```

### 调试支持

为了方便调试和问题排查，提供以下机制：

#### 1. 环境变量控制

```bash
# 禁用命令隐藏（显示完整命令）
export AUSOME_TMUX_SHOW_FULL_COMMANDS=1
```

#### 2. 日志记录

在 `TmuxCompatService` 的调试日志中记录被隐藏的命令：

```typescript
if (this.config.debug) {
  const logFile = process.env.AUSOME_TMUX_LOG_FILE;
  if (logFile) {
    fs.appendFileSync(logFile,
      `[${new Date().toISOString()}] Hidden command: ${keys}\n`
    );
  }
}
```

#### 3. 用户通知

在设置面板中添加选项，允许用户选择是否隐藏长命令：

```typescript
interface TmuxSettings {
  hideClaudeCodeCommands: boolean; // 默认 true
}
```

### 边界情况处理

#### 1. 命令执行失败

如果后台执行失败，显示错误提示：

```typescript
try {
  await this.processManager.write(windowId, paneId, keys + '\n');
} catch (error) {
  const errorMsg = this.generateErrorMessage(agentInfo, error);
  await this.processManager.write(windowId, paneId, errorMsg + '\n');
}
```

#### 2. 非标准命令格式

如果 Claude Code 更新了命令格式，检测失败时回退到正常处理：

```typescript
if (!this.isClaudeCodeAgentInit(keys)) {
  // 回退到正常处理
  await this.processManager.write(windowId, paneId, keys + '\n');
  return;
}
```

#### 3. 多行命令

如果命令包含换行符（多行命令），需要特殊处理：

```typescript
if (keys.includes('\n')) {
  // 分行处理
  const lines = keys.split('\n');
  // ...
}
```

## 实现文件清单

需要修改的文件：

1. **`src/main/services/TmuxCompatService.ts`**
   - 添加 `isClaudeCodeAgentInit()` 方法
   - 添加 `extractAgentInfo()` 方法
   - 添加 `generatePromptCommand()` 方法
   - 修改 `handleSendKeys()` 方法

2. **`src/shared/types/tmux.ts`**
   - 添加 `AgentInfo` 接口
   - 添加 `TmuxSettings` 接口（如果需要用户配置）

3. **`src/renderer/components/SettingsPanel.tsx`**（可选）
   - 添加"隐藏长命令"开关

## 测试计划

### 单元测试

```typescript
describe('TmuxCompatService - Claude Code command hiding', () => {
  it('should detect Claude Code agent init command', () => {
    const service = new TmuxCompatService(config);
    const cmd = "Set-Location 'D:\\tmp'; & 'node' 'claude-code\\cli.js' '--agent-id' 'test'";
    expect(service.isClaudeCodeAgentInit(cmd)).toBe(true);
  });

  it('should extract agent info correctly', () => {
    const service = new TmuxCompatService(config);
    const cmd = "--agent-name 'con-debater' --agent-color 'green'";
    const info = service.extractAgentInfo(cmd);
    expect(info.name).toBe('con-debater');
    expect(info.color).toBe('green');
  });

  it('should generate correct prompt for PowerShell', () => {
    const service = new TmuxCompatService(config);
    const info = { name: 'test-agent', color: 'blue', cwd: 'D:\\tmp' };
    const prompt = service.generatePromptCommand(info, 'powershell');
    expect(prompt).toContain('Write-Host');
    expect(prompt).toContain('test-agent');
  });
});
```

### 集成测试

1. **PowerShell 环境测试**
   - 启动 Claude Code Agent Teams
   - 验证只显示简短提示
   - 验证 agent 正常启动

2. **Bash 环境测试（macOS）**
   - 同上

3. **CMD 环境测试（Windows）**
   - 同上

4. **调试模式测试**
   - 设置 `AUSOME_TMUX_SHOW_FULL_COMMANDS=1`
   - 验证显示完整命令

## 性能影响

- **命令检测**：正则匹配，时间复杂度 O(n)，n 为命令长度（~1ms）
- **信息提取**：正则匹配，时间复杂度 O(n)（~1ms）
- **提示生成**：字符串拼接，时间复杂度 O(1)（<0.1ms）
- **总开销**：<5ms，对用户体验无影响

## 未来优化

1. **智能识别**：使用 AST 解析而非正则匹配，提高准确性
2. **自定义规则**：允许用户配置需要隐藏的命令模式
3. **命令历史**：提供 UI 查看被隐藏的命令历史
4. **多语言支持**：提示信息支持国际化

## 参考资料

- Claude Code Agent Teams 文档
- tmux 兼容层架构文档：`docs/tmux-compat-architecture.md`
- tmux 用户指南：`docs/tmux-user-guide.md`
- tmux 开发指南：`docs/tmux-developer-guide.md`
