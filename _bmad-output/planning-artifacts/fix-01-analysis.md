# PTY 订阅管理问题深度分析

## 当前代码流程分析

### 1. 创建窗口流程 (create-window)

```
用户点击"新建窗口"
  → IPC: create-window
  → 生成 windowId 和 paneId (Line 392-393)
  → 创建 PTY 进程 (Line 400-405)
  → 初始化输出缓存: ptyOutputCache.set(paneId, []) (Line 447)
  → 订阅 PTY 数据 (Line 450-465)
  → 保存订阅: ptyDataUnsubscribers.set(windowId, unsubscribe) (Line 468) ⚠️
```

**问题**: 使用 `windowId` 作为键，但实际上订阅是针对 `paneId` 的

### 2. 启动暂停窗口流程 (start-window)

```
用户点击"启动"按钮（恢复暂停的窗口）
  → IPC: start-window (传入 windowId, paneId)
  → 创建 PTY 进程 (Line 504-509)
  → 初始化输出缓存: ptyOutputCache.set(paneId, []) (Line 520-522)
  → 订阅 PTY 数据 (Line 525-542)
  → 保存订阅: ptyDataUnsubscribers.set(key, unsubscribe) (Line 545-546)
      其中 key = paneId ? `${windowId}-${paneId}` : windowId ⚠️
```

**问题**: 使用组合键 `windowId-paneId`，与 create-window 不一致

### 3. 拆分窗格流程 (split-pane)

```
用户点击"拆分"按钮
  → 渲染进程: TerminalView.handleSplitPane
  → 生成新的 paneId (Line 126)
  → IPC: split-pane (传入 windowId, paneId, cwd, command)
  → 创建 PTY 进程 (Line 794)
  → 返回 pid
  → 渲染进程: 更新布局树 (splitPaneInWindow)
```

**关键发现**: split-pane handler **没有**订阅 PTY 数据！⚠️⚠️⚠️

这意味着：
- 通过拆分创建的窗格，其 PTY 输出不会被缓存
- 也不会被推送到渲染进程
- **这是一个严重的 BUG！**

### 4. 关闭窗口流程 (close-window)

```
用户点击"暂停"按钮
  → IPC: close-window
  → 查找窗口的所有进程 (Line 641-642)
  → 遍历每个进程:
      - 构造键: key = proc.paneId ? `${windowId}-${proc.paneId}` : windowId
      - 查找订阅: ptyDataUnsubscribers.get(key) (Line 647)
      - 取消订阅 (Line 649-650)
      - 清理输出缓存 (Line 654-656)
      - 终止进程 (Line 659)
```

**问题**:
- 对于 create-window 创建的窗口（键是 windowId），无法找到订阅
- 对于 start-window 创建的窗格（键是 windowId-paneId），可以找到订阅

### 5. 删除窗口流程 (delete-window)

```
用户点击"删除"按钮
  → IPC: delete-window
  → 查找窗口的所有进程 (Line 687-688)
  → 遍历每个进程:
      - 清理输出缓存 (Line 691-693)
      - 终止进程 (Line 695)
  → 取消订阅: ptyDataUnsubscribers.get(windowId) (Line 705) ⚠️
  → 只查找 windowId 键，无法清理 windowId-paneId 键
```

**问题**: 只清理 windowId 键的订阅，遗漏了 windowId-paneId 键的订阅

### 6. 关闭窗格流程 (close-pane)

```
用户关闭单个窗格
  → IPC: close-pane
  → 清理输出缓存 (Line 812)
  → 查找进程并终止 (Line 814-817)
```

**问题**: **没有清理 PTY 订阅！** ⚠️⚠️⚠️

## 问题总结

### 严重问题（导致内存泄漏）

1. **split-pane 没有订阅 PTY 数据**
   - 拆分创建的窗格无法接收 PTY 输出
   - 功能性 BUG

2. **close-pane 没有清理订阅**
   - 关闭窗格时订阅未清理
   - 内存泄漏

3. **delete-window 只清理 windowId 键**
   - 无法清理 start-window 创建的订阅（windowId-paneId 键）
   - 内存泄漏

### 设计问题

1. **键值策略不一致**
   - create-window: windowId
   - start-window: windowId-paneId
   - 导致清理逻辑复杂且容易出错

2. **职责分散**
   - 订阅管理逻辑分散在多个 handler 中
   - 难以维护和调试

## 正确的流程应该是

### 统一原则

1. **每个 paneId 对应一个 PTY 进程**
2. **每个 PTY 进程有一个订阅**
3. **订阅的键应该是 paneId**（因为 paneId 是唯一的）

### 修正后的流程

```
创建/启动窗格:
  → 创建 PTY 进程
  → 订阅 PTY 数据
  → 保存订阅: subscriptions.set(paneId, unsubscribe)
  → 初始化输出缓存: cache.set(paneId, [])

关闭窗格:
  → 取消订阅: subscriptions.remove(paneId)
  → 清理输出缓存: cache.delete(paneId)
  → 终止 PTY 进程

关闭/删除窗口:
  → 查找窗口的所有窗格
  → 对每个窗格执行"关闭窗格"流程
```

## 修复策略

### 必须修复的问题（高优先级）

1. ✅ 统一订阅键值策略（使用 paneId）
2. ✅ 修复 split-pane 缺少订阅的问题
3. ✅ 修复 close-pane 缺少清理订阅的问题
4. ✅ 修复 delete-window 只清理部分订阅的问题

### 可选优化（中优先级）

1. 封装订阅管理逻辑到专门的类
2. 添加订阅泄漏检测
3. 添加详细的日志

## 风险评估

### 修改风险

- **低风险**: 统一键值策略（只是改变 Map 的键）
- **中风险**: 添加订阅管理（新增逻辑，但不影响现有流程）
- **高风险**: 修改 split-pane 和 close-pane（补充缺失的逻辑）

### 测试重点

1. 创建窗口 → 删除窗口（验证订阅清理）
2. 创建窗口 → 拆分窗格 → 验证新窗格能接收输出
3. 创建窗口 → 拆分窗格 → 关闭窗格 → 验证订阅清理
4. 创建窗口 → 暂停 → 启动 → 删除（验证完整生命周期）
5. 应用退出（验证所有订阅清理）

## 实施计划

### 阶段 1: 修复严重 BUG（必须）

1. 修复 split-pane 缺少订阅
2. 修复 close-pane 缺少清理

### 阶段 2: 统一键值策略（必须）

1. 所有地方统一使用 paneId 作为键
2. 修改 create-window, start-window, close-window, delete-window

### 阶段 3: 封装管理逻辑（可选）

1. 创建 PtySubscriptionManager 类
2. 重构所有 handler 使用新类

## 注意事项

1. **不要破坏现有功能**
   - 窗口创建、启动、暂停、删除必须正常工作
   - PTY 输出必须正常显示
   - 输出缓存必须正常工作

2. **保持向后兼容**
   - 工作区恢复必须正常工作
   - 不要改变 IPC 接口

3. **测试充分**
   - 每个修改都要测试
   - 特别关注边界情况（多窗格、快速操作等）
