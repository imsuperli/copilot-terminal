import React, { useEffect, useState } from 'react';

interface CleanupProgress {
  current: number;
  total: number;
}

export const CleanupOverlay: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState<CleanupProgress>({ current: 0, total: 0 });

  useEffect(() => {
    const handleCleanupStarted = () => {
      setIsVisible(true);
      setProgress({ current: 0, total: 0 });
    };

    const handleCleanupProgress = (_event: unknown, payload: CleanupProgress) => {
      setProgress(payload);
    };

    window.electronAPI.onCleanupStarted(handleCleanupStarted);
    window.electronAPI.onCleanupProgress(handleCleanupProgress);

    return () => {
      window.electronAPI.offCleanupStarted(handleCleanupStarted);
      window.electronAPI.offCleanupProgress(handleCleanupProgress);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-8 shadow-2xl max-w-md w-full mx-4">
        <div className="flex items-center justify-center mb-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>

        <h2 className="text-xl font-semibold text-center mb-4 text-zinc-100">
          正在清理子进程
        </h2>

        {progress.total > 0 && (
          <>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-zinc-400 mb-2">
                <span>进度</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            <p className="text-center text-sm text-zinc-400">
              {percentage}% 完成
            </p>
          </>
        )}

        {progress.total === 0 && (
          <p className="text-center text-sm text-zinc-400">
            正在准备清理...
          </p>
        )}
      </div>
    </div>
  );
};
