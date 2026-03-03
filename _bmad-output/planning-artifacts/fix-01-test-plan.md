# PTY 订阅管理修复 - 测试验证

## 修复内容总结

### 1. 创建了 PtySubscriptionManager 类
- 文件: `src/main/services/PtySubscriptionManager.ts`
- 统一使用 `paneId` 作为订阅键
- 提供添加、删除、批量清理等方法

### 2. 修复了严重 BUG

#### Bug #1: split-pane 缺少 PTY 订阅
**问题**: 拆分创建的窗格无法接收终端输出
**修复**: 在 split-pane handler 中添加了完整的订阅逻辑
- 初始化输出缓存
- 订阅 PTY 数据
- 推送到渲染进程
- 使用 PtySubscriptionManager 管理

#### Bug #2: close-pane 缺少订阅清理
**问题**: 关闭窗格时订阅未清理，导致内存泄漏
**修复**: 在 close-pane handler 中添加订阅清理
- 调用 `ptySubscriptionManager.remove(paneId)`

#### Bug #3: delete-window 只清理部分订阅
**问题**: 只清理 windowId 键，遗漏 windowId-paneId 键
**修复**: 使用 `removeByWindow()` 批量清理所有窗格的订阅

### 3. 统一了所有 handler 的订阅管理

- ✅ create-window: 使用 paneId 作为键
- ✅ start-window: 使用 paneId 作为键
- ✅ split-pane: 添加订阅逻辑，使用 paneId 作为键
- ✅ close-window: 使用 removeByWindow() 批量清理
- ✅ delete-window: 使用 removeByWindow() 批量清理
- ✅ close-pane: 添加订阅清理逻辑
- ✅ 退出清理: 使用 clear() 清理所有订阅

---

## 测试计划

### 测试场景 1: 创建和删除单窗格窗口

**步骤**:
1. 启动应用
2. 创建一个新窗口
3. 观察控制台日志：应该看到 "Added subscription for pane xxx, total: 1"
4. 在终端中输入命令，验证输出正常显示
5. 删除窗口
6. 观察控制台日志：应该看到 "Removed 1 subscriptions for window xxx"

**预期结果**:
- ✅ 终端输出正常显示
- ✅ 订阅正确添加
- ✅ 订阅正确清理
- ✅ 无内存泄漏

---

### 测试场景 2: 拆分窗格（修复的关键场景）

**步骤**:
1. 创建一个新窗口
2. 点击"拆分"按钮（水平或垂直）
3. 观察控制台日志：应该看到 "Added subscription for pane xxx, total: 2"
4. **在新拆分的窗格中输入命令**
5. **验证新窗格能正常显示终端输出**（这是之前的 BUG）
6. 关闭其中一个窗格
7. 观察控制台日志：应该看到 "Removed subscription for pane xxx, remaining: 1"

**预期结果**:
- ✅ 拆分后的新窗格能正常接收和显示终端输出（修复了 BUG）
- ✅ 每个窗格都有独立的订阅
- ✅ 关闭窗格时订阅正确清理（修复了 BUG）

---

### 测试场景 3: 多次拆分和关闭

**步骤**:
1. 创建一个新窗口
2. 拆分 3 次，创建 4 个窗格
3. 观察控制台日志：应该看到 total: 4
4. 在每个窗格中输入命令，验证都能正常显示输出
5. 逐个关闭窗格
6. 观察控制台日志：remaining 应该逐步减少 (3 -> 2 -> 1)
7. 删除窗口
8. 观察控制台日志：应该清理最后一个订阅

**预期结果**:
- ✅ 所有窗格都能正常工作
- ✅ 订阅数量正确
- ✅ 逐个清理正确
- ✅ 最终无遗漏

---

### 测试场景 4: 暂停和启动窗口

**步骤**:
1. 创建一个新窗口
2. 拆分创建 2 个窗格
3. 点击"暂停"按钮
4. 观察控制台日志：应该看到 "Removed 2 subscriptions for window xxx"
5. 点击"启动"按钮
6. 观察控制台日志：应该看到 2 次 "Added subscription for pane xxx"
7. 验证两个窗格都能正常显示输出

**预期结果**:
- ✅ 暂停时清理所有订阅
- ✅ 启动时重新创建订阅
- ✅ 功能正常

---

### 测试场景 5: 应用退出

**步骤**:
1. 创建 3 个窗口
2. 在第一个窗口中拆分创建 2 个窗格
3. 在第二个窗口中拆分创建 3 个窗格
4. 第三个窗口保持单窗格
5. 观察控制台日志：total 应该是 6 (2+3+1)
6. 关闭应用
7. 观察控制台日志：应该看到 "Clearing all 6 subscriptions"

**预期结果**:
- ✅ 退出时清理所有订阅
- ✅ 无内存泄漏
- ✅ 进程正常退出

---

### 测试场景 6: 工作区恢复

**步骤**:
1. 创建 2 个窗口，每个窗口拆分创建 2 个窗格
2. 关闭应用（不删除窗口）
3. 重新启动应用
4. 验证窗口恢复为暂停状态（无订阅）
5. 点击"启动"按钮启动第一个窗口
6. 观察控制台日志：应该看到 2 次 "Added subscription"
7. 验证两个窗格都能正常工作

**预期结果**:
- ✅ 恢复时不自动创建订阅
- ✅ 启动时正确创建订阅
- ✅ 功能正常

---

## 验收标准

修复完成后，需要满足以下标准：

- [x] 编译无错误
- [ ] 所有测试场景通过
- [ ] 拆分创建的窗格能正常接收终端输出（修复了 BUG #1）
- [ ] 关闭窗格时订阅正确清理（修复了 BUG #2）
- [ ] 删除窗口时所有窗格的订阅都被清理（修复了 BUG #3）
- [ ] 控制台日志清晰，便于调试
- [ ] 无内存泄漏（使用 Chrome DevTools Memory Profiler 验证）
- [ ] 原有功能不受影响

---

## 代码变更摘要

### 新增文件
- `src/main/services/PtySubscriptionManager.ts` (130 行)

### 修改文件
- `src/main/index.ts`
  - 导入 PtySubscriptionManager
  - 初始化 ptySubscriptionManager
  - 修改 create-window handler (使用 paneId 键)
  - 修改 start-window handler (使用 paneId 键)
  - 修改 close-window handler (使用 removeByWindow)
  - 修改 delete-window handler (使用 removeByWindow)
  - 修复 split-pane handler (添加订阅逻辑)
  - 修复 close-pane handler (添加清理逻辑)
  - 修改退出清理逻辑 (使用 clear)

### 删除内容
- 删除 `ptyDataUnsubscribers` Map
- 删除所有手动管理订阅的代码

---

## 回滚计划

如果发现问题，可以使用 git 回滚：

```bash
git checkout HEAD -- src/main/index.ts
git rm src/main/services/PtySubscriptionManager.ts
```

---

**修复完成时间**: 2026-03-03
**修复人**: Claude Code
**状态**: ✅ 代码修改完成，等待测试验证
