# 窗口组 UI 组件代码审查报告

**审查日期**: 2026-03-14
**审查人员**: QA Engineer
**审查范围**: GroupCard、CreateGroupDialog、EditGroupPanel 组件骨架

---

## 审查概要

审查了 ui-dev-1 完成的三个组件骨架：
- `src/renderer/components/GroupCard.tsx`
- `src/renderer/components/CreateGroupDialog.tsx`
- `src/renderer/components/EditGroupPanel.tsx`

**总体评价**: ✅ 组件骨架设计合理，代码质量良好，符合项目规范。

---

## 详细审查结果

### 1. GroupCard 组件

#### ✅ 优点

1. **组件结构清晰**
   - 使用 `React.memo` 优化性能
   - Props 接口定义完整
   - 使用 `useMemo` 和 `useCallback` 优化计算和回调

2. **UI 设计合理**
   - 文件夹图标 + 数字徽章显示窗口数量（符合需求）
   - 卡片布局清晰，信息层次分明
   - 支持键盘导航（Enter/Space）

3. **交互设计良好**
   - 按钮点击事件阻止冒泡
   - Tooltip 提示清晰
   - 支持归档/取消归档状态切换

4. **可访问性**
   - 使用 `role="button"` 和 `tabIndex`
   - 提供 `aria-label`
   - 支持键盘操作

#### ⚠️ 需要改进的地方

1. **类型定义**（优先级：中）
   ```typescript
   // 当前：
   layout: any; // TODO: 使用正确的 GroupLayoutNode 类型

   // 建议：等待任务 #1 完成后，立即替换为正确的类型
   ```

2. **窗口数量计算**（优先级：高）
   ```typescript
   // 当前：
   const windowCount = useMemo(() => {
     return 0; // 硬编码为 0
   }, [group.layout]);

   // 建议：实现后需要遍历 group.layout 树结构，统计 WindowNode 数量
   // 可以使用 groupLayoutHelpers.getAllWindows(group.layout).length
   ```

3. **聚合状态计算**（优先级：高）
   ```typescript
   // 当前：
   const aggregatedStatus = useMemo(() => {
     return 'paused'; // 硬编码为 'paused'
   }, [group]);

   // 建议：实现聚合状态逻辑
   // - 如果所有窗口都是 Paused，显示 'paused'
   // - 如果所有窗口都是 Running，显示 'running'
   // - 如果有部分窗口 Running，显示 'partial'
   // - 如果所有窗口都是 Exited，显示 'exited'
   ```

4. **时间格式化**（优先级：中）
   ```typescript
   // 当前：
   const formattedLastActiveTime = useMemo(() => {
     return '未知';
   }, [group.lastActiveAt]);

   // 建议：使用相对时间格式（如 "2 分钟前"、"1 小时前"）
   // 可以复用现有的时间格式化工具函数
   ```

5. **启动/暂停按钮逻辑**（优先级：高）
   ```typescript
   // 当前：只显示"全部启动"按钮

   // 建议：根据聚合状态动态显示按钮
   // - 如果所有窗口都是 Paused，显示"全部启动"
   // - 如果所有窗口都是 Running，显示"全部暂停"
   // - 如果是混合状态，显示两个按钮
   ```

#### 💡 优化建议

1. **性能优化**
   - 考虑将 `handleButtonClick` 移到组件外部，避免每次渲染都创建新函数
   - 如果组内窗口数量很多，考虑使用虚拟滚动

2. **用户体验**
   - 添加加载状态（批量启动/暂停时）
   - 添加操作确认对话框（删除组时）

---

### 2. CreateGroupDialog 组件

#### ✅ 优点

1. **表单设计合理**
   - 输入验证完善（至少 2 个窗口）
   - 自动聚焦到组名称字段
   - 支持键盘快捷键（Enter 提交，Escape 取消）

2. **状态管理清晰**
   - 使用 `useState` 管理表单状态
   - 错误状态独立管理
   - 表单重置逻辑完善

3. **错误处理**
   - 显示错误提示
   - 错误信息清晰

4. **可访问性**
   - 使用 `role="form"` 和 `role="alert"`
   - 必填字段标记清晰

#### ⚠️ 需要改进的地方

1. **窗口列表显示**（优先级：高）
   ```typescript
   // 当前：
   const availableWindows = []; // 空数组

   // 建议：从 windowStore 获取所有未归档的独立窗口
   // const availableWindows = useWindowStore(state =>
   //   state.windows.filter(w => !w.archived && !isWindowInAnyGroup(w.id))
   // );
   ```

2. **窗口选择 UI**（优先级：高）
   ```typescript
   // 当前：TODO 注释

   // 建议：实现复选框列表
   // - 显示窗口名称和路径
   // - 支持全选/取消全选
   // - 显示窗口状态图标
   ```

3. **IPC 调用**（优先级：高）
   ```typescript
   // 当前：console.log('TODO: 实现创建组逻辑');

   // 建议：等待任务 #2 完成后，调用 IPC 接口
   // const response = await window.electronAPI.createGroup({
   //   name: groupName || undefined,
   //   windowIds: selectedWindowIds,
   // });
   ```

4. **默认组名称**（优先级：低）
   ```typescript
   // 当前：组名称为必填字段

   // 建议：如果用户不输入名称，自动生成默认名称
   // 例如："窗口组 1"、"窗口组 2" 等
   ```

#### 💡 优化建议

1. **用户体验**
   - 添加窗口搜索/过滤功能
   - 支持拖拽排序窗口
   - 显示窗口预览（路径、状态）

2. **表单验证**
   - 添加组名称长度限制（如 50 字符）
   - 添加组名称重复检查

---

### 3. EditGroupPanel 组件

#### ✅ 优点

1. **表单设计合理**
   - 自动聚焦到名称字段
   - 支持键盘快捷键
   - 保存逻辑清晰

2. **状态管理**
   - 使用 `useState` 管理表单状态
   - 保存状态独立管理

3. **用户提示**
   - 提示组内至少需要 2 个窗口
   - 说明自动解散组的规则

#### ⚠️ 需要改进的地方

1. **窗口列表获取**（优先级：高）
   ```typescript
   // 当前：
   const windowsInGroup = []; // 空数组

   // 建议：从 group.layout 获取组内窗口列表
   // const windowsInGroup = useMemo(() =>
   //   getAllWindows(group.layout).map(id =>
   //     windowStore.getWindowById(id)
   //   ).filter(Boolean),
   //   [group.layout]
   // );
   ```

2. **移除窗口逻辑**（优先级：高）
   ```typescript
   // 当前：console.log('TODO: 实现移除窗口逻辑', windowId);

   // 建议：实现移除窗口逻辑
   // - 调用 windowStore.removeWindowFromGroup(group.id, windowId)
   // - 如果移除后只剩 1 个窗口，自动解散组
   // - 更新 UI
   ```

3. **添加窗口逻辑**（优先级：高）
   ```typescript
   // 当前：console.log('TODO: 实现添加窗口逻辑');

   // 建议：打开窗口选择对话框
   // - 显示所有未归档的独立窗口
   // - 支持多选
   // - 调用 windowStore.addWindowToGroup(group.id, windowIds)
   ```

4. **窗口列表 UI**（优先级：高）
   ```typescript
   // 当前：TODO 注释

   // 建议：实现窗口列表 UI
   // - 显示窗口名称、路径、状态
   // - 每个窗口显示移除按钮
   // - 支持拖拽排序
   ```

#### 💡 优化建议

1. **用户体验**
   - 添加窗口搜索/过滤功能
   - 显示窗口状态图标
   - 支持批量移除窗口

2. **表单验证**
   - 添加组名称长度限制
   - 添加组名称重复检查

---

## 代码质量评分

| 类别 | 评分 | 说明 |
|------|------|------|
| 架构设计 | 9/10 | 组件结构清晰，职责单一 |
| 代码质量 | 8/10 | 代码规范，类型定义待完善 |
| 性能优化 | 9/10 | 使用 React.memo、useMemo、useCallback |
| 错误处理 | 7/10 | 基本错误处理完善，待实现 IPC 错误处理 |
| 可访问性 | 9/10 | 支持键盘导航，提供 ARIA 属性 |
| 可维护性 | 9/10 | 代码清晰，注释完善 |
| 文档完整性 | 8/10 | TODO 注释清晰，待补充 JSDoc |

**总体评分**: 8.4/10

---

## 关键问题汇总

### 🔴 高优先级（必须修复）

1. **GroupCard**: 实现窗口数量计算逻辑
2. **GroupCard**: 实现聚合状态计算逻辑
3. **GroupCard**: 根据聚合状态动态显示启动/暂停按钮
4. **CreateGroupDialog**: 实现窗口列表显示和选择 UI
5. **CreateGroupDialog**: 实现 IPC 调用创建组
6. **EditGroupPanel**: 实现窗口列表显示 UI
7. **EditGroupPanel**: 实现移除窗口逻辑
8. **EditGroupPanel**: 实现添加窗口逻辑

### 🟡 中优先级（建议修复）

1. **GroupCard**: 替换 `any` 类型为正确的 `GroupLayoutNode` 类型
2. **GroupCard**: 实现时间格式化逻辑
3. **CreateGroupDialog**: 添加窗口搜索/过滤功能
4. **EditGroupPanel**: 添加窗口搜索/过滤功能

### 🟢 低优先级（可选）

1. **CreateGroupDialog**: 支持默认组名称
2. **GroupCard**: 添加操作确认对话框
3. **EditGroupPanel**: 支持拖拽排序窗口

---

## 下一步建议

1. **等待任务 #1 完成**
   - 替换临时类型定义为正确的 `WindowGroup` 和 `GroupLayoutNode` 类型
   - 导入 `groupLayoutHelpers` 工具函数

2. **等待任务 #2 完成**
   - 实现 IPC 调用（createGroup、updateGroup、deleteGroup 等）
   - 添加 IPC 错误处理

3. **等待任务 #3 完成**
   - 集成 windowStore 状态管理
   - 实现窗口列表获取和更新逻辑

4. **实现待办功能**
   - 按照优先级逐步实现所有 TODO 标记的功能
   - 编写单元测试验证功能

---

## 总结

ui-dev-1 完成的组件骨架质量优秀，代码规范，架构清晰。主要的待办工作都已经用 TODO 注释清晰标记，等待前置任务完成后可以快速填充实现。

**建议**:
- ✅ 批准合并组件骨架代码
- ⏳ 等待任务 #1、#2、#3 完成后，继续实现待办功能
- 📝 实现完成后，需要进行完整的功能测试和代码审查

---

**审查人**: QA Engineer
**审查日期**: 2026-03-14
