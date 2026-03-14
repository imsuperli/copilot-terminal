# 窗口组功能性能测试方案

## 测试目标

确保窗口组功能在各种场景下的性能表现符合用户期望，不会导致应用卡顿或内存泄漏。

## 性能基准指标

### 1. 渲染性能
- **初始渲染时间**：< 500ms（10 个窗口的组）
- **窗口切换响应时间**：< 100ms
- **拖拽调整大小帧率**：> 30 FPS
- **组视图激活时间**：< 300ms

### 2. 内存使用
- **基础内存占用**：< 200MB（空应用）
- **每个窗口内存增量**：< 50MB
- **长时间运行内存增长**：< 100MB/小时
- **内存泄漏**：无

### 3. CPU 使用
- **空闲状态 CPU 使用率**：< 5%
- **渲染时 CPU 使用率**：< 80%
- **批量操作 CPU 使用率**：< 90%

### 4. 响应时间
- **IPC 调用响应时间**：< 50ms
- **状态更新响应时间**：< 20ms
- **PTY 进程启动时间**：< 300ms/进程

## 测试环境

### 硬件配置
- CPU：Intel Core i5 或更高
- 内存：8GB 或更高
- 硬盘：SSD

### 软件配置
- 操作系统：Windows 11 Pro
- Node.js：最新 LTS 版本
- Electron：项目使用的版本

### 测试工具
- **React Profiler**：测量组件渲染性能
- **Chrome DevTools**：监控内存和 CPU 使用
- **Performance API**：测量操作响应时间
- **自定义性能监控脚本**：批量操作性能测试

## 测试场景

### 场景 1：包含 10 个窗口的组渲染性能

#### 测试步骤
1. 创建 10 个窗口
2. 将所有窗口添加到一个组
3. 激活组视图
4. 使用 React Profiler 测量渲染时间

#### 测量指标
- 初始渲染时间
- 组件渲染次数
- 渲染阶段耗时
- Commit 阶段耗时

#### 测试脚本
```typescript
// src/renderer/utils/performanceTest.ts
export async function testGroupRenderingPerformance() {
  const startTime = performance.now();

  // 创建 10 个窗口
  const windowIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const windowId = await window.electronAPI.createWindow({
      name: `Test Window ${i + 1}`,
      path: process.cwd(),
    });
    windowIds.push(windowId);
  }

  // 创建组
  const groupId = await window.electronAPI.createGroup({
    name: 'Performance Test Group',
    windowIds,
  });

  // 激活组视图
  const activateStartTime = performance.now();
  await window.electronAPI.activateGroup(groupId);
  const activateEndTime = performance.now();

  const endTime = performance.now();

  return {
    totalTime: endTime - startTime,
    activateTime: activateEndTime - activateStartTime,
  };
}
```

#### 预期结果
- 总时间 < 5 秒
- 激活时间 < 500ms

---

### 场景 2：频繁切换窗口焦点

#### 测试步骤
1. 创建包含 5 个窗口的组
2. 激活组视图
3. 每秒切换 5 次窗口焦点，持续 10 秒
4. 使用 React Profiler 测量性能

#### 测量指标
- 每次切换响应时间
- 总渲染次数
- 内存使用变化
- CPU 使用率

#### 测试脚本
```typescript
export async function testWindowSwitchingPerformance() {
  const groupId = 'test-group-id';
  const windowIds = ['window-1', 'window-2', 'window-3', 'window-4', 'window-5'];

  const switchTimes: number[] = [];
  const iterations = 50; // 10 秒 * 5 次/秒

  for (let i = 0; i < iterations; i++) {
    const windowId = windowIds[i % windowIds.length];
    const startTime = performance.now();

    // 切换窗口焦点
    await window.electronAPI.focusWindowInGroup(groupId, windowId);

    const endTime = performance.now();
    switchTimes.push(endTime - startTime);

    // 等待 200ms
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return {
    averageTime: switchTimes.reduce((a, b) => a + b, 0) / switchTimes.length,
    maxTime: Math.max(...switchTimes),
    minTime: Math.min(...switchTimes),
  };
}
```

#### 预期结果
- 平均响应时间 < 100ms
- 最大响应时间 < 200ms
- 无内存泄漏

---

### 场景 3：拖拽调整窗口大小

#### 测试步骤
1. 创建包含 2 个窗口的组（水平分割）
2. 激活组视图
3. 快速拖拽分隔线 50 次
4. 测量帧率和响应时间

#### 测量指标
- 拖拽帧率（FPS）
- 拖拽响应延迟
- CPU 使用率
- 内存使用变化

#### 测试脚本
```typescript
export async function testResizePerformance() {
  const groupId = 'test-group-id';
  const frameTimes: number[] = [];
  let lastFrameTime = performance.now();

  // 模拟拖拽
  const resizeHandler = () => {
    const currentTime = performance.now();
    frameTimes.push(currentTime - lastFrameTime);
    lastFrameTime = currentTime;
  };

  // 监听 resize 事件
  window.addEventListener('resize', resizeHandler);

  // 模拟 50 次拖拽
  for (let i = 0; i < 50; i++) {
    const newSize = 0.3 + (i % 40) * 0.01; // 0.3 到 0.7 之间变化
    await window.electronAPI.updateGroupSplitSizes(groupId, [newSize, 1 - newSize]);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  window.removeEventListener('resize', resizeHandler);

  const averageFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const fps = 1000 / averageFrameTime;

  return {
    averageFPS: fps,
    averageFrameTime,
  };
}
```

#### 预期结果
- 平均 FPS > 30
- 平均帧时间 < 33ms

---

### 场景 4：长时间运行内存监控

#### 测试步骤
1. 创建包含 5 个窗口的组
2. 激活组视图
3. 运行 1 小时
4. 每 5 分钟记录一次内存使用

#### 测量指标
- 初始内存使用
- 每 5 分钟的内存使用
- 内存增长率
- 是否有内存泄漏

#### 测试脚本
```typescript
export async function testLongRunningMemory() {
  const memorySnapshots: Array<{ time: number; memory: number }> = [];
  const duration = 60 * 60 * 1000; // 1 小时
  const interval = 5 * 60 * 1000; // 5 分钟

  const startTime = Date.now();

  const recordMemory = () => {
    if (performance.memory) {
      memorySnapshots.push({
        time: Date.now() - startTime,
        memory: performance.memory.usedJSHeapSize / 1024 / 1024, // MB
      });
    }
  };

  // 初始记录
  recordMemory();

  // 定期记录
  const intervalId = setInterval(() => {
    recordMemory();

    if (Date.now() - startTime >= duration) {
      clearInterval(intervalId);
    }
  }, interval);

  return new Promise(resolve => {
    setTimeout(() => {
      clearInterval(intervalId);

      const initialMemory = memorySnapshots[0].memory;
      const finalMemory = memorySnapshots[memorySnapshots.length - 1].memory;
      const memoryGrowth = finalMemory - initialMemory;

      resolve({
        snapshots: memorySnapshots,
        initialMemory,
        finalMemory,
        memoryGrowth,
      });
    }, duration);
  });
}
```

#### 预期结果
- 内存增长 < 100MB
- 无明显内存泄漏趋势

---

### 场景 5：频繁创建和删除组

#### 测试步骤
1. 循环 100 次：
   - 创建包含 3 个窗口的组
   - 删除组
2. 监控内存使用

#### 测量指标
- 每次操作耗时
- 内存使用变化
- 是否有内存泄漏

#### 测试脚本
```typescript
export async function testFrequentGroupOperations() {
  const operationTimes: number[] = [];
  const memorySnapshots: number[] = [];

  for (let i = 0; i < 100; i++) {
    const startTime = performance.now();

    // 创建 3 个窗口
    const windowIds: string[] = [];
    for (let j = 0; j < 3; j++) {
      const windowId = await window.electronAPI.createWindow({
        name: `Test Window ${j + 1}`,
        path: process.cwd(),
      });
      windowIds.push(windowId);
    }

    // 创建组
    const groupId = await window.electronAPI.createGroup({
      name: `Test Group ${i + 1}`,
      windowIds,
    });

    // 删除组
    await window.electronAPI.deleteGroup(groupId);

    // 删除窗口
    for (const windowId of windowIds) {
      await window.electronAPI.deleteWindow(windowId);
    }

    const endTime = performance.now();
    operationTimes.push(endTime - startTime);

    // 记录内存
    if (performance.memory) {
      memorySnapshots.push(performance.memory.usedJSHeapSize / 1024 / 1024);
    }
  }

  return {
    averageOperationTime: operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length,
    initialMemory: memorySnapshots[0],
    finalMemory: memorySnapshots[memorySnapshots.length - 1],
    memoryGrowth: memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0],
  };
}
```

#### 预期结果
- 平均操作时间 < 1 秒
- 内存增长 < 50MB

---

### 场景 6：批量启动窗口

#### 测试步骤
1. 创建包含 10 个窗口的组（所有窗口处于暂停状态）
2. 点击"启动所有"按钮
3. 监控 PTY 进程启动时间

#### 测量指标
- 总启动时间
- 每个进程启动时间
- 启动失败率
- CPU 使用率

#### 测试脚本
```typescript
export async function testBatchStartWindows() {
  const groupId = 'test-group-id';
  const windowIds = Array.from({ length: 10 }, (_, i) => `window-${i + 1}`);

  const startTime = performance.now();
  const startTimes: Record<string, number> = {};

  // 监听窗口状态变化
  const statusChangeHandler = (event: any) => {
    const { windowId, status } = event.detail;
    if (status === 'Running' && !startTimes[windowId]) {
      startTimes[windowId] = performance.now() - startTime;
    }
  };

  window.addEventListener('window-status-changed', statusChangeHandler);

  // 批量启动
  await window.electronAPI.startGroupWindows(groupId);

  // 等待所有窗口启动
  await new Promise(resolve => setTimeout(resolve, 5000));

  window.removeEventListener('window-status-changed', statusChangeHandler);

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  return {
    totalTime,
    individualStartTimes: startTimes,
    averageStartTime: Object.values(startTimes).reduce((a, b) => a + b, 0) / Object.keys(startTimes).length,
  };
}
```

#### 预期结果
- 总启动时间 < 3 秒
- 平均启动时间 < 300ms/进程
- 启动失败率 = 0%

---

### 场景 7：批量暂停窗口

#### 测试步骤
1. 创建包含 10 个窗口的组（所有窗口处于运行状态）
2. 点击"暂停所有"按钮
3. 监控 PTY 进程暂停时间

#### 测量指标
- 总暂停时间
- 每个进程暂停时间
- 暂停失败率

#### 测试脚本
```typescript
export async function testBatchPauseWindows() {
  const groupId = 'test-group-id';
  const windowIds = Array.from({ length: 10 }, (_, i) => `window-${i + 1}`);

  const startTime = performance.now();
  const pauseTimes: Record<string, number> = {};

  // 监听窗口状态变化
  const statusChangeHandler = (event: any) => {
    const { windowId, status } = event.detail;
    if (status === 'Paused' && !pauseTimes[windowId]) {
      pauseTimes[windowId] = performance.now() - startTime;
    }
  };

  window.addEventListener('window-status-changed', statusChangeHandler);

  // 批量暂停
  await window.electronAPI.pauseGroupWindows(groupId);

  // 等待所有窗口暂停
  await new Promise(resolve => setTimeout(resolve, 2000));

  window.removeEventListener('window-status-changed', statusChangeHandler);

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  return {
    totalTime,
    individualPauseTimes: pauseTimes,
    averagePauseTime: Object.values(pauseTimes).reduce((a, b) => a + b, 0) / Object.keys(pauseTimes).length,
  };
}
```

#### 预期结果
- 总暂停时间 < 1 秒
- 平均暂停时间 < 100ms/进程
- 暂停失败率 = 0%

---

## 性能优化建议

### 1. React 性能优化

#### 使用 React.memo
```typescript
export const GroupCard = React.memo<GroupCardProps>(({ group, onEdit, onDelete }) => {
  // 组件实现
});
```

#### 使用 useMemo 缓存计算结果
```typescript
const windowsInGroup = useMemo(() => {
  return getAllWindows(group.layout);
}, [group.layout]);
```

#### 使用 useCallback 缓存回调函数
```typescript
const handleEdit = useCallback(() => {
  onEdit(group.id);
}, [group.id, onEdit]);
```

### 2. TerminalView 管理优化

#### 使用 CSS display 控制显示/隐藏
```typescript
<div style={{ display: isActive ? 'block' : 'none' }}>
  <TerminalView windowId={windowId} />
</div>
```

#### 避免 mount/unmount 循环
```typescript
// 错误做法
{isActive && <TerminalView windowId={windowId} />}

// 正确做法
<TerminalView windowId={windowId} style={{ display: isActive ? 'block' : 'none' }} />
```

### 3. 状态更新优化

#### 批量更新状态
```typescript
// 使用 Zustand 的 batch 功能
import { batch } from 'zustand';

batch(() => {
  windowStore.setState({ activeGroupId: groupId });
  windowStore.setState({ activeWindowId: null });
});
```

#### 避免不必要的状态更新
```typescript
// 使用浅比较避免不必要的更新
if (JSON.stringify(newLayout) !== JSON.stringify(oldLayout)) {
  updateGroupLayout(groupId, newLayout);
}
```

### 4. PTY 进程管理优化

#### 并行启动进程
```typescript
async function startGroupWindows(groupId: string) {
  const windowIds = getAllWindows(group.layout);

  // 并行启动所有进程
  await Promise.all(
    windowIds.map(windowId => startWindow(windowId))
  );
}
```

#### 进程池管理
```typescript
// 限制同时启动的进程数量
const MAX_CONCURRENT_STARTS = 5;

async function startGroupWindows(groupId: string) {
  const windowIds = getAllWindows(group.layout);

  for (let i = 0; i < windowIds.length; i += MAX_CONCURRENT_STARTS) {
    const batch = windowIds.slice(i, i + MAX_CONCURRENT_STARTS);
    await Promise.all(batch.map(windowId => startWindow(windowId)));
  }
}
```

### 5. 内存管理优化

#### 及时清理事件监听器
```typescript
useEffect(() => {
  const handler = () => { /* ... */ };
  window.addEventListener('resize', handler);

  return () => {
    window.removeEventListener('resize', handler);
  };
}, []);
```

#### 避免内存泄漏
```typescript
// 清理 xterm.js 实例
useEffect(() => {
  const terminal = new Terminal();

  return () => {
    terminal.dispose();
  };
}, []);
```

## 性能测试报告模板

```markdown
# 窗口组功能性能测试报告

## 测试概要
- 测试日期：[日期]
- 测试人员：QA Engineer
- 测试版本：[版本号]
- 测试环境：[硬件和软件配置]

## 测试结果

### 场景 1：包含 10 个窗口的组渲染性能
- 总时间：[时间] (目标: < 5s)
- 激活时间：[时间] (目标: < 500ms)
- 结果：✅ 通过 / ❌ 失败

### 场景 2：频繁切换窗口焦点
- 平均响应时间：[时间] (目标: < 100ms)
- 最大响应时间：[时间] (目标: < 200ms)
- 内存泄漏：✅ 无 / ❌ 有
- 结果：✅ 通过 / ❌ 失败

### 场景 3：拖拽调整窗口大小
- 平均 FPS：[数值] (目标: > 30)
- 平均帧时间：[时间] (目标: < 33ms)
- 结果：✅ 通过 / ❌ 失败

### 场景 4：长时间运行内存监控
- 初始内存：[数值] MB
- 最终内存：[数值] MB
- 内存增长：[数值] MB (目标: < 100MB)
- 结果：✅ 通过 / ❌ 失败

### 场景 5：频繁创建和删除组
- 平均操作时间：[时间] (目标: < 1s)
- 内存增长：[数值] MB (目标: < 50MB)
- 结果：✅ 通过 / ❌ 失败

### 场景 6：批量启动窗口
- 总启动时间：[时间] (目标: < 3s)
- 平均启动时间：[时间] (目标: < 300ms/进程)
- 启动失败率：[百分比] (目标: 0%)
- 结果：✅ 通过 / ❌ 失败

### 场景 7：批量暂停窗口
- 总暂停时间：[时间] (目标: < 1s)
- 平均暂停时间：[时间] (目标: < 100ms/进程)
- 暂停失败率：[百分比] (目标: 0%)
- 结果：✅ 通过 / ❌ 失败

## 性能瓶颈分析
[列出发现的性能瓶颈]

## 优化建议
[列出优化建议]

## 结论
[总体评价]
```

## 性能监控工具集成

### React Profiler 集成
```typescript
// src/renderer/components/PerformanceMonitor.tsx
import { Profiler, ProfilerOnRenderCallback } from 'react';

const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  console.log(`[Profiler] ${id} ${phase}`, {
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  });
};

export function PerformanceMonitor({ children }: { children: React.ReactNode }) {
  return (
    <Profiler id="GroupView" onRender={onRenderCallback}>
      {children}
    </Profiler>
  );
}
```

### 自定义性能监控
```typescript
// src/renderer/utils/performanceMonitor.ts
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  start(label: string): void {
    performance.mark(`${label}-start`);
  }

  end(label: string): void {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);

    const measure = performance.getEntriesByName(label)[0];
    if (measure) {
      const metrics = this.metrics.get(label) || [];
      metrics.push(measure.duration);
      this.metrics.set(label, metrics);
    }
  }

  getMetrics(label: string): { average: number; max: number; min: number } {
    const metrics = this.metrics.get(label) || [];
    if (metrics.length === 0) {
      return { average: 0, max: 0, min: 0 };
    }

    return {
      average: metrics.reduce((a, b) => a + b, 0) / metrics.length,
      max: Math.max(...metrics),
      min: Math.min(...metrics),
    };
  }

  clear(): void {
    this.metrics.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }
}

export const performanceMonitor = new PerformanceMonitor();
```

## 总结

本性能测试方案涵盖了窗口组功能的所有关键性能场景，包括渲染性能、内存使用、CPU 使用和响应时间。通过执行这些测试，可以确保窗口组功能在各种场景下的性能表现符合用户期望。
