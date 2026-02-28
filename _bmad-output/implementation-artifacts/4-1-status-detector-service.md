# Story 4.1: 状态检测服务（StatusDetector）

Status: done

## Story

As a 开发者,
I want 创建 StatusDetector 服务实现智能状态检测逻辑,
So that 系统可以自动识别窗口的运行状态。

## Acceptance Criteria

1. **Given** 进程管理服务已实现（Epic 2）
   **When** 实现 StatusDetector 服务
   **Then** 可以检测进程是否存活（FR6）

2. **Given** StatusDetector 服务已实现
   **When** 检测进程状态
   **Then** 可以获取进程 CPU 使用率（使用 pidusage 库）

3. **Given** StatusDetector 服务已实现
   **When** 监听终端输出
   **Then** 可以监听 PTY 输出事件（通过 node-pty 的 data 事件）

4. **Given** StatusDetector 服务已实现
   **When** 监听终端输出
   **Then** 可以记录最后输出时间

5. **Given** StatusDetector 服务已实现
   **When** 检测窗口状态
   **Then** 状态检测逻辑：运行中（CPU > 1% 或最近 5s 内有输出）

6. **Given** StatusDetector 服务已实现
   **When** 检测窗口状态
   **Then** 状态检测逻辑：等待输入（CPU < 1% 且最近 5s 内无输出且进程存活）

7. **Given** StatusDetector 服务已实现
   **When** 检测窗口状态
   **Then** 状态检测逻辑：已完成（进程退出且退出码 = 0）

8. **Given** StatusDetector 服务已实现
   **When** 检测窗口状态
   **Then** 状态检测逻辑：出错（进程退出且退出码 ≠ 0 或进程崩溃）

9. **Given** StatusDetector 服务已实现
   **When** 检测窗口状态
   **Then** 状态检测延迟 < 1s（NFR2）

10. **Given** StatusDetector 服务已实现
    **When** 运行状态检测
    **Then** 状态检测不影响终端进程性能（NFR10）

## Tasks / Subtasks

- [x] Task 1: 创建 StatusDetector 服务基础架构 (AC: 1-4)
  - [x] 1.1 创建 `src/main/services/StatusDetector.ts`
  - [x] 1.2 定义 StatusDetector 接口：`detectStatus(pid: number): Promise<WindowStatus>`
  - [x] 1.3 定义 StatusDetector 接口：`subscribeStatusChange(callback: (pid: number, status: WindowStatus) => void): void`
  - [x] 1.4 实现 StatusDetectorImpl 类
  - [x] 1.5 添加 `lastOutputTime: Map<number, number>` 存储最后输出时间
  - [x] 1.6 添加 `cpuUsage: Map<number, number>` 存储 CPU 使用率
  - [x] 1.7 添加 `exitCodes: Map<number, number>` 存储进程退出码

- [x] Task 2: 实现进程存活检测 (AC: 1)
  - [x] 2.1 实现 `isProcessAlive(pid: number): boolean` 方法
  - [x] 2.2 使用 Node.js 的 `process.kill(pid, 0)` 检测进程是否存活
  - [x] 2.3 捕获异常，返回 false 表示进程不存活

- [x] Task 3: 集成 pidusage 库获取 CPU 使用率 (AC: 2)
  - [x] 3.1 安装 pidusage 库：`npm install pidusage`
  - [x] 3.2 安装类型定义：`npm install --save-dev @types/pidusage`
  - [x] 3.3 实现 `getCpuUsage(pid: number): Promise<number>` 方法
  - [x] 3.4 使用 pidusage 获取进程 CPU 使用率
  - [x] 3.5 缓存 CPU 使用率到 `cpuUsage` Map

- [x] Task 4: 监听 PTY 输出事件 (AC: 3-4)
  - [x] 4.1 在 ProcessManager 中暴露 PTY 实例或输出事件
  - [x] 4.2 实现 `onPtyData(pid: number, data: string): void` 方法
  - [x] 4.3 监听 PTY 的 `data` 事件
  - [x] 4.4 更新 `lastOutputTime` Map，记录当前时间戳

- [x] Task 5: 实现状态检测逻辑 (AC: 5-8)
  - [x] 5.1 实现 `detectStatus(pid: number): Promise<WindowStatus>` 方法
  - [x] 5.2 检查进程是否存活，不存活则返回 Completed 或 Error
  - [x] 5.3 获取进程 CPU 使用率
  - [x] 5.4 获取最后输出时间，计算距离当前时间的间隔
  - [x] 5.5 判断状态：CPU > 1% 或最近 5s 内有输出 → Running
  - [x] 5.6 判断状态：CPU < 1% 且最近 5s 内无输出 → WaitingForInput
  - [x] 5.7 判断状态：进程退出且退出码 = 0 → Completed
  - [x] 5.8 判断状态：进程退出且退出码 ≠ 0 → Error

- [x] Task 6: 实现状态变化订阅机制 (AC: 9)
  - [x] 6.1 添加 `statusChangeCallbacks: Array<(pid: number, status: WindowStatus) => void>`
  - [x] 6.2 实现 `subscribeStatusChange(callback)` 方法
  - [x] 6.3 实现定期轮询机制（每 1s 检测一次）
  - [x] 6.4 比较新旧状态，状态变化时触发回调
  - [x] 6.5 确保轮询不阻塞主进程

- [x] Task 7: 性能优化 (AC: 9-10)
  - [x] 7.1 实现活跃窗口检测间隔 1s，非活跃窗口检测间隔 5s
  - [x] 7.2 使用异步操作，避免阻塞主进程
  - [x] 7.3 限制 pidusage 调用频率，避免性能开销
  - [x] 7.4 测试状态检测延迟，确保 < 1s

- [x] Task 8: 集成到 ProcessManager (AC: 1-10)
  - [x] 8.1 修改 `src/main/services/ProcessManager.ts`
  - [x] 8.2 在 ProcessManager 中创建 StatusDetector 实例
  - [x] 8.3 进程创建时，注册 PTY 输出监听
  - [x] 8.4 进程退出时，记录退出码
  - [x] 8.5 暴露 `getWindowStatus(windowId: string): Promise<WindowStatus>` 方法

- [x] Task 9: 编写单元测试 (AC: 1-10)
  - [x] 9.1 创建 `src/main/services/__tests__/StatusDetector.test.ts`
  - [x] 9.2 测试进程存活检测：验证 isProcessAlive 正确性
  - [x] 9.3 测试 CPU 使用率获取：验证 getCpuUsage 正确性
  - [x] 9.4 测试 PTY 输出监听：验证 onPtyData 更新 lastOutputTime
  - [x] 9.5 测试状态检测逻辑：验证 Running, WaitingForInput, Completed, Error 状态判断
  - [x] 9.6 测试状态变化订阅：验证回调被正确触发
  - [x] 9.7 测试性能：验证状态检测延迟 < 1s

## Dev Notes

### 架构约束与技术要求

**StatusDetector 服务设计（架构文档）：**

**职责：** 自动检测窗口状态（运行中/等待输入/已完成/出错）

**检测策略：**

1. **运行中（Running）**
   - 进程存活 + CPU 使用率 > 1%
   - 或：进程存活 + 最近 5s 内有输出

2. **等待输入（WaitingForInput）**
   - 进程存活 + CPU 使用率 < 1%
   - 且：最近 5s 内无输出
   - 且：终端光标可见（通过 PTY 检测）

3. **已完成（Completed）**
   - 进程退出 + 退出码 = 0

4. **出错（Error）**
   - 进程退出 + 退出码 ≠ 0
   - 或：进程崩溃

**技术实现：**
- 使用 `node-pty` 的 PTY 实例监听输出
- 监听 `data` 事件获取 stdout/stderr 输出
- 使用 `pidusage` 库检测 CPU 使用率
- 定期轮询（每 1s）+ 事件驱动（进程退出）

**接口定义（架构文档）：**
```typescript
interface StatusDetector {
  detectStatus(pid: number): Promise<WindowStatus>;
  subscribeStatusChange(callback: (pid: number, status: WindowStatus) => void): void;
}

enum WindowStatus {
  Running = 'running',
  WaitingForInput = 'waiting',
  Completed = 'completed',
  Error = 'error',
  Restoring = 'restoring'
}
```

**核心实现（架构文档）：**
```typescript
import pidusage from 'pidusage';

class StatusDetectorImpl implements StatusDetector {
  private lastOutputTime = new Map<number, number>();
  private cpuUsage = new Map<number, number>();
  private exitCodes = new Map<number, number>();

  async detectStatus(pid: number): Promise<WindowStatus> {
    // 检查进程是否存活
    if (!this.isProcessAlive(pid)) {
      const exitCode = this.exitCodes.get(pid) || 0;
      return exitCode === 0 ? WindowStatus.Completed : WindowStatus.Error;
    }

    // 获取 CPU 使用率
    const stats = await pidusage(pid);
    const cpu = stats.cpu;

    // 获取最后输出时间
    const lastOutput = this.lastOutputTime.get(pid) || 0;
    const timeSinceOutput = Date.now() - lastOutput;

    // 判断状态
    if (cpu > 1.0 || timeSinceOutput < 5000) {
      return WindowStatus.Running;
    }

    return WindowStatus.WaitingForInput;
  }

  onPtyData(pid: number, data: string): void {
    this.lastOutputTime.set(pid, Date.now());
  }

  onProcessExit(pid: number, exitCode: number): void {
    this.exitCodes.set(pid, exitCode);
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
```

**性能优化（架构文档）：**
- 轮询间隔动态调整（活跃窗口 1s，非活跃 5s）
- 仅检测必要的状态信息
- 使用事件驱动 + 轮询混合模式

### UX 规范要点

**状态定义（UX 设计文档）：**

| 状态 | 顶部线条色 | 状态标签 | 说明 |
|------|-----------|---------|------|
| 运行中 | 蓝色 | "运行中" | 进程正在执行 |
| 等待输入 | 黄色/琥珀色 | "等待输入" | 需要用户介入 |
| 已完成 | 绿色 | "已完成" | 进程正常结束 |
| 出错 | 红色 | "出错" | 进程异常退出 |
| 恢复中 | 灰色 | "恢复中" | 启动时进程恢复中 |

**性能要求（UX 设计文档）：**
- 状态更新延迟 < 1s（NFR2）
- 状态检测不影响终端进程性能（NFR10）

### 技术实现指导

**pidusage 库使用：**
```typescript
import pidusage from 'pidusage';

const stats = await pidusage(pid);
console.log(stats.cpu);     // CPU 使用率（百分比）
console.log(stats.memory);  // 内存使用（字节）
```

**进程存活检测：**
```typescript
function isProcessAlive(pid: number): boolean {
  try {
    // signal 0 不会真正发送信号，只检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}
```

**PTY 输出监听：**
```typescript
// 在 ProcessManager 中
ptyProcess.onData((data: string) => {
  statusDetector.onPtyData(ptyProcess.pid, data);
});

ptyProcess.onExit(({ exitCode }) => {
  statusDetector.onProcessExit(ptyProcess.pid, exitCode);
});
```

**定期轮询实现：**
```typescript
class StatusDetectorImpl {
  private pollingInterval: NodeJS.Timeout | null = null;

  startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      for (const pid of this.trackedPids) {
        const newStatus = await this.detectStatus(pid);
        const oldStatus = this.statusCache.get(pid);
        
        if (newStatus !== oldStatus) {
          this.statusCache.set(pid, newStatus);
          this.notifyStatusChange(pid, newStatus);
        }
      }
    }, 1000); // 每 1s 检测一次
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
```

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要忘记安装 pidusage 库 — 必须先安装依赖
2. 不要在主线程阻塞 — 使用异步操作和定期轮询
3. 不要忘记处理进程不存在的情况 — isProcessAlive 必须捕获异常
4. 不要忘记记录进程退出码 — 用于区分 Completed 和 Error
5. 不要频繁调用 pidusage — 限制调用频率，避免性能开销
6. 不要忘记清理定时器 — stopPolling 必须清理 setInterval
7. 不要忘记测试边界情况 — 进程不存在、进程崩溃、CPU 为 0 等
8. 不要忘记性能测试 — 必须验证状态检测延迟 < 1s

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
└── main/
    ├── services/
    │   ├── StatusDetector.ts                   # 新建 - 状态检测服务
    │   ├── ProcessManager.ts                   # 修改 - 集成 StatusDetector
    │   └── __tests__/
    │       └── StatusDetector.test.ts          # 新建 - StatusDetector 测试
    └── types/
        └── window.ts                           # 修改（可选）- WindowStatus 枚举
```

**与统一项目结构的对齐：**
- 主进程服务放在 `src/main/services/`
- 类型定义放在 `src/main/types/` 或 `src/shared/types/`
- 测试文件在对应模块的 `__tests__/` 目录

**依赖安装：**
```bash
npm install pidusage
npm install --save-dev @types/pidusage
```

### References

- [Source: epics.md#Story 4.1 - 状态检测服务验收标准]
- [Source: epics.md#Epic 4: 智能状态追踪]
- [Source: architecture.md#StatusDetector 服务设计]
- [Source: architecture.md#数据模型设计 - WindowStatus]
- [Source: architecture.md#性能优化策略 - 状态检测优化]
- [Source: ux-design-specification.md#Component Strategy - WindowCard 状态定义]
- [Source: 2-1-process-management-service-infrastructure.md - ProcessManager 服务]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None

### Completion Notes List

- 安装了 pidusage 和 @types/pidusage 依赖
- 创建了 StatusDetectorImpl 服务，实现所有 AC 要求的状态检测逻辑
- 修改了 ProcessManager 集成 StatusDetector，注册 PTY 数据和进程退出事件
- 新增 getWindowStatus 和 subscribeStatusChange 方法到 ProcessManager
- 编写了 22 个单元测试，覆盖所有状态检测场景

### Code Review Notes (2026-02-28)

**审查者:** claude-sonnet-4-6
**结果:** 通过（修复后）

**修复的问题：**
- [H1] 所有 Tasks/Subtasks 标记更新为 [x]（文档与实现不符）
- [H2] 修复 ProcessManager 中 trackPid 调用顺序：改为在注册 PTY 监听器之前调用，消除竞态条件
- [H3] getWindowStatus 找不到 windowId 时改为抛出异常，而非错误返回 WindowStatus.Error
- [M1] 更新 File List，补充 package.json 和 package-lock.json
- [M2] detectStatus 中进程崩溃（无退出码记录）时默认返回 Error 而非 Completed
- [M3] 更新 IProcessManager 接口，补充 getWindowStatus、subscribeStatusChange、destroy 方法声明
- [M4] subscribeStatusChange 改为返回取消订阅函数，防止内存泄漏
- 新增 2 个测试用例：进程崩溃返回 Error、取消订阅功能验证（共 22 个测试）

### File List

- src/main/services/StatusDetector.ts (新建)
- src/main/services/ProcessManager.ts (修改)
- src/main/services/__tests__/StatusDetector.test.ts (新建)
- src/main/types/process.ts (修改 - 更新 IProcessManager 接口)
- package.json (修改 - 添加 pidusage 依赖)
- package-lock.json (修改 - 锁定 pidusage 依赖)
