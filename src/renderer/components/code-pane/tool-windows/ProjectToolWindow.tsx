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
  CodePaneLanguageWorkspaceState,
  CodePaneProjectTreeItem,
  CodePaneRunSession,
} from '../../../../shared/types/electron-api';
import { useI18n } from '../../../i18n';

interface ProjectToolWindowProps {
  contributions: CodePaneProjectContribution[];
  sessions: CodePaneRunSession[];
  selectedSession: CodePaneRunSession | null;
  selectedOutput: string;
  languageWorkspaceState: CodePaneLanguageWorkspaceState | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onRunCommand: (commandId: string) => void | Promise<void>;
  onSelectSession: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void | Promise<void>;
  onOpenTreeItem?: (item: CodePaneProjectTreeItem) => void;
}

export const ProjectToolWindow = React.memo(function ProjectToolWindow({
  contributions,
  sessions,
  selectedSession,
  selectedOutput,
  languageWorkspaceState,
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
  const handleStopSelectedSession = React.useCallback(() => {
    if (!selectedSession || !isSessionActive(selectedSession)) {
      return;
    }

    void onStopSession(selectedSession.id);
  }, [onStopSession, selectedSession]);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_88%,transparent)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.projectTab')}
          </div>
          <div className="text-xs text-[rgb(var(--muted-foreground))]">{contributions.length}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded bg-[rgb(var(--secondary))] p-1 text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
            aria-label={t('codePane.refresh')}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[rgb(var(--secondary))] p-1 text-[rgb(var(--muted-foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]"
            aria-label={t('codePane.bottomPanelClose')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ProjectSummaryPane
          contributions={contributions}
          languageWorkspaceState={languageWorkspaceState}
          isLoading={isLoading}
          error={error}
          onRunCommand={onRunCommand}
          onOpenTreeItem={onOpenTreeItem}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex w-64 shrink-0 flex-col border-r border-[rgb(var(--border))]">
              <div className="border-b border-[rgb(var(--border))] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                {t('codePane.runSessions')}
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                {sessions.length > 0 ? (
                  <div className="space-y-1">
                    {sessions.map((session) => (
                      <ProjectSessionRow
                        key={session.id}
                        session={session}
                        isSelected={selectedSession?.id === session.id}
                        onSelectSession={onSelectSession}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.runConsoleEmpty')}</div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                    {t('codePane.runConsole')}
                  </div>
                  {selectedSession && (
                    <div className="mt-1 truncate text-xs text-[rgb(var(--muted-foreground))]">{selectedSession.label}</div>
                  )}
                </div>
                {selectedSession && isSessionActive(selectedSession) && (
                  <button
                    type="button"
                    onClick={handleStopSelectedSession}
                    className="rounded bg-[rgb(var(--error)/0.14)] p-1 text-[rgb(var(--error))] transition-colors hover:bg-[rgb(var(--error)/0.22)] hover:text-[rgb(var(--error))]"
                    aria-label={t('codePane.stopRun')}
                  >
                    <Square size={12} />
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                {selectedSession ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[rgb(var(--foreground))]">
                    {selectedOutput || '$ '}
                  </pre>
                ) : (
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.runConsoleEmpty')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const ProjectSummaryPane = React.memo(function ProjectSummaryPane({
  contributions,
  languageWorkspaceState,
  isLoading,
  error,
  onRunCommand,
  onOpenTreeItem,
}: {
  contributions: CodePaneProjectContribution[];
  languageWorkspaceState: CodePaneLanguageWorkspaceState | null;
  isLoading: boolean;
  error: string | null;
  onRunCommand: (commandId: string) => void | Promise<void>;
  onOpenTreeItem?: (item: CodePaneProjectTreeItem) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex w-[380px] shrink-0 flex-col border-r border-[rgb(var(--border))]">
      <div className="border-b border-[rgb(var(--border))] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
        {t('codePane.projectSummary')}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
            <Loader2 size={12} className="animate-spin" />
            {t('codePane.projectLoading')}
          </div>
        ) : error ? (
          <div className="text-xs text-[rgb(var(--error))]">{error}</div>
        ) : contributions.length > 0 ? (
          <div className="space-y-4">
            {contributions.map((contribution) => (
              <ProjectContributionCard
                key={contribution.id}
                contribution={contribution}
                languageWorkspaceState={languageWorkspaceState}
                onRunCommand={onRunCommand}
                onOpenTreeItem={onOpenTreeItem}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-[rgb(var(--muted-foreground))]">{t('codePane.projectEmpty')}</div>
        )}
      </div>
    </div>
  );
});

const ProjectContributionCard = React.memo(function ProjectContributionCard({
  contribution,
  languageWorkspaceState,
  onRunCommand,
  onOpenTreeItem,
}: {
  contribution: CodePaneProjectContribution;
  languageWorkspaceState: CodePaneLanguageWorkspaceState | null;
  onRunCommand: (commandId: string) => void | Promise<void>;
  onOpenTreeItem?: (item: CodePaneProjectTreeItem) => void;
}) {
  const workspaceStateTone = languageWorkspaceState && languageWorkspaceState.languageId === contribution.languageId
    ? getWorkspaceStateTone(languageWorkspaceState)
    : null;

  return (
    <div className="rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_58%,transparent)] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-[rgb(var(--foreground))]">{contribution.title}</div>
        <span className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--muted-foreground))]">
          {formatLanguageLabel(contribution.languageId)}
        </span>
      </div>

      {workspaceStateTone && languageWorkspaceState && (
        <div className="mb-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
            Workspace State
          </div>
          <div className="rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_72%,transparent)] px-2 py-2">
            <div className="flex items-center gap-2">
              {workspaceStateTone.showSpinner ? (
                <Loader2 size={12} className="animate-spin text-[rgb(var(--warning))]" />
              ) : (
                <div className={`h-2 w-2 rounded-full ${workspaceStateTone.dotClassName}`} />
              )}
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${workspaceStateTone.badgeClassName}`}>
                {formatWorkspacePhaseLabel(languageWorkspaceState.phase)}
              </span>
              <span className="truncate text-[11px] text-[rgb(var(--muted-foreground))]">
                {languageWorkspaceState.progressText ?? languageWorkspaceState.message ?? formatWorkspacePhaseLabel(languageWorkspaceState.phase)}
              </span>
            </div>
            {languageWorkspaceState.readyFeatures.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {languageWorkspaceState.readyFeatures.map((feature) => (
                  <span
                    key={`${contribution.id}-${feature}`}
                    className="rounded bg-[rgb(var(--secondary))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--muted-foreground))]"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

      {contribution.diagnostics && contribution.diagnostics.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
            Diagnostics
          </div>
          <div className="space-y-2">
            {contribution.diagnostics.map((diagnostic) => (
              <ProjectDiagnosticRow
                key={diagnostic.id}
                diagnostic={diagnostic}
                onRunCommand={onRunCommand}
                onOpenTreeItem={onOpenTreeItem}
              />
            ))}
          </div>
        </div>
      )}

      {contribution.commandGroups?.map((group) => (
        <div key={group.id} className="mb-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
            {group.title}
          </div>
          <div className="space-y-1">
            {group.commands.map((command) => (
              <ProjectCommandRow
                key={command.id}
                command={command}
                onRunCommand={onRunCommand}
              />
            ))}
          </div>
        </div>
      ))}

      {contribution.treeSections?.map((section) => (
        <div key={section.id} className="mb-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
            {section.title}
          </div>
          <div className="rounded bg-[color-mix(in_srgb,rgb(var(--background))_72%,transparent)] px-2 py-2">
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
              <div className="text-[11px] text-[rgb(var(--muted-foreground))]">No items</div>
            )}
          </div>
        </div>
      ))}

      {contribution.detailCards?.map((card) => (
        <div key={card.id} className="mb-3 last:mb-0">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
            {card.title}
          </div>
          <div className="space-y-1 rounded bg-[color-mix(in_srgb,rgb(var(--background))_72%,transparent)] px-2 py-2 text-[11px] text-[rgb(var(--muted-foreground))]">
            {card.lines.map((line, index) => (
              <div key={`${card.id}-${index}`} className="break-words">
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

const ProjectDiagnosticRow = React.memo(function ProjectDiagnosticRow({
  diagnostic,
  onRunCommand,
  onOpenTreeItem,
}: {
  diagnostic: NonNullable<CodePaneProjectContribution['diagnostics']>[number];
  onRunCommand: (commandId: string) => void | Promise<void>;
  onOpenTreeItem?: (item: CodePaneProjectTreeItem) => void;
}) {
  const diagnosticTone = getDiagnosticTone(diagnostic.severity);

  return (
    <div className={`rounded border px-2 py-2 text-xs ${diagnosticTone.containerClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${diagnosticTone.badgeClassName}`}>
              {diagnostic.severity}
            </span>
            <div className="break-words font-medium text-[rgb(var(--foreground))]">{diagnostic.message}</div>
          </div>
          {diagnostic.detail && (
            <div className="mt-1 break-words text-[10px] text-[rgb(var(--muted-foreground))]">{diagnostic.detail}</div>
          )}
          {diagnostic.filePath && (
            <button
              type="button"
              onClick={() => {
                onOpenTreeItem?.({
                  id: diagnostic.id,
                  label: diagnostic.message,
                  kind: 'entry',
                  filePath: diagnostic.filePath,
                  lineNumber: diagnostic.lineNumber,
                });
              }}
              className="mt-2 text-[10px] text-[rgb(var(--info))] transition-colors hover:text-[rgb(var(--info))]"
            >
              {diagnostic.filePath}
              {diagnostic.lineNumber ? `:${diagnostic.lineNumber}` : ''}
            </button>
          )}
        </div>
        {diagnostic.commandId && diagnostic.commandLabel && (
          <button
            type="button"
            onClick={() => {
              void onRunCommand(diagnostic.commandId!);
            }}
            className="shrink-0 rounded border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_76%,transparent)] px-2 py-1 text-[10px] font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--secondary))]"
          >
            {diagnostic.commandLabel}
          </button>
        )}
      </div>
    </div>
  );
});

const ProjectCommandRow = React.memo(function ProjectCommandRow({
  command,
  onRunCommand,
}: {
  command: NonNullable<NonNullable<CodePaneProjectContribution['commandGroups']>[number]['commands']>[number];
  onRunCommand: (commandId: string) => void | Promise<void>;
}) {
  const commandTone = getProjectCommandTone(command.kind);

  return (
    <button
      type="button"
      onClick={() => {
        void onRunCommand(command.id);
      }}
      className={`flex w-full items-center justify-between gap-3 rounded border px-2 py-2 text-left text-xs transition-colors ${commandTone.buttonClassName}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate font-medium text-[rgb(var(--foreground))]">{command.title}</div>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${commandTone.badgeClassName}`}>
            {commandTone.badgeLabel}
          </span>
        </div>
        {command.detail && (
          <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{command.detail}</div>
        )}
      </div>
      {commandTone.icon === 'refresh' ? (
        <RefreshCw size={12} className="shrink-0 text-[rgb(var(--info))]" />
      ) : commandTone.icon === 'configure' ? (
        <ChevronRight size={12} className="shrink-0 text-[rgb(var(--warning))]" />
      ) : commandTone.icon === 'repair' ? (
        <Square size={11} className="shrink-0 text-[rgb(var(--error))]" />
      ) : (
        <Play size={12} className="shrink-0 text-[rgb(var(--success))]" />
      )}
    </button>
  );
});

const ProjectSessionRow = React.memo(function ProjectSessionRow({
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
      className={`w-full rounded border px-2 py-2 text-left transition-colors ${
        isSelected
          ? 'border-[rgb(var(--border))] bg-[rgb(var(--secondary))] text-[rgb(var(--foreground))]'
          : 'border-transparent bg-transparent text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--border))] hover:bg-[color-mix(in_srgb,rgb(var(--secondary))_70%,transparent)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{session.label}</div>
          <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{session.detail}</div>
        </div>
        <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${tone.className}`}>
          {tone.label}
        </span>
      </div>
    </button>
  );
});

interface ProjectTreeItemRowProps {
  item: CodePaneProjectTreeItem;
  depth: number;
  onOpenTreeItem?: (item: CodePaneProjectTreeItem) => void;
}

const ProjectTreeItemRow = React.memo(function ProjectTreeItemRow({ item, depth, onOpenTreeItem }: ProjectTreeItemRowProps) {
  const content = (
    <div className="min-w-0 flex-1">
      <div className="truncate text-xs font-medium text-[rgb(var(--foreground))]">{item.label}</div>
      {item.description && (
        <div className="mt-0.5 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{item.description}</div>
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
          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-[rgb(var(--secondary))]"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          <ChevronRight size={11} className="shrink-0 text-[rgb(var(--muted-foreground))]/75" />
          {content}
          {item.lineNumber && (
            <div className="shrink-0 text-[10px] text-[rgb(var(--muted-foreground))]">L{item.lineNumber}</div>
          )}
        </button>
      ) : (
        <div
          className="flex items-center gap-2 px-1.5 py-1"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          <ChevronRight size={11} className="shrink-0 text-[rgb(var(--muted-foreground))]/60" />
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
});

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
        badgeClassName: 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]',
        buttonClassName: 'border-[rgb(var(--info)/0.20)] bg-[rgb(var(--info)/0.06)] text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--info)/0.30)] hover:bg-[rgb(var(--info)/0.10)] hover:text-[rgb(var(--foreground))]',
        icon: 'refresh',
      };
    case 'configure':
      return {
        badgeLabel: 'Config',
        badgeClassName: 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]',
        buttonClassName: 'border-[rgb(var(--warning)/0.20)] bg-[rgb(var(--warning)/0.06)] text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--warning)/0.30)] hover:bg-[rgb(var(--warning)/0.10)] hover:text-[rgb(var(--foreground))]',
        icon: 'configure',
      };
    case 'repair':
      return {
        badgeLabel: 'Repair',
        badgeClassName: 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]',
        buttonClassName: 'border-[rgb(var(--error)/0.20)] bg-[rgb(var(--error)/0.06)] text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--error)/0.30)] hover:bg-[rgb(var(--error)/0.10)] hover:text-[rgb(var(--foreground))]',
        icon: 'repair',
      };
    case 'run':
    default:
      return {
        badgeLabel: 'Run',
        badgeClassName: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
        buttonClassName: 'border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_72%,transparent)] text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--secondary))] hover:text-[rgb(var(--foreground))]',
        icon: 'run',
      };
  }
}

function getDiagnosticTone(severity: 'info' | 'warning' | 'error'): {
  badgeClassName: string;
  containerClassName: string;
} {
  switch (severity) {
    case 'error':
      return {
        badgeClassName: 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]',
        containerClassName: 'border-[rgb(var(--error)/0.20)] bg-[rgb(var(--error)/0.06)] text-[rgb(var(--muted-foreground))]',
      };
    case 'warning':
      return {
        badgeClassName: 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]',
        containerClassName: 'border-[rgb(var(--warning)/0.20)] bg-[rgb(var(--warning)/0.06)] text-[rgb(var(--muted-foreground))]',
      };
    case 'info':
    default:
      return {
        badgeClassName: 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]',
        containerClassName: 'border-[rgb(var(--info)/0.20)] bg-[rgb(var(--info)/0.06)] text-[rgb(var(--muted-foreground))]',
      };
  }
}

function getWorkspaceStateTone(state: CodePaneLanguageWorkspaceState): {
  badgeClassName: string;
  dotClassName: string;
  showSpinner: boolean;
} {
  switch (state.phase) {
    case 'ready':
      return {
        badgeClassName: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
        dotClassName: 'bg-[rgb(var(--success))]',
        showSpinner: false,
      };
    case 'error':
      return {
        badgeClassName: 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]',
        dotClassName: 'bg-[rgb(var(--error))]',
        showSpinner: false,
      };
    case 'degraded':
      return {
        badgeClassName: 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]',
        dotClassName: 'bg-[rgb(var(--warning))]',
        showSpinner: false,
      };
    default:
      return {
        badgeClassName: 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]',
        dotClassName: 'bg-[rgb(var(--info))]',
        showSpinner: true,
      };
  }
}

function formatWorkspacePhaseLabel(phase: CodePaneLanguageWorkspaceState['phase']): string {
  switch (phase) {
    case 'detecting-project':
      return 'Detecting';
    case 'importing-project':
      return 'Importing';
    case 'indexing-workspace':
      return 'Indexing';
    case 'starting':
      return 'Starting';
    case 'ready':
      return 'Ready';
    case 'degraded':
      return 'Degraded';
    case 'error':
      return 'Error';
    case 'idle':
    default:
      return 'Idle';
  }
}

function getStatusTone(tone: 'info' | 'warning' | 'error' | undefined): string {
  switch (tone) {
    case 'warning':
      return 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]';
    case 'error':
      return 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]';
    case 'info':
    default:
      return 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]';
  }
}

function getSessionTone(state: CodePaneRunSession['state']): { label: string; className: string } {
  switch (state) {
    case 'starting':
      return {
        label: 'START',
        className: 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]',
      };
    case 'running':
      return {
        label: 'RUN',
        className: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
      };
    case 'passed':
      return {
        label: 'PASS',
        className: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
      };
    case 'failed':
      return {
        label: 'FAIL',
        className: 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]',
      };
    case 'stopped':
      return {
        label: 'STOP',
        className: 'bg-[rgb(var(--accent))] text-[rgb(var(--muted-foreground))]',
      };
    default:
      return {
        label: state,
        className: 'bg-[rgb(var(--accent))] text-[rgb(var(--muted-foreground))]',
      };
  }
}
