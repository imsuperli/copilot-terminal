# 修复总结 #3: 主进程代码重构（进行中）

**修复日期**: 2026-03-03
**状态**: 🟡 基础设施已完成，待继续
**编译状态**: ⏳ 待测试

---

## 问题

### 主进程代码过于臃肿

**原问题**:
- index.ts 长达 968 行
- 所有 23 个 IPC handlers 混杂在一起
- 难以维护和测试
- 新增功能容易引入 bug

---

## 重构方案

### 模块化架构

```
src/main/
├── index.ts                    # 主入口（目标 < 300 行）
├── handlers/                   # IPC handlers 模块
│   ├── index.ts               # 统一注册入口 ✅
│   ├── HandlerContext.ts      # 上下文接口 ✅
│   ├── miscHandlers.ts        # 其他 (1 个) ✅
│   ├── windowHandlers.ts      # 窗口管理 (4 个) ⏳
│   ├── paneHandlers.ts        # 窗格管理 (2 个) ⏳
│   ├── ptyHandlers.ts         # PTY 通信 (3 个) ⏳
│   ├── workspaceHandlers.ts   # 工作区管理 (3 个) ⏳
│   ├── viewHandlers.ts        # 视图切换 (2 个) ⏳
│   ├── fileHandlers.ts        # 文件系统 (3 个) ⏳
│   └── processHandlers.ts     # 进程管理 (4 个) ⏳
├── services/                   # 服务类（已存在）
└── utils/                      # 工具类（已存在）
```

---

## 已完成的工作

### 1. 创建 HandlerContext 接口 ✅

**文件**: `src/main/handlers/HandlerContext.ts`

**功能**:
- 定义所有 handlers 需要的共享资源
- 包含所有服务实例的引用
- 提供统一的上下文访问方式

### 2. 创建统一注册入口 ✅

**文件**: `src/main/handlers/index.ts`

**功能**:
- 导出 registerAllHandlers 函数
- 按功能分类注册所有 handlers
- 清晰的模块划分

### 3. 创建示例 handler 模块 ✅

**文件**: `src/main/handlers/miscHandlers.ts`

**功能**:
- 展示 handler 模块的标准结构
- 作为其他模块的参考模板

---

## 待完成的工作

### 阶段 2: 核心 handlers（优先）

1. **windowHandlers.ts** - 窗口管理
   - create-window
   - start-window
   - close-window
   - delete-window

2. **paneHandlers.ts** - 窗格管理
   - split-pane
   - close-pane

3. **ptyHandlers.ts** - PTY 通信
   - pty-write
   - pty-resize
   - get-pty-history

### 阶段 3: 其他 handlers（次要）

4. **workspaceHandlers.ts** - 工作区管理
   - save-workspace
   - load-workspace
   - recover-from-backup

5. **viewHandlers.ts** - 视图切换
   - switch-to-terminal-view
   - switch-to-unified-view

6. **fileHandlers.ts** - 文件系统
   - validate-path
   - select-directory
   - open-folder

7. **processHandlers.ts** - 进程管理
   - create-terminal
   - kill-terminal
   - get-terminal-status
   - list-terminals

### 阶段 4: 集成和清理

8. 修改 index.ts 使用新的 handler 注册方式
9. 删除 index.ts 中的旧 handler 代码
10. 测试所有功能
11. 更新文档

---

## 预期效果

### 代码组织

**重构前**:
- index.ts: 968 行（所有代码混在一起）

**重构后**:
- index.ts: ~250 行（主入口）
- handlers/: ~700 行（分散到 8 个模块）
- 总计: ~950 行（略有减少，但组织更清晰）

### 可维护性

- ✅ 每个模块职责单一
- ✅ 易于查找和修改
- ✅ 易于测试
- ✅ 易于新增功能

---

## 下一步

1. 继续完成 windowHandlers.ts（最复杂的模块）
2. 逐步完成其他 handler 模块
3. 修改 index.ts 集成新的 handler 系统
4. 测试验证所有功能正常

---

**重构负责人**: Claude Code
**预计剩余时间**: 3-4 小时
**建议**: 分多次会话逐步完成，每次完成 1-2 个模块
