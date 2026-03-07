import React, { useState } from 'react';
import { Plus, Settings, HelpCircle, Archive, FolderPlus, Search, X, Trash2, Terminal, Compass } from 'lucide-react';
import { StatusBar } from '../StatusBar';
import { CreateWindowDialog } from '../CreateWindowDialog';
import { BatchCreateWindowDialog } from '../BatchCreateWindowDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { SettingsPanel } from '../SettingsPanel';
import { QuickNavPanel } from '../QuickNavPanel';
import { useWindowStore } from '../../stores/windowStore';

interface SidebarProps {
  appName?: string;
  version?: string;
  onCreateWindow?: () => void;
  isDialogOpen?: boolean;
  onDialogChange?: (open: boolean) => void;
  currentTab?: 'active' | 'archived';
  onTabChange?: (tab: 'active' | 'archived') => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Sidebar({
  appName = 'Copilot-Terminal',
  version = '0.1.0',
  onCreateWindow,
  isDialogOpen = false,
  onDialogChange,
  currentTab = 'active',
  onTabChange,
  searchQuery = '',
  onSearchChange,
}: SidebarProps) {
  const windows = useWindowStore((state) => state.windows);
  const addWindow = useWindowStore((state) => state.addWindow);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const activeWindows = windows.filter(w => !w.archived);
  const archivedWindows = windows.filter(w => w.archived);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isQuickNavPanelOpen, setIsQuickNavPanelOpen] = useState(false);

  const handleBatchCreate = async (selectedPaths: string[]) => {
    for (const path of selectedPaths) {
      try {
        const result = await window.electronAPI.createWindow({
          workingDirectory: path,
        });

        if (result.success && result.data) {
          addWindow(result.data);
        } else if (result.error) {
          console.error(`Failed to create window for ${path}:`, result.error);
        }
      } catch (error) {
        console.error(`Failed to create window for ${path}:`, error);
      }
    }
  };

  const handleClearAllWindows = async () => {
    try {
      for (const win of activeWindows) {
        await window.electronAPI.closeWindow(win.id);
        await window.electronAPI.deleteWindow(win.id);
        removeWindow(win.id);
      }
    } catch (error) {
      console.error('Failed to clear all windows:', error);
    }
  };

  const handleClearArchivedWindows = async () => {
    try {
      for (const win of archivedWindows) {
        await window.electronAPI.closeWindow(win.id);
        await window.electronAPI.deleteWindow(win.id);
        removeWindow(win.id);
      }
    } catch (error) {
      console.error('Failed to clear archived windows:', error);
    }
  };

  return (
    <>
      <aside className="w-64 h-screen bg-[rgb(var(--sidebar))] border-r border-[rgb(var(--border))] flex flex-col">
        {/* 顶部间距，与右侧卡片对齐 */}
        <div className="h-4" />

        {/* 搜索框 */}
        {((currentTab === 'active' && activeWindows.length > 0) || (currentTab === 'archived' && archivedWindows.length > 0)) && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="搜索窗口..."
                className="w-full pl-8 pr-7 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange?.('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="清除搜索"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 状态统计 */}
        <div className="px-4 py-4 border-b border-[rgb(var(--border))]">
          <h3 className="text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider mb-3">
            状态统计
          </h3>
          <StatusBar />
        </div>

        {/* 窗格管理 */}
        <div className="flex-1 px-4 py-4 overflow-y-auto border-b border-[rgb(var(--border))]">
          <h3 className="text-xs font-semibold text-[rgb(var(--muted-foreground))] uppercase tracking-wider mb-3">
            窗格管理
          </h3>
          {/* Tab buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onTabChange?.('active')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                currentTab === 'active'
                  ? 'bg-[rgb(var(--accent))] text-[rgb(var(--primary))] font-medium'
                  : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]'
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>工作区终端</span>
              {activeWindows.length > 0 && (
                <span className="ml-auto text-xs">{activeWindows.length}</span>
              )}
            </button>
            <button
              onClick={() => onTabChange?.('archived')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                currentTab === 'archived'
                  ? 'bg-[rgb(var(--accent))] text-[rgb(var(--primary))] font-medium'
                  : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]'
              }`}
            >
              <Archive className="h-4 w-4" />
              <span>归档终端</span>
              {archivedWindows.length > 0 && (
                <span className="ml-auto text-xs">{archivedWindows.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Bottom section */}
        <div className="space-y-2 p-4">
          {/* Settings and Help row */}
          <div className="flex items-center gap-2">
            <button
              className="flex-1 flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--accent-foreground))] transition-colors"
              onClick={() => setIsSettingsPanelOpen(true)}
            >
              <Settings className="h-4 w-4" />
              <span>设置</span>
            </button>
            <button
              className="flex items-center justify-center w-9 h-9 rounded-lg text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] transition-colors"
              onClick={() => setIsQuickNavPanelOpen(true)}
              title="快捷导航"
            >
              <Compass className="h-4 w-4" />
            </button>
            <button
              className="flex items-center justify-center w-9 h-9 rounded-lg text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] transition-colors"
              onClick={() => {}}
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>

          {/* New Terminal button */}
          <button
            onClick={onCreateWindow}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            <span>新建终端</span>
          </button>

          {/* Batch button - always show */}
          <button
            onClick={() => setIsBatchDialogOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-opacity"
            title="批量添加"
          >
            <FolderPlus className="h-4 w-4" />
            <span>批量添加</span>
          </button>

          {/* Clear button - show for both active and archived tabs */}
          {currentTab === 'active' && activeWindows.length > 0 && (
            <button
              onClick={() => setIsConfirmDialogOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition-colors"
              title="清空所有终端"
            >
              <Trash2 className="h-4 w-4" />
              <span>清空终端</span>
            </button>
          )}
          {currentTab === 'archived' && archivedWindows.length > 0 && (
            <button
              onClick={() => setIsConfirmDialogOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition-colors"
              title="清空所有归档终端"
            >
              <Trash2 className="h-4 w-4" />
              <span>清空归档</span>
            </button>
          )}
        </div>
      </aside>

      <CreateWindowDialog
        open={isDialogOpen}
        onOpenChange={onDialogChange ?? (() => {})}
      />

      <BatchCreateWindowDialog
        open={isBatchDialogOpen}
        onOpenChange={setIsBatchDialogOpen}
        onConfirm={handleBatchCreate}
      />

      <ConfirmDialog
        open={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
        title={currentTab === 'active' ? '清空所有终端' : '清空所有归档终端'}
        description={
          currentTab === 'active'
            ? `确定要删除所有 ${activeWindows.length} 个窗口吗？此操作不可恢复。`
            : `确定要删除所有 ${archivedWindows.length} 个归档窗口吗？此操作不可恢复。`
        }
        confirmText="删除"
        cancelText="取消"
        onConfirm={currentTab === 'active' ? handleClearAllWindows : handleClearArchivedWindows}
        variant="danger"
      />

      <SettingsPanel
        open={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
      />

      <QuickNavPanel
        open={isQuickNavPanelOpen}
        onClose={() => setIsQuickNavPanelOpen(false)}
      />
    </>
  );
}


