import React, { useMemo } from 'react';
import { Activity, Keyboard, Pause, Archive, Folder } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Window, WindowStatus } from '../types/window';
import { highlightMatches } from '../utils/fuzzySearch';
import { getAggregatedStatus, getAllPanes } from '../utils/layoutHelpers';
import { StatusDot } from './StatusDot';

interface QuickSwitcherItemProps {
  window: Window;
  isSelected: boolean;
  query: string;
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
    default:
      return 'text-gray-500';
  }
}

/**
 * 获取状态标签
 */
function getStatusLabel(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return '运行中';
    case WindowStatus.WaitingForInput:
      return '等待输入';
    case WindowStatus.Paused:
      return '暂停';
    case WindowStatus.Restoring:
      return '启动中';
    default:
      return '未知';
  }
}

/**
 * 获取状态标签颜色
 */
function getStatusLabelColor(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'text-green-500 bg-green-500/10';
    case WindowStatus.WaitingForInput:
      return 'text-blue-500 bg-blue-500/10';
    case WindowStatus.Paused:
      return 'text-gray-500 bg-gray-500/10';
    default:
      return 'text-gray-500 bg-gray-500/10';
  }
}

/**
 * 获取选中边框颜色
 */
function getSelectedBorderColor(status: WindowStatus, archived: boolean): string {
  if (archived) return 'border-orange-500';

  switch (status) {
    case WindowStatus.Running:
      return 'border-green-500';
    case WindowStatus.WaitingForInput:
      return 'border-blue-500';
    case WindowStatus.Paused:
      return 'border-gray-500';
    default:
      return 'border-gray-500';
  }
}

/**
 * 获取文件夹名称（从完整路径中提取）
 */
function getFolderName(cwd: string | undefined): string {
  if (!cwd) return '';
  const normalized = cwd.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(p => p.length > 0);
  return parts[parts.length - 1] || cwd;
}

/**
 * 获取上下文信息
 */
function getContextInfo(status: WindowStatus, archived: boolean, lastOutput?: string): string {
  if (archived) return '已归档';
  if (status === WindowStatus.Paused) return '未启动';
  if (lastOutput) {
    // 截断到 50 字符
    return lastOutput.length > 50
      ? lastOutput.substring(0, 50) + '...'
      : lastOutput;
  }
  return '无输出';
}

/**
 * 快速切换面板列表项组件
 */
export const QuickSwitcherItem: React.FC<QuickSwitcherItemProps> = ({
  window: terminalWindow,
  isSelected,
  query,
}) => {
  // 获取窗口的聚合状态和所有窗格
  const aggregatedStatus = useMemo(() => getAggregatedStatus(terminalWindow.layout), [terminalWindow.layout]);
  const panes = useMemo(() => getAllPanes(terminalWindow.layout), [terminalWindow.layout]);
  const paneCount = panes.length;

  // 获取第一个窗格的工作目录作为显示
  const workingDirectory = useMemo(() => panes[0]?.cwd || '', [panes]);
  const lastOutput = useMemo(() => panes[0]?.lastOutput, [panes]);

  const StatusIcon = getStatusIcon(aggregatedStatus);
  const iconColor = getStatusIconColor(aggregatedStatus);
  const statusLabel = terminalWindow.archived ? '归档' : getStatusLabel(aggregatedStatus);
  const statusLabelColor = terminalWindow.archived ? 'text-orange-500 bg-orange-500/10' : getStatusLabelColor(aggregatedStatus);
  const borderColor = getSelectedBorderColor(aggregatedStatus, terminalWindow.archived || false);
  const contextInfo = getContextInfo(aggregatedStatus, terminalWindow.archived || false, lastOutput);
  const iconAnimation = aggregatedStatus === WindowStatus.Running ? 'animate-pulse' : '';
  const folderName = getFolderName(workingDirectory);

  // 格式化相对时间（移除"大约"）
  const relativeTime = useMemo(() => {
    try {
      const time = formatDistanceToNow(new Date(terminalWindow.lastActiveAt), {
        addSuffix: true,
        locale: zhCN
      });
      // 移除"大约"两个字
      return time.replace('大约', '');
    } catch {
      return '';
    }
  }, [terminalWindow.lastActiveAt]);

  // 格式化创建时间
  const createdTime = useMemo(() => {
    try {
      const date = new Date(terminalWindow.createdAt);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }, [terminalWindow.createdAt]);

  // 高亮匹配
  const nameHighlights = highlightMatches(terminalWindow.name, query);
  const cwdHighlights = highlightMatches(workingDirectory, query);
  const folderHighlights = highlightMatches(folderName, query);

  // 打开文件夹
  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发窗口切换
    if (workingDirectory && window.electronAPI?.openFolder) {
      window.electronAPI.openFolder(workingDirectory);
    }
  };

  return (
    <div
      className={`
        px-4 py-3 mx-3 my-2 rounded-lg cursor-pointer
        transition-all duration-150 ease-out
        border-2
        ${isSelected
          ? `${borderColor} bg-zinc-700/50 shadow-lg`
          : 'border-transparent bg-zinc-800/50 hover:bg-zinc-700/30'
        }
      `}
    >
      {/* 左右两列布局 */}
      <div className="flex gap-6">
        {/* 左列：窗口信息 */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* 窗口名称 */}
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-zinc-100">
              {nameHighlights.map((part, index) => (
                <span
                  key={index}
                  className={part.highlight ? 'bg-yellow-500 text-black' : ''}
                >
                  {part.text}
                </span>
              ))}
            </span>
            {/* 文件夹图标 */}
            {workingDirectory && (
              <button
                onClick={handleOpenFolder}
                className="flex-shrink-0 p-1 rounded hover:bg-zinc-600/50 transition-colors group"
                title={`打开文件夹: ${workingDirectory}`}
              >
                <Folder size={16} className="text-zinc-400 group-hover:text-zinc-200" />
              </button>
            )}
          </div>

          {/* 完整路径 */}
          <div className="text-sm text-zinc-400 truncate">
            {cwdHighlights.map((part, index) => (
              <span
                key={index}
                className={part.highlight ? 'bg-yellow-500 text-black' : ''}
              >
                {part.text}
              </span>
            ))}
          </div>
        </div>

        {/* 右列：详细信息（左对齐） */}
        <div className="flex-shrink-0 space-y-1 text-xs">
          {/* 创建时间 */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">创建时间：</span>
            <span className="text-zinc-300">{createdTime}</span>
          </div>

          {/* 上次运行 */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">上次运行：</span>
            <span className="text-zinc-300">{relativeTime}</span>
          </div>

          {/* 窗格状态 */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">窗格状态：</span>
            <div className="flex items-center gap-1.5">
              {panes.map((pane, index) => (
                <StatusDot
                  key={pane.id}
                  status={pane.status}
                  size="sm"
                  title={`窗格 ${index + 1}: ${getStatusLabel(pane.status)}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

QuickSwitcherItem.displayName = 'QuickSwitcherItem';
