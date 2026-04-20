import React, { Suspense, lazy, useCallback, useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Play, Square, Archive } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { GroupSplitLayout } from './GroupSplitLayout';
import { Sidebar } from './Sidebar';
import { WindowGroup } from '../../shared/types/window-group';
import { Pane, Window, WindowStatus } from '../types/window';
import { getAllWindowIds } from '../utils/groupLayoutHelpers';
import { getAggregatedStatusFromPanes, getAllPanes } from '../utils/layoutHelpers';
import type { WindowCardDragItem, DropResult } from './dnd';
import { AppTooltip } from './ui/AppTooltip';
import { startWindowPanes } from '../utils/paneSessionActions';
import type { SSHProfile } from '../../shared/types/ssh';
import { getOwnedEphemeralSSHWindowIds, isEphemeralSSHCloneWindow } from '../utils/sshWindowBindings';

const LazyQuickSwitcher = lazy(async () => ({
  default: (await import('./QuickSwitcher')).QuickSwitcher,
}));

const LazySettingsPanel = lazy(async () => ({
  default: (await import('./SettingsPanel')).SettingsPanel,
}));

function getPausedPanes(panes: Pane[]): Pane[] {
  return panes.filter((pane) => pane.status === WindowStatus.Paused);
}

export interface GroupViewProps {
  group: WindowGroup;
  onReturn: () => void;
  onWindowSwitch: (windowId: string) => void;
  onGroupSwitch?: (groupId: string) => void;
  isActive: boolean;
  sshProfiles?: SSHProfile[];
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
  sshProfiles = [],
}) => {
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [hasMountedSettingsPanel, setHasMountedSettingsPanel] = useState(false);

  const setActiveWindowInGroup = useWindowStore((state) => state.setActiveWindowInGroup);
  const archiveGroup = useWindowStore((state) => state.archiveGroup);
  const addWindowToGroupLayout = useWindowStore((state) => state.addWindowToGroupLayout);
  const removeWindowFromGroupLayout = useWindowStore((state) => state.removeWindowFromGroupLayout);
  const rearrangeWindowInGroupLayout = useWindowStore((state) => state.rearrangeWindowInGroupLayout);
  const findGroupByWindowId = useWindowStore((state) => state.findGroupByWindowId);

  const groupWindowIds = useMemo(
    () => getAllWindowIds(group.layout),
    [group.layout],
  );
  const groupWindowIdSet = useMemo(
    () => new Set(groupWindowIds),
    [groupWindowIds],
  );
  const groupWindows = useWindowStore(useShallow(
    (state) => state.windows.filter((window) => groupWindowIdSet.has(window.id)),
  ));
  const groupWindowRuntime = useMemo(() => {
    const windowById = new Map<string, Window>();
    const pausedPanesByWindowId = new Map<string, Pane[]>();
    const statusByWindowId = new Map<string, WindowStatus>();
    let hasRunning = false;
    let hasWaitingForInput = false;
    let hasPaused = false;

    for (const terminalWindow of groupWindows) {
      windowById.set(terminalWindow.id, terminalWindow);

      const panes = getAllPanes(terminalWindow.layout);
      const status = getAggregatedStatusFromPanes(panes);
      statusByWindowId.set(terminalWindow.id, status);

      const pausedPanes = getPausedPanes(panes);
      if (pausedPanes.length > 0) {
        pausedPanesByWindowId.set(terminalWindow.id, pausedPanes);
      }

      hasRunning ||= status === WindowStatus.Running;
      hasWaitingForInput ||= status === WindowStatus.WaitingForInput;
      hasPaused ||= status === WindowStatus.Paused;
    }

    const aggregatedStatus = hasRunning
      ? WindowStatus.Running
      : hasWaitingForInput
        ? WindowStatus.WaitingForInput
        : hasPaused
          ? WindowStatus.Paused
          : WindowStatus.Paused;

    return {
      windowById,
      pausedPanesByWindowId,
      statusByWindowId,
      aggregatedStatus,
    };
  }, [groupWindows]);
  const groupAggregatedStatus = groupWindowRuntime.aggregatedStatus;
  const groupPausedPanesByWindowId = groupWindowRuntime.pausedPanesByWindowId;
  const groupStatusByWindowId = groupWindowRuntime.statusByWindowId;
  const groupWindowById = groupWindowRuntime.windowById;

  const startPausedPanesForWindow = useCallback(
    async (targetWindow: Window, pausedPanes: Pane[]) => {
      if (pausedPanes.length > 0) {
        await startWindowPanes(targetWindow, useWindowStore.getState().updatePane, pausedPanes);
      }
    },
    [],
  );

  // 自动启动组内所有暂停的窗口
  useEffect(() => {
    const autoStartWindows = async () => {
      for (const win of groupWindows) {
        await startPausedPanesForWindow(win, groupPausedPanesByWindowId.get(win.id) ?? []);
      }
    };

    // 只在组视图激活时自动启动
    if (isActive && groupWindows.length > 0) {
      autoStartWindows();
    }
  }, [group.id, isActive]); // 保持原来的依赖项，避免无限循环

  // 快捷键
  useKeyboardShortcuts({
    onCtrlTab: () => {
      setQuickSwitcherOpen(true);
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

  const destroyWindowIds = useCallback(async (windowIds: string[]) => {
    const { removeWindow } = useWindowStore.getState();

    for (const windowId of windowIds) {
      await window.electronAPI.closeWindow(windowId);
      await window.electronAPI.deleteWindow(windowId);
      removeWindow(windowId);
    }
  }, []);

  const destroyOwnedEphemeralWindows = useCallback(async (windowId: string) => {
    const ownedWindowIds = getOwnedEphemeralSSHWindowIds(useWindowStore.getState().windows, windowId);
    if (ownedWindowIds.length > 0) {
      await destroyWindowIds(ownedWindowIds);
    }
  }, [destroyWindowIds]);

  // 处理快速切换器选择
  const handleQuickSwitcherSelect = useCallback(
    (windowId: string) => {
      setQuickSwitcherOpen(false);
      // 检查窗口是否在当前组内
      if (groupWindowIdSet.has(windowId)) {
        setActiveWindowInGroup(group.id, windowId);
      } else {
        onWindowSwitch(windowId);
      }
    },
    [group.id, groupWindowIdSet, setActiveWindowInGroup, onWindowSwitch]
  );

  // 处理快速切换器选择窗口组
  const handleQuickSwitcherSelectGroup = useCallback(
    (groupId: string) => {
      setQuickSwitcherOpen(false);
      if (groupId !== group.id) {
        onGroupSwitch?.(groupId);
      }
    },
    [group.id, onGroupSwitch]
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
      const isInternalDrag = groupWindowIdSet.has(dragWindowId);

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
          await startPausedPanesForWindow(dragWin, getPausedPanes(getAllPanes(dragWin.layout)));
        }
      }
    },
    [addWindowToGroupLayout, findGroupByWindowId, group.id, groupWindowIdSet, rearrangeWindowInGroupLayout, removeWindowFromGroupLayout, startPausedPanesForWindow]
  );

  // 从组中移除窗口（保持运行）
  const handleRemoveFromGroup = useCallback(async (windowId: string) => {
    // 获取移除前的窗口列表
    const windowIdsBeforeRemove = groupWindowIds;

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
  }, [group.id, groupWindowIds, removeWindowFromGroupLayout, onWindowSwitch, onReturn]);

  // 停止窗口并从组中移除
  const handleStopAndRemoveFromGroup = useCallback(async (windowId: string) => {
    // 获取移除前的窗口列表
    const windowIdsBeforeRemove = groupWindowIds;
    const targetWindow = groupWindowById.get(windowId) ?? null;

    try {
      if (targetWindow && isEphemeralSSHCloneWindow(targetWindow)) {
        await destroyWindowIds([windowId]);
      } else {
        await destroyOwnedEphemeralWindows(windowId);
        await window.electronAPI.closeWindow(windowId);
        const { pauseWindowState } = useWindowStore.getState();
        pauseWindowState(windowId);
      }
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
  }, [destroyOwnedEphemeralWindows, destroyWindowIds, group.id, groupWindowById, groupWindowIds, onReturn, onWindowSwitch, removeWindowFromGroupLayout]);

  // 批量启动组内所有窗口
  const handleStartAll = useCallback(async () => {
    for (const win of groupWindows) {
      await startPausedPanesForWindow(win, groupPausedPanesByWindowId.get(win.id) ?? []);
    }
  }, [groupPausedPanesByWindowId, groupWindows, startPausedPanesForWindow]);

  // 批量暂停组内所有窗口
  const handlePauseAll = useCallback(async () => {
    const { pauseWindowState } = useWindowStore.getState();
    for (const win of groupWindows) {
      const status = groupStatusByWindowId.get(win.id) ?? WindowStatus.Paused;
      if (status === WindowStatus.Running || status === WindowStatus.WaitingForInput) {
        try {
          if (isEphemeralSSHCloneWindow(win as Window)) {
            await destroyWindowIds([win.id]);
          } else {
            await destroyOwnedEphemeralWindows(win.id);
            await window.electronAPI.closeWindow(win.id);
            pauseWindowState(win.id);
          }
        } catch (error) {
          console.error(`Failed to pause window ${win.id}:`, error);
        }
      }
    }
  }, [destroyOwnedEphemeralWindows, destroyWindowIds, groupStatusByWindowId, groupWindows]);

  const handleSidebarWindowSelect = useCallback((windowId: string) => {
    if (groupWindowIdSet.has(windowId)) {
      setActiveWindowInGroup(group.id, windowId);
    } else {
      onWindowSwitch(windowId);
    }
  }, [group.id, groupWindowIdSet, onWindowSwitch, setActiveWindowInGroup]);

  const handleSidebarGroupSelect = useCallback((groupId: string) => {
    onGroupSwitch?.(groupId);
  }, [onGroupSwitch]);

  const handleSettingsClick = useCallback(() => {
    setHasMountedSettingsPanel(true);
    setIsSettingsPanelOpen(true);
  }, []);

  // 状态颜色
  const statusColor = groupAggregatedStatus === WindowStatus.Running
    ? 'bg-green-500'
    : groupAggregatedStatus === WindowStatus.WaitingForInput
      ? 'bg-[rgb(var(--primary))]'
      : 'bg-[rgb(var(--muted-foreground))]';
  const toolbarButtonBaseClassName =
    'flex h-6 w-6 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_78%,transparent)] transition-colors';

  return (
    <div className="flex h-full bg-transparent">
      {/* 侧边栏 */}
      <Sidebar
        activeWindowId={group.activeWindowId}
        activeGroupId={group.id}
        onWindowSelect={handleSidebarWindowSelect}
        onGroupSelect={handleSidebarGroupSelect}
        onSettingsClick={handleSettingsClick}
      />

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
        {/* 顶部工具栏 */}
        <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_72%,transparent)] px-3">
          <div className="flex-1" />

          {/* 批量操作按钮 */}
          <div className="flex items-center gap-1">
            {/* 启动全部 */}
            <AppTooltip content="启动全部" placement="toolbar-trailing">
              <button
                onClick={handleStartAll}
                className={`${toolbarButtonBaseClassName} text-emerald-400 hover:border-emerald-400/45 hover:bg-emerald-500/[0.12] hover:text-emerald-300`}
              >
                <Play size={14} fill="currentColor" />
              </button>
            </AppTooltip>

            {/* 暂停全部 - 始终显示，根据状态改变颜色和禁用状态 */}
            <AppTooltip
              content={groupAggregatedStatus === WindowStatus.Running || groupAggregatedStatus === WindowStatus.WaitingForInput
                ? '暂停全部'
                : '窗口未运行'}
              delayDuration={200}
              placement="toolbar-trailing"
            >
              <button
                onClick={handlePauseAll}
                disabled={groupAggregatedStatus !== WindowStatus.Running && groupAggregatedStatus !== WindowStatus.WaitingForInput}
                className={`${toolbarButtonBaseClassName} ${
                  groupAggregatedStatus === WindowStatus.Running || groupAggregatedStatus === WindowStatus.WaitingForInput
                    ? 'cursor-pointer text-red-400 hover:border-red-400/45 hover:bg-red-500/[0.12] hover:text-red-300'
                    : 'cursor-not-allowed text-[rgb(var(--muted-foreground))] opacity-50'
                }`}
              >
                <Square size={14} fill="currentColor" />
              </button>
            </AppTooltip>

            {/* 归档组 */}
            <AppTooltip content="归档组" placement="toolbar-trailing">
              <button
                onClick={handleArchiveGroup}
                className={`${toolbarButtonBaseClassName} text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]`}
              >
                <Archive size={14} />
              </button>
            </AppTooltip>
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
        <Suspense fallback={null}>
          <LazyQuickSwitcher
            isOpen={quickSwitcherOpen}
            currentWindowId={group.activeWindowId}
            currentGroupId={group.id}
            sshProfiles={sshProfiles}
            onSelect={handleQuickSwitcherSelect}
            onSelectGroup={handleQuickSwitcherSelectGroup}
            onClose={() => setQuickSwitcherOpen(false)}
          />
        </Suspense>
      )}

      {/* 设置面板 */}
      {hasMountedSettingsPanel && (
        <Suspense fallback={null}>
          <LazySettingsPanel
            open={isSettingsPanelOpen}
            onClose={() => setIsSettingsPanelOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

GroupView.displayName = 'GroupView';
