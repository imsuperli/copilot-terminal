import { StartSSHPaneResult, StartWindowResult } from '../../shared/types/electron-api';
import { getPaneBackend, getPaneCapabilities } from '../../shared/utils/terminalCapabilities';
import { Pane, Window, WindowStatus } from '../types/window';
import { getAllPanes } from './layoutHelpers';
import { ensureSSHPasswordSaved } from './sshPasswordPrompt';

type PaneStartResult = StartWindowResult | StartSSHPaneResult;

// 终端字体配置（与 TerminalPane.tsx 保持一致）
const TERMINAL_FONT_SIZE = 14;
const TERMINAL_LINE_HEIGHT = 1.2;
// 等宽字体字符宽约为字体大小的 0.6 倍
const CHAR_WIDTH_RATIO = 0.6;

/**
 * 估算当前终端容器的初始 cols/rows
 * 在 TerminalPane 挂载之前调用，使用 window 可视区域来近似
 */
function estimateInitialTerminalSize(): { cols: number; rows: number } {
  if (typeof window === 'undefined') {
    return { cols: 120, rows: 30 };
  }

  const availWidth = window.innerWidth;
  const availHeight = window.innerHeight;

  // 粗略估算：扣除侧边栏（约 32px）和内边距（约 8px）
  const terminalWidth = Math.max(availWidth - 40, 100);
  const terminalHeight = Math.max(availHeight - 40, 100);

  const charWidth = TERMINAL_FONT_SIZE * CHAR_WIDTH_RATIO;
  const charHeight = TERMINAL_FONT_SIZE * TERMINAL_LINE_HEIGHT;

  const cols = Math.max(Math.floor(terminalWidth / charWidth), 40);
  const rows = Math.max(Math.floor(terminalHeight / charHeight), 10);

  return { cols, rows };
}

type PaneStartResult = StartWindowResult | StartSSHPaneResult;

function getSplitSuccessStatus(pane: Pane): WindowStatus {
  return getPaneBackend(pane) === 'ssh'
    ? WindowStatus.WaitingForInput
    : WindowStatus.Running;
}

export function createPaneDraftFromSource(sourcePane: Pane, paneId: string): Pane {
  const backend = getPaneBackend(sourcePane);
  const ssh = sourcePane.ssh ? { ...sourcePane.ssh } : undefined;

  return {
    id: paneId,
    cwd: sourcePane.cwd,
    command: sourcePane.command,
    status: WindowStatus.Restoring,
    pid: null,
    backend,
    capabilities: getPaneCapabilities(sourcePane),
    ...(ssh ? { ssh } : {}),
  };
}

export async function startPaneForWindow(targetWindow: Window, pane: Pane): Promise<PaneStartResult> {
  const { cols: initialCols, rows: initialRows } = estimateInitialTerminalSize();

  if (getPaneBackend(pane) === 'ssh') {
    if (!pane.ssh) {
      throw new Error(`SSH pane metadata is missing for ${targetWindow.id}/${pane.id}`);
    }

    const shouldContinue = await ensureSSHPasswordSaved({
      profileId: pane.ssh.profileId,
      profileName: targetWindow.name,
      host: pane.ssh.host,
      user: pane.ssh.user,
      authType: pane.ssh.authType,
    });
    if (!shouldContinue) {
      throw new Error('SSH password entry was cancelled');
    }

    const response = await window.electronAPI.startSSHPane({
      windowId: targetWindow.id,
      paneId: pane.id,
      profileId: pane.ssh.profileId,
      remoteCwd: pane.ssh.remoteCwd ?? pane.cwd,
      command: pane.command,
      initialCols,
      initialRows,
    });

    if (!response?.success || !response.data) {
      throw new Error(response?.error || '启动 SSH 窗格失败');
    }

    return response.data;
  }

  const response = await window.electronAPI.startWindow({
    windowId: targetWindow.id,
    paneId: pane.id,
    name: targetWindow.name,
    workingDirectory: pane.cwd,
    command: pane.command,
    initialCols,
    initialRows,
  });

  if (!response?.success || !response.data) {
    throw new Error(response?.error || '启动窗格失败');
  }

  return response.data;
}

export async function startWindowPanes(
  targetWindow: Window,
  updatePane: (windowId: string, paneId: string, updates: Partial<Pane>) => void,
  panesToStart: Pane[] = getAllPanes(targetWindow.layout),
): Promise<void> {
  for (const pane of panesToStart) {
    updatePane(targetWindow.id, pane.id, { status: WindowStatus.Restoring });
  }

  await Promise.all(
    panesToStart.map(async (pane) => {
      try {
        const result = await startPaneForWindow(targetWindow, pane);
        updatePane(targetWindow.id, pane.id, {
          pid: result.pid,
          sessionId: result.sessionId,
          status: result.status,
        });
      } catch (error) {
        console.error(`Failed to start pane ${pane.id}:`, error);
        updatePane(targetWindow.id, pane.id, { status: WindowStatus.Paused });
      }
    }),
  );
}

export async function startSplitPaneFromSource(options: {
  sourceWindowId: string;
  sourcePane: Pane;
  targetWindowId: string;
  targetPaneId: string;
}): Promise<{
  pid: number | null;
  sessionId: string;
  status: WindowStatus;
}> {
  const { sourceWindowId, sourcePane, targetWindowId, targetPaneId } = options;
  const { cols: initialCols, rows: initialRows } = estimateInitialTerminalSize();

  if (getPaneBackend(sourcePane) === 'ssh') {
    const response = await window.electronAPI.cloneSSHPane({
      sourceWindowId,
      sourcePaneId: sourcePane.id,
      targetWindowId,
      targetPaneId,
    });

    if (!response?.success || !response.data) {
      throw new Error(response?.error || '拆分 SSH 窗格失败');
    }

    return {
      pid: response.data.pid,
      sessionId: response.data.sessionId,
      status: getSplitSuccessStatus(sourcePane),
    };
  }

  const response = await window.electronAPI.splitPane({
    workingDirectory: sourcePane.cwd,
    command: sourcePane.command,
    windowId: targetWindowId,
    paneId: targetPaneId,
    initialCols,
    initialRows,
  });

  if (!response?.success || !response.data) {
    throw new Error(response?.error || '拆分窗格失败');
  }

  return {
    pid: response.data.pid,
    sessionId: response.data.sessionId,
    status: getSplitSuccessStatus(sourcePane),
  };
}
