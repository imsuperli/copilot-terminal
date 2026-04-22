import React, { useCallback } from 'react';
import { useI18n } from '../i18n';
import { idePopupListCardClassName } from './ui/ide-popup';

interface NewWindowCardProps {
  onClick: () => void;
}

/**
 * NewWindowCard 组件
 * 虚线边框占位卡片，点击后打开新建窗口对话框
 */
export const NewWindowCard = React.memo<NewWindowCardProps>(({ onClick }) => {
  const { t } = useI18n();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    },
    [onClick]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={t('common.newWindow')}
      data-testid="new-window-card"
      className={`${idePopupListCardClassName} flex h-56 flex-col items-center justify-center border-2 border-dashed border-[rgb(var(--border))] cursor-pointer transition-all duration-200 hover:border-[rgb(var(--primary))] hover:bg-[linear-gradient(180deg,var(--appearance-card-hover-surface-top)_0%,var(--appearance-card-hover-surface-bottom)_100%)] hover:shadow-[0_22px_44px_rgba(0,0,0,0.16)] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))] group`}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_74%,transparent)] group-hover:border-[rgb(var(--primary))]/55 group-hover:bg-[rgb(var(--primary))] transition-colors">
        <span className="text-3xl text-[rgb(var(--muted-foreground))] group-hover:text-[rgb(var(--primary-foreground))] leading-none transition-colors">+</span>
      </div>
      <span className="text-sm text-[rgb(var(--muted-foreground))] group-hover:text-[rgb(var(--foreground))] transition-colors">{t('common.newTerminal')}</span>
    </div>
  );
});

NewWindowCard.displayName = 'NewWindowCard';
