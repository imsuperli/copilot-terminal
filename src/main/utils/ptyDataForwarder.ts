import type { BrowserWindow } from 'electron';
import type { PtyDataPayload } from '../../shared/types/electron-api';

type MainWindowProvider = () => BrowserWindow | null | undefined;

function getPaneKey(payload: PtyDataPayload): string {
  return `${payload.windowId}:${payload.paneId ?? ''}`;
}

export function createPtyDataForwarder(getMainWindow: MainWindowProvider) {
  const pendingByPaneKey = new Map<string, PtyDataPayload>();
  let flushScheduled = false;

  const flush = () => {
    flushScheduled = false;

    const targetWindow = getMainWindow();
    if (!targetWindow || targetWindow.isDestroyed()) {
      pendingByPaneKey.clear();
      return;
    }

    const queuedPayloads = Array.from(pendingByPaneKey.values());
    pendingByPaneKey.clear();

    for (const payload of queuedPayloads) {
      targetWindow.webContents.send('pty-data', payload);
    }
  };

  return (payload: PtyDataPayload): void => {
    if (!payload.data) {
      return;
    }

    const paneKey = getPaneKey(payload);
    const existing = pendingByPaneKey.get(paneKey);

    if (existing) {
      existing.data += payload.data;
      if (payload.seq !== undefined) {
        existing.seq = payload.seq;
      }
    } else {
      pendingByPaneKey.set(paneKey, { ...payload });
    }

    if (flushScheduled) {
      return;
    }

    flushScheduled = true;
    setImmediate(flush);
  };
}
