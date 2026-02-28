# Story 1.4: 应用主窗口与基础布局

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户,
I want 打开应用后看到基础界面布局,
So that 可以开始使用应用的核心功能。

## Acceptance Criteria

**Given** UI 设计系统基础已建立（Story 1.3）
**When** 启动应用
**Then** 显示应用主窗口，包含顶部工具栏和主内容区
**And** 工具栏显示应用名称和版本号
**And** 主内容区显示空状态提示（"创建你的第一个任务窗口"）
**And** 界面使用深色主题，符合 UX 设计规范
**And** 窗口最小尺寸为 480x360px
**And** 窗口可以调整大小，布局自适应

## Tasks / Subtasks

- [ ] 配置 Electron 主窗口基础设置 (AC: 1, 5, 6)
  - [ ] 在 src/main/index.ts 中配置 BrowserWindow 选项
  - [ ] 设置窗口最小尺寸为 480x360px
  - [ ] 设置窗口默认尺寸为 1024x768px
  - [ ] 启用窗口大小调整（resizable: true）
  - [ ] 配置窗口标题为 "ausome-terminal"
  - [ ] 配置深色主题（backgroundColor: '#0a0a0a'）

- [ ] 创建应用主布局组件 (AC: 1, 2, 3, 4)
  - [ ] 创建 src/renderer/components/layout/MainLayout.tsx
  - [ ] 实现顶部工具栏区域（固定高度 56px）
  - [ ] 实现主内容区域（占满剩余空间）
  - [ ] 使用 Flexbox 实现垂直布局
  - [ ] 应用深色主题背景色

- [ ] 创建工具栏组件 (AC: 2)
  - [ ] 创建 src/renderer/components/layout/Toolbar.tsx
  - [ ] 显示应用名称 "ausome-terminal"
  - [ ] 从 package.json 读取并显示版本号
  - [ ] 使用设计令牌中的文字色和背景色
  - [ ] 实现响应式布局（窄窗口时简化显示）

- [ ] 创建空状态组件 (AC: 3, 4)
  - [ ] 创建 src/renderer/components/EmptyState.tsx
  - [ ] 居中显示引导文案："创建你的第一个任务窗口"
  - [ ] 添加大号 "+ 新建窗口" 按钮（使用 Story 1.3 的 Button 组件）
  - [ ] 使用设计令牌中的文字色
  - [ ] 保持简洁，不使用插图或吉祥物

- [ ] 更新 App.tsx 集成主布局 (AC: 1, 2, 3, 4)
  - [ ] 导入 MainLayout 组件
  - [ ] 导入 Toolbar 组件
  - [ ] 导入 EmptyState 组件
  - [ ] 组装完整的应用界面结构
  - [ ] 移除 Story 1.3 的设计系统展示代码

- [ ] 实现响应式布局 (AC: 6)
  - [ ] 测试窗口最小尺寸 480x360px 下的布局
  - [ ] 测试窗口调整大小时的布局自适应
  - [ ] 确保工具栏在窄窗口下正常显示
  - [ ] 确保空状态在不同窗口尺寸下居中显示

- [ ] 验证深色主题和设计规范 (AC: 4)
  - [ ] 验证应用背景色为 #0a0a0a
  - [ ] 验证文字色为 #e5e5e5（低饱和度暖灰）
  - [ ] 验证工具栏和主内容区使用正确的设计令牌
  - [ ] 验证整体视觉符合 UX 设计规范（简洁、克制、留白充足）

## Dev Notes

### 架构约束与技术要求

**Electron 窗口配置（架构文档）:**
- 使用 Electron BrowserWindow API 配置主窗口
- 窗口最小尺寸：480x360px（UX 文档要求）
- 窗口默认尺寸：1024x768px（标准桌面窗口）
- 启用窗口大小调整（resizable: true）
- 深色主题背景色：#0a0a0a（UX 文档设计令牌）
- 窗口标题：ausome-terminal

**布局架构（UX 文档）:**
- 整体布局结构：顶部工具栏 + 主内容区
- 工具栏固定高度：56px
- 主内容区：占满剩余空间，使用 Flexbox 垂直布局
- 响应式适配：支持窗口最小尺寸 480x360px

**工具栏设计（UX 文档）:**
- 显示应用名称 "ausome-terminal"
- 显示版本号（从 package.json 读取）
- 使用设计令牌中的文字色和背景色
- 响应式：窄窗口（< 640px）时简化显示

**空状态设计（UX 文档）:**
- 居中显示引导文案："创建你的第一个任务窗口"
- 大号 "+ 新建窗口" 按钮（Primary 样式）
- 简洁设计，不使用插图或吉祥物
- 背景保持应用标准深色，不做特殊处理

**设计令牌使用（Story 1.3）:**
- 背景色：var(--bg-app) 或 bg-bg-app（Tailwind）
- 文字色：var(--text-primary) 或 text-text-primary（Tailwind）
- 次要文字色：var(--text-secondary) 或 text-text-secondary（Tailwind）
- 间距：var(--spacing-unit) = 8px
- 工具栏高度：56px（7 个基础单位）

### 关键实现细节

**Electron 主窗口配置 (src/main/index.ts):**
```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: '#0a0a0a',
    title: 'ausome-terminal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发环境加载 Vite 开发服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

**主布局组件 (src/renderer/components/layout/MainLayout.tsx):**
```typescript
import React from 'react';

interface MainLayoutProps {
  toolbar: React.ReactNode;
  children: React.ReactNode;
}

export function MainLayout({ toolbar, children }: MainLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-bg-app">
      {/* 工具栏区域 - 固定高度 */}
      <div className="flex-shrink-0">
        {toolbar}
      </div>

      {/* 主内容区 - 占满剩余空间 */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

**工具栏组件 (src/renderer/components/layout/Toolbar.tsx):**
```typescript
import React from 'react';

interface ToolbarProps {
  appName?: string;
  version?: string;
}

export function Toolbar({
  appName = 'ausome-terminal',
  version = '0.1.0'
}: ToolbarProps) {
  return (
    <header className="h-14 px-6 flex items-center justify-between bg-bg-card border-b border-border-subtle">
      {/* 左侧：应用名称和版本 */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-text-primary">
          {appName}
        </h1>
        <span className="text-sm text-text-secondary">
          v{version}
        </span>
      </div>

      {/* 右侧：预留给后续功能（状态统计、新建按钮等） */}
      <div className="flex items-center gap-3">
        {/* 后续 Story 会添加内容 */}
      </div>
    </header>
  );
}
```

**空状态组件 (src/renderer/components/EmptyState.tsx):**
```typescript
import React from 'react';
import { Button } from './ui/Button';

interface EmptyStateProps {
  onCreateWindow?: () => void;
}

export function EmptyState({ onCreateWindow }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      {/* 引导文案 */}
      <p className="text-xl text-text-primary mb-6">
        创建你的第一个任务窗口
      </p>

      {/* 新建窗口按钮 */}
      <Button
        variant="primary"
        onClick={onCreateWindow}
        className="text-lg px-8 py-3"
      >
        + 新建窗口
      </Button>
    </div>
  );
}
```

**更新 App.tsx:**
```typescript
import React from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Toolbar } from './components/layout/Toolbar';
import { EmptyState } from './components/EmptyState';

function App() {
  const handleCreateWindow = () => {
    // 后续 Story 2.2 会实现新建窗口对话框
    console.log('创建新窗口');
  };

  return (
    <MainLayout
      toolbar={<Toolbar appName="ausome-terminal" version="0.1.0" />}
    >
      <EmptyState onCreateWindow={handleCreateWindow} />
    </MainLayout>
  );
}

export default App;
```

**读取 package.json 版本号（可选优化）:**
```typescript
// src/renderer/utils/version.ts
export function getAppVersion(): string {
  // 在构建时通过 Vite 注入版本号
  return import.meta.env.VITE_APP_VERSION || '0.1.0';
}

// 在 vite.config.ts 中配置
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
});
```

### 常见陷阱与注意事项

**🚨 Electron 窗口配置陷阱:**
- ❌ 不要忘记设置 minWidth 和 minHeight，否则用户可以将窗口缩小到不可用
- ✅ 必须设置 480x360px 最小尺寸（UX 文档要求）
- ❌ 不要使用纯黑背景 #000000
- ✅ 使用 #0a0a0a（带微暖色调的深色）
- ❌ 不要在生产环境打开 DevTools
- ✅ 仅在开发环境（NODE_ENV === 'development'）打开 DevTools

**🚨 布局实现陷阱:**
- ❌ 不要使用固定高度的主内容区，会导致窗口调整大小时布局错乱
- ✅ 使用 Flexbox 的 flex-1 让主内容区占满剩余空间
- ❌ 不要忘记设置 h-screen 让布局占满整个视口
- ✅ 在最外层容器使用 h-screen 确保全屏布局
- ❌ 不要使用 overflow: hidden，会导致内容被裁剪
- ✅ 主内容区使用 overflow-auto 支持滚动

**🚨 工具栏实现陷阱:**
- ❌ 不要使用绝对定位，会导致响应式布局问题
- ✅ 使用 Flexbox 实现工具栏布局
- ❌ 不要硬编码版本号
- ✅ 从 package.json 或环境变量读取版本号
- ❌ 不要在工具栏中堆砌过多元素
- ✅ 保持简洁，后续 Story 会逐步添加功能

**🚨 空状态实现陷阱:**
- ❌ 不要使用复杂的插图或动画
- ✅ 保持简洁，只有文案和按钮
- ❌ 不要使用特殊的背景色或边框
- ✅ 背景保持应用标准深色
- ❌ 不要让按钮点击后无响应
- ✅ 添加 onClick 处理函数（即使暂时只是 console.log）

**🚨 响应式布局陷阱:**
- 窗口最小尺寸 480x360px 时，工具栏可能需要简化显示
- 测试不同窗口尺寸下的布局表现
- 确保空状态在所有尺寸下都居中显示
- 使用 Tailwind 的响应式类名（如 sm:, md:）处理不同尺寸

### 从 Story 1.3 学到的经验

**Story 1.3 已完成的基础:**
- ✅ Tailwind CSS 已配置并正常工作
- ✅ 深色主题设计令牌已定义（CSS 变量和 Tailwind 配置）
- ✅ Radix UI 基础组件已集成（Button, Dialog, Tooltip）
- ✅ 设计系统组件示例已验证

**本 Story 的衔接点:**
- 使用 Story 1.3 创建的 Button 组件
- 使用 Story 1.3 定义的设计令牌（背景色、文字色、间距）
- 移除 Story 1.3 的设计系统展示代码，替换为实际应用界面
- 保持与 Story 1.3 相同的视觉风格和设计语言

**需要注意的兼容性:**
- 不要破坏 Story 1.3 创建的 UI 组件
- 确保新组件使用相同的设计令牌
- 保持与 Tailwind CSS 配置的兼容性
- 确保热重载在添加新组件后仍然正常工作

**项目结构演进:**
```
src/
├── main/
│   └── index.ts              # 修改：配置主窗口
├── renderer/
│   ├── components/
│   │   ├── layout/           # 新增：布局组件
│   │   │   ├── MainLayout.tsx
│   │   │   └── Toolbar.tsx
│   │   ├── ui/               # Story 1.3 已创建
│   │   │   ├── Button.tsx
│   │   │   ├── Dialog.tsx
│   │   │   └── Tooltip.tsx
│   │   └── EmptyState.tsx    # 新增：空状态组件
│   ├── styles/               # Story 1.3 已创建
│   │   └── tokens.css
│   ├── utils/                # 新增：工具函数
│   │   └── version.ts
│   ├── index.html
│   ├── index.tsx
│   ├── index.css
│   └── App.tsx               # 修改：集成主布局
```

### 测试验证清单

**基础功能验证:**
- [ ] 执行 `npm run dev` 启动应用
- [ ] 应用窗口正常打开，显示主界面
- [ ] 工具栏显示应用名称 "ausome-terminal"
- [ ] 工具栏显示版本号 "v0.1.0"
- [ ] 主内容区显示空状态提示
- [ ] 空状态显示 "+ 新建窗口" 按钮

**窗口尺寸验证:**
- [ ] 窗口默认尺寸为 1024x768px
- [ ] 窗口可以调整大小
- [ ] 窗口最小尺寸为 480x360px（无法缩小到更小）
- [ ] 窗口调整大小时布局自适应正常

**深色主题验证:**
- [ ] 应用背景色为 #0a0a0a（深色带微暖色调）
- [ ] 工具栏背景色为 #1a1a1a（卡片背景色）
- [ ] 文字色为 #e5e5e5（低饱和度暖灰）
- [ ] 版本号文字色为 #a3a3a3（次要文字色）
- [ ] 整体视觉符合 UX 设计规范（简洁、克制、留白充足）

**布局验证:**
- [ ] 工具栏固定在顶部，高度为 56px
- [ ] 主内容区占满剩余空间
- [ ] 空状态在主内容区居中显示
- [ ] 窗口滚动时工具栏保持固定
- [ ] 布局在不同窗口尺寸下正常显示

**响应式验证:**
- [ ] 窗口宽度 < 640px 时布局正常（单列）
- [ ] 窗口宽度 640px-1024px 时布局正常（标准）
- [ ] 窗口宽度 > 1024px 时布局正常（宽屏）
- [ ] 工具栏在窄窗口下正常显示（不换行、不溢出）
- [ ] 空状态在所有尺寸下居中显示

**交互验证:**
- [ ] 点击 "+ 新建窗口" 按钮有响应（console.log）
- [ ] 按钮悬停时有视觉反馈（背景色变化）
- [ ] 按钮支持键盘导航（Tab 聚焦，Enter/Space 激活）
- [ ] 焦点指示器清晰可见

**跨平台验证:**
- [ ] Windows 平台界面正常显示
- [ ] macOS 平台界面正常显示
- [ ] 两个平台的字体渲染一致
- [ ] 两个平台的颜色显示一致
- [ ] 两个平台的窗口行为一致

### 项目结构注意事项

**与统一项目结构的对齐:**
- 布局组件放在 `src/renderer/components/layout/` 目录
- 空状态组件放在 `src/renderer/components/` 根目录
- 工具函数放在 `src/renderer/utils/` 目录
- 主窗口配置在 `src/main/index.ts` 中

**文件命名规范:**
- 布局组件使用 PascalCase（如 `MainLayout.tsx`, `Toolbar.tsx`）
- 工具函数使用 camelCase（如 `version.ts`）
- 组件文件名与组件名一致

**代码组织建议:**
- 每个布局组件独立文件
- 组件接口使用 TypeScript 定义
- 组件样式使用 Tailwind 类名
- 避免在组件中硬编码尺寸和颜色

**为后续 Story 做准备:**
- MainLayout 组件将在所有后续 Story 中使用
- Toolbar 组件将在 Story 3.3 中添加状态统计栏
- EmptyState 组件将在 Story 2.2 中被窗口卡片网格替换
- 主窗口配置将在后续 Story 中保持不变

### References

- [Source: epics.md#Epic 1: 项目初始化与基础架构 - Story 1.4]
- [Source: architecture.md#系统架构设计 - 整体架构]
- [Source: ux-design-specification.md#Design Direction Decision - 方向 A: 网格卡片布局]
- [Source: ux-design-specification.md#Visual Design Foundation - Color System]
- [Source: ux-design-specification.md#Visual Design Foundation - Spacing & Layout]
- [Source: ux-design-specification.md#Empty States & Loading States]
- [Source: 1-3-ui-design-system-foundation.md - 前置依赖]

## Dev Agent Record

### Agent Model Used

_待开发时填写_

### Debug Log References

_待开发时填写_

### Completion Notes List

_待开发时填写_

### File List

_待开发时填写_
