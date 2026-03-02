import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { QuickSwitcherItem } from './QuickSwitcherItem';
import { fuzzyMatch } from '../utils/fuzzySearch';
import { Window } from '../types/window';

interface QuickSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (windowId: string) => void;
  currentWindowId: string | null;
}

/**
 * 快速切换面板组件
 * 支持搜索和键盘导航
 */
export const QuickSwitcher: React.FC<QuickSwitcherProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentWindowId,
}) => {
  const windows = useWindowStore((state) => state.windows);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 过滤窗口
  const filteredWindows = windows.filter((window) => {
    const matchName = fuzzyMatch(query, window.name);
    const matchCwd = fuzzyMatch(query, window.cwd);
    return matchName || matchCwd;
  });

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // 聚焦搜索框
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'Tab':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredWindows.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredWindows.length) % filteredWindows.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredWindows[selectedIndex]) {
            onSelect(filteredWindows[selectedIndex].id);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }

      // Vim 风格导航
      if (e.ctrlKey) {
        if (e.key === 'n') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredWindows.length);
        } else if (e.key === 'p') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredWindows.length) % filteredWindows.length);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredWindows, selectedIndex, onSelect, onClose]);

  // 自动滚动到选中项
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[2000]"
        onClick={onClose}
      />

      {/* 面板 */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[2001] w-[600px] max-w-[90vw]">
        <div className="bg-zinc-800 rounded-lg shadow-2xl overflow-hidden border border-zinc-700">
          {/* 搜索框 */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-700">
            <Search size={18} className="text-zinc-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="搜索窗口（名称、路径）..."
              className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-sm"
            />
          </div>

          {/* 窗口列表 */}
          <div
            ref={listRef}
            className="max-h-[400px] overflow-y-auto"
          >
            {filteredWindows.length === 0 ? (
              <div className="px-4 py-8 text-center text-zinc-400 text-sm">
                没有找到匹配的窗口
              </div>
            ) : (
              filteredWindows.map((window, index) => (
                <div
                  key={window.id}
                  onClick={() => {
                    onSelect(window.id);
                    onClose();
                  }}
                >
                  <QuickSwitcherItem
                    window={window}
                    isSelected={index === selectedIndex}
                    query={query}
                  />
                </div>
              ))
            )}
          </div>

          {/* 提示栏 */}
          <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-700 flex items-center gap-4 text-xs text-zinc-400">
            <span>↑↓ 选择</span>
            <span>Enter 切换</span>
            <span>Esc 取消</span>
          </div>
        </div>
      </div>
    </>
  );
};

QuickSwitcher.displayName = 'QuickSwitcher';
