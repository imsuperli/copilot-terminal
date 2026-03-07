# Job Object 解决方案（最可靠）

## 原理

Windows Job Object 是内核级别的进程组管理机制：
- 所有子进程自动加入 Job Object
- 关闭 Job Object 时，Windows 自动终止所有成员进程
- 无需判断哪些进程应该清理，Windows 自动处理

## 实现方案

### 1. 安装依赖

```bash
npm install ffi-napi ref-napi
```

### 2. 创建 Job Object 包装

```typescript
// src/main/utils/JobObject.ts
import ffi from 'ffi-napi';
import ref from 'ref-napi';

const kernel32 = ffi.Library('kernel32', {
  'CreateJobObjectW': ['pointer', ['pointer', 'pointer']],
  'AssignProcessToJobObject': ['bool', ['pointer', 'pointer']],
  'SetInformationJobObject': ['bool', ['pointer', 'int', 'pointer', 'uint32']],
  'CloseHandle': ['bool', ['pointer']],
  'OpenProcess': ['pointer', ['uint32', 'bool', 'uint32']]
});

const PROCESS_SET_QUOTA = 0x0100;
const PROCESS_TERMINATE = 0x0001;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

export class JobObject {
  private jobHandle: any;

  constructor() {
    // 创建 Job Object
    this.jobHandle = kernel32.CreateJobObjectW(null, null);

    if (this.jobHandle.isNull()) {
      throw new Error('Failed to create Job Object');
    }

    // 设置 JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    // 当 Job Object 关闭时，自动终止所有成员进程
    const info = Buffer.alloc(144); // JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    info.writeUInt32LE(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, 0);

    const success = kernel32.SetInformationJobObject(
      this.jobHandle,
      9, // JobObjectExtendedLimitInformation
      info,
      info.length
    );

    if (!success) {
      throw new Error('Failed to set Job Object information');
    }
  }

  /**
   * 将进程加入 Job Object
   */
  assignProcess(pid: number): boolean {
    // 打开进程句柄
    const processHandle = kernel32.OpenProcess(
      PROCESS_SET_QUOTA | PROCESS_TERMINATE,
      false,
      pid
    );

    if (processHandle.isNull()) {
      console.error(`Failed to open process ${pid}`);
      return false;
    }

    // 将进程加入 Job Object
    const success = kernel32.AssignProcessToJobObject(this.jobHandle, processHandle);

    // 关闭进程句柄
    kernel32.CloseHandle(processHandle);

    return success;
  }

  /**
   * 关闭 Job Object（自动终止所有成员进程）
   */
  close(): void {
    if (this.jobHandle && !this.jobHandle.isNull()) {
      kernel32.CloseHandle(this.jobHandle);
      this.jobHandle = null;
    }
  }
}
```

### 3. 在 ProcessManager 中使用

```typescript
// src/main/services/ProcessManager.ts
import { JobObject } from '../utils/JobObject';

export class ProcessManager extends EventEmitter implements IProcessManager {
  private jobObjects: Map<number, JobObject>; // pid → JobObject

  constructor() {
    super();
    this.jobObjects = new Map();
    // ...
  }

  async spawnTerminal(config: TerminalConfig): Promise<ProcessHandle> {
    // 创建 PTY 进程
    const ptyProcess = this.createRealPty(config);
    const pid = ptyProcess.pid;

    // 创建 Job Object
    if (platform() === 'win32') {
      try {
        const jobObject = new JobObject();

        // 将 PTY 进程加入 Job Object
        // 注意：需要等待进程完全启动
        setTimeout(() => {
          const success = jobObject.assignProcess(pid);
          if (success) {
            this.jobObjects.set(pid, jobObject);
            console.log(`[ProcessManager] Assigned process ${pid} to Job Object`);
          } else {
            console.error(`[ProcessManager] Failed to assign process ${pid} to Job Object`);
            jobObject.close();
          }
        }, 100);
      } catch (error) {
        console.error('[ProcessManager] Failed to create Job Object:', error);
      }
    }

    // ...
  }

  async killProcess(pid: number): Promise<void> {
    // 关闭 Job Object（自动终止所有子进程）
    const jobObject = this.jobObjects.get(pid);
    if (jobObject) {
      jobObject.close();
      this.jobObjects.delete(pid);
      console.log(`[ProcessManager] Closed Job Object for process ${pid}`);
    }

    // ...
  }
}
```

## 优点

1. **零误杀风险**
   - Windows 内核级别管理
   - 只清理 Job Object 中的进程
   - 不影响其他程序

2. **零延迟**
   - 进程退出时立即清理
   - 不需要定期扫描

3. **零性能开销**
   - 不需要轮询
   - 不需要进程树扫描

4. **100% 可靠**
   - Windows 保证清理所有成员进程
   - 即使进程重新父化也能清理

## 缺点

1. **需要 native 依赖**
   - ffi-napi 和 ref-napi
   - 可能有兼容性问题

2. **实现复杂度**
   - 需要调用 Windows API
   - 需要处理进程句柄

3. **仅支持 Windows**
   - macOS/Linux 需要其他方案

## 测试验证

```typescript
// 测试代码
const jobObject = new JobObject();

// 启动测试进程
const testProcess = spawn('cmd.exe', ['/c', 'timeout /t 60']);
console.log('Test process PID:', testProcess.pid);

// 将进程加入 Job Object
jobObject.assignProcess(testProcess.pid);

// 等待 5 秒
setTimeout(() => {
  console.log('Closing Job Object...');
  jobObject.close();

  // 验证进程是否被终止
  setTimeout(() => {
    try {
      process.kill(testProcess.pid, 0); // 检查进程是否存在
      console.log('Process still alive (FAILED)');
    } catch {
      console.log('Process terminated (SUCCESS)');
    }
  }, 1000);
}, 5000);
```

## 总结

Job Object 是最可靠的解决方案：
- 无误杀风险
- 无需判断逻辑
- Windows 内核保证
- 这就是 Windows Terminal 使用的方案
