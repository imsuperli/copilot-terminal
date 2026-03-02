import React, { useEffect, useState } from 'react';
import { useWindowStore } from '../stores/windowStore';

interface TabSwitcherProps {
  isOpen: boolean;
  onSelect: (windowId: string) => void;
  direction: 'forward' | 'backward';
}

/**
 * Ctrl+Tab 切换面板组件
 * 显示最近使用的窗口列表
 */
export const TabSwitcher: React.FC<TabSwitcherProps> = ({
  isOpen,
  onSelect,
  direction,
}) => {
  const getMRUWindows = useWindowStore((state) => state.getMRUWindows);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mruWindows = getMRUWindows();

  // 根据方向更新选中索引
  useEffect(() => {
    if (isOpen) {
      if (direction === 'forward') {
        setSelectedIndex((prev) => (prev + 1) % mruWindows.length);
      } else {
        setSelectedIndex((prev) => (prev - 1 + mruWindows.length) % mruWindows.length);
      }
    }
  }, [isOpen, direction, mruWindows.length]);

  // 监听 Ctrl 键释放
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        // Ctrl 键释放，切换到选中的窗口
        if (mruWindows[selectedIndex]) {
          onSelect(mruWindows[selectedIndex].id);
        }
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [isOpen, selectedIndex, mruWindows, onSelect]);

  if (!isOpen || mruWindows.length === 0) return null;

  // 最多显示 8 个窗口
  const displayWindows = mruWindows.slice(0, 8);

  return (
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[2001]">
      <div className="bg-zinc-800 rounded-lg shadow-2xl overflow-hidden border border-zinc-700 px-6 py-4">
        <div className="flex items-center gap-3">
          {displayWindows.map((window, index) => (
            <div
              key={window.id}
              className={`
                px-4 py-2 rounded text-sm font-medium transition-colors
                ${index === selectedIndex
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-700 text-zinc-300'
                }
              `}
            >
              {window.name}
            </div>
          ))}
          {mruWindows.length > 8 && (
            <div className="text-zinc-400 text-sm">
              +{mruWindows.length - 8}
            </div>
          )}
        </div>

        {/* 提示 */}
        <div className="mt-3 text-center text-xs text-zinc-400">
          按住 Ctrl，按 Tab 切换，松开 Ctrl 确认
        </div>
      </div>
    </div>
  );
};

TabSwitcher.displayName = 'TabSwitcher';
