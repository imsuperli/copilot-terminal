import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '../utils/xtermAddonFit';
import { GripVertical, X } from 'lucide-react';
import { Pane, WindowStatus } from '../types/window';
import { useI18n } from '../i18n';
import { subscribeToPanePtyData } from '../api/ptyDataBus';
import type { PtyDataPayload, PtyHistorySnapshot } from '../../shared/types/electron-api';
import { ensureTerminalFontsLoaded, TERMINAL_FONT_FAMILY } from '../utils/terminalFonts';
import { onTerminalSettingsUpdated } from '../utils/terminalSettingsEvents';
import { installTerminalImeFix, type ImeCompositionState } from '../utils/terminalImeFix';
import {
  createTerminalLinkHandler,
  registerTerminalWebLinks,
  type TerminalLinkInteractionPayload,
} from '../utils/terminalLinks';
import { AppTooltip } from './ui/AppTooltip';
import { useWindowStore } from '../stores/windowStore';
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from '../utils/settingsEvents';
import { setBrowserDropDragActive } from '../utils/browserDropDragState';
import {
  applyTerminalInputToSSHCwdTracker,
  createSSHCwdTrackerState,
  extractLatestOsc7RemoteCwd,
  updateSSHCwdTrackerFromRuntimeCwd,
} from '../utils/sshCwdTracking';
import '../styles/xterm.css';

const completedReplaySessions = new Set<string>();

function getReplaySessionKey(windowId: string, paneId: string, pid: number | null | undefined): string | null {
  if (pid === null || pid === undefined) {
    return null;
  }

  return `${windowId}:${paneId}:${pid}`;
}

export function __resetTerminalPaneReplaySessionCacheForTests(): void {
  completedReplaySessions.clear();
}

/**
 * 根据窗格状态获取顶部边框颜色
 */
function getStatusBorderColor(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'border-t-[rgb(var(--success))]';
    case WindowStatus.WaitingForInput:
      return 'border-t-[rgb(var(--primary))]';
    case WindowStatus.Paused:
      return 'border-t-[rgb(var(--border))]';
    case WindowStatus.Error:
      return 'border-t-[rgb(var(--error))]';
    case WindowStatus.Completed:
      return 'border-t-[rgb(var(--muted-foreground))]';
    case WindowStatus.Restoring:
      return 'border-t-[rgb(var(--warning))]';
    default:
      return 'border-t-[rgb(var(--border))]';
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
      return 'ring-[rgb(var(--success))]';
    case WindowStatus.WaitingForInput:
      return 'ring-[rgb(var(--primary))]';
    case WindowStatus.Paused:
      return 'ring-[rgb(var(--border))]';
    case WindowStatus.Error:
      return 'ring-[rgb(var(--error))]';
    case WindowStatus.Completed:
      return 'ring-[rgb(var(--muted-foreground))]';
    case WindowStatus.Restoring:
      return 'ring-[rgb(var(--warning))]';
    default:
      return 'ring-[rgb(var(--border))]';
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

function stripReplayDeviceAttributeQueries(data: string): string {
  if (!data) {
    return data;
  }

  return data.replace(/\x1b\[(?:[>=])?c/g, '');
}

function readRootCssColor(variableName: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function getWindowsTerminalTheme() {
  return {
    background: 'transparent',
    foreground: readRootCssColor('--terminal-foreground', '#cccccc'),
    cursor: readRootCssColor('--terminal-cursor', '#f2f2f2'),
    cursorAccent: readRootCssColor('--terminal-cursor-accent', '#0c0c0c'),
    selectionBackground: readRootCssColor('--terminal-selection', 'rgba(204, 204, 204, 0.28)'),
    black: readRootCssColor('--terminal-black', '#0c0c0c'),
    red: readRootCssColor('--terminal-red', '#c50f1f'),
    green: readRootCssColor('--terminal-green', '#13a10e'),
    yellow: readRootCssColor('--terminal-yellow', '#c19c00'),
    blue: readRootCssColor('--terminal-blue', '#0037da'),
    magenta: readRootCssColor('--terminal-magenta', '#881798'),
    cyan: readRootCssColor('--terminal-cyan', '#3a96dd'),
    white: readRootCssColor('--terminal-white', '#cccccc'),
    brightBlack: readRootCssColor('--terminal-bright-black', '#767676'),
    brightRed: readRootCssColor('--terminal-bright-red', '#e74856'),
    brightGreen: readRootCssColor('--terminal-bright-green', '#16c60c'),
    brightYellow: readRootCssColor('--terminal-bright-yellow', '#f9f1a5'),
    brightBlue: readRootCssColor('--terminal-bright-blue', '#3b78ff'),
    brightMagenta: readRootCssColor('--terminal-bright-magenta', '#b4009e'),
    brightCyan: readRootCssColor('--terminal-bright-cyan', '#61d6d6'),
    brightWhite: readRootCssColor('--terminal-bright-white', '#f2f2f2'),
  };
}

interface TerminalLinkDragOverlayState {
  url: string;
  left: number;
  top: number;
}

interface TerminalLinkDragOverlayProps {
  url: string;
  label: string;
  left: number;
  top: number;
  isDragging: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDragStateChange: (isDragging: boolean) => void;
}

const TerminalLinkDragOverlay: React.FC<TerminalLinkDragOverlayProps> = ({
  url,
  label,
  left,
  top,
  isDragging,
  onMouseEnter,
  onMouseLeave,
  onDragStateChange,
}) => (
  <div
    className="xterm-hover absolute z-30"
    style={{
      left,
      top,
      opacity: isDragging ? 0.72 : 1,
    }}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
  >
    <button
      type="button"
      draggable
      aria-label={label}
      title={url}
      className="flex max-w-[260px] cursor-grab items-center gap-2 rounded-full border border-[rgb(var(--primary))]/45 bg-[color-mix(in_srgb,rgb(var(--background))_92%,transparent)] px-2.5 py-1 text-[11px] text-[rgb(var(--primary))] shadow-[0_8px_24px_rgba(2,6,23,0.45)] backdrop-blur active:cursor-grabbing"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/uri-list', url);
        event.dataTransfer.setData('text/plain', url);
        setBrowserDropDragActive(true);
        onDragStateChange(true);
      }}
      onDragEnd={() => {
        setBrowserDropDragActive(false);
        onDragStateChange(false);
      }}
    >
      <GripVertical size={12} className="shrink-0 text-[rgb(var(--primary))]" />
      <span className="truncate">{url}</span>
    </button>
  </div>
);

export interface TerminalPaneProps {
  windowId: string;
  pane: Pane;
  layoutPaneCount?: number;
  isActive: boolean; // 是否是当前激活的窗格
  isWindowActive: boolean; // 窗口是否是当前激活的窗口
  onActivate: () => void; // 点击激活
  onClose?: () => void; // 关闭窗格（可选，最后一个窗格不显示关闭按钮）
  onProcessExit?: () => void; // 进程退出回调（委托父组件处理）
}

/**
 * TerminalPane 组件
 * 渲染单个终端窗格，包含 xterm.js 实例
 */
export const TerminalPane: React.FC<TerminalPaneProps> = ({
  windowId,
  pane,
  layoutPaneCount = 1,
  isActive,
  isWindowActive,
  onActivate,
  onClose,
  onProcessExit,
}) => {
  const { t } = useI18n();
  const paneRootRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const outputChunksRef = useRef<string[]>([]);
  const outputBufferSizeRef = useRef(0);
  const outputFlushFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const lastContainerSizeRef = useRef({ width: 0, height: 0 });
  const lastSyncedTerminalSizeRef = useRef({ cols: 0, rows: 0 });
  const isActiveRef = useRef(isActive); // 使用 ref 跟踪 isActive 状态
  const onActivateRef = useRef(onActivate);
  const suppressNativePasteUntilRef = useRef(0); // 短时间屏蔽原生 paste，避免与手动 Ctrl+V 粘贴重复
  const lastCtrlEnterTimeRef = useRef(0); // 记录上次 Ctrl+Enter 的时间戳
  const lastStatusRef = useRef<WindowStatus>(pane.status); // 跟踪上一次的状态
  const lastSessionRef = useRef({ pid: pane.pid, status: pane.status });
  const lastLayoutPaneCountRef = useRef(layoutPaneCount);
  const isHistoryLoadedRef = useRef(false);
  const bufferedLiveDataRef = useRef<PtyDataPayload[]>([]);
  const historyReplayTokenRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);
  const suppressPtyWriteRef = useRef(false);
  // 区分“当前会话首次回放”和“同一会话后的补回放”：
  // 首次回放可能包含 PowerShell 启动阶段仍在等待响应的 ESC[c，
  // 这时必须允许 xterm 生成的 DA 响应回写到 PTY。
  const hasCompletedReplayForCurrentSessionRef = useRef(false);
  const replaySessionKeyRef = useRef<string | null>(getReplaySessionKey(windowId, pane.id, pane.pid));
  const replayHistoryRef = useRef<((options?: { resetTerminal?: boolean }) => Promise<void>) | null>(null);
  const imeCompositionStateRef = useRef<ImeCompositionState>({ isComposing: false });
  const sshCwdTrackerRef = useRef(createSSHCwdTrackerState(pane.cwd));
  const linkDragOverlayHideTimerRef = useRef<number | null>(null);
  const isLinkDragOverlayHoveredRef = useRef(false);
  const isLinkDragActiveRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [linkDragOverlay, setLinkDragOverlay] = useState<TerminalLinkDragOverlayState | null>(null);
  const [isLinkDragActive, setIsLinkDragActive] = useState(false);
  const updatePaneRuntime = useWindowStore((state) => state.updatePaneRuntime);

  // 确定边框颜色：优先使用自定义 borderColor，否则使用状态颜色
  const customBorderStyle = getCustomBorderStyle(pane.borderColor);
  const activePaneStyle = isActive ? getActivePaneStyle(pane.activeBorderColor) : undefined;
  const defaultBorderColor = getStatusBorderColor(pane.status);
  const borderColorClass = customBorderStyle.style ? 'border-t-2' : `border-t-2 ${defaultBorderColor}`;
  const ringColor = getStatusRingColor(pane.status);

  // 是否显示 pane header（当有 title 或 agentName 时显示）
  const showPaneHeader = !!(pane.title || pane.agentName);
  const showCloseButton = Boolean(onClose && isHovered);

  const syncPtySize = useCallback((terminal: Terminal, options?: { force?: boolean }) => {
    if (!window.electronAPI) {
      return;
    }

    const { cols, rows } = terminal;
    const lastSize = lastSyncedTerminalSizeRef.current;
    if (!options?.force && lastSize.cols === cols && lastSize.rows === rows) {
      return;
    }

    lastSyncedTerminalSizeRef.current = { cols, rows };
    window.electronAPI.ptyResize(windowId, pane.id, cols, rows);
  }, [pane.id, windowId]);

  useEffect(() => {
    sshCwdTrackerRef.current = createSSHCwdTrackerState(pane.cwd);
  }, [pane.id, pane.ssh?.profileId]);

  useEffect(() => {
    sshCwdTrackerRef.current = updateSSHCwdTrackerFromRuntimeCwd(sshCwdTrackerRef.current, pane.cwd);
  }, [pane.cwd]);

  useEffect(() => {
    const sshBinding = pane.ssh;
    if (!sshBinding || !isWindowActive || !isActive) {
      return undefined;
    }

    const unsubscribe = subscribeToPanePtyData(windowId, pane.id, (payload) => {
      const nextRemoteCwd = extractLatestOsc7RemoteCwd(payload.data, sshCwdTrackerRef.current);
      if (!nextRemoteCwd) {
        return;
      }

      sshCwdTrackerRef.current = updateSSHCwdTrackerFromRuntimeCwd(sshCwdTrackerRef.current, nextRemoteCwd);

      if (nextRemoteCwd === pane.cwd) {
        return;
      }

      updatePaneRuntime(windowId, pane.id, { cwd: nextRemoteCwd });
    });

    return unsubscribe;
  }, [isActive, isWindowActive, pane.cwd, pane.id, pane.ssh, updatePaneRuntime, windowId]);

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

  const openExternalUrl = useCallback(async (url: string) => {
    if (!window.electronAPI?.openExternalUrl) {
      return;
    }

    const response = await window.electronAPI.openExternalUrl(url);
    if (
      response &&
      typeof response === 'object' &&
      'success' in response &&
      !(response as { success?: boolean }).success
    ) {
      throw new Error((response as { error?: string }).error || 'Failed to open external URL');
    }
  }, []);

  const clearLinkDragOverlayHideTimer = useCallback(() => {
    if (linkDragOverlayHideTimerRef.current === null) {
      return;
    }

    window.clearTimeout(linkDragOverlayHideTimerRef.current);
    linkDragOverlayHideTimerRef.current = null;
  }, []);

  const hideLinkDragOverlay = useCallback(() => {
    if (isLinkDragActiveRef.current || isLinkDragOverlayHoveredRef.current) {
      return;
    }

    setLinkDragOverlay(null);
  }, []);

  const scheduleLinkDragOverlayHide = useCallback(() => {
    clearLinkDragOverlayHideTimer();
    linkDragOverlayHideTimerRef.current = window.setTimeout(() => {
      linkDragOverlayHideTimerRef.current = null;
      hideLinkDragOverlay();
    }, 90);
  }, [clearLinkDragOverlayHideTimer, hideLinkDragOverlay]);

  const updateLinkDragOverlay = useCallback((payload: TerminalLinkInteractionPayload) => {
    const root = paneRootRef.current;
    const sanitizedUrl = payload.text.trim();
    if (!root || !sanitizedUrl) {
      return;
    }

    clearLinkDragOverlayHideTimer();

    const rootRect = root.getBoundingClientRect();
    const overlayWidth = Math.min(260, Math.max(168, rootRect.width - 24));
    const overlayHeight = 32;
    const left = Math.min(
      Math.max(payload.event.clientX - rootRect.left + 12, 8),
      Math.max(rootRect.width - overlayWidth - 8, 8),
    );
    const top = Math.min(
      Math.max(payload.event.clientY - rootRect.top - overlayHeight - 6, 8),
      Math.max(rootRect.height - overlayHeight - 8, 8),
    );

    setLinkDragOverlay({
      url: sanitizedUrl,
      left,
      top,
    });
  }, [clearLinkDragOverlayHideTimer]);

  const handleTerminalLinkHover = useCallback((payload: TerminalLinkInteractionPayload) => {
    updateLinkDragOverlay(payload);
  }, [updateLinkDragOverlay]);

  const handleTerminalLinkLeave = useCallback(() => {
    scheduleLinkDragOverlayHide();
  }, [scheduleLinkDragOverlayHide]);

  const handleLinkDragOverlayMouseEnter = useCallback(() => {
    isLinkDragOverlayHoveredRef.current = true;
    clearLinkDragOverlayHideTimer();
  }, [clearLinkDragOverlayHideTimer]);

  const handleLinkDragOverlayMouseLeave = useCallback(() => {
    isLinkDragOverlayHoveredRef.current = false;
    scheduleLinkDragOverlayHide();
  }, [scheduleLinkDragOverlayHide]);

  const handleLinkDragOverlayStateChange = useCallback((dragging: boolean) => {
    isLinkDragActiveRef.current = dragging;
    setIsLinkDragActive(dragging);

    if (dragging) {
      clearLinkDragOverlayHideTimer();
      return;
    }

    if (!isLinkDragOverlayHoveredRef.current) {
      setLinkDragOverlay(null);
    }
  }, [clearLinkDragOverlayHideTimer]);

  // 更新 isActive ref
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    onActivateRef.current = onActivate;
  }, [onActivate]);

  useEffect(() => {
    return () => {
      clearLinkDragOverlayHideTimer();
    };
  }, [clearLinkDragOverlayHideTimer]);

  useEffect(() => {
    setLinkDragOverlay(null);
    setIsLinkDragActive(false);
    isLinkDragOverlayHoveredRef.current = false;
    isLinkDragActiveRef.current = false;
    clearLinkDragOverlayHideTimer();
  }, [clearLinkDragOverlayHideTimer, pane.id, windowId]);

  useEffect(() => {
    if (isActive && isWindowActive) {
      return;
    }

    setLinkDragOverlay(null);
    setIsLinkDragActive(false);
    isLinkDragOverlayHoveredRef.current = false;
    isLinkDragActiveRef.current = false;
    clearLinkDragOverlayHideTimer();
  }, [clearLinkDragOverlayHideTimer, isActive, isWindowActive]);

  useEffect(() => {
    const sessionKey = getReplaySessionKey(windowId, pane.id, pane.pid);
    replaySessionKeyRef.current = sessionKey;
    hasCompletedReplayForCurrentSessionRef.current = Boolean(
      sessionKey && completedReplaySessions.has(sessionKey),
    );
  }, [windowId, pane.id, pane.pid]);

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
        syncPtySize(terminal, { force: true });
      }
    });
  }, [syncPtySize]);

  // 监听窗格状态变化：从 Paused 恢复时重置尺寸缓存，强制下次 resize
  useEffect(() => {
    const prevStatus = lastStatusRef.current;
    const currentStatus = pane.status;

    if (currentStatus === WindowStatus.Paused && prevStatus !== WindowStatus.Paused) {
      historyReplayTokenRef.current += 1;
      isHistoryLoadedRef.current = true;
      bufferedLiveDataRef.current = [];
      lastAppliedSeqRef.current = 0;
      suppressPtyWriteRef.current = false;
      hasCompletedReplayForCurrentSessionRef.current = false;
      const sessionKey = replaySessionKeyRef.current;
      if (sessionKey) {
        completedReplaySessions.delete(sessionKey);
      }
      replaySessionKeyRef.current = null;

      if (outputFlushFrameRef.current !== null) {
        cancelAnimationFrame(outputFlushFrameRef.current);
        outputFlushFrameRef.current = null;
      }
      outputChunksRef.current = [];
      outputBufferSizeRef.current = 0;
      terminalRef.current?.reset();
    }

    // 从 Paused 状态恢复到 Running/WaitingForInput 时，重置尺寸缓存
    if (
      prevStatus === WindowStatus.Paused &&
      (currentStatus === WindowStatus.Running || currentStatus === WindowStatus.WaitingForInput || currentStatus === WindowStatus.Restoring)
    ) {
      forceResizeToContainer();
    }

    lastStatusRef.current = currentStatus;
  }, [pane.status, forceResizeToContainer]);

  // 进程退出后通知父组件处理
  useEffect(() => {
    const isExited = pane.status === WindowStatus.Completed || pane.status === WindowStatus.Error;
    if (!isExited) return;
    onProcessExit?.();
  }, [pane.status, onProcessExit]);

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

  useEffect(() => {
    if (!isWindowActive) {
      return;
    }

    forceResizeToContainer();
    const delayedResizeTimer = window.setTimeout(() => {
      forceResizeToContainer();
    }, 180);

    return () => {
      window.clearTimeout(delayedResizeTimer);
    };
  }, [forceResizeToContainer, isWindowActive]);

  useEffect(() => {
    if (lastLayoutPaneCountRef.current === layoutPaneCount) {
      return;
    }

    lastLayoutPaneCountRef.current = layoutPaneCount;

    forceResizeToContainer();
    const delayedResizeTimer = window.setTimeout(() => {
      forceResizeToContainer();
    }, 120);

    return () => {
      window.clearTimeout(delayedResizeTimer);
    };
  }, [forceResizeToContainer, layoutPaneCount]);

  // 监听字体设置更新
  useEffect(() => {
    const unsubscribe = onTerminalSettingsUpdated((settings) => {
      if (!terminalRef.current) return;

      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;

      // 更新字体
      if (settings.fontFamily !== undefined) {
        const fontFamily = settings.fontFamily || TERMINAL_FONT_FAMILY;
        if ('options' in terminal && terminal.options) {
          terminal.options.fontFamily = fontFamily;
        }
      }

      // 更新字号
      if (settings.fontSize !== undefined) {
        const fontSize = settings.fontSize || 14;
        if ('options' in terminal && terminal.options) {
          terminal.options.fontSize = fontSize;
        }
      }

      if (settings.themeChanged && 'options' in terminal && terminal.options) {
        terminal.options.theme = getWindowsTerminalTheme();
      }

      // 重新调整大小以应用新的字体设置
      if (fitAddon) {
        requestAnimationFrame(() => {
          fitAddon.fit();
          if (terminal.rows > 0 && typeof terminal.refresh === 'function') {
            terminal.refresh(0, terminal.rows - 1);
          }
        });
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return undefined;
    }

    const handleWorkspaceSettingsUpdated = (event: Event) => {
      const patch = (event as CustomEvent<{ appearance?: unknown } | undefined>).detail;
      if (!patch?.appearance || !('options' in terminal) || !terminal.options) {
        return;
      }

      terminal.options.theme = getWindowsTerminalTheme();
      if (terminal.rows > 0 && typeof terminal.refresh === 'function') {
        terminal.refresh(0, terminal.rows - 1);
      }
    };

    window.addEventListener(WORKSPACE_SETTINGS_UPDATED_EVENT, handleWorkspaceSettingsUpdated);

    return () => {
      window.removeEventListener(WORKSPACE_SETTINGS_UPDATED_EVENT, handleWorkspaceSettingsUpdated);
    };
  }, []);

  // 初始化 xterm.js
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const terminalLinkHandler = createTerminalLinkHandler(openExternalUrl, {
      onHover: handleTerminalLinkHover,
      onLeave: handleTerminalLinkLeave,
    });
    const terminal = new Terminal({
      cols: 80,
      rows: 30,
      theme: getWindowsTerminalTheme(),
      allowTransparency: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 14,
      lineHeight: 1.2,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      cursorBlink: true,
      cursorStyle: 'block',
      // @ts-ignore - cursorInactiveStyle 是 xterm.js 的有效选项
      cursorInactiveStyle: 'none',
      scrollback: 10000,
      allowProposedApi: true,
      scrollOnUserInput: true,
      smoothScrollDuration: 0, // 禁用平滑滚动，减少晃动
      linkHandler: terminalLinkHandler,
    });

    // 异步加载并应用字体设置
    void (async () => {
      try {
        const response = await window.electronAPI?.getSettings?.();
        if (response?.success && response.data?.terminal) {
          const { fontFamily, fontSize } = response.data.terminal;
          if (fontFamily && 'options' in terminal && terminal.options) {
            terminal.options.fontFamily = fontFamily;
          }
          if (fontSize && 'options' in terminal && terminal.options) {
            terminal.options.fontSize = fontSize;
          }
        }
      } catch (error) {
        console.error('Failed to load font settings:', error);
      }
    })();

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    const webLinkProviderDisposable = registerTerminalWebLinks(terminal, openExternalUrl, {
      onHover: handleTerminalLinkHover,
      onLeave: handleTerminalLinkLeave,
    });
    terminal.open(terminalContainerRef.current);
    const pasteCaptureBlockMs = 300;
    const disposeImeFix = installTerminalImeFix(terminal, imeCompositionStateRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    void ensureTerminalFontsLoaded().finally(() => {
      if (terminalRef.current !== terminal || fitAddonRef.current !== fitAddon) {
        return;
      }

      // FontFace finishes asynchronously in Electron; re-apply metrics once the bundled
      // Nerd glyph font is available so Powerline separators do not fall back to tofu.
      if ('options' in terminal && terminal.options) {
        terminal.options.fontFamily = TERMINAL_FONT_FAMILY;
      }
      fitAddon.fit();
      if (terminal.rows > 0 && typeof terminal.refresh === 'function') {
        terminal.refresh(0, terminal.rows - 1);
      }
    });

    // 批量刷新 PTY 输出：每帧最多写一次，降低高频输出时的重绘抖动
    const flushOutput = () => {
      outputFlushFrameRef.current = null;

      if (outputBufferSizeRef.current === 0 || !terminalRef.current) {
        return;
      }

      if (imeCompositionStateRef.current.isComposing) {
        outputFlushFrameRef.current = requestAnimationFrame(flushOutput);
        return;
      }

      const pending = outputChunksRef.current.length === 1
        ? outputChunksRef.current[0]
        : outputChunksRef.current.join('');
      outputChunksRef.current = [];
      outputBufferSizeRef.current = 0;
      terminalRef.current.write(pending);
    };

    const clearQueuedOutput = () => {
      if (outputFlushFrameRef.current !== null) {
        cancelAnimationFrame(outputFlushFrameRef.current);
        outputFlushFrameRef.current = null;
      }

      outputChunksRef.current = [];
      outputBufferSizeRef.current = 0;
    };

    const queueOutput = (data: string) => {
      if (!data) return;

      // 限制缓冲区大小，避免极端情况下的内存泄漏
      const MAX_BUFFER_SIZE = 100000; // 100KB
      if (outputBufferSizeRef.current + data.length > MAX_BUFFER_SIZE) {
        // 强制刷新缓冲区
        if (outputFlushFrameRef.current !== null) {
          cancelAnimationFrame(outputFlushFrameRef.current);
          outputFlushFrameRef.current = null;
        }
        flushOutput();
      }

      outputChunksRef.current.push(data);
      outputBufferSizeRef.current += data.length;
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
      const isReplayStillCurrent = () => (
        token === historyReplayTokenRef.current
        && terminalRef.current === terminal
      );
      isHistoryLoadedRef.current = false;
      bufferedLiveDataRef.current = [];
      lastAppliedSeqRef.current = 0;
      const sessionKey = replaySessionKeyRef.current;
      // 只有同一会话的后续补回放才屏蔽协议响应，避免把旧历史里的 CSI 查询
      // 再次变成 synthetic reply 注入 live PTY。
      const hasCompletedReplayForCurrentSession = Boolean(
        sessionKey && completedReplaySessions.has(sessionKey),
      ) || hasCompletedReplayForCurrentSessionRef.current;
      const shouldSuppressReplayProtocolReplies = hasCompletedReplayForCurrentSession && !resetTerminal;
      let shouldResumePtyWrites = false;

      if (resetTerminal && terminalRef.current) {
        clearQueuedOutput();
        terminalRef.current.reset();
      }

      try {
        const response = await window.electronAPI?.getPtyHistory?.(pane.id);
        if (!isReplayStillCurrent()) {
          return;
        }

        const historySnapshot = extractPtyHistorySnapshot(response);
        lastAppliedSeqRef.current = historySnapshot.lastSeq;
        const replayData = shouldSuppressReplayProtocolReplies
          ? stripReplayDeviceAttributeQueries(historySnapshot.chunks.join(''))
          : historySnapshot.chunks.join('');
        if (replayData && isReplayStillCurrent()) {
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

        if (!isReplayStillCurrent()) {
          return;
        }

        isHistoryLoadedRef.current = true;
        hasCompletedReplayForCurrentSessionRef.current = true;
        if (sessionKey) {
          completedReplaySessions.add(sessionKey);
        }
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
      syncPtySize(currentTerminal);
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
    const helperTextarea = terminal.textarea ?? terminalContainer?.querySelector('textarea');
    helperTextarea?.addEventListener('paste', suppressNativePaste, true);
    terminalContainer?.addEventListener('paste', suppressNativePaste as EventListener, true);

    // 在捕获阶段接管右键粘贴，阻止 xterm 先污染 helper textarea。
    const handleNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if (!isActiveRef.current) {
        onActivateRef.current();
      }

      void (async () => {
        const text = await readClipboardText();
        if (!text) {
          return;
        }

        const currentTerminal = terminalRef.current;
        if (!currentTerminal || currentTerminal !== terminal) {
          return;
        }

        currentTerminal.focus();
        currentTerminal.paste(text);
      })();
    };

    terminalContainer?.addEventListener('contextmenu', handleNativeContextMenu, true);

    // 告诉 xterm.js 忽略应用级快捷键
    const isMac = window.electronAPI?.platform === 'darwin';
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // 粘贴：macOS 用 ⌘V，Windows/Linux 用 Ctrl+V
      const isPaste = e.type === 'keydown' && e.key.toLowerCase() === 'v' && !e.shiftKey && !e.altKey
        && (isMac ? (e.metaKey && !e.ctrlKey) : (e.ctrlKey && !e.metaKey));
      if (isPaste) {
        e.preventDefault(); // 阻止浏览器默认粘贴行为（否则会通过 xterm textarea 触发第二次粘贴）
        e.stopPropagation();
        suppressNativePasteUntilRef.current = Date.now() + pasteCaptureBlockMs;
        if (isActiveRef.current && window.electronAPI) {
          void readClipboardText().then((text) => {
            if (text && window.electronAPI && isActiveRef.current) {
              // 如果终端开启了 bracketed paste mode，用转义序列包裹粘贴内容
              const wrapped = terminal.modes.bracketedPasteMode
                ? `\x1b[200~${text}\x1b[201~`
                : text;
              window.electronAPI.ptyWrite(windowId, pane.id, wrapped, { source: 'clipboard-shortcut' });
            }
          });
        }
        return false; // 阻止 xterm.js 处理粘贴键
      }

      // Ctrl+Enter / ⌘+Enter：发送换行符到 PTY（用于多行输入）
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      if (isCtrlOrCmd && e.key === 'Enter' && !e.shiftKey) {
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
          window.electronAPI.ptyWrite(windowId, pane.id, '\n', { source: 'ctrl-enter' });
        }
        return false; // 阻止 xterm.js 处理
      }

      if (e.ctrlKey) {
        // 应用级快捷键：不让 xterm 处理
        if (e.key === 'Tab') {
          return false; // xterm 不处理，让事件正常传播
        }
      }
      // 其他按键（包括普通 Enter、Shift+Enter、@ 等）让 xterm.js 正常处理
      return true;
    });

    // 监听用户输入
    const dataDisposable = terminal.onData((data) => {
      if (pane.ssh) {
        const { nextState, resolvedCwd } = applyTerminalInputToSSHCwdTracker(sshCwdTrackerRef.current, data);
        sshCwdTrackerRef.current = nextState;

        if (resolvedCwd && resolvedCwd !== pane.cwd) {
          updatePaneRuntime(windowId, pane.id, { cwd: resolvedCwd });
        }
      }

      // 新会话的首次回放里，xterm 生成的协议响应仍然要回给 PTY；
      // 只有同一会话后续的补回放才需要屏蔽 synthetic reply。
      if (window.electronAPI && !suppressPtyWriteRef.current) {
        window.electronAPI.ptyWrite(windowId, pane.id, data, { source: 'xterm.onData' });
      }
    });

    const binaryDisposable = terminal.onBinary?.((data) => {
      if (window.electronAPI && !suppressPtyWriteRef.current) {
        window.electronAPI.ptyWrite(windowId, pane.id, data, { source: 'xterm.onBinary' });
      }
    });

    // 划选复制：选中文本自动写入剪贴板
    const selectionDisposable = terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (!selection) return;
      // 去掉每行尾部空格填充（xterm.js 复制时会包含终端宽度的空格）
      const trimmed = selection.split('\n').map(line => line.trimEnd()).join('\n');
      void writeClipboardText(trimmed);
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
      disposeImeFix();
      dataDisposable.dispose();
      binaryDisposable?.dispose();
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
      terminalContainer?.removeEventListener('contextmenu', handleNativeContextMenu, true);
      webLinkProviderDisposable.dispose();

      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [windowId, pane.id, openExternalUrl, handleTerminalLinkHover, handleTerminalLinkLeave, syncPtySize]); // 依赖均已 useCallback 包裹，保持终端实例生命周期稳定

  useEffect(() => {
    const previousSession = lastSessionRef.current;
    const previousPid = previousSession.pid;
    const nextPid = pane.pid;
    const resumedFromPaused = previousSession.status === WindowStatus.Paused && previousPid === null && nextPid !== null;
    const shouldReplayFreshSession = (
      terminalRef.current !== null
      && nextPid !== null
      && (
        resumedFromPaused
        || (
          // placeholder pane 已经在首次挂载时完成过空历史初始化，
          // 之后 pid 首次落地时直接走 live PTY 即可；再次重放旧历史会把
          // 启动期的控制序列重新喂给 xterm，可能生成过期协议响应回写到 PTY。
          previousPid !== null
          && nextPid !== previousPid
          && (
            previousSession.status === WindowStatus.Paused
            || previousSession.status === WindowStatus.Completed
            || previousSession.status === WindowStatus.Error
            || previousSession.status === WindowStatus.Restoring
          )
        )
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

  return (
    <div
      ref={paneRootRef}
      className={`relative flex h-full min-h-0 min-w-0 flex-col ${
        isActive ? `ring-1 ${ringColor}` : ''
      }`}
      style={{
        ...activePaneStyle,
        backgroundColor: 'var(--appearance-pane-background)',
        backdropFilter: 'blur(8px)',
        filter: isActive || isHovered ? 'brightness(1.0)' : 'brightness(0.85)',
        transition: 'filter 0.2s ease-in-out',
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Pane Header - 显示 tmux 元数据（title, agentName） */}
      {showPaneHeader && (
        <div
          className="flex items-center justify-between border-b border-[rgb(var(--border))] px-2 py-1"
          style={{ backgroundColor: 'var(--appearance-pane-chrome-background)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Agent 颜色指示器 */}
            {pane.agentColor && (
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: pane.agentColor }}
              />
            )}
            {/* Pane 标题或 Agent 名称 */}
            <span className="truncate font-mono text-xs text-[rgb(var(--muted-foreground))]">
              {pane.title || pane.agentName}
            </span>
          </div>
          <div className="flex min-h-6 min-w-6 items-center justify-center">
            {showCloseButton && (
              <AppTooltip content={t('terminalPane.close')} placement="pane-corner">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose?.();
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_84%,transparent)] text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgb(var(--error)/0.40)] hover:bg-[rgb(var(--error)/0.14)] hover:text-[rgb(var(--foreground))] shadow-lg"
                  aria-label={t('terminalPane.close')}
                >
                  <X size={14} />
                </button>
              </AppTooltip>
            )}
          </div>
        </div>
      )}

      {/* 无 header 时，仅在 hover 时显示关闭按钮 */}
      {!showPaneHeader && (
        <div className="absolute top-1 right-1 z-20">
          {showCloseButton && (
            <AppTooltip content={t('terminalPane.close')} placement="pane-corner">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_84%,transparent)] text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgb(var(--error)/0.40)] hover:bg-[rgb(var(--error)/0.14)] hover:text-[rgb(var(--foreground))] shadow-lg"
                aria-label={t('terminalPane.close')}
              >
                <X size={14} />
              </button>
            </AppTooltip>
          )}
        </div>
      )}

      {linkDragOverlay && (
        <TerminalLinkDragOverlay
          url={linkDragOverlay.url}
          label={t('terminalPane.dragLinkIntoBrowser')}
          left={linkDragOverlay.left}
          top={linkDragOverlay.top}
          isDragging={isLinkDragActive}
          onMouseEnter={handleLinkDragOverlayMouseEnter}
          onMouseLeave={handleLinkDragOverlayMouseLeave}
          onDragStateChange={handleLinkDragOverlayStateChange}
        />
      )}

      {/* 终端容器 */}
      <div
        ref={terminalContainerRef}
        className="min-h-0 min-w-0 flex-1 overflow-hidden px-1"
      />
    </div>
  );
};

TerminalPane.displayName = 'TerminalPane';
