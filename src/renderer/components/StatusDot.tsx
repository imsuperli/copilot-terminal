import React from 'react';
import { WindowStatus } from '../types/window';

export interface StatusDotProps {
  status: WindowStatus;
  size?: 'sm' | 'md'; // sm: 1.5, md: 2
  className?: string;
  title?: string;
}

/**
 * 根据窗格状态获取状态圆点的背景颜色
 */
function getStatusDotColor(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      return 'bg-green-500';
    case WindowStatus.WaitingForInput:
      return 'bg-blue-500';
    case WindowStatus.Paused:
      return 'bg-zinc-600';
    case WindowStatus.Error:
      return 'bg-red-500';
    case WindowStatus.Completed:
      return 'bg-zinc-500';
    case WindowStatus.Restoring:
      return 'bg-yellow-500';
    default:
      return 'bg-zinc-600';
  }
}

/**
 * 根据窗格状态获取动画效果
 */
function getStatusAnimation(status: WindowStatus): string {
  switch (status) {
    case WindowStatus.Running:
      // 闪烁效果
      return 'animate-blink';
    case WindowStatus.WaitingForInput:
      // 呼吸灯效果
      return 'animate-breathe';
    default:
      return '';
  }
}

/**
 * StatusDot 组件
 * 显示状态圆点，支持不同状态的颜色和动画效果
 */
export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'sm',
  className = '',
  title,
}) => {
  const sizeClass = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const colorClass = getStatusDotColor(status);
  const animationClass = getStatusAnimation(status);

  return (
    <div
      className={`rounded-full ${sizeClass} ${colorClass} ${animationClass} ${className}`}
      title={title}
    />
  );
};

StatusDot.displayName = 'StatusDot';
