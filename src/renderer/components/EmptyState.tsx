import React from 'react';
import { Terminal, Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import { idePopupActionButtonClassName } from './ui/ide-popup';

interface EmptyStateProps {
  onCreateWindow?: () => void;
}

export const EmptyState = React.memo<EmptyStateProps>(({ onCreateWindow }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center h-full">
      {/* 图标 */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_78%,transparent)]">
        <Terminal size={40} className="text-[rgb(var(--primary))]" />
      </div>

      {/* 引导文案 */}
      <h2 className="mb-6 text-xl font-semibold text-text-primary text-[rgb(var(--foreground))]">
        {t('emptyState.title')}
      </h2>
      <p className="mb-8 text-base text-[rgb(var(--muted-foreground))]">
        {t('emptyState.description')}
      </p>

      {/* 新建窗口按钮 */}
      <button
        onClick={onCreateWindow}
        className={`${idePopupActionButtonClassName('primary')} flex items-center gap-3 rounded-lg px-8 py-3 text-lg font-medium`}
      >
        <span>+</span>
        <span>{t('common.newTerminal')}</span>
      </button>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';
