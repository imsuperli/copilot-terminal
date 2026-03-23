import { useEffect, useRef } from 'react';

interface KeyboardShortcutsOptions {
  onCtrlTab?: () => void;
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

      if (!enabled) return;

      // Ctrl+Tab: 打开快速切换面板
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        opts.onCtrlTab?.();
        return;
      }

      // Ctrl+B: 切换侧边栏
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        opts.onCtrlB?.();
        return;
      }

      // Ctrl+1~9: 切换到第 N 个窗口
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        opts.onCtrlNumber?.(parseInt(e.key, 10));
        return;
      }

      // 注意：Escape 键的处理已移除，由各个组件（QuickSwitcher 等）自己的事件监听器处理
      // 这样可以避免在 xterm textarea 中拦截 Escape 键，确保 vi/vim 等编辑器能正常接收 Escape
    };

    // 改为冒泡阶段监听，避免干扰 xterm.js 的输入处理
    window.addEventListener('keydown', handleKeyDown, false);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, false);
    };
  }, []); // 空依赖数组：listener 只注册一次，通过 ref 读取最新值
}
