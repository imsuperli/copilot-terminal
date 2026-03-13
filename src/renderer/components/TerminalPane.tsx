import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X } from 'lucide-react';
import { Pane, WindowStatus } from '../types/window';
import { StatusDot } from './StatusDot';
import { useI18n } from '../i18n';
import { subscribeToPanePtyData } from '../api/ptyDataBus';
import type { PtyDataPayload, PtyHistorySnapshot } from '../../shared/types/electron-api';
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
 * 将 hex 颜色转换为 Tailwind 边框类（如果是自定义颜色则返回 inline style）
 */
function getCustomBorderStyle(color?: string): { className?: string; style?: React.CSSProperties } {
  if (!color) {
    return {};
  }

  // 如果是 hex 颜色，使用 inline style
  if (color.startsWith('#')) {
    return {
      style: { borderTopColor: color }
    };
  }

  return {};
}

function getActivePaneStyle(color?: string): React.CSSProperties | undefined {
  if (!color || !color.startsWith('#')) {
    return undefined;
  }

  return {
    boxShadow: `0 0 0 1px ${color}`,
  };
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

function extractPtyHistorySnapshot(response: unknown): PtyHistorySnapshot {
  if (Array.isArray(response)) {
    return {
      chunks: response.filter((chunk): chunk is string => typeof chunk === 'string'),
      lastSeq: 0,
    };
  }

  if (
    response
    && typeof response === 'object'
    && 'success' in response
    && (response as { success?: boolean }).success
  ) {
    const data = (response as { data?: unknown }).data;
    if (
      data
      && typeof data === 'object'
      && 'chunks' in data
      && 'lastSeq' in data
      && Array.isArray((data as { chunks?: unknown }).chunks)
      && typeof (data as { lastSeq?: unknown }).lastSeq === 'number'
    ) {
      return {
        chunks: (data as { chunks: unknown[] }).chunks.filter((chunk): chunk is string => typeof chunk === 'string'),
        lastSeq: (data as { lastSeq: number }).lastSeq,
      };
    }

    if (Array.isArray(data)) {
      return {
        chunks: data.filter((chunk): chunk is string => typeof chunk === 'string'),
        lastSeq: 0,
      };
    }
  }

  return {
    chunks: [],
    lastSeq: 0,
  };
}

export interface TerminalPaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean; // 是否是当前激活的窗格
  isWindowActive: boolean; // 窗口是否是当前激活的窗口
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
  isWindowActive,
  onActivate,
  onClose,
}) => {
  const { t } = useI18n();
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const outputBufferRef = useRef('');
  const outputFlushFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const lastContainerSizeRef = useRef({ width: 0, height: 0 });
  const isActiveRef = useRef(isActive); // 使用 ref 跟踪 isActive 状态
  const suppressNativePasteUntilRef = useRef(0); // 短时间屏蔽原生 paste，避免与手动 Ctrl+V 粘贴重复
  const lastCtrlEnterTimeRef = useRef(0); // 记录上次 Ctrl+Enter 的时间戳
  const lastStatusRef = useRef<WindowStatus>(pane.status); // 跟踪上一次的状态
  const lastSessionRef = useRef({ pid: pane.pid, status: pane.status });
  const isHistoryLoadedRef = useRef(false);
  const bufferedLiveDataRef = useRef<PtyDataPayload[]>([]);
  const historyReplayTokenRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);
  const suppressPtyWriteRef = useRef(false);
  // 区分“当前会话首次回放”和“同一会话后的补回放”：
  // 首次回放可能包含 PowerShell 启动阶段仍在等待响应的 ESC[c，
  // 这时必须允许 xterm 生成的 DA 响应回写到 PTY。
  const hasCompletedReplayForCurrentSessionRef = useRef(false);
  const replayHistoryRef = useRef<((options?: { resetTerminal?: boolean }) => Promise<void>) | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // 确定边框颜色：优先使用自定义 borderColor，否则使用状态颜色
  const customBorderStyle = getCustomBorderStyle(pane.borderColor);
  const activePaneStyle = isActive ? getActivePaneStyle(pane.activeBorderColor) : undefined;
  const defaultBorderColor = getStatusBorderColor(pane.status);
  const borderColorClass = customBorderStyle.style ? 'border-t-2' : `border-t-2 ${defaultBorderColor}`;
  const ringColor = getStatusRingColor(pane.status);

  // 是否显示 pane header（当有 title 或 agentName 时显示）
  const showPaneHeader = !!(pane.title || pane.agentName);
  const showCloseButton = Boolean(onClose && isHovered);

  // 写入系统剪贴板（优先走 Electron IPC，失败时回退到浏览器 API）
  const writeClipboardText = useCallback(async (text: string) => {
    if (!text) return;

    try {
      if (window.electronAPI?.writeClipboardText) {
        await window.electronAPI.writeClipboardText(text);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // 剪贴板失败不应影响终端主流程
    }
  }, []);

  // 读取系统剪贴板（优先走 Electron IPC，失败时回退到浏览器 API）
  const readClipboardText = useCallback(async (): Promise<string> => {
    try {
      if (window.electronAPI?.readClipboardText) {
        const response = await window.electronAPI.readClipboardText();

        if (typeof response === 'string') {
          return response;
        }

        if (
          response &&
          typeof response === 'object' &&
          'success' in response &&
          (response as { success?: boolean }).success
        ) {
          const data = (response as { data?: unknown }).data;
          return typeof data === 'string' ? data : '';
        }
      }

      if (navigator.clipboard?.readText) {
        return await navigator.clipboard.readText();
      }
    } catch {
      // 剪贴板失败不应影响终端主流程
    }

    return '';
  }, []);

  // 更新 isActive ref
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const forceResizeToContainer = useCallback(() => {
    lastContainerSizeRef.current = { width: 0, height: 0 };

    if (!terminalRef.current || !fitAddonRef.current || !terminalContainerRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      const container = terminalContainerRef.current;
      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;

      if (!container || !terminal || !fitAddon) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      if (width > 0 && height > 0) {
        lastContainerSizeRef.current = { width, height };
        fitAddon.fit();

        if (window.electronAPI) {
          const { cols, rows } = terminal;
          window.electronAPI.ptyResize(windowId, pane.id, cols, rows);
        }
      }
    });
  }, [windowId, pane.id]);

  // 监听窗格状态变化：从 Paused 恢复时重置尺寸缓存，强制下次 resize
  useEffect(() => {
    const prevStatus = lastStatusRef.current;
    const currentStatus = pane.status;

    // 从 Paused 状态恢复到 Running/WaitingForInput 时，重置尺寸缓存
    if (
      prevStatus === WindowStatus.Paused &&
      (currentStatus === WindowStatus.Running || currentStatus === WindowStatus.WaitingForInput || currentStatus === WindowStatus.Restoring)
    ) {
      forceResizeToContainer();
    }

    lastStatusRef.current = currentStatus;
  }, [pane.status, forceResizeToContainer]);

  // 当窗格激活且窗口激活时，自动聚焦到终端
  useEffect(() => {
    const shouldFocus = isActive && isWindowActive;

    if (!terminalRef.current) return;

    if (shouldFocus) {
      requestAnimationFrame(() => {
        if (!terminalRef.current) return;

        try {
          terminalRef.current.focus();

          const textarea = terminalContainerRef.current?.querySelector('textarea');
          if (textarea) {
            textarea.focus();
          }
        } catch (error) {
          console.error(`[TerminalPane] Error focusing pane ${pane.id}:`, error);
        }
      });
    } else {
      // 非激活窗格：失焦并隐藏光标
      try {
        terminalRef.current.blur();
        const textarea = terminalContainerRef.current?.querySelector('textarea');
        if (textarea) {
          (textarea as HTMLTextAreaElement).blur();
        }
      } catch (error) {
        console.error(`[TerminalPane] Error blurring pane ${pane.id}:`, error);
      }
    }
  }, [isActive, isWindowActive, pane.id]);

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
      fontSize: 15,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      // @ts-ignore - cursorInactiveStyle 是 xterm.js 的有效选项
      cursorInactiveStyle: 'none',
      scrollback: 10000,
      allowProposedApi: true,
      scrollOnUserInput: true,
      smoothScrollDuration: 0, // 禁用平滑滚动，减少晃动
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalContainerRef.current);
    const pasteCaptureBlockMs = 300;

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 批量刷新 PTY 输出：每帧最多写一次，降低高频输出时的重绘抖动
    const flushOutput = () => {
      outputFlushFrameRef.current = null;

      const pending = outputBufferRef.current;
      if (!pending || !terminalRef.current) {
        return;
      }

      outputBufferRef.current = '';
      terminalRef.current.write(pending);
    };

    const clearQueuedOutput = () => {
      if (outputFlushFrameRef.current !== null) {
        cancelAnimationFrame(outputFlushFrameRef.current);
        outputFlushFrameRef.current = null;
      }

      outputBufferRef.current = '';
    };

    const queueOutput = (data: string) => {
      if (!data) return;

      // 限制缓冲区大小，避免极端情况下的内存泄漏
      const MAX_BUFFER_SIZE = 100000; // 100KB
      if (outputBufferRef.current.length + data.length > MAX_BUFFER_SIZE) {
        // 强制刷新缓冲区
        if (outputFlushFrameRef.current !== null) {
          cancelAnimationFrame(outputFlushFrameRef.current);
          outputFlushFrameRef.current = null;
        }
        flushOutput();
      }

      outputBufferRef.current += data;
      if (outputFlushFrameRef.current !== null) {
        return;
      }

      outputFlushFrameRef.current = requestAnimationFrame(flushOutput);
    };

    const writeReplayOutput = (data: string) => new Promise<void>((resolve) => {
      if (!data || !terminalRef.current) {
        resolve();
        return;
      }

      terminalRef.current.write(data, () => resolve());
    });

    const queueLiveOutput = (payload: PtyDataPayload) => {
      if (!payload.data) {
        return;
      }

      if (payload.seq !== undefined && payload.seq <= lastAppliedSeqRef.current) {
        return;
      }

      if (!isHistoryLoadedRef.current) {
        bufferedLiveDataRef.current.push(payload);
        return;
      }

      if (payload.seq !== undefined) {
        lastAppliedSeqRef.current = payload.seq;
      }

      queueOutput(payload.data);
    };

    const replayHistory = async ({ resetTerminal = false }: { resetTerminal?: boolean } = {}) => {
      const token = ++historyReplayTokenRef.current;
      isHistoryLoadedRef.current = false;
      bufferedLiveDataRef.current = [];
      lastAppliedSeqRef.current = 0;
      // 只有同一会话的后续补回放才屏蔽协议响应，避免把旧历史里的 CSI 查询
      // 再次变成 synthetic reply 注入 live PTY。
      const shouldSuppressReplayProtocolReplies = hasCompletedReplayForCurrentSessionRef.current && !resetTerminal;
      let shouldResumePtyWrites = false;

      if (resetTerminal && terminalRef.current) {
        clearQueuedOutput();
        terminalRef.current.reset();
      }

      try {
        const response = await window.electronAPI?.getPtyHistory?.(pane.id);
        if (token !== historyReplayTokenRef.current) {
          return;
        }

        const historySnapshot = extractPtyHistorySnapshot(response);
        lastAppliedSeqRef.current = historySnapshot.lastSeq;
        const replayData = historySnapshot.chunks.join('');
        if (replayData) {
          if (shouldSuppressReplayProtocolReplies) {
            suppressPtyWriteRef.current = true;
            shouldResumePtyWrites = true;
          }
          await writeReplayOutput(replayData);
        }
      } catch {
        // 历史回放失败不应影响实时输出
      } finally {
        if (shouldResumePtyWrites) {
          suppressPtyWriteRef.current = false;
        }

        if (token !== historyReplayTokenRef.current) {
          return;
        }

        isHistoryLoadedRef.current = true;
        hasCompletedReplayForCurrentSessionRef.current = true;
        const bufferedChunks = bufferedLiveDataRef.current;
        bufferedLiveDataRef.current = [];
        for (const payload of bufferedChunks) {
          if (payload.seq !== undefined && payload.seq <= lastAppliedSeqRef.current) {
            continue;
          }
          if (payload.seq !== undefined) {
            lastAppliedSeqRef.current = payload.seq;
          }
          queueOutput(payload.data);
        }
      }
    };

    replayHistoryRef.current = replayHistory;

    // 尺寸同步：仅在容器尺寸实际变化时执行 fit，避免无效重排
    const runResize = () => {
      resizeFrameRef.current = null;

      const container = terminalContainerRef.current;
      const currentTerminal = terminalRef.current;
      const currentFitAddon = fitAddonRef.current;
      if (!container || !currentTerminal || !currentFitAddon) {
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }

      const last = lastContainerSizeRef.current;
      if (last.width === width && last.height === height) {
        return;
      }

      lastContainerSizeRef.current = { width, height };
      currentFitAddon.fit();

      if (window.electronAPI) {
        const { cols, rows } = currentTerminal;
        window.electronAPI.ptyResize(windowId, pane.id, cols, rows);
      }
    };

    const scheduleResize = () => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = requestAnimationFrame(runResize);
    };

    // 捕获阶段拦截 Ctrl+V 触发的原生 paste，避免与手动 ptyWrite 双写入
    const suppressNativePaste = (event: ClipboardEvent) => {
      if (Date.now() <= suppressNativePasteUntilRef.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const terminalContainer = terminalContainerRef.current;
    const helperTextarea = terminalContainer?.querySelector('textarea');
    helperTextarea?.addEventListener('paste', suppressNativePaste, true);
    terminalContainer?.addEventListener('paste', suppressNativePaste as EventListener, true);

    // 告诉 xterm.js 忽略应用级快捷键
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Ctrl+V：粘贴剪贴板内容
      if (e.type === 'keydown' && e.ctrlKey && e.key.toLowerCase() === 'v' && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault(); // 阻止浏览器默认粘贴行为（否则会通过 xterm textarea 触发第二次粘贴）
        e.stopPropagation();
        suppressNativePasteUntilRef.current = Date.now() + pasteCaptureBlockMs;
        if (isActiveRef.current && window.electronAPI) {
          void readClipboardText().then((text) => {
            if (text && window.electronAPI && isActiveRef.current) {
              window.electronAPI.ptyWrite(windowId, pane.id, text);
            }
          });
        }
        return false; // 阻止 xterm.js 将 Ctrl+V 作为 ^V 发送给 PTY
      }

      // Ctrl+Enter：发送换行符到 PTY（用于多行输入）
      if (e.ctrlKey && e.key === 'Enter' && !e.shiftKey) {
        // 忽略键盘重复触发
        if (e.repeat) {
          return false;
        }

        // 防抖：200ms 内的重复事件直接忽略
        const now = Date.now();
        if (now - lastCtrlEnterTimeRef.current < 200) {
          return false;
        }
        lastCtrlEnterTimeRef.current = now;

        // 只发送到 PTY，让应用程序自己处理显示
        if (window.electronAPI && isActiveRef.current) {
          window.electronAPI.ptyWrite(windowId, pane.id, '\n');
        }
        return false; // 阻止 xterm.js 处理
      }

      if (e.ctrlKey) {
        // 应用级快捷键：不让 xterm 处理
        if (e.key === 'Tab' || e.key === 'b' ||
            (e.key >= '1' && e.key <= '9')) {
          return false; // xterm 不处理，让事件正常传播
        }
      }
      // 其他按键（包括普通 Enter、Shift+Enter、@ 等）让 xterm.js 正常处理
      return true;
    });

    // 监听用户输入
    const disposable = terminal.onData((data) => {
      // 新会话的首次回放里，xterm 生成的协议响应仍然要回给 PTY；
      // 只有同一会话后续的补回放才需要屏蔽 synthetic reply。
      if (window.electronAPI && !suppressPtyWriteRef.current) {
        window.electronAPI.ptyWrite(windowId, pane.id, data);
      }
    });

    // 划选复制：选中文本自动写入剪贴板
    const selectionDisposable = terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (!selection) return;
      void writeClipboardText(selection);
    });

    const unsubscribePtyData = subscribeToPanePtyData(windowId, pane.id, queueLiveOutput, {
      replayBuffered: false,
    });

    // 窗口大小变化时重新调整终端大小
    const handleResize = () => scheduleResize();

    window.addEventListener('resize', handleResize);

    // 使用 ResizeObserver 监听容器大小变化（拆分窗格、调整大小时触发）
    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });

    if (terminalContainerRef.current) {
      resizeObserver.observe(terminalContainerRef.current);
    }

    // 初始化时调整大小
    scheduleResize();
    const initResizeTimer = window.setTimeout(() => scheduleResize(), 100);
    void replayHistory();

    return () => {
      historyReplayTokenRef.current += 1;
      replayHistoryRef.current = null;
      isHistoryLoadedRef.current = true;
      bufferedLiveDataRef.current = [];
      lastAppliedSeqRef.current = 0;
      suppressPtyWriteRef.current = false;
      hasCompletedReplayForCurrentSessionRef.current = false;
      disposable.dispose();
      selectionDisposable.dispose();
      unsubscribePtyData();
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      window.clearTimeout(initResizeTimer);

      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      clearQueuedOutput();
      suppressNativePasteUntilRef.current = 0;
      helperTextarea?.removeEventListener('paste', suppressNativePaste, true);
      terminalContainer?.removeEventListener('paste', suppressNativePaste as EventListener, true);

      terminal.dispose();
    };
  }, [windowId, pane.id]); // writeClipboardText 和 readClipboardText 已用 useCallback 包裹且依赖为空，引用稳定，无需作为依赖

  useEffect(() => {
    const previousSession = lastSessionRef.current;
    const previousPid = previousSession.pid;
    const nextPid = pane.pid;
    const shouldReplayFreshSession = (
      terminalRef.current !== null
      && nextPid !== null
      && nextPid !== previousPid
      && (
        previousPid === null
        || previousSession.status === WindowStatus.Paused
        || previousSession.status === WindowStatus.Completed
        || previousSession.status === WindowStatus.Error
        || previousSession.status === WindowStatus.Restoring
      )
    );

    if (shouldReplayFreshSession) {
      // pid 变化代表启动了新会话，下一次 history replay 可能正好覆盖 shell
      // 启动握手阶段，不能沿用上一会话的 suppress 状态。
      hasCompletedReplayForCurrentSessionRef.current = false;
      void replayHistoryRef.current?.({ resetTerminal: true });
    }

    lastSessionRef.current = {
      pid: nextPid,
      status: pane.status,
    };
  }, [pane.pid, pane.status]);

  // 处理点击激活
  const handleClick = useCallback(() => {
    if (!isActive) {
      onActivate();
    }
  }, [isActive, onActivate]);

  // 右键粘贴：读取剪贴板并写入当前窗格 PTY
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    if (!isActive) {
      onActivate();
    }

    void (async () => {
      const text = await readClipboardText();
      if (!text || !window.electronAPI) return;
      window.electronAPI.ptyWrite(windowId, pane.id, text);
    })();
  }, [isActive, onActivate, readClipboardText, windowId, pane.id]);

  return (
    <div
      className={`relative flex flex-col h-full bg-[#0f0f0f] ${
        isActive ? `ring-1 ${ringColor}` : ''
      }`}
      style={{
        ...activePaneStyle,
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Pane Header - 显示 tmux 元数据（title, agentName） */}
      {showPaneHeader && (
        <div className="flex items-center justify-between px-2 py-1 bg-zinc-900/50 border-b border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            {/* Agent 颜色指示器 */}
            {pane.agentColor && (
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: pane.agentColor }}
              />
            )}
            {/* Pane 标题或 Agent 名称 */}
            <span className="text-xs text-zinc-400 truncate font-mono">
              {pane.title || pane.agentName}
            </span>
          </div>
          <div className="flex items-center justify-center w-6 h-6 flex-shrink-0">
            {showCloseButton ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.();
                }}
                className="w-6 h-6 flex items-center justify-center rounded bg-zinc-800/90 text-zinc-400 hover:text-zinc-100 hover:bg-red-600 transition-colors shadow-lg"
                title={t('terminalPane.close')}
                aria-label={t('terminalPane.close')}
              >
                <X size={14} />
              </button>
            ) : (
              <StatusDot status={pane.status} size="sm" title={t('terminalPane.status')} />
            )}
          </div>
        </div>
      )}

      {/* 无 header 时，右上角在状态图标与关闭按钮之间切换 */}
      {!showPaneHeader && (
        <div className="absolute top-1 right-1 z-20">
          {showCloseButton ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              className="w-6 h-6 flex items-center justify-center rounded bg-zinc-800/90 text-zinc-400 hover:text-zinc-100 hover:bg-red-600 transition-colors shadow-lg"
              title={t('terminalPane.close')}
              aria-label={t('terminalPane.close')}
            >
              <X size={14} />
            </button>
          ) : (
            <StatusDot status={pane.status} size="sm" title={t('terminalPane.status')} />
          )}
        </div>
      )}

      {/* 终端容器 */}
      <div
        ref={terminalContainerRef}
        className="flex-1 overflow-hidden px-1"
        onContextMenu={handleContextMenu}
      />
    </div>
  );
};

TerminalPane.displayName = 'TerminalPane';
