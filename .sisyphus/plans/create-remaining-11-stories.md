# 创建剩余 11 个故事文件

## TL;DR

> **Quick Summary**: 批量创建 Epic 3-6 的 11 个故事文件，使用 create-story 工作流的 YOLO 模式自动化执行
> 
> **Deliverables**: 
> - 11 个完整的故事文件 (3-1 through 6-3)
> - 更新后的 sprint-status.yaml (所有故事状态 = ready-for-dev)
> 
> **Estimated Effort**: Medium (约 2-3 小时，取决于工作流执行速度)
> **Parallel Execution**: NO - 必须顺序执行（sprint-status.yaml 写入冲突）
> **Critical Path**: 3-1 → 3-2 → 3-3 → 3-4 → 4-1 → 4-2 → 5-1 → 5-2 → 6-1 → 6-2 → 6-3

---

## Context

### Original Request
用户需要为 ausome-terminal 项目创建剩余的 11 个故事文件（Epic 3-6），已完成 Epic 1-2 的 8 个故事。

### Interview Summary
**Key Discussions**:
- 执行方式: 选项 A - 一次性批量创建所有 11 个故事
- YOLO 模式: 启用（完全自动化，跳过所有确认）
- 质量检查: 跳过验证（快速完成，后续统一检查）
- 文档语言: 保持现有模式（中文用户故事 + 英文技术细节）

**Research Findings**:
- 故事文件结构模板已识别（7 个标准章节）
- 架构约束已提取（Electron + React + Radix UI + Zustand + node-pty + xterm.js）
- UX 模式已记录（深色主题、状态色、零动画、键盘导航）
- 所有 11 个 backlog 故事的详细信息已获取

### Gap Analysis (Self-Review)
**Identified Gaps** (addressed):
- Epic 状态自动更新: 工作流会在创建 Epic 的第一个故事时自动将 Epic 状态从 `backlog` 更新为 `in-progress`
- 工作流自动发现: 工作流会自动从 sprint-status.yaml 找到第一个 `backlog` 状态的故事，无需手动指定
- 顺序执行必要性: 由于 sprint-status.yaml 写入冲突，必须顺序执行，不能并行
- 失败恢复机制: 如果某个故事创建失败，可以从断点继续（工作流会自动跳过已创建的故事）

---

## Work Objectives

### Core Objective
为 ausome-terminal 项目批量创建 Epic 3-6 的 11 个故事文件，使用 create-story 工作流的 YOLO 模式实现完全自动化执行。

### Concrete Deliverables
- `_bmad-output/implementation-artifacts/3-1-window-card-component.md`
- `_bmad-output/implementation-artifacts/3-2-responsive-card-grid-layout.md`
- `_bmad-output/implementation-artifacts/3-3-status-bar.md`
- `_bmad-output/implementation-artifacts/3-4-empty-state-and-new-window-entry.md`
- `_bmad-output/implementation-artifacts/4-1-status-detector-service.md`
- `_bmad-output/implementation-artifacts/4-2-real-time-status-update-mechanism.md`
- `_bmad-output/implementation-artifacts/5-1-terminal-view.md`
- `_bmad-output/implementation-artifacts/5-2-click-to-switch-interaction.md`
- `_bmad-output/implementation-artifacts/6-1-workspace-manager-service.md`
- `_bmad-output/implementation-artifacts/6-2-auto-save-workspace.md`
- `_bmad-output/implementation-artifacts/6-3-restore-workspace-on-startup.md`
- 更新后的 `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Definition of Done
- [ ] 所有 11 个故事文件已创建并包含完整的 7 个标准章节
- [ ] sprint-status.yaml 中所有 11 个故事的状态已更新为 "ready-for-dev"
- [ ] Epic 3, 4, 5, 6 的状态已自动更新为 "in-progress"
- [ ] 所有故事文件遵循已建立的模板和格式约定
- [ ] 所有故事文件包含正确的架构约束和 UX 模式引用

### Must Have
- 顺序执行（3-1 → 3-2 → ... → 6-3）
- YOLO 模式启用（无人工干预）
- 保持双语模式（中文用户故事 + 英文技术细节）
- 每个故事文件包含完整的 Dev Notes 和 References 章节

### Must NOT Have (Guardrails)
- 不修改已完成的 8 个故事文件（Epic 1-2）
- 不跳过任何故事（必须创建全部 11 个）
- 不并行执行（避免 sprint-status.yaml 写入冲突）
- 不手动编辑 sprint-status.yaml（由工作流自动更新）

---

## Verification Strategy

### Automated Verification Only (NO User Intervention)

每个 TODO 包含可执行的验证程序，代理可以直接运行：

**For File Creation** (using Bash):
```bash
# Agent runs:
test -f "_bmad-output/implementation-artifacts/3-1-window-card-component.md" && echo "PASS: File exists" || echo "FAIL: File not found"

# Assert: Output contains "PASS: File exists"
```

**For sprint-status.yaml Updates** (using Bash + grep):
```bash
# Agent runs:
grep "3-1-window-card-component: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
# Assert: Exit code 0 (match found)

grep "epic-3: in-progress" _bmad-output/implementation-artifacts/sprint-status.yaml
# Assert: Exit code 0 (match found)
```

**For File Content Validation** (using Bash + grep):
```bash
# Agent runs:
grep -q "## Story" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
grep -q "## Acceptance Criteria" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
grep -q "## Tasks / Subtasks" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
grep -q "## Dev Notes" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
grep -q "## References" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
echo "PASS: All required sections present" || echo "FAIL: Missing sections"

# Assert: Output contains "PASS: All required sections present"
```

**Evidence to Capture:**
- [ ] Terminal output from file existence checks
- [ ] Terminal output from sprint-status.yaml grep commands
- [ ] Terminal output from content validation checks

---

## Execution Strategy

### Sequential Execution (NO Parallelization)

由于 sprint-status.yaml 写入冲突，所有任务必须顺序执行：

```
Task 1: Create Story 3-1
  ↓
Task 2: Create Story 3-2
  ↓
Task 3: Create Story 3-3
  ↓
Task 4: Create Story 3-4
  ↓
Task 5: Create Story 4-1
  ↓
Task 6: Create Story 4-2
  ↓
Task 7: Create Story 5-1
  ↓
Task 8: Create Story 5-2
  ↓
Task 9: Create Story 6-1
  ↓
Task 10: Create Story 6-2
  ↓
Task 11: Create Story 6-3
  ↓
Task 12: Final Verification

Critical Path: Task 1 → Task 2 → ... → Task 12
Parallel Speedup: N/A (sequential only)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 (3-1) | None | 2 | None (sequential) |
| 2 (3-2) | 1 | 3 | None (sequential) |
| 3 (3-3) | 2 | 4 | None (sequential) |
| 4 (3-4) | 3 | 5 | None (sequential) |
| 5 (4-1) | 4 | 6 | None (sequential) |
| 6 (4-2) | 5 | 7 | None (sequential) |
| 7 (5-1) | 6 | 8 | None (sequential) |
| 8 (5-2) | 7 | 9 | None (sequential) |
| 9 (6-1) | 8 | 10 | None (sequential) |
| 10 (6-2) | 9 | 11 | None (sequential) |
| 11 (6-3) | 10 | 12 | None (sequential) |
| 12 (Verify) | 11 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| Sequential | 1-11 | unspecified-high (high-quality document generation) |
| Final | 12 | quick (simple verification) |

---

## TODOs

> Implementation + Verification = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info.

- [ ] 1. Create Story 3-1: 窗口卡片组件（WindowCard）

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动从 sprint-status.yaml 发现下一个 backlog 故事（3-1）
  - 工作流自动生成故事文件到 `_bmad-output/implementation-artifacts/3-1-window-card-component.md`
  - 工作流自动更新 sprint-status.yaml 中 3-1 的状态为 "ready-for-dev"
  - 工作流自动更新 epic-3 的状态为 "in-progress"（首个故事触发）

  **Must NOT do**:
  - 不手动编辑 sprint-status.yaml
  - 不跳过工作流步骤
  - 不修改已有的故事文件

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要深度分析多个文档（epics.md, architecture.md, ux-design-specification.md）并生成高质量的故事文件
  - **Skills**: 无需特殊技能
    - Reason: 工作流已内置所有必要的文档分析和生成逻辑

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential only
  - **Blocks**: Task 2 (3-2)
  - **Blocked By**: None (first task)

  **References** (CRITICAL - Be Exhaustive):

  **Workflow References**:
  - `_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml` - 工作流配置文件
  - `_bmad/bmm/workflows/4-implementation/create-story/instructions.xml` - 工作流执行指令
  - `_bmad/core/tasks/workflow.xml` - 工作流执行引擎

  **Data References**:
  - `_bmad-output/implementation-artifacts/sprint-status.yaml` - 故事状态跟踪文件
  - `_bmad-output/planning-artifacts/epics.md` - Epic 3 Story 3-1 的详细需求
  - `_bmad-output/planning-artifacts/architecture.md` - 架构约束和技术要求
  - `_bmad-output/planning-artifacts/ux-design-specification.md` - UX 设计规范

  **Pattern References** (existing story files to follow):
  - `_bmad-output/implementation-artifacts/2-4-close-and-delete-window.md` - 故事文件结构模板

  **Acceptance Criteria**:

  **Automated Verification**:
  ```bash
  # Agent runs:
  test -f "_bmad-output/implementation-artifacts/3-1-window-card-component.md" && echo "PASS: File exists" || echo "FAIL: File not found"
  
  grep "3-1-window-card-component: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  # Assert: Exit code 0
  
  grep "epic-3: in-progress" _bmad-output/implementation-artifacts/sprint-status.yaml
  # Assert: Exit code 0
  
  grep -q "## Story" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
  grep -q "## Acceptance Criteria" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
  grep -q "## Tasks / Subtasks" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
  grep -q "## Dev Notes" _bmad-output/implementation-artifacts/3-1-window-card-component.md && \
  echo "PASS: All sections present" || echo "FAIL: Missing sections"
  ```

  **Evidence to Capture**:
  - [ ] Terminal output from file existence check
  - [ ] Terminal output from sprint-status.yaml verification
  - [ ] Terminal output from content validation

  **Commit**: NO (grouped with all 11 stories)

---

- [ ] 2. Create Story 3-2: 响应式卡片网格布局（CardGrid）

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（3-2）
  - 工作流自动生成故事文件
  - 工作流自动更新 sprint-status.yaml

  **Must NOT do**:
  - 不手动编辑 sprint-status.yaml
  - 不跳过工作流步骤

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential only
  - **Blocks**: Task 3 (3-3)
  - **Blocked By**: Task 1 (3-1)

  **References**:
  - Same as Task 1

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/3-2-responsive-card-grid-layout.md" && echo "PASS" || echo "FAIL"
  grep "3-2-responsive-card-grid-layout: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 3. Create Story 3-3: 状态统计栏（StatusBar）

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（3-3）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4 (3-4)
  - **Blocked By**: Task 2 (3-2)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/3-3-status-bar.md" && echo "PASS" || echo "FAIL"
  grep "3-3-status-bar: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 4. Create Story 3-4: 空状态与新建窗口入口

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（3-4）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 5 (4-1)
  - **Blocked By**: Task 3 (3-3)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/3-4-empty-state-and-new-window-entry.md" && echo "PASS" || echo "FAIL"
  grep "3-4-empty-state-and-new-window-entry: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 5. Create Story 4-1: 状态检测服务（StatusDetector）

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（4-1）
  - 工作流自动更新 epic-4 的状态为 "in-progress"（首个故事触发）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 6 (4-2)
  - **Blocked By**: Task 4 (3-4)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/4-1-status-detector-service.md" && echo "PASS" || echo "FAIL"
  grep "4-1-status-detector-service: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  grep "epic-4: in-progress" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 6. Create Story 4-2: 实时状态更新机制

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（4-2）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 7 (5-1)
  - **Blocked By**: Task 5 (4-1)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/4-2-real-time-status-update-mechanism.md" && echo "PASS" || echo "FAIL"
  grep "4-2-real-time-status-update-mechanism: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 7. Create Story 5-1: 终端视图（TerminalView）

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（5-1）
  - 工作流自动更新 epic-5 的状态为 "in-progress"（首个故事触发）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 8 (5-2)
  - **Blocked By**: Task 6 (4-2)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/5-1-terminal-view.md" && echo "PASS" || echo "FAIL"
  grep "5-1-terminal-view: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  grep "epic-5: in-progress" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 8. Create Story 5-2: 点击切换交互

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（5-2）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 9 (6-1)
  - **Blocked By**: Task 7 (5-1)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/5-2-click-to-switch-interaction.md" && echo "PASS" || echo "FAIL"
  grep "5-2-click-to-switch-interaction: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 9. Create Story 6-1: 工作区管理服务（WorkspaceManager）

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（6-1）
  - 工作流自动更新 epic-6 的状态为 "in-progress"（首个故事触发）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 10 (6-2)
  - **Blocked By**: Task 8 (5-2)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/6-1-workspace-manager-service.md" && echo "PASS" || echo "FAIL"
  grep "6-1-workspace-manager-service: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  grep "epic-6: in-progress" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 10. Create Story 6-2: 自动保存工作区

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（6-2）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 11 (6-3)
  - **Blocked By**: Task 9 (6-1)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/6-2-auto-save-workspace.md" && echo "PASS" || echo "FAIL"
  grep "6-2-auto-save-workspace: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 11. Create Story 6-3: 启动时恢复工作区

  **What to do**:
  - 调用 create-story 工作流，启用 YOLO 模式
  - 工作流自动发现下一个 backlog 故事（6-3）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 12 (Final Verification)
  - **Blocked By**: Task 10 (6-2)

  **Acceptance Criteria**:
  ```bash
  test -f "_bmad-output/implementation-artifacts/6-3-restore-workspace-on-startup.md" && echo "PASS" || echo "FAIL"
  grep "6-3-restore-workspace-on-startup: ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
  ```

  **Commit**: NO

---

- [ ] 12. Final Verification: 验证所有故事文件已创建并正确更新

  **What to do**:
  - 验证所有 11 个故事文件存在
  - 验证 sprint-status.yaml 中所有故事状态为 "ready-for-dev"
  - 验证 Epic 3, 4, 5, 6 的状态为 "in-progress"
  - 生成验证报告

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的文件存在性检查和 grep 验证
  - **Skills**: 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None (final task)
  - **Blocked By**: Task 11 (6-3)

  **Acceptance Criteria**:
  ```bash
  # Verify all 11 story files exist
  for story in 3-1-window-card-component 3-2-responsive-card-grid-layout 3-3-status-bar 3-4-empty-state-and-new-window-entry 4-1-status-detector-service 4-2-real-time-status-update-mechanism 5-1-terminal-view 5-2-click-to-switch-interaction 6-1-workspace-manager-service 6-2-auto-save-workspace 6-3-restore-workspace-on-startup; do
    test -f "_bmad-output/implementation-artifacts/${story}.md" || echo "FAIL: ${story}.md not found"
  done
  
  # Verify all story statuses in sprint-status.yaml
  grep -E "(3-1-window-card-component|3-2-responsive-card-grid-layout|3-3-status-bar|3-4-empty-state-and-new-window-entry|4-1-status-detector-service|4-2-real-time-status-update-mechanism|5-1-terminal-view|5-2-click-to-switch-interaction|6-1-workspace-manager-service|6-2-auto-save-workspace|6-3-restore-workspace-on-startup): ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml | wc -l
  # Assert: Output is 11
  
  # Verify epic statuses
  grep -E "(epic-3|epic-4|epic-5|epic-6): in-progress" _bmad-output/implementation-artifacts/sprint-status.yaml | wc -l
  # Assert: Output is 4
  ```

  **Evidence to Capture**:
  - [ ] Terminal output from file existence checks
  - [ ] Terminal output from sprint-status.yaml verification
  - [ ] Verification report summary

  **Commit**: YES
  - Message: `feat(stories): create 11 story files for Epic 3-6`
  - Files: `_bmad-output/implementation-artifacts/*.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`
  - Pre-commit: None (documentation files)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 12 | `feat(stories): create 11 story files for Epic 3-6` | `_bmad-output/implementation-artifacts/*.md`, `sprint-status.yaml` | grep verification |

---

## Success Criteria

### Verification Commands
```bash
# All 11 story files exist
ls -1 _bmad-output/implementation-artifacts/{3-1,3-2,3-3,3-4,4-1,4-2,5-1,5-2,6-1,6-2,6-3}-*.md | wc -l
# Expected: 11

# All story statuses updated
grep -c "ready-for-dev" _bmad-output/implementation-artifacts/sprint-status.yaml
# Expected: >= 19 (8 existing + 11 new)

# All epic statuses updated
grep -E "(epic-3|epic-4|epic-5|epic-6): in-progress" _bmad-output/implementation-artifacts/sprint-status.yaml | wc -l
# Expected: 4
```

### Final Checklist
- [ ] All 11 story files created with complete 7-section structure
- [ ] All story statuses updated to "ready-for-dev" in sprint-status.yaml
- [ ] Epic 3, 4, 5, 6 statuses updated to "in-progress"
- [ ] No existing story files modified (Epic 1-2 untouched)
- [ ] All story files follow bilingual pattern (Chinese + English)
- [ ] All story files include comprehensive Dev Notes and References
