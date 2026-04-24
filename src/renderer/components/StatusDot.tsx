import React from 'react';
import { Activity, Circle, Keyboard } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { WindowStatus } from '../types/window';
import { idePopupTooltipClassName } from './ui/ide-popup';
import { isInactiveTerminalPaneStatus } from '../utils/windowLifecycle';

export interface StatusDotProps {
  status: WindowStatus;
  size?: 'sm' | 'md'; // sm: 1.5, md: 2
  className?: string;
  title?: string;
}

/**
 * 根据窗格状态获取状态圆点的背景颜色（用于非图标状态）
 */
function getStatusDotColor(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Error:
      return 'bg-[rgb(var(--error))]';
    case WindowStatus.Completed:
      return 'bg-[rgb(var(--muted-foreground))]';
    case WindowStatus.Restoring:
      return 'bg-[rgb(var(--warning))]';
    default:
      return 'bg-[rgb(var(--border))]';
  }
}

/**
 * 根据窗格状态获取图标颜色
 */
function getStatusIconColor(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'text-[rgb(var(--success))]';
    case WindowStatus.WaitingForInput:
      return 'text-[rgb(var(--primary))]';
    case WindowStatus.Completed:
      return 'text-[rgb(var(--muted-foreground))]';
    default:
      return isInactiveTerminalPaneStatus(status)
        ? 'text-[rgb(var(--muted-foreground))]'
        : 'text-[rgb(var(--border))]';
  }
}

/**
 * 根据窗格状态获取动画效果
 */
function getStatusAnimation(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'animate-blink';
    case WindowStatus.WaitingForInput:
      return 'animate-breathe';
    default:
      return '';
  }
}

/**
 * Tooltip 包裹器：当 title 存在时用 Radix Tooltip 包裹内容
 */
const WithTooltip: React.FC<{ title?: string; children: React.ReactElement }> = ({ title, children }) => {
  if (!title) return children;
  return (
    <Tooltip.Provider>
      <Tooltip.Root delayDuration={300}>
        <Tooltip.Trigger asChild>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className={idePopupTooltipClassName}
            side="top"
            sideOffset={14}
          >
            {title}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

/**
 * StatusDot 组件
 * 显示状态图标或圆点，支持不同状态的颜色和动画效果
 */
export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'sm',
  className = '',
  title,
}) => {
  const iconSize = size === 'sm' ? 12 : 14;
  const dotSizeClass = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const iconColor = getStatusIconColor(status);
  const dotColor = getStatusDotColor(status);
  const animationClass = getStatusAnimation(status);

  const renderIcon = (Icon: typeof Activity) => (
    <WithTooltip title={title}>
      <span className="inline-flex items-center justify-center">
        <Icon
          size={iconSize}
          className={`${iconColor} ${animationClass} ${className}`}
        />
      </span>
    </WithTooltip>
  );

  // 使用图标的状态
  if (status === WindowStatus.Running) {
    return renderIcon(Activity);
  }

  if (status === WindowStatus.WaitingForInput) {
    return renderIcon(Keyboard);
  }

  if (isInactiveTerminalPaneStatus(status)) {
    return renderIcon(Circle);
  }

  // 其他状态继续使用圆点
  return (
    <WithTooltip title={title}>
      <div
        className={`rounded-full ${dotSizeClass} ${dotColor} ${animationClass} ${className}`}
      />
    </WithTooltip>
  );
};

StatusDot.displayName = 'StatusDot';
