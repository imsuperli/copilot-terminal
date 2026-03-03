# 修复方案 #1: PTY 数据订阅管理混乱

**问题编号**: FIX-001
**优先级**: 🔴 高
**预计工作量**: 2-3 小时
**风险等级**: 中（涉及核心进程管理逻辑）

---

## 1. 问题分析

### 1.1 当前问题

在 `src/main/index.ts` 中，PTY 数据订阅使用了不一致的键值管理策略：

**问题代码位置**:

1. **create-window handler (Line 468)**:
   ```typescript
   ptyDataUnsubscribers.set(windowId, unsubscribe);
   ```
   使用 `windowId` 作为键

2. **start-window handler (Line 545-546)**:
   ```typescript
   const key = paneId ? `${windowId}-${paneId}` : windowId;
   ptyDataUnsubscribers.set(key, unsubscribe);
   ```
   使用 `windowId-paneId` 组合键

3. **close-window handler (Line 646-650)**:
   ```typescript
   const key = proc.paneId ? `${windowId}-${proc.paneId}` : windowId;
   const unsubscribe = ptyDataUnsubscribers.get(key);
   ```
   需要处理两种格式

4. **delete-window handler (Line 705-708)**:
   ```typescript
   const unsubscribe = ptyDataUnsubscribers.get(windowId);
   ```
   只查找 `windowId` 键

### 1.2 问题根源

- **create-window** 创建的订阅使用 `windowId` 作为键
- 但实际上每个 **pane** 对应一个独立的 PTY 进程
- 当窗口有多个窗格时，后续窗格的订阅会覆盖之前的订阅
- **delete-window** 只清理 `windowId` 键，无法清理 `windowId-paneId` 键

### 1.3 影响

1. **内存泄漏**:
   - `start-window` 创建的订阅（使用 `windowId-paneId` 键）在 `delete-window` 时无法清理
   - PTY 数据回调函数持续占用内存

2. **订阅丢失**:
   - `create-window` 创建的第一个窗格订阅使用 `windowId` 键
   - 如果后续调用 `start-window` 启动其他窗格，可能无法正确管理

3. **逻辑混乱**:
   - 不同地方使用不同的键值策略
   - 难以追踪和调试

---

## 2. 解决方案设计

### 2.1 核心原则

1. **统一键值策略**: 始终使用 `paneId` 作为订阅的唯一标识
2. **封装管理逻辑**: 创建专门的订阅管理类
3. **确保清理完整**: 提供按窗口批量清理的方法

### 2.2 架构设计

```
┌─────────────────────────────────────┐
│   PtySubscriptionManager (新增)     │
├─────────────────────────────────────┤
│ - subscriptions: Map<paneId, fn>   │
│ - add(paneId, unsubscribe)          │
│ - remove(paneId)                    │
│ - removeByWindow(windowId, pm)      │
│ - clear()                           │
│ - has(paneId)                       │
│ - size()                            │
└─────────────────────────────────────┘
           ↑
           │ 使用
           │
┌─────────────────────────────────────┐
│      src/main/index.ts              │
├─────────────────────────────────────┤
│ - create-window handler             │
│ - start-window handler              │
│ - close-window handler              │
│ - delete-window handler             │
│ - close-pane handler                │
└─────────────────────────────────────┘
```

---

## 3. 实施步骤

### 步骤 1: 创建 PtySubscriptionManager 类

**文件**: `src/main/services/PtySubscriptionManager.ts`

```typescript
/**
 * PTY 数据订阅管理器
 *
 * 职责：
 * - 管理所有 PTY 数据订阅的生命周期
 * - 确保订阅正确创建和清理
 * - 防止内存泄漏
 */
export class PtySubscriptionManager {
  /** 订阅映射：paneId -> 取消订阅函数 */
  private subscriptions = new Map<string, () => void>();

  /**
   * 添加订阅
   * @param paneId 窗格 ID
   * @param unsubscribe 取消订阅函数
   */
  add(paneId: string, unsubscribe: () => void): void {
    // 如果已存在订阅，先清理旧的
    if (this.subscriptions.has(paneId)) {
      console.warn(`[PtySubscriptionManager] Pane ${paneId} already has subscription, cleaning up old one`);
      this.remove(paneId);
    }

    this.subscriptions.set(paneId, unsubscribe);
    console.log(`[PtySubscriptionManager] Added subscription for pane ${paneId}, total: ${this.subscriptions.size}`);
  }

  /**
   * 移除单个订阅
   * @param paneId 窗格 ID
   * @returns 是否成功移除
   */
  remove(paneId: string): boolean {
    const unsubscribe = this.subscriptions.get(paneId);
    if (unsubscribe) {
      try {
        unsubscribe();
        this.subscriptions.delete(paneId);
        console.log(`[PtySubscriptionManager] Removed subscription for pane ${paneId}, remaining: ${this.subscriptions.size}`);
        return true;
      } catch (error) {
        console.error(`[PtySubscriptionManager] Failed to unsubscribe pane ${paneId}:`, error);
        // 即使取消订阅失败，也要从 Map 中删除
        this.subscriptions.delete(paneId);
        return false;
      }
    }
    return false;
  }

  /**
   * 移除窗口的所有订阅
   * @param windowId 窗口 ID
   * @param processManager 进程管理器（用于查找窗口的所有窗格）
   * @returns 移除的订阅数量
   */
  removeByWindow(windowId: string, processManager: { listProcesses(): Array<{ windowId: string; paneId?: string }> }): number {
    const processes = processManager.listProcesses();
    const windowProcesses = processes.filter(p => p.windowId === windowId);

    let removedCount = 0;
    for (const proc of windowProcesses) {
      if (proc.paneId && this.remove(proc.paneId)) {
        removedCount++;
      }
    }

    console.log(`[PtySubscriptionManager] Removed ${removedCount} subscriptions for window ${windowId}`);
    return removedCount;
  }

  /**
   * 清理所有订阅
   */
  clear(): void {
    console.log(`[PtySubscriptionManager] Clearing all ${this.subscriptions.size} subscriptions`);

    for (const [paneId, unsubscribe] of this.subscriptions.entries()) {
      try {
        unsubscribe();
      } catch (error) {
        console.error(`[PtySubscriptionManager] Failed to unsubscribe pane ${paneId}:`, error);
      }
    }

    this.subscriptions.clear();
    console.log('[PtySubscriptionManager] All subscriptions cleared');
  }

  /**
   * 检查是否存在订阅
   * @param paneId 窗格 ID
   */
  has(paneId: string): boolean {
    return this.subscriptions.has(paneId);
  }

  /**
   * 获取当前订阅数量
   */
  size(): number {
    return this.subscriptions.size;
  }

  /**
   * 获取所有订阅的窗格 ID（用于调试）
   */
  getAllPaneIds(): string[] {
    return Array.from(this.subscriptions.keys());
  }
}
```

### 步骤 2: 在 index.ts 中使用 PtySubscriptionManager

**修改文件**: `src/main/index.ts`

#### 2.1 导入和初始化

```typescript
// 在文件顶部添加导入
import { PtySubscriptionManager } from './services/PtySubscriptionManager';

// 替换原有的 ptyDataUnsubscribers
// 删除: const ptyDataUnsubscribers = new Map<string, () => void>();
// 添加:
let ptySubscriptionManager: PtySubscriptionManager | null = null;

// 在 app.whenReady() 中初始化
app.whenReady().then(async () => {
  // ... 其他初始化代码

  // 初始化 PtySubscriptionManager
  ptySubscriptionManager = new PtySubscriptionManager();

  // ... 其他代码
});
```

#### 2.2 修改 create-window handler

**原代码** (Line 449-468):
```typescript
// 订阅 PTY 数据，推送到渲染进程并缓存
const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
  // 缓存输出
  const cache = ptyOutputCache.get(paneId);
  if (cache) {
    cache.push(data);
    if (cache.length > MAX_CACHE_SIZE) {
      cache.shift();
    }
  }

  // 推送到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pty-data', { windowId, paneId, data });
  }
});

// 保存清理函数
ptyDataUnsubscribers.set(windowId, unsubscribe);
```

**修改为**:
```typescript
// 订阅 PTY 数据，推送到渲染进程并缓存
const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
  // 缓存输出
  const cache = ptyOutputCache.get(paneId);
  if (cache) {
    cache.push(data);
    if (cache.length > MAX_CACHE_SIZE) {
      cache.shift();
    }
  }

  // 推送到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pty-data', { windowId, paneId, data });
  }
});

// 使用 PtySubscriptionManager 管理订阅
if (ptySubscriptionManager) {
  ptySubscriptionManager.add(paneId, unsubscribe);
}
```

#### 2.3 修改 start-window handler

**原代码** (Line 524-546):
```typescript
// 订阅 PTY 数据，推送到渲染进程并缓存
const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
  // 缓存输出
  if (paneId) {
    const cache = ptyOutputCache.get(paneId);
    if (cache) {
      cache.push(data);
      if (cache.length > MAX_CACHE_SIZE) {
        cache.shift();
      }
    }
  }

  // 推送到渲染进程（包含 paneId）
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pty-data', { windowId, paneId, data });
  }
});

// 保存清理函数（使用 windowId-paneId 作为键）
const key = paneId ? `${windowId}-${paneId}` : windowId;
ptyDataUnsubscribers.set(key, unsubscribe);
```

**修改为**:
```typescript
// 订阅 PTY 数据，推送到渲染进程并缓存
const unsubscribe = processManager.subscribePtyData(handle.pid, (data: string) => {
  // 缓存输出
  if (paneId) {
    const cache = ptyOutputCache.get(paneId);
    if (cache) {
      cache.push(data);
      if (cache.length > MAX_CACHE_SIZE) {
        cache.shift();
      }
    }
  }

  // 推送到渲染进程（包含 paneId）
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pty-data', { windowId, paneId, data });
  }
});

// 使用 PtySubscriptionManager 管理订阅
if (ptySubscriptionManager && paneId) {
  ptySubscriptionManager.add(paneId, unsubscribe);
}
```

#### 2.4 修改 close-window handler

**原代码** (Line 644-651):
```typescript
for (const proc of windowProcesses) {
  // 取消订阅 PTY 数据（使用 windowId-paneId 作为键）
  const key = proc.paneId ? `${windowId}-${proc.paneId}` : windowId;
  const unsubscribe = ptyDataUnsubscribers.get(key);
  if (unsubscribe) {
    unsubscribe();
    ptyDataUnsubscribers.delete(key);
  }

  // ... 其他清理代码
}
```

**修改为**:
```typescript
// 使用 PtySubscriptionManager 批量清理窗口的所有订阅
if (ptySubscriptionManager && processManager) {
  ptySubscriptionManager.removeByWindow(windowId, processManager);
}

for (const proc of windowProcesses) {
  // 清理每个窗格的输出缓存
  if (proc.paneId) {
    ptyOutputCache.delete(proc.paneId);
  }

  // ... 其他清理代码
}
```

#### 2.5 修改 delete-window handler

**原代码** (Line 704-709):
```typescript
// 取消订阅 PTY 数据
const unsubscribe = ptyDataUnsubscribers.get(windowId);
if (unsubscribe) {
  unsubscribe();
  ptyDataUnsubscribers.delete(windowId);
}
```

**修改为**:
```typescript
// 使用 PtySubscriptionManager 批量清理窗口的所有订阅
if (ptySubscriptionManager && processManager) {
  ptySubscriptionManager.removeByWindow(windowId, processManager);
}
```

#### 2.6 修改 close-pane handler

**新增**: 在 close-pane handler 中添加订阅清理

找到 `close-pane` handler (Line 805-825)，在清理输出缓存后添加：

```typescript
// 清理输出缓存
ptyOutputCache.delete(paneId);

// 清理 PTY 订阅
if (ptySubscriptionManager) {
  ptySubscriptionManager.remove(paneId);
}
```

#### 2.7 修改退出清理逻辑

在 `window.on('close')` 事件处理中 (Line 191-197):

**原代码**:
```typescript
// 取消所有 PTY 数据订阅
console.log('[ELECTRON] Unsubscribing PTY data...');
for (const [windowId, unsubscribe] of ptyDataUnsubscribers.entries()) {
  unsubscribe();
}
ptyDataUnsubscribers.clear();
ptyOutputCache.clear();
console.log('[ELECTRON] PTY data unsubscribed');
```

**修改为**:
```typescript
// 取消所有 PTY 数据订阅
console.log('[ELECTRON] Unsubscribing PTY data...');
if (ptySubscriptionManager) {
  ptySubscriptionManager.clear();
}
ptyOutputCache.clear();
console.log('[ELECTRON] PTY data unsubscribed');
```

---

## 4. 测试计划

### 4.1 单元测试

创建 `src/main/services/PtySubscriptionManager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PtySubscriptionManager } from './PtySubscriptionManager';

describe('PtySubscriptionManager', () => {
  let manager: PtySubscriptionManager;

  beforeEach(() => {
    manager = new PtySubscriptionManager();
  });

  it('should add subscription', () => {
    const unsubscribe = vi.fn();
    manager.add('pane-1', unsubscribe);

    expect(manager.has('pane-1')).toBe(true);
    expect(manager.size()).toBe(1);
  });

  it('should remove subscription and call unsubscribe', () => {
    const unsubscribe = vi.fn();
    manager.add('pane-1', unsubscribe);

    const removed = manager.remove('pane-1');

    expect(removed).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(manager.has('pane-1')).toBe(false);
  });

  it('should replace existing subscription', () => {
    const unsubscribe1 = vi.fn();
    const unsubscribe2 = vi.fn();

    manager.add('pane-1', unsubscribe1);
    manager.add('pane-1', unsubscribe2);

    expect(unsubscribe1).toHaveBeenCalledOnce();
    expect(manager.size()).toBe(1);
  });

  it('should remove subscriptions by window', () => {
    const unsubscribe1 = vi.fn();
    const unsubscribe2 = vi.fn();
    const unsubscribe3 = vi.fn();

    manager.add('pane-1', unsubscribe1);
    manager.add('pane-2', unsubscribe2);
    manager.add('pane-3', unsubscribe3);

    const mockProcessManager = {
      listProcesses: () => [
        { windowId: 'window-1', paneId: 'pane-1' },
        { windowId: 'window-1', paneId: 'pane-2' },
        { windowId: 'window-2', paneId: 'pane-3' },
      ],
    };

    const removed = manager.removeByWindow('window-1', mockProcessManager);

    expect(removed).toBe(2);
    expect(unsubscribe1).toHaveBeenCalledOnce();
    expect(unsubscribe2).toHaveBeenCalledOnce();
    expect(unsubscribe3).not.toHaveBeenCalled();
    expect(manager.size()).toBe(1);
  });

  it('should clear all subscriptions', () => {
    const unsubscribe1 = vi.fn();
    const unsubscribe2 = vi.fn();

    manager.add('pane-1', unsubscribe1);
    manager.add('pane-2', unsubscribe2);

    manager.clear();

    expect(unsubscribe1).toHaveBeenCalledOnce();
    expect(unsubscribe2).toHaveBeenCalledOnce();
    expect(manager.size()).toBe(0);
  });
});
```

### 4.2 集成测试场景

**场景 1: 创建单窗格窗口**
1. 创建窗口
2. 验证订阅已添加（检查 `manager.size()` 增加）
3. 删除窗口
4. 验证订阅已清理（检查 `manager.size()` 减少）

**场景 2: 创建多窗格窗口**
1. 创建窗口（1 个窗格）
2. 拆分窗格（增加到 2 个窗格）
3. 验证有 2 个订阅
4. 关闭 1 个窗格
5. 验证只剩 1 个订阅
6. 删除窗口
7. 验证所有订阅已清理

**场景 3: 暂停和启动窗口**
1. 创建窗口
2. 暂停窗口（close-window）
3. 验证订阅已清理
4. 启动窗口（start-window）
5. 验证订阅重新创建

**场景 4: 应用退出**
1. 创建多个窗口
2. 关闭应用
3. 验证所有订阅都被清理（无内存泄漏）

### 4.3 手动测试步骤

1. **启动应用**
   - 打开开发者工具控制台
   - 观察订阅管理日志

2. **创建窗口**
   - 创建 3 个窗口
   - 检查控制台：应该看到 "Added subscription for pane xxx, total: 3"

3. **拆分窗格**
   - 在一个窗口中拆分窗格 2 次（共 3 个窗格）
   - 检查控制台：应该看到 total 增加到 5

4. **关闭窗格**
   - 关闭一个窗格
   - 检查控制台：应该看到 "Removed subscription for pane xxx"

5. **删除窗口**
   - 删除一个有多个窗格的窗口
   - 检查控制台：应该看到 "Removed N subscriptions for window xxx"

6. **退出应用**
   - 关闭应用
   - 检查控制台：应该看到 "Clearing all N subscriptions"

---

## 5. 回滚计划

如果修改后出现问题，可以快速回滚：

1. **保留原代码**: 在修改前创建 git 分支
   ```bash
   git checkout -b fix/pty-subscription-management
   ```

2. **回滚步骤**:
   ```bash
   git checkout main
   git branch -D fix/pty-subscription-management
   ```

3. **临时禁用**: 如果只是部分功能有问题，可以临时回退到旧的 Map 方式：
   ```typescript
   // 在 index.ts 中保留旧代码作为注释
   // const ptyDataUnsubscribers = new Map<string, () => void>();
   ```

---

## 6. 验收标准

修复完成后，需要满足以下标准：

- [ ] 所有订阅使用统一的 `paneId` 作为键
- [ ] 创建窗口时正确添加订阅
- [ ] 启动窗口时正确添加订阅
- [ ] 关闭窗口时正确清理所有窗格的订阅
- [ ] 删除窗口时正确清理所有窗格的订阅
- [ ] 关闭单个窗格时正确清理该窗格的订阅
- [ ] 应用退出时清理所有订阅
- [ ] 单元测试全部通过
- [ ] 手动测试无内存泄漏（使用 Chrome DevTools Memory Profiler）
- [ ] 控制台日志清晰，便于调试

---

## 7. 后续优化

修复完成后，可以考虑以下优化：

1. **添加订阅泄漏检测**:
   ```typescript
   // 定期检查是否有孤立的订阅
   setInterval(() => {
     if (ptySubscriptionManager) {
       const paneIds = ptySubscriptionManager.getAllPaneIds();
       const activePanes = processManager.listProcesses()
         .map(p => p.paneId)
         .filter(Boolean);

       const orphaned = paneIds.filter(id => !activePanes.includes(id));
       if (orphaned.length > 0) {
         console.warn('[PtySubscriptionManager] Found orphaned subscriptions:', orphaned);
       }
     }
   }, 60000); // 每分钟检查一次
   ```

2. **添加订阅统计**:
   ```typescript
   // 在 PtySubscriptionManager 中添加统计方法
   getStats() {
     return {
       total: this.subscriptions.size,
       paneIds: this.getAllPaneIds(),
     };
   }
   ```

3. **添加订阅生命周期事件**:
   ```typescript
   // 在 PtySubscriptionManager 中添加事件发射
   private emitter = new EventEmitter();

   on(event: 'added' | 'removed', callback: (paneId: string) => void) {
     this.emitter.on(event, callback);
   }
   ```

---

**准备开始实施？请确认后我将开始修改代码。**
