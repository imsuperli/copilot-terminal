import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X } from 'lucide-react';
import { Pane, WindowStatus } from '../types/window';
import { StatusDot } from './StatusDot';
import '../styles/xterm.css';

/**
 * 根据窗格状态获取顶部边框颜色
 */
function getStatusBorderColor(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'border-t-green-500';
    case WindowStatus.WaitingForInput:
      return 'border-t-blue-500';
    case WindowStatus.Paused:
      return 'border-t-zinc-600';
    case WindowStatus.Error:
      return 'border-t-red-500';
    case WindowStatus.Completed:
      return 'border-t-zinc-500';
    case WindowStatus.Restoring:
      return 'border-t-yellow-500';
    default:
      return 'border-t-zinc-600';
  }
}

/**
 * 根据窗格状态获取选中时的边框颜色
 */
function getStatusRingColor(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'ring-green-500';
    case WindowStatus.WaitingForInput:
      return 'ring-blue-500';
    case WindowStatus.Paused:
      return 'ring-zinc-600';
    case WindowStatus.Error:
      return 'ring-red-500';
    case WindowStatus.Completed:
      return 'ring-zinc-500';
    case WindowStatus.Restoring:
      return 'ring-yellow-500';
    default:
      return 'ring-zinc-600';
  }
}

export interface TerminalPaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean; // 是否是当前激活的窗格
  onActivate: () => void; // 点击激活
  onClose?: () => void; // 关闭窗格（可选，最后一个窗格不显示关闭按钮）
}

/**
 * TerminalPane 组件
 * 渲染单个终端窗格，包含 xterm.js 实例
 */
export const TerminalPane: React.FC<TerminalPaneProps> = ({
  windowId,
  pane,
  isActive,
  onActivate,
  onClose,
}) => {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isActiveRef = useRef(isActive); // 使用 ref 跟踪 isActive 状态
  const [isHovered, setIsHovered] = useState(false);
  const borderColor = getStatusBorderColor(pane.status);
  const ringColor = getStatusRingColor(pane.status);

  // 更新 isActive ref
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

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
        cursorAccent: '#0f0f0f',
        selectionBackground: '#3a3a3a',
        black: '#000000',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#d19a66',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#d19a66',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", "Courier New", monospace',
      fontSize: 16,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalContainerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 告诉 xterm.js 忽略应用级快捷键
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === 'p' || e.key === 'b' || e.key === 'Tab' ||
            (e.key >= '1' && e.key <= '9')) {
          console.log('[TerminalPane] xterm ignoring shortcut:', e.key);
          return false; // xterm 不处理，让事件正常传播
        }
      }
      // ESC 键让 xterm.js 正常处理，发送到终端应用程序
      return true;
    });

    // 监听用户输入
    const disposable = terminal.onData((data) => {
      if (window.electronAPI && isActiveRef.current) {
        window.electronAPI.ptyWrite(windowId, pane.id, data);
      }
    });

    // 监听 PTY 数据输出
    const handlePtyData = (_event: unknown, payload: { windowId: string; paneId?: string; data: string }) => {
      if (payload.windowId === windowId && payload.paneId === pane.id) {
        terminal.write(payload.data);
      }
    };

    if (window.electronAPI) {
      window.electronAPI.onPtyData(handlePtyData);

      // 加载历史输出（如果有）
      window.electronAPI.getPtyHistory(pane.id).then((history) => {
        if (history && history.length > 0) {
          for (const data of history) {
            terminal.write(data);
          }
        }
      }).catch((error) => {
        console.error('Failed to load PTY history:', error);
      });
    }

    // 窗口大小变化时重新调整终端大小
    const handleResize = () => {
      if (fitAddon && terminal) {
        fitAddon.fit();
        const { cols, rows } = terminal;
        if (window.electronAPI) {
          window.electronAPI.ptyResize(windowId, pane.id, cols, rows);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // 使用 ResizeObserver 监听容器大小变化（拆分窗格、调整大小时触发）
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalContainerRef.current) {
      resizeObserver.observe(terminalContainerRef.current);
    }

    // 初始化时调整大小
    setTimeout(() => handleResize(), 100);

    return () => {
      disposable.dispose();
      if (window.electronAPI) {
        window.electronAPI.offPtyData(handlePtyData);
      }
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [windowId, pane.id]); // 移除 isActive 依赖

  // 处理点击激活
  const handleClick = useCallback(() => {
    if (!isActive) {
      onActivate();
    }
  }, [isActive, onActivate]);

  return (
    <div
      className={`relative flex flex-col h-full bg-[#0f0f0f] ${
        isActive ? `ring-1 ${ringColor}` : ''
      }`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 状态圆点 - 始终显示 */}
      <div className="absolute top-1 right-1 z-10">
        <StatusDot status={pane.status} size="sm" title="窗格状态" />
      </div>

      {/* 悬浮时显示的关闭按钮 */}
      {onClose && isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-1 right-1 z-10 w-6 h-6 flex items-center justify-center rounded bg-zinc-800/90 text-zinc-400 hover:text-zinc-100 hover:bg-red-600 transition-colors shadow-lg"
          title="关闭窗格"
        >
          <X size={14} />
        </button>
      )}

      {/* 终端容器 */}
      <div ref={terminalContainerRef} className="flex-1 overflow-hidden" />
    </div>
  );
};

TerminalPane.displayName = 'TerminalPane';
