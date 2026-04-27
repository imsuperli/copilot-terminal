import type { IpcResponse } from '../../shared/types/electron-api';
import { Window } from '../types/window';
import { useWindowStore } from '../stores/windowStore';
import { getDestroyableSSHWindowIds, isEphemeralSSHCloneWindow } from './sshWindowBindings';

function assertIpcSuccess(response: IpcResponse<void> | undefined, fallbackMessage: string): void {
  if (response && !response.success) {
    throw new Error(response.error || fallbackMessage);
  }
}

async function destroyWindowResources(windowId: string): Promise<void> {
  const closeResponse = await window.electronAPI.closeWindow(windowId);
  assertIpcSuccess(closeResponse, `Failed to close window ${windowId}`);

  const deleteResponse = await window.electronAPI.deleteWindow(windowId);
  assertIpcSuccess(deleteResponse, `Failed to delete window ${windowId}`);
}

export async function destroyWindowResourcesKeepRecord(windowId: string): Promise<void> {
  await destroyWindowResources(windowId);

  const { getWindowById, clearWindowRuntimeSession } = useWindowStore.getState();
  const targetWindow = getWindowById(windowId);
  if (!targetWindow) {
    return;
  }

  if (targetWindow.ephemeral) {
    useWindowStore.getState().removeWindow(windowId);
    return;
  }

  clearWindowRuntimeSession(windowId);
}

export async function destroyWindowResourcesAndRemoveRecord(windowId: string): Promise<void> {
  await destroyWindowResources(windowId);
  useWindowStore.getState().removeWindow(windowId);
}

export async function destroySSHWindowFamilyResources(
  targetWindow: Window,
  options?: {
    removeTargetRecord?: boolean;
    includeOwnedClones?: boolean;
  },
): Promise<string[]> {
  const allWindows = useWindowStore.getState().windows;
  const windowIds = getDestroyableSSHWindowIds(allWindows, targetWindow, {
    includeOwner: !isEphemeralSSHCloneWindow(targetWindow),
    includeOwnedClones: options?.includeOwnedClones ?? !isEphemeralSSHCloneWindow(targetWindow),
  });
  const processedWindowIds: string[] = [];

  for (const windowId of windowIds) {
    const currentWindow = useWindowStore.getState().getWindowById(windowId);
    if (!currentWindow) {
      continue;
    }

    const shouldRemoveRecord = currentWindow.id === targetWindow.id
      ? (currentWindow.ephemeral ? true : Boolean(options?.removeTargetRecord))
      : true;

    if (shouldRemoveRecord) {
      await destroyWindowResourcesAndRemoveRecord(windowId);
    } else {
      await destroyWindowResourcesKeepRecord(windowId);
    }

    processedWindowIds.push(windowId);
  }

  return processedWindowIds;
}
