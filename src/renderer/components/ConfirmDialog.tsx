import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../i18n';

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
          icon: 'text-blue-500',
          button: 'bg-blue-600 hover:bg-blue-700 text-white',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <RadixDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full z-50 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 ${styles.icon}`}>
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <RadixDialog.Title className="text-lg font-semibold text-zinc-100 mb-2">
                {title}
              </RadixDialog.Title>
              <RadixDialog.Description className="text-sm text-zinc-400 mb-6">
                {description}
              </RadixDialog.Description>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => onOpenChange(false)}
                  className="px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  {cancelText ?? t('common.cancel')}
                </button>
                <button
                  onClick={handleConfirm}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${styles.button}`}
                >
                  {confirmText ?? t('common.create')}
                </button>
              </div>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
