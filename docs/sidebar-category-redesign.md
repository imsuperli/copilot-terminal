# 侧边栏分类重新设计

## 需求概述

重新规划主页左侧菜单栏的终端管理结构，提供更灵活的分类和自定义功能。

## 新的分类结构

### 1. 全部终端
显示所有终端和组，按以下优先级排列：
1. 活跃终端组
2. 活跃终端（不属于任何组的独立终端）
3. 归档终端组
4. 归档终端

### 2. 活跃终端
只显示未归档的内容：
- 活跃终端组
- 活跃终端（独立）

### 3. 归档终端
只显示已归档的内容：
- 归档终端组
- 归档终端

### 4. 自定义分类
用户可以创建自定义标签/分类，将终端移动到这些分类中进行管理。

特性：
- 用户可以创建多个自定义分类
- 可以将终端/组拖拽到自定义分类
- 自定义分类可以嵌套（子分类）
- 自定义分类持久化保存

## 数据结构设计

### CustomCategory 类型

```typescript
interface CustomCategory {
  id: string;                    // UUID
  name: string;                  // 分类名称
  icon?: string;                 // 可选图标
  parentId?: string;             // 父分类 ID（支持嵌套）
  windowIds: string[];           // 包含的窗口 ID
  groupIds: string[];            // 包含的组 ID
  order: number;                 // 排序顺序
  createdAt: string;
  updatedAt: string;
}
```

### Settings 扩展

```typescript
interface Settings {
  // ... 现有字段
  customCategories?: CustomCategory[];
  defaultSidebarTab?: 'all' | 'active' | 'archived' | string; // string 为自定义分类 ID
}
```

## UI 设计

### 侧边栏标签结构

```
┌─────────────────────────┐
│ 🔍 搜索框               │
├─────────────────────────┤
│ 📊 状态统计             │
├─────────────────────────┤
│ 📁 窗格管理             │
│                         │
│ ▶ 全部终端 (12)        │
│ ▶ 活跃终端 (8)         │
│ ▶ 归档终端 (4)         │
│ ─────────────────       │
│ ▶ 📌 项目A (3)         │
│ ▶ 📌 项目B (2)         │
│ ▶ 📌 临时任务 (1)      │
│                         │
│ + 新建分类              │
└─────────────────────────┘
```

### 分类管理 UI

#### 创建分类对话框
- 分类名称输入
- 图标选择（可选）
- 父分类选择（支持嵌套）

#### 分类右键菜单
- 重命名
- 更改图标
- 删除分类（窗口/组不会被删除，只是移出分类）
- 创建子分类

#### 拖拽支持
- 从卡片网格拖拽窗口/组到侧边栏分类
- 在侧边栏内拖拽窗口/组到不同分类
- 拖拽分类调整顺序

## 实现计划

### Phase 1: 数据层
1. 定义 `CustomCategory` 类型
2. 扩展 `Settings` 类型
3. 在 `windowStore` 中添加分类管理方法：
   - `addCustomCategory`
   - `updateCustomCategory`
   - `removeCustomCategory`
   - `addWindowToCategory`
   - `removeWindowFromCategory`
   - `addGroupToCategory`
   - `removeGroupFromCategory`
4. 持久化到 `settings.json`

### Phase 2: UI 组件
1. 创建 `CreateCategoryDialog` 组件
2. 创建 `CategoryItem` 组件（支持展开/折叠、拖拽）
3. 修改 `Sidebar` 组件：
   - 添加"全部终端"标签
   - 添加自定义分类列表
   - 添加"新建分类"按钮
4. 实现分类右键菜单

### Phase 3: 拖拽功能
1. 扩展 `DraggableWindowCard` 支持拖拽到分类
2. 创建 `CategoryDropZone` 组件
3. 实现分类内拖拽排序

### Phase 4: 过滤和显示逻辑
1. 实现"全部终端"的排序逻辑
2. 实现自定义分类的过滤逻辑
3. 处理窗口/组同时属于多个分类的情况

## 技术考虑

### 数据一致性
- 窗口/组可以同时属于多个自定义分类
- 删除窗口/组时，自动从所有分类中移除
- 归档窗口/组时，保留在自定义分类中（但在"活跃终端"标签中不显示）

### 性能优化
- 分类数据缓存
- 虚拟滚动（如果分类/窗口数量很大）
- 延迟加载嵌套分类

### 用户体验
- 拖拽时显示清晰的视觉反馈
- 支持键盘快捷键切换分类
- 记住用户上次选择的分类
- 空分类显示提示信息

## 兼容性

### 向后兼容
- 现有的"活跃终端"和"归档终端"标签保持不变
- 自定义分类为可选功能
- 旧版本的 `settings.json` 自动迁移

### 数据迁移
```typescript
function migrateSettings(oldSettings: Settings): Settings {
  return {
    ...oldSettings,
    customCategories: oldSettings.customCategories || [],
    defaultSidebarTab: oldSettings.defaultSidebarTab || 'active',
  };
}
```

## 测试计划

### 单元测试
- 分类 CRUD 操作
- 窗口/组添加到分类
- 分类排序逻辑

### 集成测试
- 拖拽窗口到分类
- 分类持久化和恢复
- 删除窗口时的分类清理

### E2E 测试
- 创建分类并添加窗口
- 嵌套分类管理
- 跨分类拖拽

## 未来扩展

### 智能分类
- 根据工作目录自动分类
- 根据项目类型自动分类
- 根据使用频率自动分类

### 分类模板
- 预定义分类模板（前端项目、后端项目、DevOps等）
- 导入/导出分类配置

### 分类视图
- 列表视图 vs 树形视图
- 紧凑模式 vs 详细模式
- 自定义排序规则
