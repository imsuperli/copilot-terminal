import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface ViewSwitchErrorProps {
  message: string;
}

/**
 * ViewSwitchError 组件
 * 显示视图切换错误的内联提示（非弹窗）
 */
export const ViewSwitchError: React.FC<ViewSwitchErrorProps> = ({ message }) => {
  return (
    <div
      className="fixed top-4 left-1/2 z-[12050] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[rgb(var(--error)/0.26)] bg-[color-mix(in_srgb,rgb(var(--background))_86%,rgb(var(--error))_14%)] px-4 py-2 text-[rgb(var(--foreground))] shadow-2xl backdrop-blur"
      role="alert"
      data-testid="view-switch-error"
    >
      <AlertCircle size={16} className="shrink-0 text-[rgb(var(--error))]" />
      <span className="text-sm">{message}</span>
    </div>
  );
};

ViewSwitchError.displayName = 'ViewSwitchError';
