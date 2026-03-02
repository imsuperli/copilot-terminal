import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X } from 'lucide-react';
import { Pane } from '../types/window';
import { getStatusLabel, getStatusTextColor } from '../utils/statusHelpers';
import '../styles/xterm.css';

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
  const statusLabel = getStatusLabel(pane.status);
  const statusTextColor = getStatusTextColor(pane.status);

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
      fontSize: 14,
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

    // 监听用户输入
    const disposable = terminal.onData((data) => {
      if (window.electronAPI && isActive) {
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

    // 初始化时调整大小
    setTimeout(() => handleResize(), 100);

    return () => {
      disposable.dispose();
      if (window.electronAPI) {
        window.electronAPI.offPtyData(handlePtyData);
      }
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, [windowId, pane.id, isActive]);

  // 处理点击激活
  const handleClick = useCallback(() => {
    if (!isActive) {
      onActivate();
    }
  }, [isActive, onActivate]);

  return (
    <div
      className={`flex flex-col h-full bg-[#0f0f0f] ${
        isActive ? 'ring-2 ring-blue-500' : 'ring-1 ring-zinc-800'
      }`}
      onClick={handleClick}
    >
      {/* 窗格工具栏 */}
      <div className="h-8 flex items-center justify-between px-3 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">窗格</span>
          <span className={`${statusTextColor}`}>{statusLabel}</span>
        </div>
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
            title="关闭窗格"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* 终端容器 */}
      <div ref={terminalContainerRef} className="flex-1 overflow-hidden p-2" />
    </div>
  );
};

TerminalPane.displayName = 'TerminalPane';
