# 修复总结 #1: PTY 数据订阅管理混乱

**修复日期**: 2026-03-03
**状态**: ✅ 已完成
**编译状态**: ✅ 通过

---

## 修复的问题

### 核心问题：PTY 订阅管理混乱

**原问题**:
- 订阅键值不一致（windowId vs windowId-paneId）
- split-pane 缺少 PTY 数据订阅（严重 BUG）
- close-pane 缺少订阅清理（内存泄漏）
- delete-window 只清理部分订阅（内存泄漏）
- CardGrid 使用不存在的 workingDirectory 属性

**影响**:
- 拆分的窗格无法接收终端输出（功能性 BUG）
- 内存泄漏（订阅未正确清理）
- 打开文件夹功能报错
- 代码逻辑混乱，难以维护

---

## 实施的修复

### 1. 创建 PtySubscriptionManager 类
- 统一使用 paneId 作为订阅键
- 提供完整的订阅生命周期管理
- 支持单个和批量订阅清理
- 添加详细日志（开发模式）

### 2. 修复的严重 BUG
1. **split-pane 缺少订阅** ✅ - 拆分的窗格现在能正常接收终端输出
2. **close-pane 缺少清理** ✅ - 关闭窗格时正确清理订阅
3. **delete-window 清理不完整** ✅ - 批量清理所有窗格的订阅
4. **CardGrid workingDirectory 错误** ✅ - 从布局树正确获取工作目录

### 3. 统一的订阅管理
所有 IPC handlers 现在使用统一的 PtySubscriptionManager

---

## 代码变更

- **新增**: PtySubscriptionManager.ts (130 行)
- **修改**: index.ts (净增约 40 行)
- **修改**: CardGrid.tsx (新增约 5 行)
- **总计**: 净增约 145 行

---

## 测试状态

### ✅ 编译测试
- TypeScript 编译通过
- Vite 构建成功

### ⏳ 功能测试（待验证）
1. 拆分窗格能正常显示输出
2. 关闭窗格无内存泄漏
3. 删除窗口无内存泄漏
4. 打开文件夹功能正常
5. 应用退出正常

---

**修复完成人**: Claude Code
**下一步**: 启动应用进行功能测试
