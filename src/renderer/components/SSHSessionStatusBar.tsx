import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, FolderKanban, HardDrive, MemoryStick, Server, X } from 'lucide-react';
import type { SSHSessionMetrics } from '../../shared/types/ssh';
import { WindowStatus } from '../types/window';
import { useI18n } from '../i18n';
import { AppTooltip } from './ui/AppTooltip';

const METRICS_REFRESH_INTERVAL_MS = 15000;

interface SSHSessionStatusBarProps {
  windowId: string | null;
  paneId: string | null;
  paneStatus?: WindowStatus | null;
  currentCwd?: string | null;
  onClose?: () => void;
}

export function SSHSessionStatusBar({
  windowId,
  paneId,
  paneStatus,
  currentCwd,
  onClose,
}: SSHSessionStatusBarProps) {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<SSHSessionMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const targetPath = useMemo(() => currentCwd?.trim() || undefined, [currentCwd]);
  const canQueryMetrics = paneStatus === WindowStatus.Running || paneStatus === WindowStatus.WaitingForInput;

  const loadMetrics = useCallback(async () => {
    if (!windowId || !paneId || !canQueryMetrics || !window.electronAPI?.getSSHSessionMetrics) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await window.electronAPI.getSSHSessionMetrics({
        windowId,
        paneId,
        ...(targetPath ? { path: targetPath } : {}),
      });

      if (!response.success) {
        throw new Error(response.error || t('sshSessionStatusBar.loadError'));
      }

      if (!response.data) {
        setMetrics(null);
        setError('');
        return;
      }

      setMetrics(response.data);
    } catch (metricsError) {
      setError((metricsError as Error).message || t('sshSessionStatusBar.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [canQueryMetrics, paneId, t, targetPath, windowId]);

  useEffect(() => {
    if (!windowId || !paneId) {
      return;
    }

    if (!canQueryMetrics) {
      setIsLoading(false);
      setMetrics(null);
      setError('');
      return;
    }

    void loadMetrics();

    const timer = window.setInterval(() => {
      void loadMetrics();
    }, METRICS_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [canQueryMetrics, loadMetrics, paneId, windowId]);

  if (!windowId || !paneId) {
    return null;
  }

  return (
    <div
      data-testid="ssh-session-status-bar"
      className="flex h-8 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950/90 px-3 text-[11px] text-zinc-400"
    >
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <StatusItem
          icon={<Server size={12} />}
          label={t('sshSessionStatusBar.host')}
          value={metrics?.hostname || '--'}
          loading={isLoading && !metrics}
        />
        <StatusItem
          icon={<FolderKanban size={12} />}
          label={t('sshSessionStatusBar.cwd')}
          value={targetPath || '--'}
          mono
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <StatusItem
          icon={<Activity size={12} />}
          label={t('sshSessionStatusBar.load')}
          value={metrics?.loadAverage.length ? metrics.loadAverage.join(' / ') : '--'}
          loading={isLoading && !metrics}
        />
        <StatusItem
          icon={<MemoryStick size={12} />}
          label={t('sshSessionStatusBar.memory')}
          value={formatUsage(metrics?.memory?.usedPercent)}
          detail={formatMetricBytes(metrics?.memory?.usedBytes, metrics?.memory?.totalBytes)}
          loading={isLoading && !metrics}
        />
        <StatusItem
          icon={<HardDrive size={12} />}
          label={t('sshSessionStatusBar.disk')}
          value={formatUsage(metrics?.disk?.usedPercent)}
          detail={formatMetricBytes(metrics?.disk?.usedBytes, metrics?.disk?.totalBytes)}
          loading={isLoading && !metrics}
        />
        {error && (
          <AppTooltip content={error}>
            <span className="inline-flex h-5 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 text-amber-200">
              <AlertCircle size={12} />
              <span>{t('sshSessionStatusBar.unavailable')}</span>
            </span>
          </AppTooltip>
        )}
        {onClose && (
          <AppTooltip content={t('sshSessionStatusBar.hide')}>
            <button
              type="button"
              aria-label={t('sshSessionStatusBar.hide')}
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/80 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              <X size={12} />
            </button>
          </AppTooltip>
        )}
      </div>
    </div>
  );
}

function StatusItem({
  icon,
  label,
  value,
  detail,
  loading = false,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  loading?: boolean;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1 ${
        loading ? 'animate-pulse' : ''
      }`}
    >
      <span className="text-zinc-500">{icon}</span>
      <span className="text-zinc-500">{label}</span>
      <span className={`truncate text-zinc-100 ${mono ? 'font-mono' : ''}`}>
        {loading ? '...' : value}
      </span>
      {detail && (
        <span className="truncate text-zinc-500">
          {detail}
        </span>
      )}
    </span>
  );
}

function formatUsage(value?: number | null): string {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return '--';
  }

  return `${Math.round((value ?? 0) * 10) / 10}%`;
}

function formatMetricBytes(usedBytes?: number | null, totalBytes?: number | null): string | undefined {
  if (!Number.isFinite(usedBytes ?? Number.NaN) || !Number.isFinite(totalBytes ?? Number.NaN)) {
    return undefined;
  }

  return `${formatFileSize(usedBytes ?? 0)} / ${formatFileSize(totalBytes ?? 0)}`;
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 1024) {
    return `${size || 0} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
