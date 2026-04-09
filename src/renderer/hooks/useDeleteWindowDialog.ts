import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { Window } from '../types/window';
import { getSSHCredentialCleanupAvailability } from '../utils/sshWindowDeletion';
import { getSSHSessionFamilyWindows, isEphemeralSSHCloneWindow } from '../utils/sshWindowBindings';

interface DeleteWindowDialogState {
  open: boolean;
  windowName: string;
  showCredentialOption: boolean;
  clearCredentials: boolean;
  clearCredentialsDisabled: boolean;
  blockingWindowCount: number;
  error: string;
  isProcessing: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  onClearCredentialsChange: (checked: boolean) => void;
}

export function useDeleteWindowDialog(): {
  requestDeleteWindow: (window: Window) => void;
  dialogState: DeleteWindowDialogState;
} {
  const { t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const [targetWindow, setTargetWindow] = useState<Window | null>(null);
  const [clearCredentials, setClearCredentials] = useState(false);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const cleanupAvailability = useMemo(
    () => (targetWindow ? getSSHCredentialCleanupAvailability(targetWindow, windows) : null),
    [targetWindow, windows],
  );

  useEffect(() => {
    if (!cleanupAvailability?.canClearCredentials && clearCredentials) {
      setClearCredentials(false);
    }
  }, [cleanupAvailability?.canClearCredentials, clearCredentials]);

  const resetDialog = useCallback(() => {
    setTargetWindow(null);
    setClearCredentials(false);
    setError('');
    setIsProcessing(false);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && !isProcessing) {
      resetDialog();
    }
  }, [isProcessing, resetDialog]);

  const requestDeleteWindow = useCallback((window: Window) => {
    setTargetWindow(window);
    setClearCredentials(false);
    setError('');
    setIsProcessing(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!targetWindow) {
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const sshFamilyWindowIds = getSSHSessionFamilyWindows(windows, targetWindow.id, {
        includeArchived: true,
      }).map((window) => window.id);
      const windowIdsToDelete = isEphemeralSSHCloneWindow(targetWindow)
        ? [targetWindow.id]
        : (sshFamilyWindowIds.length > 0 ? sshFamilyWindowIds : [targetWindow.id]);

      for (const windowId of windowIdsToDelete) {
        const deleteResponse = await window.electronAPI.deleteWindow(windowId);
        if (deleteResponse && !deleteResponse.success) {
          throw new Error(deleteResponse.error || t('windowDelete.deleteFailed'));
        }
      }

      if (clearCredentials && cleanupAvailability?.profileId && cleanupAvailability.canClearCredentials) {
        const clearResponse = await window.electronAPI.clearSSHProfileCredentials(cleanupAvailability.profileId);
        if (clearResponse && !clearResponse.success) {
          throw new Error(clearResponse.error || t('windowDelete.clearCredentialsFailed'));
        }
      }

      windowIdsToDelete.forEach((windowId) => {
        removeWindow(windowId);
      });
      resetDialog();
    } catch (deleteError) {
      setError((deleteError as Error).message || t('windowDelete.deleteFailed'));
      setIsProcessing(false);
    }
  }, [cleanupAvailability, clearCredentials, removeWindow, resetDialog, t, targetWindow, windows]);

  return {
    requestDeleteWindow,
    dialogState: {
      open: Boolean(targetWindow),
      windowName: targetWindow?.name ?? '',
      showCredentialOption: Boolean(cleanupAvailability?.eligible),
      clearCredentials,
      clearCredentialsDisabled: Boolean(cleanupAvailability && !cleanupAvailability.canClearCredentials),
      blockingWindowCount: cleanupAvailability?.blockingWindowCount ?? 0,
      error,
      isProcessing,
      onOpenChange: handleOpenChange,
      onConfirm: handleConfirm,
      onClearCredentialsChange: setClearCredentials,
    },
  };
}
