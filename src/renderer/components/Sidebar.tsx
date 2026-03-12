import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Menu, Archive, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { SidebarWindowItem } from './SidebarWindowItem';
import { getAllPanes } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';

interface SidebarProps {
  activeWindowId: string | null;
  onWindowSelect: (windowId: string) => void;
  onWindowContextMenu?: (windowId: string, e: React.MouseEvent) => void;
  onSettingsClick?: () => void;
}

/**
 * 侧边栏组件
 * 显示所有窗口列表，支持折叠/展开
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeWindowId,
  onWindowSelect,
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
  } = useWindowStore();

  const [isResizing, setIsResizing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const activeWindows = getActiveWindows();
  const archivedWindows = getArchivedWindows();

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

  const handleOpenInIDE = useCallback(async (ide: string, path: string) => {
    try {
      const response = await window.electronAPI.openInIDE(ide, path);
      if (!response.success) {
        console.error(`Failed to open in ${ide}:`, response.error);
      }
    } catch (error) {
      console.error(`Failed to open in ${ide}:`, error);
    }
  }, []);

  const handleOpenFolder = useCallback(async (path: string) => {
    try {
      await window.electronAPI.openFolder(path);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, []);

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
          <button
            onClick={toggleSidebar}
            className="w-8 h-8 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-all duration-200"
            aria-label={sidebarExpanded ? '折叠侧边栏' : '展开侧边栏'}
            title={sidebarExpanded ? '折叠侧边栏 (Ctrl+B)' : '展开侧边栏 (Ctrl+B)'}
          >
            <Menu size={16} className="transition-transform duration-200" />
          </button>
        </div>

        {/* 标题（仅展开时显示） - 淡入淡出 */}
        {sidebarExpanded && (
          <div
            className={`px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 flex-shrink-0 transition-opacity duration-200 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}
          >
            窗口
          </div>
        )}

        {/* 活跃窗口列表 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {activeWindows.map((window) => (
            <SidebarWindowItem
              key={window.id}
              window={window}
              isActive={window.id === activeWindowId}
              isExpanded={sidebarExpanded}
              onClick={() => onWindowSelect(window.id)}
              onContextMenu={(e) => handleWindowContextMenu(window.id, e)}
              onOpenInIDE={handleOpenInIDE}
              onOpenFolder={handleOpenFolder}
            />
          ))}

          {/* 归档区域 */}
          {archivedWindows.length > 0 && (
            <div className="border-t border-zinc-800 mt-2">
              {/* 归档标题 */}
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`
                  w-full px-3 py-2 flex items-center gap-2
                  text-xs font-semibold text-zinc-400 uppercase tracking-wider
                  hover:bg-zinc-700 transition-all duration-200
                  ${!sidebarExpanded ? 'justify-center' : ''}
                `}
                title={sidebarExpanded ? undefined : `归档 (${archivedWindows.length})`}
              >
                {sidebarExpanded ? (
                  <>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${
                        showArchived ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                    <span className="transition-opacity duration-200">归档</span>
                    <span className="ml-auto text-zinc-500 transition-opacity duration-200">
                      ({archivedWindows.length})
                    </span>
                  </>
                ) : (
                  <div className="relative">
                    <Archive size={14} />
                    {archivedWindows.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-zinc-600 text-[8px] rounded-full flex items-center justify-center">
                        {archivedWindows.length}
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* 归档窗口列表 */}
              {showArchived && archivedWindows.map((window) => (
                <SidebarWindowItem
                  key={window.id}
                  window={window}
                  isActive={window.id === activeWindowId}
                  isExpanded={sidebarExpanded}
                  onClick={() => onWindowSelect(window.id)}
                  onContextMenu={(e) => handleWindowContextMenu(window.id, e)}
                  onOpenInIDE={handleOpenInIDE}
                  onOpenFolder={handleOpenFolder}
                />
              ))}
            </div>
          )}
        </div>

        {/* 底部设置按钮 */}
        <div className="border-t border-zinc-800 flex-shrink-0">
          <button
            onClick={() => {
              console.log('[Sidebar] Settings button clicked');
              onSettingsClick?.();
            }}
            className={`
              w-full h-10 flex items-center gap-2
              text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700
              transition-all duration-200
              ${sidebarExpanded ? 'px-3 justify-start' : 'justify-center'}
            `}
            title={sidebarExpanded ? undefined : t('settings.title')}
            aria-label={t('settings.title')}
          >
            <Settings size={16} />
            {sidebarExpanded && (
              <span className="text-sm transition-opacity duration-200">
                {t('settings.title')}
              </span>
            )}
          </button>
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
