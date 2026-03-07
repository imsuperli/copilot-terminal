import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ExternalLink, Folder, Globe } from 'lucide-react';
import { QuickNavItem } from '../../shared/types/quick-nav';

interface QuickNavPanelProps {
  open: boolean;
  onClose: () => void;
}

export const QuickNavPanel: React.FC<QuickNavPanelProps> = ({ open, onClose }) => {
  const [items, setItems] = useState<QuickNavItem[]>([]);
  const [loading, setLoading] = useState(false);

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
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl max-h-[85vh] bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 z-50 overflow-hidden flex flex-col animate-scale-in"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
            <Dialog.Title className="text-xl font-semibold text-zinc-100">
              快捷导航
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* 内容区域 */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-zinc-500">加载中...</div>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                <Globe size={48} className="mb-4 opacity-50" />
                <p className="text-lg mb-2">暂无快捷导航</p>
                <p className="text-sm">在设置中添加常用的网址或文件夹</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="group flex flex-col items-center gap-3 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50 hover:border-blue-500/50 hover:bg-zinc-800 transition-all duration-200 hover:scale-105"
                    title={item.path}
                  >
                    {/* 图标 */}
                    <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-zinc-700/50 group-hover:bg-blue-600/20 transition-colors">
                      {item.type === 'url' ? (
                        <Globe size={24} className="text-blue-400" />
                      ) : (
                        <Folder size={24} className="text-yellow-400" />
                      )}
                    </div>

                    {/* 名称 */}
                    <div className="w-full text-center">
                      <p className="text-sm font-medium text-zinc-100 truncate">
                        {item.name}
                      </p>
                    </div>

                    {/* 类型标识 */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink size={14} className="text-zinc-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

