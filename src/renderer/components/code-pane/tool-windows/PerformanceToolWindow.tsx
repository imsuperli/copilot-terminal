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
import {
  IdePopupShell,
  idePopupBodyClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupScrollAreaClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
} from '../../ui/ide-popup';

type Translate = ReturnType<typeof useI18n>['t'];

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
  const languageWorkspaceMessage = languageWorkspaceState
    ? languageWorkspaceState.progressText
      ?? languageWorkspaceState.message
      ?? formatWorkspacePhaseLabel(languageWorkspaceState.phase, t)
    : null;

  return (
    <IdePopupShell className="flex h-full min-h-0 flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className={idePopupHeaderMetaClassName}>
            {t('codePane.performanceTab')}
          </div>
          <div className={`mt-1 ${idePopupTitleClassName}`}>{t('codePane.performanceRequests')}</div>
          <div className={idePopupSubtitleClassName}>{requests.length}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className={idePopupIconButtonClassName}
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={idePopupIconButtonClassName}
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-r border-[rgb(var(--border))]">
          <header className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.performanceTasks')}
          </header>
          <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3`}>
            {indexStatus && (
              <div className="rounded border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] p-3 text-xs text-[rgb(var(--muted-foreground))]">
                <div className="font-medium text-[rgb(var(--foreground))]">{t('codePane.performanceIndexing')}</div>
                <div className="mt-1 text-[11px] text-[rgb(var(--muted-foreground))]">
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
              <div className="rounded border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] p-3 text-xs text-[rgb(var(--muted-foreground))]">
                <div className="font-medium text-[rgb(var(--foreground))]">{t('codePane.performanceLanguageImport')}</div>
                <div className="mt-1 text-[11px] text-[rgb(var(--muted-foreground))]">
                  {languageWorkspaceMessage}
                </div>
              </div>
            )}

            {activeTasks.length > 0 ? (
              <div className="space-y-2">
                {activeTasks.map((task) => (
                  <div key={task.id} className="rounded border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] p-3 text-xs text-[rgb(var(--muted-foreground))]">
                    <div className="flex items-center gap-2">
                      {task.status === 'running' ? (
                        <Loader2 size={12} className="animate-spin text-[rgb(var(--info))]" />
                      ) : task.status === 'error' ? (
                        <AlertTriangle size={12} className="text-[rgb(var(--error))]" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-[rgb(var(--muted-foreground))]" />
                      )}
                      <div className="font-medium text-[rgb(var(--foreground))]">{task.label}</div>
                    </div>
                    <div className="mt-1 text-[11px] text-[rgb(var(--muted-foreground))]">{task.detail}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.performanceNoTasks')}</div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <header className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.performanceRequests')}
          </header>
          <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-3 py-3`}>
            {runningRequests.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
                  {t('codePane.performanceRunningRequests')}
                </div>
                <div className="space-y-2">
                  {runningRequests.map((request) => (
                    <div key={request.id} className="rounded border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] p-3 text-xs text-[rgb(var(--muted-foreground))]">
                      <div className="flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin text-[rgb(var(--info))]" />
                        <div className="font-medium text-[rgb(var(--foreground))]">{request.label}</div>
                      </div>
                      {request.meta && (
                        <div className="mt-1 text-[11px] text-[rgb(var(--muted-foreground))]">{request.meta}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recentRequests.length > 0 ? (
              <div className="space-y-2">
                {recentRequests.map((request) => (
                  <div key={request.id} className="rounded border border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] p-3 text-xs text-[rgb(var(--muted-foreground))]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[rgb(var(--foreground))]">{request.label}</div>
                        {request.meta && (
                          <div className="mt-1 truncate text-[11px] text-[rgb(var(--muted-foreground))]">{request.meta}</div>
                        )}
                      </div>
                      <div className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        request.status === 'completed'
                          ? 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]'
                          : request.status === 'error'
                            ? 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]'
                            : request.status === 'cancelled'
                              ? 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]'
                              : 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]'
                      }`}>
                        {formatRequestStatus(request.status, t)}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-[rgb(var(--muted-foreground))]">
                      {typeof request.durationMs === 'number' && <span>{request.durationMs}ms</span>}
                      {request.fromCache && <span>{t('codePane.performanceCacheHit')}</span>}
                      {request.error && <span className="truncate text-[rgb(var(--error))]">{request.error}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.performanceNoRequests')}</div>
            )}
          </div>
        </section>
      </div>
    </IdePopupShell>
  );
}

function formatRequestStatus(status: 'running' | 'completed' | 'error' | 'cancelled', t: Translate): string {
  switch (status) {
    case 'completed':
      return t('codePane.requestStatusCompleted');
    case 'error':
      return t('codePane.requestStatusError');
    case 'cancelled':
      return t('codePane.requestStatusCancelled');
    case 'running':
    default:
      return t('codePane.requestStatusRunning');
  }
}

function formatWorkspacePhaseLabel(
  phase: CodePaneLanguageWorkspaceState['phase'],
  t: Translate,
): string {
  switch (phase) {
    case 'detecting-project':
      return t('codePane.workspacePhaseDetecting');
    case 'importing-project':
      return t('codePane.workspacePhaseImporting');
    case 'indexing-workspace':
      return t('codePane.workspacePhaseIndexing');
    case 'starting-runtime':
    case 'starting':
      return t('codePane.workspacePhaseStarting');
    case 'ready':
      return t('codePane.workspacePhaseReady');
    case 'degraded':
      return t('codePane.workspacePhaseDegraded');
    case 'error':
      return t('codePane.workspacePhaseError');
    case 'idle':
    default:
      return t('codePane.workspacePhaseIdle');
  }
}
