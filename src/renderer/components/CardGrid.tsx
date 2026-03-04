import React, { useCallback, useMemo, useState } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { Search, X, Plus, Trash2 } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { sortWindows } from '../utils/sortWindows';
import { getAllPanes } from '../utils/layoutHelpers';
import { WindowCard } from './WindowCard';
import { NewWindowCard } from './NewWindowCard';
import { Window, WindowStatus } from '../types/window';

interface CardGridProps {
  onCreateWindow?: () => void;
  onEnterTerminal?: (window: Window) => void;
}

/**
 * CardGrid 组件
 * 以响应式 CSS Grid 网格布局显示所有窗口卡片
 */
export const CardGrid = React.memo<CardGridProps>(({ onCreateWindow, onEnterTerminal }) => {
  const windows = useWindowStore((state) => state.windows);
  const setActiveWindow = useWindowStore((state) => state.setActiveWindow);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const updatePane = useWindowStore((state) => state.updatePane);
  const archiveWindow = useWindowStore((state) => state.archiveWindow);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');

  // 只显示未归档的窗口
  const activeWindows = useMemo(() => windows.filter(w => !w.archived), [windows]);

  // 按 createdAt 降序排序（最后创建的在最前面），缓存结果避免每次渲染都排序
  const sortedWindows = useMemo(() => sortWindows(activeWindows, 'createdAt'), [activeWindows]);

  // 根据搜索关键词过滤窗口
  const filteredWindows = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortedWindows;
    }

    const query = searchQuery.toLowerCase().trim();
    return sortedWindows.filter((win) => {
      // 搜索窗口名称
      if (win.name.toLowerCase().includes(query)) {
        return true;
      }

      // 搜索窗口路径
      const panes = getAllPanes(win.layout);
      return panes.some((pane) => pane.cwd.toLowerCase().includes(query));
    });
  }, [sortedWindows, searchQuery]);

  const handleCardClick = useCallback(
    async (win: Window) => {
      // 直接调用 onEnterTerminal，让上层处理启动逻辑
      onEnterTerminal?.(win);
    },
    [onEnterTerminal]
  );

  const handleStartWindow = useCallback(async (win: Window) => {
    try {
      // 获取所有窗格
      const panes = getAllPanes(win.layout);

      // 为每个窗格启动 PTY 进程
      for (const pane of panes) {
        // 更新窗格状态为 Restoring
        updatePane(win.id, pane.id, { status: WindowStatus.Restoring });

        try {
          // 启动窗格
          const response = await window.electronAPI.startWindow({
            windowId: win.id,
            paneId: pane.id,
            name: win.name,
            workingDirectory: pane.cwd,
            command: pane.command,
          });

          // 检查响应格式并立即更新窗格状态
          if (response && response.success && response.data) {
            updatePane(win.id, pane.id, {
              pid: response.data.pid,
              status: response.data.status,
            });
          } else {
            throw new Error(response?.error || '启动窗格失败');
          }
        } catch (paneError) {
          console.error(`Failed to start pane ${pane.id}:`, paneError);
          // 单个窗格启动失败，恢复为暂停状态
          updatePane(win.id, pane.id, { status: WindowStatus.Paused });
        }
      }
    } catch (error) {
      console.error('Failed to start window:', error);
      // 整体启动失败，恢复所有窗格为暂停状态
      const panes = getAllPanes(win.layout);
      for (const pane of panes) {
        updatePane(win.id, pane.id, { status: WindowStatus.Paused });
      }
    }
  }, [updatePane]);

  const handlePauseWindow = useCallback(async (win: Window) => {
    try {
      // 关闭窗口（终止所有 PTY 进程）
      await window.electronAPI.closeWindow(win.id);

      // 立即更新所有窗格状态为 Paused
      const panes = getAllPanes(win.layout);
      for (const pane of panes) {
        updatePane(win.id, pane.id, {
          status: WindowStatus.Paused,
          pid: null
        });
      }
    } catch (error) {
      console.error('Failed to pause window:', error);
    }
  }, [updatePane]);

  const handleArchiveWindow = useCallback(async (win: Window) => {
    try {
      // 先关闭窗口（如果有运行中的进程）
      await window.electronAPI.closeWindow(win.id);
      // 归档窗口
      archiveWindow(win.id);
    } catch (error) {
      console.error('Failed to archive window:', error);
    }
  }, [archiveWindow]);

  const handleCloseWindow = useCallback(async (windowId: string) => {
    try {
      await window.electronAPI.closeWindow(windowId);
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  }, []);

  const handleDeleteWindow = useCallback(async (windowId: string) => {
    try {
      await window.electronAPI.deleteWindow(windowId);
      removeWindow(windowId);
    } catch (error) {
      console.error('Failed to delete window:', error);
    }
  }, [removeWindow]);

  const handleOpenFolder = useCallback(async (workingDirectory: string) => {
    try {
      await window.electronAPI.openFolder(workingDirectory);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, []);

  const handleClearAllWindows = useCallback(async () => {
    if (!window.confirm('确定要删除所有窗口吗？此操作不可恢复。')) {
      return;
    }

    try {
      // 删除所有活跃窗口
      for (const win of activeWindows) {
        await window.electronAPI.closeWindow(win.id);
        await window.electronAPI.deleteWindow(win.id);
        removeWindow(win.id);
      }
    } catch (error) {
      console.error('Failed to clear all windows:', error);
    }
  }, [activeWindows, removeWindow]);

  if (activeWindows.length === 0) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      {/* 搜索栏和操作按钮 */}
      <div className="flex-shrink-0 px-8 pt-4 pb-3">
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索窗口..."
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="清除搜索"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* 搜索结果提示 */}
          {searchQuery && (
            <div className="text-sm text-zinc-400">
              {filteredWindows.length} 个结果
            </div>
          )}

          {/* 右侧按钮组 */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onCreateWindow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 rounded-md transition-opacity"
              title="新建终端"
            >
              <Plus size={16} />
              <span>新建终端</span>
            </button>
            <button
              onClick={handleClearAllWindows}
              disabled={activeWindows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-800 disabled:hover:text-zinc-300"
              title="清空所有终端"
            >
              <Trash2 size={16} />
              <span>清空终端</span>
            </button>
          </div>
        </div>
      </div>

      {/* 窗口网格 */}
      <ScrollArea.Root className="flex-1" data-testid="card-grid-scroll-root">
        <ScrollArea.Viewport className="h-full w-full">
          <div
            data-testid="card-grid"
            className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 px-8 pb-8"
          >
            {filteredWindows.map((win) => {
              // 从布局树中获取第一个窗格的工作目录
              const panes = getAllPanes(win.layout);
              const firstPaneCwd = panes.length > 0 ? panes[0].cwd : '';

              return (
                <WindowCard
                  key={win.id}
                  window={win}
                  onClick={() => handleCardClick(win)}
                  onOpenFolder={() => handleOpenFolder(firstPaneCwd)}
                  onDelete={() => handleDeleteWindow(win.id)}
                  onStart={() => handleStartWindow(win)}
                  onPause={() => handlePauseWindow(win)}
                  onArchive={() => handleArchiveWindow(win)}
                />
              );
            })}
            {!searchQuery && <NewWindowCard onClick={onCreateWindow ?? (() => {})} />}
          </div>
          {/* 无搜索结果提示 */}
          {searchQuery && filteredWindows.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <Search size={48} className="mb-4 opacity-50" />
              <p className="text-lg">未找到匹配的窗口</p>
              <p className="text-sm mt-2">尝试使用其他关键词搜索</p>
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="vertical"
          className="flex w-2.5 touch-none select-none bg-transparent p-0.5 transition-colors hover:bg-zinc-800/50"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </div>
  );
});

CardGrid.displayName = 'CardGrid';
