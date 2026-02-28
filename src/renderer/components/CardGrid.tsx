import React from 'react';
import { useWindowStore } from '../stores/windowStore';
import { WindowCard } from './WindowCard';

/**
 * CardGrid 组件
 * 以网格布局显示所有窗口卡片
 */
export function CardGrid() {
  const windows = useWindowStore((state) => state.windows);
  const setActiveWindow = useWindowStore((state) => state.setActiveWindow);

  const handleCardClick = (windowId: string) => {
    setActiveWindow(windowId);
    // TODO: Story 5-2 将实现切换到终端视图
    console.log('切换到窗口:', windowId);
  };

  const handleContextMenu = (e: React.MouseEvent, windowId: string) => {
    e.preventDefault();
    // TODO: Story 2.4 的右键菜单将在这里集成
    console.log('打开右键菜单:', windowId);
  };

  if (windows.length === 0) {
    return null; // EmptyState 会处理空状态
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {windows.map((window) => (
        <WindowCard
          key={window.id}
          window={window}
          onClick={() => handleCardClick(window.id)}
          onContextMenu={(e) => handleContextMenu(e, window.id)}
        />
      ))}
    </div>
  );
}
