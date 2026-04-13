import type { LayoutNode, Pane } from '../../shared/types/window';
import type { Workspace } from '../types/workspace';
import { getPaneBackend, isCodePane, isTerminalPane } from '../../shared/utils/terminalCapabilities';

function collectPaneProjectRoot(pane: Pane, roots: Set<string>): void {
  if (isCodePane(pane) && pane.code?.rootPath) {
    roots.add(pane.code.rootPath);
    return;
  }

  if (!isTerminalPane(pane)) {
    return;
  }

  if (getPaneBackend(pane) !== 'local') {
    return;
  }

  if (pane.cwd) {
    roots.add(pane.cwd);
  }
}

function collectLayoutProjectRoots(layout: LayoutNode, roots: Set<string>): void {
  if (layout.type === 'pane') {
    collectPaneProjectRoot(layout.pane, roots);
    return;
  }

  for (const child of layout.children) {
    collectLayoutProjectRoots(child, roots);
  }
}

export function collectWorkspaceProjectRoots(workspace: Workspace | null): string[] {
  if (!workspace) {
    return [];
  }

  const roots = new Set<string>();
  for (const window of workspace.windows) {
    collectLayoutProjectRoots(window.layout, roots);
  }

  return Array.from(roots);
}
