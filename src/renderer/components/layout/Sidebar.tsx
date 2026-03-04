import React, { useState } from 'react';
import { Plus, Settings, Terminal, HelpCircle, Archive, FolderPlus } from 'lucide-react';
import { StatusBar } from '../StatusBar';
import { CreateWindowDialog } from '../CreateWindowDialog';
import { BatchCreateWindowDialog } from '../BatchCreateWindowDialog';
import { useWindowStore } from '../../stores/windowStore';

interface SidebarProps {
  appName?: string;
  version?: string;
  onCreateWindow?: () => void;
  isDialogOpen?: boolean;
  onDialogChange?: (open: boolean) => void;
  currentTab?: 'active' | 'archived';
  onTabChange?: (tab: 'active' | 'archived') => void;
}

export function Sidebar({
  appName = 'Ausome Terminal',
  version = '0.1.0',
  onCreateWindow,
  isDialogOpen = false,
  onDialogChange,
  currentTab = 'active',
  onTabChange,
}: SidebarProps) {
  const windows = useWindowStore((state) => state.windows);
  const addWindow = useWindowStore((state) => state.addWindow);
  const activeWindows = windows.filter(w => !w.archived);
  const archivedWindows = windows.filter(w => w.archived);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);

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

  return (
    <>
      <aside className="w-64 h-screen bg-[rgb(var(--sidebar))] border-r border-[rgb(var(--border))] flex flex-col">
        {/* 顶部间距，与右侧卡片对齐 */}
        <div className="h-4" />

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
        <div className="space-y-3 p-4">
          {/* Settings and Help row */}
          <div className="flex items-center gap-2">
            <button
              className="flex-1 flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--accent-foreground))] transition-colors"
              onClick={() => {}}
            >
              <Settings className="h-4 w-4" />
              <span>设置</span>
            </button>
            <button
              className="flex items-center justify-center w-9 h-9 rounded-lg text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))] transition-colors"
              onClick={() => {}}
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>

          {/* New Terminal buttons */}
          <div className="flex gap-2">
            <button
              onClick={onCreateWindow}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              <span>新建终端</span>
            </button>
            <button
              onClick={() => setIsBatchDialogOpen(true)}
              className="flex items-center justify-center px-3 py-2.5 rounded-lg bg-[rgb(var(--accent))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]/80 transition-colors"
              title="批量添加"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
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
    </>
  );
}


