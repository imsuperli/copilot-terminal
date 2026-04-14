# CodePane IDE 差距补全实施顺序文档（2026-04-14）

## 1. 文档目的

本文用于把 `CodePane` 对标 IntelliJ IDEA / PyCharm / GoLand 的剩余高优先级能力，整理成可执行的实施顺序、批次边界、验收标准与提交节奏。

详细设计见：

- `docs/code-pane-ide-gap-closure-detailed-design-2026-04-14.md`

## 2. 当前结论

结论明确如下：

- 现有通用 `CodePane` 架构可以继续承接后续能力，不需要推翻重做
- 第一批应优先做“结构化导航表层”，因为复用现有 `hover / document symbols` 即可落地
- 调试深化、环境管理、Git/重构深化、插件运行时接入都应在统一模型补齐后再分批推进
- 推荐按 `P10 -> P11 -> P12 -> P13 -> P14` 的顺序推进

## 3. 总体实施顺序

### 3.1 P10：结构化导航与语义呈现

#### P10-1：Breadcrumbs + Quick Documentation

范围：

- Breadcrumbs
- 当前光标符号路径
- Quick Documentation 面板
- 光标上下文驱动刷新

验收：

- 当前文件可展示 breadcrumb
- 当前符号路径可稳定跟随光标变化
- Quick Documentation 可通过按钮、命令与快捷键打开
- 请求失败不应阻塞编辑器交互

提交建议：

- `feat(code-pane): add breadcrumbs and quick documentation`

#### P10-2：层级导航与语义增强

范围：

- Call Hierarchy
- Type Hierarchy
- Inlay Hints
- Semantic Tokens
- outline / highlight 联动增强

验收：

- 层级导航可打开、可跳转、可回退
- hints / semantic 渲染支持能力探测和退化
- 不支持的语言不会出现错误提示风暴

提交建议：

- `feat(code-pane): add hierarchy navigation`
- `feat(code-pane): add semantic presentation layer`

### 3.2 P11：调试深化

#### P11-1：断点与会话管理增强

范围：

- 条件断点
- 日志断点
- Breakpoint 管理器
- Exception breakpoint
- Launch / Attach 统一配置模型

验收：

- 断点编辑、删除、禁用具备一致入口
- 会话切换不会丢失断点状态
- 条件断点失败有明确 feedback

#### P11-2：调试上下文增强

范围：

- Watch 持久化
- 线程 / 栈 / scope 深化
- 会话恢复与断点同步

验收：

- watch 在 pane 重建后可恢复
- 调试暂停时变量与帧上下文同步稳定

### 3.3 P12：项目环境管理

#### P12-1：Java / Python / Go 环境控制面板

范围：

- Maven / Gradle reimport
- Python interpreter / venv / conda / poetry 选择
- Go env / work / module refresh

验收：

- 各语言都可看到统一入口
- 不支持的项目类型可优雅隐藏
- 状态变化有明确进度反馈

#### P12-2：项目修复与状态透明化

范围：

- 导入阶段进度细化
- 常见环境异常诊断
- 一键修复入口

验收：

- Maven 导入、Python 环境、Go module 问题都能看到具体阶段
- 错误消息具备可执行修复建议

### 3.4 P13：Git 与重构深化

#### P13-1：Git 操作粒度增强

范围：

- hunk/chunk 级 stage / discard
- branch 管理
- interactive rebase 视图

验收：

- 文件树与 diff 视图都能触发 chunk 级操作
- 分支管理具备清晰的冲突/风险提示

#### P13-2：冲突与重构深化

范围：

- 三方冲突解决视图
- move class / package / module
- safe delete 深校验
- change signature / extract / inline 深化

验收：

- 冲突解决支持 ours / theirs / merged 对比
- 重构继续走 preview，再写入

### 3.5 P14：插件运行时与保存质量链路

#### P14-1：插件运行时接入

范围：

- formatter runtime
- linter runtime
- test provider runtime
- debug adapter runtime

验收：

- 语言插件 capability 可以真正进入运行链路
- 缺失实现时有明确 fallback

#### P14-2：保存质量门禁

范围：

- format on save
- organize imports on save
- lint on save
- quality gate status

验收：

- 任何一步失败都不会阻止保存
- 用户能看到具体是哪一步失败

## 4. 实施依赖与串行原则

### 4.1 必须先做

- `P10-1`

原因：

- 依赖最少
- 主观体验提升最快
- 能先把“阅读代码”链路补齐

### 4.2 需要模型前置

- `P11`
- `P14`

原因：

- 都涉及统一 runtime / session / pipeline 抽象

### 4.3 需要语言适配深入参与

- `P12`
- `P13`

原因：

- 项目环境和重构都强依赖语言侧能力

## 5. 具体开发节奏

建议按以下提交顺序推进：

1. `P10-1`
2. `P10-2`
3. `P11-1`
4. `P11-2`
5. `P12-1`
6. `P12-2`
7. `P13-1`
8. `P13-2`
9. `P14-1`
10. `P14-2`

每一批都执行同样闭环：

1. 完成功能实现
2. 补测试
3. 跑类型检查与相关测试
4. 走查代码
5. 单独提交

## 6. 方案评估

评估结论：

- 该实施顺序没有明显架构冲突
- 当前仓库基础设施足以支持 `P10-1` 直接开工
- 后续批次的主要风险不在 UI，而在状态模型与 runtime 协议一致性
- 因此可以先按该顺序持续开发，无需等待额外架构重构

## 7. 当前执行点

当前进度：

- `P10-1` 已进入实现并完成第一轮闭环
- `P10-2` 已开始，当前先落地 `Inlay Hints`

后续仍按本文顺序继续推进。
