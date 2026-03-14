import React, { useCallback, useState, useEffect, useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ArrowLeft, FolderOpen, Play, Square, Archive } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { GroupSplitLayout } from './GroupSplitLayout';
import { QuickSwitcher } from './QuickSwitcher';
import { SettingsPanel } from './SettingsPanel';
import { Sidebar } from './Sidebar';
import { WindowGroup } from '../../shared/types/window-group';
import { WindowStatus } from '../types/window';
import { getAllWindowIds, getWindowCount } from '../utils/groupLayoutHelpers';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import type { WindowCardDragItem, DropResult } from './dnd';

export interface GroupViewProps {
  group: WindowGroup;
  onReturn: () => void;
  onWindowSwitch: (windowId: string) => void;
  onGroupSwitch?: (groupId: string) => void;
  isActive: boolean;
}

/**
 * GroupView 组件
 * 组终端视图，显示组内多个窗口的并排布局
 */
export const GroupView: React.FC<GroupViewProps> = ({
  group,
  onReturn,
  onWindowSwitch,
  onGroupSwitch,
  isActive,
}) => {
  const { t } = useI18n();
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);

  const {
    windows,
    toggleSidebar,
    getActiveWindows,
    setActiveWindowInGroup,
    archiveGroup,
    getWindowsInGroup,
    addWindowToGroupLayout,
    removeWindowFromGroupLayout,
    rearrangeWindowInGroupLayout,
    findGroupByWindowId,
  } = useWindowStore();

  const activeWindows = getActiveWindows();
  const groupWindows = useMemo(() => getWindowsInGroup(group.id), [group.id, windows]);
  const windowCount = getWindowCount(group.layout);

  // 自动启动组内所有暂停的窗口
  useEffect(() => {
    const autoStartWindows = async () => {
      for (const win of groupWindows) {
        const panes = getAllPanes(win.layout);
        for (const pane of panes) {
          if (pane.status === WindowStatus.Paused) {
            try {
              await window.electronAPI.startWindow({
                windowId: win.id,
                paneId: pane.id,
                name: win.name,
                workingDirectory: pane.cwd,
                command: pane.command,
              });
            } catch (error) {
              console.error(`Failed to auto-start pane ${pane.id} in window ${win.id}:`, error);
            }
          }
        }
      }
    };

    // 只在组视图激活时自动启动
    if (isActive && groupWindows.length > 0) {
      autoStartWindows();
    }
  }, [group.id, isActive]); // 保持原来的依赖项，避免无限循环

  // 计算组的聚合状态
  const groupAggregatedStatus = useMemo(() => {
    const statuses = groupWindows.map(w => getAggregatedStatus(w.layout));

    if (statuses.includes(WindowStatus.Running)) return WindowStatus.Running;
    if (statuses.includes(WindowStatus.WaitingForInput)) return WindowStatus.WaitingForInput;
    if (statuses.includes(WindowStatus.Paused)) return WindowStatus.Paused;
    return WindowStatus.Paused;
  }, [groupWindows, group.id]);

  // 快捷键
  useKeyboardShortcuts({
    onCtrlTab: () => {
      setQuickSwitcherOpen(true);
    },
    onCtrlB: () => {
      toggleSidebar();
    },
    onCtrlNumber: (num) => {
      if (num > 0 && num <= activeWindows.length) {
        const targetWindow = activeWindows[num - 1];
        if (targetWindow) {
          onWindowSwitch(targetWindow.id);
        }
      }
    },
    onEscape: () => {
      if (quickSwitcherOpen) {
        setQuickSwitcherOpen(false);
        return true;
      }
      return false;
    },
    enabled: isActive,
  });

  // 处理组内窗口激活
  const handleWindowActivate = useCallback(
    (windowId: string) => {
      setActiveWindowInGroup(group.id, windowId);
    },
    [group.id, setActiveWindowInGroup]
  );

  // 处理快速切换器选择
  const handleQuickSwitcherSelect = useCallback(
    (windowId: string) => {
      setQuickSwitcherOpen(false);
      // 检查窗口是否在当前组内
      const windowIds = getAllWindowIds(group.layout);
      if (windowIds.includes(windowId)) {
        setActiveWindowInGroup(group.id, windowId);
      } else {
        onWindowSwitch(windowId);
      }
    },
    [group.id, group.layout, setActiveWindowInGroup, onWindowSwitch]
  );

  // 处理归档组
  const handleArchiveGroup = useCallback(() => {
    archiveGroup(group.id);
    onReturn();
  }, [group.id, archiveGroup, onReturn]);

  // 处理拖拽窗口到组内
  const handleWindowDrop = useCallback(
    async (dragItem: WindowCardDragItem, dropResult: DropResult) => {
      const dragWindowId = dragItem.windowId;
      const targetWindowId = dropResult.targetWindowId;

      if (!targetWindowId || dragWindowId === targetWindowId) return;

      // 检查拖拽的窗口是否已经在当前组中
      const windowIdsInGroup = getAllWindowIds(group.layout);
      const isInternalDrag = windowIdsInGroup.includes(dragWindowId);

      if (isInternalDrag) {
        // 组内拖拽：使用原子操作重新排列窗口（避免中间状态触发解散）
        const direction = (dropResult.position === 'left' || dropResult.position === 'right')
          ? 'horizontal'
          : 'vertical';
        const insertBefore = dropResult.position === 'left' || dropResult.position === 'top';

        rearrangeWindowInGroupLayout(group.id, dragWindowId, targetWindowId, direction, insertBefore);
      } else {
        // 跨组或从主界面拖入：添加新窗口到组
        // 如果拖拽的窗口在另一个组中，先从原组移除
        const sourceGroup = findGroupByWindowId(dragWindowId);
        if (sourceGroup) {
          removeWindowFromGroupLayout(sourceGroup.id, dragWindowId);
        }

        // 确定分割方向
        const direction = (dropResult.position === 'left' || dropResult.position === 'right')
          ? 'horizontal'
          : 'vertical';

        // 添加窗口到当前组
        addWindowToGroupLayout(group.id, targetWindowId, dragWindowId, direction);

        // 自动启动拖入窗口的所有暂停窗格
        const dragWin = useWindowStore.getState().getWindowById(dragWindowId);
        if (dragWin) {
          const panes = getAllPanes(dragWin.layout);
          for (const pane of panes) {
            if (pane.status === WindowStatus.Paused) {
              try {
                await window.electronAPI.startWindow({
                  windowId: dragWin.id,
                  paneId: pane.id,
                  name: dragWin.name,
                  workingDirectory: pane.cwd,
                  command: pane.command,
                });
              } catch (error) {
                console.error(`Failed to auto-start pane ${pane.id}:`, error);
              }
            }
          }
        }
      }
    },
    [group.id, group.layout, findGroupByWindowId, addWindowToGroupLayout, removeWindowFromGroupLayout, rearrangeWindowInGroupLayout]
  );

  // 从组中移除窗口（保持运行）
  const handleRemoveFromGroup = useCallback(async (windowId: string) => {
    // 获取移除前的窗口列表
    const windowIdsBeforeRemove = getAllWindowIds(group.layout);

    // 移除窗口
    removeWindowFromGroupLayout(group.id, windowId);

    // 检查分组是否被解散（窗口数 < 2）
    setTimeout(() => {
      const { getGroupById } = useWindowStore.getState();
      const currentGroup = getGroupById(group.id);

      if (!currentGroup) {
        // 分组已被解散，跳转到剩余的窗口
        const remainingWindowId = windowIdsBeforeRemove.find(id => id !== windowId);
        if (remainingWindowId) {
          onWindowSwitch(remainingWindowId);
        } else {
          // 没有剩余窗口，返回主界面
          onReturn();
        }
      }
    }, 0);
  }, [group.id, group.layout, removeWindowFromGroupLayout, onWindowSwitch, onReturn]);

  // 停止窗口并从组中移除
  const handleStopAndRemoveFromGroup = useCallback(async (windowId: string) => {
    // 获取移除前的窗口列表
    const windowIdsBeforeRemove = getAllWindowIds(group.layout);

    try {
      await window.electronAPI.closeWindow(windowId);
      const { pauseWindowState } = useWindowStore.getState();
      pauseWindowState(windowId);
    } catch (error) {
      console.error('Failed to stop window:', error);
    }

    // 移除窗口
    removeWindowFromGroupLayout(group.id, windowId);

    // 检查分组是否被解散（窗口数 < 2）
    setTimeout(() => {
      const { getGroupById } = useWindowStore.getState();
      const currentGroup = getGroupById(group.id);

      if (!currentGroup) {
        // 分组已被解散，跳转到剩余的窗口
        const remainingWindowId = windowIdsBeforeRemove.find(id => id !== windowId);
        if (remainingWindowId) {
          onWindowSwitch(remainingWindowId);
        } else {
          // 没有剩余窗口，返回主界面
          onReturn();
        }
      }
    }, 0);
  }, [group.id, group.layout, removeWindowFromGroupLayout, onWindowSwitch, onReturn]);

  // 批量启动组内所有窗口
  const handleStartAll = useCallback(async () => {
    for (const win of groupWindows) {
      const status = getAggregatedStatus(win.layout);
      if (status === WindowStatus.Paused) {
        try {
          const firstPane = getAllPanes(win.layout)[0];
          if (firstPane) {
            await window.electronAPI.startWindow({
              windowId: win.id,
              paneId: firstPane.id,
              name: win.name,
              workingDirectory: firstPane.cwd,
              command: firstPane.command,
            });
          }
        } catch (error) {
          console.error(`Failed to start window ${win.id}:`, error);
        }
      }
    }
  }, [groupWindows]);

  // 批量暂停组内所有窗口
  const handlePauseAll = useCallback(async () => {
    const { pauseWindowState } = useWindowStore.getState();
    for (const win of groupWindows) {
      const status = getAggregatedStatus(win.layout);
      if (status === WindowStatus.Running || status === WindowStatus.WaitingForInput) {
        try {
          await window.electronAPI.closeWindow(win.id);
          pauseWindowState(win.id);
        } catch (error) {
          console.error(`Failed to pause window ${win.id}:`, error);
        }
      }
    }
  }, [groupWindows]);

  // 状态颜色
  const statusColor = groupAggregatedStatus === WindowStatus.Running
    ? 'bg-green-500'
    : groupAggregatedStatus === WindowStatus.WaitingForInput
      ? 'bg-blue-500'
      : 'bg-zinc-500';

  return (
    <div className="flex h-screen bg-zinc-900">
      {/* 侧边栏 */}
      <Sidebar
        activeWindowId={group.activeWindowId}
        activeGroupId={group.id}
        onWindowSelect={(windowId) => {
          const windowIds = getAllWindowIds(group.layout);
          if (windowIds.includes(windowId)) {
            setActiveWindowInGroup(group.id, windowId);
          } else {
            onWindowSwitch(windowId);
          }
        }}
        onGroupSelect={(groupId) => {
          if (groupId === group.id) {
            // 点击当前组，不做任何操作
            return;
          }
          // 切换到其他组
          onGroupSwitch?.(groupId);
        }}
        onSettingsClick={() => setIsSettingsPanelOpen(true)}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-3 gap-2 flex-shrink-0">
          {/* 返回按钮 */}
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={onReturn}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  <ArrowLeft size={14} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                  sideOffset={5}
                >
                  返回
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>

          {/* 组状态指示器 */}
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />

          {/* 组名称 */}
          <div className="flex items-center gap-1.5">
            <FolderOpen size={14} className="text-zinc-400" />
            <span className="text-sm font-medium text-zinc-100 truncate max-w-[200px]">
              {group.name}
            </span>
            <span className="text-xs text-zinc-500">
              ({windowCount} 个窗口)
            </span>
          </div>

          <div className="flex-1" />

          {/* 批量操作按钮 */}
          <div className="flex items-center gap-1">
            {/* 启动全部 */}
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={handleStartAll}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-green-500 transition-colors"
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                    sideOffset={5}
                  >
                    启动全部
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>

            {/* 暂停全部 - 始终显示，根据状态改变颜色和禁用状态 */}
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={200}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={handlePauseAll}
                    disabled={groupAggregatedStatus !== WindowStatus.Running && groupAggregatedStatus !== WindowStatus.WaitingForInput}
                    className={`flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors ${
                      groupAggregatedStatus === WindowStatus.Running || groupAggregatedStatus === WindowStatus.WaitingForInput
                        ? 'text-red-500 cursor-pointer'
                        : 'text-zinc-600 cursor-not-allowed opacity-50'
                    }`}
                    title={groupAggregatedStatus === WindowStatus.Running || groupAggregatedStatus === WindowStatus.WaitingForInput ? '暂停全部' : '窗口未运行'}
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                    sideOffset={5}
                  >
                    {groupAggregatedStatus === WindowStatus.Running || groupAggregatedStatus === WindowStatus.WaitingForInput
                      ? '暂停全部'
                      : '窗口未运行'}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>

            {/* 归档组 */}
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={handleArchiveGroup}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    <Archive size={14} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                    sideOffset={5}
                  >
                    归档组
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
        </div>

        {/* 组布局区域 */}
        <div className="flex-1 overflow-hidden">
          <GroupSplitLayout
            groupId={group.id}
            layout={group.layout}
            activeWindowId={group.activeWindowId}
            isGroupActive={isActive}
            onWindowActivate={handleWindowActivate}
            onWindowSwitch={onWindowSwitch}
            onReturn={onReturn}
            onWindowDrop={handleWindowDrop}
            onRemoveFromGroup={handleRemoveFromGroup}
            onStopAndRemoveFromGroup={handleStopAndRemoveFromGroup}
          />
        </div>
      </div>

      {/* 快速切换面板 */}
      {quickSwitcherOpen && (
        <QuickSwitcher
          isOpen={quickSwitcherOpen}
          currentWindowId={group.activeWindowId}
          onSelect={handleQuickSwitcherSelect}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      )}

      {/* 设置面板 */}
      <SettingsPanel
        open={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
      />
    </div>
  );
};

GroupView.displayName = 'GroupView';
