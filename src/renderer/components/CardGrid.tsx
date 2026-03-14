import React, { useCallback, useMemo, useState } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { Search, Folder, Archive } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { sortWindows } from '../utils/sortWindows';
import { getAllPanes } from '../utils/layoutHelpers';
import { WindowCard } from './WindowCard';
import { GroupCard } from './GroupCard';
import { EditWindowPanel } from './EditWindowPanel';
import { EditGroupPanel } from './EditGroupPanel';
import { CreateGroupDialog } from './CreateGroupDialog';
import { NewWindowCard } from './NewWindowCard';
import { MissingWorkingDirectoryDialog } from './MissingWorkingDirectoryDialog';
import { DraggableWindowCard, DraggableGroupCard, DropZone } from './dnd';
import type { WindowCardDragItem, DropResult } from './dnd';
import { useWindowDirectoryGuard } from '../hooks/useWindowDirectoryGuard';
import { Window, WindowStatus } from '../types/window';
import { WindowGroup } from '../../shared/types/window-group';
import { useI18n } from '../i18n';
import { getCurrentWindowWorkingDirectory } from '../utils/windowWorkingDirectory';
import { createGroup, getAllWindowIds } from '../utils/groupLayoutHelpers';

// 统一的卡片项类型
type CardItem =
  | { type: 'window'; data: Window }
  | { type: 'group'; data: WindowGroup };

interface CardGridProps {
  onEnterTerminal?: (window: Window) => void;
  onEnterGroup?: (group: WindowGroup) => void; // TODO: 等待任务 #5 完成后实现组视图
  onCreateWindow?: () => void;
  searchQuery?: string;
  currentTab?: 'all' | 'active' | 'archived' | string;
}

/**
 * CardGrid 组件
 * 以响应式 CSS Grid 网格布局显示所有窗口卡片和组卡片
 *
 * TODO: 等待任务 #1、#2、#3 完成后实现以下功能：
 * - 同时显示窗口和组
 * - 支持搜索组名称和组内窗口
 * - 支持组的各种操作（创建、编辑、删除、归档）
 * - 支持批量启动/暂停组内所有窗口
 */
export const CardGrid = React.memo<CardGridProps>(({ onEnterTerminal, onEnterGroup, onCreateWindow, searchQuery = '', currentTab = 'active' }) => {
  const { t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const updatePane = useWindowStore((state) => state.updatePane);
  const updateWindow = useWindowStore((state) => state.updateWindow);
  const pauseWindowState = useWindowStore((state) => state.pauseWindowState);
  const archiveWindow = useWindowStore((state) => state.archiveWindow);
  const unarchiveWindow = useWindowStore((state) => state.unarchiveWindow);

  // 组相关的 store 方法
  const groups = useWindowStore((state) => state.groups);
  const removeGroup = useWindowStore((state) => state.removeGroup);
  const updateGroup = useWindowStore((state) => state.updateGroup);
  const archiveGroup = useWindowStore((state) => state.archiveGroup);
  const unarchiveGroup = useWindowStore((state) => state.unarchiveGroup);

  // 自定义分类
  const customCategories = useWindowStore((state) => state.customCategories);

  const { runWithWindowDirectory, dialogState } = useWindowDirectoryGuard();
  const [editingWindow, setEditingWindow] = useState<Window | null>(null);
  const [editingGroup, setEditingGroup] = useState<WindowGroup | null>(null);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);


  // 根据 currentTab 过滤和排序卡片项
  const cardItems = useMemo<CardItem[]>(() => {
    const sortGroupsByCreatedAt = (gs: WindowGroup[]) =>
      [...gs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 自定义分类标签
    if (currentTab !== 'all' && currentTab !== 'active' && currentTab !== 'archived') {
      const category = customCategories.find(c => c.id === currentTab);
      if (!category) return [];

      const categoryWindows = windows.filter(w => category.windowIds.includes(w.id));
      const categoryGroups = groups.filter(g => category.groupIds.includes(g.id));

      const groupItems: CardItem[] = sortGroupsByCreatedAt(categoryGroups).map(g => ({ type: 'group', data: g }));
      const windowItems: CardItem[] = sortWindows(categoryWindows, 'createdAt').map(w => ({ type: 'window', data: w }));
      return [...groupItems, ...windowItems];
    }

    if (currentTab === 'all') {
      // 全部终端：活跃组 → 活跃窗口 → 归档组 → 归档窗口
      const activeGroups = groups.filter(g => !g.archived);
      const archivedGroups = groups.filter(g => g.archived);
      const activeWindows = windows.filter(w => !w.archived);
      const archivedWindows = windows.filter(w => w.archived);

      return [
        ...sortGroupsByCreatedAt(activeGroups).map(g => ({ type: 'group' as const, data: g })),
        ...sortWindows(activeWindows, 'createdAt').map(w => ({ type: 'window' as const, data: w })),
        ...sortGroupsByCreatedAt(archivedGroups).map(g => ({ type: 'group' as const, data: g })),
        ...sortWindows(archivedWindows, 'lastActiveAt').map(w => ({ type: 'window' as const, data: w })),
      ];
    }

    if (currentTab === 'archived') {
      // 归档终端：归档组 → 归档窗口
      const archivedGroups = groups.filter(g => g.archived);
      const archivedWindows = windows.filter(w => w.archived);

      return [
        ...sortGroupsByCreatedAt(archivedGroups).map(g => ({ type: 'group' as const, data: g })),
        ...sortWindows(archivedWindows, 'lastActiveAt').map(w => ({ type: 'window' as const, data: w })),
      ];
    }

    // 活跃终端（默认）：活跃组 → 活跃窗口
    const activeGroups = groups.filter(g => !g.archived);
    const activeWindows = windows.filter(w => !w.archived);

    return [
      ...sortGroupsByCreatedAt(activeGroups).map(g => ({ type: 'group' as const, data: g })),
      ...sortWindows(activeWindows, 'createdAt').map(w => ({ type: 'window' as const, data: w })),
    ];
  }, [currentTab, windows, groups, customCategories]);

  // 根据搜索关键词过滤卡片项（窗口和组）
  const filteredCardItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return cardItems;
    }

    const query = searchQuery.toLowerCase().trim();
    return cardItems.filter((item) => {
      if (item.type === 'window') {
        const win = item.data;
        // 搜索窗口名称
        if (win.name.toLowerCase().includes(query)) {
          return true;
        }
        // 搜索窗口路径
        const panes = getAllPanes(win.layout);
        return panes.some((pane) => pane.cwd.toLowerCase().includes(query));
      } else {
        // 搜索组名称
        const group = item.data;
        if (group.name.toLowerCase().includes(query)) {
          return true;
        }

        // 搜索组内窗口的名称和路径
        const windowIds = getAllWindowIds(group.layout);
        const windowsInGroup = windows.filter(w => windowIds.includes(w.id));
        return windowsInGroup.some(win => {
          if (win.name.toLowerCase().includes(query)) return true;
          const panes = getAllPanes(win.layout);
          return panes.some(pane => pane.cwd.toLowerCase().includes(query));
        });
      }
    });
  }, [cardItems, searchQuery, windows]);

  const handleCardClick = useCallback(
    async (win: Window) => {
      await runWithWindowDirectory(win, async (targetWindow) => {
        onEnterTerminal?.(targetWindow);
      });
    },
    [onEnterTerminal, runWithWindowDirectory]
  );

  const startWindow = useCallback(async (win: Window) => {
    try {
      // 获取所有窗格
      const panes = getAllPanes(win.layout);

      // 先批量切到 Restoring，再并发启动所有窗格。
      for (const pane of panes) {
        updatePane(win.id, pane.id, { status: WindowStatus.Restoring });
      }

      await Promise.all(
        panes.map(async (pane) => {
          try {
            const response = await window.electronAPI.startWindow({
              windowId: win.id,
              paneId: pane.id,
              name: win.name,
              workingDirectory: pane.cwd,
              command: pane.command,
            });

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
            updatePane(win.id, pane.id, { status: WindowStatus.Paused });
          }
        })
      );
    } catch (error) {
      console.error('Failed to start window:', error);
      // 整体启动失败，恢复所有窗格为暂停状态
      const panes = getAllPanes(win.layout);
      for (const pane of panes) {
        updatePane(win.id, pane.id, { status: WindowStatus.Paused });
      }
    }
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

  const handleUnarchiveWindow = useCallback(async (win: Window) => {
    try {
      unarchiveWindow(win.id);
    } catch (error) {
      console.error('Failed to unarchive window:', error);
    }
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
        // TODO: 显示错误提示
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

  // ==================== 组相关操作处理函数 ====================

  const handleGroupClick = useCallback(
    async (group: WindowGroup) => {
      // TODO: 等待任务 #5 完成后实现组视图
      // 点击组卡片后，应该打开组视图（显示组内所有窗口的终端）
      onEnterGroup?.(group);
    },
    [onEnterGroup]
  );

  const handleStartAllWindows = useCallback(async (group: WindowGroup) => {
    try {
      // 从 group.layout 中提取所有 WindowNode
      const windowIds = getAllWindowIds(group.layout);

      // 获取对应的 Window 对象
      const windowsToStart = windows.filter(w => windowIds.includes(w.id));

      // 并发启动所有窗口
      await Promise.all(
        windowsToStart.map(async (win) => {
          await startWindow(win);
        })
      );
    } catch (error) {
      console.error('Failed to start all windows in group:', error);
    }
  }, [windows, startWindow]);

  const handlePauseAllWindows = useCallback(async (group: WindowGroup) => {
    try {
      // 从 group.layout 中提取所有 WindowNode
      const windowIds = getAllWindowIds(group.layout);

      // 获取对应的 Window 对象
      const windowsToPause = windows.filter(w => windowIds.includes(w.id));

      // 并发暂停所有窗口
      await Promise.all(
        windowsToPause.map(async (win) => {
          try {
            await window.electronAPI.closeWindow(win.id);
            pauseWindowState(win.id);
          } catch (error) {
            console.error(`Failed to pause window ${win.id}:`, error);
          }
        })
      );
    } catch (error) {
      console.error('Failed to pause all windows in group:', error);
    }
  }, [windows, pauseWindowState]);

  const handleArchiveGroup = useCallback(async (group: WindowGroup) => {
    try {
      // 先暂停组内所有窗口
      await handlePauseAllWindows(group);

      // 调用 archiveGroup 方法（会自动归档组内所有窗口）
      archiveGroup(group.id);
    } catch (error) {
      console.error('Failed to archive group:', error);
    }
  }, [archiveGroup, handlePauseAllWindows]);

  const handleUnarchiveGroup = useCallback(async (group: WindowGroup) => {
    try {
      // 调用 unarchiveGroup 方法（会自动取消归档组内所有窗口）
      unarchiveGroup(group.id);
    } catch (error) {
      console.error('Failed to unarchive group:', error);
    }
  }, [unarchiveGroup]);

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    try {
      // 删除组（不删除组内的窗口，只是解散组）
      removeGroup(groupId);
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  }, [removeGroup]);

  const handleEditGroup = useCallback((group: WindowGroup) => {
    setEditingGroup(group);
  }, []);

  const handleSaveGroupEdit = useCallback(async (groupId: string, updates: { name?: string }) => {
    try {
      // 调用 updateGroup 方法更新组名称
      updateGroup(groupId, updates);
    } catch (error) {
      console.error('Failed to update group:', error);
    }
  }, [updateGroup]);

  const handleCloseGroupEdit = useCallback(() => {
    setEditingGroup(null);
  }, []);

  // ==================== 拖拽处理 ====================

  const addGroup = useWindowStore((state) => state.addGroup);
  const findGroupByWindowId = useWindowStore((state) => state.findGroupByWindowId);

  /** 处理 WindowCard 拖拽到另一个 WindowCard 上 */
  const handleWindowCardDrop = useCallback(
    (dragItem: WindowCardDragItem, dropResult: DropResult) => {
      const { windowId: dragWindowId } = dragItem;
      const { targetWindowId } = dropResult;

      if (!targetWindowId || dragWindowId === targetWindowId) return;

      // 检查两个窗口是否已经在同一个组中
      const dragGroup = findGroupByWindowId(dragWindowId);
      const targetGroup = findGroupByWindowId(targetWindowId);
      if (dragGroup && targetGroup && dragGroup.id === targetGroup.id) return;

      // 两个独立窗口 → 创建新组
      if (!dragGroup && !targetGroup) {
        const dragWin = windows.find(w => w.id === dragWindowId);
        const targetWin = windows.find(w => w.id === targetWindowId);
        if (!dragWin || !targetWin) return;

        const direction = (dropResult.position === 'left' || dropResult.position === 'right')
          ? 'horizontal'
          : 'vertical';

        // 根据放置位置决定窗口顺序
        const isReversed = dropResult.position === 'left' || dropResult.position === 'top';
        const firstId = isReversed ? dragWindowId : targetWindowId;
        const secondId = isReversed ? targetWindowId : dragWindowId;

        const groupName = `${dragWin.name} + ${targetWin.name}`;
        const newGroup = createGroup(groupName, firstId, secondId, direction);
        addGroup(newGroup);
        return;
      }

      // TODO: 拖拽窗口到已有组中（等待 addWindowToGroupLayout 完善后实现）
      // 如果 targetGroup 存在，将 dragWindow 添加到该组
      // 如果 dragGroup 存在，将 dragWindow 从原组移出，添加到目标组或创建新组
    },
    [windows, findGroupByWindowId, addGroup]
  );

  // 是否为自定义分类标签
  const isCustomCategory = currentTab !== 'all' && currentTab !== 'active' && currentTab !== 'archived';

  // 自定义分类空状态
  if (isCustomCategory && cardItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <Folder size={48} className="mb-4 opacity-50" />
        <p className="text-lg">{t('category.emptyTitle')}</p>
        <p className="text-sm mt-2">{t('category.emptyHint')}</p>
      </div>
    );
  }

  // 归档标签空状态
  if (currentTab === 'archived' && cardItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <Archive size={48} className="mb-4 opacity-50" />
        <p className="text-lg">{t('archived.emptyTitle')}</p>
      </div>
    );
  }

  if (cardItems.length === 0) {
    return null;
  }

  return (
    <>
      <ScrollArea.Root className="h-full" data-testid="card-grid-scroll-root">
        <ScrollArea.Viewport className="h-full w-full">
          <div
            data-testid="card-grid"
            className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 p-8"
          >
            {filteredCardItems.map((item) => {
              if (item.type === 'window') {
                const win = item.data;
                return (
                  <DraggableWindowCard
                    key={`window-${win.id}`}
                    windowId={win.id}
                    windowName={win.name}
                    source="cardGrid"
                  >
                    <DropZone
                      targetWindowId={win.id}
                      onDrop={handleWindowCardDrop}
                    >
                      <WindowCard
                        window={win}
                        onClick={handleCardClick}
                        onOpenFolder={handleOpenFolder}
                        onDelete={handleDeleteWindow}
                        onStart={handleStartWindow}
                        onPause={handlePauseWindow}
                        onArchive={handleArchiveWindow}
                        onUnarchive={handleUnarchiveWindow}
                        onOpenInIDE={handleOpenInIDE}
                        onEdit={handleEditWindow}
                      />
                    </DropZone>
                  </DraggableWindowCard>
                );
              } else {
                const group = item.data;
                return (
                  <DraggableGroupCard
                    key={`group-${group.id}`}
                    groupId={group.id}
                    groupName={group.name}
                  >
                    <GroupCard
                      group={group}
                      onClick={handleGroupClick}
                      onDelete={handleDeleteGroup}
                      onStartAll={handleStartAllWindows}
                      onPauseAll={handlePauseAllWindows}
                      onArchive={handleArchiveGroup}
                      onUnarchive={handleUnarchiveGroup}
                      onEdit={handleEditGroup}
                    />
                  </DraggableGroupCard>
                );
              }
            })}
            {!searchQuery && <NewWindowCard onClick={onCreateWindow || (() => {})} />}
          </div>
          {/* 无搜索结果提示 */}
          {searchQuery && filteredCardItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <Search size={48} className="mb-4 opacity-50" />
              <p className="text-lg">{t('common.noMatchingWindows')}</p>
              <p className="text-sm mt-2">{t('common.tryDifferentSearch')}</p>
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

      <MissingWorkingDirectoryDialog {...dialogState} />

      {editingWindow && (
        <EditWindowPanel
          window={editingWindow}
          onClose={handleCloseEdit}
          onSave={handleSaveEdit}
        />
      )}

      {editingGroup && (
        <EditGroupPanel
          group={editingGroup}
          onClose={handleCloseGroupEdit}
          onSave={handleSaveGroupEdit}
        />
      )}

      {showCreateGroupDialog && (
        <CreateGroupDialog
          open={showCreateGroupDialog}
          onOpenChange={setShowCreateGroupDialog}
        />
      )}
    </>
  );
});

CardGrid.displayName = 'CardGrid';
