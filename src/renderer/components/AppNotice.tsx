import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface AppNoticeProps {
  message: string;
  tone?: 'error' | 'success';
}

export const AppNotice: React.FC<AppNoticeProps> = ({ message, tone = 'error' }) => {
  const isSuccess = tone === 'success';
  return (
    <div
      className={`fixed top-4 left-1/2 z-[12050] flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-2 text-[rgb(var(--foreground))] shadow-2xl backdrop-blur ${
        isSuccess
          ? 'border border-emerald-500/30 bg-[color-mix(in_srgb,rgb(var(--background))_86%,rgb(16,185,129)_14%)]'
          : 'border border-[rgb(var(--error)/0.26)] bg-[color-mix(in_srgb,rgb(var(--background))_86%,rgb(var(--error))_14%)]'
      }`}
      role="alert"
      data-testid="app-notice"
    >
      <AlertCircle size={16} className={`shrink-0 ${isSuccess ? 'text-emerald-400' : 'text-[rgb(var(--error))]'}`} />
      <span className="text-sm">{message}</span>
    </div>
  );
};

AppNotice.displayName = 'AppNotice';
