import React, { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, SplitSquareHorizontal, SplitSquareVertical } from 'lucide-react';
import { Window, Pane, WindowStatus } from '../types/window';
import { getAggregatedStatus, getPaneCount } from '../utils/layoutHelpers';
import { getStatusLabel, getStatusTextColor } from '../utils/statusHelpers';
import { Sidebar } from './Sidebar';
import { QuickSwitcher } from './QuickSwitcher';
import { TabSwitcher } from './TabSwitcher';
import { SplitLayout } from './SplitLayout';
import { useWindowStore } from '../stores/windowStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

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
  const aggregatedStatus = getAggregatedStatus(terminalWindow.layout);
  const statusLabel = getStatusLabel(aggregatedStatus);
  const statusTextColor = getStatusTextColor(aggregatedStatus);
  const paneCount = getPaneCount(terminalWindow.layout);

  // 切换面板状态
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  const [tabSwitchDirection, setTabSwitchDirection] = useState<'forward' | 'backward'>('forward');

  // Store
  const {
    toggleSidebar,
    getActiveWindows,
    splitPaneInWindow,
    closePaneInWindow,
    setActivePane,
  } = useWindowStore();
  const activeWindows = getActiveWindows();

  // 快捷键处理
  useKeyboardShortcuts({
    onCtrlTab: () => {
      setTabSwitchDirection('forward');
      setTabSwitcherOpen(true);
    },
    onCtrlShiftTab: () => {
      setTabSwitchDirection('backward');
      setTabSwitcherOpen(true);
    },
    onCtrlP: () => {
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
      } else if (tabSwitcherOpen) {
        setTabSwitcherOpen(false);
      } else {
        onReturn();
      }
    },
    enabled: isActive && !quickSwitcherOpen,
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

      // 创建新窗格
      const newPaneId = uuidv4();
      const newPane: Pane = {
        id: newPaneId,
        cwd: 'D:\\', // 默认工作目录，后续可以改为当前窗格的 cwd
        command: 'pwsh.exe',
        status: WindowStatus.Paused,
        pid: null,
      };

      // 调用 IPC 创建新的 PTY 进程
      try {
        if (window.electronAPI) {
          const result = await window.electronAPI.splitPane({
            workingDirectory: newPane.cwd,
            command: newPane.command,
            windowId: terminalWindow.id,
            paneId: newPaneId,
          });
          newPane.pid = result.pid;
          newPane.status = WindowStatus.Running;
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

  // 处理 Tab 切换
  const handleTabSwitcherSelect = useCallback(
    (windowId: string) => {
      setTabSwitcherOpen(false);
      onWindowSwitch(windowId);
    },
    [onWindowSwitch]
  );

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
        <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* 返回按钮 */}
            <button
              onClick={onReturn}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              title="返回统一视图 (Esc)"
            >
              <ArrowLeft size={16} />
              <span className="text-sm">返回</span>
            </button>

            {/* 窗口名称 */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-100 font-medium">{terminalWindow.name}</span>
              <span className="text-xs text-zinc-500">({paneCount} 个窗格)</span>
            </div>

            {/* 状态 */}
            <div className={`text-sm ${statusTextColor}`}>{statusLabel}</div>
          </div>

          {/* 拆分按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSplitPane('horizontal')}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              title="左右拆分 (Ctrl+Shift+D)"
            >
              <SplitSquareVertical size={16} />
              <span className="text-sm">左右拆分</span>
            </button>
            <button
              onClick={() => handleSplitPane('vertical')}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
              title="上下拆分 (Ctrl+Shift+E)"
            >
              <SplitSquareHorizontal size={16} />
              <span className="text-sm">上下拆分</span>
            </button>
          </div>
        </div>

        {/* 终端布局区域 */}
        <div className="flex-1 overflow-hidden">
          <SplitLayout
            windowId={terminalWindow.id}
            layout={terminalWindow.layout}
            activePaneId={terminalWindow.activePaneId}
            onPaneActivate={handlePaneActivate}
            onPaneClose={handlePaneClose}
          />
        </div>
      </div>

      {/* 快速切换面板 */}
      {quickSwitcherOpen && (
        <QuickSwitcher
          onSelect={handleQuickSwitcherSelect}
          onClose={() => setQuickSwitcherOpen(false)}
        />
      )}

      {/* Tab 切换面板 */}
      {tabSwitcherOpen && (
        <TabSwitcher
          direction={tabSwitchDirection}
          onSelect={handleTabSwitcherSelect}
          onClose={() => setTabSwitcherOpen(false)}
        />
      )}
    </div>
  );
};

TerminalView.displayName = 'TerminalView';