import React from 'react';
import { Plus, Settings, Terminal, HelpCircle, Archive } from 'lucide-react';
import { StatusBar } from '../StatusBar';
import { CreateWindowDialog } from '../CreateWindowDialog';
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
  const activeWindows = windows.filter(w => !w.archived);
  const archivedWindows = windows.filter(w => w.archived);

  return (
    <>
      <aside className="w-64 h-screen bg-[rgb(var(--sidebar))] border-r border-[rgb(var(--border))] flex flex-col">
        {/* Header with app title */}
        <div className="flex h-14 items-center px-4 pt-6">
          <span className="text-lg font-bold text-[rgb(var(--primary))]">{appName}</span>
        </div>

        <div className="h-px bg-[rgb(var(--border))] mt-2" />

        {/* Status section */}
        <div className="px-4 py-4 border-b border-[rgb(var(--border))]">
          <StatusBar />
        </div>

        {/* Main content area */}
        <div className="flex-1 px-4 py-4 overflow-y-auto">
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
              <span>活跃终端</span>
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

        <div className="h-px bg-[rgb(var(--border))]" />

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

          {/* New Terminal button */}
          <button
            onClick={onCreateWindow}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            <span>新建终端</span>
          </button>
        </div>
      </aside>

      <CreateWindowDialog
        open={isDialogOpen}
        onOpenChange={onDialogChange ?? (() => {})}
      />
    </>
  );
}


