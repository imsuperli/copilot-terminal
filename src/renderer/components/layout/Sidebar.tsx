import React from 'react';
import { Plus, Settings, Terminal, HelpCircle } from 'lucide-react';
import { StatusBar } from '../StatusBar';
import { CreateWindowDialog } from '../CreateWindowDialog';
import { useWindowStore } from '../../stores/windowStore';

interface SidebarProps {
  appName?: string;
  version?: string;
  onCreateWindow?: () => void;
  isDialogOpen?: boolean;
  onDialogChange?: (open: boolean) => void;
}

export function Sidebar({
  appName = 'Ausome Terminal',
  version = '0.1.0',
  onCreateWindow,
  isDialogOpen = false,
  onDialogChange,
}: SidebarProps) {
  const windows = useWindowStore((state) => state.windows);

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
          {/* Active terminals count */}
          {windows.length > 0 && (
            <div className="px-4 py-3 rounded-lg bg-[rgb(var(--card))] border border-[rgb(var(--border))]">
              <div className="text-xs text-[rgb(var(--muted-foreground))]">活跃终端</div>
              <div className="text-2xl font-bold text-[rgb(var(--foreground))] mt-1">
                {windows.length}
              </div>
            </div>
          )}
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-opacity"
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


