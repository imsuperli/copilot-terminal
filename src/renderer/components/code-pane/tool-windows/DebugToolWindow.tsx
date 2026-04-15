import React, { useEffect, useState } from 'react';
import {
  Bug,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  Square,
  StepForward,
  X,
} from 'lucide-react';
import type {
  CodePaneBreakpoint,
  CodePaneExceptionBreakpoint,
  CodePaneDebugSession,
  CodePaneDebugSessionDetails,
  CodePaneRunTarget,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface DebugEvaluationEntry {
  id: string;
  expression: string;
  value: string;
}

interface DebugWatchEntry {
  id: string;
  expression: string;
  value?: string;
  error?: string;
}

interface DebugToolWindowProps {
  targets: CodePaneRunTarget[];
  breakpoints: CodePaneBreakpoint[];
  exceptionBreakpoints: CodePaneExceptionBreakpoint[];
  sessions: CodePaneDebugSession[];
  selectedSession: CodePaneDebugSession | null;
  selectedDetails: CodePaneDebugSessionDetails | null;
  selectedOutput: string;
  watchEntries: DebugWatchEntry[];
  evaluations: DebugEvaluationEntry[];
  isLoading: boolean;
  isDetailsLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onStartDebug: (targetId: string) => void | Promise<void>;
  onSelectSession: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void | Promise<void>;
  onPauseSession: (sessionId: string) => void | Promise<void>;
  onContinueSession: (sessionId: string) => void | Promise<void>;
  onStepOver: (sessionId: string) => void | Promise<void>;
  onStepInto: (sessionId: string) => void | Promise<void>;
  onStepOut: (sessionId: string) => void | Promise<void>;
  onOpenFrame: (frameId: string) => void | Promise<void>;
  onEvaluate: (expression: string) => void | Promise<void>;
  onAddWatch: (expression: string) => void | Promise<void>;
  onRemoveWatch: (expression: string) => void | Promise<void>;
  onRefreshWatches: () => void | Promise<void>;
  onUpdateBreakpoint: (breakpoint: CodePaneBreakpoint) => void | Promise<void>;
  onRemoveBreakpoint: (breakpoint: CodePaneBreakpoint) => void | Promise<void>;
  onSetExceptionBreakpoint: (breakpointId: CodePaneExceptionBreakpoint['id'], enabled: boolean) => void | Promise<void>;
}

export function DebugToolWindow({
  targets,
  breakpoints,
  exceptionBreakpoints,
  sessions,
  selectedSession,
  selectedDetails,
  selectedOutput,
  watchEntries,
  evaluations,
  isLoading,
  isDetailsLoading,
  error,
  onClose,
  onRefresh,
  onStartDebug,
  onSelectSession,
  onStopSession,
  onPauseSession,
  onContinueSession,
  onStepOver,
  onStepInto,
  onStepOut,
  onOpenFrame,
  onEvaluate,
  onAddWatch,
  onRemoveWatch,
  onRefreshWatches,
  onUpdateBreakpoint,
  onRemoveBreakpoint,
  onSetExceptionBreakpoint,
}: DebugToolWindowProps) {
  const { t } = useI18n();
  const [expression, setExpression] = useState('');
  const [watchExpression, setWatchExpression] = useState('');
  const isPaused = selectedSession?.state === 'paused';
  const isRunning = selectedSession?.state === 'running';

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.debugTab')}
          </div>
          <div className="text-xs text-zinc-500">
            {sessions.length > 0 ? `${sessions.length}` : t('codePane.debugTargets')}
          </div>
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

      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {t('codePane.debugTargets')}
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.debugTargetsLoading')}
          </div>
        ) : error ? (
          <div className="text-xs text-red-300">{error}</div>
        ) : targets.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {targets.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => {
                  void onStartDebug(target.id);
                }}
                className="flex min-w-[220px] items-start justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-zinc-100">{target.label}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{target.detail}</div>
                </div>
                <div className="shrink-0 rounded bg-amber-500/15 p-1 text-amber-300">
                  <Bug size={12} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">{t('codePane.debugTargetsEmpty')}</div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-80 shrink-0 flex-col border-r border-zinc-800">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              {t('codePane.debugSessions')}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
              {sessions.length > 0 ? (
                <div className="space-y-1">
                  {sessions.map((session) => {
                    const isSelected = selectedSession?.id === session.id;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          onSelectSession(session.id);
                        }}
                        className={`w-full rounded border px-2 py-2 text-left transition-colors ${
                          isSelected
                            ? 'border-zinc-700 bg-zinc-800 text-zinc-100'
                            : 'border-transparent bg-transparent text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">{session.label}</div>
                            <div className="mt-1 truncate text-[10px] text-zinc-500">{session.detail}</div>
                          </div>
                          <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${getSessionTone(session.state)}`}>
                            {session.state.toUpperCase()}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-zinc-500">{t('codePane.debugSessionsEmpty')}</div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 max-h-[45%] flex-col border-t border-zinc-800">
            <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              {t('codePane.breakpointManager')}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
              <div className="mb-3 space-y-2">
                {exceptionBreakpoints.map((breakpoint) => (
                  <label
                    key={breakpoint.id}
                    className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 px-2 py-2 text-xs text-zinc-300"
                  >
                    <span>{breakpoint.label}</span>
                    <input
                      type="checkbox"
                      checked={breakpoint.enabled}
                      onChange={(event) => {
                        void onSetExceptionBreakpoint(breakpoint.id, event.target.checked);
                      }}
                    />
                  </label>
                ))}
              </div>

              {breakpoints.length > 0 ? (
                <div className="space-y-2">
                  {breakpoints.map((breakpoint) => (
                    <BreakpointManagerRow
                      key={`${breakpoint.filePath}:${breakpoint.lineNumber}`}
                      breakpoint={breakpoint}
                      onUpdateBreakpoint={onUpdateBreakpoint}
                      onRemoveBreakpoint={onRemoveBreakpoint}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-zinc-500">{t('codePane.breakpointManagerEmpty')}</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {t('codePane.debugControls')}
              </div>
              {selectedSession && (
                <div className="mt-1 truncate text-xs text-zinc-300">{selectedSession.label}</div>
              )}
            </div>
            {selectedSession && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (isPaused) {
                      void onContinueSession(selectedSession.id);
                    } else {
                      void onPauseSession(selectedSession.id);
                    }
                  }}
                  className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50"
                  aria-label={isPaused ? t('codePane.debugContinue') : t('codePane.debugPause')}
                >
                  {isPaused ? <Play size={12} /> : <Pause size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onStepOver(selectedSession.id);
                  }}
                  disabled={!isPaused}
                  className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('codePane.debugStepOver')}
                >
                  <StepForward size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onStepInto(selectedSession.id);
                  }}
                  disabled={!isPaused}
                  className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('codePane.debugStepInto')}
                >
                  <SkipForward size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onStepOut(selectedSession.id);
                  }}
                  disabled={!isPaused}
                  className="rounded bg-zinc-800 p-1 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('codePane.debugStepOut')}
                >
                  <SkipBack size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onStopSession(selectedSession.id);
                  }}
                  className="rounded bg-red-500/15 p-1 text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200"
                  aria-label={t('codePane.debugStop')}
                >
                  <Square size={12} />
                </button>
              </div>
            )}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] overflow-hidden">
            <div className="flex min-h-0 flex-col border-r border-zinc-800">
              <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {t('codePane.debugCallStack')}
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                {isDetailsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Loader2 size={12} className="animate-spin" />
                    {t('codePane.debugLoading')}
                  </div>
                ) : selectedDetails?.stackFrames.length ? (
                  <div className="space-y-1">
                    {selectedDetails.stackFrames.map((frame) => {
                      const isCurrent = selectedSession?.currentFrame?.id === frame.id;
                      return (
                        <button
                          key={frame.id}
                          type="button"
                          onClick={() => {
                            void onOpenFrame(frame.id);
                          }}
                          className={`w-full rounded border px-2 py-2 text-left transition-colors ${
                            isCurrent
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                              : 'border-transparent bg-transparent text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/70'
                          }`}
                        >
                          <div className="truncate text-xs font-medium">{frame.name}</div>
                          {frame.filePath && frame.lineNumber && (
                            <div className="mt-1 truncate text-[10px] text-zinc-500">
                              {frame.filePath}:{frame.lineNumber}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">{t('codePane.debugCallStackEmpty')}</div>
                )}
              </div>
            </div>

            <div className="grid min-h-0 grid-rows-[minmax(0,220px)_minmax(0,1fr)] overflow-hidden">
              <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-zinc-800">
                <div className="flex min-h-0 flex-col border-r border-zinc-800">
                  <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    {t('codePane.debugVariables')}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                    {selectedDetails?.scopes.length ? (
                      <div className="space-y-3">
                        {selectedDetails.scopes.map((scope) => (
                          <div key={scope.id}>
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                              {scope.name}
                            </div>
                            <div className="space-y-1">
                              {scope.variables.map((variable) => (
                                <div key={variable.id} className="rounded bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300">
                                  <span className="font-medium text-zinc-100">{variable.name}</span>
                                  <span className="text-zinc-500"> = </span>
                                  <span>{variable.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">{t('codePane.debugVariablesEmpty')}</div>
                    )}
                  </div>
                </div>

                <div className="flex min-h-0 flex-col">
                  <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    {t('codePane.debugWatch')}
                  </div>
                  <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
                    <input
                      value={watchExpression}
                      onChange={(event) => {
                        setWatchExpression(event.target.value);
                      }}
                      placeholder={t('codePane.debugWatchPlaceholder')}
                      disabled={!selectedSession}
                      className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!watchExpression.trim()) {
                          return;
                        }

                        void onAddWatch(watchExpression.trim());
                        setWatchExpression('');
                      }}
                      disabled={!selectedSession || !watchExpression.trim()}
                      className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('codePane.debugWatchAdd')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void onRefreshWatches();
                      }}
                      disabled={!selectedSession || !isPaused || watchEntries.length === 0}
                      className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('codePane.refresh')}
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                    {watchEntries.length > 0 ? (
                      <div className="space-y-2">
                        {watchEntries.map((watchEntry) => (
                          <div key={watchEntry.id} className="rounded bg-zinc-900/60 px-2 py-2 text-[11px] text-zinc-300">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-zinc-100">{watchEntry.expression}</div>
                                <div className={`mt-1 break-words ${watchEntry.error ? 'text-red-300' : 'text-zinc-400'}`}>
                                  {watchEntry.error ?? watchEntry.value ?? t('codePane.debugWatchUnavailable')}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  void onRemoveWatch(watchEntry.expression);
                                }}
                                className="shrink-0 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:bg-red-500/20 hover:text-red-200"
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">{t('codePane.debugWatchEmpty')}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
                  <div className="flex min-h-0 flex-col border-r border-zinc-800">
                    <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                      {t('codePane.debugEvaluate')}
                    </div>
                    <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
                      <input
                        value={expression}
                        onChange={(event) => {
                          setExpression(event.target.value);
                        }}
                        placeholder={t('codePane.debugEvaluatePlaceholder')}
                        disabled={!selectedSession || !isPaused}
                        className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!expression.trim()) {
                            return;
                          }

                          void onEvaluate(expression.trim());
                          setExpression('');
                        }}
                        disabled={!selectedSession || !isPaused || !expression.trim()}
                        className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t('codePane.debugEvaluateRun')}
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                      {evaluations.length > 0 ? (
                        <div className="space-y-2">
                          {evaluations.map((evaluation) => (
                            <div key={evaluation.id} className="rounded bg-zinc-900/60 px-2 py-2 text-[11px] text-zinc-300">
                              <div className="font-medium text-zinc-100">{evaluation.expression}</div>
                              <div className="mt-1 break-words text-zinc-400">{evaluation.value}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">{t('codePane.debugEvaluateEmpty')}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col">
                    <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                      {t('codePane.runConsole')}
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-zinc-200">
                        {selectedOutput || '$ '}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getSessionTone(state: CodePaneDebugSession['state']): string {
  switch (state) {
    case 'paused':
      return 'bg-amber-500/15 text-amber-300';
    case 'running':
      return 'bg-emerald-500/15 text-emerald-300';
    case 'error':
      return 'bg-red-500/15 text-red-300';
    case 'stopped':
      return 'bg-zinc-700 text-zinc-300';
    case 'starting':
    default:
      return 'bg-sky-500/15 text-sky-300';
  }
}

interface BreakpointManagerRowProps {
  breakpoint: CodePaneBreakpoint;
  onUpdateBreakpoint: (breakpoint: CodePaneBreakpoint) => void | Promise<void>;
  onRemoveBreakpoint: (breakpoint: CodePaneBreakpoint) => void | Promise<void>;
}

function BreakpointManagerRow({
  breakpoint,
  onUpdateBreakpoint,
  onRemoveBreakpoint,
}: BreakpointManagerRowProps) {
  const { t } = useI18n();
  const [condition, setCondition] = useState(breakpoint.condition ?? '');
  const [logMessage, setLogMessage] = useState(breakpoint.logMessage ?? '');
  const [isEnabled, setIsEnabled] = useState(breakpoint.enabled !== false);

  useEffect(() => {
    setCondition(breakpoint.condition ?? '');
    setLogMessage(breakpoint.logMessage ?? '');
    setIsEnabled(breakpoint.enabled !== false);
  }, [breakpoint.condition, breakpoint.enabled, breakpoint.logMessage]);

  const trimmedCondition = condition.trim();
  const trimmedLogMessage = logMessage.trim();
  const isDirty = trimmedCondition !== (breakpoint.condition ?? '')
    || trimmedLogMessage !== (breakpoint.logMessage ?? '')
    || isEnabled !== (breakpoint.enabled !== false);

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-2">
      <div className="flex items-start justify-between gap-2">
        <label className="flex min-w-0 items-center gap-2 text-xs text-zinc-200">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(event) => {
              setIsEnabled(event.target.checked);
            }}
          />
          <span className="truncate font-medium">
            {getBreakpointLabel(breakpoint)}
          </span>
        </label>
        <button
          type="button"
          onClick={() => {
            void onRemoveBreakpoint(breakpoint);
          }}
          className="shrink-0 rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:bg-red-500/20 hover:text-red-200"
        >
          {t('common.delete')}
        </button>
      </div>
      <div className="mt-1 truncate text-[10px] text-zinc-500">{breakpoint.filePath}</div>
      <div className="mt-2 space-y-2">
        <input
          value={condition}
          onChange={(event) => {
            setCondition(event.target.value);
          }}
          placeholder={t('codePane.breakpointConditionPlaceholder')}
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700"
        />
        <input
          value={logMessage}
          onChange={(event) => {
            setLogMessage(event.target.value);
          }}
          placeholder={t('codePane.breakpointLogMessagePlaceholder')}
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700"
        />
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={!isDirty}
          onClick={() => {
            const nextBreakpoint: CodePaneBreakpoint = {
              filePath: breakpoint.filePath,
              lineNumber: breakpoint.lineNumber,
            };
            if (breakpoint.id) {
              nextBreakpoint.id = breakpoint.id;
            }
            if (trimmedCondition) {
              nextBreakpoint.condition = trimmedCondition;
            }
            if (trimmedLogMessage) {
              nextBreakpoint.logMessage = trimmedLogMessage;
            }
            if (!isEnabled) {
              nextBreakpoint.enabled = false;
            }
            void onUpdateBreakpoint({
              ...nextBreakpoint,
            });
          }}
          className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

function getBreakpointLabel(breakpoint: CodePaneBreakpoint): string {
  const leafName = breakpoint.filePath.split(/[/\\]/).at(-1) || breakpoint.filePath;
  return `${leafName}:${breakpoint.lineNumber}`;
}
