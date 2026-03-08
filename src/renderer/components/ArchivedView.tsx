import React, { useCallback, useMemo } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useWindowStore } from '../stores/windowStore';
import { sortWindows } from '../utils/sortWindows';
import { getAllPanes } from '../utils/layoutHelpers';
import { WindowCard } from './WindowCard';
import { Window, WindowStatus } from '../types/window';
import { useI18n } from '../i18n';

interface ArchivedViewProps {
  onEnterTerminal?: (window: Window) => void;
  searchQuery?: string;
}

/**
 * ArchivedView 组件
 * 显示所有已归档的窗口
 */
export const ArchivedView = React.memo<ArchivedViewProps>(({ onEnterTerminal, searchQuery = '' }) => {
  const { t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const setActiveWindow = useWindowStore((state) => state.setActiveWindow);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const updateWindow = useWindowStore((state) => state.updateWindow);
  const updatePane = useWindowStore((state) => state.updatePane);
  const unarchiveWindow = useWindowStore((state) => state.unarchiveWindow);

  // 只显示已归档的窗口
  const archivedWindows = useMemo(() => windows.filter(w => w.archived), [windows]);

  // 按 lastActiveAt 降序排序
  const sortedWindows = useMemo(() => sortWindows(archivedWindows, 'lastActiveAt'), [archivedWindows]);

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

  const handleUnarchiveWindow = useCallback((win: Window) => {
    unarchiveWindow(win.id);
  }, [unarchiveWindow]);

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

  const handleOpenInIDE = useCallback(async (ide: string, workingDirectory: string) => {
    try {
      const response = await window.electronAPI.openInIDE(ide, workingDirectory);
      if (!response.success) {
        console.error(`Failed to open in ${ide}:`, response.error);
      }
    } catch (error) {
      console.error(`Failed to open in ${ide}:`, error);
    }
  }, []);

  if (archivedWindows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
          <div className="text-center">
          <p className="text-lg text-[rgb(var(--muted-foreground))]">{t('archived.emptyTitle')}</p>
        </div>
      </div>
    );
  }

  if (searchQuery && filteredWindows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-lg text-[rgb(var(--muted-foreground))]">{t('common.noMatchingWindows')}</p>
          <p className="text-sm text-[rgb(var(--muted-foreground))] mt-2">{t('common.tryDifferentSearch')}</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea.Root className="h-full" data-testid="archived-view-scroll-root">
      <ScrollArea.Viewport className="h-full w-full">
        <div
          data-testid="archived-view"
          className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 p-8"
        >
          {filteredWindows.map((win) => {
            return (
              <WindowCard
                key={win.id}
                window={win}
                onClick={handleCardClick}
                onOpenFolder={handleOpenFolder}
                onDelete={handleDeleteWindow}
                onStart={handleStartWindow}
                onPause={handlePauseWindow}
                onUnarchive={handleUnarchiveWindow}
                onOpenInIDE={handleOpenInIDE}
              />
            );
          })}
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

ArchivedView.displayName = 'ArchivedView';
