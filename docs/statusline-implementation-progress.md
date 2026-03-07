# Claude StatusLine 插件 - 设置面板实现

## 已完成的功能

### 1. 类型定义扩展

**文件**：`src/main/types/workspace.ts`

添加了 `StatusLineConfig` 接口：
```typescript
export interface StatusLineConfig {
  enabled: boolean;                    // 是否启用插件
  displayLocation: 'cli' | 'card' | 'both';  // 展示位置
  cliFormat: 'full' | 'compact';       // CLI 状态栏格式
  cardFormat: 'full' | 'compact' | 'badge';  // WindowCard 格式
  showModel: boolean;                  // 显示模型名称
  showContext: boolean;                // 显示上下文百分比
  showCost: boolean;                   // 显示成本
  showTime: boolean;                   // 显示会话时长
  showTokens: boolean;                 // 显示 Token 统计
}
```

### 2. 默认配置

**文件**：`src/main/utils/statusLineDefaults.ts`

提供默认配置：
- 默认禁用
- 展示位置：两者都显示
- CLI 格式：完整版
- WindowCard 格式：简化版
- 显示内容：模型 + 上下文 + 成本

### 3. 设置面板 UI

**文件**：`src/renderer/components/SettingsPanel.tsx`

添加了新的 Tab："Claude StatusLine"

#### 配置选项

1. **启用开关**
   - 一键启用/禁用插件
   - 启用后自动配置 Claude Code（待实现）

2. **展示位置**
   - 只在 Claude Code CLI 状态栏
   - 只在窗口卡片
   - 两者都显示（推荐）

3. **CLI 状态栏格式**
   - 完整版：`Model: Sonnet 4.6 | Context: 45% | Cost: $0.25`
   - 简洁版：`Sonnet 4.6 • 45% • $0.25`

4. **窗口卡片格式**
   - 完整版：`Model: Sonnet 4.6 | Context: 45% | Cost: $0.25`
   - 简化版：`🤖 Sonnet 4.6 • 45%`（推荐）
   - 徽章版：小图标 + 模型名称

5. **显示内容**
   - ✅ 模型名称（必选）
   - ☑️ 上下文百分比
   - ☑️ 成本
   - ☐ 会话时长
   - ☐ Token 统计

## 待实现的功能

### 1. 插件核心实现

**目录**：`src/statusline/`

需要创建：
- `index.ts` - 插件入口，读取 stdin 并解析 JSON
- `ipc-client.ts` - 通过命名管道与主进程通信
- `renderer.ts` - 渲染状态栏输出
- `types.ts` - 类型定义

### 2. IPC 通信服务

**文件**：`src/main/services/StatusLineIPCServer.ts`

需要实现：
- 创建命名管道服务器（Windows: `\\.\pipe\ausome-terminal-statusline`）
- 监听插件发送的模型信息
- 更新窗口状态
- 通知渲染进程更新 UI

### 3. Claude Code 自动配置

**文件**：`src/main/utils/claudeCodeConfig.ts`

需要实现：
- 读取/写入 `~/.claude/settings.json`
- 配置 statusLine 命令指向我们的插件
- 备份原有配置
- 恢复配置（禁用时）

### 4. WindowCard 集成

**文件**：`src/renderer/components/WindowCard.tsx`

需要实现：
- 显示模型信息
- 根据配置选择格式（完整版/简化版/徽章版）
- 颜色方案：
  - Sonnet: 蓝色
  - Opus: 紫色
  - Haiku: 绿色
  - Codex: 橙色

### 5. 插件构建和打包

**配置**：`tsconfig.json` 或单独的构建配置

需要：
- 将 `src/statusline/` 编译为独立的 JS 文件
- 确保可以被 Node.js 直接执行
- 处理依赖（如果有）

## 实现优先级

### P0（核心功能）
1. ✅ 设置面板 UI
2. ⏳ 插件核心实现（读取 stdin，解析 JSON，输出状态栏）
3. ⏳ IPC 通信（插件 → 主进程）
4. ⏳ Claude Code 自动配置

### P1（增强功能）
1. ⏳ WindowCard 集成
2. ⏳ 颜色方案实现
3. ⏳ 格式化选项实现

### P2（优化功能）
1. ⏳ 错误处理和日志
2. ⏳ 配置验证
3. ⏳ 性能优化

## 技术细节

### IPC 通信方案

**命名管道**（推荐）：
```typescript
// 主进程
const pipeName = '\\\\.\\pipe\\ausome-terminal-statusline';
const server = net.createServer((socket) => {
  socket.on('data', (data) => {
    const message = JSON.parse(data.toString());
    handleModelUpdate(message);
  });
});
server.listen(pipeName);

// 插件进程
const client = net.connect(pipeName);
client.write(JSON.stringify({
  windowId: process.env.AUSOME_TERMINAL_WINDOW_ID,
  model: 'claude-sonnet-4-6',
  contextPercentage: 45,
  cost: 0.25
}));
client.end();
```

### 进程管理

**关键点**：
- 插件进程生命周期短（< 100ms）
- 不启动任何子进程
- 不执行外部命令（避免进程泄漏）
- 快速退出

### 环境变量传递

在启动 PTY 时注入环境变量：
```typescript
const ptyProcess = pty.spawn(shell, [], {
  env: {
    ...process.env,
    AUSOME_TERMINAL_WINDOW_ID: windowId,
    AUSOME_TERMINAL_IPC_PIPE: pipeName
  }
});
```

## 下一步

1. 实现插件核心（`src/statusline/index.ts`）
2. 实现 IPC 服务器（`src/main/services/StatusLineIPCServer.ts`）
3. 实现 Claude Code 自动配置（`src/main/utils/claudeCodeConfig.ts`）
4. 测试完整流程
5. 集成到 WindowCard

## 测试计划

### 单元测试
- 插件 JSON 解析
- 状态栏格式化
- IPC 通信

### 集成测试
- 完整流程：Claude Code → 插件 → IPC → 主进程 → UI
- 配置切换
- 启用/禁用

### 性能测试
- 插件执行时间（目标 < 50ms）
- IPC 通信延迟（目标 < 10ms）
- 无进程泄漏
