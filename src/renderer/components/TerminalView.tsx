import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ArrowLeft } from 'lucide-react';
import { Window } from '../types/window';
import { getStatusLabel, getStatusTextColor } from '../utils/statusHelpers';
import { Sidebar } from './Sidebar';
import { QuickSwitcher } from './QuickSwitcher';
import { TabSwitcher } from './TabSwitcher';
import { useWindowStore } from '../stores/windowStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import '../styles/xterm.css';

export interface TerminalViewProps {
  window: Window;
  onReturn: () => void;
  onWindowSwitch: (windowId: string) => void;
  isActive: boolean; // 当前窗口是否激活
}

/**
 * TerminalView 组件
 * 切入窗口后的 CLI 全屏视图，集成 xterm.js 渲染终端
 */
export const TerminalView: React.FC<TerminalViewProps> = ({ window: terminalWindow, onReturn, onWindowSwitch, isActive }) => {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const statusLabel = getStatusLabel(terminalWindow.status);
  const statusTextColor = getStatusTextColor(terminalWindow.status);

  // 切换面板状态
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  const [tabSwitchDirection, setTabSwitchDirection] = useState<'forward' | 'backward'>('forward');

  // Store
  const { toggleSidebar, getActiveWindows } = useWindowStore();
  const activeWindows = getActiveWindows();

  // 快捷键处理（只在当前激活的窗口响应）
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
    // 只有激活的窗口才响应快捷键，避免多个 TerminalView 实例同时响应
    enabled: isActive && !quickSwitcherOpen,
  });

  // 处理 Tab 切换面板的窗口选择
  const handleTabSwitcherSelect = useCallback((windowId: string) => {
    setTabSwitcherOpen(false);
    onWindowSwitch(windowId);
  }, [onWindowSwitch]);

  // 处理快速切换面板的窗口选择
  const handleQuickSwitcherSelect = useCallback((windowId: string) => {
    setQuickSwitcherOpen(false);
    onWindowSwitch(windowId);
  }, [onWindowSwitch]);

  // 初始化 xterm.js
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const terminal = new Terminal({
      cols: 80,
      rows: 30,
      theme: {
        background: '#0f0f0f',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: '#0087ff',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalContainerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 等待容器渲染完成后调整尺寸
    requestAnimationFrame(() => {
      if (!fitAddonRef.current || !terminalRef.current) return;

      // 调整终端尺寸以适应容器
      fitAddonRef.current.fit();
      const { cols, rows } = terminalRef.current;

      // 同步尺寸到 PTY
      window.electronAPI?.ptyResize(terminalWindow.id, cols, rows);

      // 加载历史输出
      window.electronAPI?.getPtyHistory(terminalWindow.id).then((history) => {
        if (history && history.length > 0 && terminalRef.current) {
          for (const data of history) {
            terminalRef.current.write(data);
          }
        }
      }).catch(() => {
        // 忽略错误，继续正常流程
      });
    });

    // 划选复制：选中文本自动复制到剪贴板
    terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (selection && navigator.clipboard) {
        navigator.clipboard.writeText(selection).catch(() => {});
      }
    });

    // 拦截特定快捷键，防止它们被发送到终端
    terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Ctrl+Enter 或 Shift+Enter：插入换行符
      if (event.type === 'keydown' && event.key === 'Enter' && (event.ctrlKey || event.shiftKey)) {
        // 发送换行符到 PTY
        window.electronAPI?.ptyWrite(terminalWindow.id, '\n');
        // 阻止 xterm.js 的默认处理
        return false;
      }

      // 拦截应用快捷键，让它们冒泡到 window 事件监听器
      if (event.type === 'keydown' && event.ctrlKey) {
        // Ctrl+P: 快速切换面板
        if (event.key === 'p') {
          return false;
        }
        // Ctrl+B: 切换侧边栏
        if (event.key === 'b') {
          return false;
        }
        // Ctrl+Tab / Ctrl+Shift+Tab: Tab 切换
        if (event.key === 'Tab') {
          return false;
        }
        // Ctrl+1~9: 切换到第 N 个窗口
        if (event.key >= '1' && event.key <= '9') {
          return false;
        }
        // Ctrl+N: Vim 风格向下导航（在 QuickSwitcher 中使用）
        if (event.key === 'n') {
          return false;
        }
      }

      // Escape: 关闭面板或返回
      if (event.type === 'keydown' && event.key === 'Escape') {
        return false;
      }

      // 其他按键正常处理
      return true;
    });

    // 用户输入 → PTY
    terminal.onData((data: string) => {
      window.electronAPI?.ptyWrite(terminalWindow.id, data);
    });

    // PTY 输出 → 终端
    const ptyDataHandler = (_event: unknown, payload: { windowId: string; data: string }) => {
      if (payload.windowId === terminalWindow.id) {
        terminal.write(payload.data);
      }
    };
    window.electronAPI?.onPtyData(ptyDataHandler);

    // 聚焦终端
    terminal.focus();

    return () => {
      window.electronAPI?.offPtyData(ptyDataHandler);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalWindow.id]);

  // 右键粘贴
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (navigator.clipboard) {
      navigator.clipboard.readText().then((text) => {
        if (text && terminalRef.current) {
          window.electronAPI?.ptyWrite(terminalWindow.id, text);
        }
      }).catch(() => {});
    }
  }, [terminalWindow.id]);

  // ResizeObserver 监听容器大小变化
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          window.electronAPI?.ptyResize(terminalWindow.id, cols, rows);
        } catch {
          // fit() may throw if terminal is not yet ready
        }
      }
    });

    resizeObserver.observe(terminalContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [terminalWindow.id]);

  // 监听窗口激活状态，重新调整尺寸和聚焦
  useEffect(() => {
    if (isActive && terminalRef.current && fitAddonRef.current) {
      // 窗口变为可见时，重新调整尺寸
      requestAnimationFrame(() => {
        if (!fitAddonRef.current || !terminalRef.current) return;

        try {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          window.electronAPI?.ptyResize(terminalWindow.id, cols, rows);

          // 聚焦终端
          terminalRef.current.focus();
        } catch {
          // 忽略错误
        }
      });
    }
  }, [isActive, terminalWindow.id]); // 依赖 isActive，当窗口激活时触发

  return (
    <>
      <div
        className="flex h-full bg-zinc-900"
        data-testid="terminal-view"
        tabIndex={-1}
      >
        {/* 侧边栏 */}
        <Sidebar
          activeWindowId={terminalWindow.id}
          onWindowSelect={onWindowSwitch}
        />

        {/* 主内容区 */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* 顶部窄条 (40px) */}
          <div
            className="flex items-center gap-2 px-2 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0"
            style={{ height: '40px' }}
            data-testid="terminal-topbar"
          >
            {/* 返回按钮 */}
            <button
              onClick={onReturn}
              aria-label="返回统一视图"
              className="flex items-center justify-center w-8 h-8 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors flex-shrink-0"
              data-testid="return-button"
            >
              <ArrowLeft size={16} />
            </button>

            {/* 窗口名称 */}
            <span
              className="text-base font-semibold text-zinc-100 truncate flex-1"
              data-testid="window-name"
            >
              {terminalWindow.name}
            </span>

            {/* 状态标签 */}
            <span
              className={`text-xs flex-shrink-0 ${statusTextColor}`}
              data-testid="status-label"
            >
              {statusLabel}
            </span>
          </div>

          {/* 终端内容区 */}
          <div
            ref={terminalContainerRef}
            onContextMenu={handleContextMenu}
            className="flex-1 overflow-hidden"
            data-testid="terminal-container"
            style={{ minHeight: 0 }}
          />
        </div>
      </div>

      {/* 快速切换面板 (Ctrl+P) */}
      <QuickSwitcher
        isOpen={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        onSelect={handleQuickSwitcherSelect}
        currentWindowId={terminalWindow.id}
      />

      {/* Tab 切换面板 (Ctrl+Tab) */}
      <TabSwitcher
        isOpen={tabSwitcherOpen}
        onSelect={handleTabSwitcherSelect}
        direction={tabSwitchDirection}
      />
    </>
  );
};

TerminalView.displayName = 'TerminalView';
