import React, { useState, useRef, useCallback, useMemo } from 'react';
import { FileCode2, Orbit, Plus, Settings, Square } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useWindowStore } from '../stores/windowStore';
import { SidebarWindowItem } from './SidebarWindowItem';
import { CreateWindowDialog } from './CreateWindowDialog';
import { getAggregatedStatus } from '../utils/layoutHelpers';
import { getWindowCount, getAllWindowIds } from '../utils/groupLayoutHelpers';
import { WindowStatus, type Window } from '../types/window';
import { useI18n } from '../i18n';
import { TerminalTypeLogo } from './icons/TerminalTypeLogo';
import { StatusDot } from './StatusDot';
import { getWindowKind } from '../../shared/utils/terminalCapabilities';
import type { WindowGroup } from '../../shared/types/window-group';
import type { CanvasWorkspace } from '../../shared/types/canvas';
import type { SSHCredentialState, SSHProfile } from '../../shared/types/ssh';
import { SidebarToggleIcon } from './icons/SidebarToggleIcon';
import { getStandaloneSidebarWindows } from '../utils/sshWindowBindings';

interface SidebarProps {
  activeWindowId: string | null;
  activeGroupId?: string | null;
  activeCanvasWorkspaceId?: string | null;
  onWindowSelect: (windowId: string) => void;
  onGroupSelect?: (groupId: string) => void;
  onCanvasSelect?: (canvasWorkspaceId: string) => void;
  onCanvasStop?: (canvasWorkspaceId: string) => void | Promise<void>;
  onWindowContextMenu?: (windowId: string, e: React.MouseEvent) => void;
  onSettingsClick?: () => void;
  onOpenCodePane?: () => void;
  showOpenCodePaneAction?: boolean;
  canOpenCodePane?: boolean;
  isCodePaneActive?: boolean;
  sshEnabled?: boolean;
  sshProfiles?: SSHProfile[];
  onSSHProfileSaved?: (profile: SSHProfile, credentialState: SSHCredentialState) => void;
}

type SidebarItem =
  | { kind: 'group'; id: string; status: WindowStatus; group: WindowGroup; archived: boolean }
  | { kind: 'window'; id: string; status: WindowStatus; window: Window; archived: boolean };

type CanvasSidebarItem = { kind: 'canvas'; id: string; canvasWorkspace: CanvasWorkspace; archived: boolean };

type SidebarWindowIndex = {
  groupWindowIdsByGroupId: Map<string, string[]>;
  groupStatusById: Map<string, WindowStatus>;
  windowById: Map<string, Window>;
  windowKindById: Map<string, NonNullable<Window['kind']>>;
  windowStatusById: Map<string, WindowStatus>;
};

const sidebarTooltipClassName =
  'z-[1100] rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_94%,transparent)] px-2 py-1 text-xs text-[rgb(var(--foreground))] shadow-xl backdrop-blur';
const sidebarIconButtonClassName =
  'flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[rgb(var(--muted-foreground))] transition-colors duration-200 hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]';
const sidebarCollapsedActionButtonClassName =
  'flex h-10 w-full items-center justify-center gap-2 border-b border-[rgb(var(--border))] transition-colors duration-200';
const sidebarCardSurfaceClassName =
  'border border-[rgb(var(--border))]/70 bg-[color-mix(in_srgb,var(--appearance-pane-chrome-background)_100%,transparent)] hover:bg-[rgb(var(--accent))]';
const sidebarQuickActionButtonClassName =
  'flex h-9 w-9 items-center justify-center rounded-xl border border-[rgb(var(--border))]/70 bg-[color-mix(in_srgb,var(--appearance-pane-chrome-background)_92%,rgb(var(--secondary))_8%)] text-[rgb(var(--muted-foreground))] shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0';

function isSidebarVisibleStatus(status: WindowStatus): boolean {
  return (
    status === WindowStatus.Running ||
    status === WindowStatus.WaitingForInput ||
    status === WindowStatus.Restoring
  );
}

function getStatusPriority(status: WindowStatus): number {
  switch (status) {
    case WindowStatus.Running:
      return 4;
    case WindowStatus.WaitingForInput:
      return 3;
    case WindowStatus.Restoring:
      return 2;
    case WindowStatus.Completed:
      return 2;
    case WindowStatus.Error:
    default:
      return 1;
  }
}

function getHighestStatus(statuses: WindowStatus[]): WindowStatus {
  let highestStatus = WindowStatus.Completed;
  let highestPriority = 0;

  statuses.forEach((status) => {
    const priority = getStatusPriority(status);
    if (priority > highestPriority) {
      highestStatus = status;
      highestPriority = priority;
    }
  });

  return highestStatus;
}

/**
 * 侧边栏组件
 * 显示所有窗口列表，支持折叠/展开
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeWindowId,
  activeGroupId,
  activeCanvasWorkspaceId,
  onWindowSelect,
  onGroupSelect,
  onCanvasSelect,
  onCanvasStop,
  onWindowContextMenu,
  onSettingsClick,
  onOpenCodePane,
  showOpenCodePaneAction = false,
  canOpenCodePane = false,
  isCodePaneActive = false,
  sshEnabled = false,
  sshProfiles = [],
  onSSHProfileSaved,
}) => {
  const { t } = useI18n();
  const sidebarExpanded = useWindowStore((state) => state.sidebarExpanded);
  const sidebarWidth = useWindowStore((state) => state.sidebarWidth);
  const toggleSidebar = useWindowStore((state) => state.toggleSidebar);
  const setSidebarWidth = useWindowStore((state) => state.setSidebarWidth);
  const windows = useWindowStore((state) => state.windows);
  const groups = useWindowStore((state) => state.groups);
  const canvasWorkspaces = useWindowStore((state) => state.canvasWorkspaces);
  const startedCanvasWorkspaceIds = useWindowStore((state) => state.startedCanvasWorkspaceIds);
  const mruList = useWindowStore((state) => state.mruList);
  const terminalSidebarFilter = useWindowStore((state) => state.terminalSidebarFilter);
  const setTerminalSidebarFilter = useWindowStore((state) => state.setTerminalSidebarFilter);

  const [isResizing, setIsResizing] = useState(false);
  const [isCreateWindowDialogOpen, setIsCreateWindowDialogOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  if (!isResizingRef.current) {
    sidebarWidthRef.current = sidebarWidth;
  }

  const activeWindows = useMemo(
    () => getStandaloneSidebarWindows(
      windows.filter((window) => !window.archived),
      activeWindowId,
      mruList,
    ),
    [activeWindowId, mruList, windows],
  );
  const archivedWindows = useMemo(
    () => getStandaloneSidebarWindows(
      windows.filter((window) => window.archived),
      activeWindowId,
      mruList,
    ),
    [activeWindowId, mruList, windows],
  );
  const activeGroups = useMemo(
    () => groups.filter((group) => !group.archived),
    [groups],
  );
  const archivedGroups = useMemo(
    () => groups.filter((group) => group.archived),
    [groups],
  );
  const activeCanvasItems = useMemo<CanvasSidebarItem[]>(() => (
    canvasWorkspaces
      .filter((canvasWorkspace) => startedCanvasWorkspaceIds.includes(canvasWorkspace.id))
      .filter((canvasWorkspace) => !canvasWorkspace.archived)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((canvasWorkspace) => ({
        kind: 'canvas',
        id: canvasWorkspace.id,
        canvasWorkspace,
        archived: false,
      }))
  ), [canvasWorkspaces, startedCanvasWorkspaceIds]);
  const sidebarWindowIndex = useMemo<SidebarWindowIndex>(() => {
    const windowById = new Map(windows.map((window) => [window.id, window]));
    const windowKindById = new Map<string, NonNullable<Window['kind']>>();
    const windowStatusById = new Map<string, WindowStatus>();
    const groupWindowIdsByGroupId = new Map<string, string[]>();
    const groupStatusById = new Map<string, WindowStatus>();

    windows.forEach((window) => {
      windowKindById.set(window.id, getWindowKind(window));
      windowStatusById.set(window.id, getAggregatedStatus(window.layout));
    });

    groups.forEach((group) => {
      const windowIds = getAllWindowIds(group.layout);
      groupWindowIdsByGroupId.set(group.id, windowIds);
      groupStatusById.set(group.id, getHighestStatus(
        windowIds
          .map((windowId) => windowStatusById.get(windowId))
          .filter((status): status is WindowStatus => Boolean(status)),
      ));
    });

    return {
      groupWindowIdsByGroupId,
      groupStatusById,
      windowById,
      windowKindById,
      windowStatusById,
    };
  }, [groups, windows]);
  const activeGroupedWindowIds = useMemo(() => {
    const ids = new Set<string>();
    activeGroups.forEach((group) => {
      sidebarWindowIndex.groupWindowIdsByGroupId.get(group.id)?.forEach((windowId) => ids.add(windowId));
    });
    return ids;
  }, [activeGroups, sidebarWindowIndex.groupWindowIdsByGroupId]);
  const archivedGroupedWindowIds = useMemo(() => {
    const ids = new Set<string>();
    archivedGroups.forEach((group) => {
      sidebarWindowIndex.groupWindowIdsByGroupId.get(group.id)?.forEach((windowId) => ids.add(windowId));
    });
    return ids;
  }, [archivedGroups, sidebarWindowIndex.groupWindowIdsByGroupId]);

  const activeItems = useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = [];

    for (const group of activeGroups) {
      const status = sidebarWindowIndex.groupStatusById.get(group.id) ?? WindowStatus.Completed;
      if (!isSidebarVisibleStatus(status)) {
        continue;
      }

      items.push({ kind: 'group', id: group.id, status, group, archived: false });
    }

    for (const w of activeWindows) {
      if (activeGroupedWindowIds.has(w.id)) {
        continue;
      }

      const status = sidebarWindowIndex.windowStatusById.get(w.id) ?? WindowStatus.Completed;
      if (!isSidebarVisibleStatus(status)) {
        continue;
      }

      items.push({ kind: 'window', id: w.id, status, window: w, archived: false });
    }

    return items;
  }, [activeGroupedWindowIds, activeGroups, activeWindows, sidebarWindowIndex]);

  const archivedItems = useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = [];

    for (const group of archivedGroups) {
      const status = sidebarWindowIndex.groupStatusById.get(group.id) ?? WindowStatus.Completed;
      if (!isSidebarVisibleStatus(status)) {
        continue;
      }

      items.push({ kind: 'group', id: group.id, status, group, archived: true });
    }

    for (const w of archivedWindows) {
      if (archivedGroupedWindowIds.has(w.id)) {
        continue;
      }

      const status = sidebarWindowIndex.windowStatusById.get(w.id) ?? WindowStatus.Completed;
      if (!isSidebarVisibleStatus(status)) {
        continue;
      }

      items.push({ kind: 'window', id: w.id, status, window: w, archived: true });
    }

    return items;
  }, [archivedGroupedWindowIds, archivedGroups, archivedWindows, sidebarWindowIndex]);

  // 按窗口类型分类（和主界面保持一致）
  const { localWindows, sshWindows } = useMemo(() => {
    const local: SidebarItem[] = [];
    const ssh: SidebarItem[] = [];

    for (const item of activeItems) {
      if (item.kind === 'window') {
        const windowKind = sidebarWindowIndex.windowKindById.get(item.id) ?? 'local';
        if (windowKind === 'ssh') {
          ssh.push(item);
        } else {
          local.push(item);
        }
      } else {
        // 组：根据组内窗口类型分类
        const windowIds = sidebarWindowIndex.groupWindowIdsByGroupId.get(item.id) ?? [];
        let hasLocal = false;
        let hasSsh = false;

        windowIds.forEach((windowId) => {
          if (!sidebarWindowIndex.windowById.has(windowId)) {
            return;
          }

          const windowKind = sidebarWindowIndex.windowKindById.get(windowId) ?? 'local';
          if (windowKind === 'ssh') {
            hasSsh = true;
          } else {
            hasLocal = true;
          }
        });

        if (hasLocal) {
          local.push(item);
        }
        if (hasSsh) {
          ssh.push(item);
        }
      }
    }

    return { localWindows: local, sshWindows: ssh };
  }, [activeItems, sidebarWindowIndex]);

  const allItems = useMemo(
    () => [...activeCanvasItems, ...activeItems, ...archivedItems],
    [activeCanvasItems, activeItems, archivedItems],
  );

  const visibleItems = useMemo(() => {
    if (terminalSidebarFilter === 'local') {
      return localWindows;
    }

    if (terminalSidebarFilter === 'ssh') {
      return sshWindows;
    }

    if (terminalSidebarFilter === 'canvas') {
      return activeCanvasItems;
    }

    if (terminalSidebarFilter === 'archived') {
      return archivedItems;
    }

    return allItems;
  }, [activeCanvasItems, allItems, archivedItems, localWindows, sshWindows, terminalSidebarFilter]);

  const handleWindowContextMenu = (windowId: string, e: React.MouseEvent) => {
    e.preventDefault();
    onWindowContextMenu?.(windowId, e);
  };

  const handleOpenCreateWindowDialog = useCallback(() => {
    setIsCreateWindowDialogOpen(true);
  }, []);

  const applySidebarWidthPreview = useCallback((width: number) => {
    if (!sidebarRef.current) {
      return;
    }

    sidebarRef.current.style.width = `${width}px`;
  }, []);

  const handleResizeMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startWidth = sidebarWidthRef.current;
    const startX = event.clientX;
    let nextWidth = startWidth;

    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (mouseEvent: MouseEvent) => {
      nextWidth = Math.max(150, Math.min(400, startWidth + mouseEvent.clientX - startX));
      sidebarWidthRef.current = nextWidth;
      applySidebarWidthPreview(nextWidth);
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const handleMouseUp = () => {
      cleanup();
      isResizingRef.current = false;
      setIsResizing(false);
      setSidebarWidth(nextWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [applySidebarWidthPreview, setSidebarWidth]);

  const renderSidebarItem = (item: SidebarItem | CanvasSidebarItem) => {
    if (item.kind === 'canvas') {
      return (
        <SidebarCanvasItem
          key={item.id}
          canvasWorkspace={item.canvasWorkspace}
          isActive={item.id === activeCanvasWorkspaceId}
          isExpanded={sidebarExpanded}
          onClick={() => onCanvasSelect?.(item.id)}
          onStop={onCanvasStop ? () => onCanvasStop(item.id) : undefined}
        />
      );
    }

    if (item.kind === 'group') {
      return (
        <SidebarGroupItem
          key={item.id}
          group={item.group}
          status={item.status}
          isActive={item.id === activeGroupId}
          isExpanded={sidebarExpanded}
          onClick={() => onGroupSelect?.(item.id)}
        />
      );
    }

    return (
      <SidebarWindowItem
        key={item.id}
        window={item.window}
        isActive={item.id === activeWindowId}
        isExpanded={sidebarExpanded}
        onClick={() => onWindowSelect(item.id)}
        onContextMenu={(e) => handleWindowContextMenu(item.id, e)}
      />
    );
  };

  return (
    <div
      ref={sidebarRef}
      className={`flex flex-shrink-0 border-r border-[rgb(var(--border))] ${
        isResizing ? '' : 'transition-all duration-250 ease-in-out'
      }`}
      style={{
        width: sidebarExpanded ? `${sidebarWidthRef.current}px` : '32px',
        backgroundColor: 'var(--appearance-pane-chrome-background)',
      }}
    >
      {/* 侧边栏内容 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部：切换按钮 */}
        <div className={`h-10 flex-shrink-0 items-center border-b border-[rgb(var(--border))] ${sidebarExpanded ? 'justify-start pl-1' : 'justify-center'}`}>
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSidebar(); }}
                  className={sidebarIconButtonClassName}
                  aria-label={sidebarExpanded ? '折叠侧边栏' : '展开侧边栏'}
                >
                  <SidebarToggleIcon
                    size={18}
                    expanded={sidebarExpanded}
                    className="transition-all duration-200"
                  />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className={sidebarTooltipClassName}
                  side="right"
                  sideOffset={5}
                >
                  {sidebarExpanded ? '折叠侧边栏' : '展开侧边栏'}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>

        {/* 标题（仅展开时显示） */}
        {sidebarExpanded && (
          <div className="flex-shrink-0 space-y-2 border-b border-[rgb(var(--border))] px-3 py-2">
            <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-[rgb(var(--muted-foreground))]">
              <span>Windows</span>
              <span className="rounded-full bg-[rgb(var(--accent))] px-2 py-0.5 text-[10px] text-[rgb(var(--foreground))]">
                {visibleItems.length}
              </span>
            </div>
            <select
              aria-label={t('sidebar.terminalFilterLabel')}
              value={terminalSidebarFilter}
              onChange={(event) => setTerminalSidebarFilter(event.target.value as typeof terminalSidebarFilter)}
              className="h-8 w-full rounded-md border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_78%,transparent)] px-2 text-xs text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
            >
              <option value="all">{t('sidebar.tab.all')}</option>
              <option value="local">{t('sidebar.tab.local')}</option>
              <option value="ssh">{t('sidebar.tab.ssh')}</option>
              <option value="canvas">{t('sidebar.tab.canvas')}</option>
              <option value="archived">{t('sidebar.tab.archived')}</option>
            </select>
          </div>
        )}

        {/* 活跃窗口和组列表（按类型分类，可折叠） */}
        <div
          data-testid="terminal-sidebar-scroll-region"
          className={`flex-1 overflow-y-auto overflow-x-hidden ${
            sidebarExpanded
              ? 'terminal-sidebar-scroll-region terminal-sidebar-scroll-region-expanded'
              : 'terminal-sidebar-scroll-region terminal-sidebar-scroll-region-collapsed'
          }`}
        >
          {visibleItems.length > 0 && (
            <div>
              {visibleItems.map(renderSidebarItem)}
            </div>
          )}
        </div>

        {/* 底部操作区 */}
        <div className={`flex-shrink-0 border-t border-[rgb(var(--border))] ${sidebarExpanded ? 'px-3 py-3' : ''}`}>
          {sidebarExpanded ? (
            <div className="flex items-center justify-center gap-2">
              {showOpenCodePaneAction && (
                <Tooltip.Provider>
                  <Tooltip.Root delayDuration={300}>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => onOpenCodePane?.()}
                        disabled={!canOpenCodePane}
                        className={`${sidebarQuickActionButtonClassName} ${
                          isCodePaneActive
                            ? 'border-[rgb(var(--primary))]/30 bg-[rgb(var(--accent))] text-[rgb(var(--foreground))]'
                            : ''
                        }`}
                        aria-label={t('terminalView.openCode')}
                      >
                        <FileCode2 size={16} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className={sidebarTooltipClassName}
                        side="top"
                        sideOffset={6}
                      >
                        {t('terminalView.openCode')}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
              )}

              <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={handleOpenCreateWindowDialog}
                      className={`${sidebarQuickActionButtonClassName} text-[rgb(var(--foreground))]`}
                      aria-label={t('common.newTerminal')}
                    >
                      <Plus size={16} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className={sidebarTooltipClassName}
                      side="top"
                      sideOffset={6}
                    >
                      {t('common.newTerminal')}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>

              <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => onSettingsClick?.()}
                      className={sidebarQuickActionButtonClassName}
                      aria-label={t('settings.title')}
                    >
                      <Settings size={16} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className={sidebarTooltipClassName}
                      side="top"
                      sideOffset={6}
                    >
                      {t('settings.title')}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          ) : (
            <>
          {showOpenCodePaneAction && (
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={() => onOpenCodePane?.()}
                    disabled={!canOpenCodePane}
                    className={`
                      ${sidebarCollapsedActionButtonClassName}
                      ${sidebarExpanded ? 'px-3 justify-start' : 'justify-center'}
                      ${isCodePaneActive
                        ? 'bg-[rgb(var(--accent))] text-[rgb(var(--foreground))]'
                        : 'text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]'}
                      disabled:cursor-not-allowed disabled:opacity-40
                    `}
                    aria-label={t('terminalView.openCode')}
                  >
                    <FileCode2 size={16} />
                    {sidebarExpanded && (
                      <span className="text-sm transition-opacity duration-200">
                        {t('terminalView.openCode')}
                      </span>
                    )}
                  </button>
                </Tooltip.Trigger>
                {!sidebarExpanded && (
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className={sidebarTooltipClassName}
                      side="right"
                      sideOffset={5}
                    >
                      {t('terminalView.openCode')}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                )}
              </Tooltip.Root>
            </Tooltip.Provider>
          )}

          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={handleOpenCreateWindowDialog}
                  className={`
                    ${sidebarCollapsedActionButtonClassName}
                    bg-[color-mix(in_srgb,rgb(var(--secondary))_84%,transparent)] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]
                    ${sidebarExpanded ? 'px-3 justify-start' : 'justify-center'}
                  `}
                  aria-label={t('common.newTerminal')}
                >
                  <Plus size={16} />
                  {sidebarExpanded && (
                    <span className="text-sm font-medium transition-opacity duration-200">
                      {t('common.newTerminal')}
                    </span>
                  )}
                </button>
              </Tooltip.Trigger>
              {!sidebarExpanded && (
                <Tooltip.Portal>
                  <Tooltip.Content
                    className={sidebarTooltipClassName}
                    side="right"
                    sideOffset={5}
                  >
                    {t('common.newTerminal')}
                  </Tooltip.Content>
                </Tooltip.Portal>
              )}
            </Tooltip.Root>
          </Tooltip.Provider>

          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => onSettingsClick?.()}
                  className={`
                    ${sidebarCollapsedActionButtonClassName}
                    border-b-0 text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]
                    ${sidebarExpanded ? 'px-3 justify-start' : 'justify-center'}
                  `}
                  aria-label={t('settings.title')}
                >
                  <Settings size={16} />
                  {sidebarExpanded && (
                    <span className="text-sm transition-opacity duration-200">
                      {t('settings.title')}
                    </span>
                  )}
                </button>
              </Tooltip.Trigger>
              {!sidebarExpanded && (
                <Tooltip.Portal>
                  <Tooltip.Content
                    className={sidebarTooltipClassName}
                    side="right"
                    sideOffset={5}
                  >
                    {t('settings.title')}
                  </Tooltip.Content>
                </Tooltip.Portal>
              )}
            </Tooltip.Root>
          </Tooltip.Provider>
            </>
          )}
        </div>
      </div>

      {/* 调整宽度的拖拽条（仅展开时显示） */}
      {sidebarExpanded && (
        <div
          className="w-1 cursor-col-resize bg-transparent transition-colors hover:bg-[rgb(var(--primary))]/60"
          onMouseDown={handleResizeMouseDown}
          aria-label="调整侧边栏宽度"
        />
      )}

      <CreateWindowDialog
        open={isCreateWindowDialogOpen}
        onOpenChange={setIsCreateWindowDialogOpen}
        sshEnabled={sshEnabled}
        sshProfiles={sshProfiles}
        onSSHProfileSaved={onSSHProfileSaved}
        onLocalWindowCreated={(window) => onWindowSelect(window.id)}
      />
    </div>
  );
};

Sidebar.displayName = 'Sidebar';

/**
 * 侧边栏组项组件
 */
interface SidebarGroupItemProps {
  group: import('../../shared/types/window-group').WindowGroup;
  status: WindowStatus;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
}

const SidebarGroupItem: React.FC<SidebarGroupItemProps> = ({
  group,
  status,
  isActive,
  isExpanded,
  onClick,
}) => {
  const { t } = useI18n();
  const windowCount = getWindowCount(group.layout);
  const itemSurfaceClassName = isActive
    ? 'border-[rgb(var(--border))] bg-[rgb(var(--accent))]'
    : sidebarCardSurfaceClassName;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
  }, [onClick]);

  if (!isExpanded) {
    return (
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleClick}
              className={`flex h-10 w-full items-center justify-center border transition-colors ${itemSurfaceClassName}`}
              aria-label={group.name}
            >
              <div className="relative">
                <TerminalTypeLogo variant="group" size="xs" />
                <span className="absolute -bottom-1 -right-1">
                  <StatusDot status={status} size="sm" />
                </span>
              </div>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className={sidebarTooltipClassName}
              side="right"
              sideOffset={5}
            >
              {`${group.name} (${t('quickSwitcher.windowCount', { count: windowCount })})`}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${itemSurfaceClassName}`}
      aria-label={group.name}
    >
      <div className="relative mt-0.5 flex-shrink-0">
        <TerminalTypeLogo variant="group" size="sm" />
        <span className="absolute -bottom-1 -right-1">
          <StatusDot status={status} size="sm" />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{group.name}</div>
        <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('quickSwitcher.windowCount', { count: windowCount })}</div>
      </div>
    </button>
  );
};

interface SidebarCanvasItemProps {
  canvasWorkspace: CanvasWorkspace;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onStop?: () => void | Promise<void>;
}

const SidebarCanvasItem: React.FC<SidebarCanvasItemProps> = ({
  canvasWorkspace,
  isActive,
  isExpanded,
  onClick,
  onStop,
}) => {
  const { t, language } = useI18n();
  const itemSurfaceClassName = isActive
    ? 'border-[rgb(var(--border))] bg-[rgb(var(--accent))]'
    : sidebarCardSurfaceClassName;
  const blockCount = canvasWorkspace.blocks.length;
  const windowBlockCount = canvasWorkspace.blocks.filter((block) => block.type === 'window').length;
  const relativeTime = useMemo(() => {
    try {
      return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(0, 'second');
    } catch {
      return '';
    }
  }, [language]);

  const updatedAt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(language, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(canvasWorkspace.updatedAt));
    } catch {
      return relativeTime;
    }
  }, [canvasWorkspace.updatedAt, language, relativeTime]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
  }, [onClick]);

  if (!isExpanded) {
    return (
      <Tooltip.Provider>
        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleClick}
              className={`flex h-10 w-full items-center justify-center border transition-colors ${itemSurfaceClassName}`}
              aria-label={canvasWorkspace.name}
            >
              <div className="relative">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">
                  <Orbit size={14} />
                </span>
              </div>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className={sidebarTooltipClassName}
              side="right"
              sideOffset={5}
            >
              {`${canvasWorkspace.name} (${t('quickSwitcher.canvasBlockCount', { count: blockCount })})`}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${itemSurfaceClassName}`}
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--primary))]/22 bg-[linear-gradient(180deg,rgb(var(--primary))/0.14_0%,color-mix(in_srgb,rgb(var(--card))_72%,transparent)_100%)] text-[rgb(var(--foreground))]">
        <Orbit size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{canvasWorkspace.name}</div>
        <div className="mt-0.5 truncate text-xs text-[rgb(var(--muted-foreground))]">
          {canvasWorkspace.workingDirectory || t('canvas.cardSubtitle')}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[rgb(var(--muted-foreground))]">
          <span>{t('canvas.windowBlocks', { count: windowBlockCount })}</span>
          <span>·</span>
          <span>{t('quickSwitcher.canvasBlockCount', { count: blockCount })}</span>
          <span>·</span>
          <span>{updatedAt}</span>
        </div>
      </div>
      {onStop ? (
        <button
          type="button"
          aria-label={t('terminalView.stop')}
          title={t('terminalView.stop')}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void onStop();
          }}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-[color-mix(in_srgb,rgb(var(--secondary))_72%,transparent)] text-red-500 transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]"
        >
          <Square size={13} fill="currentColor" />
        </button>
      ) : null}
    </button>
  );
};
