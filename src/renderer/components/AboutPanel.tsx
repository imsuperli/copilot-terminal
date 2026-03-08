import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';

interface AboutPanelProps {
  open: boolean;
  onClose: () => void;
  appName: string;
  version: string;
}

export const AboutPanel: React.FC<AboutPanelProps> = ({
  open,
  onClose,
  appName,
  version,
}) => {
  const { t } = useI18n();

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,420px)] bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 z-[70] overflow-hidden animate-scale-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              {t('about.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
                aria-label={t('about.close')}
                title={t('about.close')}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-6">
            <Dialog.Description className="sr-only">
              {t('about.description', { appName })}
            </Dialog.Description>

            <div className="flex flex-col items-center text-center">
              <img
                src="/resources/icon.png"
                alt={t('about.logoAlt', { appName })}
                className="w-20 h-20 rounded-2xl shadow-lg mb-4"
              />

              <div className="text-xl font-semibold text-zinc-100 mb-1">{appName}</div>
              <div className="text-sm text-zinc-400 mb-6">{t('about.description', { appName })}</div>

              <div className="w-full space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-left">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-zinc-400">{t('about.version')}</span>
                  <span className="text-sm font-medium text-zinc-100">{version}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-zinc-400">{t('about.author')}</span>
                  <span className="text-sm font-medium text-zinc-100">licheng2</span>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

