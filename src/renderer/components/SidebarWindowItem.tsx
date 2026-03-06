import React, { useMemo, useState, useCallback } from 'react';
import { Activity, Keyboard, Pause, XCircle, Folder } from 'lucide-react';
import { Window, WindowStatus } from '../types/window';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { IDEIcon } from './icons/IDEIcons';
import { useIDESettings } from '../hooks/useIDESettings';

interface SidebarWindowItemProps {
  window: Window;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onOpenInIDE?: (ide: string, path: string) => void;
  onOpenFolder?: (path: string) => void;
}

/**
 * 获取状态图标
 */
function getStatusIcon(status: WindowStatus) {
  switch (status) {
    case WindowStatus.Running:
      return Activity; // 运行中：心电图图标
    case WindowStatus.WaitingForInput:
      return Keyboard; // 等待输入：键盘图标
    case WindowStatus.Paused:
      return Pause; // 暂停：暂停图标
    case WindowStatus.Error:
      return XCircle; // 已退出：错误图标
    default:
      return Pause;
  }
}

/**
 * 获取状态图标颜色
 */
function getStatusIconColor(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'text-green-500'; // 运行中：绿色
    case WindowStatus.WaitingForInput:
      return 'text-blue-500'; // 等待输入：蓝色
    case WindowStatus.Paused:
      return 'text-gray-500'; // 暂停：灰色
    case WindowStatus.Error:
      return 'text-red-500'; // 已退出：红色
    default:
      return 'text-gray-500';
  }
}

/**
 * 获取状态图标动画类
 */
function getStatusAnimation(status: WindowStatus): string {
  return status === WindowStatus.Running ? 'animate-pulse' : '';
}

/**
 * 获取窗口背景颜色（根据状态）
 */
function getWindowBackgroundColor(status: WindowStatus, isActive: boolean): string {
  if (isActive) {
    // 激活状态：使用蓝色背景，与状态图标有更好的对比度
    return 'bg-blue-600/50';
  }

  // 非激活状态：根据窗口状态显示不同的基础背景色和悬停色
  switch (status) {
    case WindowStatus.Running:
      return 'bg-green-900/10 hover:bg-green-900/20'; // 运行中：绿色背景
    case WindowStatus.WaitingForInput:
      return 'bg-blue-900/10 hover:bg-blue-900/20'; // 等待输入：蓝色背景
    case WindowStatus.Paused:
      return 'bg-zinc-800 hover:bg-zinc-700'; // 暂停：灰色背景
    case WindowStatus.Error:
      return 'bg-red-900/10 hover:bg-red-900/20'; // 已退出：红色背景
    default:
      return 'bg-zinc-800 hover:bg-zinc-700';
  }
}

/**
 * 侧边栏窗口列表项组件
 */
export const SidebarWindowItem: React.FC<SidebarWindowItemProps> = ({
  window: terminalWindow,
  isActive,
  isExpanded,
  onClick,
  onContextMenu,
  onOpenInIDE,
  onOpenFolder,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { enabledIDEs } = useIDESettings();

  // 获取窗口的聚合状态
  const aggregatedStatus = useMemo(
    () => getAggregatedStatus(terminalWindow.layout),
    [terminalWindow.layout]
  );
  const StatusIcon = getStatusIcon(aggregatedStatus);
  const iconColor = getStatusIconColor(aggregatedStatus);
  const statusAnimation = getStatusAnimation(aggregatedStatus);
  const bgColor = getWindowBackgroundColor(aggregatedStatus, isActive);

  // 从第一个窗格获取工作目录
  const workingDirectory = useMemo(() => {
    const panes = getAllPanes(terminalWindow.layout);
    return panes.length > 0 ? panes[0].cwd : '';
  }, [terminalWindow.layout]);

  // 处理 IDE 按钮点击
  const handleIDEClick = useCallback((e: React.MouseEvent, ide: 'vscode' | 'idea') => {
    e.stopPropagation();
    onOpenInIDE?.(ide, workingDirectory);
  }, [onOpenInIDE, workingDirectory]);

  // 处理文件夹按钮点击
  const handleFolderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenFolder?.(workingDirectory);
  }, [onOpenFolder, workingDirectory]);

  // 折叠状态：只显示图标
  if (!isExpanded) {
    return (
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`
          w-full h-10 flex items-center justify-center
          transition-colors
          ${bgColor}
        `}
        title={`${terminalWindow.name}\n${workingDirectory}`}
        aria-label={terminalWindow.name}
      >
        <StatusIcon className={`h-4 w-4 ${iconColor} ${statusAnimation}`} />
      </button>
    );
  }

  // 展开状态：显示完整信息
  return (
    <div
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`
          w-full px-3 py-2 flex items-start gap-2
          transition-colors text-left rounded
          ${bgColor}
        `}
        aria-label={terminalWindow.name}
      >
        {/* 状态图标 */}
        <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconColor} ${statusAnimation}`} />

        {/* 窗口信息 */}
        <div className="flex-1 min-w-0">
          {/* 窗口名称 */}
          <div className="text-sm font-medium text-zinc-100 truncate">
            {terminalWindow.name}
          </div>

          {/* 工作目录 */}
          <div className="text-xs text-zinc-400 truncate">
            {workingDirectory}
          </div>
        </div>
      </button>

      {/* 悬停时显示的操作按钮 */}
      {isHovered && isExpanded && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-800 rounded px-1 py-0.5 shadow-lg border border-zinc-700">
          {enabledIDEs.map((ide) => (
            <button
              key={ide.id}
              onClick={(e) => handleIDEClick(e, ide.id)}
              className="p-1 hover:bg-zinc-700 rounded transition-colors"
              title={`在 ${ide.name} 中打开`}
            >
              <IDEIcon icon={ide.icon || ''} size={12} />
            </button>
          ))}
          <button
            onClick={handleFolderClick}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="打开文件夹"
          >
            <Folder size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

SidebarWindowItem.displayName = 'SidebarWindowItem';
