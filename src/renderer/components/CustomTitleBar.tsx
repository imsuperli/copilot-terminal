import React, { useEffect, useState } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';

interface CustomTitleBarProps {
  title?: string;
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({ title = '' }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = window.electronAPI?.platform === 'darwin';

  useEffect(() => {
    // 初始化最大化状态
    window.electronAPI?.windowIsMaximized().then((result) => {
      if (result.success) {
        setIsMaximized(result.data);
      }
    });

    // 监听最大化状态变化
    const unsubscribe = window.electronAPI?.onWindowMaximized((maximized) => {
      setIsMaximized(maximized);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.windowMinimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.windowMaximize();
  };

  const handleClose = () => {
    window.electronAPI?.windowClose();
  };

  // macOS 样式：左侧三个圆点按钮
  if (isMac) {
    return (
      <div
        className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* 左侧：macOS 窗口控制按钮 */}
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={handleClose}
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
            aria-label="Close"
          />
          <button
            onClick={handleMinimize}
            className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors"
            aria-label="Minimize"
          />
          <button
            onClick={handleMaximize}
            className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
            aria-label="Maximize"
          />
        </div>

        {/* 居中：标题 */}
        <div className="absolute left-1/2 -translate-x-1/2 text-sm text-zinc-300 font-medium truncate max-w-[400px]">
          {title}
        </div>

        {/* 右侧：占位 */}
        <div className="w-16" />
      </div>
    );
  }

  // Windows/Linux 样式：右侧图标按钮
  return (
    <div
      className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 左侧：占位 */}
      <div className="w-16" />

      {/* 居中：标题 */}
      <div className="absolute left-1/2 -translate-x-1/2 text-sm text-zinc-300 font-medium truncate max-w-[400px]">
        {title}
      </div>

      {/* 右侧：Windows 窗口控制按钮 */}
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="h-full px-4 hover:bg-zinc-800 transition-colors flex items-center justify-center"
          aria-label="Minimize"
        >
          <Minus size={14} className="text-zinc-400" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-4 hover:bg-zinc-800 transition-colors flex items-center justify-center"
          aria-label="Maximize"
        >
          {isMaximized ? (
            <Square size={12} className="text-zinc-400" />
          ) : (
            <Maximize2 size={12} className="text-zinc-400" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="h-full px-4 hover:bg-red-600 transition-colors flex items-center justify-center"
          aria-label="Close"
        >
          <X size={14} className="text-zinc-400 hover:text-white" />
        </button>
      </div>
    </div>
  );
};
