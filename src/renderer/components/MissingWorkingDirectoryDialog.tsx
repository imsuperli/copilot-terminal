import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { useI18n } from '../i18n';

interface MissingWorkingDirectoryDialogProps {
  open: boolean;
  windowName: string;
  workingDirectory: string;
  error?: string;
  isProcessing?: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDirectory: () => void;
  onDeleteWindow: () => void;
}

export function MissingWorkingDirectoryDialog({
  open,
  windowName,
  workingDirectory,
  error,
  isProcessing = false,
  onOpenChange,
  onCreateDirectory,
  onDeleteWindow,
}: MissingWorkingDirectoryDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('windowDirectory.missingTitle')}
      description={t('windowDirectory.missingDescription', {
        name: windowName,
        path: workingDirectory,
      })}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[rgb(var(--warning))]" />
          <p className="break-all text-sm text-[rgb(var(--muted-foreground))]">{workingDirectory}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-[rgb(var(--error))] bg-[rgb(var(--error))]/10 px-4 py-3 text-sm text-[rgb(var(--error))]"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCreateDirectory}
            className="rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('windowDirectory.autoCreate')}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onDeleteWindow}
            className="rounded-lg bg-[rgb(var(--error))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('windowDirectory.deleteWindow')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
