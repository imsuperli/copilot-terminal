import React from 'react';
import { Plus, Settings, Terminal } from 'lucide-react';
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
      <aside className="w-64 h-screen bg-zinc-950 border-r border-zinc-800 flex flex-col">
        {/* 顶部：应用标题 */}
        <div className="px-6 py-5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Terminal size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-100 tracking-tight">
                {appName}
              </h1>
              <span className="text-xs text-zinc-500">
                v{version}
              </span>
            </div>
          </div>
        </div>

        {/* 中间：状态统计 */}
        <div className="px-6 py-4 border-b border-zinc-800">
          <StatusBar />
        </div>

        {/* 主要内容区 - 占据剩余空间 */}
        <div className="flex-1 px-4 py-4 overflow-y-auto">
          {/* 窗口数量提示 */}
          {windows.length > 0 && (
            <div className="px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xs text-zinc-400">活跃终端</div>
              <div className="text-2xl font-bold text-zinc-100 mt-1">
                {windows.length}
              </div>
            </div>
          )}
        </div>

        {/* 底部：设置和新建终端按钮 */}
        <div className="px-4 py-4 border-t border-zinc-800 space-y-2">
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          >
            <Settings size={18} />
            <span className="text-sm">设置</span>
          </button>

          <button
            onClick={onCreateWindow}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
          >
            <Plus size={18} />
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

