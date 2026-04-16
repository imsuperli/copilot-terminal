import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Compass, ExternalLink, Folder, Globe, X } from 'lucide-react';
import { QuickNavItem } from '../../shared/types/quick-nav';
import { useI18n } from '../i18n';
import {
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupOverlayClassName,
  idePopupScrollAreaClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
  IdePopupShell,
} from './ui/ide-popup';

interface QuickNavPanelProps {
  open: boolean;
  onClose: () => void;
}

export const QuickNavPanel: React.FC<QuickNavPanelProps> = ({ open, onClose }) => {
  const [items, setItems] = useState<QuickNavItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  // 加载快捷导航配置
  useEffect(() => {
    if (open) {
      loadQuickNavItems();
    }
  }, [open]);

  const loadQuickNavItems = async () => {
    setLoading(true);
    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        const quickNavItems = response.data.quickNav?.items || [];
        // 按 order 排序
        setItems(quickNavItems.sort((a: QuickNavItem, b: QuickNavItem) => a.order - b.order));
      }
    } catch (error) {
      console.error('Failed to load quick nav items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = useCallback(async (item: QuickNavItem) => {
    try {
      if (item.type === 'url') {
        // 打开 URL
        await window.electronAPI.openExternalUrl(item.path);
      } else if (item.type === 'folder') {
        // 打开文件夹
        await window.electronAPI.openFolder(item.path);
      }
    } catch (error) {
      console.error(`Failed to open ${item.type}:`, error);
    }
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className={`${idePopupOverlayClassName} z-[1100] animate-fade-in`} />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-[1100] w-[90vw] max-w-4xl max-h-[85vh] -translate-x-1/2 -translate-y-1/2 animate-scale-in focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <IdePopupShell className="flex max-h-[85vh] flex-col">
            <div className={idePopupHeaderClassName}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Compass size={12} className="shrink-0 text-sky-300" />
                  <div className={idePopupHeaderMetaClassName}>Quick Nav</div>
                </div>
                <Dialog.Title className={`mt-1 ${idePopupTitleClassName}`}>
                  {t('quickNav.title')}
                </Dialog.Title>
                <div className={idePopupSubtitleClassName}>{t('quickNav.subtitle')}</div>
              </div>
              <Dialog.Close asChild>
                <button className={idePopupIconButtonClassName} aria-label={t('common.close')}>
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>

            <div className={`flex-1 overflow-y-auto p-5 ${idePopupScrollAreaClassName}`}>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-zinc-500">{t('common.loading')}</div>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <Globe size={48} className="mb-4 opacity-50" />
                  <p className="text-lg mb-2">{t('quickNav.emptyTitle')}</p>
                  <p className="text-sm">{t('quickNav.emptyDescription')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className="group relative flex flex-col items-center gap-3 rounded-[12px] border border-zinc-700/80 bg-zinc-900/45 p-4 text-center transition-all duration-150 hover:border-sky-400/50 hover:bg-zinc-800/90"
                      title={item.path}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-950/55 transition-colors group-hover:border-sky-400/40 group-hover:bg-sky-500/10">
                        {item.type === 'url' ? (
                          <Globe size={22} className="text-sky-300" />
                        ) : (
                          <Folder size={22} className="text-amber-300" />
                        )}
                      </div>

                      <div className="w-full">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {item.name}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-zinc-500">
                          {item.path}
                        </p>
                      </div>

                      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <ExternalLink size={14} className="text-zinc-500" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </IdePopupShell>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
