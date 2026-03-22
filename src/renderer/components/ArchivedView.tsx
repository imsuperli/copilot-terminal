import React, { useCallback, useMemo, useState } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useWindowStore } from '../stores/windowStore';
import { sortWindows } from '../utils/sortWindows';
import { getAllPanes } from '../utils/layoutHelpers';
import { WindowCard } from './WindowCard';
import { EditWindowPanel } from './EditWindowPanel';
import { MissingWorkingDirectoryDialog } from './MissingWorkingDirectoryDialog';
import { useWindowDirectoryGuard } from '../hooks/useWindowDirectoryGuard';
import { Window, WindowStatus } from '../types/window';
import { useI18n } from '../i18n';
import { getCurrentWindowWorkingDirectory } from '../utils/windowWorkingDirectory';
import { startWindowPanes } from '../utils/paneSessionActions';

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
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const updatePane = useWindowStore((state) => state.updatePane);
  const updateWindow = useWindowStore((state) => state.updateWindow);
  const pauseWindowState = useWindowStore((state) => state.pauseWindowState);
  const unarchiveWindow = useWindowStore((state) => state.unarchiveWindow);
  const { runWithWindowDirectory, dialogState } = useWindowDirectoryGuard();
  const [editingWindow, setEditingWindow] = useState<Window | null>(null);

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
      await runWithWindowDirectory(win, async (targetWindow) => {
        onEnterTerminal?.(targetWindow);
      });
    },
    [onEnterTerminal, runWithWindowDirectory]
  );

  const startWindow = useCallback(async (win: Window) => {
    await startWindowPanes(win, updatePane);
  }, [updatePane]);

  const handleStartWindow = useCallback(async (win: Window) => {
    await runWithWindowDirectory(win, startWindow);
  }, [runWithWindowDirectory, startWindow]);

  const handlePauseWindow = useCallback(async (win: Window) => {
    try {
      // 关闭窗口（终止所有 PTY 进程）
      await window.electronAPI.closeWindow(win.id);

      pauseWindowState(win.id);
    } catch (error) {
      console.error('Failed to pause window:', error);
    }
  }, [pauseWindowState]);

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

  const openFolder = useCallback(async (win: Window) => {
    const workingDirectory = getCurrentWindowWorkingDirectory(win);
    try {
      await window.electronAPI.openFolder(workingDirectory);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, []);

  const handleOpenFolder = useCallback(async (win: Window) => {
    await runWithWindowDirectory(win, openFolder);
  }, [openFolder, runWithWindowDirectory]);

  const openInIDE = useCallback(async (ide: string, win: Window) => {
    const workingDirectory = getCurrentWindowWorkingDirectory(win);
    try {
      const response = await window.electronAPI.openInIDE(ide, workingDirectory);
      if (!response.success) {
        console.error(`Failed to open in ${ide}:`, response.error);
      }
    } catch (error) {
      console.error(`Failed to open in ${ide}:`, error);
    }
  }, []);

  const handleOpenInIDE = useCallback(async (ide: string, win: Window) => {
    await runWithWindowDirectory(win, async (targetWindow) => {
      await openInIDE(ide, targetWindow);
    });
  }, [openInIDE, runWithWindowDirectory]);

  const handleEditWindow = useCallback((win: Window) => {
    setEditingWindow(win);
  }, []);

  const handleSaveEdit = useCallback(async (windowId: string, updates: { name?: string; command?: string; cwd?: string }) => {
    try {
      // 更新窗口名称
      if (updates.name) {
        updateWindow(windowId, { name: updates.name });
      }

      // 更新第一个窗格的 command 和 cwd
      const window = windows.find(w => w.id === windowId);
      if (window) {
        const panes = getAllPanes(window.layout);
        if (panes.length > 0) {
          const firstPane = panes[0];
          const paneUpdates: Partial<typeof firstPane> = {};

          if (updates.command && updates.command !== firstPane.command) {
            paneUpdates.command = updates.command;
          }

          if (updates.cwd && updates.cwd !== firstPane.cwd) {
            paneUpdates.cwd = updates.cwd;
          }

          if (Object.keys(paneUpdates).length > 0) {
            updatePane(windowId, firstPane.id, paneUpdates);
          }
        }
      }
    } catch (error) {
      console.error('Failed to update window:', error);
    }
  }, [updateWindow, updatePane, windows]);

  const handleCloseEdit = useCallback(() => {
    setEditingWindow(null);
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
    <>
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
                  onEdit={handleEditWindow}
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

      <MissingWorkingDirectoryDialog {...dialogState} />

      {editingWindow && (
        <EditWindowPanel
          window={editingWindow}
          onClose={handleCloseEdit}
          onSave={handleSaveEdit}
        />
      )}
    </>
  );
});

ArchivedView.displayName = 'ArchivedView';
