import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import type {
  CodePaneDiagnostic,
  CodePaneDiagnosticsChangedPayload,
  CodePaneDocumentSymbol,
  CodePaneHoverResult,
  CodePaneLocation,
  CodePanePosition,
  CodePaneReadFileResult,
  CodePaneReference,
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

type TextSyncKind = 0 | 1 | 2;

const JAVA_SLOW_REQUEST_TIMEOUT_MS = 60_000;
const JAVA_SLOW_REQUEST_METHODS = new Set([
  'initialize',
  'java/classFileContents',
  'textDocument/definition',
  'textDocument/hover',
  'textDocument/references',
  'textDocument/documentSymbol',
]);

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

interface LspSymbolInformation {
  name: string;
  kind: number;
  location: LspLocation;
  containerName?: string;
}

export interface LanguageServerSupervisorOptions {
  runtimeRootPath: string;
  adapters?: LanguageRuntimeAdapter[];
  emitDiagnostics: (payload: CodePaneDiagnosticsChangedPayload) => void;
  emitRuntimeState: (payload: PluginRuntimeStateChangedPayload) => void;
  now?: () => string;
  requestTimeoutMs?: number;
  restartBackoffMs?: number;
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
  private readonly now: () => string;
  private readonly requestTimeoutMs: number;
  private readonly restartBackoffMs: number;
  private readonly sessions = new Map<string, LanguageServerSession>();

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
    this.now = options.now ?? (() => new Date().toISOString());
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.restartBackoffMs = options.restartBackoffMs ?? 10_000;
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
      await session.dispose();
      this.sessions.delete(this.getSessionKey(resolution));
    }
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

  async getDocumentSymbols(resolution: ResolvedLanguagePlugin, filePath: string): Promise<CodePaneDocumentSymbol[]> {
    return await this.getOrCreateSession(resolution).getDocumentSymbols(filePath);
  }

  async readVirtualDocument(
    resolution: ResolvedLanguagePlugin,
    documentUri: string,
  ): Promise<CodePaneReadFileResult | null> {
    return await this.getOrCreateSession(resolution).readVirtualDocument(documentUri);
  }

  async resetSessions(pluginId?: string): Promise<void> {
    const sessionsToDispose = Array.from(this.sessions.values())
      .filter((session) => !pluginId || session.pluginId === pluginId);

    await Promise.all(sessionsToDispose.map((session) => session.dispose()));

    if (!pluginId) {
      this.sessions.clear();
      return;
    }

    for (const [key, session] of Array.from(this.sessions.entries())) {
      if (session.pluginId === pluginId) {
        this.sessions.delete(key);
      }
    }
  }

  private getOrCreateSession(resolution: ResolvedLanguagePlugin): LanguageServerSession {
    const sessionKey = this.getSessionKey(resolution);
    const existingSession = this.sessions.get(sessionKey);
    if (existingSession) {
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
      now: this.now,
      requestTimeoutMs: this.requestTimeoutMs,
      restartBackoffMs: this.restartBackoffMs,
    });

    this.sessions.set(sessionKey, session);
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
}

class LanguageServerSession {
  readonly pluginId: string;

  private readonly resolution: ResolvedLanguagePlugin;
  private readonly runtimeRootPath: string;
  private readonly adapters: LanguageRuntimeAdapter[];
  private readonly emitDiagnostics: (event: SessionDiagnosticsEvent) => void;
  private readonly emitRuntimeState: (payload: PluginRuntimeStateChangedPayload) => void;
  private readonly now: () => string;
  private readonly requestTimeoutMs: number;
  private readonly restartBackoffMs: number;
  private readonly documents = new Map<string, TrackedDocument>();
  private readonly pendingRequests = new Map<number, PendingRequest>();

  private spawnedProcess: SpawnedRuntimeProcess | null = null;
  private stdoutBuffer = Buffer.alloc(0);
  private nextRequestId = 1;
  private initializePromise: Promise<void> | null = null;
  private isInitialized = false;
  private textSyncKind: TextSyncKind = 1;
  private expectedExit = false;
  private disposed = false;
  private recentStartFailure: { message: string; timestampMs: number } | null = null;
  private lastRuntimeErrorMessage: string | null = null;

  constructor(options: LanguageServerSessionOptions) {
    this.resolution = options.resolution;
    this.pluginId = options.resolution.pluginId;
    this.runtimeRootPath = options.runtimeRootPath;
    this.adapters = options.adapters;
    this.emitDiagnostics = options.emitDiagnostics;
    this.emitRuntimeState = options.emitRuntimeState;
    this.now = options.now ?? (() => new Date().toISOString());
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.restartBackoffMs = options.restartBackoffMs ?? 10_000;
  }

  hasTrackedDocuments(): boolean {
    return this.documents.size > 0;
  }

  hasDocument(filePath: string): boolean {
    return this.documents.has(filePath);
  }

  async syncDocument(config: DocumentSyncConfig): Promise<void> {
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

  async getDocumentSymbols(filePath: string): Promise<CodePaneDocumentSymbol[]> {
    await this.ensureInitialized();
    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: {
        uri: filePathToUri(filePath),
      },
    }) as Array<LspDocumentSymbol | LspSymbolInformation> | null;

    return (result ?? []).map(normalizeDocumentSymbol).filter((symbol): symbol is CodePaneDocumentSymbol => Boolean(symbol));
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
    this.lastRuntimeErrorMessage = null;

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
            configuration: true,
            workspaceFolders: true,
          },
          textDocument: {
            definition: {},
            hover: {
              contentFormat: ['markdown', 'plaintext'],
            },
            references: {},
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

      this.textSyncKind = normalizeTextSyncKind(initializeResult?.capabilities?.textDocumentSync);
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
      const runtimeError = error instanceof Error ? error : new Error(String(error));
      const message = this.lastRuntimeErrorMessage ?? runtimeError.message;
      const propagatedError = new Error(message);
      this.rememberRecentStartFailure(message);
      this.rejectPendingRequests(propagatedError);
      this.emitRuntimeStateChange('error', message);
    });

    spawnedProcess.child.on('exit', (code, signal) => {
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
    }

    this.sendMessage({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  private handleServerNotification(method: string, params: any): void {
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
    this.sendMessage({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    });

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

    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
    this.spawnedProcess.child.stdin.write(Buffer.concat([header, payload]));
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

function extractLastRuntimeErrorLine(rawMessage: string): string | null {
  const lines = rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => (
      Boolean(line)
      && !/Registered provider .*SLF4JServiceProvider.*logback/i.test(line)
      && !/org\.apache\.aries\.spifly\.BaseActivator log/i.test(line)
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
