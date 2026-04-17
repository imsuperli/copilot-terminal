import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckSquare, Loader2, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  idePopupAccentCardClassName,
  idePopupActionButtonClassName,
  idePopupCardClassName,
  idePopupFieldShellClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupOverlayClassName,
  idePopupSecondaryButtonClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  IdePopupShell,
} from '../ui/ide-popup';

interface ActionInputDialogProps {
  open: boolean;
  metaLabel: string;
  title: string;
  description: string;
  inputLabel: string;
  placeholder: string;
  initialValue: string;
  confirmLabel: string;
  icon?: React.ReactNode;
  auxiliaryContent?: React.ReactNode;
  previewLabel?: string;
  getPreviewValue?: (value: string) => string;
  previewPlaceholder?: string;
  isSubmitting?: boolean;
  canConfirm?: (value: string) => boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: string) => Promise<boolean> | boolean;
}

export function ActionInputDialog({
  open,
  metaLabel,
  title,
  description,
  inputLabel,
  placeholder,
  initialValue,
  confirmLabel,
  icon,
  auxiliaryContent,
  previewLabel,
  getPreviewValue,
  previewPlaceholder,
  isSubmitting = false,
  canConfirm,
  onOpenChange,
  onConfirm,
}: ActionInputDialogProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValue(initialValue);
  }, [initialValue, open, title]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [open]);

  const normalizedValue = value.trim();
  const previewValue = getPreviewValue ? getPreviewValue(normalizedValue) : '';
  const isConfirmEnabled = canConfirm ? canConfirm(normalizedValue) : Boolean(normalizedValue);

  const handleSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!isConfirmEnabled || isSubmitting) {
      return;
    }

    const shouldClose = await onConfirm(normalizedValue);
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
        <Dialog.Overlay className={`${idePopupOverlayClassName} z-[1420] animate-fade-in`} />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-[1430] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in focus:outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <IdePopupShell className="flex flex-col">
            <div className={idePopupHeaderClassName}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {icon ?? <CheckSquare size={12} className="shrink-0 text-sky-300" />}
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

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
              <div className="space-y-2">
                <label
                  htmlFor="code-pane-action-input"
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
                >
                  {inputLabel}
                </label>
                <div className={idePopupFieldShellClassName}>
                  <input
                    id="code-pane-action-input"
                    ref={inputRef}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={inputLabel}
                    className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                  {isSubmitting ? (
                    <Loader2 size={14} className="shrink-0 animate-spin text-zinc-500" />
                  ) : null}
                </div>
              </div>

              {previewLabel ? (
                <div className={idePopupAccentCardClassName}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300/80">
                    {previewLabel}
                  </div>
                  <div className={`mt-2 break-all font-mono text-[12px] leading-5 ${
                    previewValue
                      ? 'text-sky-100'
                      : 'text-zinc-500'
                  }`}>
                    {previewValue || previewPlaceholder || ''}
                  </div>
                </div>
              ) : null}

              {auxiliaryContent ? (
                <div className={`${idePopupCardClassName} space-y-3`}>
                  {auxiliaryContent}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                  className={idePopupSecondaryButtonClassName}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!isConfirmEnabled || isSubmitting}
                  className={idePopupActionButtonClassName('primary')}
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                  <span>{confirmLabel}</span>
                </button>
              </div>
            </form>
          </IdePopupShell>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
