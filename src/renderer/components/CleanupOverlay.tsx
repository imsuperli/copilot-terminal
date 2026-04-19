import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface CleanupProgress {
  current: number;
  total: number;
}

export const CleanupOverlay: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState<CleanupProgress>({ current: 0, total: 0 });
  const [smoothProgress, setSmoothProgress] = useState(0); // 平滑进度条
  const { t } = useI18n();

  useEffect(() => {
    const handleCleanupStarted = () => {
      setIsVisible(true);
      setProgress({ current: 0, total: 0 });
      setSmoothProgress(0);
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

  // 平滑进度条动画
  useEffect(() => {
    if (progress.total === 0) return;

    const targetPercentage = Math.round((progress.current / progress.total) * 100);

    // 使用 requestAnimationFrame 实现平滑过渡
    let animationFrame: number;
    const animate = () => {
      setSmoothProgress((prev) => {
        const diff = targetPercentage - prev;
        if (Math.abs(diff) < 0.5) {
          return targetPercentage;
        }
        return prev + diff * 0.2; // 缓动系数
      });
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [progress]);

  if (!isVisible) {
    return null;
  }

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/72 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-lg border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_92%,transparent)] p-8 shadow-2xl">
        <div className="flex items-center justify-center mb-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[rgb(var(--primary))]"></div>
        </div>

        <h2 className="mb-4 text-center text-xl font-semibold text-[rgb(var(--foreground))]">
          {t('cleanup.title')}
        </h2>

        {progress.total > 0 && (
          <>
            <div className="mb-4">
              <div className="mb-2 flex justify-between text-sm text-[rgb(var(--muted-foreground))]">
                <span>{t('cleanup.progress')}</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--secondary))]">
                <div
                  className="bg-[rgb(var(--primary))] h-full transition-all duration-200 ease-out"
                  style={{ width: `${smoothProgress}%` }}
                />
              </div>
            </div>

            <p className="text-center text-sm text-[rgb(var(--muted-foreground))]">
              {t('cleanup.completed', { percentage })}
            </p>
          </>
        )}

        {progress.total === 0 && (
          <p className="text-center text-sm text-[rgb(var(--muted-foreground))]">
            {t('cleanup.preparing')}
          </p>
        )}
      </div>
    </div>
  );
};
