# Browser Pane Drag Reorder Postmortem

## 问题现象

- 终端视图是左右分栏时，右上角地球图标可以正常拖拽，新建 browser pane。
- 已创建 browser pane 左上角 6 点拖拽把手无法重排。
- 表现为：
  - 拖拽源日志能出现。
  - browser pane 的 `webview` 会被临时移走以避免吞事件。
  - target pane 的 drop surface 已激活。
  - 但没有任何有效的 `hover/drop` 命中，最终 `didDrop=false`。

## 为什么地球图标正常，而 browser pane 不正常

两者不是同一条拖拽链路。

- 地球图标：
  - 位于终端顶部工具栏。
  - 是普通按钮，不带 `webview` 容器环境。
  - 使用现有 HTML5/react-dnd 拖拽即可稳定工作。
- browser pane 6 点把手：
  - 位于 `BrowserPane` 头部。
  - 所在 pane 内部挂着 Electron `webview`。
  - 周围还有 split layout、overlay surface、focus/active 切换等事件干扰。
  - 原先依赖 HTML5/native drag + react-dnd 的链路在这个场景下不稳定，drag session 会提前结束。

结论：

- 不是“整个应用拖拽坏了”。
- 是“browser pane 重排这条链路”在 `webview` 场景里不稳定。

## 排查过程中的关键信号

以下日志组合说明 source 已启动，但 target 没接住：

```text
[BrowserDnd] handle mousedown
[BrowserDnd] native dragstart
[BrowserDnd] react-dnd begin
[BrowserDnd] webview parked for drag
[BrowserDnd] drop surface active
[BrowserDnd] react-dnd end ... didDrop=false
```

如果只有这些日志，而没有：

- `native target over`
- `native drop`

说明问题不在布局 mutation，而在 target 未收到稳定拖拽事件。

## 根因

根因分两层：

1. browser pane 重排错误地继续依赖 HTML5/native drag 会话。
2. `BrowserPane` 所处的 `webview` 场景下，这条会话即使 source 能启动，也可能在 hover/drop 前提前结束。

因此即使：

- 拖拽源开始了。
- `webview` 也被临时 park 了。
- drop overlay 也激活了。

仍然可能完全没有有效 drop。

## 最终修法

browser pane 重排不再依赖原来的 HTML5/react-dnd source，而改成独立的 pointer drag 路径：

- `mousedown` 后记录被拖拽的 browser pane。
- 在 `document` 级别监听 `mousemove` / `mouseup`。
- 用 `elementsFromPoint()` 命中带 `data-pane-drop-zone="true"` 的 pane surface。
- 实时计算 `left/right/top/bottom` 落点。
- `mouseup` 时直接调用 `movePaneInWindow()` 执行布局重排。

这样处理后：

- 地球图标仍保留原有拖拽创建 browser pane 的实现。
- browser pane 6 点把手改走更稳定的内部指针拖拽。
- 两条交互路径互不干扰。

## 相关文件

- `src/renderer/components/SplitLayout.tsx`
- `src/renderer/components/BrowserPane.tsx`
- `src/renderer/components/dnd/PaneDropZone.tsx`
- `src/renderer/utils/browserPanePointerDragState.ts`
- `src/renderer/utils/browserPaneDragState.ts`

## 后续经验

- 不要把“工具栏拖拽创建 pane”和“已存在 pane 的重排拖拽”强行复用成同一条 source 链路。
- 只要拖拽对象附近存在 Electron `webview`，就要优先怀疑 HTML5 drag 会话稳定性。
- 对这类问题，日志要同时覆盖：
  - source begin/end
  - target surface active
  - hover target
  - final drop/cancel
- 如果 source 正常、surface 激活、但没有 hover/drop，优先绕开 native drag，会比继续补 target 兜底更有效。
