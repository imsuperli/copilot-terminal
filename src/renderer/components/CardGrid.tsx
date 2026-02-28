import React, { useCallback, useMemo } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useWindowStore } from '../stores/windowStore';
import { sortWindows } from '../utils/sortWindows';
import { WindowCard } from './WindowCard';
import { NewWindowCard } from './NewWindowCard';
import { Window } from '../types/window';

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

  // 按 lastActiveAt 降序排序，缓存结果避免每次渲染都排序
  const sortedWindows = useMemo(() => sortWindows(windows, 'lastActiveAt'), [windows]);

  const handleCardClick = useCallback(
    (win: Window) => {
      setActiveWindow(win.id);
      onEnterTerminal?.(win);
    },
    [setActiveWindow, onEnterTerminal]
  );

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

  if (windows.length === 0) {
    return null;
  }

  return (
    <ScrollArea.Root className="h-full" data-testid="card-grid-scroll-root">
      <ScrollArea.Viewport className="h-full w-full">
        <div
          data-testid="card-grid"
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-6"
        >
          {sortedWindows.map((win) => (
            <WindowCard
              key={win.id}
              window={win}
              onClick={() => handleCardClick(win)}
              onOpenFolder={() => handleOpenFolder(win.workingDirectory)}
              onDelete={() => handleDeleteWindow(win.id)}
            />
          ))}
          <NewWindowCard onClick={onCreateWindow ?? (() => {})} />
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none select-none bg-zinc-900 p-0.5 transition-colors"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-zinc-700" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
});

CardGrid.displayName = 'CardGrid';
