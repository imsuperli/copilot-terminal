import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsOptions {
  onCtrlTab?: () => void;
  onCtrlShiftTab?: () => void;
  onCtrlP?: () => void;
  onCtrlB?: () => void;
  onCtrlNumber?: (num: number) => void;
  onEscape?: () => void;
  enabled?: boolean;
}

/**
 * 全局快捷键 Hook
 * 处理终端视图中的快捷键
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  const {
    onCtrlTab,
    onCtrlShiftTab,
    onCtrlP,
    onCtrlB,
    onCtrlNumber,
    onEscape,
    enabled = true,
  } = options;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Ctrl+Tab: 切换到下一个窗口
    if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      onCtrlTab?.();
      return;
    }

    // Ctrl+Shift+Tab: 切换到上一个窗口
    if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      onCtrlShiftTab?.();
      return;
    }

    // Ctrl+P: 打开快速切换面板
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      onCtrlP?.();
      return;
    }

    // Ctrl+B: 切换侧边栏
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      onCtrlB?.();
      return;
    }

    // Ctrl+1~9: 切换到第 N 个窗口
    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const num = parseInt(e.key, 10);
      onCtrlNumber?.(num);
      return;
    }

    // Escape: 关闭面板或返回
    if (e.key === 'Escape') {
      onEscape?.();
      return;
    }
  }, [enabled, onCtrlTab, onCtrlShiftTab, onCtrlP, onCtrlB, onCtrlNumber, onEscape]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
