import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Menu, Archive, ChevronDown, Settings } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useWindowStore } from '../stores/windowStore';
import { SidebarWindowItem } from './SidebarWindowItem';
import { GroupStatusIcon } from './GroupStatusIcon';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { getWindowCount, getAllWindowIds } from '../utils/groupLayoutHelpers';
import { WindowStatus } from '../types/window';
import { useI18n } from '../i18n';

interface SidebarProps {
  activeWindowId: string | null;
  activeGroupId?: string | null;
  onWindowSelect: (windowId: string) => void;
  onGroupSelect?: (groupId: string) => void;
  onWindowContextMenu?: (windowId: string, e: React.MouseEvent) => void;
  onSettingsClick?: () => void;
}

/**
 * 侧边栏组件
 * 显示所有窗口列表，支持折叠/展开
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeWindowId,
  activeGroupId,
  onWindowSelect,
  onGroupSelect,
  onWindowContextMenu,
  onSettingsClick,
}) => {
  const { t } = useI18n();
  const {
    sidebarExpanded,
    sidebarWidth,
    toggleSidebar,
    setSidebarWidth,
    getActiveWindows,
    getArchivedWindows,
    getActiveGroups,
    getArchivedGroups,
    windows,
    hideGroupedWindows,
    setHideGroupedWindows,
    terminalSidebarSections,
    setTerminalSidebarSectionExpanded,
  } = useWindowStore();

  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const showArchived = terminalSidebarSections.archived;
  const showLocalTerminals = terminalSidebarSections.local;
  const showSshTerminals = terminalSidebarSections.ssh;

  const activeWindows = getActiveWindows();
  const archivedWindows = getArchivedWindows();
  const activeGroups = getActiveGroups();
  const archivedGroups = getArchivedGroups();

  // 获取属于组的窗口 ID 集合，用于过滤独立窗口
  const groupedWindowIds = new Set(
    activeGroups.flatMap(g => getAllWindowIds(g.layout))
  );

  // 状态排序优先级：WaitingForInput > Running > 其他
  const getStatusSortPriority = (status: WindowStatus): number => {
    switch (status) {
      case WindowStatus.WaitingForInput: return 3;
      case WindowStatus.Running: return 2;
      case WindowStatus.Paused: return 1;
      default: return 0;
    }
  };

  // 将组和独立窗口统一排序
  type SidebarItem =
    | { kind: 'group'; id: string; status: WindowStatus; group: typeof activeGroups[0] }
    | { kind: 'window'; id: string; status: WindowStatus; window: typeof activeWindows[0] };

  const sortedItems = useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = [];

    // 添加组（隐藏窗口组时不显示）
    if (!hideGroupedWindows) {
      for (const group of activeGroups) {
        const windowIds = getAllWindowIds(group.layout);
        const groupWindows = windows.filter(w => windowIds.includes(w.id));
        const statuses = groupWindows.map(w => getAggregatedStatus(w.layout));
        let groupStatus = WindowStatus.Paused;
        if (statuses.some(s => s === WindowStatus.WaitingForInput)) groupStatus = WindowStatus.WaitingForInput;
        else if (statuses.some(s => s === WindowStatus.Running)) groupStatus = WindowStatus.Running;
        else if (statuses.some(s => s === WindowStatus.Restoring)) groupStatus = WindowStatus.Restoring;
        items.push({ kind: 'group', id: group.id, status: groupStatus, group });
      }
    }

    // 添加独立窗口
    for (const w of activeWindows) {
      items.push({ kind: 'window', id: w.id, status: getAggregatedStatus(w.layout), window: w });
    }

    // 排序：第一优先级状态，第二优先级组>窗口
    items.sort((a, b) => {
      const statusDiff = getStatusSortPriority(b.status) - getStatusSortPriority(a.status);
      if (statusDiff !== 0) return statusDiff;
      const kindDiff = (b.kind === 'group' ? 1 : 0) - (a.kind === 'group' ? 1 : 0);
      return kindDiff;
    });

    return items;
  }, [activeGroups, activeWindows, groupedWindowIds, windows, hideGroupedWindows]);

  // 按窗口类型分类（和主界面保持一致）
  const { localWindows, sshWindows } = useMemo(() => {
    const local: SidebarItem[] = [];
    const ssh: SidebarItem[] = [];

    for (const item of sortedItems) {
      if (item.kind === 'window') {
        const windowKind = item.window.kind || 'local';
        if (windowKind === 'ssh') {
          ssh.push(item);
        } else {
          local.push(item);
        }
      } else {
        // 组：根据组内窗口类型分类
        const windowIds = getAllWindowIds(item.group.layout);
        const groupWindows = windows.filter(w => windowIds.includes(w.id));
        const hasLocal = groupWindows.some(w => w.kind !== 'ssh');
        const hasSsh = groupWindows.some(w => w.kind === 'ssh');

        if (hasLocal) {
          local.push(item);
        }
        if (hasSsh) {
          ssh.push(item);
        }
      }
    }

    return { localWindows: local, sshWindows: ssh };
  }, [sortedItems, windows]);

  // 处理宽度调整
  useEffect(() => {
    if (!isResizing) return undefined;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(150, Math.min(400, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  const handleWindowContextMenu = (windowId: string, e: React.MouseEvent) => {
    e.preventDefault();
    onWindowContextMenu?.(windowId, e);
  };

  return (
    <div
      ref={sidebarRef}
      className="flex flex-shrink-0 bg-zinc-900 border-r border-zinc-800 transition-all duration-250 ease-in-out"
      style={{ width: sidebarExpanded ? `${sidebarWidth}px` : '32px' }}
    >
      {/* 侧边栏内容 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部：切换按钮 */}
        <div className={`h-10 flex items-center border-b border-zinc-800 flex-shrink-0 ${sidebarExpanded ? 'justify-start pl-1' : 'justify-center'}`}>
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSidebar(); }}
                  className="w-8 h-8 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-all duration-200"
                  aria-label={sidebarExpanded ? '折叠侧边栏' : '展开侧边栏'}
                >
                  <Menu size={16} className="transition-transform duration-200" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700"
                  side="right"
                  sideOffset={5}
                >
                  {sidebarExpanded ? '折叠侧边栏' : '展开侧边栏'}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>

        {/* 标题（仅展开时显示） - 淡入淡出 */}
        {sidebarExpanded && (
          <div
            className={`px-3 py-2 text-xs font-semibold text-zinc-400 tracking-wide border-b border-zinc-800 flex-shrink-0 transition-opacity duration-200 flex items-center justify-between ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span>Windows</span>
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={hideGroupedWindows}
                    onClick={() => setHideGroupedWindows(!hideGroupedWindows)}
                    className="flex items-center gap-1.5 cursor-pointer normal-case tracking-normal font-normal"
                  >
                    <span className="text-[10px] text-zinc-500">{t('sidebar.hideGroupedWindows')}</span>
              <span
                className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border transition-colors ${
                  hideGroupedWindows
                    ? 'bg-blue-500 border-blue-500'
                    : 'bg-transparent border-zinc-500'
                }`}
              >
                {hideGroupedWindows && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 5.5L4 7.5L8 3" />
                  </svg>
                )}
              </span>
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700"
                    side="top"
                    sideOffset={5}
                  >
                    隐藏窗口组，包括主界面和终端窗口界面
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
        )}

        {/* 活跃窗口和组列表（按类型分类，可折叠） */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* 本地终端分类 */}
          {localWindows.length > 0 && (
            <div>
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => setTerminalSidebarSectionExpanded('local', !showLocalTerminals)}
                      className={`
                        w-full px-3 py-2 flex items-center gap-2
                        text-xs font-semibold text-zinc-400 tracking-wide
                        hover:bg-zinc-700 transition-all duration-200
                        ${!sidebarExpanded ? 'justify-center' : ''}
                      `}
                    >
                      {sidebarExpanded ? (
                        <>
                          <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${
                              showLocalTerminals ? 'rotate-0' : '-rotate-90'
                            }`}
                          />
                          <span className="transition-opacity duration-200">本地终端</span>
                          <span className="ml-auto text-zinc-500 transition-opacity duration-200">
                            ({localWindows.length})
                          </span>
                        </>
                      ) : (
                        <div className="relative">
                          <span className="text-sm">💻</span>
                          {localWindows.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-zinc-600 text-[8px] rounded-full flex items-center justify-center">
                              {localWindows.length}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </Tooltip.Trigger>
                  {!sidebarExpanded && (
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700"
                        side="right"
                        sideOffset={5}
                      >
                        {`本地终端 (${localWindows.length})`}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  )}
                </Tooltip.Root>
              </Tooltip.Provider>

              {showLocalTerminals && localWindows.map((item) => {
                if (item.kind === 'group') {
                  return (
                    <SidebarGroupItem
                      key={item.id}
                      group={item.group}
                      isActive={item.id === activeGroupId}
                      isExpanded={sidebarExpanded}
                      onClick={() => onGroupSelect?.(item.id)}
                    />
                  );
                } else {
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
                }
              })}
            </div>
          )}

          {/* 远程终端分类 */}
          {sshWindows.length > 0 && (
            <div className={localWindows.length > 0 ? 'border-t border-zinc-800' : ''}>
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => setTerminalSidebarSectionExpanded('ssh', !showSshTerminals)}
                      className={`
                        w-full px-3 py-2 flex items-center gap-2
                        text-xs font-semibold text-zinc-400 tracking-wide
                        hover:bg-zinc-700 transition-all duration-200
                        ${!sidebarExpanded ? 'justify-center' : ''}
                      `}
                    >
                      {sidebarExpanded ? (
                        <>
                          <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${
                              showSshTerminals ? 'rotate-0' : '-rotate-90'
                            }`}
                          />
                          <span className="transition-opacity duration-200">远程终端</span>
                          <span className="ml-auto text-zinc-500 transition-opacity duration-200">
                            ({sshWindows.length})
                          </span>
                        </>
                      ) : (
                        <div className="relative">
                          <span className="text-sm">🌐</span>
                          {sshWindows.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-zinc-600 text-[8px] rounded-full flex items-center justify-center">
                              {sshWindows.length}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </Tooltip.Trigger>
                  {!sidebarExpanded && (
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700"
                        side="right"
                        sideOffset={5}
                      >
                        {`远程终端 (${sshWindows.length})`}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  )}
                </Tooltip.Root>
              </Tooltip.Provider>

              {showSshTerminals && sshWindows.map((item) => {
                if (item.kind === 'group') {
                  return (
                    <SidebarGroupItem
                      key={item.id}
                      group={item.group}
                      isActive={item.id === activeGroupId}
                      isExpanded={sidebarExpanded}
                      onClick={() => onGroupSelect?.(item.id)}
                    />
                  );
                } else {
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
                }
              })}
            </div>
          )}

          {/* 归档终端 */}
          {(archivedWindows.length > 0 || archivedGroups.length > 0) && (
            <div className="border-t border-zinc-800">
              {/* 归档标题 */}
              <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => setTerminalSidebarSectionExpanded('archived', !showArchived)}
                      className={`
                        w-full px-3 py-2 flex items-center gap-2
                        text-xs font-semibold text-zinc-400 tracking-wide
                        hover:bg-zinc-700 transition-all duration-200
                        ${!sidebarExpanded ? 'justify-center' : ''}
                      `}
                    >
                {sidebarExpanded ? (
                  <>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${
                        showArchived ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                    <span className="transition-opacity duration-200">归档终端</span>
                    <span className="ml-auto text-zinc-500 transition-opacity duration-200">
                      ({archivedWindows.length + archivedGroups.length})
                    </span>
                  </>
                ) : (
                  <div className="relative">
                    <Archive size={14} />
                    {(archivedWindows.length + archivedGroups.length) > 0 && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-zinc-600 text-[8px] rounded-full flex items-center justify-center">
                        {archivedWindows.length + archivedGroups.length}
                      </span>
                    )}
                  </div>
                )}
                    </button>
                  </Tooltip.Trigger>
                  {!sidebarExpanded && (
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700"
                        side="right"
                        sideOffset={5}
                      >
                        {`归档终端 (${archivedWindows.length + archivedGroups.length})`}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  )}
                </Tooltip.Root>
              </Tooltip.Provider>

              {/* 归档窗口和组列表 */}
              {showArchived && (
                <>
                  {archivedGroups.map((group) => (
                    <SidebarGroupItem
                      key={group.id}
                      group={group}
                      isActive={group.id === activeGroupId}
                      isExpanded={sidebarExpanded}
                      onClick={() => onGroupSelect?.(group.id)}
                    />
                  ))}
                  {archivedWindows.map((window) => (
                    <SidebarWindowItem
                      key={window.id}
                      window={window}
                      isActive={window.id === activeWindowId}
                      isExpanded={sidebarExpanded}
                      onClick={() => onWindowSelect(window.id)}
                      onContextMenu={(e) => handleWindowContextMenu(window.id, e)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* 底部设置按钮 */}
        <div className="border-t border-zinc-800 flex-shrink-0">
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => onSettingsClick?.()}
                  className={`
                    w-full h-10 flex items-center gap-2
                    text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700
                    transition-all duration-200
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
                    className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700"
                    side="right"
                    sideOffset={5}
                  >
                    {t('settings.title')}
                  </Tooltip.Content>
                </Tooltip.Portal>
              )}
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </div>

      {/* 调整宽度的拖拽条（仅展开时显示） */}
      {sidebarExpanded && (
        <div
          className="w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
          onMouseDown={() => setIsResizing(true)}
          aria-label="调整侧边栏宽度"
        />
      )}
    </div>
  );
};

Sidebar.displayName = 'Sidebar';

/**
 * 侧边栏组项组件
 */
interface SidebarGroupItemProps {
  group: import('../../shared/types/window-group').WindowGroup;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
}

const SidebarGroupItem: React.FC<SidebarGroupItemProps> = ({
  group,
  isActive,
  isExpanded,
  onClick,
}) => {
  const { windows } = useWindowStore();
  const windowCount = getWindowCount(group.layout);
  const bgColor = isActive ? 'bg-blue-600/50' : 'bg-zinc-800 hover:bg-zinc-700';

  // 处理点击事件，阻止事件冒泡
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
              className={`w-full h-10 flex items-center justify-center transition-colors ${bgColor}`}
              aria-label={group.name}
            >
              <GroupStatusIcon group={group} windows={windows} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-zinc-800 text-zinc-100 px-2 py-1 rounded text-xs z-[1100] shadow-xl border border-zinc-700"
              side="right"
              sideOffset={5}
            >
              {`${group.name} (${windowCount} 个窗口)`}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full px-3 py-2 flex items-start gap-2 transition-colors text-left rounded ${bgColor}`}
      aria-label={group.name}
    >
      <div className="mt-0.5">
        <GroupStatusIcon group={group} windows={windows} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-100 truncate">{group.name}</div>
        <div className="text-xs text-zinc-400">{windowCount} 个窗口</div>
      </div>
    </button>
  );
};
