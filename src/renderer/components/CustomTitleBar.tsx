import React, { useEffect, useState } from 'react';
import { Minus, Square, X, Maximize2, GitBranch } from 'lucide-react';

interface CustomTitleBarProps {
  title?: string;
  gitBranch?: string;
  showAppName?: boolean;
  appName?: string;
}

export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
  title = '',
  gitBranch,
  showAppName = false,
  appName = 'Copilot Terminal',
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = window.electronAPI?.platform === 'darwin';

  useEffect(() => {
    window.electronAPI?.windowIsMaximized().then((result) => {
      if (result.success) setIsMaximized(result.data);
    });

    const unsubscribe = window.electronAPI?.onWindowMaximized((maximized) => {
      setIsMaximized(maximized);
    });

    return () => { unsubscribe?.(); };
  }, []);

  const handleMinimize = () => window.electronAPI?.windowMinimize();
  const handleMaximize = () => window.electronAPI?.windowMaximize();
  const handleClose = () => window.electronAPI?.windowClose();
  const handleDoubleClick = () => { if (!isMac) handleMaximize(); };

  // macOS: 左侧红黄绿圆点 + logo，中间标题，右侧留空
  if (isMac) {
    return (
      <div
        className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center px-3 select-none relative flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* 左侧：窗口控制 + logo + 应用名 */}
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex items-center gap-2">
            <button onClick={handleClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors" aria-label="Close" />
            <button onClick={handleMinimize} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors" aria-label="Minimize" />
            <button onClick={handleMaximize} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors" aria-label="Maximize" />
          </div>
          <div className="flex items-center gap-2 ml-1">
            <img src="/resources/icon.png" alt="Logo" className="w-4 h-4" />
            {showAppName && <span className="text-sm text-zinc-300 font-medium">{appName}</span>}
          </div>
        </div>

        {/* 居中：窗口/组标题 */}
        {title && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
            <span className="text-sm text-zinc-300 font-medium truncate max-w-[300px]">{title}</span>
            {gitBranch && (
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <GitBranch size={12} />
                {gitBranch}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Windows/Linux: 左侧 logo，中间标题，右侧最小化/最大化/关闭
  return (
    <div
      className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between select-none relative flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      {/* 左侧：logo + 应用名 */}
      <div className="flex items-center gap-2 pl-3">
        <img src="/resources/icon.png" alt="Logo" className="w-4 h-4" />
        {showAppName && <span className="text-sm text-zinc-300 font-medium">{appName}</span>}
      </div>

      {/* 居中：窗口/组标题 */}
      {title && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
          <span className="text-sm text-zinc-300 font-medium truncate max-w-[300px]">{title}</span>
          {gitBranch && (
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <GitBranch size={12} />
              {gitBranch}
            </span>
          )}
        </div>
      )}

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={handleMinimize} className="h-full px-4 hover:bg-zinc-800 transition-colors flex items-center justify-center" aria-label="Minimize">
          <Minus size={14} className="text-zinc-400" />
        </button>
        <button onClick={handleMaximize} className="h-full px-4 hover:bg-zinc-800 transition-colors flex items-center justify-center" aria-label="Maximize">
          {isMaximized ? <Square size={12} className="text-zinc-400" /> : <Maximize2 size={12} className="text-zinc-400" />}
        </button>
        <button onClick={handleClose} className="h-full px-4 hover:bg-red-600 transition-colors flex items-center justify-center group" aria-label="Close">
          <X size={14} className="text-zinc-400 group-hover:text-white" />
        </button>
      </div>
    </div>
  );
};
