import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Info, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { resolveRendererAssetUrl } from '../utils/assetUrl';
import {
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupOverlayClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  IdePopupShell,
} from './ui/ide-popup';

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
  const appLogoSrc = resolveRendererAssetUrl('resources/icon.png');

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`${idePopupOverlayClassName} z-[60] animate-fade-in`} />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[70] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in focus:outline-none">
          <IdePopupShell>
            <div className={idePopupHeaderClassName}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Info size={12} className="shrink-0 text-sky-300" />
                  <div className={idePopupHeaderMetaClassName}>About</div>
                </div>
                <Dialog.Title className={`mt-1 ${idePopupTitleClassName}`}>
                  {t('about.title')}
                </Dialog.Title>
                <div className={idePopupSubtitleClassName}>{t('about.description', { appName })}</div>
              </div>
              <Dialog.Close asChild>
                <button
                  className={idePopupIconButtonClassName}
                  aria-label={t('about.close')}
                  title={t('about.close')}
                >
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>

            <div className="px-6 py-6">
              <Dialog.Description className="sr-only">
                {t('about.description', { appName })}
              </Dialog.Description>

              <div className="flex flex-col items-center text-center">
                <img
                  src={appLogoSrc}
                  alt={t('about.logoAlt', { appName })}
                  className="mb-4 h-20 w-20 rounded-2xl shadow-lg"
                />

                <div className="mb-1 text-xl font-semibold text-[rgb(var(--foreground))]">{appName}</div>
                <div className="mb-6 text-sm text-[rgb(var(--muted-foreground))]">{t('about.description', { appName })}</div>

                <div className="w-full space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_74%,transparent)] p-4 text-left">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[rgb(var(--muted-foreground))]">{t('about.version')}</span>
                    <span className="text-sm font-medium text-[rgb(var(--foreground))]">{version}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[rgb(var(--muted-foreground))]">{t('about.author')}</span>
                    <span className="text-sm font-medium text-[rgb(var(--foreground))]">licheng2</span>
                  </div>
                </div>
              </div>
            </div>
          </IdePopupShell>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
