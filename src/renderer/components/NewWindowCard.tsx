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
      className="flex flex-col items-center justify-center h-56 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer transition-all duration-200 hover:border-blue-500 hover:bg-zinc-800/50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-blue-500 group"
    >
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3 group-hover:bg-blue-600 transition-colors">
        <span className="text-3xl text-zinc-500 group-hover:text-white leading-none transition-colors">+</span>
      </div>
      <span className="text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">新建终端</span>
    </div>
  );
});

NewWindowCard.displayName = 'NewWindowCard';
