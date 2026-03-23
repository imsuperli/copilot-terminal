import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, SplitSquareHorizontal, SplitSquareVertical, Folder, Archive, Square, LogOut, SquareX, RotateCw, Play, Waypoints, FolderTree } from 'lucide-react';
import { Window, Pane, WindowStatus } from '../types/window';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { Sidebar } from './Sidebar';
import { QuickSwitcher } from './QuickSwitcher';
import { SplitLayout } from './SplitLayout';
import { SettingsPanel } from './SettingsPanel';
import { useWindowStore } from '../stores/windowStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { IDEIcon } from './icons/IDEIcons';
import { useIDESettings } from '../hooks/useIDESettings';
import { ProjectLinks } from './ProjectLinks';
import { useI18n } from '../i18n';
import { DropZone } from './dnd';
import type { WindowCardDragItem, DropResult } from './dnd';
import { createGroup } from '../utils/groupLayoutHelpers';
import { AppTooltip } from './ui/AppTooltip';
import { SSHPortForwardDialog } from './SSHPortForwardDialog';
import { SSHSftpDialog } from './SSHSftpDialog';
import { SSHSessionStatusBar } from './SSHSessionStatusBar';
import {
  canPaneOpenInIDE,
  canPaneOpenLocalFolder,
  canPaneWatchGitBranch,
  getPaneCapabilities,
} from '../../shared/utils/terminalCapabilities';
import {
  createPaneDraftFromSource,
  startSplitPaneFromSource,
  startWindowPanes,
} from '../utils/paneSessionActions';

export interface TerminalViewProps {
  window: Window;
  onReturn: () => void;
  onWindowSwitch: (windowId: string) => void;
  isActive: boolean;
  /** 嵌入模式：在 GroupView 中使用时隐藏侧边栏和返回按钮，但保留顶部工具栏 */
  embedded?: boolean;
  /** 所属组 ID（嵌入模式下传入） */
  groupId?: string;
  /** 从组中移除窗口的回调 */
  onRemoveFromGroup?: (windowId: string) => void;
  /** 停止并从组中移除窗口的回调 */
  onStopAndRemoveFromGroup?: (windowId: string) => void;
  /** 切换到指定组的回调 */
  onGroupSwitch?: (groupId: string) => void;
}

/**
 * TerminalView 缁勪欢
 * 鏀寔澶氱獥鏍兼媶鍒嗙殑缁堢瑙嗗浘
 */
export const TerminalView: React.FC<TerminalViewProps> = ({
  window: terminalWindow,
  onReturn,
  onWindowSwitch,
  isActive,
  embedded = false,
  groupId,
  onRemoveFromGroup,
  onStopAndRemoveFromGroup,
  onGroupSwitch,
}) => {
  const { t } = useI18n();
  const { enabledIDEs } = useIDESettings();
  const aggregatedStatus = useMemo(() => getAggregatedStatus(terminalWindow.layout), [terminalWindow.layout]);
  const panes = useMemo(() => getAllPanes(terminalWindow.layout), [terminalWindow.layout]);
  const activePane = useMemo(
    () => panes.find((pane) => pane.id === terminalWindow.activePaneId) ?? panes[0],
    [panes, terminalWindow.activePaneId]
  );
  const activePaneCapabilities = useMemo(
    () => activePane ? getPaneCapabilities(activePane) : null,
    [activePane]
  );
  const visibleIDEs = useMemo(
    () => activePaneCapabilities?.canOpenInIDE ? enabledIDEs : [],
    [activePaneCapabilities?.canOpenInIDE, enabledIDEs]
  );
  const isWindowRunning = aggregatedStatus === WindowStatus.Running || aggregatedStatus === WindowStatus.WaitingForInput;

  // 鍒囨崲闈㈡澘鐘舵€?
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [sshPortForwardTarget, setSSHPortForwardTarget] = useState<{ windowId: string; paneId: string } | null>(null);
  const [sshSftpOpen, setSSHSftpOpen] = useState(false);

  // Store
  const {
    toggleSidebar,
    getActiveWindows,
    splitPaneInWindow,
    closePaneInWindow,
    setActivePane,
    archiveWindow,
    updatePane,
    pauseWindowState,
    addGroup,
    setActiveGroup,
    findGroupByWindowId,
    addWindowToGroupLayout,
    removeWindowFromGroupLayout,
  } = useWindowStore();
  const activeWindows = getActiveWindows();
  const windows = useWindowStore((state) => state.windows);

  // 纭繚绐楀彛婵€娲绘椂锛屾縺娲荤涓€涓獥鏍?
  useEffect(() => {
    if (!isActive) return;

    const paneIds = panes.map(p => p.id);

    // 濡傛灉娌℃湁婵€娲荤殑绐楁牸锛屾垨婵€娲荤殑绐楁牸涓嶅湪褰撳墠绐楁牸鍒楄〃涓紝鍒欐縺娲荤涓€涓獥鏍?
    if (!terminalWindow.activePaneId || !paneIds.includes(terminalWindow.activePaneId)) {
      if (panes.length > 0) {
        setActivePane(terminalWindow.id, panes[0].id);
      }
    }

    // 绐楀彛婵€娲绘椂锛屽惎鍔?git 鍒嗘敮鐩戝惉
    const firstPane = panes[0];
    if (firstPane && firstPane.cwd && canPaneWatchGitBranch(firstPane) && window.electronAPI?.startGitWatch) {
      window.electronAPI.startGitWatch(terminalWindow.id, firstPane.cwd).catch((error: any) => {
        // 蹇界暐閿欒
      });
    }

    // 绐楀彛澶辨椿鏃讹紝鍋滄 git 鍒嗘敮鐩戝惉
    return () => {
      if (window.electronAPI?.stopGitWatch) {
        window.electronAPI.stopGitWatch(terminalWindow.id).catch((error: any) => {
          // 蹇界暐閿欒
        });
      }
    };
  }, [isActive, terminalWindow.activePaneId, terminalWindow.id, panes, setActivePane]);

  // 蹇嵎閿鐞?
  useKeyboardShortcuts({
    onCtrlTab: () => {
      setQuickSwitcherOpen(true);
    },
    onEscape: () => {
      // 鍙湁褰撻潰鏉挎墦寮€鏃舵墠澶勭悊 ESC 閿?
      if (quickSwitcherOpen) {
        setQuickSwitcherOpen(false);
        return true; // 琛ㄧず宸插鐞嗭紝闃绘浼犳挱鍒扮粓绔?
      }
      // 娌℃湁闈㈡澘鎵撳紑鏃讹紝杩斿洖 false锛岃 ESC 閿紶閫掑埌缁堢
      return false;
    },
    enabled: isActive,
  });

  // 澶勭悊绐楁牸婵€娲?
  const handlePaneActivate = useCallback(
    (paneId: string) => {
      setActivePane(terminalWindow.id, paneId);
    },
    [terminalWindow.id, setActivePane]
  );

  // 澶勭悊绐楁牸鍏抽棴
  const handlePaneClose = useCallback(
    (paneId: string) => {
      // 濡傛灉鍙湁涓€涓獥鏍硷紝涓嶅厑璁稿叧闂?
      if (panes.length <= 1) {
        return;
      }
      closePaneInWindow(terminalWindow.id, paneId);
    },
    [terminalWindow.id, panes.length, closePaneInWindow]
  );

  // 处理窗格进程退出
  const handlePaneExit = useCallback(
    (paneId: string) => {
      if (!terminalWindow) return;
      const currentPanes = getAllPanes(terminalWindow.layout);

      if (currentPanes.length <= 1) {
        // 单窗格窗口退出
        if (embedded && onStopAndRemoveFromGroup) {
          // 窗口组内：复用"停止并移除"逻辑
          onStopAndRemoveFromGroup(terminalWindow.id);
        } else {
          // 单窗口：停止进程 + 暂停窗口 + 返回主界面
          if (window.electronAPI) {
            window.electronAPI.closeWindow(terminalWindow.id).catch(console.error);
          }
          pauseWindowState(terminalWindow.id);
          if (window.electronAPI) {
            window.electronAPI.switchToUnifiedView().catch(console.error);
          }
        }
      } else {
        // 多窗格：复用关闭窗格逻辑
        closePaneInWindow(terminalWindow.id, paneId);
      }
    },
    [terminalWindow, embedded, onStopAndRemoveFromGroup, pauseWindowState, closePaneInWindow]
  );

  // 澶勭悊鎷嗗垎绐楁牸
  const handleSplitPane = useCallback(
    async (direction: 'horizontal' | 'vertical') => {
      const activePaneId = terminalWindow.activePaneId;
      if (!activePaneId) return;

      const { getPaneById } = useWindowStore.getState();
      const sourcePane = getPaneById(terminalWindow.id, activePaneId);
      if (!sourcePane) {
        return;
      }

      const newPaneId = uuidv4();
      const newPane: Pane = createPaneDraftFromSource(sourcePane, newPaneId);

      splitPaneInWindow(terminalWindow.id, activePaneId, direction, newPane);

      try {
        const response = await startSplitPaneFromSource({
          sourceWindowId: terminalWindow.id,
          sourcePane,
          targetWindowId: terminalWindow.id,
          targetPaneId: newPaneId,
        });

        const paneStillExists = useWindowStore.getState().getPaneById(terminalWindow.id, newPaneId);
        if (!paneStillExists) {
          await window.electronAPI.closePane(terminalWindow.id, newPaneId);
          return;
        }

        updatePane(terminalWindow.id, newPaneId, {
          pid: response.pid,
          sessionId: response.sessionId,
          status: response.status,
        });
      } catch (error) {
        console.error('Failed to split pane:', error);
        closePaneInWindow(terminalWindow.id, newPaneId, { syncProcess: false });
        return;
      }
    },
    [t, terminalWindow.id, terminalWindow.activePaneId, splitPaneInWindow, updatePane, closePaneInWindow]
  );

  // 澶勭悊鎵撳紑鏂囦欢澶?
  const handleOpenFolder = useCallback(async () => {
    try {
      if (activePane && canPaneOpenLocalFolder(activePane) && window.electronAPI) {
        await window.electronAPI.openFolder(activePane.cwd);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, [activePane]);

  // 澶勭悊鍦?IDE 涓墦寮€
  const handleOpenInIDE = useCallback(async (ide: string) => {
    try {
      if (activePane && canPaneOpenInIDE(activePane) && window.electronAPI) {
        const response = await window.electronAPI.openInIDE(ide, activePane.cwd);
        if (!response.success) {
          console.error(`Failed to open in ${ide}:`, response.error);
        }
      }
    } catch (error) {
      console.error(`Failed to open in ${ide}:`, error);
    }
  }, [activePane]);

  // 澶勭悊鏆傚仠绐楀彛
  const handlePauseWindow = useCallback(async () => {
    try {
      // 鍏抽棴绐楀彛锛堢粓姝㈡墍鏈?PTY 杩涚▼锛?
      await window.electronAPI.closeWindow(terminalWindow.id);

      pauseWindowState(terminalWindow.id);
    } catch (error) {
      console.error('Failed to pause window:', error);
    }
  }, [terminalWindow.id, pauseWindowState]);

  // 处理启动窗口
  const handleStartWindow = useCallback(async () => {
    await startWindowPanes(terminalWindow, updatePane);
  }, [terminalWindow.id, terminalWindow.name, terminalWindow.layout, updatePane]);

  const handleOpenSSHPortForwards = useCallback(() => {
    if (!activePane || !activePaneCapabilities?.canManagePortForwards) {
      return;
    }

    setSSHPortForwardTarget({
      windowId: terminalWindow.id,
      paneId: activePane.id,
    });
  }, [activePane, activePaneCapabilities, terminalWindow.id]);

  const handleOpenSSHSftp = useCallback(() => {
    if (!activePane || !activePaneCapabilities?.canOpenSFTP) {
      return;
    }

    setSSHSftpOpen((current) => !current);
  }, [activePane, activePaneCapabilities, terminalWindow.id]);

  useEffect(() => {
    if (sshSftpOpen && !activePaneCapabilities?.canOpenSFTP) {
      setSSHSftpOpen(false);
    }
  }, [activePaneCapabilities?.canOpenSFTP, sshSftpOpen]);

  // 处理重启窗口：先停止，再启动
  const handleRestartWindow = useCallback(async () => {
    await handlePauseWindow();
    await handleStartWindow();
  }, [handlePauseWindow, handleStartWindow]);

  // 澶勭悊褰掓。绐楀彛
  const handleArchiveWindow = useCallback(async () => {
    try {
      // 鑾峰彇鎵€鏈夋湭褰掓。鐨勭獥鍙?
      const { windows } = useWindowStore.getState();
      const activeWindows = windows.filter(w => !w.archived && w.id !== terminalWindow.id);

      // 鏌ユ壘绗竴涓瓑寰呰緭鍏ョ殑绐楀彛
      let targetWindow = activeWindows.find(w => {
        const windowPanes = getAllPanes(w.layout);
        return windowPanes.some(pane => pane.status === WindowStatus.WaitingForInput);
      });

      // 濡傛灉娌℃湁绛夊緟杈撳叆鐨勭獥鍙ｏ紝鎵剧涓€涓椿璺冪獥鍙?
      if (!targetWindow && activeWindows.length > 0) {
        targetWindow = activeWindows[0];
      }

      // 濡傛灉鎵惧埌浜嗙洰鏍囩獥鍙ｏ紝鍏堝垏鎹㈣繃鍘?
      if (targetWindow) {
        onWindowSwitch(targetWindow.id);

        // 绛夊緟鍒囨崲瀹屾垚鍚庡啀鍏抽棴鍜屽綊妗ｅ綋鍓嶇獥鍙?
        setTimeout(async () => {
          try {
            await window.electronAPI.closeWindow(terminalWindow.id);
            archiveWindow(terminalWindow.id);
          } catch (error) {
            console.error('Failed to close and archive window:', error);
          }
        }, 100);
      } else {
        // 娌℃湁鍏朵粬绐楀彛锛屽叧闂苟褰掓。鍚庤繑鍥炰富鐣岄潰
        await window.electronAPI.closeWindow(terminalWindow.id);
        archiveWindow(terminalWindow.id);
        onReturn();
      }
    } catch (error) {
      console.error('Failed to archive window:', error);
    }
  }, [terminalWindow.id, archiveWindow, onReturn, onWindowSwitch]);

  // 澶勭悊蹇€熷垏鎹?
  const handleQuickSwitcherSelect = useCallback(
    (windowId: string) => {
      setQuickSwitcherOpen(false);
      onWindowSwitch(windowId);
    },
    [onWindowSwitch]
  );

  // 处理快速切换到窗口组
  const handleQuickSwitcherSelectGroup = useCallback(
    (groupId: string) => {
      setQuickSwitcherOpen(false);
      if (onGroupSwitch) {
        onGroupSwitch(groupId);
      }
    },
    [onGroupSwitch]
  );

  // 处理拖拽窗口到终端区域创建或调整分组
  const handleWindowDrop = useCallback(
    async (dragItem: WindowCardDragItem, dropResult: DropResult) => {
      const dragWindowId = dragItem.windowId;
      const targetWindowId = terminalWindow.id;

      if (dragWindowId === targetWindowId) return;

      const dragGroup = findGroupByWindowId(dragWindowId);
      const targetGroup = findGroupByWindowId(targetWindowId);

      // 已在同一个组中，忽略
      if (dragGroup && targetGroup && dragGroup.id === targetGroup.id) return;

      const direction = (dropResult.position === 'left' || dropResult.position === 'right')
        ? 'horizontal'
        : 'vertical';

      // 如果拖拽的窗口在另一个组中，先从原组移除
      if (dragGroup) {
        removeWindowFromGroupLayout(dragGroup.id, dragWindowId);
      }

      if (targetGroup) {
        // 目标窗口已在组中 → 添加拖拽窗口到该组
        addWindowToGroupLayout(targetGroup.id, targetWindowId, dragWindowId, direction);
      } else {
        // 两个独立窗口 → 创建新组
        const dragWin = windows.find(w => w.id === dragWindowId);
        if (!dragWin) return;

        const isReversed = dropResult.position === 'left' || dropResult.position === 'top';
        const firstId = isReversed ? dragWindowId : targetWindowId;
        const secondId = isReversed ? targetWindowId : dragWindowId;

        const groupName = `${terminalWindow.name} + ${dragWin.name}`;
        const newGroup = createGroup(groupName, firstId, secondId, direction);
        addGroup(newGroup);
        setActiveGroup(newGroup.id);
        // 新组创建后 GroupView 的 auto-start useEffect 会自动启动窗口
        return;
      }

      // 自动启动拖入窗口的所有暂停窗格
      const dragWin = useWindowStore.getState().getWindowById(dragWindowId);
      if (dragWin) {
        const pausedPanes = getAllPanes(dragWin.layout).filter((pane) => pane.status === WindowStatus.Paused);
        if (pausedPanes.length > 0) {
          await startWindowPanes(dragWin, useWindowStore.getState().updatePane, pausedPanes);
        }
      }
    },
    [terminalWindow.id, terminalWindow.name, windows, findGroupByWindowId, addGroup, setActiveGroup, addWindowToGroupLayout, removeWindowFromGroupLayout]
  );

  return (
    <div className={`flex ${embedded ? 'h-full w-full' : 'h-screen w-screen'} bg-zinc-900 overflow-hidden`}>
      {/* 渚ц竟鏍?*/}
      {!embedded && (
        <Sidebar
          activeWindowId={terminalWindow.id}
          onWindowSelect={onWindowSwitch}
          onGroupSelect={onGroupSwitch}
          onSettingsClick={() => setIsSettingsPanelOpen(true)}
        />
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 - 在嵌入模式下也显示 */}
        <div className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between pl-1 pr-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* 返回按钮 - 仅在非嵌入模式显示 */}
            {!embedded && (
            <AppTooltip content={t('terminalView.return')} placement="toolbar-leading">
              <button
                onClick={onReturn}
                className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              >
                <ArrowLeft size={14} />
              </button>
            </AppTooltip>
            )}

            {/* 绐楀彛鍚嶇О鍜?git 鍒嗘敮 */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-100 font-medium text-sm">{terminalWindow.name}</span>
              {terminalWindow.gitBranch && (
                <span className="text-xs text-zinc-400 flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
                  </svg>
                  {terminalWindow.gitBranch}
                </span>
              )}
            </div>
          </div>

          {/* 鍙充晶鎸夐挳缁?*/}
          <div className="flex items-center gap-2">
            {/* 椤圭洰閾炬帴 */}
            {terminalWindow.projectConfig && terminalWindow.projectConfig.links.length > 0 && (
              <>
                <ProjectLinks
                  links={terminalWindow.projectConfig.links}
                  variant="toolbar"
                  maxDisplay={6}
                />
                {/* 鍒嗛殧绾?*/}
                <div className="w-px h-4 bg-zinc-700" />
              </>
            )}

            {/* 鍔ㄦ€佹覆鏌撳惎鐢ㄧ殑 IDE 鍥炬爣 */}
            {visibleIDEs.map((ide) => (
              <AppTooltip
                key={ide.id}
                content={t('common.openInIDE', { name: ide.name })}
                placement="toolbar-trailing"
              >
                <button
                  type="button"
                  aria-label={t('common.openInIDE', { name: ide.name })}
                  onClick={() => handleOpenInIDE(ide.id)}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                >
                  <IDEIcon icon={ide.icon || ''} size={14} />
                </button>
              </AppTooltip>
            ))}

            {/* 褰掓。鎸夐挳 */}
            <AppTooltip content={t('terminalView.archive')} placement="toolbar-trailing">
              <button
                type="button"
                aria-label={t('terminalView.archive')}
                onClick={handleArchiveWindow}
                className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              >
                <Archive size={14} />
              </button>
            </AppTooltip>

            {/* 鎵撳紑鏂囦欢澶规寜閽?*/}
            {activePaneCapabilities?.canOpenLocalFolder && (
              <AppTooltip content={t('terminalView.openFolder')} placement="toolbar-trailing">
                <button
                  type="button"
                  aria-label={t('terminalView.openFolder')}
                  onClick={handleOpenFolder}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                >
                  <Folder size={14} />
                </button>
              </AppTooltip>
            )}

            {activePaneCapabilities?.canOpenSFTP && (
              <AppTooltip content={t('terminalView.openSftp')} placement="toolbar-trailing">
                <button
                  type="button"
                  aria-label={t('terminalView.openSftp')}
                  onClick={handleOpenSSHSftp}
                  className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
                    sshSftpOpen
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                  }`}
                >
                  <FolderTree size={14} />
                </button>
              </AppTooltip>
            )}

            {activePaneCapabilities?.canManagePortForwards && (
              <AppTooltip content={t('terminalView.managePortForwards')} placement="toolbar-trailing">
                <button
                  type="button"
                  aria-label={t('terminalView.managePortForwards')}
                  onClick={handleOpenSSHPortForwards}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                >
                  <Waypoints size={14} />
                </button>
              </AppTooltip>
            )}

            {/* 宸﹀彸鎷嗗垎鎸夐挳 */}
            <AppTooltip content={t('terminalView.splitHorizontal')} placement="toolbar-trailing">
              <button
                type="button"
                aria-label={t('terminalView.splitHorizontal')}
                onClick={() => handleSplitPane('horizontal')}
                className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              >
                <SplitSquareHorizontal size={14} />
              </button>
            </AppTooltip>

            {/* 涓婁笅鎷嗗垎鎸夐挳 */}
            <AppTooltip content={t('terminalView.splitVertical')} placement="toolbar-trailing">
              <button
                type="button"
                aria-label={t('terminalView.splitVertical')}
                onClick={() => handleSplitPane('vertical')}
                className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              >
                <SplitSquareVertical size={14} />
              </button>
            </AppTooltip>

            {/* 鏆傚仠鎸夐挳 - 浠呭湪杩愯鎴栫瓑寰呰緭鍏ユ椂鏄剧ず */}
            {/* 嵌入模式（组内）：移除和停止并移除按钮 */}
            {embedded && groupId && (
              <>
                <AppTooltip
                  content={t('terminalView.removeFromGroup')}
                  delayDuration={200}
                  placement="toolbar-trailing"
                >
                  <button
                    type="button"
                    onClick={() => onRemoveFromGroup?.(terminalWindow.id)}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    <LogOut size={14} />
                  </button>
                </AppTooltip>

                <AppTooltip
                  content={t('terminalView.stopAndRemoveFromGroup')}
                  delayDuration={200}
                  placement="toolbar-trailing"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isWindowRunning) {
                        onStopAndRemoveFromGroup?.(terminalWindow.id);
                      }
                    }}
                    disabled={!isWindowRunning}
                    className={`flex items-center justify-center w-6 h-6 rounded bg-zinc-800 transition-colors ${
                      isWindowRunning
                        ? 'hover:bg-zinc-700 text-red-500 cursor-pointer'
                        : 'text-zinc-600 cursor-not-allowed'
                    }`}
                  >
                    <SquareX size={14} />
                  </button>
                </AppTooltip>
              </>
            )}

            {/* 停止按钮 - 仅在非嵌入模式且运行中时显示 */}
            {!embedded && isWindowRunning && (
              <AppTooltip content={t('terminalView.stop')} placement="toolbar-trailing">
                <button
                  type="button"
                  onClick={handlePauseWindow}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-red-500 transition-colors"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              </AppTooltip>
            )}

            {/* 重启/启动按钮 - 非嵌入模式下始终显示 */}
            {!embedded && (
              <AppTooltip
                content={isWindowRunning ? t('terminalView.restart') : t('terminalView.start')}
                placement="toolbar-trailing"
              >
                <button
                  type="button"
                  onClick={isWindowRunning ? handleRestartWindow : handleStartWindow}
                  className={`flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors ${
                    isWindowRunning ? 'text-yellow-500' : 'text-green-500'
                  }`}
                >
                  {isWindowRunning ? <RotateCw size={14} /> : <Play size={14} fill="currentColor" />}
                </button>
              </AppTooltip>
            )}
          </div>
        </div>
        {/* 缁堢甯冨眬鍖哄煙 */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SSHSftpDialog
            open={sshSftpOpen && Boolean(activePaneCapabilities?.canOpenSFTP)}
            onOpenChange={setSSHSftpOpen}
            windowId={activePaneCapabilities?.canOpenSFTP ? terminalWindow.id : null}
            paneId={activePaneCapabilities?.canOpenSFTP ? activePane?.id ?? null : null}
            initialPath={activePane?.ssh?.remoteCwd ?? activePane?.cwd ?? null}
            currentCwd={activePane?.ssh?.remoteCwd ?? activePane?.cwd ?? null}
          />

          <div className="min-w-0 flex-1 overflow-hidden">
            {embedded ? (
              <SplitLayout
                windowId={terminalWindow.id}
                layout={terminalWindow.layout}
                activePaneId={terminalWindow.activePaneId}
                isWindowActive={isActive}
                onPaneActivate={handlePaneActivate}
                onPaneClose={handlePaneClose}
                onPaneExit={handlePaneExit}
              />
            ) : (
              <DropZone
                targetWindowId={terminalWindow.id}
                onDrop={handleWindowDrop}
                className="h-full w-full"
              >
                <SplitLayout
                  windowId={terminalWindow.id}
                  layout={terminalWindow.layout}
                  activePaneId={terminalWindow.activePaneId}
                  isWindowActive={isActive}
                  onPaneActivate={handlePaneActivate}
                  onPaneClose={handlePaneClose}
                  onPaneExit={handlePaneExit}
                />
              </DropZone>
            )}
          </div>
        </div>

        {activePaneCapabilities?.canOpenSFTP && (
          <SSHSessionStatusBar
            windowId={terminalWindow.id}
            paneId={activePane?.id ?? null}
            currentCwd={activePane?.ssh?.remoteCwd ?? activePane?.cwd ?? null}
          />
        )}
      </div>

      {!embedded && (<>
      {/* 蹇€熷垏鎹㈤潰鏉?*/}
      {quickSwitcherOpen && (
        <QuickSwitcher
          isOpen={quickSwitcherOpen}
          currentWindowId={terminalWindow.id}
          onSelect={handleQuickSwitcherSelect}
          onSelectGroup={handleQuickSwitcherSelectGroup}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      )}

      {/* 设置面板 */}
      <SettingsPanel
        open={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
      />
      </>)}

      <SSHPortForwardDialog
        open={Boolean(sshPortForwardTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSSHPortForwardTarget(null);
          }
        }}
        windowId={sshPortForwardTarget?.windowId ?? null}
        paneId={sshPortForwardTarget?.paneId ?? null}
      />
    </div>
  );
};

TerminalView.displayName = 'TerminalView';
