# Story 6.1: 工作区管理服务（WorkspaceManager）

Status: ready-for-dev

## Story

As a 开发者,
I want 创建 WorkspaceManager 服务实现工作区配置的保存和加载,
So that 可以持久化窗口配置并在应用重启后恢复。

## Acceptance Criteria

1. **Given** 窗口列表状态管理已实现（Epic 2）
   **When** 实现 WorkspaceManager 服务
   **Then** 可以将工作区配置保存到本地 JSON 文件（FR21）

2. **Given** WorkspaceManager 服务已实现
   **When** 保存工作区
   **Then** Windows 平台存储路径：`%APPDATA%/ausome-terminal/workspace.json`

3. **Given** WorkspaceManager 服务已实现
   **When** 保存工作区
   **Then** macOS 平台存储路径：`~/Library/Application Support/ausome-terminal/workspace.json`

4. **Given** WorkspaceManager 服务已实现
   **When** 保存工作区
   **Then** 使用 fs-extra 库进行文件操作

5. **Given** WorkspaceManager 服务已实现
   **When** 保存工作区
   **Then** 使用原子写入机制：写临时文件 → 重命名覆盖

6. **Given** WorkspaceManager 服务已实现
   **When** 保存工作区
   **Then** 保存时自动创建备份（保留最近 3 个版本）

7. **Given** WorkspaceManager 服务已实现
   **When** 加载工作区
   **Then** 可以从本地文件加载工作区配置（FR22）

8. **Given** WorkspaceManager 服务已实现
   **When** 加载工作区
   **Then** 加载时校验 JSON 格式和版本

9. **Given** WorkspaceManager 服务已实现
   **When** 应用崩溃
   **Then** 崩溃恢复：启动时检查临时文件，恢复未完成的写入（FR23）

10. **Given** WorkspaceManager 服务已实现
    **When** 保存工作区
    **Then** 数据格式包含：version, windows[], settings, lastSavedAt

11. **Given** WorkspaceManager 服务已实现
    **When** 保存和加载工作区
    **Then** 工作区配置数据零丢失（NFR5）

## Tasks / Subtasks

- [ ] Task 1: 安装依赖库 (AC: 4)
  - [ ] 1.1 安装 fs-extra：`npm install fs-extra`
  - [ ] 1.2 安装类型定义：`npm install --save-dev @types/fs-extra`
  - [ ] 1.3 验证依赖安装成功

- [ ] Task 2: 定义数据模型 (AC: 10)
  - [ ] 2.1 在 `src/main/types/workspace.ts` 中定义 Workspace 接口
  - [ ] 2.2 定义 Workspace 接口：`{ version: string, windows: Window[], settings: Settings, lastSavedAt: string }`
  - [ ] 2.3 定义 Settings 接口：`{ notificationsEnabled: boolean, theme: 'dark' | 'light', autoSave: boolean, autoSaveInterval: number }`
  - [ ] 2.4 定义 Window 接口（如果未定义）

- [ ] Task 3: 创建 WorkspaceManager 服务基础架构 (AC: 1-3)
  - [ ] 3.1 创建 `src/main/services/WorkspaceManager.ts`
  - [ ] 3.2 定义 WorkspaceManager 接口：`saveWorkspace(workspace: Workspace): Promise<void>`
  - [ ] 3.3 定义 WorkspaceManager 接口：`loadWorkspace(): Promise<Workspace>`
  - [ ] 3.4 定义 WorkspaceManager 接口：`backupWorkspace(): Promise<void>`
  - [ ] 3.5 实现 WorkspaceManagerImpl 类
  - [ ] 3.6 在构造函数中确定存储路径（Windows vs macOS）

- [ ] Task 4: 实现工作区保存逻辑 (AC: 4-6)
  - [ ] 4.1 实现 `saveWorkspace(workspace: Workspace)` 方法
  - [ ] 4.2 添加时间戳：`workspace.lastSavedAt = new Date().toISOString()`
  - [ ] 4.3 实现原子写入：写临时文件 → 重命名覆盖
  - [ ] 4.4 使用 fs-extra 的 `writeJson()` 和 `rename()` 方法
  - [ ] 4.5 实现 `backupWorkspace()` 方法，保留最近 3 个版本
  - [ ] 4.6 备份文件命名：`workspace.json.backup.1`, `workspace.json.backup.2`, `workspace.json.backup.3`

- [ ] Task 5: 实现工作区加载逻辑 (AC: 7-9)
  - [ ] 5.1 实现 `loadWorkspace()` 方法
  - [ ] 5.2 检查工作区文件是否存在
  - [ ] 5.3 如果不存在，返回默认工作区
  - [ ] 5.4 使用 fs-extra 的 `readJson()` 方法读取文件
  - [ ] 5.5 校验 JSON 格式和版本号
  - [ ] 5.6 如果校验失败，尝试从备份恢复
  - [ ] 5.7 如果备份也失败，返回默认工作区

- [ ] Task 6: 实现崩溃恢复机制 (AC: 9)
  - [ ] 6.1 实现 `recoverFromCrash()` 方法
  - [ ] 6.2 启动时检查临时文件（`workspace.json.tmp`）
  - [ ] 6.3 如果临时文件存在，说明上次保存未完成
  - [ ] 6.4 尝试恢复临时文件到正式文件
  - [ ] 6.5 如果恢复失败，从备份恢复
  - [ ] 6.6 清理临时文件

- [ ] Task 7: 实现默认工作区 (AC: 7)
  - [ ] 7.1 实现 `getDefaultWorkspace()` 方法
  - [ ] 7.2 返回空的工作区：`{ version: '1.0', windows: [], settings: { notificationsEnabled: true, theme: 'dark', autoSave: true, autoSaveInterval: 5 }, lastSavedAt: '' }`

- [ ] Task 8: 集成到应用启动流程 (AC: 1-11)
  - [ ] 8.1 在主进程初始化时创建 WorkspaceManager 实例
  - [ ] 8.2 应用启动时调用 `loadWorkspace()`
  - [ ] 8.3 加载成功后，恢复所有窗口配置
  - [ ] 8.4 应用关闭时调用 `saveWorkspace()`
  - [ ] 8.5 处理加载失败的情况

- [ ] Task 9: 编写单元测试 (AC: 1-11)
  - [ ] 9.1 创建 `src/main/services/__tests__/WorkspaceManager.test.ts`
  - [ ] 9.2 测试保存工作区：验证文件正确写入
  - [ ] 9.3 测试加载工作区：验证文件正确读取
  - [ ] 9.4 测试原子写入：验证临时文件和重命名机制
  - [ ] 9.5 测试备份机制：验证最近 3 个版本保留
  - [ ] 9.6 测试崩溃恢复：验证临时文件恢复
  - [ ] 9.7 测试校验机制：验证无效 JSON 处理
  - [ ] 9.8 测试跨平台路径：验证 Windows 和 macOS 路径正确

## Dev Notes

### 架构约束与技术要求

**WorkspaceManager 服务设计（架构文档）：**

**职责：** 保存和恢复工作区配置

**接口定义（架构文档）：**
```typescript
interface WorkspaceManager {
  saveWorkspace(workspace: Workspace): Promise<void>;
  loadWorkspace(): Promise<Workspace>;
  backupWorkspace(): Promise<void>;
}
```

**实现要点（架构文档）：**
- 使用 `fs-extra` 库进行文件操作
- 原子写入：写临时文件 → 重命名覆盖
- 定期备份：保留最近 3 个版本
- 崩溃恢复：启动时检查临时文件，恢复未完成的写入
- 数据验证：加载时校验 JSON 格式和版本

**核心实现（架构文档）：**
```typescript
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';

class WorkspaceManagerImpl implements WorkspaceManager {
  private workspacePath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.workspacePath = path.join(userDataPath, 'workspace.json');
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    const tempPath = `${this.workspacePath}.tmp`;

    // 写入临时文件
    await fs.writeJson(tempPath, workspace, { spaces: 2 });

    // 原子重命名
    await fs.rename(tempPath, this.workspacePath);

    // 备份
    await this.backupWorkspace();
  }

  async loadWorkspace(): Promise<Workspace> {
    if (await fs.pathExists(this.workspacePath)) {
      return await fs.readJson(this.workspacePath);
    }
    return this.getDefaultWorkspace();
  }
}
```

**存储路径（架构文档）：**
- Windows: `%APPDATA%/ausome-terminal/workspace.json`
- macOS: `~/Library/Application Support/ausome-terminal/workspace.json`

**数据结构（架构文档）：**
```json
{
  "version": "1.0",
  "windows": [
    {
      "id": "uuid",
      "name": "项目 A",
      "workingDirectory": "/path/to/project-a",
      "command": "claude",
      "status": "running",
      "createdAt": "2026-02-28T10:00:00Z",
      "lastActiveAt": "2026-02-28T12:30:00Z"
    }
  ],
  "settings": {
    "notificationsEnabled": true,
    "theme": "dark"
  }
}
```

### UX 规范要点

**工作区恢复体验（UX 设计文档 User Journey Flows）：**

**旅程 1：首次启动 & 日常恢复**
- 目标：打开软件 → 看到所有窗口状态 → 立即开始工作
- 启动时不显示 loading 页面，直接渲染卡片骨架
- 进程恢复在后台进行
- 卡片先显示"恢复中"状态，进程就绪后切换为实际状态
- 首次使用的空状态界面：居中显示"+ 新建你的第一个窗口"引导
- 目标：< 5s 完成全部恢复（10+ 窗口）

**关键设计决策：**
- 启动时不显示 loading 页面，直接渲染卡片骨架屏
- 进程恢复在后台进行
- 卡片先显示"恢复中"状态，进程就绪后切换为实际状态
- 首次使用的空状态界面：居中显示"+ 新建你的第一个窗口"引导

### 技术实现指导

**fs-extra 库使用：**
```typescript
import fs from 'fs-extra';

// 写入 JSON 文件
await fs.writeJson(filePath, data, { spaces: 2 });

// 读取 JSON 文件
const data = await fs.readJson(filePath);

// 检查文件是否存在
const exists = await fs.pathExists(filePath);

// 重命名文件
await fs.rename(oldPath, newPath);

// 复制文件
await fs.copy(srcPath, destPath);

// 删除文件
await fs.remove(filePath);
```

**原子写入实现：**
```typescript
async saveWorkspace(workspace: Workspace): Promise<void> {
  const tempPath = `${this.workspacePath}.tmp`;

  try {
    // 写入临时文件
    await fs.writeJson(tempPath, workspace, { spaces: 2 });

    // 原子重命名（如果目标文件存在，会被覆盖）
    await fs.rename(tempPath, this.workspacePath);
  } catch (error) {
    // 清理临时文件
    await fs.remove(tempPath);
    throw error;
  }
}
```

**备份机制实现：**
```typescript
async backupWorkspace(): Promise<void> {
  const backupDir = path.dirname(this.workspacePath);
  const backupBase = path.join(backupDir, 'workspace.json.backup');

  // 删除最旧的备份（backup.3）
  const backup3 = `${backupBase}.3`;
  if (await fs.pathExists(backup3)) {
    await fs.remove(backup3);
  }

  // 轮转备份文件
  for (let i = 2; i >= 1; i--) {
    const oldPath = `${backupBase}.${i}`;
    const newPath = `${backupBase}.${i + 1}`;
    if (await fs.pathExists(oldPath)) {
      await fs.rename(oldPath, newPath);
    }
  }

  // 创建新备份
  await fs.copy(this.workspacePath, `${backupBase}.1`);
}
```

**崩溃恢复实现：**
```typescript
async recoverFromCrash(): Promise<void> {
  const tempPath = `${this.workspacePath}.tmp`;

  if (await fs.pathExists(tempPath)) {
    try {
      // 尝试恢复临时文件
      await fs.rename(tempPath, this.workspacePath);
    } catch (error) {
      // 恢复失败，尝试从备份恢复
      const backup1 = `${this.workspacePath}.backup.1`;
      if (await fs.pathExists(backup1)) {
        await fs.copy(backup1, this.workspacePath);
      }
    }
  }
}
```

### 防错指南

**常见 LLM 开发错误预防：**
1. 不要忘记安装 fs-extra 库 — 必须先安装依赖
2. 不要忘记处理文件不存在的情况 — 必须返回默认工作区
3. 不要忘记原子写入 — 必须使用临时文件 + 重命名机制
4. 不要忘记备份机制 — 必须保留最近 3 个版本
5. 不要忘记崩溃恢复 — 必须检查临时文件
6. 不要忘记校验 JSON 格式 — 必须验证版本号
7. 不要忘记跨平台路径 — 必须使用 path.join() 而不是字符串拼接
8. 不要忘记异步操作 — 所有文件操作都是异步的

### Project Structure Notes

**本 Story 涉及的文件：**
```
src/
└── main/
    ├── services/
    │   ├── WorkspaceManager.ts                 # 新建 - 工作区管理服务
    │   └── __tests__/
    │       └── WorkspaceManager.test.ts        # 新建 - WorkspaceManager 测试
    └── types/
        └── workspace.ts                        # 新建 - Workspace 数据模型
```

**与统一项目结构的对齐：**
- 主进程服务放在 `src/main/services/`
- 类型定义放在 `src/main/types/`
- 测试文件在对应模块的 `__tests__/` 目录

**依赖安装：**
```bash
npm install fs-extra
npm install --save-dev @types/fs-extra
```

### References

- [Source: epics.md#Story 6.1 - 工作区管理服务验收标准]
- [Source: epics.md#Epic 6: 工作区持久化]
- [Source: architecture.md#WorkspaceManager 服务设计]
- [Source: architecture.md#数据持久化 - 本地 JSON 文件]
- [Source: architecture.md#数据模型设计 - Workspace]
- [Source: ux-design-specification.md#User Journey Flows - 旅程 1]
- [Source: 2-3-window-list-state-management.md - Zustand store]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
