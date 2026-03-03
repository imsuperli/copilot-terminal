# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modern terminal window manager built with Electron, React, and TypeScript. Manages multiple terminal sessions with workspace persistence, window archiving, and real-time status monitoring.

## Development Commands

```bash
# Start development environment (runs Vite dev server, TypeScript compiler, and Electron concurrently)
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Architecture

### Process Communication Flow

1. **Main Process** (`src/main/index.ts`): Electron main process, manages native resources
   - `ProcessManager`: Spawns and manages node-pty terminal processes
   - `StatusPoller`: Polls terminal status every 500ms, broadcasts to renderer
   - `WorkspaceManager`: Persists/restores workspace state to JSON file
   - `AutoSaveManager`: Auto-saves workspace every 5 seconds
   - `ViewSwitcher`: Handles unified view ↔ terminal view transitions

2. **Preload** (`src/preload/index.ts`): Security bridge using `contextBridge`
   - Exposes controlled IPC API as `window.electronAPI`
   - All main ↔ renderer communication goes through this layer

3. **Renderer Process** (`src/renderer/`): React application
   - `windowStore` (Zustand): Single source of truth for window state, includes MRU list and sidebar state
   - `TerminalView`: xterm.js integration, handles PTY I/O, includes sidebar and quick switcher
   - `WindowCard`: Displays window status, controls (start/pause/archive/delete)
   - `Sidebar`: Collapsible window list in terminal view
   - `QuickSwitcher`: Ctrl+P search panel for quick window switching
   - `TabSwitcher`: Ctrl+Tab MRU-based window cycling

### Key Data Flow

- **Window Creation**: Renderer → IPC → Main spawns PTY → Returns window object → Renderer adds to store
- **PTY Output**: PTY data → Main caches & broadcasts via IPC → Renderer writes to xterm.js
- **Status Updates**: StatusPoller detects changes → IPC event → Renderer updates store
- **Auto-save**: Store changes → Triggers IPC event → Main saves to workspace.json

## Critical Design Decisions

### Window Startup Behavior

Windows restored from workspace start in **paused state** (status: `Paused`, no PTY process). User must click "启动" to spawn the PTY process. This prevents resource exhaustion on startup with many windows.

### Terminal View Component Lifecycle

`TerminalView` components remain **mounted** for all windows but use CSS `display: none` when inactive. This prevents xterm.js double-cursor bugs that occur with mount/unmount cycles. See `src/renderer/components/TerminalView.tsx`.

### Shell Selection Priority (Windows)

1. `pwsh.exe` (PowerShell 7+) - preferred
2. `powershell.exe` (PowerShell 5.1) - fallback
3. `cmd.exe` - final fallback

Rationale: PowerShell 7+ has better Unicode support and performance. If not available, use PowerShell 5.1 which is pre-installed on most Windows systems. See `getDefaultShell()` in `src/main/utils/shell.ts`.

### Status Detection

Uses **PTY output analysis** instead of `pidusage` to detect window status:
- `WaitingForInput`: No output for 500ms
- `Running`: Recent output detected
- `Exited`: PTY process terminated

This avoids memory leaks from pidusage's native bindings. See `src/main/services/StatusDetector.ts`.

### Window Flash Fix

Electron windows show white flash on startup despite `backgroundColor` setting. Solution:
1. Create window with `show: false`
2. Wait for renderer to send `renderer-ready` IPC event
3. Set window opacity to 0, then show and maximize
4. Fade in over 160ms using opacity animation

This ensures React components are fully rendered before window becomes visible. See `src/main/index.ts` lines 79-105 and memory file `docs/electron-window-flash-fix.md`.

### Window Switching System

Terminal view includes multiple ways to switch between windows:

1. **Sidebar** (left side, collapsible):
   - Default: collapsed (32px), shows status dots only
   - Expanded: shows window names and paths
   - Click to switch windows
   - Supports drag-to-resize (150-400px)
   - Shows archived windows in separate section

2. **Quick Switcher** (Ctrl+P):
   - Fuzzy search by window name or path
   - Keyboard navigation (↑↓ or Ctrl+N/P)
   - Highlights matching characters
   - Shows all windows including archived

3. **Tab Cycling** (Ctrl+Tab / Ctrl+Shift+Tab):
   - Cycles through windows in MRU (Most Recently Used) order
   - Hold Ctrl and press Tab repeatedly to cycle
   - Release Ctrl to switch to selected window
   - Shows horizontal preview of recent windows

4. **Keyboard Shortcuts**:
   - `Ctrl+B`: Toggle sidebar expand/collapse
   - `Ctrl+1~9`: Switch to Nth window in sidebar
   - `Ctrl+Enter` / `Shift+Enter`: Insert newline in terminal (for apps like Claude Code)

**MRU List**: Maintained in `windowStore.mruList`, updated on every window switch. Persisted to workspace.json.

## Important File Paths

- Workspace persistence: `%APPDATA%/ausome-terminal/workspace.json`
- Auto-save interval: 5 seconds (configurable in `AutoSaveManager`)
- Status polling interval: 500ms (configurable in `StatusPoller`)

## Testing Notes

- Tests use Vitest with jsdom environment
- Mock `window.electronAPI` in tests (see `src/renderer/test-setup.ts`)
- PTY processes use mock implementation when node-pty unavailable

## Common Pitfalls

1. **Don't** call `window.electronAPI` methods before checking they exist (renderer may load before preload)
2. **Don't** unmount `TerminalView` components - use CSS display control instead
3. **Don't** use `pidusage` for process monitoring - use PTY output detection
4. **Don't** auto-start PTY processes on workspace restore - let user start manually
5. **Don't** use `before-quit` event for cleanup - use `window.on('close')` instead (Windows compatibility)
