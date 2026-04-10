import { useCallback, useState } from 'react';
import { canPaneOpenLocalFolder } from '../../shared/utils/terminalCapabilities';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { Window } from '../types/window';
import { getCurrentWindowTerminalPane } from '../utils/windowWorkingDirectory';

interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface PendingWindowDirectory {
  window: Window;
  workingDirectory: string;
  resumeAction: (window: Window) => void | Promise<void>;
}

function asIpcResponse<T>(value: unknown): IpcResponse<T> | null {
  if (!value || typeof value !== 'object' || !('success' in value)) {
    return null;
  }

  return value as IpcResponse<T>;
}

function isValidPathResult(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  const response = asIpcResponse<boolean>(value);
  return Boolean(response?.success && response.data);
}

export function useWindowDirectoryGuard() {
  const { t } = useI18n();
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const [pendingDirectory, setPendingDirectory] = useState<PendingWindowDirectory | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const runWithWindowDirectory = useCallback(async (
    targetWindow: Window,
    onContinue: (window: Window) => void | Promise<void>
  ) => {
    const targetPane = getCurrentWindowTerminalPane(targetWindow);

    if (!targetPane || !canPaneOpenLocalFolder(targetPane)) {
      await onContinue(targetWindow);
      return;
    }

    const workingDirectory = targetPane.cwd;
    if (!workingDirectory) {
      await onContinue(targetWindow);
      return;
    }

    try {
      const result = await window.electronAPI.validatePath(workingDirectory);
      if (isValidPathResult(result)) {
        await onContinue(targetWindow);
        return;
      }
    } catch (validationError) {
      console.error('[useWindowDirectoryGuard] Failed to validate working directory:', validationError);
    }

    setError('');
    setPendingDirectory({ window: targetWindow, workingDirectory, resumeAction: onContinue });
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && !isProcessing) {
      setPendingDirectory(null);
      setError('');
    }
  }, [isProcessing]);

  const handleCreateDirectory = useCallback(async () => {
    if (!pendingDirectory) {
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const response = asIpcResponse<string>(
        await window.electronAPI.createDirectory(pendingDirectory.workingDirectory)
      );

      if (!response?.success) {
        throw new Error(response?.error || t('windowDirectory.createFailed'));
      }

      const targetWindow = pendingDirectory.window;
      const resumeAction = pendingDirectory.resumeAction;
      setPendingDirectory(null);
      await resumeAction(targetWindow);
    } catch (createError) {
      setError((createError as Error).message || t('windowDirectory.createFailed'));
    } finally {
      setIsProcessing(false);
    }
  }, [pendingDirectory, t]);

  const handleDeleteWindow = useCallback(async () => {
    if (!pendingDirectory) {
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const response = asIpcResponse(
        await window.electronAPI.deleteWindow(pendingDirectory.window.id)
      );

      if (response && !response.success) {
        throw new Error(response.error || t('windowDirectory.deleteFailed'));
      }

      removeWindow(pendingDirectory.window.id);
      setPendingDirectory(null);
    } catch (deleteError) {
      setError((deleteError as Error).message || t('windowDirectory.deleteFailed'));
    } finally {
      setIsProcessing(false);
    }
  }, [pendingDirectory, removeWindow, t]);

  return {
    runWithWindowDirectory,
    dialogState: {
      open: Boolean(pendingDirectory),
      windowName: pendingDirectory?.window.name || '',
      workingDirectory: pendingDirectory?.workingDirectory || '',
      error,
      isProcessing,
      onOpenChange: handleOpenChange,
      onCreateDirectory: handleCreateDirectory,
      onDeleteWindow: handleDeleteWindow,
    },
  };
}
