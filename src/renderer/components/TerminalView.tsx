import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ArrowLeft, SplitSquareHorizontal, SplitSquareVertical, Folder, Archive, Pause } from 'lucide-react';
import { Window, Pane, WindowStatus } from '../types/window';
import { getAggregatedStatus, getPaneCount, getAllPanes } from '../utils/layoutHelpers';
import { getStatusLabel, getStatusTextColor } from '../utils/statusHelpers';
import { Sidebar } from './Sidebar';
import { QuickSwitcher } from './QuickSwitcher';
import { SplitLayout } from './SplitLayout';
import { StatusDot } from './StatusDot';
import { useWindowStore } from '../stores/windowStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { IDEIcon } from './icons/IDEIcons';
import { useIDESettings } from '../hooks/useIDESettings';

export interface TerminalViewProps {
  window: Window;
  onReturn: () => void;
  onWindowSwitch: (windowId: string) => void;
  isActive: boolean;
}

/**
 * TerminalView 组件
 * 支持多窗格拆分的终端视图
 */
export const TerminalView: React.FC<TerminalViewProps> = ({
  window: terminalWindow,
  onReturn,
  onWindowSwitch,
  isActive,
}) => {
  const { enabledIDEs } = useIDESettings();
  const aggregatedStatus = useMemo(() => getAggregatedStatus(terminalWindow.layout), [terminalWindow.layout]);
  const statusLabel = getStatusLabel(aggregatedStatus);
  const statusTextColor = getStatusTextColor(aggregatedStatus);
  const paneCount = useMemo(() => getPaneCount(terminalWindow.layout), [terminalWindow.layout]);
  const panes = useMemo(() => getAllPanes(terminalWindow.layout), [terminalWindow.layout]);

  // 切换面板状态
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  // Store
  const {
    toggleSidebar,
    getActiveWindows,
    splitPaneInWindow,
    closePaneInWindow,
    setActivePane,
    archiveWindow,
    updatePane,
  } = useWindowStore();
  const activeWindows = getActiveWindows();

  // 确保窗口激活时，激活第一个窗格
  useEffect(() => {
    if (!isActive) return;

    const paneIds = panes.map(p => p.id);

    // 如果没有激活的窗格，或激活的窗格不在当前窗格列表中，则激活第一个窗格
    if (!terminalWindow.activePaneId || !paneIds.includes(terminalWindow.activePaneId)) {
      if (panes.length > 0) {
        setActivePane(terminalWindow.id, panes[0].id);
      }
    }
  }, [isActive, terminalWindow.activePaneId, terminalWindow.id, panes, setActivePane]);

  // 快捷键处理
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
      // 只有当面板打开时才处理 ESC 键
      if (quickSwitcherOpen) {
        setQuickSwitcherOpen(false);
        return true; // 表示已处理，阻止传播到终端
      }
      // 没有面板打开时，返回 false，让 ESC 键传递到终端
      return false;
    },
    enabled: isActive,
  });

  // 处理窗格激活
  const handlePaneActivate = useCallback(
    (paneId: string) => {
      setActivePane(terminalWindow.id, paneId);
    },
    [terminalWindow.id, setActivePane]
  );

  // 处理窗格关闭
  const handlePaneClose = useCallback(
    (paneId: string) => {
      // 如果只有一个窗格，不允许关闭
      if (paneCount <= 1) {
        return;
      }
      closePaneInWindow(terminalWindow.id, paneId);
    },
    [terminalWindow.id, paneCount, closePaneInWindow]
  );

  // 处理拆分窗格
  const handleSplitPane = useCallback(
    async (direction: 'horizontal' | 'vertical') => {
      const activePaneId = terminalWindow.activePaneId;
      if (!activePaneId) return;

      // 获取当前激活窗格的信息
      const { getPaneById } = useWindowStore.getState();
      const activePane = getPaneById(terminalWindow.id, activePaneId);
      const currentCwd = activePane?.cwd || 'D:\\';
      const currentCommand = activePane?.command || 'pwsh.exe';

      // 创建新窗格
      const newPaneId = uuidv4();
      const newPane: Pane = {
        id: newPaneId,
        cwd: currentCwd, // 使用当前窗格的工作目录
        command: currentCommand, // 使用当前窗格的命令
        status: WindowStatus.Paused,
        pid: null,
      };

      // 调用 IPC 创建新的 PTY 进程
      try {
        if (window.electronAPI) {
          const response = await window.electronAPI.splitPane({
            workingDirectory: newPane.cwd,
            command: newPane.command,
            windowId: terminalWindow.id,
            paneId: newPaneId,
          });

          if (response && response.success && response.data) {
            newPane.pid = response.data.pid;
            newPane.status = WindowStatus.Running;
          } else {
            throw new Error(response?.error || '拆分窗格失败');
          }
        }
      } catch (error) {
        console.error('Failed to split pane:', error);
        return;
      }

      // 更新布局
      splitPaneInWindow(terminalWindow.id, activePaneId, direction, newPane);
    },
    [terminalWindow.id, terminalWindow.activePaneId, splitPaneInWindow]
  );

  // 处理打开文件夹
  const handleOpenFolder = useCallback(async () => {
    try {
      // 获取第一个窗格的工作目录
      const firstPane = panes[0];
      if (firstPane && window.electronAPI) {
        await window.electronAPI.openFolder(firstPane.cwd);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, [panes]);

  // 处理在 IDE 中打开
  const handleOpenInIDE = useCallback(async (ide: string) => {
    try {
      const firstPane = panes[0];
      if (firstPane && window.electronAPI) {
        const response = await window.electronAPI.openInIDE(ide, firstPane.cwd);
        if (!response.success) {
          console.error(`Failed to open in ${ide}:`, response.error);
        }
      }
    } catch (error) {
      console.error(`Failed to open in ${ide}:`, error);
    }
  }, [panes]);

  // 处理暂停窗口
  const handlePauseWindow = useCallback(async () => {
    try {
      // 关闭窗口（终止所有 PTY 进程）
      await window.electronAPI.closeWindow(terminalWindow.id);

      // 立即更新所有窗格状态为 Paused
      for (const pane of panes) {
        updatePane(terminalWindow.id, pane.id, {
          status: WindowStatus.Paused,
          pid: null
        });
      }
    } catch (error) {
      console.error('Failed to pause window:', error);
    }
  }, [terminalWindow.id, panes, updatePane]);

  // 处理归档窗口
  const handleArchiveWindow = useCallback(async () => {
    try {
      // 获取所有未归档的窗口
      const { windows } = useWindowStore.getState();
      const activeWindows = windows.filter(w => !w.archived && w.id !== terminalWindow.id);

      // 查找第一个等待输入的窗口
      let targetWindow = activeWindows.find(w => {
        const windowPanes = getAllPanes(w.layout);
        return windowPanes.some(pane => pane.status === WindowStatus.WaitingForInput);
      });

      // 如果没有等待输入的窗口，找第一个活跃窗口
      if (!targetWindow && activeWindows.length > 0) {
        targetWindow = activeWindows[0];
      }

      // 如果找到了目标窗口，先切换过去
      if (targetWindow) {
        onWindowSwitch(targetWindow.id);

        // 等待切换完成后再关闭和归档当前窗口
        setTimeout(async () => {
          try {
            await window.electronAPI.closeWindow(terminalWindow.id);
            archiveWindow(terminalWindow.id);
          } catch (error) {
            console.error('Failed to close and archive window:', error);
          }
        }, 100);
      } else {
        // 没有其他窗口，关闭并归档后返回主界面
        await window.electronAPI.closeWindow(terminalWindow.id);
        archiveWindow(terminalWindow.id);
        onReturn();
      }
    } catch (error) {
      console.error('Failed to archive window:', error);
    }
  }, [terminalWindow.id, archiveWindow, onReturn, onWindowSwitch]);

  // 处理快速切换
  const handleQuickSwitcherSelect = useCallback(
    (windowId: string) => {
      setQuickSwitcherOpen(false);
      onWindowSwitch(windowId);
    },
    [onWindowSwitch]
  );

  return (
    <div className="flex h-screen w-screen bg-zinc-900 overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar
        activeWindowId={terminalWindow.id}
        onWindowSelect={onWindowSwitch}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between pl-1 pr-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* 返回按钮 */}
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={onReturn}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                  >
                    <ArrowLeft size={14} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                    sideOffset={5}
                  >
                    返回统一视图 (Esc)
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>

            {/* 窗口名称 */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-100 font-medium text-sm">{terminalWindow.name}</span>
              <span className="text-xs text-zinc-500">({paneCount} 个窗格)</span>
            </div>

            {/* 状态 - 始终显示圆点 */}
            <div className="flex items-center gap-1.5">
              {panes.map((pane, index) => (
                <StatusDot
                  key={pane.id}
                  status={pane.status}
                  size="sm"
                  title={`窗格 ${index + 1}: ${getStatusLabel(pane.status)}`}
                />
              ))}
            </div>
          </div>

          {/* 右侧按钮组 */}
          <div className="flex items-center gap-2">
            {/* 动态渲染启用的 IDE 图标 */}
            {enabledIDEs.map((ide) => (
              <Tooltip.Provider key={ide.id}>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => handleOpenInIDE(ide.id)}
                      className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                      title={`在 ${ide.name} 中打开`}
                    >
                      <IDEIcon icon={ide.icon || ''} size={ide.command === 'code' ? 18 : 14} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                      sideOffset={5}
                    >
                      在 {ide.name} 中打开
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            ))}

            {/* 归档按钮 */}
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={handleArchiveWindow}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                    title="归档窗口"
                  >
                    <Archive size={14} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                    sideOffset={5}
                  >
                    归档窗口
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>

            {/* 打开文件夹按钮 */}
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={handleOpenFolder}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                    title="打开文件夹"
                  >
                    <Folder size={14} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                    sideOffset={5}
                  >
                    打开文件夹
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>

            {/* 左右拆分按钮 */}
            <button
              onClick={() => handleSplitPane('horizontal')}
              className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              title="左右拆分 (Ctrl+Shift+D)"
            >
              <SplitSquareHorizontal size={14} />
            </button>

            {/* 上下拆分按钮 */}
            <button
              onClick={() => handleSplitPane('vertical')}
              className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              title="上下拆分 (Ctrl+Shift+E)"
            >
              <SplitSquareVertical size={14} />
            </button>

            {/* 暂停按钮 - 仅在运行或等待输入时显示 */}
            {(aggregatedStatus === WindowStatus.Running || aggregatedStatus === WindowStatus.WaitingForInput) && (
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={handlePauseWindow}
                      className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                      title="暂停窗口"
                    >
                      <Pause size={14} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-50 shadow-xl border border-zinc-700"
                      sideOffset={5}
                    >
                      暂停窗口
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            )}
          </div>
        </div>

        {/* 终端布局区域 */}
        <div className="flex-1 overflow-hidden">
          <SplitLayout
            windowId={terminalWindow.id}
            layout={terminalWindow.layout}
            activePaneId={terminalWindow.activePaneId}
            isWindowActive={isActive}
            onPaneActivate={handlePaneActivate}
            onPaneClose={handlePaneClose}
          />
        </div>
      </div>

      {/* 快速切换面板 */}
      {quickSwitcherOpen && (
        <QuickSwitcher
          isOpen={quickSwitcherOpen}
          currentWindowId={terminalWindow.id}
          onSelect={handleQuickSwitcherSelect}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      )}

    </div>
  );
};

TerminalView.displayName = 'TerminalView';