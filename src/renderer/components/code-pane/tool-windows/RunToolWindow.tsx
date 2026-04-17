import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bug,
  Loader2,
  Play,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import type {
  CodePaneRunSession,
  CodePaneRunTarget,
  CodePaneRunTargetCustomization,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface RunToolWindowProps {
  targets: CodePaneRunTarget[];
  sessions: CodePaneRunSession[];
  selectedSession: CodePaneRunSession | null;
  selectedOutput: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onRunTarget: (targetId: string) => void | Promise<void>;
  onDebugTarget: (targetId: string) => void | Promise<void>;
  onSelectSession: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void | Promise<void>;
  getCustomization: (targetId: string) => CodePaneRunTargetCustomization;
  onCustomizationChange: (targetId: string, updates: Partial<CodePaneRunTargetCustomization>) => void;
}

type WindowedListSlice<T> = {
  items: T[];
  offsetTop: number;
  totalHeight: number;
  isWindowed: boolean;
};

const RUN_FIXED_LIST_OVERSCAN = 8;
const RUN_FIXED_LIST_WINDOWING_THRESHOLD = 80;
const RUN_SESSION_ROW_HEIGHT = 68;

function getWindowedListSlice<T>({
  items,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan = RUN_FIXED_LIST_OVERSCAN,
  threshold = RUN_FIXED_LIST_WINDOWING_THRESHOLD,
}: {
  items: T[];
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan?: number;
  threshold?: number;
}): WindowedListSlice<T> {
  if (items.length < threshold || viewportHeight <= 0) {
    return {
      items,
      offsetTop: 0,
      totalHeight: items.length * rowHeight,
      isWindowed: false,
    };
  }

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + (overscan * 2);
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  return {
    items: items.slice(startIndex, endIndex),
    offsetTop: startIndex * rowHeight,
    totalHeight: items.length * rowHeight,
    isWindowed: true,
  };
}

function useFixedWindowedList<T>(items: T[], rowHeight: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const syncViewport = () => {
      setViewportHeight(container.clientHeight);
      setScrollTop(container.scrollTop);
    };

    syncViewport();

    const resizeObserver = new ResizeObserver(() => {
      syncViewport();
    });
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const slice = useMemo(() => getWindowedListSlice({
    items,
    scrollTop,
    viewportHeight,
    rowHeight,
  }), [items, rowHeight, scrollTop, viewportHeight]);

  return {
    scrollRef,
    slice,
    handleScroll: (event: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(event.currentTarget.scrollTop);
    },
  };
}

const RunTargetCard = React.memo(function RunTargetCard({
  target,
  customization,
  onRunTarget,
  onDebugTarget,
  onCustomizationChange,
  runLabel,
  debugLabel,
  profilesLabel,
  profilesPlaceholder,
  programArgsLabel,
  programArgsPlaceholder,
  vmArgsLabel,
  vmArgsPlaceholder,
}: {
  target: CodePaneRunTarget;
  customization: CodePaneRunTargetCustomization;
  onRunTarget: (targetId: string) => void | Promise<void>;
  onDebugTarget: (targetId: string) => void | Promise<void>;
  onCustomizationChange: (targetId: string, updates: Partial<CodePaneRunTargetCustomization>) => void;
  runLabel: string;
  debugLabel: string;
  profilesLabel: string;
  profilesPlaceholder: string;
  programArgsLabel: string;
  programArgsPlaceholder: string;
  vmArgsLabel: string;
  vmArgsPlaceholder: string;
}) {
  const supportsCustomization = Boolean(target.customization);

  return (
    <div className="min-w-[320px] max-w-[360px] rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-zinc-100">{target.label}</div>
          <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{target.detail}</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void onRunTarget(target.id);
            }}
            className="shrink-0 rounded bg-emerald-500/15 p-1 text-emerald-300 transition-colors hover:bg-emerald-500/25 hover:text-emerald-200"
            aria-label={runLabel}
          >
            <Play size={12} />
          </button>
          {target.canDebug && (
            <button
              type="button"
              onClick={() => {
                void onDebugTarget(target.id);
              }}
              className="shrink-0 rounded bg-amber-500/15 p-1 text-amber-300 transition-colors hover:bg-amber-500/25 hover:text-amber-200"
              aria-label={debugLabel}
            >
              <Bug size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
        <span className="truncate">{formatLanguageLabel(target.languageId)}</span>
        <span className="truncate">{target.workingDirectory}</span>
      </div>

      {supportsCustomization && (
        <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
          <LabeledInput
            label={profilesLabel}
            value={customization.profiles ?? ''}
            placeholder={profilesPlaceholder}
            onChange={(value) => {
              onCustomizationChange(target.id, { profiles: value });
            }}
          />
          <LabeledInput
            label={programArgsLabel}
            value={customization.programArgs ?? ''}
            placeholder={programArgsPlaceholder}
            onChange={(value) => {
              onCustomizationChange(target.id, { programArgs: value });
            }}
          />
          <LabeledInput
            label={vmArgsLabel}
            value={customization.vmArgs ?? ''}
            placeholder={vmArgsPlaceholder}
            onChange={(value) => {
              onCustomizationChange(target.id, { vmArgs: value });
            }}
          />
        </div>
      )}
    </div>
  );
});

const RunSessionRow = React.memo(function RunSessionRow({
  session,
  isSelected,
  onSelectSession,
}: {
  session: CodePaneRunSession;
  isSelected: boolean;
  onSelectSession: (sessionId: string) => void;
}) {
  const tone = getSessionTone(session.state);

  return (
    <button
      type="button"
      onClick={() => {
        onSelectSession(session.id);
      }}
      className={`h-[68px] w-full rounded border px-2 py-2 text-left transition-colors ${
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
        <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${tone.className}`}>
          {tone.label}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
        <span>{formatLanguageLabel(session.languageId)}</span>
        <span>{formatSessionTimestamp(session.startedAt)}</span>
      </div>
    </button>
  );
});

export const RunToolWindow = React.memo(function RunToolWindow({
  targets,
  sessions,
  selectedSession,
  selectedOutput,
  isLoading,
  error,
  onClose,
  onRefresh,
  onRunTarget,
  onDebugTarget,
  onSelectSession,
  onStopSession,
  getCustomization,
  onCustomizationChange,
}: RunToolWindowProps) {
  const { t } = useI18n();
  const { scrollRef: sessionsScrollRef, slice: visibleSessions, handleScroll: handleSessionsScroll } = useFixedWindowedList(
    sessions,
    RUN_SESSION_ROW_HEIGHT,
  );
  const handleStopSelectedSession = React.useCallback(() => {
    if (!selectedSession || !isSessionActive(selectedSession)) {
      return;
    }

    void onStopSession(selectedSession.id);
  }, [onStopSession, selectedSession]);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.runTab')}
          </div>
          <div className="text-xs text-zinc-500">
            {targets.length > 0 ? `${targets.length}` : t('codePane.runTargets')}
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
          {t('codePane.runTargets')}
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.runTargetsLoading')}
          </div>
        ) : error ? (
          <div className="text-xs text-red-300">{error}</div>
        ) : targets.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {targets.map((target) => (
              <RunTargetCard
                key={target.id}
                target={target}
                customization={getCustomization(target.id)}
                onRunTarget={onRunTarget}
                onDebugTarget={onDebugTarget}
                onCustomizationChange={onCustomizationChange}
                runLabel={t('codePane.runAction')}
                debugLabel={t('codePane.debugAction')}
                profilesLabel={t('codePane.runProfiles')}
                profilesPlaceholder={t('codePane.runProfilesPlaceholder')}
                programArgsLabel={t('codePane.runProgramArgs')}
                programArgsPlaceholder={t('codePane.runProgramArgsPlaceholder')}
                vmArgsLabel={t('codePane.runVmArgs')}
                vmArgsPlaceholder={t('codePane.runVmArgsPlaceholder')}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">{t('codePane.runTargetsEmpty')}</div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-64 shrink-0 flex-col border-r border-zinc-800">
          <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {t('codePane.runSessions')}
          </div>
          <div
            ref={sessionsScrollRef}
            className="min-h-0 flex-1 overflow-auto px-2 py-2"
            onScroll={handleSessionsScroll}
          >
            {sessions.length > 0 ? (
              visibleSessions.isWindowed ? (
                <div style={{ height: `${visibleSessions.totalHeight}px`, position: 'relative' }}>
                  <div style={{ transform: `translateY(${visibleSessions.offsetTop}px)` }}>
                    {visibleSessions.items.map((session) => (
                      <RunSessionRow
                        key={session.id}
                        session={session}
                        isSelected={selectedSession?.id === session.id}
                        onSelectSession={onSelectSession}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {sessions.map((session) => (
                    <RunSessionRow
                      key={session.id}
                      session={session}
                      isSelected={selectedSession?.id === session.id}
                      onSelectSession={onSelectSession}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="text-xs text-zinc-500">{t('codePane.runConsoleEmpty')}</div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {t('codePane.runConsole')}
              </div>
              {selectedSession && (
                <div className="mt-1 truncate text-xs text-zinc-300">
                  {selectedSession.label}
                </div>
              )}
            </div>
            {selectedSession && isSessionActive(selectedSession) && (
              <button
                type="button"
                onClick={handleStopSelectedSession}
                className="rounded bg-red-500/15 p-1 text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200"
                aria-label={t('codePane.stopRun')}
              >
                <Square size={12} />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {selectedSession ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-zinc-200">
                {selectedOutput || '$ '}
              </pre>
            ) : (
              <div className="text-xs text-zinc-500">{t('codePane.runConsoleEmpty')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

interface LabeledInputProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

const LabeledInput = React.memo(function LabeledInput({
  label,
  value,
  placeholder,
  onChange,
}: LabeledInputProps) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="w-full rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1.5 text-[11px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700"
      />
    </label>
  );
});

function formatLanguageLabel(languageId: string): string {
  if (!languageId) {
    return 'Language';
  }

  return `${languageId.slice(0, 1).toUpperCase()}${languageId.slice(1)}`;
}

function formatSessionTimestamp(timestamp: string): string {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) {
    return timestamp;
  }

  return new Date(value).toLocaleTimeString();
}

function isSessionActive(session: CodePaneRunSession): boolean {
  return session.state === 'starting' || session.state === 'running';
}

function getSessionTone(state: CodePaneRunSession['state']): { label: string; className: string } {
  switch (state) {
    case 'starting':
      return {
        label: 'START',
        className: 'bg-sky-500/15 text-sky-300',
      };
    case 'running':
      return {
        label: 'RUN',
        className: 'bg-emerald-500/15 text-emerald-300',
      };
    case 'passed':
      return {
        label: 'PASS',
        className: 'bg-emerald-500/15 text-emerald-300',
      };
    case 'failed':
      return {
        label: 'FAIL',
        className: 'bg-red-500/15 text-red-300',
      };
    case 'stopped':
      return {
        label: 'STOP',
        className: 'bg-zinc-700 text-zinc-300',
      };
    default:
      return {
        label: 'RUN',
        className: 'bg-zinc-700 text-zinc-300',
      };
  }
}
