import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { Dialog } from './ui/Dialog';

interface DeleteSSHCardDialogProps {
  open: boolean;
  profileName: string;
  associatedWindowCount: number;
  blockingWindowCount: number;
  error?: string;
  isProcessing?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function DeleteSSHCardDialog({
  open,
  profileName,
  associatedWindowCount,
  blockingWindowCount,
  error,
  isProcessing = false,
  onOpenChange,
  onConfirm,
}: DeleteSSHCardDialogProps) {
  const { t } = useI18n();
  const deleteBlocked = blockingWindowCount > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('sshDelete.title')}
      description={
        associatedWindowCount > 0
          ? t('sshDelete.descriptionWithWindows', { name: profileName, count: associatedWindowCount })
          : t('sshDelete.descriptionProfileOnly', { name: profileName })
      }
      contentClassName="max-w-[560px] rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--card))]"
      bodyClassName="space-y-4"
      showCloseButton
      closeLabel={t('common.close')}
    >
      <div className="flex items-start gap-3 rounded-xl border border-[rgb(var(--warning))]/30 bg-[rgb(var(--warning))]/10 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[rgb(var(--warning))]" />
        <p className="text-sm text-[rgb(var(--foreground))]">
          {t('sshDelete.warning')}
        </p>
      </div>

      {deleteBlocked && (
        <div className="rounded-xl border border-[rgb(var(--warning))]/30 bg-[rgb(var(--warning))]/10 px-4 py-3 text-sm text-[rgb(var(--foreground))]">
          {t('sshDelete.blocked', { count: blockingWindowCount })}
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
          disabled={deleteBlocked || isProcessing}
          onClick={() => {
            void onConfirm();
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--error))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 size={16} />
          <span>{isProcessing ? t('sshDelete.deleting') : t('sshDelete.confirm')}</span>
        </button>
      </div>
    </Dialog>
  );
}
