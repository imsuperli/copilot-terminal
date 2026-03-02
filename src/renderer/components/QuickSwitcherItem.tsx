import React from 'react';
import { Window, WindowStatus } from '../types/window';
import { highlightMatches } from '../utils/fuzzySearch';

interface QuickSwitcherItemProps {
  window: Window;
  isSelected: boolean;
  query: string;
}

/**
 * 获取状态圆点颜色
 */
function getStatusColor(status: WindowStatus): string {
  switch (status) {
    case 'Running':
      return 'bg-green-500';
    case 'WaitingForInput':
      return 'bg-blue-500';
    case 'Paused':
      return 'bg-gray-500';
    case 'Exited':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

/**
 * 获取状态文本
 */
function getStatusText(window: Window): string {
  if (window.archived) return '(归档)';
  if (window.status === 'Paused') return '(暂停)';
  return '';
}

/**
 * 快速切换面板列表项组件
 */
export const QuickSwitcherItem: React.FC<QuickSwitcherItemProps> = ({
  window: terminalWindow,
  isSelected,
  query,
}) => {
  const statusColor = getStatusColor(terminalWindow.status);
  const statusText = getStatusText(terminalWindow);
  const nameHighlights = highlightMatches(terminalWindow.name, query);
  const cwdHighlights = highlightMatches(terminalWindow.cwd, query);

  return (
    <div
      className={`
        px-4 py-3 flex items-start gap-3 cursor-pointer
        transition-colors
        ${isSelected ? 'bg-blue-600' : 'hover:bg-zinc-700'}
      `}
    >
      {/* 状态圆点 */}
      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${statusColor}`} />

      {/* 窗口信息 */}
      <div className="flex-1 min-w-0">
        {/* 窗口名称 */}
        <div className="text-sm font-medium text-zinc-100 flex items-center gap-2">
          <span>
            {nameHighlights.map((part, index) => (
              <span
                key={index}
                className={part.highlight ? 'bg-yellow-500 text-black' : ''}
              >
                {part.text}
              </span>
            ))}
          </span>
          {statusText && (
            <span className="text-xs text-zinc-400">{statusText}</span>
          )}
        </div>

        {/* 工作目录 */}
        <div className="text-xs text-zinc-400 truncate mt-0.5">
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
    </div>
  );
};

QuickSwitcherItem.displayName = 'QuickSwitcherItem';
