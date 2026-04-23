import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { useI18n } from '../i18n';
import {
  idePopupActionButtonClassName,
  idePopupSecondaryButtonClassName,
  idePopupSubtlePanelClassName,
} from './ui/ide-popup';

interface MissingWorkingDirectoryDialogProps {
  open: boolean;
  windowName: string;
  workingDirectory: string;
  error?: string;
  isProcessing?: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDirectory: () => void;
  onCancel: () => void;
}

export function MissingWorkingDirectoryDialog({
  open,
  windowName,
  workingDirectory,
  error,
  isProcessing = false,
  onOpenChange,
  onCreateDirectory,
  onCancel,
}: MissingWorkingDirectoryDialogProps) {
  const { t } = useI18n();
  const primaryButtonClassName = `${idePopupActionButtonClassName('primary')} rounded-lg px-4 py-2 text-sm font-medium`;
  const secondaryButtonClassName = `${idePopupSecondaryButtonClassName} rounded-lg px-4 py-2 text-sm font-medium`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('windowDirectory.missingTitle')}
      description={t('windowDirectory.missingDescription', {
        name: windowName,
        path: workingDirectory,
      })}
      contentClassName="!max-w-[520px] rounded-[20px] border border-[rgb(var(--border))] bg-[linear-gradient(180deg,color-mix(in_srgb,rgb(var(--card))_94%,transparent)_0%,color-mix(in_srgb,rgb(var(--background))_96%,transparent)_100%)] backdrop-blur-xl"
    >
      <div className="space-y-4">
        <div className={`flex items-start gap-3 rounded-xl ${idePopupSubtlePanelClassName} p-4`}>
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
            className={`${primaryButtonClassName} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {t('windowDirectory.autoCreate')}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className={`${secondaryButtonClassName} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
