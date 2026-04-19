import React from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { useI18n } from '../i18n';
import { Dialog } from './ui/Dialog';

interface DeleteWindowDialogProps {
  open: boolean;
  windowName: string;
  showCredentialOption: boolean;
  clearCredentials: boolean;
  clearCredentialsDisabled: boolean;
  blockingWindowCount: number;
  error?: string;
  isProcessing?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  onClearCredentialsChange: (checked: boolean) => void;
}

export function DeleteWindowDialog({
  open,
  windowName,
  showCredentialOption,
  clearCredentials,
  clearCredentialsDisabled,
  blockingWindowCount,
  error,
  isProcessing = false,
  onOpenChange,
  onConfirm,
  onClearCredentialsChange,
}: DeleteWindowDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('windowDelete.title')}
      description={t('windowDelete.description', { name: windowName })}
      contentClassName="max-w-[560px] rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--card))]"
      bodyClassName="space-y-4"
      showCloseButton
      closeLabel={t('common.close')}
    >
      <div className="flex items-start gap-3 rounded-xl border border-[rgb(var(--warning))]/30 bg-[rgb(var(--warning))]/10 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[rgb(var(--warning))]" />
        <p className="text-sm text-[rgb(var(--foreground))]">
          {t('windowDelete.warning')}
        </p>
      </div>

      {showCredentialOption && (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={clearCredentials}
              disabled={clearCredentialsDisabled || isProcessing}
              onChange={(event) => onClearCredentialsChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--warning))] [color-scheme:dark] focus:ring-[rgb(var(--warning))]"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--foreground))]">
                <KeyRound className="h-4 w-4 text-[rgb(var(--warning))]" />
                <span>{t('windowDelete.clearCredentialsLabel')}</span>
              </div>
              <p className="text-sm text-[rgb(var(--muted-foreground))]">
                {clearCredentialsDisabled
                  ? t('windowDelete.clearCredentialsBlocked', { count: blockingWindowCount })
                  : t('windowDelete.clearCredentialsHint')}
              </p>
            </div>
          </label>
        </div>
      )}

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
          onClick={() => onOpenChange(false)}
          className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--secondary))] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => {
            void onConfirm();
          }}
          className="rounded-lg bg-[rgb(var(--error))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isProcessing ? t('windowDelete.deleting') : t('windowDelete.confirm')}
        </button>
      </div>
    </Dialog>
  );
}
