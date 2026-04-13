import React, { Suspense, lazy, useCallback, useState, useEffect, useMemo } from 'react';
import { useDrag } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { v4 as uuidv4 } from 'uuid';
import { SplitSquareHorizontal, SplitSquareVertical, Folder, Archive, Square, LogOut, SquareX, RotateCw, Play, Waypoints, FolderTree, Activity, Globe, Plus, MessageSquare } from 'lucide-react';
import { Window, Pane, WindowStatus } from '../types/window';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { Sidebar } from './Sidebar';
import { SplitLayout } from './SplitLayout';
import { RemoteWindowTabs } from './RemoteWindowTabs';
import { useWindowStore } from '../stores/windowStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { IDEIcon } from './icons/IDEIcons';
import { useIDESettings } from '../hooks/useIDESettings';
import { ProjectLinks } from './ProjectLinks';
import { useI18n } from '../i18n';
import { DragItemTypes, DropZone } from './dnd';
import type { BrowserDropDragItem, BrowserToolDragItem, PaneDropResult, WindowCardDragItem, DropResult } from './dnd';
import { createGroup } from '../utils/groupLayoutHelpers';
import { AppTooltip } from './ui/AppTooltip';
import { TerminalTypeLogo } from './icons/TerminalTypeLogo';
import { StatusDot } from './StatusDot';
import { SSHPortForwardDialog } from './SSHPortForwardDialog';
import { SSHSessionStatusBar } from './SSHSessionStatusBar';
import type { SSHCredentialState, SSHProfile } from '../../shared/types/ssh';
import {
  canPaneOpenInIDE,
  canPaneOpenLocalFolder,
  canPaneWatchGitBranch,
  getPaneBackend,
  getPaneCapabilities,
  getWindowKind,
  isBrowserPane,
  isChatPane,
  isCodePane,
  isSessionlessPane,
  isTerminalPane,
} from '../../shared/utils/terminalCapabilities';
import {
  createPaneDraftFromSource,
  startSplitPaneFromSource,
  startWindowPanes,
} from '../utils/paneSessionActions';
import {
  createBrowserPaneDraft,
  DEFAULT_BROWSER_URL,
  getSmartBrowserSplitDirection,
} from '../utils/browserPane';
import { createCodePaneDraft } from '../utils/codePane';
import { createChatPaneDraft, selectPreferredChatLinkedPaneId } from '../utils/chatPane';
import { setBrowserDropDragActive } from '../utils/browserDropDragState';
import { resolveBrowserDropAction } from '../utils/browserDrop';
import {
  applyWindowStartResult,
  createWindowDraftFromSourcePane,
  startClonedWindowFromSourcePane,
} from '../utils/windowSessionActions';
import {
  getOwnedEphemeralSSHWindowIds,
  getPersistableWindows,
  getSSHSessionFamilyWindows,
  getSSHSessionOwnerWindowId,
  getStandaloneSSHWindowsForTarget,
  isEphemeralSSHCloneWindow,
} from '../utils/sshWindowBindings';
import { preventMouseButtonFocus } from '../utils/buttonFocus';

const CHAT_PANE_DEFAULT_SPLIT_SIZES: [number, number] = [0.65, 0.35];

const LazyQuickSwitcher = lazy(async () => ({
  default: (await import('./QuickSwitcher')).QuickSwitcher,
}));

const LazySettingsPanel = lazy(async () => ({
  default: (await import('./SettingsPanel')).SettingsPanel,
}));

const LazySSHSftpDialog = lazy(async () => ({
  default: (await import('./SSHSftpDialog')).SSHSftpDialog,
}));

function getAdjacentSSHWindowId(
  windows: Window[],
  currentWindowId: string,
  excludedWindowIds: Set<string>,
): string | null {
  const currentIndex = windows.findIndex((window) => window.id === currentWindowId);
  if (currentIndex < 0) {
    return null;
  }

  for (let index = currentIndex + 1; index < windows.length; index += 1) {
    const candidate = windows[index];
    if (!excludedWindowIds.has(candidate.id)) {
      return candidate.id;
    }
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = windows[index];
    if (!excludedWindowIds.has(candidate.id)) {
      return candidate.id;
    }
  }

  return null;
}

function SplitBrowserIcon() {
  return (
    <span className="relative inline-flex h-[15px] w-[15px] items-center justify-center">
      <Globe size={15} strokeWidth={1.8} />
      <span className="absolute -right-1 -top-1 flex h-[7px] w-[7px] items-center justify-center text-current">
        <Plus size={6} strokeWidth={2.6} />
      </span>
    </span>
  );
}

function SplitChatIcon() {
  return <MessageSquare size={15} strokeWidth={1.8} />;
}

function isArchiveSwitchCandidate(window: Window): boolean {
  const status = getAggregatedStatus(window.layout);
  return (
    status === WindowStatus.Running
    || status === WindowStatus.WaitingForInput
    || status === WindowStatus.Restoring
  );
}

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
  sshEnabled?: boolean;
  sshProfiles?: SSHProfile[];
  onSSHProfileSaved?: (profile: SSHProfile, credentialState: SSHCredentialState) => void;
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
  sshEnabled = false,
  sshProfiles = [],
  onSSHProfileSaved,
}) => {
  const { t } = useI18n();
  const { enabledIDEs } = useIDESettings();
  const aggregatedStatus = useMemo(() => getAggregatedStatus(terminalWindow.layout), [terminalWindow.layout]);
  const windowKind = useMemo(
    () => getWindowKind(terminalWindow),
    [terminalWindow],
  );
  const panes = useMemo(() => getAllPanes(terminalWindow.layout), [terminalWindow.layout]);
  const terminalPanes = useMemo(
    () => panes.filter((pane) => isTerminalPane(pane)),
    [panes]
  );
  const hasChatPaneInWindow = useMemo(
    () => panes.some((pane) => isChatPane(pane)),
    [panes],
  );
  const existingCodePane = useMemo(
    () => panes.find((pane) => isCodePane(pane)) ?? null,
    [panes],
  );
  const hasCodePaneInWindow = Boolean(existingCodePane);
  const terminalPaneCount = terminalPanes.length;
  const activePane = useMemo(
    () => panes.find((pane) => pane.id === terminalWindow.activePaneId) ?? panes[0],
    [panes, terminalWindow.activePaneId]
  );
  const activeTerminalPane = useMemo(
    () => {
      if (activePane && isTerminalPane(activePane)) {
        return activePane;
      }

      return terminalPanes[0] ?? null;
    },
    [activePane, terminalPanes]
  );
  const preferredChatLinkedPaneId = useMemo(
    () => selectPreferredChatLinkedPaneId(panes),
    [panes],
  );
  const activePaneCapabilities = useMemo(
    () => activeTerminalPane ? getPaneCapabilities(activeTerminalPane) : null,
    [activeTerminalPane]
  );
  const isStandaloneSshWindow = useMemo(
    () => getWindowKind(terminalWindow) === 'ssh',
    [terminalWindow]
  );
  const activeSshRuntimeCwd = activeTerminalPane?.cwd ?? activeTerminalPane?.ssh?.remoteCwd ?? null;
  const visibleIDEs = useMemo(
    () => activePaneCapabilities?.canOpenInIDE ? enabledIDEs : [],
    [activePaneCapabilities?.canOpenInIDE, enabledIDEs]
  );
  const isWindowRunning = aggregatedStatus === WindowStatus.Running || aggregatedStatus === WindowStatus.WaitingForInput;
  const isEphemeralRemoteTab = useMemo(
    () => isEphemeralSSHCloneWindow(terminalWindow),
    [terminalWindow],
  );
  const sidebarActiveWindowId = useMemo(
    () => getSSHSessionOwnerWindowId(terminalWindow) ?? terminalWindow.id,
    [terminalWindow],
  );
  const toolbarWindowLogoVariant = useMemo(
    () => windowKind === 'mixed' ? 'mixed' : windowKind === 'ssh' ? 'ssh' : 'local',
    [windowKind],
  );
  const showRemoteWindowTabs = useMemo(
    () => !embedded && isStandaloneSshWindow,
    [embedded, isStandaloneSshWindow],
  );
  const showToolbarWindowIdentity = useMemo(
    () => Boolean(activePane && isSessionlessPane(activePane) && !showRemoteWindowTabs),
    [activePane, showRemoteWindowTabs],
  );
  const canSplitActivePane = useMemo(
    () => Boolean(activePane && !isChatPane(activePane) && !isCodePane(activePane)),
    [activePane],
  );

  // 鍒囨崲闈㈡澘鐘舵€?
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [sshPortForwardTarget, setSSHPortForwardTarget] = useState<{ windowId: string; paneId: string } | null>(null);
  const [sshSftpOpen, setSSHSftpOpen] = useState(false);
  const [sshMetricsOpen, setSSHMetricsOpen] = useState(false);

  // Store
  const addWindow = useWindowStore((state) => state.addWindow);
  const removeWindow = useWindowStore((state) => state.removeWindow);
  const splitPaneInWindow = useWindowStore((state) => state.splitPaneInWindow);
  const placePaneInWindow = useWindowStore((state) => state.placePaneInWindow);
  const movePaneInWindow = useWindowStore((state) => state.movePaneInWindow);
  const closePaneInWindow = useWindowStore((state) => state.closePaneInWindow);
  const setActivePane = useWindowStore((state) => state.setActivePane);
  const archiveWindow = useWindowStore((state) => state.archiveWindow);
  const updatePane = useWindowStore((state) => state.updatePane);
  const pauseWindowState = useWindowStore((state) => state.pauseWindowState);
  const addGroup = useWindowStore((state) => state.addGroup);
  const setActiveGroup = useWindowStore((state) => state.setActiveGroup);
  const findGroupByWindowId = useWindowStore((state) => state.findGroupByWindowId);
  const addWindowToGroupLayout = useWindowStore((state) => state.addWindowToGroupLayout);
  const removeWindowFromGroupLayout = useWindowStore((state) => state.removeWindowFromGroupLayout);
  const windows = useWindowStore((state) => state.windows);

  const destroyRemoteWindows = useCallback(
    async (windowIds: string[]) => {
      for (const windowId of windowIds) {
        const closeResponse = await window.electronAPI.closeWindow(windowId);
        if (closeResponse && !closeResponse.success) {
          throw new Error(closeResponse.error || `Failed to close remote window ${windowId}`);
        }

        const deleteResponse = await window.electronAPI.deleteWindow(windowId);
        if (deleteResponse && !deleteResponse.success) {
          throw new Error(deleteResponse.error || `Failed to delete remote window ${windowId}`);
        }

        removeWindow(windowId);
      }
    },
    [removeWindow],
  );

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
    const firstWatchablePane = terminalPanes.find((pane) => pane.cwd && canPaneWatchGitBranch(pane));
    if (firstWatchablePane && window.electronAPI?.startGitWatch) {
      window.electronAPI.startGitWatch(terminalWindow.id, firstWatchablePane.cwd).catch((error: any) => {
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
      const paneToClose = panes.find((pane) => pane.id === paneId);
      if (!paneToClose) {
        return;
      }

      if (panes.length <= 1) {
        return;
      }

      const remainingPanes = panes.filter((pane) => pane.id !== paneId);
      if (remainingPanes.length > 0 && remainingPanes.every((pane) => !isTerminalPane(pane))) {
        return;
      }

      closePaneInWindow(terminalWindow.id, paneId);
    },
    [terminalWindow.id, panes, closePaneInWindow]
  );

  const destroyCurrentEphemeralRemoteWindow = useCallback(async () => {
    const allWindows = useWindowStore.getState().windows;
    const closingWindowIdSet = new Set([terminalWindow.id]);
    const scopedWindows = getStandaloneSSHWindowsForTarget(allWindows, terminalWindow.id);
    const adjacentWindowId = getAdjacentSSHWindowId(scopedWindows, terminalWindow.id, closingWindowIdSet);
    const fallbackWindowId = getPersistableWindows(allWindows)
      .find((window) => !window.archived && !closingWindowIdSet.has(window.id))?.id ?? null;
    const nextWindowId = adjacentWindowId ?? fallbackWindowId;

    if (nextWindowId) {
      onWindowSwitch(nextWindowId);
    }

    await destroyRemoteWindows([terminalWindow.id]);

    if (!nextWindowId) {
      onReturn();
    }
  }, [destroyRemoteWindows, onReturn, onWindowSwitch, terminalWindow.id]);

  // 处理窗格进程退出
  const handlePaneExit = useCallback(
    (paneId: string) => {
      if (!terminalWindow) return;
      const currentPanes = getAllPanes(terminalWindow.layout);
      const exitingPane = currentPanes.find((pane) => pane.id === paneId);
      const currentTerminalPaneCount = currentPanes.filter((pane) => isTerminalPane(pane)).length;

      if (exitingPane && isTerminalPane(exitingPane) && currentTerminalPaneCount <= 1) {
        // 单窗格窗口退出
        if (embedded && onStopAndRemoveFromGroup) {
          // 窗口组内：复用"停止并移除"逻辑
          onStopAndRemoveFromGroup(terminalWindow.id);
        } else if (isEphemeralRemoteTab) {
          void destroyCurrentEphemeralRemoteWindow().catch((error) => {
            console.error('Failed to destroy ephemeral remote window after pane exit:', error);
          });
        } else {
          // 单窗口：停止进程 + 暂停窗口 + 返回主界面
          const ownedEphemeralWindowIds = getOwnedEphemeralSSHWindowIds(
            useWindowStore.getState().windows,
            terminalWindow.id,
          );

          const closeCurrentWindow = async () => {
            if (ownedEphemeralWindowIds.length > 0) {
              await destroyRemoteWindows(ownedEphemeralWindowIds);
            }

            if (window.electronAPI) {
              await window.electronAPI.closeWindow(terminalWindow.id);
            }
            pauseWindowState(terminalWindow.id);
          };

          void closeCurrentWindow().catch((error) => {
            console.error('Failed to close window after pane exit:', error);
          });

          if (window.electronAPI) {
            window.electronAPI.switchToUnifiedView().catch(console.error);
          }
        }
      } else {
        // 多窗格：复用关闭窗格逻辑
        closePaneInWindow(terminalWindow.id, paneId);
      }
    },
    [
      terminalWindow,
      embedded,
      onStopAndRemoveFromGroup,
      isEphemeralRemoteTab,
      destroyCurrentEphemeralRemoteWindow,
      pauseWindowState,
      closePaneInWindow,
      destroyRemoteWindows,
    ]
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

      if (isBrowserPane(sourcePane)) {
        const newPaneId = uuidv4();
        const newPane = createBrowserPaneDraft(newPaneId, sourcePane.browser?.url ?? DEFAULT_BROWSER_URL);
        splitPaneInWindow(terminalWindow.id, activePaneId, direction, newPane);
        return;
      }

      if (isCodePane(sourcePane) || isChatPane(sourcePane)) {
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
    [activeTerminalPane?.id, t, terminalWindow.id, terminalWindow.activePaneId, splitPaneInWindow, updatePane, closePaneInWindow]
  );

  const handleSplitBrowserPane = useCallback(() => {
    const activePaneId = terminalWindow.activePaneId;
    if (!activePaneId) {
      return;
    }

    const { getPaneById } = useWindowStore.getState();
    const sourcePane = getPaneById(terminalWindow.id, activePaneId);
    if (!sourcePane) {
      return;
    }

    const newPaneId = uuidv4();
    const sourceUrl = isBrowserPane(sourcePane)
      ? sourcePane.browser?.url ?? DEFAULT_BROWSER_URL
      : DEFAULT_BROWSER_URL;
    const newPane = createBrowserPaneDraft(newPaneId, sourceUrl);
    const direction = getSmartBrowserSplitDirection(terminalWindow.layout, activePaneId);

    splitPaneInWindow(terminalWindow.id, activePaneId, direction, newPane);
    setActivePane(terminalWindow.id, newPaneId);
  }, [setActivePane, splitPaneInWindow, terminalWindow.activePaneId, terminalWindow.id, terminalWindow.layout]);

  const resolveCodePaneRootPath = useCallback((): string | null => {
    if (activePane && isCodePane(activePane) && activePane.code?.rootPath) {
      return activePane.code.rootPath;
    }

    if (activeTerminalPane && activeTerminalPane.backend !== 'ssh' && activeTerminalPane.cwd) {
      return activeTerminalPane.cwd;
    }

    const fallbackLocalTerminalPane = panes.find((pane) => (
      isTerminalPane(pane)
      && pane.backend !== 'ssh'
      && Boolean(pane.cwd)
    ));

    return fallbackLocalTerminalPane?.cwd ?? null;
  }, [activePane, activeTerminalPane, panes]);
  const codePaneRootPath = resolveCodePaneRootPath();
  const codePaneTerminalPanes = panes.filter((pane) => isTerminalPane(pane));
  const isSshOnlyWindow = codePaneTerminalPanes.length > 0
    && codePaneTerminalPanes.every((pane) => pane.backend === 'ssh');

  const handleOpenCodePane = useCallback(() => {
    if (existingCodePane) {
      setActivePane(terminalWindow.id, existingCodePane.id);
      return;
    }

    if (!codePaneRootPath) {
      return;
    }

    const targetPaneId = panes.find((pane) => !isCodePane(pane))?.id ?? terminalWindow.activePaneId;
    if (!targetPaneId) {
      return;
    }

    const newPaneId = uuidv4();
    const newPane = createCodePaneDraft(newPaneId, codePaneRootPath);

    placePaneInWindow(terminalWindow.id, targetPaneId, 'horizontal', newPane, true);
    setActivePane(terminalWindow.id, newPaneId);
  }, [codePaneRootPath, existingCodePane, panes, placePaneInWindow, setActivePane, terminalWindow.activePaneId, terminalWindow.id]);

  const handleSplitChatPane = useCallback(() => {
    const activePaneId = terminalWindow.activePaneId;
    if (!activePaneId || hasChatPaneInWindow) {
      return;
    }

    const { getPaneById } = useWindowStore.getState();
    const sourcePane = getPaneById(terminalWindow.id, activePaneId);
    const newPaneId = uuidv4();
    const linkedPaneId = sourcePane && isChatPane(sourcePane)
      ? selectPreferredChatLinkedPaneId(
          panes,
          sourcePane.chat?.linkedPaneId ?? preferredChatLinkedPaneId,
        )
      : isTerminalPane(sourcePane ?? ({} as Pane))
        ? selectPreferredChatLinkedPaneId(
            panes,
            getPaneBackend(sourcePane as Pane) === 'ssh' ? sourcePane?.id : undefined,
          )
        : preferredChatLinkedPaneId;
    const newPane = createChatPaneDraft(newPaneId, {
      linkedPaneId,
      activeProviderId: sourcePane && isChatPane(sourcePane) ? sourcePane.chat?.activeProviderId : undefined,
      activeModel: sourcePane && isChatPane(sourcePane) ? sourcePane.chat?.activeModel : undefined,
    });
    const direction = getSmartBrowserSplitDirection(terminalWindow.layout, activePaneId);

    splitPaneInWindow(terminalWindow.id, activePaneId, direction, newPane, CHAT_PANE_DEFAULT_SPLIT_SIZES);
    setActivePane(terminalWindow.id, newPaneId);
  }, [hasChatPaneInWindow, panes, preferredChatLinkedPaneId, setActivePane, splitPaneInWindow, terminalWindow.activePaneId, terminalWindow.id, terminalWindow.layout]);

  const activeBrowserDragUrl = useMemo(() => (
    activePane && isBrowserPane(activePane)
      ? activePane.browser?.url ?? DEFAULT_BROWSER_URL
      : DEFAULT_BROWSER_URL
  ), [activePane]);

  const [{ isDragging: isDraggingBrowserTool }, dragBrowserTool, previewBrowserTool] = useDrag<
    BrowserToolDragItem,
    unknown,
    { isDragging: boolean }
  >(() => ({
    type: DragItemTypes.BROWSER_TOOL,
    canDrag: Boolean(terminalWindow.activePaneId),
    item: () => {
      setBrowserDropDragActive(true);

      return {
        type: DragItemTypes.BROWSER_TOOL,
        windowId: terminalWindow.id,
        sourcePaneId: terminalWindow.activePaneId ?? '',
        url: activeBrowserDragUrl,
      };
    },
    end: () => {
      setBrowserDropDragActive(false);
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [activeBrowserDragUrl, terminalWindow.activePaneId, terminalWindow.id]);

  useEffect(() => {
    previewBrowserTool(getEmptyImage(), { captureDraggingState: true });
  }, [previewBrowserTool]);

  const browserToolButtonRef = useCallback((node: HTMLButtonElement | null) => {
    dragBrowserTool(node);
  }, [dragBrowserTool]);

  const handleBrowserPaneDrop = useCallback((
    item: BrowserDropDragItem,
    result: PaneDropResult,
  ) => {
    const targetPane = useWindowStore.getState().getPaneById(terminalWindow.id, result.targetPaneId);
    const action = resolveBrowserDropAction(item, result, targetPane, terminalWindow.id);

    if (action.type === 'none') {
      return;
    }

    if (action.type === 'open-in-browser-pane') {
      updatePane(terminalWindow.id, action.targetPaneId, {
        browser: {
          url: action.url,
        },
      });
      setActivePane(terminalWindow.id, action.targetPaneId);
      return;
    }

    if (action.type === 'create-browser-pane') {
      const newPaneId = uuidv4();
      const newPane = createBrowserPaneDraft(newPaneId, action.url);
      placePaneInWindow(
        terminalWindow.id,
        action.targetPaneId,
        action.direction,
        newPane,
        action.insertBefore,
      );
      setActivePane(terminalWindow.id, newPaneId);
      return;
    }

    movePaneInWindow(
      terminalWindow.id,
      action.paneId,
      action.targetPaneId,
      action.direction,
      action.insertBefore,
    );
    setActivePane(terminalWindow.id, action.paneId);
  }, [movePaneInWindow, placePaneInWindow, setActivePane, terminalWindow.id, updatePane]);

  // 澶勭悊鎵撳紑鏂囦欢澶?
  const handleOpenFolder = useCallback(async () => {
    try {
      if (activeTerminalPane && canPaneOpenLocalFolder(activeTerminalPane) && window.electronAPI) {
        await window.electronAPI.openFolder(activeTerminalPane.cwd);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, [activeTerminalPane]);

  // 澶勭悊鍦?IDE 涓墦寮€
  const handleOpenInIDE = useCallback(async (ide: string) => {
    try {
      if (activeTerminalPane && canPaneOpenInIDE(activeTerminalPane) && window.electronAPI) {
        const response = await window.electronAPI.openInIDE(ide, activeTerminalPane.cwd);
        if (!response.success) {
          console.error(`Failed to open in ${ide}:`, response.error);
        }
      }
    } catch (error) {
      console.error(`Failed to open in ${ide}:`, error);
    }
  }, [activeTerminalPane]);

  // 澶勭悊鏆傚仠绐楀彛
  const handlePauseWindow = useCallback(async () => {
    try {
      if (isEphemeralRemoteTab) {
        await destroyCurrentEphemeralRemoteWindow();
        return;
      }

      const ownedEphemeralWindowIds = getOwnedEphemeralSSHWindowIds(
        useWindowStore.getState().windows,
        terminalWindow.id,
      );

      if (ownedEphemeralWindowIds.length > 0) {
        await destroyRemoteWindows(ownedEphemeralWindowIds);
      }

      // 鍏抽棴绐楀彛锛堢粓姝㈡墍鏈?PTY 杩涚▼锛?
      await window.electronAPI.closeWindow(terminalWindow.id);

      pauseWindowState(terminalWindow.id);
    } catch (error) {
      console.error('Failed to pause window:', error);
    }
  }, [destroyCurrentEphemeralRemoteWindow, destroyRemoteWindows, isEphemeralRemoteTab, pauseWindowState, terminalWindow]);

  // 处理启动窗口
  const handleStartWindow = useCallback(async () => {
    await startWindowPanes(terminalWindow, updatePane);
  }, [terminalWindow, updatePane]);

  const handleOpenSSHPortForwards = useCallback(() => {
    if (!activeTerminalPane || !activePaneCapabilities?.canManagePortForwards) {
      return;
    }

    setSSHPortForwardTarget({
      windowId: terminalWindow.id,
      paneId: activeTerminalPane.id,
    });
  }, [activeTerminalPane, activePaneCapabilities, terminalWindow.id]);

  const handleCloneRemoteWindow = useCallback(async (windowId: string) => {
    if (embedded) {
      return;
    }

    const sourceWindow = useWindowStore.getState().getWindowById(windowId);
    if (!sourceWindow) {
      return;
    }

    const sourcePanes = getAllPanes(sourceWindow.layout);
    const sourcePane = sourcePanes.find((pane) => pane.id === sourceWindow.activePaneId && isTerminalPane(pane))
      ?? sourcePanes.find((pane) => isTerminalPane(pane));
    if (!sourcePane) {
      return;
    }

    const sourcePaneCapabilities = getPaneCapabilities(sourcePane);
    if (getPaneBackend(sourcePane) !== 'ssh' || !sourcePaneCapabilities.canCloneSession) {
      return;
    }

    const ownerWindowId = getSSHSessionOwnerWindowId(sourceWindow) ?? sourceWindow.id;
    const clonedWindowDraft: Window = {
      ...createWindowDraftFromSourcePane(sourceWindow, sourcePane),
      ephemeral: true,
      sshTabOwnerWindowId: ownerWindowId,
    };

    try {
      const result = await startClonedWindowFromSourcePane({
        sourceWindow,
        sourcePane,
        targetWindow: clonedWindowDraft,
      });

      const startedWindow = applyWindowStartResult(clonedWindowDraft, result);
      addWindow(startedWindow);
      onWindowSwitch(startedWindow.id);
    } catch (error) {
      console.error('Failed to clone session into a new window:', error);
    }
  }, [addWindow, embedded, onWindowSwitch]);

  const handleCloseRemoteWindow = useCallback(async (windowId: string) => {
    if (embedded) {
      return;
    }

    const allWindows = useWindowStore.getState().windows;
    const targetWindow = allWindows.find((window) => window.id === windowId);
    if (!targetWindow) {
      return;
    }

    const closeWindowFamily = !isEphemeralSSHCloneWindow(targetWindow)
      && getSSHSessionOwnerWindowId(targetWindow) === targetWindow.id;
    const closingWindowIds = closeWindowFamily
      ? getSSHSessionFamilyWindows(allWindows, windowId).map((window) => window.id)
      : [windowId];
    const closingWindowIdSet = new Set(closingWindowIds);
    const scopedWindows = getStandaloneSSHWindowsForTarget(allWindows, terminalWindow.id);
    const currentWindowWillClose = closingWindowIdSet.has(terminalWindow.id);
    const adjacentWindowId = currentWindowWillClose
      ? getAdjacentSSHWindowId(scopedWindows, terminalWindow.id, closingWindowIdSet)
      : null;
    const fallbackWindowId = currentWindowWillClose
      ? getPersistableWindows(allWindows).find((window) => !window.archived && !closingWindowIdSet.has(window.id))?.id ?? null
      : null;
    const nextWindowId = currentWindowWillClose
      ? adjacentWindowId ?? fallbackWindowId
      : null;

    try {
      if (nextWindowId) {
        onWindowSwitch(nextWindowId);
      }

      await destroyRemoteWindows(closingWindowIds);

      if (!nextWindowId && currentWindowWillClose) {
        onReturn();
      }
    } catch (error) {
      console.error('Failed to close remote window:', error);
    }
  }, [destroyRemoteWindows, embedded, onReturn, onWindowSwitch, terminalWindow.id]);

  const handleOpenSSHSftp = useCallback(() => {
    if (!activeTerminalPane || !activePaneCapabilities?.canOpenSFTP) {
      return;
    }

    setSSHSftpOpen((current) => !current);
  }, [activeTerminalPane, activePaneCapabilities, terminalWindow.id]);

  useEffect(() => {
    if (sshSftpOpen && !activePaneCapabilities?.canOpenSFTP) {
      setSSHSftpOpen(false);
    }
  }, [activePaneCapabilities?.canOpenSFTP, sshSftpOpen]);

  // 处理重启窗口：先停止，再启动
  const handleRestartWindow = useCallback(async () => {
    if (isEphemeralRemoteTab) {
      return;
    }

    await handlePauseWindow();
    await handleStartWindow();
  }, [handlePauseWindow, handleStartWindow, isEphemeralRemoteTab]);

  // 澶勭悊褰掓。绐楀彛
  const handleArchiveWindow = useCallback(async () => {
    if (isEphemeralRemoteTab) {
      return;
    }

    try {
      const ownedEphemeralWindowIds = getOwnedEphemeralSSHWindowIds(
        useWindowStore.getState().windows,
        terminalWindow.id,
      );
      if (ownedEphemeralWindowIds.length > 0) {
        await destroyRemoteWindows(ownedEphemeralWindowIds);
      }

      // 鑾峰彇鎵€鏈夋湭褰掓。鐨勭獥鍙?
      const { windows } = useWindowStore.getState();
      const activeWindows = getPersistableWindows(windows).filter((window) => (
        !window.archived
        && window.id !== terminalWindow.id
        && isArchiveSwitchCandidate(window)
      ));

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
  }, [archiveWindow, destroyRemoteWindows, isEphemeralRemoteTab, onReturn, onWindowSwitch, terminalWindow]);

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
    <div className="flex h-full w-full min-w-0 bg-zinc-900 overflow-hidden">
      {/* 渚ц竟鏍?*/}
      {!embedded && (
        <Sidebar
          activeWindowId={sidebarActiveWindowId}
          onWindowSelect={onWindowSwitch}
          onGroupSelect={onGroupSwitch}
          onSettingsClick={() => setIsSettingsPanelOpen(true)}
          onOpenCodePane={handleOpenCodePane}
          showOpenCodePaneAction={!isSshOnlyWindow || hasCodePaneInWindow}
          canOpenCodePane={hasCodePaneInWindow || Boolean(codePaneRootPath)}
          isCodePaneActive={Boolean(activePane && isCodePane(activePane))}
          sshEnabled={sshEnabled}
          sshProfiles={sshProfiles}
          onSSHProfileSaved={onSSHProfileSaved}
        />
      )}

      {/* 主内容区 */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 - 在嵌入模式下也显示 */}
        <div className="h-8 bg-zinc-900 flex items-stretch justify-between pl-2 pr-4 flex-shrink-0 gap-3">
          <div className="flex min-w-0 flex-1 items-stretch gap-2 overflow-hidden">
            {showToolbarWindowIdentity && (
              <div
                data-testid="toolbar-window-identity"
                className="flex h-full min-w-0 shrink-0 items-center gap-2 border-r border-zinc-800 pr-3"
              >
                <div className="relative shrink-0">
                  <TerminalTypeLogo variant={toolbarWindowLogoVariant} size="xs" />
                  <span className="absolute -bottom-1 -right-1">
                    <StatusDot status={aggregatedStatus} size="sm" />
                  </span>
                </div>
                <span className="max-w-[180px] truncate text-xs font-medium text-zinc-200">
                  {terminalWindow.name}
                </span>
              </div>
            )}
            {showRemoteWindowTabs && (
              <RemoteWindowTabs
                windows={windows}
                activeWindowId={terminalWindow.id}
                cloneLabel={t('terminalView.cloneSshTerminal')}
                closeLabel={t('common.close')}
                onWindowSelect={onWindowSwitch}
                onWindowClone={(windowId) => {
                  void handleCloneRemoteWindow(windowId);
                }}
                onWindowClose={(windowId) => {
                  void handleCloseRemoteWindow(windowId);
                }}
              />
            )}
          </div>

          {/* 鍙充晶鎸夐挳缁?*/}
          <div className="flex shrink-0 items-center self-stretch gap-2">
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
                  tabIndex={-1}
                  aria-label={t('common.openInIDE', { name: ide.name })}
                  onMouseDown={preventMouseButtonFocus}
                  onClick={() => handleOpenInIDE(ide.id)}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                >
                  <IDEIcon icon={ide.icon || ''} size={14} />
                </button>
              </AppTooltip>
            ))}

            {/* 褰掓。鎸夐挳 */}
            {!isEphemeralRemoteTab && (
              <AppTooltip content={t('terminalView.archive')} placement="toolbar-trailing">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t('terminalView.archive')}
                  onMouseDown={preventMouseButtonFocus}
                  onClick={handleArchiveWindow}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                >
                  <Archive size={14} />
                </button>
              </AppTooltip>
            )}

            {/* 鎵撳紑鏂囦欢澶规寜閽?*/}
            {activePaneCapabilities?.canOpenLocalFolder && (
              <AppTooltip content={t('terminalView.openFolder')} placement="toolbar-trailing">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t('terminalView.openFolder')}
                  onMouseDown={preventMouseButtonFocus}
                  onClick={handleOpenFolder}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors"
                >
                  <Folder size={14} />
                </button>
              </AppTooltip>
            )}

            {activePaneCapabilities?.canOpenSFTP && (
              <>
                <AppTooltip content={t('terminalView.openSftp')} placement="toolbar-trailing">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={t('terminalView.openSftp')}
                    onMouseDown={preventMouseButtonFocus}
                    onClick={handleOpenSSHSftp}
                    className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
                      sshSftpOpen
                        ? 'bg-[rgb(var(--primary))]/20 text-[rgb(var(--primary))]'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                    }`}
                  >
                    <FolderTree size={14} />
                  </button>
                </AppTooltip>
                <AppTooltip
                  content={sshMetricsOpen ? t('terminalView.hideSshMonitor') : t('terminalView.showSshMonitor')}
                  placement="toolbar-trailing"
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={sshMetricsOpen ? t('terminalView.hideSshMonitor') : t('terminalView.showSshMonitor')}
                    onMouseDown={preventMouseButtonFocus}
                    onClick={() => setSSHMetricsOpen((current) => !current)}
                    className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
                      sshMetricsOpen
                        ? 'bg-[rgb(var(--primary))]/20 text-[rgb(var(--primary))]'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                    }`}
                  >
                    <Activity size={14} />
                  </button>
                </AppTooltip>
              </>
            )}

            {activePaneCapabilities?.canManagePortForwards && (
              <AppTooltip content={t('terminalView.managePortForwards')} placement="toolbar-trailing">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t('terminalView.managePortForwards')}
                  onMouseDown={preventMouseButtonFocus}
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
                tabIndex={-1}
                aria-label={t('terminalView.splitHorizontal')}
                onMouseDown={preventMouseButtonFocus}
                onClick={() => handleSplitPane('horizontal')}
                disabled={!canSplitActivePane}
                className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SplitSquareHorizontal size={14} />
              </button>
            </AppTooltip>

            {/* 涓婁笅鎷嗗垎鎸夐挳 */}
            <AppTooltip content={t('terminalView.splitVertical')} placement="toolbar-trailing">
              <button
                type="button"
                tabIndex={-1}
                aria-label={t('terminalView.splitVertical')}
                onMouseDown={preventMouseButtonFocus}
                onClick={() => handleSplitPane('vertical')}
                disabled={!canSplitActivePane}
                className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SplitSquareVertical size={14} />
              </button>
            </AppTooltip>

            <AppTooltip content={t('terminalView.splitBrowser')} placement="toolbar-trailing">
              <button
                type="button"
                tabIndex={-1}
                aria-label={t('terminalView.splitBrowser')}
                onClick={handleSplitBrowserPane}
                ref={browserToolButtonRef}
                className={`flex h-6 w-6 items-center justify-center rounded text-zinc-100 transition-colors ${isDraggingBrowserTool ? 'cursor-grabbing bg-[rgb(var(--primary))]/20 text-[rgb(var(--primary))]' : 'cursor-grab hover:bg-zinc-800/80 active:cursor-grabbing'}`}
              >
                <SplitBrowserIcon />
              </button>
            </AppTooltip>

            {activePaneCapabilities?.canOpenSFTP && !hasChatPaneInWindow && (
              <AppTooltip content={t('terminalView.splitChat')} placement="toolbar-trailing">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t('terminalView.splitChat')}
                  onMouseDown={preventMouseButtonFocus}
                  onClick={handleSplitChatPane}
                  className="flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-700"
                >
                  <SplitChatIcon />
                </button>
              </AppTooltip>
            )}

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
                    tabIndex={-1}
                    onMouseDown={preventMouseButtonFocus}
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
                    tabIndex={-1}
                    onMouseDown={preventMouseButtonFocus}
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
                  tabIndex={-1}
                  aria-label={t('terminalView.stop')}
                  onMouseDown={preventMouseButtonFocus}
                  onClick={handlePauseWindow}
                  className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-red-500 transition-colors"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              </AppTooltip>
            )}

            {/* 重启/启动按钮 - 非嵌入模式下始终显示 */}
            {!embedded && !isEphemeralRemoteTab && (
              <AppTooltip
                content={isWindowRunning ? t('terminalView.restart') : t('terminalView.start')}
                placement="toolbar-trailing"
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={isWindowRunning ? t('terminalView.restart') : t('terminalView.start')}
                  onMouseDown={preventMouseButtonFocus}
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
          {sshSftpOpen && activePaneCapabilities?.canOpenSFTP && (
            <Suspense fallback={null}>
              <LazySSHSftpDialog
                open={sshSftpOpen}
                onOpenChange={setSSHSftpOpen}
                windowId={terminalWindow.id}
                paneId={activeTerminalPane?.id ?? null}
                initialPath={activeSshRuntimeCwd}
                currentCwd={activeSshRuntimeCwd}
              />
            </Suspense>
          )}

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
                onBrowserPaneDrop={handleBrowserPaneDrop}
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
                  onBrowserPaneDrop={handleBrowserPaneDrop}
                />
              </DropZone>
            )}
          </div>
        </div>

        {activePaneCapabilities?.canOpenSFTP && sshMetricsOpen && (
          <SSHSessionStatusBar
            windowId={terminalWindow.id}
            paneId={activeTerminalPane?.id ?? null}
            paneStatus={activeTerminalPane?.status ?? null}
            currentCwd={activeSshRuntimeCwd}
            onClose={() => setSSHMetricsOpen(false)}
          />
        )}
      </div>

      {!embedded && (<>
      {/* 蹇€熷垏鎹㈤潰鏉?*/}
      {quickSwitcherOpen && (
        <Suspense fallback={null}>
          <LazyQuickSwitcher
            isOpen={quickSwitcherOpen}
            currentWindowId={terminalWindow.id}
            sshProfiles={sshProfiles}
            onSelect={handleQuickSwitcherSelect}
            onSelectGroup={handleQuickSwitcherSelectGroup}
            onClose={() => setQuickSwitcherOpen(false)}
          />
        </Suspense>
      )}

      {/* 设置面板 */}
      {isSettingsPanelOpen && (
        <Suspense fallback={null}>
          <LazySettingsPanel
            open={isSettingsPanelOpen}
            onClose={() => setIsSettingsPanelOpen(false)}
          />
        </Suspense>
      )}
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
