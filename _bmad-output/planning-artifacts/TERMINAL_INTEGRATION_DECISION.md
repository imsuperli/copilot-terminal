# 终端集成方案决策

**决策日期：** 2026-02-28  
**决策者：** 立哥  
**状态：** ✅ 已确定

## 最终决策

**采用内嵌 PTY + xterm.js 方案**

## 核心理由

1. **可以实现精确的状态检测** — 这是产品的核心差异化能力（FR6, FR7）
2. **统一视图体验更流畅** — 所有操作在一个应用内完成，无需在多个窗口间切换
3. **VS Code Terminal 证明可行** — 数百万开发者每天使用，体验良好
4. **跨平台一致性更好** — node-pty 封装了平台差异

## 用户体验保证

✅ **保留的核心功能：**
- 划选复制（选中文本自动复制到剪贴板）
- 右键粘贴（右键点击粘贴剪贴板内容）
- 所有 pwsh7 命令和 AI CLI 工具完全可用
- ANSI 颜色、光标控制、Tab 补全等终端特性

⚠️ **与原生 Windows Terminal 的差异：**
- 字体渲染基于 Canvas/WebGL，接近但不完全等同于 DirectWrite
- 不支持 Windows Terminal 特有功能（Acrylic 背景、多标签页等）
- 复制粘贴快捷键可能需要适应（但可自定义）

## 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 终端进程管理 | node-pty | 1.x |
| 终端渲染 | xterm.js | 5.x |
| 桌面框架 | Electron | 28.x+ |
| 前端框架 | React + TypeScript | 18.x |

## 已更新的文档

✅ **PRD (prd.md)**
- 更新"包装层"措辞为"通过内嵌 PTY 终端提供统一任务管理界面"
- 明确技术定位：node-pty + xterm.js

✅ **架构 (architecture.md)**
- 更新终端集成决策说明
- 删除 WindowSwitcher 外部窗口切换逻辑，改为 ViewSwitcher 应用内视图切换
- 更新技术栈：移除 robotjs/node-window-manager，添加 xterm.js
- 清理所有 Rust/Tauri 残留引用

✅ **Epics (epics.md)**
- 删除 Story 5.1（WindowSwitcher 服务）
- 原 Story 5.2 改为 Story 5.1（TerminalView）
- 原 Story 5.3 改为 Story 5.2（点击切换交互）
- 在 Story 5.1 的 AC 中添加划选复制和右键粘贴功能

## 实现要点

### TerminalView 组件（Story 5.1）

```typescript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

// 1. 划选复制
terminal.onSelectionChange(() => {
  const selection = terminal.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection);
  }
});

// 2. 右键粘贴
terminal.element?.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const text = await navigator.clipboard.readText();
  terminal.paste(text);
});

// 3. 可选：Ctrl+Shift+C/V
terminal.attachCustomKeyEventHandler((event) => {
  if (event.ctrlKey && event.shiftKey) {
    if (event.key === 'C') {
      const selection = terminal.getSelection();
      if (selection) navigator.clipboard.writeText(selection);
      return false;
    }
    if (event.key === 'V') {
      navigator.clipboard.readText().then(text => terminal.paste(text));
      return false;
    }
  }
  return true;
});
```

### ViewSwitcher 服务

负责在应用内切换统一视图和终端视图，无需操作外部窗口。

## 下一步

项目现在 **✅ READY**，可以开始实现：

1. Epic 1: 项目初始化与基础架构
2. Epic 2: 终端进程管理（node-pty）
3. Epic 3: 统一视图与窗口展示
4. Epic 4: 智能状态追踪
5. Epic 5: 快速窗口切换（xterm.js + ViewSwitcher）
6. Epic 6: 工作区持久化

---

**参考文档：**
- 实现就绪度报告：`implementation-readiness-report-2026-02-28.md`
- PRD：`prd.md`
- 架构：`architecture.md`
- Epics：`epics.md`
