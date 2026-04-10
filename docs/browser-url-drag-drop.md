# 浏览器窗格 URL 拖拽设计

## 背景

当前终端内识别到的 `http/https` 链接只有点击行为，点击后通过主进程 `shell.openExternal()` 在系统浏览器中打开。应用内部已经具备浏览器窗格、浏览器窗格拖拽重排、以及 pane 级 drop zone，但还缺少“把终端中的链接拖到浏览器窗格里打开”的完整链路。

本设计补齐两类能力：

1. 将终端中的 URL 拖到已有浏览器窗格，在当前浏览器窗格中打开。
2. 将终端中的 URL 拖到任意 pane 的边缘，在目标 pane 相邻位置创建新的浏览器窗格并打开该 URL。

## 目标交互

### 1. 终端侧

- 链接单击行为保持不变，仍然打开系统浏览器。
- 鼠标悬停在终端链接上时，在链接附近显示一个可拖拽的浮动拖拽条。
- 拖拽条使用原生 HTML5 `draggable`，写入：
  - `text/uri-list`
  - `text/plain`

这样终端链接既保留了点击打开外部浏览器的语义，又增加了明确的“拖到应用内浏览器”的入口，不和终端文本选择直接冲突。

### 2. 目标 pane 侧

所有 pane 都保持可作为拖拽目标，但 drop 语义分成两类：

- `left/right/top/bottom`
  - 在目标 pane 相邻方向创建新的浏览器窗格
- `center`
  - 只对“原生 URL 拖拽到浏览器窗格”生效
  - 语义为“在当前浏览器窗格打开 URL”

### 3. 典型布局例子

拖拽前：

```text
[ terminal ] | [ browser A ]
```

将 URL 拖到 `browser A` 的 `bottom` 区域后：

```text
[ terminal ] | [ browser A ]
             | [ browser B(url) ]
```

这对应在右侧 browser pane 节点下再插入一个纵向 split。

## 5 区 drop 模型

pane 的目标区域分为 5 个区：

- `left`
- `right`
- `top`
- `bottom`
- `center`

其中：

- `center` 只在“目标是 browser pane 且拖拽项是 URL”时启用
- 浏览器窗格重排、工具栏“新建浏览器”拖拽仍只支持四边

这样可以避免两个动作冲突：

- 拖到中心：复用当前浏览器窗格
- 拖到边缘：在该方向分出新的浏览器窗格

## 为什么终端侧不用 react-dnd source

`TerminalPane` 在现有测试里被大量单独渲染。如果把 `useDrag` 直接引入 `TerminalPane`，这些测试都需要补 `DndProvider` 或大量 mock。

因此终端侧采用原生 HTML5 拖拽：

- 优点：
  - 不侵入 `TerminalPane` 的测试基础设施
  - 与浏览器原生 URL 拖拽模型一致
  - `react-dnd-html5-backend` 可以在目标侧直接消费原生 URL
- 代价：
  - 需要在 drop target 侧额外接 `NativeTypes.URL`

这个权衡对当前代码库最稳。

## 为什么 browser pane 需要覆盖层

浏览器窗格主体是 Electron `webview`。如果仍然只把 drop target 挂在外层容器上，拖拽经过 `webview` 时事件可能直接落到客体页面，React 层拿不到 hover/drop。

解决方式：

- `PaneDropZone` 始终渲染一个 `absolute inset-0` 的覆盖层
- 平时 `pointer-events: none`
- 只有拖拽兼容项激活时才切换成 `pointer-events: auto`

这样拖拽经过 browser pane 时，事件会先命中应用自己的覆盖层，`webview` 不会吞掉 drop 行为。

## 状态流

### URL 拖到 browser pane 中心

1. 终端链接 hover，显示拖拽条
2. 用户开始拖拽，产生原生 URL drag item
3. 目标 browser pane 的 drop zone 判定位置为 `center`
4. 更新目标 pane 的 `browser.url`
5. `BrowserPane` 监听持久化 URL 变化并加载新地址

### URL 拖到 pane 边缘

1. 终端链接 hover，显示拖拽条
2. 用户拖到目标 pane 的边缘区
3. drop zone 返回 `left/right/top/bottom`
4. `TerminalView` 根据方向创建新的 browser pane draft
5. `placePaneInWindow()` 将新 pane 插入布局树
6. 新 browser pane 自动加载拖拽 URL

## 实现边界

本次实现包含：

- 终端链接 hover 拖拽条
- URL 拖到已有 browser pane 中心打开
- URL 拖到任意 pane 边缘新建 browser pane
- browser pane 上层覆盖式 drop surface
- 对现有 browser pane 拖拽重排行为保持兼容

本次不包含：

- 直接拖拽终端里文本本体，不经过 hover 拖拽条
- 跨窗口拖拽 URL 到其他窗口
- 从 browser pane 页面内部再反向拖回 terminal

## 测试重点

- `browserDrop` 逻辑：
  - URL + browser center => 在当前 browser pane 打开
  - URL + browser bottom => 纵向新建 browser pane
  - browser pane move => 仍走重排逻辑
- `terminalLinks`：
  - hover/leave 回调能带出 URL 和 range
  - click 行为不回归
- `BrowserPane` / `PaneDropZone`：
  - browser pane 仍可正常加载 URL
  - overlay 只在拖拽期间接管事件
