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
import {
  IdePopupShell,
  idePopupBadgeClassName,
  idePopupBodyClassName,
  idePopupCardClassName,
  idePopupHeaderClassName,
  idePopupHeaderMetaClassName,
  idePopupIconButtonClassName,
  idePopupMicroButtonClassName,
  idePopupRowClassName,
  idePopupScrollAreaClassName,
  idePopupSubtitleClassName,
  idePopupTitleClassName,
} from '../../ui/ide-popup';

type Translate = ReturnType<typeof useI18n>['t'];

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
    <IdePopupShell className="flex h-full min-h-0 flex-col">
      <div className={idePopupHeaderClassName}>
        <div className="min-w-0 flex-1">
          <div className={idePopupHeaderMetaClassName}>
            {t('codePane.projectTab')}
          </div>
          <div className={`mt-1 ${idePopupTitleClassName}`}>{t('codePane.projectSummary')}</div>
          <div className={idePopupSubtitleClassName}>{contributions.length}</div>
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
              <div className="border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                {t('codePane.runSessions')}
              </div>
              <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-2 py-2`}>
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
              <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] px-3 py-2">
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
                    className="rounded-md border border-[rgb(var(--error))/0.35] bg-[rgb(var(--error))/0.12] p-1.5 text-[rgb(var(--error))] transition-colors hover:border-[rgb(var(--error))/0.5] hover:bg-[rgb(var(--error))/0.18] hover:text-[rgb(var(--error))]"
                    aria-label={t('codePane.stopRun')}
                  >
                    <Square size={12} />
                  </button>
                )}
              </div>
              <div className={`${idePopupBodyClassName} ${idePopupScrollAreaClassName} min-h-0 flex-1 overflow-auto px-3 py-3`}>
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
    </IdePopupShell>
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
  const { t } = useI18n();

  return (
    <div className={idePopupCardClassName}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-[rgb(var(--foreground))]">{localizeProjectText(contribution.title, t)}</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${idePopupBadgeClassName('zinc')}`}>
          {formatLanguageLabel(contribution.languageId, t('codePane.languageUnknown'))}
        </span>
      </div>

      {workspaceStateTone && languageWorkspaceState && (
        <div className="mb-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.projectWorkspaceState')}
          </div>
          <div className="rounded border border-[rgb(var(--border))] bg-[var(--appearance-pane-background)] px-2 py-2">
            <div className="flex items-center gap-2">
              {workspaceStateTone.showSpinner ? (
                <Loader2 size={12} className="animate-spin text-[rgb(var(--warning))]" />
              ) : (
                <div className={`h-2 w-2 rounded-full ${workspaceStateTone.dotClassName}`} />
              )}
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${workspaceStateTone.badgeClassName}`}>
                {formatWorkspacePhaseLabel(languageWorkspaceState.phase, t)}
              </span>
              <span className="truncate text-[11px] text-[rgb(var(--muted-foreground))]">
                {languageWorkspaceState.progressText ?? languageWorkspaceState.message ?? formatWorkspacePhaseLabel(languageWorkspaceState.phase, t)}
              </span>
            </div>
            {languageWorkspaceState.readyFeatures.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {languageWorkspaceState.readyFeatures.map((feature) => (
                  <span
                    key={`${contribution.id}-${feature}`}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${idePopupBadgeClassName('zinc')}`}
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
              {localizeProjectText(item.label, t)}
            </span>
          ))}
        </div>
      )}

      {contribution.diagnostics && contribution.diagnostics.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
            {t('codePane.projectDiagnostics')}
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
            {localizeProjectText(group.title, t)}
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
            {localizeProjectText(section.title, t)}
          </div>
          <div className="rounded bg-[var(--appearance-pane-background)] px-2 py-2">
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
              <div className="text-[11px] text-[rgb(var(--muted-foreground))]">{t('codePane.noItems')}</div>
            )}
          </div>
        </div>
      ))}

      {contribution.detailCards?.map((card) => (
        <div key={card.id} className="mb-3 last:mb-0">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
            {localizeProjectText(card.title, t)}
          </div>
          <div className="space-y-1 rounded bg-[var(--appearance-pane-background)] px-2 py-2 text-[11px] text-[rgb(var(--muted-foreground))]">
            {card.lines.map((line, index) => (
              <div key={`${card.id}-${index}`} className="break-words">
                {localizeProjectLine(line, t)}
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
  const { t } = useI18n();

  return (
    <div className={`rounded border px-2 py-2 text-xs ${diagnosticTone.containerClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${diagnosticTone.badgeClassName}`}>
              {formatDiagnosticSeverityLabel(diagnostic.severity, t)}
            </span>
            <div className="break-words font-medium text-[rgb(var(--foreground))]">{localizeProjectText(diagnostic.message, t)}</div>
          </div>
          {diagnostic.detail && (
            <div className="mt-1 break-words text-[10px] text-[rgb(var(--muted-foreground))]">{localizeProjectLine(diagnostic.detail, t)}</div>
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
            className={`shrink-0 ${idePopupMicroButtonClassName('neutral')} px-2 py-1`}
          >
            {localizeProjectText(diagnostic.commandLabel, t)}
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
  const { t } = useI18n();
  const commandTone = getProjectCommandTone(command.kind, t);

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
          <div className="truncate font-medium text-[rgb(var(--foreground))]">{localizeProjectText(command.title, t)}</div>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${commandTone.badgeClassName}`}>
            {commandTone.badgeLabel}
          </span>
        </div>
        {command.detail && (
          <div className="mt-1 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{localizeProjectLine(command.detail, t)}</div>
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
  const { t } = useI18n();
  const tone = getSessionTone(session.state, t);

  return (
    <button
      type="button"
      onClick={() => {
        onSelectSession(session.id);
      }}
      className={`w-full rounded border px-2 py-2 text-left transition-colors ${
        isSelected
          ? 'border-[rgb(var(--border))] bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--foreground))]'
          : 'border-transparent bg-transparent text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--accent))]'
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
  const { t } = useI18n();
  const content = (
    <div className="min-w-0 flex-1">
      <div className="truncate text-xs font-medium text-[rgb(var(--foreground))]">{localizeProjectText(item.label, t)}</div>
      {item.description && (
        <div className="mt-0.5 truncate text-[10px] text-[rgb(var(--muted-foreground))]">{localizeProjectLine(item.description, t)}</div>
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
          className={`${idePopupRowClassName(false)} px-1.5 py-1`}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          <ChevronRight size={11} className="shrink-0 text-[rgb(var(--muted-foreground))]/75" />
          {content}
          {item.lineNumber && (
            <ProjectTreeLineNumber lineNumber={item.lineNumber} />
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

const ProjectTreeLineNumber = React.memo(function ProjectTreeLineNumber({ lineNumber }: { lineNumber: number }) {
  const { t } = useI18n();
  return (
    <div className="shrink-0 text-[10px] text-[rgb(var(--muted-foreground))]">
      {t('codePane.lineNumberShort', { line: lineNumber })}
    </div>
  );
});

function formatLanguageLabel(languageId: string, unknownLabel: string): string {
  if (!languageId) {
    return unknownLabel;
  }

  return `${languageId.slice(0, 1).toUpperCase()}${languageId.slice(1)}`;
}

function localizeProjectText(value: string, t: Translate): string {
  const trimmedValue = value.trim();
  const directLabels: Record<string, string> = {
    'Beans': t('codePane.projectLabelBeans'),
    'Benchmarks': t('codePane.projectLabelBenchmarks'),
    'Boot Run': t('codePane.projectCommandBootRun'),
    'Boot Test': t('codePane.projectCommandBootTest'),
    'Build': t('codePane.projectCommandBuild'),
    'Clean Build': t('codePane.projectCommandCleanBuild'),
    'Clean Verify': t('codePane.projectCommandCleanVerify'),
    'Compile': t('codePane.projectCommandCompile'),
    'Config Files': t('codePane.projectLabelConfigFiles'),
    'Create .venv': t('codePane.projectCommandCreateVenv'),
    'Dependencies': t('codePane.projectCommandDependencies'),
    'Dependency Tree': t('codePane.projectCommandDependencyTree'),
    'Django': t('codePane.projectLabelDjango'),
    'Download Modules': t('codePane.projectCommandDownloadModules'),
    'Entrypoints': t('codePane.projectLabelEntrypoints'),
    'Environment': t('codePane.projectLabelEnvironment'),
    'Examples': t('codePane.projectLabelExamples'),
    'FastAPI': t('codePane.projectLabelFastApi'),
    'Framework': t('codePane.projectLabelFramework'),
    'Go': t('codePane.projectLabelGo'),
    'Go Build': t('codePane.projectCommandGoBuild'),
    'Go Bench': t('codePane.projectCommandGoBench'),
    'Go Env': t('codePane.projectCommandGoEnv'),
    'Go Generate': t('codePane.projectCommandGoGenerate'),
    'Go Mod Tidy': t('codePane.projectCommandGoModTidy'),
    'Go Project': t('codePane.projectTitleGo'),
    'Go Test': t('codePane.projectCommandGoTest'),
    'Go Work Sync': t('codePane.projectCommandGoWorkSync'),
    'GoLand-style Insights': t('codePane.projectLabelGoInsights'),
    'Initialize Module': t('codePane.projectCommandInitializeModule'),
    'Install Requirements': t('codePane.projectCommandInstallRequirements'),
    'Java Project': t('codePane.projectTitleJava'),
    'Migrate': t('codePane.projectCommandMigrate'),
    'Modules': t('codePane.projectLabelModules'),
    'Package': t('codePane.projectCommandPackage'),
    'Pip List': t('codePane.projectCommandPipList'),
    'Pip Version': t('codePane.projectCommandPipVersion'),
    'Poetry Install': t('codePane.projectCommandPoetryInstall'),
    'Project Files': t('codePane.projectLabelProjectFiles'),
    'Project Sync': t('codePane.projectLabelProjectSync'),
    'Python': t('codePane.projectLabelPython'),
    'Python Project': t('codePane.projectTitlePython'),
    'Refresh Dependencies': t('codePane.projectCommandRefreshDependencies'),
    'Refresh Go Workspace': t('codePane.projectCommandRefreshGoWorkspace'),
    'Refresh Gradle Model': t('codePane.projectCommandRefreshGradleModel'),
    'Refresh Project Model': t('codePane.projectCommandRefreshProjectModel'),
    'Reimport Maven Model': t('codePane.projectCommandReimportMavenModel'),
    'Repair': t('codePane.projectCommandRepair'),
    'Request Mappings': t('codePane.projectLabelRequestMappings'),
    'Routes': t('codePane.projectLabelRoutes'),
    'Run Server': t('codePane.projectCommandRunServer'),
    'Shell': t('codePane.projectCommandShell'),
    'Spring Boot': t('codePane.projectLabelSpringBoot'),
    'Spring Boot Run': t('codePane.projectCommandSpringBootRun'),
    'Spring Boot Test': t('codePane.projectCommandSpringBootTest'),
    'Test': t('codePane.projectCommandTest'),
    'Use Auto-detected Interpreter': t('codePane.projectCommandUseAutoInterpreter'),
    'Auto-detected Interpreter': t('codePane.projectCommandAutoInterpreter'),
    'Uvicorn Run': t('codePane.projectCommandUvicornRun'),
    'Workspace Sync': t('codePane.projectLabelWorkspaceSync'),
    'Selected interpreter is no longer available': t('codePane.projectDiagnosticInterpreterMissing'),
    'No Poetry environment detected': t('codePane.projectDiagnosticNoPoetryEnv'),
    'No Python virtual environment detected': t('codePane.projectDiagnosticNoPythonEnv'),
    'requirements.txt detected': t('codePane.projectDiagnosticRequirementsDetected'),
    'Main source directory is missing': t('codePane.projectDiagnosticMainSourcesMissing'),
    'Spring Boot application class was not detected': t('codePane.projectDiagnosticSpringAppMissing'),
    'go.mod is not detected': t('codePane.projectDiagnosticGoModMissing'),
    'go.work exists without a local module': t('codePane.projectDiagnosticGoWorkWithoutModule'),
    'No vendor directory or go.mod fallback is available': t('codePane.projectDiagnosticGoNoModuleFallback'),
    'Tests detected': t('codePane.projectStatusTestsDetected'),
    'No tests detected': t('codePane.projectStatusNoTestsDetected'),
    'Spring Boot detected': t('codePane.projectStatusSpringBootDetected'),
    'Standard Java project': t('codePane.projectStatusStandardJava'),
    'Workspace file detected': t('codePane.projectStatusWorkspaceFileDetected'),
    'Single-module workspace': t('codePane.projectStatusSingleModuleWorkspace'),
    'Vendor directory detected': t('codePane.projectStatusVendorDetected'),
    'Using module cache': t('codePane.projectStatusUsingModuleCache'),
    'Interpreter: Missing override': t('codePane.projectStatusInterpreterMissingOverride'),
    'Module: Not detected': t('codePane.projectStatusModuleNotDetected'),
  };
  const directLabel = directLabels[trimmedValue];
  if (directLabel) {
    return directLabel;
  }

  const dynamicPatterns: Array<{
    pattern: RegExp;
    format: (match: RegExpMatchArray) => string;
  }> = [
    { pattern: /^Build: (.+)$/, format: (match) => t('codePane.projectStatusBuild', { value: match[1] ?? '' }) },
    { pattern: /^Endpoints: (.+)$/, format: (match) => t('codePane.projectStatusEndpoints', { count: match[1] ?? '' }) },
    { pattern: /^Beans: (.+)$/, format: (match) => t('codePane.projectStatusBeans', { count: match[1] ?? '' }) },
    { pattern: /^Configs: (.+)$/, format: (match) => t('codePane.projectStatusConfigs', { count: match[1] ?? '' }) },
    { pattern: /^Framework: (.+)$/, format: (match) => t('codePane.projectStatusFramework', { value: match[1] ?? '' }) },
    { pattern: /^Routes: (.+)$/, format: (match) => t('codePane.projectStatusRoutes', { count: match[1] ?? '' }) },
    { pattern: /^Environments: (.+)$/, format: (match) => t('codePane.projectStatusEnvironments', { count: match[1] ?? '' }) },
    { pattern: /^Module: (.+)$/, format: (match) => t('codePane.projectStatusModule', { value: match[1] ?? '' }) },
    { pattern: /^Benchmarks: (.+)$/, format: (match) => t('codePane.projectStatusBenchmarks', { count: match[1] ?? '' }) },
    { pattern: /^Examples: (.+)$/, format: (match) => t('codePane.projectStatusExamples', { count: match[1] ?? '' }) },
    { pattern: /^Interpreter: (.+)$/, format: (match) => t('codePane.projectStatusInterpreter', { value: match[1] ?? '' }) },
    { pattern: /^Selected: (.+)$/, format: (match) => t('codePane.projectCommandSelectedInterpreter', { value: match[1] ?? '' }) },
    { pattern: /^Auto: (.+)$/, format: (match) => t('codePane.projectCommandAutoInterpreterValue', { value: match[1] ?? '' }) },
    { pattern: /^Use (.+)$/, format: (match) => t('codePane.projectCommandUseInterpreter', { value: match[1] ?? '' }) },
    { pattern: /^(.+) wrapper not detected$/, format: (match) => t('codePane.projectDiagnosticWrapperMissing', { tool: match[1] ?? '' }) },
  ];

  for (const { pattern, format } of dynamicPatterns) {
    const match = trimmedValue.match(pattern);
    if (match) {
      return format(match);
    }
  }

  return value;
}

function localizeProjectLine(value: string, t: Translate): string {
  const detailLabels: Record<string, string> = {
    'Project import can succeed, but navigation and build actions will stay limited until src/main/java exists.': t('codePane.projectDetailMainSourcesMissing'),
    'Add a @SpringBootApplication entrypoint or reimport the build model to restore run/debug targets.': t('codePane.projectDetailSpringAppMissing'),
    'Clear the override or choose another interpreter before running project commands.': t('codePane.projectDetailInterpreterMissing'),
    'Run Poetry install or create a local .venv to restore package resolution.': t('codePane.projectDetailNoPoetryEnv'),
    'Create a local .venv or choose an existing interpreter to restore imports and jump-to-definition.': t('codePane.projectDetailNoPythonEnv'),
    'Refresh installed packages after switching interpreters to keep completion and imports accurate.': t('codePane.projectDetailRequirementsDetected'),
    'Reload Gradle project import and refresh workspace metadata': t('codePane.projectDetailRefreshGradle'),
    'Reload Maven project import and refresh workspace metadata': t('codePane.projectDetailReimportMaven'),
    'Rescan interpreters, project files, and framework entrypoints': t('codePane.projectDetailRefreshProject'),
    'Reload Go module/workspace metadata and rescan project structure': t('codePane.projectDetailRefreshGoWorkspace'),
    'Clear manual override and fall back to PATH resolution': t('codePane.projectDetailClearOverridePath'),
    'Go module metadata is required for dependency resolution, imports, and package navigation.': t('codePane.projectDetailGoModMissing'),
    'Create or restore a module before syncing the workspace to avoid incomplete package loading.': t('codePane.projectDetailGoWorkWithoutModule'),
    'Package lookup will remain degraded until the module is initialized and dependencies are downloaded.': t('codePane.projectDetailGoNoModuleFallback'),
  };
  const directDetail = detailLabels[value];
  if (directDetail) {
    return directDetail;
  }

  const systemBuildFallbackMatch = value.match(/^The project will fall back to the system (.+) installation, which can slow imports and create version drift\.$/);
  if (systemBuildFallbackMatch) {
    return t('codePane.projectDetailSystemBuildFallback', { tool: systemBuildFallbackMatch[1] ?? '' });
  }

  const clearOverrideUseMatch = value.match(/^Clear manual override and use (.+)$/);
  if (clearOverrideUseMatch) {
    return t('codePane.projectDetailClearOverrideUse', { path: clearOverrideUseMatch[1] ?? '' });
  }

  const localizedExactLine = localizeProjectText(value, t);
  if (localizedExactLine !== value) {
    return localizedExactLine;
  }

  const prefixes: Record<string, string> = {
    'Application': t('codePane.projectLineApplication'),
    'Beans': t('codePane.projectLineBeans'),
    'Benchmarks': t('codePane.projectLineBenchmarks'),
    'Build file': t('codePane.projectLineBuildFile'),
    'Configs': t('codePane.projectLineConfigs'),
    'Detected environments': t('codePane.projectLineDetectedEnvironments'),
    'Endpoints': t('codePane.projectLineEndpoints'),
    'Entrypoints': t('codePane.projectLineEntrypoints'),
    'Environment root': t('codePane.projectLineEnvironmentRoot'),
    'Examples': t('codePane.projectLineExamples'),
    'GOMODCACHE': t('codePane.projectLineGoModCache'),
    'Interpreter': t('codePane.projectLineInterpreter'),
    'Main sources': t('codePane.projectLineMainSources'),
    'Project file': t('codePane.projectLineProjectFile'),
    'Root': t('codePane.projectLineRoot'),
    'Routes': t('codePane.projectLineRoutes'),
    'Selection': t('codePane.projectLineSelection'),
    'Test sources': t('codePane.projectLineTestSources'),
    'Type': t('codePane.projectLineType'),
    'go': 'go',
    'go:generate directives': t('codePane.projectLineGoGenerateDirectives'),
    'go.mod': 'go.mod',
    'go.work': 'go.work',
  };

  if (value.startsWith('go:generate directives:')) {
    return `${t('codePane.projectLineGoGenerateDirectives')}: ${value.slice('go:generate directives:'.length).trimStart()}`;
  }

  const colonIndex = value.indexOf(':');
  if (colonIndex > 0) {
    const prefix = value.slice(0, colonIndex);
    const suffix = value.slice(colonIndex + 1).trimStart();
    const localizedPrefix = prefixes[prefix] ?? prefix;
    return `${localizedPrefix}: ${localizeProjectLineValue(suffix, t)}`;
  }

  return localizeProjectText(value, t);
}

function localizeProjectLineValue(value: string, t: Translate): string {
  switch (value) {
    case 'Not detected':
      return t('codePane.projectValueNotDetected');
    case 'Missing override':
      return t('codePane.projectValueMissingOverride');
    default:
      return value;
  }
}

function isSessionActive(session: CodePaneRunSession): boolean {
  return session.state === 'starting' || session.state === 'running';
}

function getProjectCommandTone(
  kind: 'run' | 'refresh' | 'configure' | 'repair' | undefined,
  t: ReturnType<typeof useI18n>['t'],
): {
  badgeLabel: string;
  badgeClassName: string;
  buttonClassName: string;
  icon: 'run' | 'refresh' | 'configure' | 'repair';
} {
  switch (kind) {
    case 'refresh':
      return {
        badgeLabel: t('codePane.projectCommandRefresh'),
        badgeClassName: 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]',
        buttonClassName: 'border-[rgb(var(--info)/0.20)] bg-[rgb(var(--info)/0.06)] text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--info)/0.30)] hover:bg-[rgb(var(--info)/0.10)] hover:text-[rgb(var(--foreground))]',
        icon: 'refresh',
      };
    case 'configure':
      return {
        badgeLabel: t('codePane.projectCommandConfig'),
        badgeClassName: 'bg-[rgb(var(--warning)/0.14)] text-[rgb(var(--warning))]',
        buttonClassName: 'border-[rgb(var(--warning)/0.20)] bg-[rgb(var(--warning)/0.06)] text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--warning)/0.30)] hover:bg-[rgb(var(--warning)/0.10)] hover:text-[rgb(var(--foreground))]',
        icon: 'configure',
      };
    case 'repair':
      return {
        badgeLabel: t('codePane.projectCommandRepair'),
        badgeClassName: 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]',
        buttonClassName: 'border-[rgb(var(--error)/0.20)] bg-[rgb(var(--error)/0.06)] text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--error)/0.30)] hover:bg-[rgb(var(--error)/0.10)] hover:text-[rgb(var(--foreground))]',
        icon: 'repair',
      };
    case 'run':
    default:
      return {
        badgeLabel: t('codePane.projectCommandRun'),
        badgeClassName: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
        buttonClassName: 'border-[rgb(var(--border))] bg-[var(--appearance-pane-background)] text-[rgb(var(--muted-foreground))] hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]',
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

function formatWorkspacePhaseLabel(
  phase: CodePaneLanguageWorkspaceState['phase'],
  t: ReturnType<typeof useI18n>['t'],
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

function getSessionTone(
  state: CodePaneRunSession['state'],
  t: ReturnType<typeof useI18n>['t'],
): { label: string; className: string } {
  switch (state) {
    case 'starting':
      return {
        label: t('codePane.sessionStateStarting'),
        className: 'bg-[rgb(var(--info)/0.14)] text-[rgb(var(--info))]',
      };
    case 'running':
      return {
        label: t('codePane.sessionStateRunning'),
        className: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
      };
    case 'passed':
      return {
        label: t('codePane.sessionStatePassed'),
        className: 'bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]',
      };
    case 'failed':
      return {
        label: t('codePane.sessionStateFailed'),
        className: 'bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]',
      };
    case 'stopped':
      return {
        label: t('codePane.sessionStateStopped'),
        className: 'bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--muted-foreground))]',
      };
    default:
      return {
        label: state,
        className: 'bg-[var(--appearance-pane-chrome-background)] text-[rgb(var(--muted-foreground))]',
      };
  }
}

function formatDiagnosticSeverityLabel(
  severity: 'info' | 'warning' | 'error',
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (severity) {
    case 'error':
      return t('codePane.problemSeverityError');
    case 'warning':
      return t('codePane.problemSeverityWarning');
    case 'info':
    default:
      return t('codePane.problemSeverityInfo');
  }
}
