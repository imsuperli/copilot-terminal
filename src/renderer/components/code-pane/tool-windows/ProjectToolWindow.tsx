import React from 'react';
import {
  ChevronRight,
  Loader2,
  Play,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import type {
  CodePaneProjectContribution,
  CodePaneProjectTreeItem,
  CodePaneRunSession,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface ProjectToolWindowProps {
  contributions: CodePaneProjectContribution[];
  sessions: CodePaneRunSession[];
  selectedSession: CodePaneRunSession | null;
  selectedOutput: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onRunCommand: (commandId: string) => void | Promise<void>;
  onSelectSession: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void | Promise<void>;
  onOpenTreeItem?: (item: CodePaneProjectTreeItem) => void;
}

export function ProjectToolWindow({
  contributions,
  sessions,
  selectedSession,
  selectedOutput,
  isLoading,
  error,
  onClose,
  onRefresh,
  onRunCommand,
  onSelectSession,
  onStopSession,
  onOpenTreeItem,
}: ProjectToolWindowProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-64 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950/90">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
            {t('codePane.projectTab')}
          </div>
          <div className="text-xs text-zinc-500">{contributions.length}</div>
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-[380px] shrink-0 flex-col border-r border-zinc-800">
          <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {t('codePane.projectSummary')}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 size={12} className="animate-spin" />
                {t('codePane.projectLoading')}
              </div>
            ) : error ? (
              <div className="text-xs text-red-300">{error}</div>
            ) : contributions.length > 0 ? (
              <div className="space-y-4">
                {contributions.map((contribution) => (
                  <div key={contribution.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-zinc-100">{contribution.title}</div>
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {formatLanguageLabel(contribution.languageId)}
                      </span>
                    </div>

                    {contribution.statusItems && contribution.statusItems.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {contribution.statusItems.map((item) => (
                          <span
                            key={item.id}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getStatusTone(item.tone)}`}
                          >
                            {item.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {contribution.commandGroups?.map((group) => (
                      <div key={group.id} className="mb-3">
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                          {group.title}
                        </div>
                        <div className="space-y-1">
                          {group.commands.map((command) => {
                            const commandTone = getProjectCommandTone(command.kind);
                            return (
                              <button
                                key={command.id}
                                type="button"
                                onClick={() => {
                                  void onRunCommand(command.id);
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded border px-2 py-2 text-left text-xs transition-colors ${commandTone.buttonClassName}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className="truncate font-medium text-zinc-100">{command.title}</div>
                                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${commandTone.badgeClassName}`}>
                                      {commandTone.badgeLabel}
                                    </span>
                                  </div>
                                  {command.detail && (
                                    <div className="mt-1 truncate text-[10px] text-zinc-500">{command.detail}</div>
                                  )}
                                </div>
                                {commandTone.icon === 'refresh' ? (
                                  <RefreshCw size={12} className="shrink-0 text-sky-300" />
                                ) : commandTone.icon === 'configure' ? (
                                  <ChevronRight size={12} className="shrink-0 text-amber-300" />
                                ) : commandTone.icon === 'repair' ? (
                                  <Square size={11} className="shrink-0 text-red-300" />
                                ) : (
                                  <Play size={12} className="shrink-0 text-emerald-300" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {contribution.treeSections?.map((section) => (
                      <div key={section.id} className="mb-3">
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                          {section.title}
                        </div>
                        <div className="rounded bg-zinc-950/60 px-2 py-2">
                          {section.items.length > 0 ? (
                            <div className="space-y-1">
                              {section.items.map((item) => (
                                <ProjectTreeItemRow
                                  key={item.id}
                                  item={item}
                                  depth={0}
                                  onOpenTreeItem={onOpenTreeItem}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-zinc-500">No items</div>
                          )}
                        </div>
                      </div>
                    ))}

                    {contribution.detailCards?.map((card) => (
                      <div key={card.id} className="mb-3 last:mb-0">
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                          {card.title}
                        </div>
                        <div className="space-y-1 rounded bg-zinc-950/60 px-2 py-2 text-[11px] text-zinc-400">
                          {card.lines.map((line, index) => (
                            <div key={`${card.id}-${index}`} className="break-words">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-500">{t('codePane.projectEmpty')}</div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex w-64 shrink-0 flex-col border-r border-zinc-800">
              <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                {t('codePane.runSessions')}
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                {sessions.length > 0 ? (
                  <div className="space-y-1">
                    {sessions.map((session) => {
                      const tone = getSessionTone(session.state);
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
                            <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${tone.className}`}>
                              {tone.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
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
                    <div className="mt-1 truncate text-xs text-zinc-300">{selectedSession.label}</div>
                  )}
                </div>
                {selectedSession && isSessionActive(selectedSession) && (
                  <button
                    type="button"
                    onClick={() => {
                      void onStopSession(selectedSession.id);
                    }}
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
      </div>
    </div>
  );
}

interface ProjectTreeItemRowProps {
  item: CodePaneProjectTreeItem;
  depth: number;
  onOpenTreeItem?: (item: CodePaneProjectTreeItem) => void;
}

function ProjectTreeItemRow({ item, depth, onOpenTreeItem }: ProjectTreeItemRowProps) {
  const content = (
    <div className="min-w-0 flex-1">
      <div className="truncate text-xs font-medium text-zinc-200">{item.label}</div>
      {item.description && (
        <div className="mt-0.5 truncate text-[10px] text-zinc-500">{item.description}</div>
      )}
    </div>
  );

  return (
    <div>
      {item.filePath ? (
        <button
          type="button"
          onClick={() => {
            onOpenTreeItem?.(item);
          }}
          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-zinc-900"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          <ChevronRight size={11} className="shrink-0 text-zinc-600" />
          {content}
          {item.lineNumber && (
            <div className="shrink-0 text-[10px] text-zinc-500">L{item.lineNumber}</div>
          )}
        </button>
      ) : (
        <div
          className="flex items-center gap-2 px-1.5 py-1"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          <ChevronRight size={11} className="shrink-0 text-zinc-700" />
          {content}
        </div>
      )}
      {item.children && item.children.length > 0 && (
        <div className="space-y-1">
          {item.children.map((child) => (
            <ProjectTreeItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              onOpenTreeItem={onOpenTreeItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatLanguageLabel(languageId: string): string {
  if (!languageId) {
    return 'Language';
  }

  return `${languageId.slice(0, 1).toUpperCase()}${languageId.slice(1)}`;
}

function isSessionActive(session: CodePaneRunSession): boolean {
  return session.state === 'starting' || session.state === 'running';
}

function getProjectCommandTone(kind: 'run' | 'refresh' | 'configure' | 'repair' | undefined): {
  badgeLabel: string;
  badgeClassName: string;
  buttonClassName: string;
  icon: 'run' | 'refresh' | 'configure' | 'repair';
} {
  switch (kind) {
    case 'refresh':
      return {
        badgeLabel: 'Refresh',
        badgeClassName: 'bg-sky-500/15 text-sky-300',
        buttonClassName: 'border-sky-500/20 bg-sky-500/5 text-zinc-300 hover:border-sky-400/30 hover:bg-sky-500/10 hover:text-zinc-100',
        icon: 'refresh',
      };
    case 'configure':
      return {
        badgeLabel: 'Config',
        badgeClassName: 'bg-amber-500/15 text-amber-300',
        buttonClassName: 'border-amber-500/20 bg-amber-500/5 text-zinc-300 hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-zinc-100',
        icon: 'configure',
      };
    case 'repair':
      return {
        badgeLabel: 'Repair',
        badgeClassName: 'bg-red-500/15 text-red-300',
        buttonClassName: 'border-red-500/20 bg-red-500/5 text-zinc-300 hover:border-red-400/30 hover:bg-red-500/10 hover:text-zinc-100',
        icon: 'repair',
      };
    case 'run':
    default:
      return {
        badgeLabel: 'Run',
        badgeClassName: 'bg-emerald-500/15 text-emerald-300',
        buttonClassName: 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100',
        icon: 'run',
      };
  }
}

function getStatusTone(tone: 'info' | 'warning' | 'error' | undefined): string {
  switch (tone) {
    case 'warning':
      return 'bg-amber-500/15 text-amber-300';
    case 'error':
      return 'bg-red-500/15 text-red-300';
    case 'info':
    default:
      return 'bg-sky-500/15 text-sky-300';
  }
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
        label: state,
        className: 'bg-zinc-700 text-zinc-300',
      };
  }
}
