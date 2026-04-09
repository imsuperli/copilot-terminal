import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useWindowStore } from '../stores/windowStore';
import { QuickSwitcherItem } from './QuickSwitcherItem';
import { QuickSwitcherGroupItem } from './QuickSwitcherGroupItem';
import { fuzzyMatch } from '../utils/fuzzySearch';
import { Window, WindowStatus } from '../types/window';
import { WindowGroup } from '../../shared/types/window-group';
import { getAggregatedStatus } from '../utils/layoutHelpers';
import { getCurrentWindowWorkingDirectory } from '../utils/windowWorkingDirectory';
import { getPersistableWindows, getStandaloneSSHProfileId } from '../utils/sshWindowBindings';
import { useI18n } from '../i18n';
import type { SSHProfile } from '../../shared/types/ssh';

interface QuickSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (windowId: string) => void;
  onSelectGroup?: (groupId: string) => void;
  currentWindowId: string | null;
  currentGroupId?: string | null;
  sshProfiles?: SSHProfile[];
}

// 统一的列表项类型
type SwitcherItem =
  | { type: 'window'; data: Window; displayName: string; secondaryText: string }
  | { type: 'group'; data: WindowGroup };

/**
 * 快速切换面板组件（Ctrl+Tab）
 * 支持搜索和键盘导航，同时显示窗口和窗口组
 */
export const QuickSwitcher: React.FC<QuickSwitcherProps> = ({
  isOpen,
  onClose,
  onSelect,
  onSelectGroup,
  currentWindowId,
  currentGroupId,
  sshProfiles = [],
}) => {
  const { t } = useI18n();
  const windows = useWindowStore((state) => state.windows);
  const groups = useWindowStore((state) => state.groups);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const sshProfilesById = useMemo(
    () => new Map(sshProfiles.map((profile) => [profile.id, profile])),
    [sshProfiles],
  );
  const visibleWindows = useMemo(() => getPersistableWindows(windows), [windows]);

  const getWindowDisplayInfo = (window: Window) => {
    const profileId = getStandaloneSSHProfileId(window);
    const profile = profileId ? sshProfilesById.get(profileId) : undefined;
    const workingDirectory = getCurrentWindowWorkingDirectory(window);

    if (!profile) {
      return {
        displayName: window.name,
        secondaryText: workingDirectory,
        searchTerms: [window.name, workingDirectory],
      };
    }

    const targetLabel = `${profile.user}@${profile.host}:${profile.port}`;
    const remoteCwd = workingDirectory || profile.defaultRemoteCwd || '';
    const secondaryText = remoteCwd ? `${targetLabel} | ${remoteCwd}` : targetLabel;

    return {
      displayName: profile.name,
      secondaryText,
      searchTerms: [
        profile.name,
        window.name,
        targetLabel,
        workingDirectory,
        profile.defaultRemoteCwd || '',
        profile.host,
        profile.user,
        profile.notes || '',
        ...profile.tags,
      ],
    };
  };

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

  // 获取窗口组的排序优先级
  const getGroupPriority = (group: WindowGroup): number => {
    // 归档组优先级最低
    if (group.archived) return 4;
    // 活跃组优先级较高
    return 0;
  };

  // 过滤并合并窗口和窗口组
  const filteredItems = useMemo(() => {
    // 过滤窗口
    const filteredWindows: SwitcherItem[] = visibleWindows
      .filter((window) => {
        const displayInfo = getWindowDisplayInfo(window);
        return displayInfo.searchTerms.some((value) => fuzzyMatch(query, value));
      })
      .map((window) => {
        const displayInfo = getWindowDisplayInfo(window);
        return {
          type: 'window' as const,
          data: window,
          displayName: displayInfo.displayName,
          secondaryText: displayInfo.secondaryText,
        };
      });

    // 过滤窗口组
    const filteredGroups: SwitcherItem[] = groups
      .filter((group) => {
        return fuzzyMatch(query, group.name);
      })
      .map((group) => ({ type: 'group' as const, data: group }));

    // 合并并排序
    return [...filteredGroups, ...filteredWindows].sort((a, b) => {
      // 当前激活的项排在最前面
      if (a.type === 'window' && a.data.id === currentWindowId) return -1;
      if (b.type === 'window' && b.data.id === currentWindowId) return 1;
      if (a.type === 'group' && a.data.id === currentGroupId) return -1;
      if (b.type === 'group' && b.data.id === currentGroupId) return 1;

      // 窗口组优先于窗口
      if (a.type === 'group' && b.type === 'window') return -1;
      if (a.type === 'window' && b.type === 'group') return 1;

      // 同类型按优先级排序
      if (a.type === 'window' && b.type === 'window') {
        const priorityA = getWindowPriority(a.data);
        const priorityB = getWindowPriority(b.data);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // 优先级相同时，按最后活跃时间排序（最近的在前）
        return new Date(b.data.lastActiveAt).getTime() - new Date(a.data.lastActiveAt).getTime();
      }

      if (a.type === 'group' && b.type === 'group') {
        const priorityA = getGroupPriority(a.data);
        const priorityB = getGroupPriority(b.data);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // 优先级相同时，按最后活跃时间排序（最近的在前）
        return new Date(b.data.lastActiveAt).getTime() - new Date(a.data.lastActiveAt).getTime();
      }

      return 0;
    });
  }, [visibleWindows, groups, query, currentWindowId, currentGroupId, sshProfilesById]);

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
          setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
          break;
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
          } else {
            setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
          }
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredItems[selectedIndex]) {
            const item = filteredItems[selectedIndex];
            if (item.type === 'window') {
              onSelect(item.data.id);
            } else if (item.type === 'group' && onSelectGroup) {
              onSelectGroup(item.data.id);
            }
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }

      // Vim 风格导航（Ctrl+N 向下）
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown); // 使用冒泡阶段
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onSelect, onSelectGroup, onClose]);

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
                placeholder={t('quickSwitcher.searchPlaceholder')}
                className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none text-base"
              />
              {query && (
                <span className="text-xs text-zinc-500">
                  {t('quickSwitcher.resultsCount', { count: filteredItems.length })}
                </span>
              )}
            </div>
          </div>

          {/* 列表 */}
          <div
            ref={listRef}
            className="max-h-[500px] overflow-y-auto py-2"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#52525b #27272a'
            }}
          >
            {filteredItems.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="text-zinc-400 text-sm mb-2">{t('quickSwitcher.noResults')}</div>
                <div className="text-zinc-600 text-xs">
                  {query ? t('quickSwitcher.noResultsHint') : t('quickSwitcher.emptyHint')}
                </div>
              </div>
            ) : (
              filteredItems.map((item, index) => (
                <div
                  key={item.type === 'window' ? `window-${item.data.id}` : `group-${item.data.id}`}
                  onClick={() => {
                    if (item.type === 'window') {
                      onSelect(item.data.id);
                    } else if (onSelectGroup) {
                      onSelectGroup(item.data.id);
                    }
                    onClose();
                  }}
                >
                  {item.type === 'window' ? (
                    <QuickSwitcherItem
                      window={item.data}
                      displayName={item.displayName}
                      secondaryText={item.secondaryText}
                      isSelected={index === selectedIndex}
                      query={query}
                    />
                  ) : (
                    <QuickSwitcherGroupItem
                      group={item.data}
                      isSelected={index === selectedIndex}
                      query={query}
                    />
                  )}
                </div>
              ))
            )}
          </div>

          {/* 提示栏 */}
          <div className="px-6 py-3 bg-zinc-900/95 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">↑↓</kbd>
                <span>{t('quickSwitcher.select')}</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Enter</kbd>
                <span>{t('quickSwitcher.switch')}</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Esc</kbd>
                <span>{t('quickSwitcher.cancel')}</span>
              </span>
            </div>
            <div className="text-zinc-600">
              {t('quickSwitcher.shortcutHint')}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

QuickSwitcher.displayName = 'QuickSwitcher';
