# 性能优化清单

> 审查日期：2026-03-06
> 最后更新：2026-03-06
> 原则：所有优化不得影响现有功能行为

## 优化进度总览

| 批次 | 状态 | 完成数 | 总数 | 说明 |
|------|------|--------|------|------|
| 第一批（无风险） | ✅ 已完成 | 5/5 | 100% | #2, #4, #6, #8, #10 |
| 第二批（低风险） | ⚠️ 部分完成 | 2/3 | 67% | #3, #11 已完成；#7 已回滚 |
| 第三批（中风险） | 🚧 进行中 | 2/4 | 50% | #1, #9 已完成；#5, #12 待做 |

**总进度**: 9/12 已完成（75%），1 项已回滚，2 项待做

---

## 已完成的优化 ✅

### 第一批 - 无风险优化（5/5）

#### ✅ #2 - 移除 useKeyboardShortcuts 中的 console.log
- **提交**: `b9d8e1d` - perf(renderer): 第一批无风险性能优化（5项）
- **效果**: 减少每次按键的日志序列化开销（开发环境）

#### ✅ #4 - TerminalView 布局树遍历加 useMemo
- **提交**: `b9d8e1d`
- **效果**: 避免每次渲染都递归遍历布局树

#### ✅ #6 - QuickSwitcher 过滤排序加 useMemo
- **提交**: `b9d8e1d`
- **效果**: 避免每次按键都重新过滤排序窗口列表

#### ✅ #8 - SidebarWindowItem getAggregatedStatus 加 useMemo
- **提交**: `b9d8e1d`
- **效果**: 避免每次渲染都遍历布局树计算状态

#### ✅ #10 - App.tsx 派生值加 useMemo
- **提交**: `b9d8e1d`
- **效果**: 缓存 activeWindow 和 hasActiveWindows 计算

### 第二批 - 低风险优化（2/3）

#### ✅ #11 - 删除 selectors.ts 死代码
- **提交**: `d62d110` - refactor(renderer): 删除 selectors.ts 中的死代码
- **效果**: 删除引用不存在字段的 selector

#### ✅ #3 - SplitLayout 拖拽 resize 用 ref
- **提交**: `c91240b` - perf(renderer): 优化 SplitLayout 拖拽性能
- **效果**: 拖拽时不再每帧重建事件监听器

#### ✅ #7 - CardGrid/ArchivedView 内联回调优化（已回滚）
- **提交**: `94ae61d` → `f201d18` (已回滚)
- **原因**: 优化导致 React.memo 失效，反而增加渲染次数
- **状态**: 已回滚，不再实施

### 第三批 - 中风险优化（1/4）

#### ✅ #1 - PTY write/resize 线性扫描进程列表
- **提交**: `5ffe0ff` - perf(main): 优化 PTY write/resize 性能，使用索引替代线性查找
- **效果**: 每次按键从 O(N) 降到 O(1)，窗口越多收益越大
- **实现方案**:
  - 在 ProcessManager 中添加 `paneIndex: Map<string, number>` 索引
  - 新增 `getPidByPane(windowId, paneId)` 方法，O(1) 查找
  - 在 `spawnTerminal` 和 `killProcess` 中维护索引
  - ptyHandlers 使用索引查找，索引未命中时降级到线性查找（防御性编程）

#### ✅ #9 - StatusDetector + StatusPoller 双重轮询
- **提交**: 待提交
- **效果**: 减少 50% 的状态检测开销，降低 CPU 占用
- **实现方案**:
  - 移除 StatusDetector 的内部轮询（startPolling/stopPolling/pollAll）
  - 保留 StatusDetector 的状态检测逻辑和订阅机制
  - 只由 StatusPoller 统一管理轮询
  - 更新测试，移除 pidusage 相关的过时测试

---

## 待实施的优化 ⏸️

### 第三批 - 中风险优化（剩余 2/4）

以下优化按**预期收益**排序：

## LOW — 影响较小

### 5. getActiveWindows() 作为方法调用而非 selector 订阅

**文件**: `src/renderer/components/TerminalView.tsx:54`, `src/renderer/components/Sidebar.tsx:35-36`

**问题**: `getActiveWindows()` 和 `getArchivedWindows()` 是 store 方法直接调用，不是 selector 订阅。每次调用都创建新数组，且 windows 变化时不会自动触发重渲染（数据可能过时）。

**方案**: 改为 selector 订阅。

```typescript
const activeWindows = useWindowStore(state => state.windows.filter(w => !w.archived));
```

**风险评估**: ⚠️ 中风险
- 改为 selector 后，`windows` 数组任何变化（包括其他窗口的状态更新）都会触发 filter 重新执行
- Zustand 默认使用 `Object.is` 比较，filter 每次返回新数组引用，会导致组件重渲染
- **必须配合 `shallow` 比较或 `useMemo`**，否则反而增加渲染次数：
  ```typescript
  import { shallow } from 'zustand/shallow';
  const activeWindows = useWindowStore(
    state => state.windows.filter(w => !w.archived),
    shallow
  );
  ```
- 测试重点：Sidebar 窗口列表是否正确响应窗口增删、归档/取消归档操作

---

### 6. QuickSwitcher 过滤排序未 memoize

**文件**: `src/renderer/components/QuickSwitcher.tsx:56-79`

**问题**: `filteredWindows` 在每次渲染时重新计算，包括每次搜索框按键。内部对每个窗口调用 `getAggregatedStatus` 遍历布局树。

**方案**: 用 `useMemo` 包裹。

```typescript
const filteredWindows = useMemo(() =>
  windows.filter(...).sort(...),
  [windows, query, currentWindowId]
);
```

**风险评估**: ✅ 无风险
- 依赖项完整覆盖了所有影响过滤/排序结果的变量
- `getWindowPriority` 函数定义在组件内部，但它是纯函数且不依赖外部状态，不需要加入依赖数组

---

### 7. CardGrid / ArchivedView 内联回调击穿 React.memo

**文件**: `src/renderer/components/CardGrid.tsx:190-201`, `src/renderer/components/ArchivedView.tsx:191-197`

**问题**: `WindowCard` 使用了 `React.memo`，但 `.map()` 中传入内联箭头函数 `() => handleCardClick(win)`，每次渲染都创建新引用，导致所有卡片都重渲染。

**方案A**: 提取 `WindowCardWrapper` 组件，接收稳定回调 + window 对象，内部绑定参数。

**方案B**: 修改 `WindowCard` 接口，接收 `window` 对象和稳定回调，由 `WindowCard` 内部调用 `onClick(window)`。

**风险评估**: ⚠️ 低风险
- 方案A 增加一层组件嵌套，但逻辑清晰
- 方案B 需要修改 `WindowCard` 的 props 接口，影响所有使用方（CardGrid、ArchivedView、可能还有其他）
- 两种方案都不改变行为，只改变回调绑定时机
- 测试重点：点击卡片各按钮（启动、暂停、归档、删除、打开文件夹）功能是否正常

---

### 8. SidebarWindowItem getAggregatedStatus 未 memoize

**文件**: `src/renderer/components/SidebarWindowItem.tsx:101`

**问题**: 在渲染体中直接调用 `getAggregatedStatus(terminalWindow.layout)`，每次渲染都遍历布局树。

**方案**: 用 `useMemo` 包裹。

```typescript
const aggregatedStatus = useMemo(
  () => getAggregatedStatus(terminalWindow.layout),
  [terminalWindow.layout]
);
```

**风险评估**: ✅ 无风险
- 与 #4 相同的模式，纯计算缓存

---

## LOW — 影响较小

### 9. StatusDetector + StatusPoller 双重轮询

**文件**: `src/main/services/StatusDetector.ts:117-123`, `src/main/services/StatusPoller.ts:38-41`

**问题**: `StatusDetector` 自身有 `pollAll()` 每 1s 轮询所有 PID，`StatusPoller` 也有 1s 轮询循环调用 `statusDetector.detectStatus()`。同一个 PID 被检测两次。

**方案**: 移除 `StatusDetector` 的内部轮询，只保留 `StatusPoller` 的轮询（它有活跃/非活跃窗格的差异化轮询间隔）。

**风险评估**: ⚠️ 中风险
- `StatusDetector` 的 `subscribeStatusChange` 依赖其内部轮询来触发状态变化通知
- 如果移除 `StatusDetector` 的轮询，需要确认 `StatusPoller` 的通知路径能完全覆盖
- `StatusDetector.startPolling()` 在 `ProcessManager` 构造函数中调用，需要确认移除后不影响其他依赖方
- 测试重点：窗口状态变化（Running → WaitingForInput → Exited）是否仍能正确检测和显示

---

### 10. App.tsx 派生值未 memoize

**文件**: `src/renderer/App.tsx:80-81`

**问题**:
```typescript
const activeWindow = windows.find((w) => w.id === activeWindowId);
const activeWindows = windows.filter(w => !w.archived);
```
每次渲染都重新计算。`activeWindows` 还和 `CardGrid` 内部的计算重复。

**方案**: 用 `useMemo` 包裹。`activeWindows` 仅用于判断 `length === 0`，可以简化为 `useMemo(() => windows.some(w => !w.archived), [windows])`。

**风险评估**: ✅ 无风险
- 纯计算缓存，不改变行为

---

### 11. selectors.ts 死代码

**文件**: `src/renderer/stores/selectors.ts:23-24, 31-45`

**问题**: `selectWindowsByStatus` 和 `selectStatusCounts` 引用 `w.status`，但 `Window` 类型已无顶层 `status` 字段（状态在 Pane 上）。这是死代码。

**方案**: 删除这两个 selector，或修正为使用 `getAggregatedStatus`。

**风险评估**: ⚠️ 低风险
- 需要先确认没有其他文件引用这两个 selector
- 如果有引用方，删除会导致编译错误（容易发现）
- 测试重点：全局搜索确认无引用后直接删除

---

### 12. AutoSaveManager 每次保存都做完整校验

**文件**: `src/main/services/AutoSaveManager.ts:98-117`

**问题**: 每次保存都通过 `new Map()` 去重、递归 `normalizeLayout`、递归 `validateLayout`。正常运行时数据不会重复或缺字段。

**方案**: 添加 dirty flag，仅在数据实际变化时做完整校验；或者只在开发环境做校验。

**风险评估**: ⚠️ 中风险
- 校验是防御性编程，移除后如果出现异常数据会直接写入磁盘
- 建议保守方案：保留校验，但缓存上次保存的 workspace 引用，引用相同时跳过保存
- 去重逻辑如果移除，需要确认不会出现重复窗口的场景
- 测试重点：频繁操作后 workspace.json 数据完整性

---

## 风险总结

| # | 优化项 | 风险等级 | 可能的副作用 |
|---|--------|---------|-------------|
| 1 | PTY 索引 | 低 | 索引不同步导致写入失败 |
| 2 | 移除 console.log | 无 | 无 |
| 3 | SplitLayout ref | 低 | 拖拽行为异常（概率极低） |
| 4 | TerminalView useMemo | 无 | 无 |
| 5 | selector 订阅 | 中 | 不配合 shallow 会增加渲染；数据响应性变化 |
| 6 | QuickSwitcher useMemo | 无 | 无 |
| 7 | 内联回调 | 低 | 接口变更影响多处调用方 |
| 8 | SidebarWindowItem useMemo | 无 | 无 |
| 9 | 双重轮询 | 中 | 状态通知链路可能断裂 |
| 10 | App.tsx useMemo | 无 | 无 |
| 11 | 删除死代码 | 低 | 需确认无引用 |
| 12 | AutoSave 校验 | 中 | 异常数据可能写入磁盘 |

### 建议实施顺序（安全优先）

**第一批（无风险，直接改）**: #2, #4, #6, #8, #10 ✅ 已完成
**第二批（低风险，简单验证）**: #3, #11 ✅ 已完成；#7 ❌ 已回滚
**第三批（需仔细设计和测试）**: #1, #5, #9, #12 ⏸️ 待实施

---

## 性能分析与建议

### 已完成优化的实际效果

**第一批和第二批优化主要收益**：
- ✅ 减少开发环境的日志开销（#2）
- ✅ 避免不必要的布局树遍历（#4, #8）
- ✅ 缓存过滤排序结果（#6）
- ✅ 优化拖拽体验（#3）
- ✅ 代码清理（#11）

**实际感知**：
- 这些优化主要是**避免重复计算**，但这些计算本身就很快（遍历几个窗口）
- 在窗口数量少（<10）时，性能提升**不明显**
- 主要是**代码质量**和**可维护性**的改善

### 剩余优化的预期收益

按**实际性能影响**排序：

#### 🔥 #1 - PTY 索引（强烈推荐）
- **预期收益**: ⭐⭐⭐⭐⭐ 非常高
- **影响场景**: 每次按键输入
- **性能提升**: 窗口数量 N，从 O(N) 降到 O(1)
- **用户感知**: 窗口多时输入响应明显改善
- **建议**: **优先实施**

#### 🔥 #9 - 双重轮询合并（推荐）
- **预期收益**: ⭐⭐⭐⭐ 高
- **影响场景**: 持续后台轮询
- **性能提升**: 减少 50% 的状态检测开销
- **用户感知**: 降低 CPU 占用，改善电池续航
- **建议**: **优先实施**

#### 💤 #5 - selector 订阅改造（可选）
- **预期收益**: ⭐⭐ 低
- **影响场景**: Sidebar 数据更新
- **性能提升**: 边缘情况优化
- **用户感知**: 几乎无感知
- **建议**: **可以跳过**

#### 💤 #12 - AutoSave 校验精简（可选）
- **预期收益**: ⭐ 很低
- **影响场景**: 自动保存（已防抖 300ms）
- **性能提升**: 微小
- **用户感知**: 无感知
- **建议**: **可以跳过**

### 最终建议

**如果要继续优化**：
1. 先做 **#1（PTY 索引）** - 这是热路径优化，收益最大
2. 再做 **#9（双重轮询）** - 减少后台开销
3. **#5 和 #12 可以不做** - 投入产出比太低

**如果当前性能已满足需求**：
- 可以暂停优化，等真正遇到性能瓶颈时再针对性优化
- 过早优化是万恶之源（Premature optimization is the root of all evil）

**性能监控建议**：
- 添加性能埋点，监控关键路径的耗时（PTY write、状态轮询）
- 使用 Chrome DevTools Performance 分析实际瓶颈
- 基于数据驱动优化，而不是猜测

