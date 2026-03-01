import React, { useCallback } from 'react';

interface NewWindowCardProps {
  onClick: () => void;
}

/**
 * NewWindowCard 组件
 * 虚线边框占位卡片，点击后打开新建窗口对话框
 */
export const NewWindowCard = React.memo<NewWindowCardProps>(({ onClick }) => {
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
      aria-label="新建窗口"
      data-testid="new-window-card"
      className="flex flex-col items-center justify-center h-56 border-2 border-dashed border-[rgb(var(--border))] rounded-lg cursor-pointer transition-all duration-200 hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--card))]/50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))] group"
    >
      <div className="w-12 h-12 rounded-full bg-[rgb(var(--card))] flex items-center justify-center mb-3 group-hover:bg-[rgb(var(--primary))] transition-colors">
        <span className="text-3xl text-[rgb(var(--muted-foreground))] group-hover:text-[rgb(var(--primary-foreground))] leading-none transition-colors">+</span>
      </div>
      <span className="text-sm text-[rgb(var(--muted-foreground))] group-hover:text-[rgb(var(--foreground))] transition-colors">新建终端</span>
    </div>
  );
});

NewWindowCard.displayName = 'NewWindowCard';
