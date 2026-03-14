# CLAUDE.md
Always reply in chinese.

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
   - `WorkspaceManager`: Persists/restores workspace state to JSON file (includes groups)
   - `AutoSaveManager`: Auto-saves workspace every 5 seconds
   - `ViewSwitcher`: Handles unified view ↔ terminal view transitions
   - `GroupManager`: Manages window groups (create/update/delete/archive)
   - `TmuxCompatService`: Handles fake tmux commands for Claude Code Agent Teams
   - `TmuxRpcServer`: Named Pipe/Unix Socket RPC server for tmux shim communication

2. **Preload** (`src/preload/index.ts`): Security bridge using `contextBridge`
   - Exposes controlled IPC API as `window.electronAPI`
   - All main ↔ renderer communication goes through this layer

3. **Renderer Process** (`src/renderer/`): React application
   - `windowStore` (Zustand): Single source of truth for window state, includes MRU list, sidebar state, and window groups
   - `TerminalView`: xterm.js integration, handles PTY I/O, includes sidebar and quick switcher
   - `GroupView`: Group terminal view, displays multiple windows in split layout
   - `WindowCard`: Displays window status, controls (start/pause/archive/delete)
   - `GroupCard`: Displays group status, controls (start all/pause all/archive/delete)
   - `Sidebar`: Collapsible window list in terminal view
   - `QuickSwitcher`: Ctrl+Tab search panel for quick window switching
   - `QuickNavPanel`: Ctrl+K quick navigation panel for URLs and folders

### Key Data Flow

- **Window Creation**: Renderer → IPC → Main spawns PTY → Returns window object → Renderer adds to store
- **PTY Output**: PTY data → Main caches & broadcasts via IPC → Renderer writes to xterm.js
- **Status Updates**: StatusPoller detects changes → IPC event → Renderer updates store
- **Auto-save**: Store changes → Triggers IPC event → Main saves to workspace.json

## Critical Design Decisions

### Window Startup Behavior

Windows restored from workspace start in **paused state** (status: `Paused`, no PTY process). User must click "启动" to spawn the PTY process. This prevents resource exhaustion on startup with many windows.

### Terminal View Component Lifecycle

`TerminalView` components remain **mounted** for all active windows but use CSS `display: none` when inactive. This prevents xterm.js double-cursor bugs that occur with mount/unmount cycles. See `src/renderer/components/TerminalView.tsx`.

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

2. **Quick Switcher** (Ctrl+Tab):
   - Fuzzy search by window name or path
   - Keyboard navigation (↑↓ or Tab)
   - Highlights matching characters
   - Shows all windows including archived
   - Displays project links and IDE icons for each window

3. **Keyboard Shortcuts**:
   - `Ctrl+B`: Toggle sidebar expand/collapse
   - `Ctrl+1~9`: Switch to Nth window in sidebar
   - `Ctrl+Tab`: Open quick switcher
   - `Ctrl+Enter` / `Shift+Enter`: Insert newline in terminal (for apps like Claude Code)

**MRU List**: Maintained in `windowStore.mruList`, updated on every window switch. Persisted to workspace.json.

### Window Groups

Window groups allow organizing multiple terminal windows into a single logical unit with split-pane layout. Groups are displayed in the unified view as GroupCard components and can be opened in a dedicated GroupView.

#### Data Structure

**WindowGroup** (`src/shared/types/window-group.ts`):
```typescript
interface WindowGroup {
  id: string;
  name: string;
  layout: GroupLayoutNode;  // Recursive tree structure
  activeWindowId: string;   // Currently active window in group
  createdAt: string;
  lastActiveAt: string;
  archived: boolean;
}
```

**GroupLayoutNode** - Recursive tree structure (similar to Window's pane layout):
- `WindowNode`: Leaf node containing a window ID
- `GroupSplitNode`: Branch node with direction (horizontal/vertical), sizes, and children

Example layout:
```typescript
{
  type: 'split',
  direction: 'horizontal',
  sizes: [0.5, 0.5],
  children: [
    { type: 'window', id: 'window-1' },
    { type: 'window', id: 'window-2' }
  ]
}
```

#### State Management

**windowStore** (`src/renderer/stores/windowStore.ts`) manages group state:
- `groups: WindowGroup[]` - All window groups
- `activeGroupId: string | null` - Currently active group (mutually exclusive with activeWindowId)
- `groupMruList: string[]` - Group MRU list for quick switching

**State Mutual Exclusion**:
- `setActiveWindow(id)` - Activates single window, clears `activeGroupId`
- `setActiveGroup(id)` - Activates group, clears `activeWindowId`
- Only one can be active at a time (single window OR group view)

**Group Operations**:
- `createGroup(name, windowIds)` - Creates new group from selected windows
- `removeGroup(id)` - Deletes group (windows remain)
- `archiveGroup(id)` - Archives group and all windows inside
- `unarchiveGroup(id)` - Unarchives group and all windows inside
- `addWindowToGroupLayout(groupId, targetWindowId, newWindowId, direction)` - Adds window to group layout
- `removeWindowFromGroupLayout(groupId, windowId)` - Removes window from group (auto-dissolves if < 2 windows remain)
- `setActiveWindowInGroup(groupId, windowId)` - Sets active window within group
- `updateGroupSplitSizes(groupId, splitPath, sizes)` - Updates split pane sizes after user resize

**Boundary Cases**:
- When a window is archived/deleted, it's automatically removed from its group
- If a group has < 2 windows after removal, the group is automatically dissolved
- Archived groups are shown in separate section in unified view

#### IPC Communication

**GroupManager** (`src/main/services/GroupManager.ts`) provides 8 IPC handlers:
1. `group:create` - Create new group
2. `group:update` - Update group properties
3. `group:delete` - Delete group
4. `group:archive` - Archive group
5. `group:unarchive` - Unarchive group
6. `group:add-window` - Add window to group layout
7. `group:remove-window` - Remove window from group layout
8. `group:set-active-window` - Set active window in group

All operations trigger auto-save via WorkspaceManager.

#### UI Components

**GroupCard** (`src/renderer/components/GroupCard.tsx`):
- Displays group name, window count, aggregated status
- Shows creation time and last active time
- Batch operations: Start All, Pause All, Archive, Delete
- Click to open GroupView

**GroupView** (`src/renderer/components/GroupView.tsx`):
- Full-screen group terminal view
- Top toolbar: Back button, group name, status indicator, batch operations
- Main area: GroupSplitLayout with resizable split panes
- Sidebar and QuickSwitcher for navigation
- Keyboard shortcuts: Ctrl+B (toggle sidebar), Ctrl+Tab (quick switcher)

**GroupSplitLayout** (`src/renderer/components/GroupSplitLayout.tsx`):
- Recursively renders GroupLayoutNode tree
- Each WindowNode renders an embedded TerminalView
- Resizable split panes with drag handles
- Supports nested splits (horizontal and vertical)

#### View Switching Logic

**App.tsx** routing:
- `currentView === 'unified'` - Shows CardGrid with WindowCard and GroupCard
- `currentView === 'terminal' && activeWindowId` - Shows single TerminalView
- `currentView === 'terminal' && activeGroupId` - Shows GroupView (TODO: not yet implemented)

**Current Limitation**:
- App.tsx does not yet render GroupView when `activeGroupId` is set
- Users can create and manage groups in unified view, but cannot enter group terminal view
- This will be implemented in a future iteration

#### Drag-and-Drop (Planned Feature)

**Status**: UI components implemented, business logic pending

**Implemented**:
- `DraggableWindowCard` - Makes WindowCard draggable
- `DropZone` - Detects drop position (left/right/top/bottom/center)
- Visual feedback during drag (opacity, drop zone highlight)

**Pending**:
- GroupView `onWindowDrop` handler - Process drop events
- Business logic to add/remove windows from groups via drag
- Conflict handling between drag and split pane resize

**Note**: Drag-and-drop functionality is currently disabled. The UI components are in place but not connected to business logic. This feature will be implemented in a future iteration.

#### Persistence

Groups are persisted to `%APPDATA%/copilot-terminal/workspace.json`:
```json
{
  "windows": [...],
  "groups": [
    {
      "id": "group-1",
      "name": "Backend Services",
      "layout": { ... },
      "activeWindowId": "window-1",
      "createdAt": "2026-03-14T10:00:00.000Z",
      "lastActiveAt": "2026-03-14T12:30:00.000Z",
      "archived": false
    }
  ],
  "activeWindowId": null,
  "activeGroupId": "group-1",
  "mruList": [...],
  "groupMruList": ["group-1", "group-2"]
}
```

**Auto-save**: Triggered on every group operation (create/update/delete/archive).



Projects can include a `copilot.json` file in their root directory to define quick links to related resources:

- **File Location**: Project root directory (same as terminal working directory)
- **Purpose**: Display quick links to code repos, pipelines, docs, monitoring dashboards, etc.
- **UI Integration**: Links appear as buttons in WindowCard component (max 6 shown)
- **Click Behavior**: Opens URLs in default browser via `shell.openExternal()`

**Configuration Structure**:
```json
{
  "version": "1.0",
  "links": [
    {
      "name": "Display Name",
      "url": "https://example.com"
    }
  ]
}
```

**Key Points**:
- `name` must be globally unique within the config file
- `name` is used as the identifier and displayed on hover
- Only `name` and `url` fields are required (simplified design)

**Implementation**:
- Read on window creation: `src/main/utils/project-config.ts`
- Type definitions: `src/shared/types/project-config.ts`
- Stored in `Window.projectConfig` field
- Rendered in `WindowCard` component with ExternalLink icons

See `docs/project-config.md` for detailed documentation and examples.

### Quick Navigation (Global)

Global quick navigation panel for frequently accessed URLs and folders:

- **Activation**:
  - Keyboard shortcut: Double-tap `Shift` key (works in both unified and terminal views)
  - Sidebar button: Compass icon in main sidebar
- **Purpose**: Quick access to frequently used websites and project folders
- **UI**: Card-based grid layout with auto-detected icons (Globe for URLs, Folder for paths)
- **Configuration**: Managed in Settings Panel → Quick Navigation tab
- **Storage**: Saved in `%APPDATA%/copilot-terminal/settings.json` under `quickNav.items`

**Features**:
- Auto-detect type (URL vs folder path)
- Auto-extract name from URL domain or folder path
- Manual name editing
- Click to open in browser (URLs) or file explorer (folders)

**Implementation**:
- Component: `src/renderer/components/QuickNavPanel.tsx`
- Type definitions: `src/shared/types/quick-nav.ts`
- Settings integration: `src/renderer/components/SettingsPanel.tsx` (Tabs component)

See `docs/quick-nav-feature.md` for detailed documentation.

### tmux Compatibility Layer (Claude Code Agent Teams)

Provides fake tmux environment so Claude Code can use its Agent Teams multi-pane workflow inside Copilot Terminal. Three-layer architecture:

1. **Fake tmux Shim** (`resources/bin/tmux-shim.js` + `tmux.cmd`/`tmux`): Intercepts `tmux` commands, sends JSON RPC to main process via Named Pipe (Windows) or Unix Socket.

2. **TmuxRpcServer** (`src/main/services/TmuxRpcServer.ts`): One pipe/socket per window. Receives RPC requests, delegates to TmuxCompatService, returns JSON responses.

3. **TmuxCompatService** (`src/main/services/TmuxCompatService.ts`): Core service. Uses `TmuxCommandParser` to parse argv, routes to handler methods (`handleSplitWindow`, `handleSendKeys`, etc.), operates on windowStore and ProcessManager.

**Key types**: `src/shared/types/tmux.ts` — `TmuxCommand` enum, `ParsedTmuxCommand`, `ITmuxCompatService`, `TmuxPaneMetadata`, etc.

**Environment variables injected per pane**: `TMUX`, `TMUX_PANE`, `AUSOME_TMUX_RPC`, `AUSOME_TERMINAL_WINDOW_ID`, `AUSOME_TERMINAL_PANE_ID`. PATH is prepended with shim directory.

**Supported P0 commands**: `-V`, `display-message`, `list-panes`, `split-window`, `send-keys`, `select-layout`, `select-pane`, `resize-pane`, `kill-pane`, `set-option`.

**Pane UI enhancements** (`src/renderer/components/TerminalPane.tsx`): Displays agent title (via `select-pane -T`), status-colored top border, custom border color (via `set-option pane-border-style`).

**Debug**: Set `AUSOME_TMUX_DEBUG=1` in pane for shim-side logging. Set `debug: true` in TmuxCompatServiceConfig for main-process logging.

See `docs/tmux-user-guide.md`, `docs/tmux-developer-guide.md`, `docs/tmux-compat-architecture.md` for full documentation.

## Important File Paths

- Workspace persistence: `%APPDATA%/copilot-terminal/workspace.json`
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
6. **Don't** implement full tmux protocol - only support the command subset Claude Code actually uses (see P0 list in tmux section)
7. **Don't** forget to call `registerPane()` after creating a new pane via tmux split-window - the pane ID mapping is required for subsequent commands
8. **Don't** use real tmux on Windows - the fake shim is the only supported path
