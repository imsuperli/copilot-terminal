import React, { useMemo } from 'react';
import { Activity, Terminal, Pause, Archive } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Window, WindowStatus } from '../types/window';
import { highlightMatches } from '../utils/fuzzySearch';

interface QuickSwitcherItemProps {
  window: Window;
  isSelected: boolean;
  query: string;
}

/**
 * 获取状态图标
 */
function getStatusIcon(window: Window) {
  if (window.archived) return Archive;

  switch (window.status) {
    case WindowStatus.Running:
      return Activity; // 运行中：心电图图标
    case WindowStatus.WaitingForInput:
      return Terminal; // 等待输入：终端图标
    case WindowStatus.Paused:
      return Pause; // 暂停：暂停图标
    default:
      return Pause;
  }
}

/**
 * 获取状态图标颜色
 */
function getStatusIconColor(window: Window): string {
  if (window.archived) return 'text-orange-500';

  switch (window.status) {
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
function getStatusLabel(window: Window): string {
  if (window.archived) return '归档';

  switch (window.status) {
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
function getStatusLabelColor(window: Window): string {
  if (window.archived) return 'text-orange-500 bg-orange-500/10';

  switch (window.status) {
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
function getSelectedBorderColor(window: Window): string {
  if (window.archived) return 'border-orange-500';

  switch (window.status) {
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
function getContextInfo(window: Window): string {
  if (window.archived) return '已归档';
  if (window.status === WindowStatus.Paused) return '未启动';
  if (window.lastOutput) {
    // 截断到 50 字符
    return window.lastOutput.length > 50
      ? window.lastOutput.substring(0, 50) + '...'
      : window.lastOutput;
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
  const StatusIcon = getStatusIcon(terminalWindow);
  const iconColor = getStatusIconColor(terminalWindow);
  const statusLabel = getStatusLabel(terminalWindow);
  const statusLabelColor = getStatusLabelColor(terminalWindow);
  const borderColor = getSelectedBorderColor(terminalWindow);
  const contextInfo = getContextInfo(terminalWindow);
  const iconAnimation = terminalWindow.status === WindowStatus.Running ? 'animate-pulse' : '';
  const folderName = getFolderName(terminalWindow.workingDirectory);

  // 格式化相对时间
  const relativeTime = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(terminalWindow.lastActiveAt), {
        addSuffix: true,
        locale: zhCN
      });
    } catch {
      return '';
    }
  }, [terminalWindow.lastActiveAt]);

  // 高亮匹配
  const nameHighlights = highlightMatches(terminalWindow.name, query);
  const cwdHighlights = highlightMatches(terminalWindow.workingDirectory || '', query);
  const folderHighlights = highlightMatches(folderName, query);

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
      {/* 第一行：图标 + 名称 + 文件夹 + 状态 + 时间 */}
      <div className="flex items-center gap-3 mb-2">
        {/* 状态图标 */}
        <StatusIcon className={`h-5 w-5 flex-shrink-0 ${iconColor} ${iconAnimation}`} />

        {/* 窗口名称 */}
        <div className="flex-shrink-0">
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
        </div>

        {/* 文件夹名称 */}
        <div className="flex-1 min-w-0">
          <span className="text-sm text-zinc-400">
            {folderHighlights.map((part, index) => (
              <span
                key={index}
                className={part.highlight ? 'bg-yellow-500 text-black' : ''}
              >
                {part.text}
              </span>
            ))}
          </span>
        </div>

        {/* 状态标签 */}
        <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${statusLabelColor}`}>
          {statusLabel}
        </span>

        {/* 相对时间 */}
        {relativeTime && (
          <span className="text-xs text-zinc-500 flex-shrink-0">
            {relativeTime}
          </span>
        )}
      </div>

      {/* 第二行：完整路径 */}
      <div className="text-sm text-zinc-400 truncate mb-1 pl-8">
        {cwdHighlights.map((part, index) => (
          <span
            key={index}
            className={part.highlight ? 'bg-yellow-500 text-black' : ''}
          >
            {part.text}
          </span>
        ))}
      </div>

      {/* 第三行：上下文信息 */}
      <div className="text-xs text-zinc-500 truncate pl-8">
        {contextInfo}
      </div>
    </div>
  );
};

QuickSwitcherItem.displayName = 'QuickSwitcherItem';
