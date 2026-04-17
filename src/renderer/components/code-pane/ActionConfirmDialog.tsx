import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupOverlayClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  IdePopupShell,
} from '../ui/ide-popup';

interface ActionConfirmDialogProps {
  open: boolean;
  metaLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone?: 'danger' | 'warning' | 'primary';
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean> | boolean;
}

const confirmToneClassName = {
  danger: 'bg-red-600 hover:bg-red-500 text-white disabled:bg-zinc-700 disabled:text-zinc-400',
  warning: 'bg-amber-600 hover:bg-amber-500 text-white disabled:bg-zinc-700 disabled:text-zinc-400',
  primary: 'bg-sky-600 hover:bg-sky-500 text-white disabled:bg-zinc-700 disabled:text-zinc-400',
} as const;

export function ActionConfirmDialog({
  open,
  metaLabel,
  title,
  description,
  confirmLabel,
  confirmTone = 'danger',
  isSubmitting = false,
  onOpenChange,
  onConfirm,
}: ActionConfirmDialogProps) {
  const { t } = useI18n();

  const handleConfirm = async () => {
    if (isSubmitting) {
      return;
    }

    const shouldClose = await onConfirm();
    if (shouldClose) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSubmitting) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={`${idePopupOverlayClassName} z-[1440] animate-fade-in`} />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-[1450] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in focus:outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <IdePopupShell className="flex flex-col">
            <div className={idePopupHeaderClassName}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={12} className="shrink-0 text-amber-300" />
                  <div className={idePopupHeaderMetaClassName}>{metaLabel}</div>
                </div>
                <Dialog.Title className={`mt-1 ${idePopupTitleClassName}`}>
                  {title}
                </Dialog.Title>
                <Dialog.Description className={idePopupSubtitleClassName}>
                  {description}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t('common.close')}
                  className={idePopupIconButtonClassName}
                  disabled={isSubmitting}
                >
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-5">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirm();
                }}
                disabled={isSubmitting}
                className={`inline-flex min-w-[112px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${confirmToneClassName[confirmTone]}`}
              >
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                <span>{confirmLabel}</span>
              </button>
            </div>
          </IdePopupShell>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
