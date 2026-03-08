# Copilot-Terminal

[返回首页](../README.md) | [English](README.en.md)

## 简介

`Copilot-Terminal` 是一个面向开发场景的桌面终端窗口管理工具，基于 Electron、React、TypeScript 和 xterm.js 构建。

相比传统“一个窗口一个终端”或“标签页堆叠”的方式，它更强调对多个项目终端的统一管理：

- 在主页中以卡片形式总览所有终端窗口
- 在终端视图中获得更沉浸的操作体验
- 用窗格拆分、快捷切换、项目链接和快捷导航提升多项目开发效率
- 配合工作区自动保存与恢复机制，减少重复打开和重新整理环境的成本

如果你经常同时维护多个代码仓库、多个 AI 编码会话，或者希望把“终端 + 项目入口 + IDE 跳转”整合到一个桌面应用里，这个项目会比较适合你。

## 功能特性

### 1. 统一视图与终端视图

- **统一视图**：以卡片网格方式展示全部窗口，适合总览、筛选和切换
- **终端视图**：进入单个窗口后专注操作，支持侧边栏、窗格拆分和快速切换
- **归档视图**：已归档窗口不会丢失，可在需要时恢复查看

### 2. 多窗口与多窗格管理

- 支持创建多个终端窗口，每个窗口对应一个项目或任务上下文
- 支持横向、纵向拆分窗格
- 单窗格和多窗格使用统一布局结构，行为更一致
- 支持关闭单个窗格，并自动整理布局

### 3. 快速切换与键盘操作

- `Ctrl+Tab` 打开快速切换面板，支持模糊搜索窗口名称或路径
- `Ctrl+B` 展开 / 收起侧边栏
- `Ctrl+1~9` 按顺序切换到指定窗口
- `Escape` 智能关闭面板；若没有面板打开，则继续传递给终端

### 4. 项目状态与上下文信息

- 卡片和终端视图中可展示窗口状态
- 支持显示 Git 分支信息
- 支持在卡片中显示最近活跃时间、工作目录等关键信息
- 可展示 Claude StatusLine 模型信息、上下文占用和成本等内容

### 5. 项目链接配置（`copilot.json`）

在项目根目录放置 `copilot.json` 后，应用会自动读取项目链接并显示在窗口卡片或终端工具栏中。

适合放置以下入口：

- 代码仓库
- CI / CD 流水线
- 在线文档
- 监控面板
- 日志查询
- 其他团队内部工具入口

### 6. 快捷导航面板

- 支持维护一组常用 URL 或本地文件夹
- 双击 `Shift` 即可快速唤出面板
- 可在设置中新增、编辑、删除快捷导航项
- 适合放常用网站、本地工作目录或文档目录

### 7. IDE 集成

- 支持扫描和配置常见 IDE
- 可以从窗口卡片或终端视图中直接“在 IDE 中打开项目”
- 当前代码中内置了 VS Code、IntelliJ IDEA、PyCharm、WebStorm、Android Studio、Sublime Text 等常见 IDE 的扫描配置

### 8. 工作区保存与恢复

- 自动保存窗口与布局状态
- 启动时恢复历史工作区
- 包含崩溃恢复与备份策略
- 恢复后的窗格默认以暂停状态加载，避免启动应用时自动拉起全部终端进程

## 技术栈

- Electron
- React 18
- TypeScript
- Vite
- xterm.js
- Zustand
- Tailwind CSS
- Radix UI

## 安装

### 方式一：通过 GitHub Releases 安装（推荐）

如果仓库已经发布了安装包，优先使用 Release 页面中的构建产物：

- Windows：安装包或便携版
- macOS：应用包
- Linux：对应发行版可用的包或压缩包

这种方式不需要关心前端构建链路和自定义 `xterm.js` 依赖，适合普通使用者。

### 方式二：从源码运行

适合准备参与开发、调试或二次定制的使用者。

#### 环境要求

- Node.js 20 或更高版本（推荐）
- npm
- 支持 Electron 开发环境的系统依赖
- 一份已经按项目约定打包好的自定义 `xterm.js` 本地包

#### 先决条件：准备自定义 `xterm.js` 依赖

本项目当前**不能直接使用官方发布版的 `xterm.js` 包**，而是固定依赖仓库外部的本地 tgz 包。

请先阅读：`docs/xterm-custom-package-constraint.md`

当前约定的依赖路径为：

```text
../xterm.js-master/xterm-xterm-6.0.0-custom.tgz
../xterm.js-master/addons/addon-fit/xterm-addon-fit-0.11.0-custom.tgz
```

也就是说，推荐目录结构如下：

```text
pc_program/
├─ ausome-terminal/
└─ xterm.js-master/
   ├─ xterm-xterm-6.0.0-custom.tgz
   └─ addons/
      └─ addon-fit/
         └─ xterm-addon-fit-0.11.0-custom.tgz
```

#### 安装步骤

```bash
npm install
```

#### 启动开发环境

```bash
npm run dev
```

该命令会同时启动：

- Vite 渲染进程开发服务
- TypeScript 主进程编译监听
- Electron 应用

#### 构建

```bash
npm run build
```

#### 打包目录产物

```bash
npm run pack
```

#### 生成安装包

```bash
npm run dist
```

## 使用说明

### 1. 创建终端窗口

在主页中创建新窗口时，可以指定：

- 窗口名称（可选）
- 工作目录（必填）
- 启动命令 / Shell（可选）

如果不手动指定命令，应用会使用系统默认 Shell：

- Windows：优先 `pwsh.exe`，其次 `powershell.exe`，最后回退 `cmd.exe`
- macOS：`zsh`
- Linux：`bash`

### 2. 批量创建窗口

支持选择一个父目录，自动扫描其中的一级子目录，并批量创建多个窗口。

适合以下场景：

- 一个目录下维护多个微服务仓库
- 一个工作区下包含多个独立项目
- 需要一次性恢复一组固定开发目录

### 3. 进入终端视图

在主页卡片中进入某个窗口后，可以：

- 在沉浸式界面中使用终端
- 查看 Git 分支和项目链接
- 使用侧边栏在窗口之间切换
- 通过快速切换面板在多个活跃窗口之间跳转

### 4. 拆分窗格

终端视图支持：

- 横向拆分窗格
- 纵向拆分窗格
- 激活指定窗格
- 关闭某个窗格（最后一个窗格不会被关闭）

新建的拆分窗格会复用当前窗格的工作目录和命令，便于在同一项目上下文中并行操作。

### 5. 快速切换窗口

按下 `Ctrl+Tab` 可以打开快速切换面板：

- 支持按窗口名称搜索
- 支持按路径搜索
- 支持键盘上下选择和回车切换

### 6. 快捷导航

双击 `Shift` 可打开快捷导航面板。

在设置中可以维护导航项，支持两类目标：

- URL：在默认浏览器中打开
- 本地文件夹：在系统文件管理器中打开

### 7. 项目链接配置

如果希望为某个项目附带仓库、文档、流水线等入口，可以在该项目根目录创建 `copilot.json`：

```json
{
  "version": "1.0",
  "links": [
    {
      "name": "code",
      "url": "https://github.com/username/repo"
    },
    {
      "name": "docs",
      "url": "https://docs.example.com"
    },
    {
      "name": "pipeline",
      "url": "https://ci.example.com/project/123"
    }
  ]
}
```

说明：

- `name` 需要全局唯一
- `url` 必须以 `http://` 或 `https://` 开头
- 建议控制链接数量，避免界面过于拥挤

### 8. 设置项

当前项目内置的设置能力主要包括：

- IDE 扫描与启用
- 快捷导航维护
- Claude StatusLine 配置

启用 Claude StatusLine 后，应用会与 `~/.claude/settings.json` 协作，把状态栏信息同步到 CLI 或窗口卡片中。

## 常用快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl+Tab` | 打开快速切换面板 |
| `Ctrl+B` | 展开 / 收起侧边栏 |
| `Ctrl+1~9` | 切换到第 N 个窗口 |
| `Escape` | 关闭当前面板，或把按键传递给终端 |
| `Ctrl+C` | 复制选中文本；无选中时发送中断 |
| `Ctrl+V` | 粘贴剪贴板内容 |
| `Ctrl+Enter` | 插入换行符 |
| `Shift+Enter` | 插入换行符 |
| 双击 `Shift` | 打开快捷导航面板 |

更多说明可参考：`docs/keyboard-shortcuts.md`

## 数据与配置位置

应用数据使用 Electron `userData` 目录保存。

当前工作区会落盘到：

- Windows：`%APPDATA%/copilot-terminal/workspace.json`
- macOS：`~/Library/Application Support/copilot-terminal/workspace.json`
- Linux：对应系统的 Electron `userData` 目录下的 `workspace.json`

说明：

- 窗口列表、布局状态和应用设置都会保存在 `workspace.json` 中
- 启用 Claude StatusLine 时，还会读写 `~/.claude/settings.json`

## 已知限制

### 1. 自定义 `xterm.js` 依赖是强约束

目前源码安装依赖自定义打包的 `xterm.js` tgz 文件，不适合直接改成官方 npm 版本。

### 2. 当前更适合以 Windows 作为主要验证环境

虽然项目里包含 macOS / Linux 的 Shell 回退逻辑，也配置了 Electron 的跨平台打包目标，但当前部分实现（例如 IDE 扫描路径）明显更偏向 Windows 使用场景。

如果准备公开发布，建议后续继续补充：

- macOS / Linux 的安装验证
- 不同平台的 IDE 扫描策略
- 更明确的平台兼容说明

### 3. 部分内部文档仍待整理

仓库中已有不少功能说明文档，但部分文档仍偏向开发记录，后续可以继续清理和统一表述风格。

## 开源建议

如果你准备把这个项目正式发布到 GitHub，建议同时补齐以下内容：

- 仓库描述与 Topics
- `LICENSE` 文件（当前 `package.json` 中为 `MIT`）
- Release 安装包
- Issue / PR 模板
- 截图或演示 GIF
- Roadmap 或 TODO 列表

## License

MIT
