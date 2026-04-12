import type { Pane } from '../types/window';
import { WindowStatus } from '../types/window';

export function createCodePaneDraft(
  paneId: string,
  rootPath: string,
  options?: {
    openFiles?: Array<{ path: string; pinned?: boolean }>;
    activeFilePath?: string | null;
    selectedPath?: string | null;
    viewMode?: 'editor' | 'diff';
    diffTargetPath?: string | null;
  },
): Pane {
  const openFiles = options?.openFiles ?? [];

  return {
    id: paneId,
    kind: 'code',
    cwd: rootPath,
    command: '',
    status: WindowStatus.Paused,
    pid: null,
    code: {
      rootPath,
      openFiles,
      activeFilePath: options?.activeFilePath ?? openFiles[0]?.path ?? null,
      selectedPath: options?.selectedPath ?? openFiles[0]?.path ?? null,
      viewMode: options?.viewMode ?? 'editor',
      diffTargetPath: options?.diffTargetPath ?? null,
    },
  };
}
