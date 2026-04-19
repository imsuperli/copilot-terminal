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
import {
  IdePopupShell,
  idePopupHeaderMetaClassName,
  idePopupOverlayClassName,
  idePopupScrollAreaClassName,
  idePopupSectionClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
} from './ui/ide-popup';

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
    const filteredWindows: SwitcherItem[] = visibleWindows.flatMap((window) => {
      const displayInfo = getWindowDisplayInfo(window);
      if (!displayInfo.searchTerms.some((value) => fuzzyMatch(query, value))) {
        return [];
      }

      return [{
        type: 'window' as const,
        data: window,
        displayName: displayInfo.displayName,
        secondaryText: displayInfo.secondaryText,
      }];
    });

    const filteredGroups: SwitcherItem[] = groups
      .filter((group) => fuzzyMatch(query, group.name))
      .map((group) => ({ type: 'group' as const, data: group }));

    return [...filteredGroups, ...filteredWindows].sort((a, b) => {
      if (a.type === 'window' && a.data.id === currentWindowId) return -1;
      if (b.type === 'window' && b.data.id === currentWindowId) return 1;
      if (a.type === 'group' && a.data.id === currentGroupId) return -1;
      if (b.type === 'group' && b.data.id === currentGroupId) return 1;

      if (a.type === 'group' && b.type === 'window') return -1;
      if (a.type === 'window' && b.type === 'group') return 1;

      if (a.type === 'window' && b.type === 'window') {
        const priorityA = getWindowPriority(a.data);
        const priorityB = getWindowPriority(b.data);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return new Date(b.data.lastActiveAt).getTime() - new Date(a.data.lastActiveAt).getTime();
      }

      if (a.type === 'group' && b.type === 'group') {
        const priorityA = getGroupPriority(a.data);
        const priorityB = getGroupPriority(b.data);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return new Date(b.data.lastActiveAt).getTime() - new Date(a.data.lastActiveAt).getTime();
      }

      return 0;
    });
  }, [visibleWindows, groups, query, currentWindowId, currentGroupId, sshProfilesById]);

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex((prev) => Math.min(prev, filteredItems.length - 1));
  }, [filteredItems.length]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setQuery('');
      setSelectedIndex(0);

      const animationFrameId = requestAnimationFrame(() => {
        setIsAnimating(true);
      });

      const focusTimerId = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => {
        cancelAnimationFrame(animationFrameId);
        window.clearTimeout(focusTimerId);
      };
    }

    setIsAnimating(false);
    const timerId = window.setTimeout(() => {
      setShouldRender(false);
    }, 200);

    return () => window.clearTimeout(timerId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const moveSelection = (direction: 1 | -1) => {
      if (!filteredItems.length) {
        return;
      }

      setSelectedIndex((prev) => (prev + direction + filteredItems.length) % filteredItems.length);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          moveSelection(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          moveSelection(-1);
          break;
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          moveSelection(e.shiftKey ? -1 : 1);
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

      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        e.stopPropagation();
        moveSelection(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onSelect, onSelectGroup, onClose]);

  useEffect(() => {
    if (!listRef.current || !filteredItems.length) {
      return;
    }

    const selectedElement = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selectedElement?.scrollIntoView({ block: 'nearest' });
  }, [filteredItems.length, selectedIndex]);

  if (!shouldRender) return null;

  return (
    <>
      <div
        className={`${idePopupOverlayClassName} z-[2000] transition-opacity duration-200 ${
          isAnimating ? 'opacity-60' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <div
        className={`fixed top-[15%] left-1/2 -translate-x-1/2 z-[2001] w-[800px] max-w-[90vw] transition-all duration-200 ${
          isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <IdePopupShell className="flex max-h-[72vh] flex-col">
          <div className={`${idePopupSectionClassName} px-5 py-3`}>
            <div className={idePopupHeaderMetaClassName}>Quick Switcher</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className={idePopupTitleClassName}>{t('quickSwitcher.title')}</div>
                <div className={idePopupSubtitleClassName}>{t('quickSwitcher.shortcutHint')}</div>
              </div>
              {query ? (
                <span className="rounded-md border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_72%,transparent)] px-2 py-1 text-[11px] text-[rgb(var(--muted-foreground))]">
                  {t('quickSwitcher.resultsCount', { count: filteredItems.length })}
                </span>
              ) : null}
            </div>
          </div>

          <div className="border-b border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_82%,transparent)] px-5 py-3">
            <div className="flex items-center gap-3">
              <Search size={20} className="shrink-0 text-[rgb(var(--muted-foreground))]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder={t('quickSwitcher.searchPlaceholder')}
                className="flex-1 bg-transparent text-base text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--muted-foreground))]"
              />
            </div>
          </div>

          <div
            ref={listRef}
            className={`max-h-[500px] overflow-y-auto py-2 ${idePopupScrollAreaClassName}`}
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgb(var(--border)) transparent',
            }}
          >
            {filteredItems.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mb-2 text-sm text-[rgb(var(--foreground))]">{t('quickSwitcher.noResults')}</div>
                <div className="text-xs text-[rgb(var(--muted-foreground))]">
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

          <div className="border-t border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_72%,transparent)] px-5 py-3 text-xs text-[rgb(var(--muted-foreground))]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[rgb(var(--muted-foreground))]">↑↓</kbd>
                <span>{t('quickSwitcher.select')}</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[rgb(var(--muted-foreground))]">Enter</kbd>
                <span>{t('quickSwitcher.switch')}</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[rgb(var(--muted-foreground))]">Esc</kbd>
                <span>{t('quickSwitcher.cancel')}</span>
              </span>
            </div>
            <div className="text-[rgb(var(--muted-foreground))]">
              {t('quickSwitcher.shortcutHint')}
            </div>
          </div>
        </IdePopupShell>
      </div>
    </>
  );
};

QuickSwitcher.displayName = 'QuickSwitcher';
