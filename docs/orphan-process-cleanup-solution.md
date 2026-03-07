# 孤儿进程清理解决方案

## 问题分析

### 现象
在 Claude Code CLI 中启用 ccstatusline 或其他插件后，出现 bash.exe 和 cygpath.exe 进程泄漏，持续占用 CPU。

### 根本原因

#### 1. Windows Terminal 正常，我们的不正常的原因

**不是因为 ConPTY vs winpty**：
- 我们已经在使用 ConPTY（`ptyProcess.constructor.name === 'WindowsTerminal'`）
- Windows Terminal 也使用 ConPTY
- 所以问题不在后端选择上

**真正的原因：进程重新父化（Process Reparenting）**

```
进程树（正常情况）：
conhost.exe (PID 1000) ← ptyProcess.pid
  └─ pwsh.exe (PID 2000)
      └─ node.exe (Claude Code, PID 3000)
          └─ node.exe (ccstatusline, PID 4000)
              └─ git.exe (PID 5000)
                  └─ bash.exe (PID 6000)
                      └─ cygpath.exe (PID 7000)

进程树（ccstatusline 退出后）：
conhost.exe (PID 1000)
  └─ pwsh.exe (PID 2000)
      └─ node.exe (Claude Code, PID 3000)
          ├─ bash.exe (PID 6000) ← 重新父化到 Claude Code
          └─ cygpath.exe (PID 7000) ← 重新父化到 Claude Code
```

**为什么会重新父化**：
- ccstatusline 进程（PID 4000）快速退出
- 它的子进程（git/bash/cygpath）还在运行
- Windows 将这些孤儿进程重新父化到最近的祖先进程（Claude Code）
- 当我们调用 `taskkill /F /T /PID 1000` 时，这些进程仍然在进程树中，但已经不是 ccstatusline 的子进程了

**为什么 Windows Terminal 没有这个问题**：
- Windows Terminal 使用 Job Object 管理进程
- Job Object 是 Windows 内核级别的进程组管理机制
- 所有子进程自动加入 Job Object，无论是否重新父化
- 当 Job Object 关闭时，Windows 自动终止所有成员进程

#### 2. 为什么 bash.exe 和 cygpath.exe 会泄漏

**Git for Windows 的特殊性**：
- Git for Windows 基于 MSYS2/Cygwin
- 每次 git 命令都可能启动 bash.exe 来执行 hooks 或脚本
- bash.exe 可能调用 cygpath.exe 来转换路径

**泄漏场景**：
```bash
# ccstatusline 执行 git 命令
git branch --show-current

# git.exe 内部启动 bash.exe
bash.exe -c "some git hook"

# bash.exe 调用 cygpath.exe
cygpath.exe -w /c/Users/...

# ccstatusline 退出，但 bash.exe 和 cygpath.exe 还在运行
# 这些进程被重新父化，变成孤儿进程
```

**为什么持续占用 CPU**：
- 这些进程可能在等待 stdin 输入（阻塞读取）
- 或者陷入某种错误循环
- 累积效应：每次 Claude Code 状态更新都可能泄漏 1-2 个进程

## 解决方案

### 方案 1：使用 Job Object（最可靠，推荐）

**原理**：
- 使用 Windows Job Object API 管理 PTY 进程树
- 所有子进程自动加入 Job Object
- 关闭 Job Object 时，Windows 自动终止所有成员进程

**实现**：
需要使用 Node.js 的 native addon 或 ffi-napi 调用 Windows API：
- `CreateJobObject`
- `AssignProcessToJobObject`
- `SetInformationJobObject` (设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`)
- `CloseHandle`

**优点**：
- 最可靠，Windows 内核级别保证
- 不会有任何进程泄漏
- 性能开销极小

**缺点**：
- 需要编写 native addon 或使用 ffi-napi
- 实现复杂度较高

### 方案 2：定期清理孤儿进程（简单，推荐）

**原理**：
- 创建后台服务，每 30 秒扫描一次
- 查找可疑进程（bash.exe, cygpath.exe, sh.exe）
- 检查是否是孤儿进程（父进程不在 PTY 进程树中）
- 终止孤儿进程

**实现**：
已实现在 `src/main/services/OrphanProcessCleaner.ts`

**优点**：
- 实现简单，纯 JavaScript
- 不需要 native addon
- 可以处理各种插件导致的进程泄漏

**缺点**：
- 有延迟（最多 30 秒）
- 可能误杀正常进程（概率很低）

### 方案 3：改进 PTY 清理机制（补充方案）

**原理**：
- 在 PTY 退出时，不仅终止 PTY 进程，还要扫描并终止所有相关子进程
- 使用 `wmic` 递归查找所有子进程

**实现**：
```typescript
private async killProcessTreeRecursive(pid: number): Promise<void> {
  // 1. 获取所有子进程（递归）
  const allPids = this.getAllDescendantPids(pid);

  // 2. 从叶子节点开始终止（避免重新父化）
  for (const childPid of allPids.reverse()) {
    try {
      execSync(`taskkill /F /PID ${childPid}`, { stdio: 'ignore' });
    } catch {
      // Ignore
    }
  }

  // 3. 最后终止根进程
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
  } catch {
    // Ignore
  }
}
```

**优点**：
- 在进程退出时立即清理
- 没有延迟

**缺点**：
- 可能无法捕获所有子进程（如果子进程创建速度很快）
- 仍然可能有进程泄漏（如果在扫描和终止之间有新进程创建）

### 方案 4：限制 Claude Code 状态更新频率（治本）

**原理**：
- 减少 ccstatusline 的调用频率
- 从根源上减少进程创建和泄漏的机会

**实现**：
需要修改 Claude Code 的配置（如果支持）或提交功能请求。

**优点**：
- 从根源解决问题
- 减少 CPU 和内存开销

**缺点**：
- 需要 Claude Code 支持
- 可能影响状态栏的实时性

## 推荐实施方案

### 短期（立即实施）

**方案 2：定期清理孤儿进程**

1. 启用 `OrphanProcessCleaner` 服务
2. 在 `ProcessManager` 中注册 PTY 进程 PID
3. 每 30 秒自动清理孤儿进程

**实施步骤**：
```typescript
// src/main/index.ts
import { OrphanProcessCleaner } from './services/OrphanProcessCleaner';

const orphanCleaner = new OrphanProcessCleaner();
orphanCleaner.start(30000); // 每 30 秒清理一次

// 在应用退出时停止
app.on('will-quit', () => {
  orphanCleaner.stop();
});
```

```typescript
// src/main/services/ProcessManager.ts
constructor(private orphanCleaner: OrphanProcessCleaner) {
  // ...
}

async spawnTerminal(config: TerminalConfig): Promise<ProcessHandle> {
  // ...
  this.orphanCleaner.registerPtyPid(pid);
  // ...
}

async killProcess(pid: number): Promise<void> {
  // ...
  this.orphanCleaner.unregisterPtyPid(pid);
  // ...
}
```

### 中期（如果短期方案效果不佳）

**方案 1：使用 Job Object**

1. 研究 ffi-napi 或编写 native addon
2. 实现 Job Object 包装
3. 在 PTY 创建时使用 Job Object

### 长期（根本解决）

**方案 4：与 Claude Code 团队合作**

1. 向 Anthropic 提交功能请求
2. 建议添加状态更新频率限制
3. 或者提供更高效的状态通知机制（如 IPC）

## 测试验证

### 验证进程泄漏

```powershell
# 1. 启动应用并打开 Claude Code CLI
# 2. 等待 1-2 分钟（让 Claude Code 生成一些输出）
# 3. 检查可疑进程

Get-Process | Where-Object { $_.ProcessName -like "*bash*" -or $_.ProcessName -like "*cygpath*" -or $_.ProcessName -like "*sh*" } | Format-Table ProcessName, Id, CPU, StartTime

# 4. 检查进程树
wmic process where "name='bash.exe' or name='cygpath.exe'" get ProcessId,ParentProcessId,CommandLine,CreationDate
```

### 验证清理效果

```powershell
# 1. 启用 OrphanProcessCleaner
# 2. 等待 30 秒
# 3. 检查孤儿进程是否被清理

Get-Process | Where-Object { $_.ProcessName -like "*bash*" -or $_.ProcessName -like "*cygpath*" } | Measure-Object
```

## 总结

**问题根源**：
- 不是 ConPTY vs winpty 的问题
- 而是进程重新父化导致的孤儿进程泄漏
- Windows Terminal 使用 Job Object 避免了这个问题

**推荐方案**：
- 短期：使用 `OrphanProcessCleaner` 定期清理（简单、有效）
- 中期：如果效果不佳，考虑使用 Job Object（最可靠）
- 长期：与 Claude Code 团队合作，从根源解决

**预期效果**：
- CPU 使用率恢复正常
- 不再有进程泄漏
- 可以安全地使用 ccstatusline 和其他插件
