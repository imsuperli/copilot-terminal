import React, {
  useMemo,
  useSyncExternalStore,
} from 'react';
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { CodePaneRuntimeStore } from '../../../stores/codePaneRuntimeStore';
import type {
  CodePaneIndexProgressPayload,
  CodePaneLanguageWorkspaceState,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface PerformanceTask {
  id: string;
  label: string;
  detail: string;
  status: 'running' | 'idle' | 'error';
}

interface PerformanceToolWindowProps {
  runtimeStore: CodePaneRuntimeStore;
  activeTasks: PerformanceTask[];
  indexStatus: CodePaneIndexProgressPayload | null;
  languageWorkspaceState: CodePaneLanguageWorkspaceState | null;
  onClose: () => void;
  onRefresh: () => void;
}

export function PerformanceToolWindow({
  runtimeStore,
  activeTasks,
  indexStatus,
  languageWorkspaceState,
  onClose,
  onRefresh,
}: PerformanceToolWindowProps) {
  const { t } = useI18n();
  const runtimeStoreVersion = useSyncExternalStore(
    runtimeStore.subscribe.bind(runtimeStore),
    runtimeStore.getVersion.bind(runtimeStore),
    runtimeStore.getVersion.bind(runtimeStore),
  );
  const requests = useMemo(() => (
    runtimeStore.getRecentRequests()
  ), [runtimeStore, runtimeStoreVersion]);
  const runningRequests = requests.filter((request) => request.status === 'running');
  const recentRequests = requests.slice(0, 20);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.performanceTab')}
          </div>
          <div className="text-xs text-zinc-500">{requests.length}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-zinc-800 p-1 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-r border-zinc-800">
          <header className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {t('codePane.performanceTasks')}
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
            {indexStatus && (
              <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300">
                <div className="font-medium text-zinc-100">{t('codePane.performanceIndexing')}</div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  {indexStatus.state === 'building'
                    ? t('codePane.indexingProgress', {
                      processed: indexStatus.processedDirectoryCount,
                      total: indexStatus.totalDirectoryCount,
                      files: indexStatus.indexedFileCount,
                    })
                    : indexStatus.state === 'error'
                      ? indexStatus.error || t('codePane.indexingFailed')
                      : t('codePane.saved')}
                </div>
              </div>
            )}

            {languageWorkspaceState && (
              <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300">
                <div className="font-medium text-zinc-100">{t('codePane.performanceLanguageImport')}</div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  {languageWorkspaceState.progressText ?? languageWorkspaceState.message ?? languageWorkspaceState.phase}
                </div>
              </div>
            )}

            {activeTasks.length > 0 ? (
              <div className="space-y-2">
                {activeTasks.map((task) => (
                  <div key={task.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300">
                    <div className="flex items-center gap-2">
                      {task.status === 'running' ? (
                        <Loader2 size={12} className="animate-spin text-sky-300" />
                      ) : task.status === 'error' ? (
                        <AlertTriangle size={12} className="text-red-300" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-zinc-600" />
                      )}
                      <div className="font-medium text-zinc-100">{task.label}</div>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-400">{task.detail}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-500">{t('codePane.performanceNoTasks')}</div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <header className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {t('codePane.performanceRequests')}
          </header>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {runningRequests.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                  {t('codePane.performanceRunningRequests')}
                </div>
                <div className="space-y-2">
                  {runningRequests.map((request) => (
                    <div key={request.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300">
                      <div className="flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin text-sky-300" />
                        <div className="font-medium text-zinc-100">{request.label}</div>
                      </div>
                      {request.meta && (
                        <div className="mt-1 text-[11px] text-zinc-500">{request.meta}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recentRequests.length > 0 ? (
              <div className="space-y-2">
                {recentRequests.map((request) => (
                  <div key={request.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-zinc-100">{request.label}</div>
                        {request.meta && (
                          <div className="mt-1 truncate text-[11px] text-zinc-500">{request.meta}</div>
                        )}
                      </div>
                      <div className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        request.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : request.status === 'error'
                            ? 'bg-red-500/15 text-red-300'
                            : request.status === 'cancelled'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-sky-500/15 text-sky-300'
                      }`}>
                        {request.status}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                      {typeof request.durationMs === 'number' && <span>{request.durationMs}ms</span>}
                      {request.fromCache && <span>{t('codePane.performanceCacheHit')}</span>}
                      {request.error && <span className="truncate text-red-300">{request.error}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-500">{t('codePane.performanceNoRequests')}</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
