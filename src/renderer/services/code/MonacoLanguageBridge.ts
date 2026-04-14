import type {
  CodePaneCompletionItem,
  CodePaneDiagnostic,
  CodePaneDocumentHighlight,
  CodePaneDocumentSymbol,
  CodePaneHoverResult,
  CodePaneLocation,
  CodePaneReference,
  CodePaneSignatureHelpResult,
} from '../../../shared/types/electron-api';

type MonacoModule = typeof import('monaco-editor');
type MonacoModel = import('monaco-editor').editor.ITextModel;
type MonacoMarkerData = import('monaco-editor').editor.IMarkerData;
type MonacoRange = import('monaco-editor').IRange;
type MonacoLocation = import('monaco-editor').languages.Location;
type MonacoHover = import('monaco-editor').languages.Hover;
type MonacoProviderResult<T> = import('monaco-editor').languages.ProviderResult<T>;
type MonacoDocumentSymbol = import('monaco-editor').languages.DocumentSymbol;
type MonacoDocumentHighlight = import('monaco-editor').languages.DocumentHighlight;
type MonacoCompletionItem = import('monaco-editor').languages.CompletionItem;
type MonacoSignatureHelp = import('monaco-editor').languages.SignatureHelp;
type MonacoDocumentContext = {
  paneId: string;
  rootPath: string;
  filePath: string;
  language: string;
  model: MonacoModel;
};

const LANGUAGE_PLUGIN_MARKER_OWNER = 'language-plugin';

let bridgeRegistry = new Map<MonacoModule, MonacoLanguageBridge>();

export class MonacoLanguageBridge {
  private readonly monaco: MonacoModule;
  private readonly contextsByModel = new Map<MonacoModel, MonacoDocumentContext>();
  private readonly diagnosticsByFilePath = new Map<string, CodePaneDiagnostic[]>();
  private readonly registeredLanguages = new Set<string>();
  private readonly providerDisposables: Array<{ dispose: () => void }> = [];
  private diagnosticsListenerRegistered = false;

  constructor(monaco: MonacoModule) {
    this.monaco = monaco;
    this.ensureDiagnosticsListener();
  }

  openDocument(context: MonacoDocumentContext): void {
    this.contextsByModel.set(context.model, normalizeContext(context));
    this.ensureProviders(context.language);
    this.applyCachedDiagnostics(context.model, context.filePath);
    void this.sendDocumentSync('codePaneDidOpenDocument', context);
  }

  async changeDocument(context: MonacoDocumentContext): Promise<void> {
    this.contextsByModel.set(context.model, normalizeContext(context));
    this.ensureProviders(context.language);
    this.applyCachedDiagnostics(context.model, context.filePath);
    await this.sendDocumentSync('codePaneDidChangeDocument', context);
  }

  async saveDocument(context: MonacoDocumentContext): Promise<void> {
    this.contextsByModel.set(context.model, normalizeContext(context));
    await this.sendDocumentSync('codePaneDidSaveDocument', context);
  }

  async closeDocument(context: MonacoDocumentContext): Promise<void> {
    this.contextsByModel.delete(context.model);
    this.monaco.editor.setModelMarkers(context.model, LANGUAGE_PLUGIN_MARKER_OWNER, []);
    await this.sendDocumentClose(context);
  }

  dispose(): void {
    if (this.diagnosticsListenerRegistered) {
      window.electronAPI.offCodePaneDiagnosticsChanged(this.handleDiagnosticsChanged);
      this.diagnosticsListenerRegistered = false;
    }

    for (const disposable of this.providerDisposables) {
      disposable.dispose();
    }

    this.providerDisposables.length = 0;
    this.registeredLanguages.clear();
    this.contextsByModel.clear();
    this.diagnosticsByFilePath.clear();
  }

  private ensureDiagnosticsListener(): void {
    if (this.diagnosticsListenerRegistered) {
      return;
    }

    window.electronAPI.onCodePaneDiagnosticsChanged(this.handleDiagnosticsChanged);
    this.diagnosticsListenerRegistered = true;
  }

  private readonly handleDiagnosticsChanged = (_event: unknown, payload: {
    filePath: string;
    diagnostics: CodePaneDiagnostic[];
  }) => {
    this.diagnosticsByFilePath.set(payload.filePath, payload.diagnostics);

    for (const context of this.contextsByModel.values()) {
      if (context.filePath === payload.filePath) {
        this.applyDiagnostics(context.model, payload.diagnostics);
      }
    }
  };

  private applyCachedDiagnostics(model: MonacoModel, filePath: string): void {
    this.applyDiagnostics(model, this.diagnosticsByFilePath.get(filePath) ?? []);
  }

  private applyDiagnostics(model: MonacoModel, diagnostics: CodePaneDiagnostic[]): void {
    this.monaco.editor.setModelMarkers(
      model,
      LANGUAGE_PLUGIN_MARKER_OWNER,
      diagnostics.map((diagnostic) => toMonacoMarker(this.monaco, diagnostic)),
    );
  }

  private ensureProviders(language: string): void {
    const normalizedLanguage = normalizeLanguage(language);
    if (!normalizedLanguage || this.registeredLanguages.has(normalizedLanguage)) {
      return;
    }

    this.registeredLanguages.add(normalizedLanguage);

    this.providerDisposables.push(
      this.monaco.languages.registerDefinitionProvider(normalizedLanguage, {
        provideDefinition: async (model, position) => (
          await this.provideDefinitions(model, position.lineNumber, position.column)
        ),
      }),
    );

    this.providerDisposables.push(
      this.monaco.languages.registerHoverProvider(normalizedLanguage, {
        provideHover: async (model, position) => (
          await this.provideHover(model, position.lineNumber, position.column)
        ),
      }),
    );

    this.providerDisposables.push(
      this.monaco.languages.registerReferenceProvider(normalizedLanguage, {
        provideReferences: async (model, position) => (
          await this.provideReferences(model, position.lineNumber, position.column)
        ),
      }),
    );

    this.providerDisposables.push(
      this.monaco.languages.registerDocumentHighlightProvider(normalizedLanguage, {
        provideDocumentHighlights: async (model, position) => (
          await this.provideDocumentHighlights(model, position.lineNumber, position.column)
        ),
      }),
    );

    this.providerDisposables.push(
      this.monaco.languages.registerDocumentSymbolProvider(normalizedLanguage, {
        provideDocumentSymbols: async (model) => (
          await this.provideDocumentSymbols(model)
        ),
      }),
    );

    this.providerDisposables.push(
      this.monaco.languages.registerImplementationProvider(normalizedLanguage, {
        provideImplementation: async (model, position) => (
          await this.provideImplementations(model, position.lineNumber, position.column)
        ),
      }),
    );

    this.providerDisposables.push(
      this.monaco.languages.registerCompletionItemProvider(normalizedLanguage, {
        triggerCharacters: ['.', ':', '>', '"', '\'', '/', '@'],
        provideCompletionItems: async (model, position, _context) => ({
          suggestions: await this.provideCompletionItems(model, position.lineNumber, position.column),
        }),
      }),
    );

    this.providerDisposables.push(
      this.monaco.languages.registerSignatureHelpProvider(normalizedLanguage, {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp: async (model, position) => {
          const value = await this.provideSignatureHelp(model, position.lineNumber, position.column);
          return value ? { value, dispose: () => {} } : null;
        },
      }),
    );
  }

  private async provideDefinitions(
    model: MonacoModel,
    lineNumber: number,
    column: number,
  ): Promise<MonacoProviderResult<MonacoLocation[]>> {
    const context = this.contextsByModel.get(model);
    if (!context) {
      return [];
    }

    const response = await window.electronAPI.codePaneGetDefinition({
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber,
        column,
      },
    });

    if (!response.success) {
      return [];
    }

    return (response.data ?? []).map((location) => toMonacoLocation(this.monaco, location));
  }

  private async provideHover(
    model: MonacoModel,
    lineNumber: number,
    column: number,
  ): Promise<MonacoProviderResult<MonacoHover>> {
    const context = this.contextsByModel.get(model);
    if (!context) {
      return null;
    }

    const response = await window.electronAPI.codePaneGetHover({
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber,
        column,
      },
    });

    if (!response.success || !response.data) {
      return null;
    }

    return toMonacoHover(response.data);
  }

  private async provideReferences(
    model: MonacoModel,
    lineNumber: number,
    column: number,
  ): Promise<MonacoProviderResult<MonacoLocation[]>> {
    const context = this.contextsByModel.get(model);
    if (!context) {
      return [];
    }

    const response = await window.electronAPI.codePaneGetReferences({
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber,
        column,
      },
    });

    if (!response.success) {
      return [];
    }

    return (response.data ?? []).map((reference) => toMonacoReference(this.monaco, reference));
  }

  private async provideDocumentHighlights(
    model: MonacoModel,
    lineNumber: number,
    column: number,
  ): Promise<MonacoProviderResult<MonacoDocumentHighlight[]>> {
    const context = this.contextsByModel.get(model);
    if (!context) {
      return [];
    }

    const response = await window.electronAPI.codePaneGetDocumentHighlights({
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber,
        column,
      },
    });

    if (!response.success) {
      return [];
    }

    return (response.data ?? []).map((highlight) => toMonacoDocumentHighlight(this.monaco, highlight));
  }

  private async provideDocumentSymbols(
    model: MonacoModel,
  ): Promise<MonacoProviderResult<MonacoDocumentSymbol[]>> {
    const context = this.contextsByModel.get(model);
    if (!context) {
      return [];
    }

    const response = await window.electronAPI.codePaneGetDocumentSymbols({
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
    });

    if (!response.success) {
      return [];
    }

    return (response.data ?? []).map((symbol) => toMonacoDocumentSymbol(symbol));
  }

  private async provideImplementations(
    model: MonacoModel,
    lineNumber: number,
    column: number,
  ): Promise<MonacoProviderResult<MonacoLocation[]>> {
    const context = this.contextsByModel.get(model);
    if (!context) {
      return [];
    }

    const response = await window.electronAPI.codePaneGetImplementations({
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber,
        column,
      },
    });

    if (!response.success) {
      return [];
    }

    return (response.data ?? []).map((location) => toMonacoLocation(this.monaco, location));
  }

  private async provideCompletionItems(
    model: MonacoModel,
    lineNumber: number,
    column: number,
  ): Promise<MonacoCompletionItem[]> {
    const context = this.contextsByModel.get(model);
    if (!context) {
      return [];
    }

    const response = await window.electronAPI.codePaneGetCompletionItems({
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber,
        column,
      },
      triggerKind: 1,
    });

    if (!response.success) {
      return [];
    }

    const defaultRange = createInlineRange(model, lineNumber, column);
    return (response.data ?? []).map((item) => toMonacoCompletionItem(item, defaultRange));
  }

  private async provideSignatureHelp(
    model: MonacoModel,
    lineNumber: number,
    column: number,
  ): Promise<MonacoSignatureHelp | null> {
    const context = this.contextsByModel.get(model);
    if (!context) {
      return null;
    }

    const response = await window.electronAPI.codePaneGetSignatureHelp({
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
      position: {
        lineNumber,
        column,
      },
    });

    if (!response.success || !response.data) {
      return null;
    }

    return toMonacoSignatureHelp(response.data);
  }

  private async sendDocumentSync(
    method: 'codePaneDidOpenDocument' | 'codePaneDidChangeDocument' | 'codePaneDidSaveDocument',
    context: MonacoDocumentContext,
  ): Promise<void> {
    const response = await window.electronAPI[method]({
      paneId: context.paneId,
      rootPath: context.rootPath,
      filePath: context.filePath,
      language: context.language,
      content: context.model.getValue(),
    });

    if (!response.success) {
      console.warn(`[MonacoLanguageBridge] ${method} failed: ${response.error ?? 'unknown error'}`);
    }
  }

  private async sendDocumentClose(context: MonacoDocumentContext): Promise<void> {
    const response = await window.electronAPI.codePaneDidCloseDocument({
      paneId: context.paneId,
      rootPath: context.rootPath,
      filePath: context.filePath,
    });

    if (!response.success) {
      console.warn(`[MonacoLanguageBridge] codePaneDidCloseDocument failed: ${response.error ?? 'unknown error'}`);
    }
  }
}

export function ensureMonacoLanguageBridge(monaco: MonacoModule): MonacoLanguageBridge {
  const existingBridge = bridgeRegistry.get(monaco);
  if (existingBridge) {
    return existingBridge;
  }

  const bridge = new MonacoLanguageBridge(monaco);
  bridgeRegistry.set(monaco, bridge);
  return bridge;
}

export function resetMonacoLanguageBridgeForTests(): void {
  for (const bridge of bridgeRegistry.values()) {
    bridge.dispose();
  }

  bridgeRegistry = new Map();
}

function normalizeContext(context: MonacoDocumentContext): MonacoDocumentContext {
  return {
    ...context,
    language: normalizeLanguage(context.language),
  };
}

function normalizeLanguage(language: string): string {
  return language || 'plaintext';
}

function toMonacoLocation(monaco: MonacoModule, location: CodePaneLocation): MonacoLocation {
  return {
    uri: location.uri ? monaco.Uri.parse(location.uri) : monaco.Uri.file(location.filePath),
    range: toMonacoRange(location.range),
  };
}

function toMonacoReference(monaco: MonacoModule, reference: CodePaneReference): MonacoLocation {
  return {
    uri: monaco.Uri.file(reference.filePath),
    range: toMonacoRange(reference.range),
  };
}

function toMonacoDocumentHighlight(
  monaco: MonacoModule,
  highlight: CodePaneDocumentHighlight,
): MonacoDocumentHighlight {
  return {
    range: toMonacoRange(highlight.range),
    kind: mapDocumentHighlightKind(monaco, highlight.kind),
  };
}

function toMonacoHover(result: CodePaneHoverResult): MonacoHover {
  return {
    contents: result.contents.map((item) => ({
      value: item.kind === 'markdown' ? item.value : escapeMarkdown(item.value),
    })),
    ...(result.range ? { range: toMonacoRange(result.range) } : {}),
  };
}

function toMonacoMarker(monaco: MonacoModule, diagnostic: CodePaneDiagnostic): MonacoMarkerData {
  return {
    severity: mapDiagnosticSeverity(monaco, diagnostic.severity),
    message: diagnostic.message,
    source: diagnostic.source,
    code: diagnostic.code,
    startLineNumber: diagnostic.startLineNumber,
    startColumn: diagnostic.startColumn,
    endLineNumber: diagnostic.endLineNumber,
    endColumn: diagnostic.endColumn,
  };
}

function mapDiagnosticSeverity(
  monaco: MonacoModule,
  severity: CodePaneDiagnostic['severity'],
): number {
  switch (severity) {
    case 'error':
      return monaco.MarkerSeverity.Error;
    case 'warning':
      return monaco.MarkerSeverity.Warning;
    case 'info':
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Hint;
  }
}

function toMonacoDocumentSymbol(symbol: CodePaneDocumentSymbol): MonacoDocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail ?? '',
    kind: symbol.kind as unknown as MonacoDocumentSymbol['kind'],
    range: toMonacoRange(symbol.range),
    selectionRange: toMonacoRange(symbol.selectionRange),
    children: (symbol.children ?? []).map((child) => toMonacoDocumentSymbol(child)),
    tags: [],
  };
}

function toMonacoCompletionItem(item: CodePaneCompletionItem, defaultRange: MonacoRange): MonacoCompletionItem {
  const completionItem: MonacoCompletionItem = {
    label: item.label,
    kind: item.kind as MonacoCompletionItem['kind'],
    insertText: item.insertText ?? item.label,
    range: item.range ? toMonacoRange(item.range) : defaultRange,
  };

  if (item.detail) {
    completionItem.detail = item.detail;
  }
  if (item.documentation) {
    completionItem.documentation = item.documentation;
  }
  if (item.filterText) {
    completionItem.filterText = item.filterText;
  }
  if (item.sortText) {
    completionItem.sortText = item.sortText;
  }
  if (item.range) {
    completionItem.range = toMonacoRange(item.range);
  }

  return completionItem;
}

function toMonacoSignatureHelp(result: CodePaneSignatureHelpResult): MonacoSignatureHelp {
  return {
    signatures: result.signatures.map((signature) => ({
      label: signature.label,
      documentation: signature.documentation,
      parameters: (signature.parameters ?? []).map((parameter) => ({
        label: parameter.label,
        documentation: parameter.documentation,
      })),
    })),
    activeSignature: result.activeSignature ?? 0,
    activeParameter: result.activeParameter ?? 0,
  };
}

function toMonacoRange(range: MonacoRange): MonacoRange {
  return {
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn,
  };
}

function mapDocumentHighlightKind(
  monaco: MonacoModule,
  kind?: CodePaneDocumentHighlight['kind'],
): MonacoDocumentHighlight['kind'] {
  switch (kind) {
    case 'read':
      return monaco.languages.DocumentHighlightKind.Read;
    case 'write':
      return monaco.languages.DocumentHighlightKind.Write;
    case 'text':
    default:
      return monaco.languages.DocumentHighlightKind.Text;
  }
}

function createInlineRange(model: MonacoModel, lineNumber: number, column: number): MonacoRange {
  const wordUntilPosition = model.getWordUntilPosition?.({ lineNumber, column });
  if (wordUntilPosition) {
    return {
      startLineNumber: lineNumber,
      startColumn: wordUntilPosition.startColumn,
      endLineNumber: lineNumber,
      endColumn: wordUntilPosition.endColumn,
    };
  }

  const word = model.getWordAtPosition({ lineNumber, column });
  if (word) {
    return {
      startLineNumber: lineNumber,
      startColumn: word.startColumn,
      endLineNumber: lineNumber,
      endColumn: word.endColumn,
    };
  }

  return {
    startLineNumber: lineNumber,
    startColumn: column,
    endLineNumber: lineNumber,
    endColumn: column,
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
}
