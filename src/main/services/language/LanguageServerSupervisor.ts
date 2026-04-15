import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import type {
  CodePaneCallHierarchyDirection,
  CodePaneCodeAction,
  CodePaneCompletionItem,
  CodePaneDiagnostic,
  CodePaneDiagnosticsChangedPayload,
  CodePaneDocumentHighlight,
  CodePaneInlayHint,
  CodePaneDocumentSymbol,
  CodePaneHierarchyItem,
  CodePaneHierarchyResult,
  CodePaneHoverResult,
  CodePaneLocation,
  CodePanePosition,
  CodePaneReadFileResult,
  CodePaneReference,
  CodePaneSemanticTokensLegend,
  CodePaneSemanticTokensResult,
  CodePaneSignatureHelpResult,
  CodePaneTextEdit,
  CodePaneWorkspaceSymbol,
  CodePaneRange,
  CodePaneTypeHierarchyDirection,
  PluginRuntimeStateChangedPayload,
} from '../../../shared/types/electron-api';
import type { PluginRequirement, PluginRuntime } from '../../../shared/types/plugin';
import { BinaryRuntimeAdapter } from './runtime/BinaryRuntimeAdapter';
import { JavaRuntimeAdapter } from './runtime/JavaRuntimeAdapter';
import { NodeRuntimeAdapter } from './runtime/NodeRuntimeAdapter';
import { PythonRuntimeAdapter } from './runtime/PythonRuntimeAdapter';
import type {
  LanguageRuntimeAdapter,
  RuntimeSpawnContext,
  SpawnedRuntimeProcess,
} from './runtime/shared';
import {
  createRuntimeHash,
  ensureWorkspaceStoragePath,
} from './runtime/shared';
import type { ResolvedLanguagePlugin } from './LanguagePluginResolver';
import { LanguageWorkspaceService } from './LanguageWorkspaceService';

type TextSyncKind = 0 | 1 | 2;

const JAVA_SLOW_REQUEST_TIMEOUT_MS = 60_000;
const JAVA_SLOW_REQUEST_METHODS = new Set([
  'initialize',
  'java/classFileContents',
  'textDocument/definition',
  'textDocument/hover',
  'textDocument/references',
  'textDocument/documentHighlight',
  'textDocument/documentSymbol',
  'textDocument/inlayHint',
  'textDocument/prepareCallHierarchy',
  'callHierarchy/incomingCalls',
  'callHierarchy/outgoingCalls',
  'textDocument/prepareTypeHierarchy',
  'typeHierarchy/supertypes',
  'typeHierarchy/subtypes',
  'textDocument/semanticTokens/full',
  'textDocument/implementation',
  'textDocument/codeAction',
  'codeAction/resolve',
  'workspace/executeCommand',
  'textDocument/completion',
  'textDocument/signatureHelp',
  'textDocument/rename',
  'textDocument/formatting',
  'workspace/symbol',
]);
const SEMANTIC_TOKEN_TYPES = [
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator',
] as const;
const SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
] as const;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface TrackedDocument {
  languageId: string;
  text: string;
  version: number;
  owners: Map<string, string>;
}

interface SessionDiagnosticsEvent {
  rootPaths: string[];
  filePath: string;
  diagnostics: CodePaneDiagnostic[];
}

interface LanguageServerSessionOptions {
  resolution: ResolvedLanguagePlugin;
  runtimeRootPath: string;
  adapters: LanguageRuntimeAdapter[];
  emitDiagnostics: (event: SessionDiagnosticsEvent) => void;
  emitRuntimeState: (payload: PluginRuntimeStateChangedPayload) => void;
  workspaceService?: LanguageWorkspaceService;
  now?: () => string;
  requestTimeoutMs?: number;
  restartBackoffMs?: number;
}

interface DocumentSyncConfig {
  ownerId: string;
  rootPath: string;
  filePath: string;
  languageId: string;
  content: string;
  reason: 'open' | 'change' | 'save';
}

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface LspLocation {
  uri: string;
  range: LspRange;
}

interface LspLocationLink {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange?: LspRange;
}

interface LspMarkupContent {
  kind: 'markdown' | 'plaintext';
  value: string;
}

interface LspHoverResult {
  contents: string | LspMarkupContent | Array<string | LspMarkupContent>;
  range?: LspRange;
}

interface LspDocumentHighlight {
  range: LspRange;
  kind?: number;
}

interface LspDiagnostic {
  severity?: number;
  message: string;
  source?: string;
  code?: string | number;
  range: LspRange;
}

interface LspDocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

interface LspInlayHintLabelPart {
  value: string;
}

interface LspInlayHint {
  position: LspPosition;
  label: string | LspInlayHintLabelPart[];
  kind?: number;
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

interface LspHierarchyItem {
  name: string;
  kind: number;
  detail?: string;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
}

interface LspCallHierarchyIncomingCall {
  from: LspHierarchyItem;
  fromRanges?: LspRange[];
}

interface LspCallHierarchyOutgoingCall {
  to: LspHierarchyItem;
  fromRanges?: LspRange[];
}

interface LspSymbolInformation {
  name: string;
  kind: number;
  location: LspLocation;
  containerName?: string;
}

interface LspSemanticTokens {
  resultId?: string;
  data: number[] | Uint32Array;
}

interface LspCompletionItem {
  label: string;
  detail?: string;
  documentation?: string | LspMarkupContent;
  kind?: number;
  insertText?: string;
  filterText?: string;
  sortText?: string;
  textEdit?: {
    range: LspRange;
    newText: string;
  };
}

interface LspCompletionList {
  isIncomplete?: boolean;
  items: LspCompletionItem[];
}

interface LspParameterInformation {
  label: string | [number, number];
  documentation?: string | LspMarkupContent;
}

interface LspSignatureInformation {
  label: string;
  documentation?: string | LspMarkupContent;
  parameters?: LspParameterInformation[];
}

interface LspSignatureHelp {
  signatures: LspSignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

interface LspTextEdit {
  range: LspRange;
  newText: string;
}

interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{
    textDocument?: {
      uri?: string;
    };
    edits?: LspTextEdit[];
  }>;
}

interface LspCommand {
  title: string;
  command: string;
  arguments?: unknown[];
}

interface LspCodeAction {
  title: string;
  kind?: string;
  diagnostics?: LspDiagnostic[];
  isPreferred?: boolean;
  disabled?: {
    reason?: string;
  };
  edit?: LspWorkspaceEdit;
  command?: LspCommand;
  data?: unknown;
}

export interface LanguageServerSupervisorOptions {
  runtimeRootPath: string;
  adapters?: LanguageRuntimeAdapter[];
  emitDiagnostics: (payload: CodePaneDiagnosticsChangedPayload) => void;
  emitRuntimeState: (payload: PluginRuntimeStateChangedPayload) => void;
  workspaceService?: LanguageWorkspaceService;
  now?: () => string;
  requestTimeoutMs?: number;
  restartBackoffMs?: number;
  idleSessionTtlMs?: number;
  maxIdleSessions?: number;
}

export interface DocumentOwnerConfig {
  ownerId: string;
  rootPath: string;
  filePath: string;
  languageId: string;
  content: string;
}

export class LanguageServerSupervisor {
  private readonly runtimeRootPath: string;
  private readonly adapters: LanguageRuntimeAdapter[];
  private readonly emitDiagnostics: (payload: CodePaneDiagnosticsChangedPayload) => void;
  private readonly emitRuntimeState: (payload: PluginRuntimeStateChangedPayload) => void;
  private readonly workspaceService?: LanguageWorkspaceService;
  private readonly now: () => string;
  private readonly requestTimeoutMs: number;
  private readonly restartBackoffMs: number;
  private readonly idleSessionTtlMs: number;
  private readonly maxIdleSessions: number;
  private readonly sessions = new Map<string, LanguageServerSession>();
  private readonly pendingIdleDisposals = new Map<string, NodeJS.Timeout>();

  constructor(options: LanguageServerSupervisorOptions) {
    this.runtimeRootPath = options.runtimeRootPath;
    this.adapters = options.adapters ?? [
      new BinaryRuntimeAdapter(),
      new NodeRuntimeAdapter(),
      new JavaRuntimeAdapter(),
      new PythonRuntimeAdapter(),
    ];
    this.emitDiagnostics = options.emitDiagnostics;
    this.emitRuntimeState = options.emitRuntimeState;
    this.workspaceService = options.workspaceService;
    this.now = options.now ?? (() => new Date().toISOString());
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.restartBackoffMs = options.restartBackoffMs ?? 10_000;
    this.idleSessionTtlMs = Math.max(0, options.idleSessionTtlMs ?? 15 * 60_000);
    this.maxIdleSessions = Math.max(1, options.maxIdleSessions ?? 4);
  }

  async syncDocument(resolution: ResolvedLanguagePlugin, config: DocumentOwnerConfig, reason: 'open' | 'change' | 'save'): Promise<void> {
    const session = this.getOrCreateSession(resolution);
    await session.syncDocument({
      ...config,
      reason,
    });
  }

  async closeDocument(resolution: ResolvedLanguagePlugin, ownerId: string, filePath: string): Promise<void> {
    const session = this.getOrCreateSession(resolution);
    await session.closeDocument(ownerId, filePath);
    if (!session.hasTrackedDocuments()) {
      this.scheduleIdleSessionDisposal(resolution, session);
    }
  }

  async prewarmSession(resolution: ResolvedLanguagePlugin): Promise<void> {
    const session = this.getOrCreateSession(resolution);
    await session.prewarm();
  }

  attachDocumentOwner(
    resolution: ResolvedLanguagePlugin,
    ownerId: string,
    rootPath: string,
    filePath: string,
  ): boolean {
    return this.getOrCreateSession(resolution).attachDocumentOwner(ownerId, rootPath, filePath);
  }

  hasDocument(resolution: ResolvedLanguagePlugin, filePath: string): boolean {
    const session = this.sessions.get(this.getSessionKey(resolution));
    return session?.hasDocument(filePath) ?? false;
  }

  async getDefinition(resolution: ResolvedLanguagePlugin, filePath: string, position: CodePanePosition): Promise<CodePaneLocation[]> {
    return await this.getOrCreateSession(resolution).getDefinition(filePath, position);
  }

  async getHover(resolution: ResolvedLanguagePlugin, filePath: string, position: CodePanePosition): Promise<CodePaneHoverResult | null> {
    return await this.getOrCreateSession(resolution).getHover(filePath, position);
  }

  async getReferences(resolution: ResolvedLanguagePlugin, filePath: string, position: CodePanePosition): Promise<CodePaneReference[]> {
    return await this.getOrCreateSession(resolution).getReferences(filePath, position);
  }

  async getDocumentHighlights(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    position: CodePanePosition,
  ): Promise<CodePaneDocumentHighlight[]> {
    return await this.getOrCreateSession(resolution).getDocumentHighlights(filePath, position);
  }

  async getDocumentSymbols(resolution: ResolvedLanguagePlugin, filePath: string): Promise<CodePaneDocumentSymbol[]> {
    return await this.getOrCreateSession(resolution).getDocumentSymbols(filePath);
  }

  async getInlayHints(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    range: CodePaneRange,
  ): Promise<CodePaneInlayHint[]> {
    return await this.getOrCreateSession(resolution).getInlayHints(filePath, range);
  }

  async getCallHierarchy(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    position: CodePanePosition,
    direction: CodePaneCallHierarchyDirection,
  ): Promise<CodePaneHierarchyResult> {
    return await this.getOrCreateSession(resolution).getCallHierarchy(filePath, position, direction);
  }

  async resolveCallHierarchy(
    resolution: ResolvedLanguagePlugin,
    item: CodePaneHierarchyItem,
    direction: CodePaneCallHierarchyDirection,
  ): Promise<CodePaneHierarchyItem[]> {
    return await this.getOrCreateSession(resolution).resolveCallHierarchy(item, direction);
  }

  async getTypeHierarchy(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    position: CodePanePosition,
    direction: CodePaneTypeHierarchyDirection,
  ): Promise<CodePaneHierarchyResult> {
    return await this.getOrCreateSession(resolution).getTypeHierarchy(filePath, position, direction);
  }

  async resolveTypeHierarchy(
    resolution: ResolvedLanguagePlugin,
    item: CodePaneHierarchyItem,
    direction: CodePaneTypeHierarchyDirection,
  ): Promise<CodePaneHierarchyItem[]> {
    return await this.getOrCreateSession(resolution).resolveTypeHierarchy(item, direction);
  }

  async getSemanticTokenLegend(
    resolution: ResolvedLanguagePlugin,
  ): Promise<CodePaneSemanticTokensLegend | null> {
    return await this.getOrCreateSession(resolution).getSemanticTokenLegend();
  }

  async getSemanticTokens(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
  ): Promise<CodePaneSemanticTokensResult | null> {
    return await this.getOrCreateSession(resolution).getSemanticTokens(filePath);
  }

  async getImplementations(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    position: CodePanePosition,
  ): Promise<CodePaneLocation[]> {
    return await this.getOrCreateSession(resolution).getImplementations(filePath, position);
  }

  async getCompletionItems(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    position: CodePanePosition,
    options?: {
      triggerCharacter?: string;
      triggerKind?: number;
    },
  ): Promise<CodePaneCompletionItem[]> {
    return await this.getOrCreateSession(resolution).getCompletionItems(filePath, position, options);
  }

  async getSignatureHelp(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    position: CodePanePosition,
    options?: {
      triggerCharacter?: string;
    },
  ): Promise<CodePaneSignatureHelpResult | null> {
    return await this.getOrCreateSession(resolution).getSignatureHelp(filePath, position, options);
  }

  async renameSymbol(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    position: CodePanePosition,
    newName: string,
  ): Promise<CodePaneTextEdit[]> {
    return await this.getOrCreateSession(resolution).renameSymbol(filePath, position, newName);
  }

  async formatDocument(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    options?: {
      tabSize?: number;
      insertSpaces?: boolean;
    },
  ): Promise<CodePaneTextEdit[]> {
    return await this.getOrCreateSession(resolution).formatDocument(filePath, options);
  }

  async getWorkspaceSymbols(
    resolution: ResolvedLanguagePlugin,
    query: string,
    limit?: number,
  ): Promise<CodePaneWorkspaceSymbol[]> {
    return await this.getOrCreateSession(resolution).getWorkspaceSymbols(query, limit);
  }

  async getCodeActions(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    range: CodePaneRange,
  ): Promise<CodePaneCodeAction[]> {
    return await this.getOrCreateSession(resolution).getCodeActions(filePath, range);
  }

  async runCodeAction(
    resolution: ResolvedLanguagePlugin,
    filePath: string,
    actionId: string,
  ): Promise<CodePaneTextEdit[]> {
    return await this.getOrCreateSession(resolution).runCodeAction(filePath, actionId);
  }

  async readVirtualDocument(
    resolution: ResolvedLanguagePlugin,
    documentUri: string,
  ): Promise<CodePaneReadFileResult | null> {
    return await this.getOrCreateSession(resolution).readVirtualDocument(documentUri);
  }

  async resetSessions(pluginId?: string): Promise<void> {
    this.clearIdleSessionDisposals(pluginId);
    const sessionsToDispose = Array.from(this.sessions.values())
      .filter((session) => !pluginId || session.pluginId === pluginId);

    await Promise.all(sessionsToDispose.map((session) => session.dispose()));

    if (!pluginId) {
      this.sessions.clear();
      this.workspaceService?.reset();
      return;
    }

    for (const [key, session] of Array.from(this.sessions.entries())) {
      if (session.pluginId === pluginId) {
        this.sessions.delete(key);
      }
    }

    this.workspaceService?.reset(pluginId);
  }

  private getOrCreateSession(resolution: ResolvedLanguagePlugin): LanguageServerSession {
    const sessionKey = this.getSessionKey(resolution);
    this.cancelIdleSessionDisposal(sessionKey);
    const existingSession = this.sessions.get(sessionKey);
    if (existingSession) {
      existingSession.markTouched();
      return existingSession;
    }

    const session = new LanguageServerSession({
      resolution,
      runtimeRootPath: this.runtimeRootPath,
      adapters: this.adapters,
      emitDiagnostics: (event) => {
        for (const rootPath of event.rootPaths) {
          this.emitDiagnostics({
            rootPath,
            filePath: event.filePath,
            diagnostics: event.diagnostics,
          });
        }
      },
      emitRuntimeState: this.emitRuntimeState,
      workspaceService: this.workspaceService,
      now: this.now,
      requestTimeoutMs: this.requestTimeoutMs,
      restartBackoffMs: this.restartBackoffMs,
    });

    this.sessions.set(sessionKey, session);
    this.evictIdleSessionsIfNeeded(sessionKey);
    return session;
  }

  private getSessionKey(resolution: ResolvedLanguagePlugin): string {
    return [
      resolution.pluginId,
      createRuntimeHash({
        projectRoot: resolution.projectRoot,
        runtime: resolution.capability.runtime,
        settings: resolution.mergedSettings,
      }),
    ].join(':');
  }

  private scheduleIdleSessionDisposal(resolution: ResolvedLanguagePlugin, session: LanguageServerSession): void {
    const sessionKey = this.getSessionKey(resolution);
    this.cancelIdleSessionDisposal(sessionKey);

    if (this.idleSessionTtlMs <= 0) {
      void this.disposeSession(sessionKey, session);
      return;
    }

    const timer = setTimeout(() => {
      this.pendingIdleDisposals.delete(sessionKey);
      void this.disposeSession(sessionKey, session);
    }, this.idleSessionTtlMs);
    timer.unref?.();
    this.pendingIdleDisposals.set(sessionKey, timer);
  }

  private async disposeSession(sessionKey: string, session: LanguageServerSession): Promise<void> {
    const currentSession = this.sessions.get(sessionKey);
    if (!currentSession || currentSession !== session || currentSession.hasTrackedDocuments()) {
      return;
    }

    await currentSession.dispose();
    if (this.sessions.get(sessionKey) === currentSession) {
      this.sessions.delete(sessionKey);
    }
  }

  private evictIdleSessionsIfNeeded(preferredSessionKey?: string): void {
    const idleSessions = Array.from(this.sessions.entries())
      .filter(([key, session]) => key !== preferredSessionKey && !session.hasTrackedDocuments());
    if (idleSessions.length <= this.maxIdleSessions) {
      return;
    }

    idleSessions
      .sort((left, right) => left[1].getLastTouchedAtMs() - right[1].getLastTouchedAtMs())
      .slice(0, idleSessions.length - this.maxIdleSessions)
      .forEach(([sessionKey, session]) => {
        this.cancelIdleSessionDisposal(sessionKey);
        void this.disposeSession(sessionKey, session);
      });
  }

  private clearIdleSessionDisposals(pluginId?: string): void {
    for (const [sessionKey, timer] of Array.from(this.pendingIdleDisposals.entries())) {
      if (pluginId && !sessionKey.startsWith(`${pluginId}:`)) {
        continue;
      }

      clearTimeout(timer);
      this.pendingIdleDisposals.delete(sessionKey);
    }
  }

  private cancelIdleSessionDisposal(sessionKey: string): void {
    const timer = this.pendingIdleDisposals.get(sessionKey);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.pendingIdleDisposals.delete(sessionKey);
  }
}

class LanguageServerSession {
  readonly pluginId: string;

  private readonly resolution: ResolvedLanguagePlugin;
  private readonly runtimeRootPath: string;
  private readonly adapters: LanguageRuntimeAdapter[];
  private readonly emitDiagnostics: (event: SessionDiagnosticsEvent) => void;
  private readonly emitRuntimeState: (payload: PluginRuntimeStateChangedPayload) => void;
  private readonly workspaceService?: LanguageWorkspaceService;
  private readonly now: () => string;
  private readonly requestTimeoutMs: number;
  private readonly restartBackoffMs: number;
  private readonly documents = new Map<string, TrackedDocument>();
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly codeActions = new Map<string, LspCodeAction | LspCommand>();
  private readonly pendingAppliedWorkspaceEdits: CodePaneTextEdit[] = [];

  private spawnedProcess: SpawnedRuntimeProcess | null = null;
  private stdoutBuffer = Buffer.alloc(0);
  private nextRequestId = 1;
  private nextCodeActionId = 1;
  private initializePromise: Promise<void> | null = null;
  private isInitialized = false;
  private textSyncKind: TextSyncKind = 1;
  private serverCapabilities: any = null;
  private transportClosed = false;
  private expectedExit = false;
  private disposed = false;
  private recentStartFailure: { message: string; timestampMs: number } | null = null;
  private lastRuntimeErrorMessage: string | null = null;
  private lastTouchedAtMs = Date.now();

  constructor(options: LanguageServerSessionOptions) {
    this.resolution = options.resolution;
    this.pluginId = options.resolution.pluginId;
    this.runtimeRootPath = options.runtimeRootPath;
    this.adapters = options.adapters;
    this.emitDiagnostics = options.emitDiagnostics;
    this.emitRuntimeState = options.emitRuntimeState;
    this.workspaceService = options.workspaceService;
    this.now = options.now ?? (() => new Date().toISOString());
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.restartBackoffMs = options.restartBackoffMs ?? 10_000;
  }

  hasTrackedDocuments(): boolean {
    return this.documents.size > 0;
  }

  getLastTouchedAtMs(): number {
    return this.lastTouchedAtMs;
  }

  markTouched(): void {
    this.lastTouchedAtMs = Date.now();
  }

  async prewarm(): Promise<void> {
    this.markTouched();
    await this.ensureInitialized();
  }

  hasDocument(filePath: string): boolean {
    return this.documents.has(filePath);
  }

  attachDocumentOwner(ownerId: string, rootPath: string, filePath: string): boolean {
    const document = this.documents.get(filePath);
    if (!document) {
      return false;
    }

    document.owners.set(ownerId, rootPath);
    return true;
  }

  async syncDocument(config: DocumentSyncConfig): Promise<void> {
    this.markTouched();
    const document = this.documents.get(config.filePath);
    if (!document) {
      await this.ensureInitialized();
      this.documents.set(config.filePath, {
        languageId: config.languageId,
        text: config.content,
        version: 1,
        owners: new Map([[config.ownerId, config.rootPath]]),
      });
      this.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: filePathToUri(config.filePath),
          languageId: config.languageId,
          version: 1,
          text: config.content,
        },
      });

      if (config.reason === 'save') {
        this.sendNotification('textDocument/didSave', {
          textDocument: {
            uri: filePathToUri(config.filePath),
          },
          text: config.content,
        });
      }
      return;
    }

    document.owners.set(config.ownerId, config.rootPath);
    if (document.languageId !== config.languageId) {
      document.languageId = config.languageId;
    }

    if (document.text !== config.content) {
      await this.ensureInitialized();
      const previousText = document.text;
      document.version += 1;
      document.text = config.content;
      this.sendNotification('textDocument/didChange', {
        textDocument: {
          uri: filePathToUri(config.filePath),
          version: document.version,
        },
        contentChanges: this.textSyncKind === 2
          ? [{
              range: createFullDocumentRange(previousText),
              text: config.content,
            }]
          : [{
              text: config.content,
            }],
      });
    }

    if (config.reason === 'save') {
      await this.ensureInitialized();
      this.sendNotification('textDocument/didSave', {
        textDocument: {
          uri: filePathToUri(config.filePath),
        },
        text: config.content,
      });
    }
  }

  async closeDocument(ownerId: string, filePath: string): Promise<void> {
    this.markTouched();
    const document = this.documents.get(filePath);
    if (!document) {
      return;
    }

    const removedRootPath = document.owners.get(ownerId);
    document.owners.delete(ownerId);
    if (document.owners.size > 0) {
      return;
    }

    this.documents.delete(filePath);
    if (this.spawnedProcess) {
      this.sendNotification('textDocument/didClose', {
        textDocument: {
          uri: filePathToUri(filePath),
        },
      });
    }

    this.emitDiagnostics({
      rootPaths: removedRootPath ? [removedRootPath] : [this.resolution.workspaceRoot],
      filePath,
      diagnostics: [],
    });
  }

  async getDefinition(filePath: string, position: CodePanePosition): Promise<CodePaneLocation[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/definition', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
    });

    const items = Array.isArray(result) ? result : result ? [result] : [];
    const normalizedLocations = await Promise.all(items.map(async (item) => (
      await this.normalizeLocationLikeResult(item)
    )));
    return normalizedLocations.filter((item): item is CodePaneLocation => Boolean(item));
  }

  async getHover(filePath: string, position: CodePanePosition): Promise<CodePaneHoverResult | null> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
    }) as LspHoverResult | null;

    if (!result?.contents) {
      return null;
    }

    const contents = Array.isArray(result.contents) ? result.contents : [result.contents];
    return {
      contents: contents.map((item) => (
        typeof item === 'string'
          ? { kind: 'plaintext', value: item }
          : { kind: item.kind, value: item.value }
      )),
      ...(result.range ? { range: fromLspRange(result.range) } : {}),
    };
  }

  async getReferences(filePath: string, position: CodePanePosition): Promise<CodePaneReference[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/references', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
      context: {
        includeDeclaration: true,
      },
    }) as LspLocation[] | null;

    return (result ?? []).map((item) => ({
      filePath: uriToFilePath(item.uri),
      range: fromLspRange(item.range),
    }));
  }

  async getDocumentHighlights(
    filePath: string,
    position: CodePanePosition,
  ): Promise<CodePaneDocumentHighlight[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/documentHighlight', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
    }) as LspDocumentHighlight[] | null;

    return (result ?? [])
      .map(normalizeDocumentHighlight)
      .filter((highlight): highlight is CodePaneDocumentHighlight => Boolean(highlight));
  }

  async getDocumentSymbols(filePath: string): Promise<CodePaneDocumentSymbol[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
    }) as Array<LspDocumentSymbol | LspSymbolInformation> | null;

    return (result ?? []).map(normalizeDocumentSymbol).filter((symbol): symbol is CodePaneDocumentSymbol => Boolean(symbol));
  }

  async getInlayHints(filePath: string, range: CodePaneRange): Promise<CodePaneInlayHint[]> {
    this.markTouched();
    await this.ensureInitialized();
    if (!this.serverCapabilities?.inlayHintProvider) {
      return [];
    }

    const result = await this.sendRequest('textDocument/inlayHint', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      range: toLspRange(range),
    }) as LspInlayHint[] | null;

    return (result ?? []).map(normalizeInlayHint).filter((hint): hint is CodePaneInlayHint => Boolean(hint));
  }

  async getCallHierarchy(
    filePath: string,
    position: CodePanePosition,
    direction: CodePaneCallHierarchyDirection,
  ): Promise<CodePaneHierarchyResult> {
    this.markTouched();
    await this.ensureInitialized();
    if (!this.serverCapabilities?.callHierarchyProvider) {
      return {
        root: null,
        items: [],
      };
    }

    const preparedItems = await this.sendRequest('textDocument/prepareCallHierarchy', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
    }) as LspHierarchyItem[] | LspHierarchyItem | null;

    const rootItem = Array.isArray(preparedItems)
      ? preparedItems[0] ?? null
      : preparedItems;
    if (!rootItem) {
      return {
        root: null,
        items: [],
      };
    }

    const normalizedRoot = await this.normalizeHierarchyItem(rootItem);
    if (!normalizedRoot) {
      return {
        root: null,
        items: [],
      };
    }

    return {
      root: normalizedRoot,
      items: await this.resolveCallHierarchy(normalizedRoot, direction),
    };
  }

  async resolveCallHierarchy(
    item: CodePaneHierarchyItem,
    direction: CodePaneCallHierarchyDirection,
  ): Promise<CodePaneHierarchyItem[]> {
    this.markTouched();
    await this.ensureInitialized();
    if (!this.serverCapabilities?.callHierarchyProvider) {
      return [];
    }

    const requestMethod = direction === 'incoming'
      ? 'callHierarchy/incomingCalls'
      : 'callHierarchy/outgoingCalls';
    const result = await this.sendRequest(requestMethod, {
      item: toLspHierarchyItem(item),
    }) as LspCallHierarchyIncomingCall[] | LspCallHierarchyOutgoingCall[] | null;

    const normalizedItems = await Promise.all((result ?? []).map(async (entry) => {
      if (direction === 'incoming') {
        const incomingEntry = entry as LspCallHierarchyIncomingCall;
        return await this.normalizeHierarchyItem(
          incomingEntry.from,
          (incomingEntry.fromRanges ?? []).map(fromLspRange),
        );
      }

      const outgoingEntry = entry as LspCallHierarchyOutgoingCall;
      return await this.normalizeHierarchyItem(
        outgoingEntry.to,
        (outgoingEntry.fromRanges ?? []).map(fromLspRange),
      );
    }));

    return normalizedItems.filter((candidate): candidate is CodePaneHierarchyItem => Boolean(candidate));
  }

  async getTypeHierarchy(
    filePath: string,
    position: CodePanePosition,
    direction: CodePaneTypeHierarchyDirection,
  ): Promise<CodePaneHierarchyResult> {
    this.markTouched();
    await this.ensureInitialized();
    if (!this.serverCapabilities?.typeHierarchyProvider) {
      return {
        root: null,
        items: [],
      };
    }

    const preparedItems = await this.sendRequest('textDocument/prepareTypeHierarchy', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
    }) as LspHierarchyItem[] | LspHierarchyItem | null;

    const rootItem = Array.isArray(preparedItems)
      ? preparedItems[0] ?? null
      : preparedItems;
    if (!rootItem) {
      return {
        root: null,
        items: [],
      };
    }

    const normalizedRoot = await this.normalizeHierarchyItem(rootItem);
    if (!normalizedRoot) {
      return {
        root: null,
        items: [],
      };
    }

    return {
      root: normalizedRoot,
      items: await this.resolveTypeHierarchy(normalizedRoot, direction),
    };
  }

  async resolveTypeHierarchy(
    item: CodePaneHierarchyItem,
    direction: CodePaneTypeHierarchyDirection,
  ): Promise<CodePaneHierarchyItem[]> {
    this.markTouched();
    await this.ensureInitialized();
    if (!this.serverCapabilities?.typeHierarchyProvider) {
      return [];
    }

    const requestMethod = direction === 'parents'
      ? 'typeHierarchy/supertypes'
      : 'typeHierarchy/subtypes';
    const result = await this.sendRequest(requestMethod, {
      item: toLspHierarchyItem(item),
    }) as LspHierarchyItem[] | null;

    const normalizedItems = await Promise.all((result ?? []).map(async (entry) => (
      await this.normalizeHierarchyItem(entry)
    )));
    return normalizedItems.filter((candidate): candidate is CodePaneHierarchyItem => Boolean(candidate));
  }

  async getSemanticTokenLegend(): Promise<CodePaneSemanticTokensLegend | null> {
    this.markTouched();
    await this.ensureInitialized();
    return normalizeSemanticTokensLegend(this.serverCapabilities?.semanticTokensProvider?.legend);
  }

  async getSemanticTokens(filePath: string): Promise<CodePaneSemanticTokensResult | null> {
    this.markTouched();
    await this.ensureInitialized();
    const legend = normalizeSemanticTokensLegend(this.serverCapabilities?.semanticTokensProvider?.legend);
    if (!legend) {
      return null;
    }

    const result = await this.sendRequest('textDocument/semanticTokens/full', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
    }) as LspSemanticTokens | null;
    if (!result?.data) {
      return {
        legend,
        data: [],
      };
    }

    return {
      legend,
      ...(result.resultId ? { resultId: result.resultId } : {}),
      data: Array.from(result.data),
    };
  }

  async getImplementations(filePath: string, position: CodePanePosition): Promise<CodePaneLocation[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/implementation', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
    });

    const items = Array.isArray(result) ? result : result ? [result] : [];
    const normalizedLocations = await Promise.all(items.map(async (item) => (
      await this.normalizeLocationLikeResult(item)
    )));
    return normalizedLocations.filter((item): item is CodePaneLocation => Boolean(item));
  }

  async getCompletionItems(
    filePath: string,
    position: CodePanePosition,
    options?: {
      triggerCharacter?: string;
      triggerKind?: number;
    },
  ): Promise<CodePaneCompletionItem[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/completion', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
      context: {
        triggerKind: options?.triggerKind ?? 1,
        ...(options?.triggerCharacter ? { triggerCharacter: options.triggerCharacter } : {}),
      },
    }) as LspCompletionItem[] | LspCompletionList | null;

    const items = Array.isArray(result)
      ? result
      : result?.items ?? [];

    return items.map(normalizeCompletionItem).filter((item): item is CodePaneCompletionItem => Boolean(item));
  }

  async getSignatureHelp(
    filePath: string,
    position: CodePanePosition,
    options?: {
      triggerCharacter?: string;
    },
  ): Promise<CodePaneSignatureHelpResult | null> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/signatureHelp', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
      ...(options?.triggerCharacter
        ? {
            context: {
              triggerKind: 2,
              triggerCharacter: options.triggerCharacter,
              isRetrigger: false,
            },
          }
        : {}),
    }) as LspSignatureHelp | null;

    if (!result?.signatures) {
      return null;
    }

    return {
      signatures: result.signatures.map((signature) => ({
        label: signature.label,
        ...(signature.documentation ? { documentation: normalizeMarkupContent(signature.documentation) } : {}),
        ...(Array.isArray(signature.parameters)
          ? {
              parameters: signature.parameters.map((parameter) => ({
                label: normalizeParameterLabel(parameter.label, signature.label),
                ...(parameter.documentation ? { documentation: normalizeMarkupContent(parameter.documentation) } : {}),
              })),
            }
          : {}),
      })),
      ...(typeof result.activeSignature === 'number' ? { activeSignature: result.activeSignature } : {}),
      ...(typeof result.activeParameter === 'number' ? { activeParameter: result.activeParameter } : {}),
    };
  }

  async renameSymbol(
    filePath: string,
    position: CodePanePosition,
    newName: string,
  ): Promise<CodePaneTextEdit[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/rename', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      position: toLspPosition(position),
      newName,
    }) as LspWorkspaceEdit | null;

    return normalizeWorkspaceEdit(result);
  }

  async formatDocument(
    filePath: string,
    options?: {
      tabSize?: number;
      insertSpaces?: boolean;
    },
  ): Promise<CodePaneTextEdit[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/formatting', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      options: {
        tabSize: options?.tabSize ?? 2,
        insertSpaces: options?.insertSpaces ?? true,
        trimTrailingWhitespace: true,
        insertFinalNewline: true,
        trimFinalNewlines: true,
      },
    }) as LspTextEdit[] | null;

    return normalizeStandaloneTextEdits(filePath, result ?? []);
  }

  async getWorkspaceSymbols(query: string, limit?: number): Promise<CodePaneWorkspaceSymbol[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('workspace/symbol', {
      query,
      limit: limit ?? 100,
    }) as Array<LspSymbolInformation> | null;

    return (result ?? [])
      .map(normalizeWorkspaceSymbol)
      .filter((symbol): symbol is CodePaneWorkspaceSymbol => Boolean(symbol))
      .slice(0, Math.max(limit ?? 100, 0));
  }

  async getCodeActions(filePath: string, range: CodePaneRange): Promise<CodePaneCodeAction[]> {
    this.markTouched();
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/codeAction', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
      range: toLspRange(range),
      context: {
        diagnostics: [],
      },
    }) as Array<LspCodeAction | LspCommand> | null;

    const actions: CodePaneCodeAction[] = [];
    for (const item of result ?? []) {
      const actionId = `code-action-${this.nextCodeActionId}`;
      this.nextCodeActionId += 1;
      this.codeActions.set(actionId, item);
      const normalizedAction = normalizeCodeAction(item, actionId, filePath);
      if (normalizedAction) {
        actions.push(normalizedAction);
      }
    }

    return actions;
  }

  async runCodeAction(_filePath: string, actionId: string): Promise<CodePaneTextEdit[]> {
    this.markTouched();
    await this.ensureInitialized();
    const storedAction = this.codeActions.get(actionId);
    if (!storedAction) {
      throw new Error(`Unknown code action: ${actionId}`);
    }

    const workspaceEditStartIndex = this.pendingAppliedWorkspaceEdits.length;
    let resolvedAction = storedAction;
    if (isResolvableCodeAction(storedAction) && this.serverCapabilities?.codeActionProvider?.resolveProvider) {
      resolvedAction = await this.sendRequest('codeAction/resolve', storedAction) as LspCodeAction;
      this.codeActions.set(actionId, resolvedAction);
    }

    const normalizedEdits: CodePaneTextEdit[] = [];
    if (isCodeActionWithEdit(resolvedAction)) {
      normalizedEdits.push(...normalizeWorkspaceEdit(resolvedAction.edit));
    }

    const command = getCodeActionCommand(resolvedAction);
    if (command) {
      await this.sendRequest('workspace/executeCommand', {
        command: command.command,
        arguments: command.arguments ?? [],
      });
      await waitForWorkspaceEditFlush();

      if (this.pendingAppliedWorkspaceEdits.length > workspaceEditStartIndex) {
        normalizedEdits.push(
          ...this.pendingAppliedWorkspaceEdits.slice(workspaceEditStartIndex),
        );
      }
    }

    return deduplicateTextEdits(normalizedEdits);
  }

  async readVirtualDocument(documentUri: string): Promise<CodePaneReadFileResult | null> {
    await this.ensureInitialized();

    if (!isVirtualDocumentUri(documentUri)) {
      return null;
    }

    if (this.pluginId !== 'official.java-jdtls') {
      return null;
    }

    const result = await this.sendRequest('java/classFileContents', {
      uri: documentUri,
    }) as string | null;
    if (typeof result !== 'string' || result.length === 0) {
      return null;
    }

    return {
      content: result,
      mtimeMs: 0,
      size: Buffer.byteLength(result, 'utf8'),
      language: 'java',
      isBinary: false,
      readOnly: true,
      documentUri,
      displayPath: deriveVirtualDocumentDisplayPath(documentUri),
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    await this.stopProcess();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.spawnedProcess) {
      return;
    }

    if (this.initializePromise) {
      return await this.initializePromise;
    }

    const recentStartFailureMessage = this.getRecentStartFailureMessage();
    if (recentStartFailureMessage) {
      throw new Error(recentStartFailureMessage);
    }

    this.initializePromise = this.startProcess();
    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  private async startProcess(): Promise<void> {
    const adapter = this.adapters.find((candidate) => candidate.supports(this.resolution.capability.runtime));
    if (!adapter) {
      throw new Error(`No runtime adapter registered for ${this.resolution.capability.runtime.type}`);
    }

    const workspaceStoragePath = await ensureWorkspaceStoragePath(
      this.runtimeRootPath,
      this.resolution.pluginId,
      this.resolution.projectRoot,
    );

    const spawnContext: RuntimeSpawnContext = {
      pluginId: this.resolution.pluginId,
      pluginInstallPath: this.resolution.record.installPath,
      projectRoot: this.resolution.projectRoot,
      workspaceStoragePath,
      settings: this.resolution.mergedSettings,
      runtimeRootPath: this.runtimeRootPath,
    };

    this.stdoutBuffer = Buffer.alloc(0);
    this.isInitialized = false;
    this.expectedExit = false;
    this.transportClosed = false;
    this.lastRuntimeErrorMessage = null;
    this.serverCapabilities = null;
    this.codeActions.clear();
    this.pendingAppliedWorkspaceEdits.length = 0;

    try {
      this.spawnedProcess = await adapter.spawn(this.resolution.capability.runtime, spawnContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.rememberRecentStartFailure(message);
      this.emitRuntimeStateChange('error', message);
      throw error;
    }

    this.attachProcessListeners(this.spawnedProcess);
    this.emitRuntimeStateChange('starting');

    try {
      const initializeResult = await this.sendRequest('initialize', {
        processId: process.pid,
        rootUri: filePathToUri(this.resolution.projectRoot),
        workspaceFolders: [
          {
            uri: filePathToUri(this.resolution.projectRoot),
            name: path.basename(this.resolution.projectRoot),
          },
        ],
        capabilities: {
          workspace: {
            applyEdit: true,
            configuration: true,
            workspaceFolders: true,
            symbol: {},
          },
          textDocument: {
            definition: {},
            completion: {
              completionItem: {
                documentationFormat: ['markdown', 'plaintext'],
              },
            },
            hover: {
              contentFormat: ['markdown', 'plaintext'],
            },
            references: {},
            documentHighlight: {},
            callHierarchy: {},
            typeHierarchy: {},
            semanticTokens: {
              requests: {
                full: true,
              },
              tokenTypes: Array.from(SEMANTIC_TOKEN_TYPES),
              tokenModifiers: Array.from(SEMANTIC_TOKEN_MODIFIERS),
              formats: ['relative'],
            },
            inlayHint: {},
            implementation: {},
            codeAction: {
              codeActionLiteralSupport: {
                codeActionKind: {
                  valueSet: [
                    '',
                    'quickfix',
                    'refactor',
                    'refactor.extract',
                    'refactor.inline',
                    'refactor.rewrite',
                    'source',
                    'source.organizeImports',
                  ],
                },
              },
              resolveSupport: {
                properties: ['edit', 'command'],
              },
            },
            signatureHelp: {
              signatureInformation: {
                documentationFormat: ['markdown', 'plaintext'],
                parameterInformation: {
                  labelOffsetSupport: true,
                },
              },
            },
            rename: {},
            formatting: {},
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            synchronization: {
              didSave: true,
              dynamicRegistration: false,
              willSave: false,
              willSaveWaitUntil: false,
            },
          },
        },
        initializationOptions: inflateSettings(this.resolution.mergedSettings),
        clientInfo: {
          name: 'copilot-terminal',
          version: '3.0.0',
        },
      });

      this.serverCapabilities = initializeResult?.capabilities ?? null;
      this.textSyncKind = normalizeTextSyncKind(this.serverCapabilities?.textDocumentSync);
      this.isInitialized = true;
      this.clearRecentStartFailure();
      this.sendNotification('initialized', {});
      this.sendNotification('workspace/didChangeConfiguration', {
        settings: inflateSettings(this.resolution.mergedSettings),
      });
      this.emitRuntimeStateChange('running');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.rememberRecentStartFailure(message);

      if (this.spawnedProcess) {
        this.spawnedProcess.child.stdin.end();
        if (!this.spawnedProcess.child.killed) {
          this.spawnedProcess.child.kill();
        }
      }

      throw error;
    }
  }

  private attachProcessListeners(spawnedProcess: SpawnedRuntimeProcess): void {
    spawnedProcess.child.stdin.on('error', (error) => {
      const runtimeError = error instanceof Error ? error : new Error(String(error));
      this.handleTransportFailure(runtimeError);
    });

    spawnedProcess.child.stdout.on('data', (chunk: Buffer) => {
      this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
      this.flushBufferedMessages();
    });

    spawnedProcess.child.stderr.on('data', (chunk: Buffer) => {
      const message = extractLastRuntimeErrorLine(chunk.toString('utf8'));
      if (message) {
        this.lastRuntimeErrorMessage = message;
        console.warn(`[LanguageServer:${this.resolution.pluginId}] ${message}`);
      }
    });

    spawnedProcess.child.on('error', (error) => {
      this.transportClosed = true;
      const runtimeError = error instanceof Error ? error : new Error(String(error));
      const message = this.lastRuntimeErrorMessage ?? runtimeError.message;
      const propagatedError = new Error(message);
      this.rememberRecentStartFailure(message);
      this.rejectPendingRequests(propagatedError);
      this.emitRuntimeStateChange('error', message);
    });

    spawnedProcess.child.on('exit', (code, signal) => {
      this.transportClosed = true;
      this.spawnedProcess = null;
      this.isInitialized = false;
      const exitMessage = signal
        ? `Language server exited with signal ${signal}`
        : `Language server exited with code ${String(code ?? 0)}`;
      const failureMessage = this.lastRuntimeErrorMessage ?? exitMessage;
      this.rejectPendingRequests(new Error(failureMessage));

      if (this.expectedExit || this.disposed) {
        this.emitRuntimeStateChange('stopped');
      } else {
        this.rememberRecentStartFailure(failureMessage);
        this.emitRuntimeStateChange('error', failureMessage);
      }
    });
  }

  private flushBufferedMessages(): void {
    while (true) {
      const separatorIndex = this.stdoutBuffer.indexOf('\r\n\r\n');
      if (separatorIndex === -1) {
        return;
      }

      const headerText = this.stdoutBuffer.slice(0, separatorIndex).toString('utf8');
      const contentLengthLine = headerText
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('content-length:'));
      if (!contentLengthLine) {
        this.stdoutBuffer = this.stdoutBuffer.slice(separatorIndex + 4);
        continue;
      }

      const contentLength = Number(contentLengthLine.split(':')[1]?.trim());
      const messageStartIndex = separatorIndex + 4;
      const messageEndIndex = messageStartIndex + contentLength;
      if (!Number.isFinite(contentLength) || this.stdoutBuffer.length < messageEndIndex) {
        return;
      }

      const messageBuffer = this.stdoutBuffer.slice(messageStartIndex, messageEndIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(messageEndIndex);

      try {
        const message = JSON.parse(messageBuffer.toString('utf8'));
        this.handleProtocolMessage(message);
      } catch (error) {
        this.emitRuntimeStateChange('error', error instanceof Error ? error.message : String(error));
      }
    }
  }

  private handleProtocolMessage(message: any): void {
    if (typeof message?.id === 'number' && (Object.prototype.hasOwnProperty.call(message, 'result') || Object.prototype.hasOwnProperty.call(message, 'error'))) {
      const pendingRequest = this.pendingRequests.get(message.id);
      if (!pendingRequest) {
        return;
      }

      clearTimeout(pendingRequest.timer);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message || 'LSP request failed'));
      } else {
        pendingRequest.resolve(message.result);
      }
      return;
    }

    if (!message?.method) {
      return;
    }

    if (typeof message.id === 'number') {
      void this.handleServerRequest(message.id, message.method, message.params);
      return;
    }

    this.handleServerNotification(message.method, message.params);
  }

  private async handleServerRequest(id: number, method: string, params: any): Promise<void> {
    let result: unknown = null;

    if (method === 'workspace/configuration') {
      const inflatedSettings = inflateSettings(this.resolution.mergedSettings);
      result = Array.isArray(params?.items)
        ? params.items.map((item: { section?: string }) => (
            item?.section ? resolveConfigurationSection(inflatedSettings, item.section) : inflatedSettings
          ))
        : [];
    } else if (method === 'workspace/workspaceFolders') {
      result = [
        {
          uri: filePathToUri(this.resolution.projectRoot),
          name: path.basename(this.resolution.projectRoot),
        },
      ];
    } else if (method === 'window/workDoneProgress/create') {
      result = null;
    } else if (method === 'workspace/applyEdit') {
      const edits = normalizeWorkspaceEdit(params?.edit);
      if (edits.length > 0) {
        this.pendingAppliedWorkspaceEdits.push(...edits);
      }
      result = {
        applied: true,
      };
    }

    this.sendMessage({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  private handleServerNotification(method: string, params: any): void {
    if (method === '$/progress') {
      this.handleWorkDoneProgress(params);
      return;
    }

    if (method !== 'textDocument/publishDiagnostics') {
      return;
    }

    const filePath = uriToFilePath(params?.uri);
    if (!filePath) {
      return;
    }

    const diagnostics: CodePaneDiagnostic[] = Array.isArray(params?.diagnostics)
      ? params.diagnostics
        .map((item: LspDiagnostic) => normalizeDiagnostic(item, filePath))
        .filter((item: CodePaneDiagnostic | null): item is CodePaneDiagnostic => Boolean(item))
      : [];

    const trackedDocument = this.documents.get(filePath);
    const rootPaths = trackedDocument
      ? Array.from(new Set(Array.from(trackedDocument.owners.values())))
      : Array.from(new Set(Array.from(this.documents.values()).flatMap((document) => Array.from(document.owners.values()))));

    this.emitDiagnostics({
      rootPaths: rootPaths.length > 0 ? rootPaths : [this.resolution.workspaceRoot],
      filePath,
      diagnostics,
    });
  }

  private handleWorkDoneProgress(params: any): void {
    const token = typeof params?.token === 'string' || typeof params?.token === 'number'
      ? String(params.token)
      : null;
    const value = params?.value;

    if (!token || !value || typeof value.kind !== 'string' || !this.workspaceService) {
      return;
    }

    if (value.kind === 'begin') {
      this.workspaceService.beginProgress(
        this.resolution,
        token,
        typeof value.title === 'string' ? value.title : undefined,
        typeof value.message === 'string' ? value.message : undefined,
        typeof value.percentage === 'number' ? value.percentage : undefined,
      );
      return;
    }

    if (value.kind === 'report') {
      this.workspaceService.reportProgress(
        this.resolution,
        token,
        typeof value.message === 'string' ? value.message : undefined,
        typeof value.percentage === 'number' ? value.percentage : undefined,
      );
      return;
    }

    if (value.kind === 'end') {
      this.workspaceService.endProgress(
        this.resolution,
        token,
        typeof value.message === 'string' ? value.message : undefined,
      );
    }
  }

  private async normalizeLocationLikeResult(
    value: LspLocation | LspLocationLink | null | undefined,
  ): Promise<CodePaneLocation | null> {
    if (!value) {
      return null;
    }

    const targetUri = 'targetUri' in value ? value.targetUri : value.uri;
    const filePath = uriToFilePath(targetUri);
    const normalizedRange = fromLspRange('targetRange' in value ? value.targetRange : value.range);
    const originSelectionRange = 'targetUri' in value && value.targetSelectionRange
      ? fromLspRange(value.targetSelectionRange)
      : undefined;

    if (filePath) {
      return {
        filePath,
        range: normalizedRange,
        ...(originSelectionRange ? { originSelectionRange } : {}),
      };
    }

    const virtualDocument = await this.readVirtualDocument(targetUri);
    if (!virtualDocument) {
      return null;
    }

    return {
      filePath: virtualDocument.documentUri ?? targetUri,
      uri: targetUri,
      displayPath: virtualDocument.displayPath,
      readOnly: true,
      language: virtualDocument.language,
      content: virtualDocument.content,
      range: normalizedRange,
      ...(originSelectionRange ? { originSelectionRange } : {}),
    };
  }

  private async normalizeHierarchyItem(
    item: LspHierarchyItem | null | undefined,
    relationRanges?: CodePaneRange[],
  ): Promise<CodePaneHierarchyItem | null> {
    if (!item) {
      return null;
    }

    const filePath = uriToFilePath(item.uri);
    const normalizedRange = fromLspRange(item.range);
    const selectionRange = fromLspRange(item.selectionRange);

    if (filePath) {
      return {
        name: item.name,
        detail: item.detail,
        kind: item.kind,
        filePath,
        range: normalizedRange,
        selectionRange,
        ...(relationRanges && relationRanges.length > 0 ? { relationRanges } : {}),
      };
    }

    const virtualDocument = await this.readVirtualDocument(item.uri);
    if (!virtualDocument) {
      return null;
    }

    return {
      name: item.name,
      detail: item.detail,
      kind: item.kind,
      filePath: virtualDocument.documentUri ?? item.uri,
      uri: item.uri,
      displayPath: virtualDocument.displayPath,
      readOnly: true,
      language: virtualDocument.language,
      content: virtualDocument.content,
      range: normalizedRange,
      selectionRange,
      ...(relationRanges && relationRanges.length > 0 ? { relationRanges } : {}),
    };
  }

  private async stopProcess(): Promise<void> {
    const spawnedProcess = this.spawnedProcess;
    if (!spawnedProcess) {
      return;
    }

    this.expectedExit = true;

    try {
      if (this.isInitialized) {
        await this.sendRequest('shutdown', null, 2000).catch(() => {});
        this.sendNotification('exit', {});
      }
    } catch {
      // Best effort shutdown only.
    }

    spawnedProcess.child.stdin.end();
    if (!spawnedProcess.child.killed) {
      spawnedProcess.child.kill();
    }
  }

  private async sendRequest(method: string, params: unknown, timeoutMs = this.requestTimeoutMs): Promise<any> {
    await this.ensureTransportReady();

    const resolvedTimeoutMs = this.resolveRequestTimeoutMs(method, timeoutMs);

    const requestId = this.nextRequestId++;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Timed out waiting for LSP response to ${method}`));
      }, resolvedTimeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });

      try {
        this.sendMessage({
          jsonrpc: '2.0',
          id: requestId,
          method,
          params,
        });
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.spawnedProcess) {
      return;
    }

    this.sendMessage({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  private sendMessage(message: unknown): void {
    if (!this.spawnedProcess) {
      return;
    }

    if (this.transportClosed) {
      throw new Error(this.lastRuntimeErrorMessage ?? 'Language server transport is closed');
    }

    const stdin = this.spawnedProcess.child.stdin;
    if (stdin.destroyed || !stdin.writable || stdin.writableEnded) {
      const transportError = new Error(this.lastRuntimeErrorMessage ?? 'Language server stdin is not writable');
      this.handleTransportFailure(transportError);
      throw transportError;
    }

    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
    stdin.write(Buffer.concat([header, payload]), (error) => {
      if (error) {
        this.handleTransportFailure(error);
      }
    });
  }

  private async ensureTransportReady(): Promise<void> {
    if (!this.spawnedProcess) {
      await this.ensureInitialized();
    }

    if (!this.spawnedProcess) {
      throw new Error('Language server process is not running');
    }
  }

  private rejectPendingRequests(error: Error): void {
    for (const [requestId, pendingRequest] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
      this.pendingRequests.delete(requestId);
    }
  }

  private handleTransportFailure(error: Error): void {
    if (this.transportClosed) {
      return;
    }

    this.transportClosed = true;
    const message = this.lastRuntimeErrorMessage ?? error.message;
    this.rememberRecentStartFailure(message);
    this.rejectPendingRequests(new Error(message));
    this.emitRuntimeStateChange('error', message);
  }

  private clearRecentStartFailure(): void {
    this.recentStartFailure = null;
  }

  private rememberRecentStartFailure(message: string): void {
    this.recentStartFailure = {
      message,
      timestampMs: Date.now(),
    };
  }

  private resolveRequestTimeoutMs(method: string, timeoutMs: number): number {
    if (timeoutMs !== this.requestTimeoutMs) {
      return timeoutMs;
    }

    if (this.pluginId === 'official.java-jdtls' && JAVA_SLOW_REQUEST_METHODS.has(method)) {
      return Math.max(timeoutMs, JAVA_SLOW_REQUEST_TIMEOUT_MS);
    }

    return timeoutMs;
  }

  private getRecentStartFailureMessage(): string | null {
    if (!this.recentStartFailure) {
      return null;
    }

    if (Date.now() - this.recentStartFailure.timestampMs > this.restartBackoffMs) {
      this.recentStartFailure = null;
      return null;
    }

    return this.recentStartFailure.message;
  }

  private emitRuntimeStateChange(
    state: PluginRuntimeStateChangedPayload['state'],
    message?: string,
  ): void {
    this.workspaceService?.updateRuntimeState(this.resolution, state, message);
    this.emitRuntimeState({
      pluginId: this.resolution.pluginId,
      projectRoot: this.resolution.projectRoot,
      state,
      ...(message ? { message } : {}),
      timestamp: this.now(),
    });
  }
}

function filePathToUri(filePath: string): string {
  if (isVirtualDocumentUri(filePath)) {
    return filePath;
  }

  return pathToFileURL(filePath).toString();
}

function uriToFilePath(uri: string | undefined): string {
  if (!uri) {
    return '';
  }

  try {
    return fileURLToPath(uri);
  } catch {
    return '';
  }
}

function toLspPosition(position: CodePanePosition): LspPosition {
  return {
    line: Math.max(position.lineNumber - 1, 0),
    character: Math.max(position.column - 1, 0),
  };
}

function toLspRange(range: CodePaneRange): LspRange {
  return {
    start: toLspPosition({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    }),
    end: toLspPosition({
      lineNumber: range.endLineNumber,
      column: range.endColumn,
    }),
  };
}

function toLspHierarchyItem(item: CodePaneHierarchyItem): LspHierarchyItem {
  return {
    name: item.name,
    kind: item.kind ?? 12,
    ...(item.detail ? { detail: item.detail } : {}),
    uri: item.uri ?? filePathToUri(item.filePath),
    range: toLspRange(item.range),
    selectionRange: toLspRange(item.selectionRange),
  };
}

function fromLspRange(range: LspRange): CodePaneLocation['range'] {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function isVirtualDocumentUri(uri: string | undefined): boolean {
  return typeof uri === 'string'
    && /^[a-z][a-z0-9+.-]*:\/\//i.test(uri)
    && !uri.toLowerCase().startsWith('file://');
}

function deriveVirtualDocumentDisplayPath(documentUri: string): string {
  try {
    const parsedUri = new URL(documentUri);
    const decodedPath = decodeURIComponent(parsedUri.pathname || '');
    const trimmedPath = decodedPath.replace(/^\/+/, '');
    if (!trimmedPath) {
      return documentUri;
    }

    const normalizedPath = trimmedPath.endsWith('.class')
      ? `${trimmedPath.slice(0, -'.class'.length)}.java`
      : trimmedPath;

    return path.posix.join('External Libraries', normalizedPath);
  } catch {
    return documentUri;
  }
}

function normalizeDiagnostic(value: LspDiagnostic, filePath: string): CodePaneDiagnostic | null {
  if (!value?.range || !value.message) {
    return null;
  }

  return {
    filePath,
    owner: 'language-plugin',
    severity: mapDiagnosticSeverity(value.severity),
    message: value.message,
    ...(value.source ? { source: value.source } : {}),
    ...(value.code !== undefined ? { code: String(value.code) } : {}),
    startLineNumber: value.range.start.line + 1,
    startColumn: value.range.start.character + 1,
    endLineNumber: value.range.end.line + 1,
    endColumn: value.range.end.character + 1,
  };
}

function mapDiagnosticSeverity(value?: number): CodePaneDiagnostic['severity'] {
  switch (value) {
    case 1:
      return 'error';
    case 2:
      return 'warning';
    case 3:
      return 'info';
    default:
      return 'hint';
  }
}

function normalizeDocumentHighlight(value: LspDocumentHighlight): CodePaneDocumentHighlight | null {
  if (!value?.range) {
    return null;
  }

  const kind = mapDocumentHighlightKind(value.kind);

  return {
    range: fromLspRange(value.range),
    ...(kind ? { kind } : {}),
  };
}

function mapDocumentHighlightKind(value?: number): CodePaneDocumentHighlight['kind'] | undefined {
  switch (value) {
    case 2:
      return 'read';
    case 3:
      return 'write';
    case 1:
    default:
      return 'text';
  }
}

function normalizeDocumentSymbol(
  value: LspDocumentSymbol | LspSymbolInformation,
): CodePaneDocumentSymbol | null {
  if ('location' in value) {
    return {
      name: value.name,
      detail: value.containerName,
      kind: value.kind,
      range: fromLspRange(value.location.range),
      selectionRange: fromLspRange(value.location.range),
    };
  }

  return {
    name: value.name,
    ...(value.detail ? { detail: value.detail } : {}),
    kind: value.kind,
    range: fromLspRange(value.range),
    selectionRange: fromLspRange(value.selectionRange),
    ...(Array.isArray(value.children)
      ? {
          children: value.children
            .map(normalizeDocumentSymbol)
            .filter((child): child is CodePaneDocumentSymbol => Boolean(child)),
        }
      : {}),
  };
}

function normalizeInlayHint(value: LspInlayHint): CodePaneInlayHint | null {
  if (!value?.position) {
    return null;
  }

  const label = typeof value.label === 'string'
    ? value.label
    : value.label.map((part) => part.value ?? '').join('');
  if (!label) {
    return null;
  }

  return {
    position: {
      lineNumber: value.position.line + 1,
      column: value.position.character + 1,
    },
    label,
    ...(value.kind === 1
      ? { kind: 'type' as const }
      : value.kind === 2
        ? { kind: 'parameter' as const }
        : {}),
    ...(value.paddingLeft !== undefined ? { paddingLeft: value.paddingLeft } : {}),
    ...(value.paddingRight !== undefined ? { paddingRight: value.paddingRight } : {}),
  };
}

function normalizeSemanticTokensLegend(value: unknown): CodePaneSemanticTokensLegend | null {
  const tokenTypes = Array.isArray((value as { tokenTypes?: unknown[] } | null | undefined)?.tokenTypes)
    ? (value as { tokenTypes: unknown[] }).tokenTypes.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const tokenModifiers = Array.isArray((value as { tokenModifiers?: unknown[] } | null | undefined)?.tokenModifiers)
    ? (value as { tokenModifiers: unknown[] }).tokenModifiers.filter((entry): entry is string => typeof entry === 'string')
    : [];
  if (tokenTypes.length === 0) {
    return null;
  }

  return {
    tokenTypes,
    tokenModifiers,
  };
}

function normalizeCompletionItem(value: LspCompletionItem): CodePaneCompletionItem | null {
  if (!value?.label) {
    return null;
  }

  return {
    label: value.label,
    ...(value.detail ? { detail: value.detail } : {}),
    ...(value.documentation ? { documentation: normalizeMarkupContent(value.documentation) } : {}),
    ...(typeof value.kind === 'number' ? { kind: value.kind } : {}),
    ...(value.insertText ? { insertText: value.insertText } : {}),
    ...(value.filterText ? { filterText: value.filterText } : {}),
    ...(value.sortText ? { sortText: value.sortText } : {}),
    ...(value.textEdit?.range ? { range: fromLspRange(value.textEdit.range) } : {}),
  };
}

function normalizeStandaloneTextEdits(filePath: string, edits: LspTextEdit[]): CodePaneTextEdit[] {
  return edits
    .filter((edit) => Boolean(edit?.range))
    .map((edit) => ({
      filePath,
      range: fromLspRange(edit.range),
      newText: edit.newText ?? '',
    }));
}

function normalizeWorkspaceEdit(edit: LspWorkspaceEdit | null | undefined): CodePaneTextEdit[] {
  if (!edit) {
    return [];
  }

  const normalizedEdits: CodePaneTextEdit[] = [];

  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    const filePath = uriToFilePath(uri);
    if (!filePath) {
      continue;
    }
    normalizedEdits.push(...normalizeStandaloneTextEdits(filePath, edits ?? []));
  }

  for (const change of edit.documentChanges ?? []) {
    const filePath = uriToFilePath(change.textDocument?.uri);
    if (!filePath) {
      continue;
    }
    normalizedEdits.push(...normalizeStandaloneTextEdits(filePath, change.edits ?? []));
  }

  return normalizedEdits;
}

function normalizeWorkspaceSymbol(value: LspSymbolInformation): CodePaneWorkspaceSymbol | null {
  if (!value?.location?.uri || !value.location.range) {
    return null;
  }

  const filePath = uriToFilePath(value.location.uri);
  if (!filePath) {
    return null;
  }

  return {
    name: value.name,
    kind: value.kind,
    filePath,
    range: fromLspRange(value.location.range),
    ...(value.containerName ? { containerName: value.containerName } : {}),
  };
}

function normalizeCodeAction(
  value: LspCodeAction | LspCommand,
  id: string,
  filePath: string,
): CodePaneCodeAction | null {
  if (!value || typeof value.title !== 'string' || value.title.length === 0) {
    return null;
  }

  return {
    id,
    title: value.title,
    ...('kind' in value && value.kind ? { kind: value.kind } : {}),
    ...('isPreferred' in value && value.isPreferred ? { isPreferred: true } : {}),
    ...('disabled' in value && value.disabled?.reason
      ? {
          disabledReason: value.disabled.reason,
        }
      : {}),
    ...('diagnostics' in value && Array.isArray(value.diagnostics)
      ? {
          diagnostics: value.diagnostics
            .map((diagnostic) => normalizeCodeActionDiagnostic(diagnostic, filePath))
            .filter((diagnostic): diagnostic is NonNullable<CodePaneCodeAction['diagnostics']>[number] => Boolean(diagnostic)),
        }
      : {}),
  };
}

function normalizeCodeActionDiagnostic(
  value: LspDiagnostic,
  filePath: string,
): NonNullable<CodePaneCodeAction['diagnostics']>[number] | null {
  const diagnostic = normalizeDiagnostic(value, filePath);
  if (!diagnostic) {
    return null;
  }

  return {
    message: diagnostic.message,
    range: {
      startLineNumber: diagnostic.startLineNumber,
      startColumn: diagnostic.startColumn,
      endLineNumber: diagnostic.endLineNumber,
      endColumn: diagnostic.endColumn,
    },
    severity: diagnostic.severity,
    ...(diagnostic.code ? { code: diagnostic.code } : {}),
  };
}

function isResolvableCodeAction(value: LspCodeAction | LspCommand): value is LspCodeAction {
  return 'kind' in value
    || 'edit' in value
    || 'diagnostics' in value
    || 'disabled' in value
    || 'data' in value
    || 'isPreferred' in value;
}

function isCodeActionWithEdit(value: LspCodeAction | LspCommand): value is LspCodeAction {
  return 'edit' in value && Boolean(value.edit);
}

function getCodeActionCommand(value: LspCodeAction | LspCommand): LspCommand | null {
  if ('command' in value && typeof value.command === 'string') {
    return value as LspCommand;
  }

  return 'command' in value && typeof value.command === 'object' && value.command
    ? value.command
    : null;
}

function deduplicateTextEdits(edits: CodePaneTextEdit[]): CodePaneTextEdit[] {
  const dedupedEdits = new Map<string, CodePaneTextEdit>();

  for (const edit of edits) {
    if (!edit.filePath) {
      continue;
    }

    const editKey = [
      edit.filePath,
      edit.range.startLineNumber,
      edit.range.startColumn,
      edit.range.endLineNumber,
      edit.range.endColumn,
      edit.newText,
    ].join(':');
    dedupedEdits.set(editKey, edit);
  }

  return Array.from(dedupedEdits.values()).sort((left, right) => (
    left.filePath === right.filePath
      ? compareRanges(left.range, right.range)
      : left.filePath.localeCompare(right.filePath)
  ));
}

function compareRanges(left: CodePaneRange, right: CodePaneRange): number {
  return left.startLineNumber - right.startLineNumber
    || left.startColumn - right.startColumn
    || left.endLineNumber - right.endLineNumber
    || left.endColumn - right.endColumn;
}

async function waitForWorkspaceEditFlush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function normalizeMarkupContent(value: string | LspMarkupContent): string {
  return typeof value === 'string' ? value : value.value;
}

function normalizeParameterLabel(label: string | [number, number], signatureLabel: string): string {
  if (Array.isArray(label)) {
    return signatureLabel.slice(label[0] ?? 0, label[1] ?? signatureLabel.length);
  }

  return label;
}

function extractLastRuntimeErrorLine(rawMessage: string): string | null {
  const lines = rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => (
      Boolean(line)
      && !/Registered provider .*SLF4JServiceProvider.*logback/i.test(line)
      && !/org\.apache\.aries\.spifly\.BaseActivator log/i.test(line)
      && !/WARNING:\s+Using incubator modules:\s+jdk\.incubator\.vector/i.test(line)
    ));

  return lines.length > 0 ? lines[lines.length - 1] : null;
}

function normalizeTextSyncKind(value: any): TextSyncKind {
  if (typeof value === 'number') {
    return value === 2 ? 2 : value === 1 ? 1 : 0;
  }

  if (typeof value?.change === 'number') {
    return value.change === 2 ? 2 : value.change === 1 ? 1 : 0;
  }

  return 1;
}

function createFullDocumentRange(text: string): LspRange {
  const lines = text.split('\n');
  const lastLine = Math.max(lines.length - 1, 0);
  const lastCharacter = lines[lastLine]?.length ?? 0;

  return {
    start: {
      line: 0,
      character: 0,
    },
    end: {
      line: lastLine,
      character: lastCharacter,
    },
  };
}

function inflateSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(settings)) {
    const segments = key.split('.').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    let cursor: Record<string, unknown> = root;
    for (const segment of segments.slice(0, -1)) {
      const existingValue = cursor[segment];
      if (!existingValue || typeof existingValue !== 'object' || Array.isArray(existingValue)) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }

    cursor[segments[segments.length - 1]] = value;
  }

  return root;
}

function resolveConfigurationSection(settings: Record<string, unknown>, section: string): unknown {
  const segments = section.split('.').filter(Boolean);
  let cursor: unknown = settings;

  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return null;
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor ?? null;
}
