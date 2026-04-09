import { v4 as uuidv4 } from 'uuid';
import { StartSSHPaneResult, StartWindowResult } from '../../shared/types/electron-api';
import { getPaneBackend } from '../../shared/utils/terminalCapabilities';
import { Pane, Window } from '../types/window';
import { createPaneDraftFromSource, startPaneForWindow, startSplitPaneFromSource } from './paneSessionActions';

type ClonedWindowStartResult = StartWindowResult | StartSSHPaneResult;

export function createWindowDraftFromSourcePane(
  sourceWindow: Window,
  sourcePane: Pane,
  options: {
    windowId?: string;
    paneId?: string;
    name?: string;
  } = {},
): Window {
  const windowId = options.windowId ?? uuidv4();
  const paneId = options.paneId ?? uuidv4();
  const pane = createPaneDraftFromSource(sourcePane, paneId);
  const kind = getPaneBackend(sourcePane) === 'ssh' ? 'ssh' : 'local';
  const now = new Date().toISOString();

  return {
    id: windowId,
    name: options.name ?? sourceWindow.name,
    layout: {
      type: 'pane',
      id: paneId,
      pane,
    },
    activePaneId: paneId,
    createdAt: now,
    lastActiveAt: now,
    kind,
    ...(sourceWindow.tags ? { tags: [...sourceWindow.tags] } : {}),
  };
}

export async function startClonedWindowFromSourcePane(options: {
  sourceWindow: Window;
  sourcePane: Pane;
  targetWindow: Window;
}): Promise<ClonedWindowStartResult> {
  const { sourceWindow, sourcePane, targetWindow } = options;

  if (targetWindow.layout.type !== 'pane') {
    throw new Error(`Expected single-pane target window for clone: ${targetWindow.id}`);
  }

  if (getPaneBackend(sourcePane) === 'ssh') {
    return startSplitPaneFromSource({
      sourceWindowId: sourceWindow.id,
      sourcePane,
      targetWindowId: targetWindow.id,
      targetPaneId: targetWindow.layout.pane.id,
      remoteCwdOverride: sourcePane.ssh?.remoteCwd ?? sourcePane.cwd,
    });
  }

  return startPaneForWindow(targetWindow, targetWindow.layout.pane);
}

export function applyWindowStartResult(
  targetWindow: Window,
  result: ClonedWindowStartResult,
): Window {
  if (targetWindow.layout.type !== 'pane') {
    throw new Error(`Expected single-pane target window for start result: ${targetWindow.id}`);
  }

  return {
    ...targetWindow,
    layout: {
      ...targetWindow.layout,
      pane: {
        ...targetWindow.layout.pane,
        pid: result.pid,
        sessionId: result.sessionId,
        status: result.status,
      },
    },
  };
}
