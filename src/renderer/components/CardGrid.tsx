import React, { useCallback, useMemo } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useWindowStore } from '../stores/windowStore';
import { sortWindows } from '../utils/sortWindows';
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
  const updateWindow = useWindowStore((state) => state.updateWindow);
  const archiveWindow = useWindowStore((state) => state.archiveWindow);

  // 只显示未归档的窗口
  const activeWindows = useMemo(() => windows.filter(w => !w.archived), [windows]);

  // 按 createdAt 降序排序（最后创建的在最前面），缓存结果避免每次渲染都排序
  const sortedWindows = useMemo(() => sortWindows(activeWindows, 'createdAt'), [activeWindows]);

  const handleCardClick = useCallback(
    async (win: Window) => {
      // 直接调用 onEnterTerminal，让上层处理启动逻辑
      onEnterTerminal?.(win);
    },
    [onEnterTerminal]
  );

  const handleStartWindow = useCallback(async (win: Window) => {
    try {
      // 更新状态为 Restoring
      updateWindow(win.id, { status: WindowStatus.Restoring });

      // 启动窗口（不进入终端视图）
      const result = await window.electronAPI.startWindow({
        windowId: win.id,
        name: win.name,
        workingDirectory: win.workingDirectory,
        command: win.command,
      });

      // 更新窗口信息
      updateWindow(win.id, {
        pid: result.pid,
        status: result.status,
      });
    } catch (error) {
      console.error('Failed to start window:', error);
      // 启动失败，恢复为暂停状态
      updateWindow(win.id, { status: WindowStatus.Paused });
    }
  }, [updateWindow]);

  const handlePauseWindow = useCallback(async (win: Window) => {
    try {
      if (win.pid) {
        // 关闭窗口（终止 PTY 进程）
        await window.electronAPI.closeWindow(win.id);
        // 更新状态为暂停
        updateWindow(win.id, {
          status: WindowStatus.Paused,
          pid: null
        });
      }
    } catch (error) {
      console.error('Failed to pause window:', error);
    }
  }, [updateWindow]);

  const handleArchiveWindow = useCallback(async (win: Window) => {
    try {
      // 如果窗口正在运行，先暂停
      if (win.pid) {
        await window.electronAPI.closeWindow(win.id);
      }
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

  if (activeWindows.length === 0) {
    return null;
  }

  return (
    <ScrollArea.Root className="h-full" data-testid="card-grid-scroll-root">
      <ScrollArea.Viewport className="h-full w-full">
        <div
          data-testid="card-grid"
          className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 p-8"
        >
          {sortedWindows.map((win) => (
            <WindowCard
              key={win.id}
              window={win}
              onClick={() => handleCardClick(win)}
              onOpenFolder={() => handleOpenFolder(win.workingDirectory)}
              onDelete={() => handleDeleteWindow(win.id)}
              onStart={() => handleStartWindow(win)}
              onPause={() => handlePauseWindow(win)}
              onArchive={() => handleArchiveWindow(win)}
            />
          ))}
          <NewWindowCard onClick={onCreateWindow ?? (() => {})} />
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-2.5 touch-none select-none bg-transparent p-0.5 transition-colors hover:bg-zinc-800/50"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
});

CardGrid.displayName = 'CardGrid';
