import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupOverlayClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  IdePopupShell,
} from './ui/ide-popup';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  variant = 'danger',
}: ConfirmDialogProps) {
  const { t } = useI18n();

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: 'text-red-500',
          button: 'bg-red-600 hover:bg-red-700 text-white',
        };
      case 'warning':
        return {
          icon: 'text-yellow-500',
          button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
        };
      case 'info':
        return {
          icon: 'text-[rgb(var(--primary))]',
          button: 'bg-[rgb(var(--primary))] hover:opacity-90 text-[rgb(var(--primary-foreground))]',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={`${idePopupOverlayClassName} z-50 animate-in fade-in duration-200`} />
        <RadixDialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-95 duration-200 focus:outline-none">
          <IdePopupShell>
            <div className={idePopupHeaderClassName}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={12} className={`shrink-0 ${styles.icon}`} />
                  <div className={idePopupHeaderMetaClassName}>Confirm</div>
                </div>
                <RadixDialog.Title className={`mt-1 ${idePopupTitleClassName}`}>
                  {title}
                </RadixDialog.Title>
                <RadixDialog.Description className={idePopupSubtitleClassName}>
                  {description}
                </RadixDialog.Description>
              </div>
              <RadixDialog.Close asChild>
                <button
                  type="button"
                  aria-label={t('common.close')}
                  className={idePopupIconButtonClassName}
                >
                  <X size={14} />
                </button>
              </RadixDialog.Close>
            </div>

            <div className="flex justify-end gap-3 px-6 py-5">
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                {cancelText ?? t('common.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${styles.button}`}
              >
                {confirmText ?? t('common.create')}
              </button>
            </div>
          </IdePopupShell>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
