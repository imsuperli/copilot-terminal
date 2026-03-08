import React from 'react';
import { Terminal, Plus } from 'lucide-react';
import { useI18n } from '../i18n';

interface EmptyStateProps {
  onCreateWindow?: () => void;
}

export const EmptyState = React.memo<EmptyStateProps>(({ onCreateWindow }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center h-full">
      {/* 图标 */}
      <div className="w-20 h-20 rounded-2xl bg-[rgb(var(--card))] flex items-center justify-center mb-6 border border-[rgb(var(--border))]">
        <Terminal size={40} className="text-[rgb(var(--primary))]" />
      </div>

      {/* 引导文案 */}
      <h2 className="text-2xl font-semibold text-[rgb(var(--foreground))] mb-2">
        {t('emptyState.title')}
      </h2>
      <p className="text-base text-[rgb(var(--muted-foreground))] mb-8">
        {t('emptyState.description')}
      </p>

      {/* 新建窗口按钮 */}
      <button
        onClick={onCreateWindow}
        className="flex items-center gap-3 px-6 py-3 rounded-lg bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] font-medium hover:opacity-90 transition-opacity"
      >
        <Plus size={20} />
        <span>{t('common.newTerminal')}</span>
      </button>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';


