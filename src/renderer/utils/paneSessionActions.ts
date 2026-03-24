import { StartSSHPaneResult, StartWindowResult } from '../../shared/types/electron-api';
import { getPaneBackend, getPaneCapabilities } from '../../shared/utils/terminalCapabilities';
import { Pane, Window, WindowStatus } from '../types/window';
import { getAllPanes } from './layoutHelpers';
import { ensureSSHPasswordSaved } from './sshPasswordPrompt';

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
