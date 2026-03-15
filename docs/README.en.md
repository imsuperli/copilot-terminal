# Copilot-Terminal

[Home](../README.md) | [简体中文](README.zh-CN.md)

## Overview

`Copilot-Terminal` is a desktop terminal workspace manager built with Electron, React, TypeScript, and xterm.js.

Instead of treating terminals as isolated windows or endless tabs, it focuses on organizing multiple project terminals in one place:

- Review all active terminals in a unified card-based home view
- Switch into an immersive terminal mode when you want to focus on a single workspace
- Improve multi-project workflows with pane splitting, quick switching, project links, and quick navigation
- Reduce repeated setup work with automatic workspace saving and restore

If you often work across multiple repositories, multiple AI coding sessions, or multiple local development environments, this project is designed for that kind of workflow.

## Features

### 1. Unified Home View and Terminal View

- **Unified home view** for browsing, filtering, and managing all terminal windows as cards
- **Terminal view** for focused work inside one window, with sidebar access, pane splitting, and quick switching
- **Archived view** so archived windows are hidden from the main flow without being lost

### 2. Multi-Window and Multi-Pane Management

- Create multiple terminal windows, each representing a project or task context
- Split panes horizontally or vertically
- Use a shared layout model for both single-pane and multi-pane states
- Close individual panes and let the layout rebalance automatically

### 3. Fast Switching and Keyboard-Driven Workflow

- `Ctrl+Tab` opens a quick switcher with fuzzy search by window name or path
- `Ctrl+B` toggles the sidebar
- `Ctrl+1~9` jumps to the Nth active window
- `Escape` closes open panels, or passes through to the terminal when nothing is open

### 4. Project Context and Status Information

- Show window status in both cards and terminal view
- Display the current Git branch
- Surface key context such as working directory and recent activity
- Show Claude StatusLine-related model, context, and cost information

### 5. Project Links via `copilot.json`

Place a `copilot.json` file in your project root and the app will load project-specific links into the window card and terminal toolbar.

Typical targets include:

- Source repository
- CI / CD pipeline
- Online documentation
- Monitoring dashboards
- Log search pages
- Any other internal team tools

### 6. Quick Navigation Panel

- Maintain a list of frequently used URLs and local folders
- Open the panel by double-pressing `Shift`
- Add, edit, and remove entries from settings
- Useful for dashboards, docs, local workspaces, and shared folders

### 7. IDE Integration

- Scan for and configure common IDEs
- Open a project directly from a window card or terminal view
- The current codebase includes scanning presets for VS Code, IntelliJ IDEA, PyCharm, WebStorm, Android Studio, and Sublime Text

### 8. tmux Compatibility (Claude Code Agent Teams)

- Built-in fake tmux layer — no real tmux installation required
- Supports Claude Code Agent Teams multi-agent split-pane workflow
- Intercepts `tmux` commands and forwards them to the main process via Named Pipe / Unix Socket RPC
- Handles core subcommands: `split-window`, `send-keys`, `select-pane`, `list-panes`, and more
- Automatically injects `TMUX`, `TMUX_PANE`, and related environment variables into each pane for compatibility

### 9. Workspace Save and Restore

- Automatically save window state and layout state
- Restore the previous workspace on startup
- Includes backup and crash-recovery logic
- Restored panes are loaded in a paused state so the app does not automatically start every terminal process on launch

## Installation

### Option 1: Install from GitHub Releases (Recommended)

If this repository provides packaged builds, the easiest way to get started is from the release page:

- Windows: installer or portable build
- macOS: `.dmg` installer

This is the recommended path for regular users because it avoids the local build chain and custom `xterm.js` dependency setup.

> **macOS users**: If you see "cannot verify the developer" when opening the app, right-click the installer, select "Open", then confirm in the dialog.

### Option 2: Run from Source

This is recommended if you want to develop, debug, or customize the project.

#### Requirements

- Node.js 20 or newer is recommended
- npm
- System dependencies required by Electron on your platform
- A locally prepared custom `xterm.js` package that matches this repository's expected file paths

#### Important prerequisite: custom `xterm.js` dependency

This project currently **does not use the official published `xterm.js` package directly**. Instead, it relies on local `.tgz` packages referenced from outside this repository.

Read this first:

- [xterm.js custom package constraint](xterm-custom-package-constraint.md)

The current expected dependency paths are:

```text
../xterm.js-master/xterm-xterm-6.0.0-custom.tgz
../xterm.js-master/addons/addon-fit/xterm-addon-fit-0.11.0-custom.tgz
```

A recommended directory layout looks like this:

```text
pc_program/
├─ copilot-terminal/
└─ xterm.js-master/
   ├─ xterm-xterm-6.0.0-custom.tgz
   └─ addons/
      └─ addon-fit/
         └─ xterm-addon-fit-0.11.0-custom.tgz
```

#### Install dependencies

```bash
npm install
```

#### Start development mode

```bash
npm run dev
```

This starts:

- the Vite renderer dev server
- the TypeScript watcher for the main process
- the Electron app

#### Build

```bash
npm run build
```

#### Build unpacked app output

```bash
npm run pack
```

#### Build installer packages

```bash
npm run dist
```

## Usage

### 1. Create a Terminal Window

When creating a window from the home view, you can provide:

- an optional window name
- a required working directory
- an optional startup command / shell

If you do not specify a command, the app selects a system default shell:

- Windows: prefer `pwsh.exe`, then `powershell.exe`, then fall back to `cmd.exe`
- macOS: `zsh`
- Linux: `bash`

### 2. Batch Create Windows

You can choose a parent folder and scan its first-level child directories, then create multiple windows in one step.

This is useful for:

- multiple microservice repositories under one folder
- a workspace containing several independent projects
- restoring a fixed set of development directories quickly

### 3. Enter Terminal View

After opening a window from the home view, you can:

- work in a focused terminal interface
- see Git branch and project links
- switch windows from the sidebar
- jump between active windows with the quick switcher

### 4. Split Panes

Terminal view supports:

- horizontal pane split
- vertical pane split
- activating a specific pane
- closing a pane, while keeping the last pane protected from being closed

New panes inherit the current pane's working directory and command, making it easier to continue work in the same project context.

### 5. Quick Window Switching

Press `Ctrl+Tab` to open the quick switcher.

It supports:

- searching by window name
- searching by path
- keyboard navigation and Enter-to-switch behavior

### 6. Quick Navigation

Double-press `Shift` to open the quick navigation panel.

In settings, you can manage two types of entries:

- URLs, which open in the default browser
- local folders, which open in the system file manager

### 7. Project Links Configuration

If you want a project window to include links such as repository, docs, and pipeline entries, create a `copilot.json` file in the project root:

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

Notes:

- `name` must be globally unique within the file
- `url` must start with `http://` or `https://`
- Keeping the number of links small is recommended for a cleaner UI

See also:

- [Project links configuration](project-config.md)

### 8. Settings

The current settings surface mainly includes:

- IDE scanning and enable/disable controls
- quick navigation management
- Claude StatusLine configuration

When Claude StatusLine is enabled, the app cooperates with `~/.claude/settings.json` to show status information in the CLI and/or window cards.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Tab` | Open the quick switcher |
| `Ctrl+B` | Toggle the sidebar |
| `Ctrl+1~9` | Switch to the Nth window |
| `Escape` | Close the current panel or pass through to the terminal |
| `Ctrl+C` | Copy selected text, or send interrupt if nothing is selected |
| `Ctrl+V` | Paste clipboard content |
| `Ctrl+Enter` | Insert a newline |
| `Shift+Enter` | Insert a newline |
| double `Shift` | Open the quick navigation panel |

Related documentation:

- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Quick navigation](quick-nav-feature.md)

## Data and Configuration Locations

The app stores its data in Electron's `userData` directory.

The current workspace is saved to:

- Windows: `%APPDATA%/copilot-terminal/workspace.json`
- macOS: `~/Library/Application Support/copilot-terminal/workspace.json`
- Linux: `workspace.json` under Electron's platform-specific `userData` directory

Notes:

- window lists, layout state, and app settings are all stored in `workspace.json`
- enabling Claude StatusLine also reads and writes `~/.claude/settings.json`

## Known Limitations

### 1. The custom `xterm.js` dependency is a hard requirement

Source installation currently depends on prebuilt custom `xterm.js` `.tgz` files, so this is not a plug-and-play npm-only setup yet.

### 2. The project is currently more validated on Windows

The codebase contains macOS and Linux shell fallback logic, and the Electron builder configuration includes cross-platform targets. However, some current implementation details, especially IDE scanning paths, are clearly more Windows-oriented.

If you plan to publish this broadly, it would be worth improving:

- installation validation on macOS and Linux
- platform-specific IDE scanning strategies
- clearer compatibility notes for each platform

### 3. Some internal docs still read like implementation notes

The repository already contains useful documentation, but parts of it still reflect internal development notes and can be further polished over time.

## Open-Source Publishing Checklist

If you are preparing this project for a public GitHub release, it would also be useful to add:

- repository description and Topics
- a `LICENSE` file matching the declared `MIT` license in `package.json`
- packaged release artifacts
- Issue and PR templates
- screenshots or demo GIFs
- a roadmap or TODO list

## Related Docs

- [Chinese documentation](README.zh-CN.md)
- [Project links configuration](project-config.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Quick navigation](quick-nav-feature.md)
- [Pane architecture](pane-architecture.md)
- [xterm.js custom package constraint](xterm-custom-package-constraint.md)

## License

MIT
