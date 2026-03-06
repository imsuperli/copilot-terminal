import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { QuickSwitcherItem } from './QuickSwitcherItem';
import { fuzzyMatch } from '../utils/fuzzySearch';
import { Window, WindowStatus } from '../types/window';
import { getAggregatedStatus } from '../utils/layoutHelpers';

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
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // 获取窗口的排序优先级
  const getWindowPriority = (window: Window): number => {
    // 归档窗口优先级最低
    if (window.archived) return 4;

    // 获取窗口的聚合状态
    const status = getAggregatedStatus(window.layout);

    // 根据状态返回优先级（数字越小优先级越高）
    switch (status) {
      case WindowStatus.WaitingForInput:
        return 1; // 等待输入 - 最高优先级
      case WindowStatus.Running:
        return 2; // 运行中
      case WindowStatus.Paused:
        return 3; // 暂停
      default:
        return 3; // 其他状态按暂停处理
    }
  };

  // 过滤窗口并排序
  const filteredWindows = useMemo(() =>
    windows
      .filter((window) => {
        const matchName = fuzzyMatch(query, window.name);
        // 获取第一个窗格的工作目录进行匹配
        const panes = window.layout.type === 'pane' ? [window.layout.pane] : [];
        const cwd = panes[0]?.cwd || '';
        const matchCwd = fuzzyMatch(query, cwd);
        return matchName || matchCwd;
      })
      .sort((a, b) => {
        // 当前窗口排在最前面
        if (a.id === currentWindowId) return -1;
        if (b.id === currentWindowId) return 1;

        // 按优先级排序
        const priorityA = getWindowPriority(a);
        const priorityB = getWindowPriority(b);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // 优先级相同时，按最后活跃时间排序（最近的在前）
        return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
      }),
    [windows, query, currentWindowId]
  );

  // 重置状态和处理动画
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setQuery('');
      setSelectedIndex(0);
      // 延迟触发动画，确保元素已渲染
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
      // 聚焦搜索框
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      // 关闭时先触发退出动画
      setIsAnimating(false);
      // 等待动画完成后再移除元素
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 200); // 与 CSS transition 时间一致
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev + 1) % filteredWindows.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev - 1 + filteredWindows.length) % filteredWindows.length);
          break;
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            setSelectedIndex((prev) => (prev - 1 + filteredWindows.length) % filteredWindows.length);
          } else {
            setSelectedIndex((prev) => (prev + 1) % filteredWindows.length);
          }
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredWindows[selectedIndex]) {
            onSelect(filteredWindows[selectedIndex].id);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }

      // Vim 风格导航（Ctrl+N 向下，Ctrl+P 向上）
      // 注意：不拦截 Ctrl+P，让它用于关闭面板
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % filteredWindows.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown); // 使用冒泡阶段
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

  if (!shouldRender) return null;

  return (
    <>
      {/* 背景遮罩 - 淡入淡出 */}
      <div
        className={`fixed inset-0 bg-black z-[2000] backdrop-blur-sm transition-opacity duration-200 ${
          isAnimating ? 'opacity-60' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* 面板 - 缩放+淡入 */}
      <div
        className={`fixed top-[15%] left-1/2 -translate-x-1/2 z-[2001] w-[800px] max-w-[90vw] transition-all duration-200 ${
          isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="bg-zinc-900 rounded-xl shadow-2xl overflow-hidden border border-zinc-700">
          {/* 搜索框区域 */}
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
            <div className="flex items-center gap-3">
              <Search size={20} className="text-zinc-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="搜索窗口（名称、路径）..."
                className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-base"
              />
              {query && (
                <span className="text-xs text-zinc-500">
                  {filteredWindows.length} 个结果
                </span>
              )}
            </div>
          </div>

          {/* 窗口列表 */}
          <div
            ref={listRef}
            className="max-h-[500px] overflow-y-auto py-2"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#52525b #27272a'
            }}
          >
            {filteredWindows.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="text-zinc-400 text-sm mb-2">没有找到匹配的窗口</div>
                <div className="text-zinc-600 text-xs">
                  {query ? '尝试使用不同的关键词搜索' : '创建一个新窗口开始使用'}
                </div>
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
          <div className="px-6 py-3 bg-zinc-900/95 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">↑↓</kbd>
                <span>选择</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Enter</kbd>
                <span>切换</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Esc</kbd>
                <span>取消</span>
              </span>
            </div>
            <div className="text-zinc-600">
              Ctrl+P 快速切换
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

QuickSwitcher.displayName = 'QuickSwitcher';
