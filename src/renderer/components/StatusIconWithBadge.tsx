import React from 'react';
import { Activity, Keyboard, Pause, Circle } from 'lucide-react';
import { WindowStatus } from '../types/window';

export interface StatusIconWithBadgeProps {
  status: WindowStatus;
  count: number;
  size?: 'small' | 'large';
  className?: string;
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
    case WindowStatus.Paused:
      return 'text-[rgb(var(--muted-foreground))]';
    case WindowStatus.Error:
      return 'text-[rgb(var(--error))]';
    case WindowStatus.Completed:
      return 'text-[rgb(var(--muted-foreground))]';
    case WindowStatus.Restoring:
      return 'text-[rgb(var(--warning))]';
    default:
      return 'text-[rgb(var(--muted-foreground))]';
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
 * 根据状态返回对应的图标组件
 */
function getStatusIcon(status: WindowStatus): typeof Activity {
  switch (status) {
    case WindowStatus.Running:
      return Activity;
    case WindowStatus.WaitingForInput:
      return Keyboard;
    case WindowStatus.Paused:
      return Pause;
    case WindowStatus.Error:
    case WindowStatus.Completed:
    case WindowStatus.Restoring:
    default:
      return Circle;
  }
}

/**
 * StatusIconWithBadge 组件
 * 显示状态图标并在右上角显示数字角标
 * 用于窗口组卡片和侧边栏中显示聚合状态
 */
export const StatusIconWithBadge: React.FC<StatusIconWithBadgeProps> = ({
  status,
  count,
  size = 'large',
  className = '',
}) => {
  const iconSize = size === 'large' ? 24 : 20;
  const badgeSize = size === 'large' ? 'w-4 h-4 text-[10px]' : 'w-4 h-4 text-[9px]';
  const badgeOffset = size === 'large' ? '-top-1 -right-1' : '-top-1 -right-1';

  const Icon = getStatusIcon(status);
  const iconColor = getStatusIconColor(status);
  const animationClass = getStatusAnimation(status);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* 状态图标 */}
      <Icon
        size={iconSize}
        className={`${iconColor} ${animationClass} transition-colors duration-200`}
      />

      {/* 数字角标 */}
      <div
        className={`absolute ${badgeOffset} ${badgeSize} grid place-items-center rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_92%,transparent)] backdrop-blur-sm transition-all duration-200`}
      >
        <span className="font-bold leading-none text-[rgb(var(--foreground))]">
          {count}
        </span>
      </div>
    </div>
  );
};

StatusIconWithBadge.displayName = 'StatusIconWithBadge';
