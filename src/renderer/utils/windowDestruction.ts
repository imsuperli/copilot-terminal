import type { IpcResponse } from '../../shared/types/electron-api';

function assertIpcSuccess(response: IpcResponse<void> | undefined, fallbackMessage: string): void {
  if (response && !response.success) {
    throw new Error(response.error || fallbackMessage);
  }
}

export async function destroyWindowProcessAndRecord(windowId: string): Promise<void> {
  const closeResponse = await window.electronAPI.closeWindow(windowId);
  assertIpcSuccess(closeResponse, `Failed to close window ${windowId}`);

  const deleteResponse = await window.electronAPI.deleteWindow(windowId);
  assertIpcSuccess(deleteResponse, `Failed to delete window ${windowId}`);
}
