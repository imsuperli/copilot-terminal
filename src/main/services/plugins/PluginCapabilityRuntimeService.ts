import path from 'path';
import type {
  CodePaneDebugRequest,
  CodePaneDiagnostic,
  CodePaneFormatDocumentConfig,
  CodePaneRange,
  CodePaneRunTargetKind,
  CodePaneTextEdit,
  PluginRuntimeStateChangedPayload,
} from '../../../shared/types/electron-api';
import type {
  DebugAdapterPluginCapability,
  FormatterPluginCapability,
  LinterPluginCapability,
  PluginRegistry,
  TestProviderPluginCapability,
  WorkspacePluginSettings,
} from '../../../shared/types/plugin';
import type { CodeFileService } from '../code/CodeFileService';
import type { ResolvedCodeRunTarget } from '../code/CodeRunProfileService';
import type { DebugDriver, DebugDriverCallbacks } from '../debug/DebugDriver';
import { PluginDebugDriver } from '../debug/PluginDebugDriver';
import { BinaryRuntimeAdapter } from '../language/runtime/BinaryRuntimeAdapter';
import { JavaRuntimeAdapter } from '../language/runtime/JavaRuntimeAdapter';
import { NodeRuntimeAdapter } from '../language/runtime/NodeRuntimeAdapter';
import { PythonRuntimeAdapter } from '../language/runtime/PythonRuntimeAdapter';
import type { LanguageRuntimeAdapter, SpawnedRuntimeProcess } from '../language/runtime/shared';
import { ensureWorkspaceStoragePath } from '../language/runtime/shared';
import { PluginCapabilityResolver, type ResolvedPluginCapability } from './PluginCapabilityResolver';
import { PluginRegistryStore } from './PluginRegistryStore';
import { resolvePluginSettings } from './PluginSettingsResolver';

type RuntimeCapabilityType = 'formatter' | 'linter' | 'test-provider' | 'debug-adapter';
type RuntimeCapabilityUnion =
  | FormatterPluginCapability
  | LinterPluginCapability
  | TestProviderPluginCapability
  | DebugAdapterPluginCapability;
type RuntimeCapability<TType extends RuntimeCapabilityType> = Extract<RuntimeCapabilityUnion, { type: TType }>;

export interface PluginRuntimeTargetSpec {
  label?: string;
  detail?: string;
  kind?: CodePaneRunTargetKind;
  languageId?: string;
  workingDirectory?: string;
  filePath?: string;
  command: string;
  args?: string[];
  canDebug?: boolean;
  debugRequest?: CodePaneDebugRequest;
}

export interface PluginRuntimeTestItem {
  id: string;
  label: string;
  kind: 'file' | 'suite' | 'case';
  filePath?: string;
  target?: PluginRuntimeTargetSpec;
  children?: PluginRuntimeTestItem[];
}

interface ResolvedRuntimeCapability<TType extends RuntimeCapabilityType> extends ResolvedPluginCapability {
  capability: RuntimeCapability<TType>;
  registry: PluginRegistry;
  projectRoot: string;
  globalSettings: Record<string, unknown>;
  workspaceSettings: Record<string, unknown>;
  mergedSettings: Record<string, unknown>;
}

export interface PluginCapabilityRuntimeServiceOptions {
  registryStore: PluginRegistryStore;
  codeFileService: CodeFileService;
  runtimeRootPath: string;
  emitRuntimeState?: (payload: PluginRuntimeStateChangedPayload) => void;
  capabilityResolver?: PluginCapabilityResolver;
  runtimeAdapters?: LanguageRuntimeAdapter[];
  now?: () => string;
}

export class PluginCapabilityRuntimeService {
  private readonly registryStore: PluginRegistryStore;
  private readonly codeFileService: CodeFileService;
  private readonly runtimeRootPath: string;
  private readonly emitRuntimeState?: (payload: PluginRuntimeStateChangedPayload) => void;
  private readonly capabilityResolver: PluginCapabilityResolver;
  private readonly runtimeAdapters: LanguageRuntimeAdapter[];
  private readonly now: () => string;

  constructor(options: PluginCapabilityRuntimeServiceOptions) {
    this.registryStore = options.registryStore;
    this.codeFileService = options.codeFileService;
    this.runtimeRootPath = options.runtimeRootPath;
    this.emitRuntimeState = options.emitRuntimeState;
    this.capabilityResolver = options.capabilityResolver ?? new PluginCapabilityResolver({
      registryStore: options.registryStore,
    });
    this.runtimeAdapters = options.runtimeAdapters ?? [
      new BinaryRuntimeAdapter(),
      new NodeRuntimeAdapter(),
      new JavaRuntimeAdapter(),
      new PythonRuntimeAdapter(),
    ];
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async formatDocument(config: CodePaneFormatDocumentConfig & {
    workspacePluginSettings?: WorkspacePluginSettings;
  }): Promise<CodePaneTextEdit[] | null> {
    const resolution = await this.resolveCapability('formatter', {
      rootPath: config.rootPath,
      filePath: config.filePath,
      language: config.language,
      workspacePluginSettings: config.workspacePluginSettings,
    });
    if (!resolution) {
      return null;
    }

    const content = await this.resolveDocumentContent(config.rootPath, config.filePath, config.content);
    const payload = await this.runOneShotRuntime(resolution, {
      command: 'format-document',
      rootPath: config.rootPath,
      projectRoot: resolution.projectRoot,
      filePath: config.filePath,
      language: config.language ?? inferLanguageFromPath(config.filePath),
      content,
      settings: resolution.mergedSettings,
      options: {
        tabSize: config.tabSize,
        insertSpaces: config.insertSpaces,
      },
    });
    const response = unwrapRuntimePayload(payload);
    const textEdits = normalizeTextEdits(response.edits, config.filePath);
    if (textEdits.length > 0) {
      return textEdits;
    }

    if (typeof response.content === 'string') {
      return createFullDocumentEdit(config.filePath, content, response.content);
    }

    return [];
  }

  async lintDocument(config: {
    rootPath: string;
    filePath: string;
    language?: string;
    content?: string;
    workspacePluginSettings?: WorkspacePluginSettings;
  }): Promise<CodePaneDiagnostic[] | null> {
    const resolution = await this.resolveCapability('linter', {
      rootPath: config.rootPath,
      filePath: config.filePath,
      language: config.language,
      workspacePluginSettings: config.workspacePluginSettings,
    });
    if (!resolution) {
      return null;
    }

    const content = await this.resolveDocumentContent(config.rootPath, config.filePath, config.content);
    const payload = await this.runOneShotRuntime(resolution, {
      command: 'lint-document',
      rootPath: config.rootPath,
      projectRoot: resolution.projectRoot,
      filePath: config.filePath,
      language: config.language ?? inferLanguageFromPath(config.filePath),
      content,
      settings: resolution.mergedSettings,
    });
    const response = unwrapRuntimePayload(payload);
    return normalizeDiagnostics(response.diagnostics, {
      defaultFilePath: config.filePath,
      owner: resolution.pluginId,
    });
  }

  async listTests(config: {
    rootPath: string;
    activeFilePath?: string | null;
    workspacePluginSettings?: WorkspacePluginSettings;
  }): Promise<PluginRuntimeTestItem[] | null> {
    const resolution = await this.resolveCapability('test-provider', {
      rootPath: config.rootPath,
      filePath: config.activeFilePath ?? undefined,
      language: config.activeFilePath ? inferLanguageFromPath(config.activeFilePath) : undefined,
      workspacePluginSettings: config.workspacePluginSettings,
    });
    if (!resolution) {
      return null;
    }

    const payload = await this.runOneShotRuntime(resolution, {
      command: 'list-tests',
      rootPath: config.rootPath,
      projectRoot: resolution.projectRoot,
      activeFilePath: config.activeFilePath ?? null,
      language: config.activeFilePath ? inferLanguageFromPath(config.activeFilePath) : undefined,
      settings: resolution.mergedSettings,
    });
    const response = unwrapRuntimePayload(payload);
    return normalizePluginRuntimeTestItems(response.items ?? response.tests);
  }

  async createDebugDriver(config: {
    rootPath: string;
    target: ResolvedCodeRunTarget;
    breakpoints: Parameters<DebugDriver['applyBreakpoints']>[0];
    exceptionBreakpoints: Parameters<DebugDriver['applyExceptionBreakpoints']>[0];
    callbacks: DebugDriverCallbacks;
    workspacePluginSettings?: WorkspacePluginSettings;
  }): Promise<DebugDriver | null> {
    const resolution = await this.resolveCapability('debug-adapter', {
      rootPath: config.rootPath,
      filePath: config.target.filePath,
      language: config.target.languageId,
      workspacePluginSettings: config.workspacePluginSettings,
    });
    if (!resolution) {
      return null;
    }

    return new PluginDebugDriver({
      adapterType: resolution.capability.adapterType,
      pluginId: resolution.pluginId,
      projectRoot: resolution.projectRoot,
      target: config.target,
      breakpoints: config.breakpoints,
      exceptionBreakpoints: config.exceptionBreakpoints,
      callbacks: config.callbacks,
      emitRuntimeState: (state, message) => {
        this.emitRuntimeStateChange(resolution, state, message);
      },
      spawnRuntime: async () => await this.spawnRuntime(resolution),
    });
  }

  async resetSessions(_pluginId?: string): Promise<void> {
    // One-shot runtimes do not keep background sessions.
  }

  private async resolveCapability<TType extends RuntimeCapabilityType>(
    type: TType,
    config: {
      rootPath: string;
      filePath?: string;
      language?: string;
      workspacePluginSettings?: WorkspacePluginSettings;
    },
  ): Promise<ResolvedRuntimeCapability<TType> | null> {
    const resolution = await this.capabilityResolver.resolve({
      type,
      language: config.language,
      filePath: config.filePath,
      workspacePluginSettings: config.workspacePluginSettings,
    });
    if (!resolution) {
      return null;
    }

    const registry = await this.registryStore.readRegistry();
    const projectRoot = config.rootPath;
    const settings = await resolvePluginSettings({
      pluginId: resolution.pluginId,
      manifest: resolution.manifest,
      projectRoot,
      registry,
      workspacePluginSettings: config.workspacePluginSettings,
    });

    return {
      ...resolution,
      capability: resolution.capability as RuntimeCapability<TType>,
      registry,
      projectRoot,
      ...settings,
    };
  }

  private async resolveDocumentContent(rootPath: string, filePath: string, content?: string): Promise<string> {
    if (typeof content === 'string') {
      return content;
    }

    const response = await this.codeFileService.readFile({
      rootPath,
      filePath,
    });
    return response.isBinary ? '' : response.content;
  }

  private async runOneShotRuntime<TType extends 'formatter' | 'linter' | 'test-provider'>(
    resolution: ResolvedRuntimeCapability<TType>,
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.emitRuntimeStateChange(resolution, 'starting');
    const spawned = await this.spawnRuntime(resolution);
    this.emitRuntimeStateChange(resolution, 'running');

    try {
      const response = await executeOneShotRuntime(spawned, request);
      this.emitRuntimeStateChange(resolution, 'stopped');
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitRuntimeStateChange(resolution, 'error', message);
      throw error;
    }
  }

  private async spawnRuntime<TType extends RuntimeCapabilityType>(
    resolution: ResolvedRuntimeCapability<TType>,
  ): Promise<SpawnedRuntimeProcess> {
    const adapter = this.runtimeAdapters.find((candidate) => candidate.supports(resolution.capability.runtime));
    if (!adapter) {
      throw new Error(`No runtime adapter is available for ${resolution.capability.runtime.type}`);
    }

    const workspaceStoragePath = await ensureWorkspaceStoragePath(
      this.runtimeRootPath,
      resolution.pluginId,
      resolution.projectRoot,
    );

    return await adapter.spawn(resolution.capability.runtime, {
      pluginId: resolution.pluginId,
      pluginInstallPath: resolution.record.installPath,
      projectRoot: resolution.projectRoot,
      workspaceStoragePath,
      settings: resolution.mergedSettings,
      runtimeRootPath: this.runtimeRootPath,
    });
  }

  private emitRuntimeStateChange<TType extends RuntimeCapabilityType>(
    resolution: ResolvedRuntimeCapability<TType>,
    state: PluginRuntimeStateChangedPayload['state'],
    message?: string,
  ): void {
    this.emitRuntimeState?.({
      pluginId: resolution.pluginId,
      projectRoot: resolution.projectRoot,
      state,
      ...(message ? { message } : {}),
      timestamp: this.now(),
    });
  }
}

async function executeOneShotRuntime(
  spawned: SpawnedRuntimeProcess,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const completion = new Promise<{ exitCode: number | null }>((resolve, reject) => {
    spawned.child.on('error', reject);
    spawned.child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString('utf8'));
    });
    spawned.child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString('utf8'));
    });
    spawned.child.on('close', (exitCode) => {
      resolve({ exitCode });
    });
  });

  spawned.child.stdin.write(`${JSON.stringify(request)}\n`);
  spawned.child.stdin.end();

  const { exitCode } = await completion;
  const stdout = stdoutChunks.join('').trim();
  const stderr = stderrChunks.join('').trim();
  const parsed = parseJsonObject(stdout);

  if (parsed) {
    const runtimeError = extractRuntimeError(parsed);
    if (runtimeError) {
      throw new Error(runtimeError);
    }

    return parsed;
  }

  if (exitCode === 0 && !stdout) {
    return {};
  }

  const errorParts = [
    `Plugin runtime exited with code ${exitCode ?? 'unknown'}`,
    stderr || stdout,
  ].filter(Boolean);
  throw new Error(errorParts.join(': '));
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const parsed = JSON.parse(lines[index]) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}

function extractRuntimeError(payload: Record<string, unknown>): string | null {
  if (payload.success === false && typeof payload.error === 'string') {
    return payload.error;
  }

  if (payload.ok === false && typeof payload.error === 'string') {
    return payload.error;
  }

  return typeof payload.error === 'string' && !('edits' in payload) && !('diagnostics' in payload) && !('items' in payload) && !('tests' in payload) && !('content' in payload)
    ? payload.error
    : null;
}

function unwrapRuntimePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result = payload.result;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }

  return payload;
}

function normalizeTextEdits(edits: unknown, defaultFilePath: string): CodePaneTextEdit[] {
  if (!Array.isArray(edits)) {
    return [];
  }

  return edits
    .map((edit) => normalizeTextEdit(edit, defaultFilePath))
    .filter((edit): edit is CodePaneTextEdit => Boolean(edit));
}

function normalizeTextEdit(value: unknown, defaultFilePath: string): CodePaneTextEdit | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const range = normalizeRange(candidate.range);
  if (!range) {
    return null;
  }

  return {
    filePath: typeof candidate.filePath === 'string' && candidate.filePath.length > 0
      ? candidate.filePath
      : defaultFilePath,
    range,
    newText: typeof candidate.newText === 'string' ? candidate.newText : '',
  };
}

function normalizeDiagnostics(
  diagnostics: unknown,
  config: {
    defaultFilePath: string;
    owner: string;
  },
): CodePaneDiagnostic[] {
  if (!Array.isArray(diagnostics)) {
    return [];
  }

  return diagnostics
    .map((diagnostic) => normalizeDiagnostic(diagnostic, config))
    .filter((diagnostic): diagnostic is CodePaneDiagnostic => Boolean(diagnostic));
}

function normalizeDiagnostic(
  value: unknown,
  config: {
    defaultFilePath: string;
    owner: string;
  },
): CodePaneDiagnostic | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const range = normalizeRange(candidate.range) ?? normalizeRange(candidate);
  if (!range) {
    return null;
  }

  return {
    filePath: typeof candidate.filePath === 'string' && candidate.filePath.length > 0
      ? candidate.filePath
      : config.defaultFilePath,
    owner: typeof candidate.owner === 'string' && candidate.owner.length > 0
      ? candidate.owner
      : config.owner,
    severity: normalizeSeverity(candidate.severity),
    message: typeof candidate.message === 'string' ? candidate.message : 'Unknown diagnostic',
    ...(typeof candidate.source === 'string' ? { source: candidate.source } : {}),
    ...(typeof candidate.code === 'string' || typeof candidate.code === 'number'
      ? { code: String(candidate.code) }
      : {}),
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn,
  };
}

function normalizeSeverity(value: unknown): CodePaneDiagnostic['severity'] {
  return value === 'hint' || value === 'info' || value === 'warning' || value === 'error'
    ? value
    : 'warning';
}

function normalizeRange(value: unknown): CodePaneRange | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const startLineNumber = toPositiveInteger(candidate.startLineNumber);
  const startColumn = toPositiveInteger(candidate.startColumn);
  const endLineNumber = toPositiveInteger(candidate.endLineNumber);
  const endColumn = toPositiveInteger(candidate.endColumn);
  if (!startLineNumber || !startColumn || !endLineNumber || !endColumn) {
    return null;
  }

  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn,
  };
}

function toPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function createFullDocumentEdit(filePath: string, currentContent: string, nextContent: string): CodePaneTextEdit[] {
  if (currentContent === nextContent) {
    return [];
  }

  const lines = currentContent.split(/\r?\n/);
  const lastLine = lines.at(-1) ?? '';
  return [{
    filePath,
    range: {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: lines.length,
      endColumn: lastLine.length + 1,
    },
    newText: nextContent,
  }];
}

function normalizePluginRuntimeTestItems(items: unknown): PluginRuntimeTestItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => normalizePluginRuntimeTestItem(item))
    .filter((item): item is PluginRuntimeTestItem => Boolean(item));
}

function normalizePluginRuntimeTestItem(value: unknown): PluginRuntimeTestItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  if ((kind !== 'file' && kind !== 'suite' && kind !== 'case') || typeof candidate.label !== 'string') {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.length > 0
      ? candidate.id
      : `${kind}:${candidate.label}`,
    label: candidate.label,
    kind,
    ...(typeof candidate.filePath === 'string' ? { filePath: candidate.filePath } : {}),
    ...(candidate.target ? { target: normalizePluginRuntimeTarget(candidate.target) } : {}),
    ...(Array.isArray(candidate.children) ? { children: normalizePluginRuntimeTestItems(candidate.children) } : {}),
  };
}

function normalizePluginRuntimeTarget(value: unknown): PluginRuntimeTargetSpec {
  const candidate = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const command = typeof candidate.command === 'string' ? candidate.command : '';
  if (!command) {
    return {
      command,
    };
  }

  return {
    command,
    ...(typeof candidate.label === 'string' ? { label: candidate.label } : {}),
    ...(typeof candidate.detail === 'string' ? { detail: candidate.detail } : {}),
    ...(candidate.kind === 'application' || candidate.kind === 'test' || candidate.kind === 'task'
      ? { kind: candidate.kind }
      : {}),
    ...(typeof candidate.languageId === 'string' ? { languageId: candidate.languageId } : {}),
    ...(typeof candidate.workingDirectory === 'string' ? { workingDirectory: candidate.workingDirectory } : {}),
    ...(typeof candidate.filePath === 'string' ? { filePath: candidate.filePath } : {}),
    ...(Array.isArray(candidate.args)
      ? { args: candidate.args.filter((arg): arg is string => typeof arg === 'string') }
      : {}),
    ...(candidate.canDebug === true ? { canDebug: true } : {}),
    ...(candidate.debugRequest === 'launch' || candidate.debugRequest === 'attach'
      ? { debugRequest: candidate.debugRequest }
      : {}),
  };
}

function inferLanguageFromPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'javascript';
    case '.py':
      return 'python';
    case '.java':
      return 'java';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.json':
      return 'json';
    default:
      return 'plaintext';
  }
}
