import { useEffect, useRef } from 'react';

interface KeyboardShortcutsOptions {
  onCtrlTab?: () => void;
  onCtrlShiftTab?: () => void;
  onCtrlP?: () => void;
  onCtrlB?: () => void;
  onCtrlNumber?: (num: number) => void;
  onEscape?: () => boolean | void; // 返回 true 表示已处理，阻止传播；返回 false 表示未处理，继续传播
  enabled?: boolean;
}

/**
 * 全局快捷键 Hook
 * 处理终端视图中的快捷键
 * 使用 ref 模式避免 stale closure 问题，listener 只注册一次
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  // 同步更新 ref，始终持有最新的 options（包含最新的 enabled 和所有回调）
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const opts = optionsRef.current;
      const enabled = opts.enabled !== false; // 默认 true

      // 如果事件来自 xterm.js 的 textarea，只处理明确的快捷键
      const target = e.target as HTMLElement;
      const isXtermTextarea = target?.classList?.contains('xterm-helper-textarea');

      console.log('[Shortcuts] keydown:', e.key, 'ctrl:', e.ctrlKey, 'enabled:', enabled, 'target:', target?.tagName, 'isXterm:', isXtermTextarea);

      if (isXtermTextarea) {
        // 在 xterm textarea 中，只处理明确的快捷键，其他一律放行
        const isShortcut =
          (e.ctrlKey && e.key === 'Tab') ||
          (e.ctrlKey && e.key === 'p') ||
          (e.ctrlKey && e.key === 'b') ||
          (e.ctrlKey && e.key >= '1' && e.key <= '9') ||
          (e.key === 'Escape');

        if (!isShortcut) {
          console.log('[Shortcuts] Not a shortcut in xterm, allowing propagation');
          return; // 不是快捷键，直接放行
        }
      }

      if (!enabled) return;

      // Ctrl+Tab: 切换到下一个窗口
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        console.log('[Shortcuts] Ctrl+Tab triggered');
        e.preventDefault();
        opts.onCtrlTab?.();
        return;
      }

      // Ctrl+Shift+Tab: 切换到上一个窗口
      if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        console.log('[Shortcuts] Ctrl+Shift+Tab triggered');
        e.preventDefault();
        opts.onCtrlShiftTab?.();
        return;
      }

      // Ctrl+P: 打开快速切换面板
      if (e.ctrlKey && e.key === 'p') {
        console.log('[Shortcuts] Ctrl+P triggered');
        e.preventDefault();
        opts.onCtrlP?.();
        return;
      }

      // Ctrl+B: 切换侧边栏
      if (e.ctrlKey && e.key === 'b') {
        console.log('[Shortcuts] Ctrl+B triggered');
        e.preventDefault();
        opts.onCtrlB?.();
        return;
      }

      // Ctrl+1~9: 切换到第 N 个窗口
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        console.log('[Shortcuts] Ctrl+' + e.key + ' triggered');
        e.preventDefault();
        opts.onCtrlNumber?.(parseInt(e.key, 10));
        return;
      }

      // Escape: 关闭打开的面板（QuickSwitcher、TabSwitcher）
      if (e.key === 'Escape') {
        console.log('[Shortcuts] Escape triggered');
        // 调用回调，如果返回 true 表示已处理，阻止事件传播
        if (opts.onEscape) {
          const handled = opts.onEscape();
          if (handled) {
            console.log('[Shortcuts] Escape handled by callback, preventing propagation');
            e.preventDefault();
            e.stopPropagation();
          } else {
            console.log('[Shortcuts] Escape not handled, allowing propagation to terminal');
          }
        }
        return;
      }
    };

    console.log('[Shortcuts] Registering keydown listener (bubble phase)');
    // 改为冒泡阶段监听，避免干扰 xterm.js 的输入处理
    window.addEventListener('keydown', handleKeyDown, false);
    return () => {
      console.log('[Shortcuts] Removing keydown listener');
      window.removeEventListener('keydown', handleKeyDown, false);
    };
  }, []); // 空依赖数组：listener 只注册一次，通过 ref 读取最新值
}
