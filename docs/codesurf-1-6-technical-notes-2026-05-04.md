# CodeSurf 1-6 Technical Notes

## 目的

这份文档补充 `docs/codesurf-1-6-enhancements-prd-2026-05-04.md` 与 `docs/codesurf-1-6-enhancements-technical-design-2026-05-04.md`，按 1-6 六个增强点分别说明：

- 当前实现落点
- 与原有能力的边界
- 已验证的闭环
- 后续仍可扩展但本轮未强行侵入的部分

核心原则始终不变：

- 只做增强，不替换原有主流程
- 默认不打扰，入口显式、可折叠、可忽略
- 新能力失败时应优先降级，而不是影响旧能力

## 1. Session Aggregation and Restore

### 当前实现

- 主进程 `SessionAggregationService` 负责聚合 Synapse / Claude Code / Codex 会话元数据
- `taskEnhancementHandlers.ts` 暴露：
  - `list-aggregated-sessions`
  - `get-aggregated-session-detail`
  - `restore-aggregated-session`
- `ChatPane` 在历史菜单中增加“外部会话”分组
- 恢复外部会话后，当前 pane 创建新的 conversation transcript，并记录为 activity event

### 用户获得的能力

- 不需要再自己翻 `~/.claude` 或 `~/.codex`
- 可以把 CLI 里已有的诊断/开发上下文带回 Synapse 的聊天面板
- 不改变当前终端执行态，只恢复对话历史

### 非回归边界

- 不接管 Claude Code / Codex 的运行生命周期
- 不重建外部工具的真实任务状态
- 仍然保留原有 Synapse conversation history / checkpoint 行为

## 2. Task Activity Stream

### 当前实现

- `src/renderer/utils/taskActivity.ts` 统一聚合：
  - chat messages
  - agent timeline
  - canvas activity
  - artifact save
  - manual history-restore events
- `ChatPane` 顶部新增增强摘要卡，但默认折叠
- 活动数据会回写到 pane chat state，便于后续恢复与汇总

### 用户获得的能力

- 能快速回顾“这次任务做了什么”
- 不需要重新翻完整 transcript 才知道任务的关键节点
- 适合长任务回看，不干扰短任务

### 非回归边界

- 默认不展开，避免与 transcript 重复竞争注意力
- transcript 仍是主视图，activity 只是辅助摘要

## 3. Plan Panel / Todo Extraction

### 当前实现

- `src/renderer/utils/taskPlan.ts` 从 assistant checklist / numbered list 提取计划项
- `TaskPlanPane` 作为右侧独立面板显示
- `ChatPane` 顶部新增计划按钮，用于显式开关右侧计划面板

### 用户获得的能力

- 任务步骤可以被抽出来独立看
- 长任务里更容易知道当前做到哪一步
- 不需要用户手动从回答里抄 checklist

### 非回归边界

- 不要求 agent 必须生成计划
- 提取失败时只是不显示计划，不影响聊天
- 不改写原消息内容，不替代 transcript

## 4. Task Artifact Archive

### 当前实现

- 主进程 `TaskArtifactService` 把会话和计划保存到 `userData/artifacts`
- `ChatPane` 顶部新增归档按钮
- 已归档内容在增强摘要卡中可查看最近条目，并支持打开目录、删除索引

### 用户获得的能力

- 一次排障或分析可以被沉淀成可复用记录
- 不需要再手动复制粘贴到外部文档
- 会话恢复后也可以继续归档保存

### 非回归边界

- 归档是显式动作，不自动打断当前使用流程
- 删除归档只影响归档记录，不影响当前 pane transcript

## 5. Browser Login-State Sync

### 当前实现

- 主进程 `BrowserSyncService`
- 设置页 `Advanced` 新增浏览器登录态同步区块
- 仅在用户切到 `Advanced` 页后按需加载 profile/state
- 用户点击“同步”后才执行导入，并把结果写回 settings

### 用户获得的能力

- 用内置浏览器访问已登录站点时，减少重复登录
- 能知道同步到了哪个 profile、最近何时同步过

### 非回归边界

- 不自动抢占浏览器登录流程
- 不改变原有 BrowserPane 默认打开与导航行为
- 不支持的平台只显示不可用状态，不影响设置页其它能力

## 6. Extension / MCP Capability Enhancements

### 当前实现

- `PluginCenter` 新增能力概览区域
- 展示两部分：
  - MCP 服务器与工具快照
  - 已安装插件 capability type 汇总
- 主进程 `McpCapabilityService` 提供只读快照

### 用户获得的能力

- 能直观看到“插件装了以后到底多了什么”
- 当某项能力不可用时，更容易判断是插件没装、没启用，还是 MCP 没暴露

### 非回归边界

- 不重构插件执行栈
- 不改变插件安装、启用、卸载既有流程
- 先解决“可见性与诊断”，不是重写工具执行模型

## 已验证闭环

- `ChatPane` focused tests 通过
- `SettingsPanel` focused tests 通过
- 新增一条插件能力/MCP 摘要测试覆盖
- `npm run build:main` 通过
- `npm run build:renderer:typecheck` 通过

## 本轮刻意没有做的侵入式设计

- 没有引入后台 jobs/sidecar 体系
- 没有重做 SSH Chat 的交互模型
- 没有改变终端创建、启动、拆分、布局记忆逻辑
- 没有把增强默认展开成新的主工作流

## 后续仍可扩展

- 聚合会话增加更细筛选与预览
- artifact 支持正文按需读取与内容检索
- plan panel 支持发送到画布便签
- browser sync 增加更多浏览器来源
- plugin capability 与 MCP tool 做更直接的映射关系展示
