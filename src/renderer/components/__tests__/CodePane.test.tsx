import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodePane } from '../CodePane';
import type {
  CodePaneFsChangedPayload,
  CodePaneIndexProgressPayload,
  CodePaneLanguageWorkspaceChangedPayload,
} from '../../../shared/types/electron-api';
import { resetMonacoLanguageBridgeForTests } from '../../services/code/MonacoLanguageBridge';
import type { Pane } from '../../types/window';
import { WindowStatus } from '../../types/window';

type UpdatePaneFn = (windowId: string, paneId: string, updates: Partial<Pane>) => void;
type ChangeListener = () => void;

const hoisted = vi.hoisted(() => ({
  ensureMonacoEnvironmentMock: vi.fn(),
  setLanguage: vi.fn(),
  t: (key: string) => key,
  updatePaneSpy: vi.fn(),
}));

let updatePaneImpl: UpdatePaneFn | null = null;

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector: (state: { updatePane: UpdatePaneFn }) => unknown) => selector({
    updatePane: hoisted.updatePaneSpy,
  }),
}));

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    t: hoisted.t,
    language: 'en-US',
    setLanguage: hoisted.setLanguage,
  }),
}));

vi.mock('../ui/AppTooltip', () => ({
  AppTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

class FakeModel {
  private listeners = new Set<ChangeListener>();

  constructor(
    private value: string,
    private language: string,
    readonly uri: { path: string },
  ) {}

  onDidChangeContent(listener: ChangeListener) {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  getLanguageId() {
    return this.language;
  }

  setLanguage(language: string) {
    this.language = language;
  }

  getValue() {
    return this.value;
  }

  getWordAtPosition(position: { lineNumber: number; column: number }) {
    const lines = this.value.split('\n');
    const line = lines[position.lineNumber - 1] ?? '';
    const index = Math.max(position.column - 1, 0);
    if (index >= line.length) {
      return null;
    }

    const isWordCharacter = (character: string) => /[A-Za-z0-9_$]/.test(character);
    if (!isWordCharacter(line[index] ?? '')) {
      return null;
    }

    let start = index;
    let end = index;
    while (start > 0 && isWordCharacter(line[start - 1] ?? '')) {
      start -= 1;
    }
    while (end < line.length && isWordCharacter(line[end] ?? '')) {
      end += 1;
    }

    return {
      word: line.slice(start, end),
      startColumn: start + 1,
      endColumn: end + 1,
    };
  }

  setValue(value: string) {
    this.value = value;
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }

  dispose() {
    this.listeners.clear();
  }
}

function createFakeEditor() {
  let model: FakeModel | null = null;
  let position = { lineNumber: 1, column: 1 };
  const mouseDownListeners = new Set<(event: any) => void>();
  const mouseMoveListeners = new Set<(event: any) => void>();
  const mouseLeaveListeners = new Set<() => void>();
  let decorationIds: string[] = [];

  return {
    addCommand: vi.fn(),
    deltaDecorations: vi.fn((oldDecorations: string[], newDecorations: Array<{ range: unknown }>) => {
      decorationIds = newDecorations.map((_, index) => `decoration-${index + 1}`);
      return decorationIds;
    }),
    dispose: vi.fn(),
    focus: vi.fn(),
    getPosition: vi.fn(() => position),
    onMouseDown: vi.fn((listener: (event: any) => void) => {
      mouseDownListeners.add(listener);
      return {
        dispose: () => {
          mouseDownListeners.delete(listener);
        },
      };
    }),
    onMouseMove: vi.fn((listener: (event: any) => void) => {
      mouseMoveListeners.add(listener);
      return {
        dispose: () => {
          mouseMoveListeners.delete(listener);
        },
      };
    }),
    onMouseLeave: vi.fn((listener: () => void) => {
      mouseLeaveListeners.add(listener);
      return {
        dispose: () => {
          mouseLeaveListeners.delete(listener);
        },
      };
    }),
    revealLineInCenter: vi.fn(),
    restoreViewState: vi.fn(),
    saveViewState: vi.fn(() => null),
    setPosition: vi.fn((nextPosition: { lineNumber: number; column: number }) => {
      position = nextPosition;
    }),
    setSelection: vi.fn(),
    updateOptions: vi.fn(),
    setModel: vi.fn((nextModel: FakeModel | null) => {
      model = nextModel;
      fakeMonacoState.lastEditorModel = nextModel;
    }),
    getModel: () => model,
    fireMouseDown: (event: any) => {
      for (const listener of Array.from(mouseDownListeners)) {
        listener(event);
      }
    },
    fireMouseMove: (event: any) => {
      for (const listener of Array.from(mouseMoveListeners)) {
        listener(event);
      }
    },
    fireMouseLeave: () => {
      for (const listener of Array.from(mouseLeaveListeners)) {
        listener();
      }
    },
  };
}

function createFakeDiffEditor() {
  const modifiedEditor = createFakeEditor();

  return {
    dispose: vi.fn(),
    getModifiedEditor: () => modifiedEditor,
    setModel: vi.fn((models: { original: FakeModel; modified: FakeModel }) => {
      fakeMonacoState.lastDiffModel = models;
      modifiedEditor.setModel(models.modified);
    }),
  };
}

const fakeMonacoState = {
  lastDiffModel: null as { original: FakeModel; modified: FakeModel } | null,
  lastEditorModel: null as FakeModel | null,
  definitionProviders: new Map<string, { provideDefinition: (...args: any[]) => Promise<unknown> }>(),
  hoverProviders: new Map<string, { provideHover: (...args: any[]) => Promise<unknown> }>(),
  referenceProviders: new Map<string, { provideReferences: (...args: any[]) => Promise<unknown> }>(),
  documentHighlightProviders: new Map<string, { provideDocumentHighlights: (...args: any[]) => Promise<unknown> }>(),
  documentSymbolProviders: new Map<string, { provideDocumentSymbols: (...args: any[]) => Promise<unknown> }>(),
  implementationProviders: new Map<string, { provideImplementation: (...args: any[]) => Promise<unknown> }>(),
  completionProviders: new Map<string, { provideCompletionItems: (...args: any[]) => Promise<unknown> }>(),
  signatureHelpProviders: new Map<string, { provideSignatureHelp: (...args: any[]) => Promise<unknown> }>(),
  markerListeners: new Set<() => void>(),
  markersByPath: new Map<string, Map<string, Array<{
    severity: number;
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber?: number;
    endColumn?: number;
  }>>>(),
  models: new Map<string, FakeModel>(),
  setMarkers(
    path: string,
    markers: Array<{
      severity: number;
      message: string;
      startLineNumber: number;
      startColumn: number;
      endLineNumber?: number;
      endColumn?: number;
    }>,
    owner = '__test__',
  ) {
    const markersByOwner = this.markersByPath.get(path) ?? new Map();
    markersByOwner.set(owner, markers);
    this.markersByPath.set(path, markersByOwner);
    for (const listener of Array.from(this.markerListeners)) {
      listener();
    }
  },
  getMarkers(path: string) {
    return Array.from(this.markersByPath.get(path)?.values() ?? []).flat();
  },
  reset() {
    this.lastDiffModel = null;
    this.lastEditorModel = null;
    this.definitionProviders.clear();
    this.hoverProviders.clear();
    this.referenceProviders.clear();
    this.documentHighlightProviders.clear();
    this.documentSymbolProviders.clear();
    this.implementationProviders.clear();
    this.completionProviders.clear();
    this.signatureHelpProviders.clear();
    this.markerListeners.clear();
    this.markersByPath.clear();
    this.models.clear();
  },
};

const fakeMonaco = {
  MarkerSeverity: {
    Hint: 1,
    Info: 2,
    Warning: 4,
    Error: 8,
  },
  languages: {
    DocumentHighlightKind: {
      Text: 0,
      Read: 1,
      Write: 2,
    },
    registerDefinitionProvider: vi.fn((language: string, provider: { provideDefinition: (...args: any[]) => Promise<unknown> }) => {
      fakeMonacoState.definitionProviders.set(language, provider);
      return { dispose: vi.fn() };
    }),
    registerHoverProvider: vi.fn((language: string, provider: { provideHover: (...args: any[]) => Promise<unknown> }) => {
      fakeMonacoState.hoverProviders.set(language, provider);
      return { dispose: vi.fn() };
    }),
    registerReferenceProvider: vi.fn((language: string, provider: { provideReferences: (...args: any[]) => Promise<unknown> }) => {
      fakeMonacoState.referenceProviders.set(language, provider);
      return { dispose: vi.fn() };
    }),
    registerDocumentHighlightProvider: vi.fn((language: string, provider: { provideDocumentHighlights: (...args: any[]) => Promise<unknown> }) => {
      fakeMonacoState.documentHighlightProviders.set(language, provider);
      return { dispose: vi.fn() };
    }),
    registerDocumentSymbolProvider: vi.fn((language: string, provider: { provideDocumentSymbols: (...args: any[]) => Promise<unknown> }) => {
      fakeMonacoState.documentSymbolProviders.set(language, provider);
      return { dispose: vi.fn() };
    }),
    registerImplementationProvider: vi.fn((language: string, provider: { provideImplementation: (...args: any[]) => Promise<unknown> }) => {
      fakeMonacoState.implementationProviders.set(language, provider);
      return { dispose: vi.fn() };
    }),
    registerCompletionItemProvider: vi.fn((language: string, provider: { provideCompletionItems: (...args: any[]) => Promise<unknown> }) => {
      fakeMonacoState.completionProviders.set(language, provider);
      return { dispose: vi.fn() };
    }),
    registerSignatureHelpProvider: vi.fn((language: string, provider: { provideSignatureHelp: (...args: any[]) => Promise<unknown> }) => {
      fakeMonacoState.signatureHelpProviders.set(language, provider);
      return { dispose: vi.fn() };
    }),
  },
  KeyCode: {
    KeyS: 49,
    KeyF: 33,
    F2: 60,
    F12: 70,
  },
  KeyMod: {
    CtrlCmd: 2048,
    Shift: 1024,
    Alt: 512,
  },
  Uri: {
    file: (path: string) => ({ path }),
    parse: (value: string) => ({
      path: decodeURIComponent(value.split('://')[1] ?? value),
    }),
  },
  editor: {
    create: vi.fn(() => createFakeEditor()),
    createDiffEditor: vi.fn(() => createFakeDiffEditor()),
    createModel: vi.fn((content: string, language: string, uri: { path: string }) => {
      const model = new FakeModel(content, language, uri);
      fakeMonacoState.models.set(uri.path, model);
      return model;
    }),
    setModelLanguage: vi.fn((model: FakeModel, language: string) => {
      model.setLanguage(language);
    }),
    setModelMarkers: vi.fn((model: FakeModel, owner: string, markers: Array<{
      severity: number;
      message: string;
      startLineNumber: number;
      startColumn: number;
      endLineNumber?: number;
      endColumn?: number;
    }>) => {
      fakeMonacoState.setMarkers(model.uri.path, markers, owner);
    }),
    getModelMarkers: vi.fn(({ resource }: { resource: { path: string } }) => (
      fakeMonacoState.getMarkers(resource.path)
    )),
    onDidChangeMarkers: vi.fn((listener: () => void) => {
      fakeMonacoState.markerListeners.add(listener);
      return {
        dispose: () => {
          fakeMonacoState.markerListeners.delete(listener);
        },
      };
    }),
  },
};

vi.mock('../../utils/monacoEnvironment', () => ({
  ensureMonacoEnvironment: hoisted.ensureMonacoEnvironmentMock,
}));

function createPane(overrides?: Partial<NonNullable<Pane['code']>>): Pane {
  const rootPath = '/workspace/project';

  return {
    id: 'pane-code-1',
    kind: 'code',
    cwd: rootPath,
    command: '',
    status: WindowStatus.Paused,
    pid: null,
    code: {
      rootPath,
      openFiles: [],
      activeFilePath: null,
      selectedPath: null,
      viewMode: 'editor',
      diffTargetPath: null,
      ...overrides,
    },
  };
}

function mergePane(current: Pane, updates: Partial<Pane>): Pane {
  return {
    ...current,
    ...updates,
    code: updates.code
      ? {
        ...current.code,
        ...updates.code,
      }
      : current.code,
  };
}

function renderCodePane(initialPane: Pane) {
  let latestPane = initialPane;

  function Harness() {
    const [pane, setPane] = React.useState(initialPane);
    latestPane = pane;
    updatePaneImpl = (_windowId, _paneId, updates) => {
      setPane((current) => mergePane(current, updates));
    };

    return (
      <CodePane
        windowId="win-code-1"
        pane={pane}
        isActive
        onActivate={vi.fn()}
        onClose={vi.fn()}
      />
    );
  }

  const view = render(<Harness />);
  return {
    ...view,
    getPane: () => latestPane,
  };
}

async function openFileFromTree(fileName: string) {
  const treeButton = await screen.findByRole('button', { name: fileName }, { timeout: 3000 });
  await act(async () => {
    fireEvent.click(treeButton);
  });
}

async function emitFsChanged(payload: CodePaneFsChangedPayload) {
  const callback = vi.mocked(window.electronAPI.onCodePaneFsChanged).mock.calls.at(-1)?.[0];
  if (!callback) {
    throw new Error('expected file system change listener to be registered');
  }

  await act(async () => {
    callback({}, payload);
    await Promise.resolve();
  });
}

async function emitDiagnosticsChanged(payload: {
  rootPath: string;
  filePath: string;
  diagnostics: Array<{
    filePath: string;
    owner: string;
    severity: 'hint' | 'info' | 'warning' | 'error';
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    source?: string;
    code?: string;
  }>;
}) {
  const callback = vi.mocked(window.electronAPI.onCodePaneDiagnosticsChanged).mock.calls.at(-1)?.[0];
  if (!callback) {
    throw new Error('expected diagnostics listener to be registered');
  }

  await act(async () => {
    callback({}, payload);
    await Promise.resolve();
  });
}

async function emitIndexProgress(payload: CodePaneIndexProgressPayload) {
  const callback = vi.mocked(window.electronAPI.onCodePaneIndexProgress).mock.calls.at(-1)?.[0];
  if (!callback) {
    throw new Error('expected index progress listener to be registered');
  }

  await act(async () => {
    callback({}, payload);
    await Promise.resolve();
  });
}

async function emitLanguageWorkspaceChanged(payload: CodePaneLanguageWorkspaceChangedPayload) {
  const callback = vi.mocked(window.electronAPI.onCodePaneLanguageWorkspaceChanged).mock.calls.at(-1)?.[0];
  if (!callback) {
    throw new Error('expected language workspace listener to be registered');
  }

  await act(async () => {
    callback({}, payload);
    await Promise.resolve();
  });
}

async function emitRunSessionChanged(payload: {
  rootPath: string;
  session: {
    id: string;
    targetId: string;
    label: string;
    detail: string;
    kind: 'application' | 'test' | 'task';
    languageId: string;
    state: 'starting' | 'running' | 'passed' | 'failed' | 'stopped';
    workingDirectory: string;
    startedAt: string;
    endedAt?: string;
    exitCode?: number | null;
  };
}) {
  const callback = vi.mocked(window.electronAPI.onCodePaneRunSessionChanged).mock.calls.at(-1)?.[0];
  if (!callback) {
    throw new Error('expected run session listener to be registered');
  }

  await act(async () => {
    callback({}, payload);
    await Promise.resolve();
  });
}

async function emitRunSessionOutput(payload: {
  rootPath: string;
  sessionId: string;
  chunk: string;
  stream: 'stdout' | 'stderr' | 'system';
}) {
  const callback = vi.mocked(window.electronAPI.onCodePaneRunSessionOutput).mock.calls.at(-1)?.[0];
  if (!callback) {
    throw new Error('expected run session output listener to be registered');
  }

  await act(async () => {
    callback({}, payload);
    await Promise.resolve();
  });
}

describe('CodePane', () => {
  beforeAll(() => {
    vi.stubGlobal('Worker', class WorkerMock {});
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    resetMonacoLanguageBridgeForTests();
    fakeMonacoState.reset();
    updatePaneImpl = null;
    hoisted.updatePaneSpy.mockReset();
    hoisted.ensureMonacoEnvironmentMock.mockReset();
    hoisted.updatePaneSpy.mockImplementation((windowId: string, paneId: string, updates: Partial<Pane>) => {
      updatePaneImpl?.(windowId, paneId, updates);
    });
    hoisted.ensureMonacoEnvironmentMock.mockImplementation(async () => fakeMonaco);

    vi.mocked(window.electronAPI.codePaneListDirectory).mockReset();
    vi.mocked(window.electronAPI.codePaneReadFile).mockReset();
    vi.mocked(window.electronAPI.codePaneWriteFile).mockReset();
    vi.mocked(window.electronAPI.codePaneGetExternalLibrarySections).mockReset();
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockReset();
    vi.mocked(window.electronAPI.codePaneGetGitRepositorySummary).mockReset();
    vi.mocked(window.electronAPI.codePaneGetGitGraph).mockReset();
    vi.mocked(window.electronAPI.codePaneReadGitBaseFile).mockReset();
    vi.mocked(window.electronAPI.codePaneWatchRoot).mockReset();
    vi.mocked(window.electronAPI.codePaneUnwatchRoot).mockReset();
    vi.mocked(window.electronAPI.codePaneSearchFiles).mockReset();
    vi.mocked(window.electronAPI.codePaneSearchContents).mockReset();
    vi.mocked(window.electronAPI.codePaneDidOpenDocument).mockReset();
    vi.mocked(window.electronAPI.codePaneDidChangeDocument).mockReset();
    vi.mocked(window.electronAPI.codePaneDidSaveDocument).mockReset();
    vi.mocked(window.electronAPI.codePaneDidCloseDocument).mockReset();
    vi.mocked(window.electronAPI.codePaneGetDefinition).mockReset();
    vi.mocked(window.electronAPI.codePaneGetHover).mockReset();
    vi.mocked(window.electronAPI.codePaneGetReferences).mockReset();
    vi.mocked(window.electronAPI.codePaneGetDocumentHighlights).mockReset();
    vi.mocked(window.electronAPI.codePaneGetDocumentSymbols).mockReset();
    vi.mocked(window.electronAPI.codePaneGetImplementations).mockReset();
    vi.mocked(window.electronAPI.codePaneGetCompletionItems).mockReset();
    vi.mocked(window.electronAPI.codePaneGetSignatureHelp).mockReset();
    vi.mocked(window.electronAPI.codePaneRenameSymbol).mockReset();
    vi.mocked(window.electronAPI.codePaneFormatDocument).mockReset();
    vi.mocked(window.electronAPI.codePaneGetWorkspaceSymbols).mockReset();
    vi.mocked(window.electronAPI.codePaneGetCodeActions).mockReset();
    vi.mocked(window.electronAPI.codePaneRunCodeAction).mockReset();
    vi.mocked(window.electronAPI.codePaneListRunTargets).mockReset();
    vi.mocked(window.electronAPI.codePaneRunTarget).mockReset();
    vi.mocked(window.electronAPI.codePaneStopRunTarget).mockReset();
    vi.mocked(window.electronAPI.codePaneListTests).mockReset();
    vi.mocked(window.electronAPI.codePaneRunTests).mockReset();
    vi.mocked(window.electronAPI.codePaneRerunFailedTests).mockReset();
    vi.mocked(window.electronAPI.onCodePaneFsChanged).mockReset();
    vi.mocked(window.electronAPI.offCodePaneFsChanged).mockReset();
    vi.mocked(window.electronAPI.onCodePaneIndexProgress).mockReset();
    vi.mocked(window.electronAPI.offCodePaneIndexProgress).mockReset();
    vi.mocked(window.electronAPI.onCodePaneRunSessionChanged).mockReset();
    vi.mocked(window.electronAPI.offCodePaneRunSessionChanged).mockReset();
    vi.mocked(window.electronAPI.onCodePaneRunSessionOutput).mockReset();
    vi.mocked(window.electronAPI.offCodePaneRunSessionOutput).mockReset();
    vi.mocked(window.electronAPI.onCodePaneDiagnosticsChanged).mockReset();
    vi.mocked(window.electronAPI.offCodePaneDiagnosticsChanged).mockReset();
    vi.mocked(window.electronAPI.onCodePaneLanguageWorkspaceChanged).mockReset();
    vi.mocked(window.electronAPI.offCodePaneLanguageWorkspaceChanged).mockReset();
    vi.mocked(window.electronAPI.openFolder).mockReset();
    vi.mocked(window.electronAPI.writeClipboardText).mockReset();

    vi.mocked(window.electronAPI.codePaneListDirectory).mockResolvedValue({
      success: true,
      data: [
        {
          path: '/workspace/project/src/index.ts',
          name: 'index.ts',
          type: 'file',
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneReadFile).mockResolvedValue({
      success: true,
      data: {
        content: 'export const value = 1;\n',
        mtimeMs: 100,
        size: 24,
        language: 'typescript',
        isBinary: false,
      },
    });
    vi.mocked(window.electronAPI.codePaneWriteFile).mockResolvedValue({
      success: true,
      data: {
        mtimeMs: 200,
      },
    });
    vi.mocked(window.electronAPI.codePaneGetExternalLibrarySections).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(window.electronAPI.codePaneGetGitRepositorySummary).mockResolvedValue({
      success: true,
      data: {
        repoRootPath: '/workspace/project',
        currentBranch: 'main',
        upstreamBranch: 'origin/main',
        detachedHead: false,
        headSha: '1234567890abcdef',
        aheadCount: 0,
        behindCount: 0,
        operation: 'idle',
        hasConflicts: false,
      },
    });
    vi.mocked(window.electronAPI.codePaneGetGitGraph).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(window.electronAPI.codePaneReadGitBaseFile).mockResolvedValue({
      success: true,
      data: {
        content: 'export const value = 0;\n',
        existsInHead: true,
      },
    });
    vi.mocked(window.electronAPI.codePaneWatchRoot).mockResolvedValue({ success: true });
    vi.mocked(window.electronAPI.codePaneUnwatchRoot).mockResolvedValue({ success: true });
    vi.mocked(window.electronAPI.codePaneSearchFiles).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneSearchContents).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneDidOpenDocument).mockResolvedValue({ success: true });
    vi.mocked(window.electronAPI.codePaneDidChangeDocument).mockResolvedValue({ success: true });
    vi.mocked(window.electronAPI.codePaneDidSaveDocument).mockResolvedValue({ success: true });
    vi.mocked(window.electronAPI.codePaneDidCloseDocument).mockResolvedValue({ success: true });
    vi.mocked(window.electronAPI.codePaneGetDefinition).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneGetHover).mockResolvedValue({ success: true, data: null });
    vi.mocked(window.electronAPI.codePaneGetReferences).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneGetDocumentHighlights).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneGetDocumentSymbols).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneGetImplementations).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneGetCompletionItems).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneGetSignatureHelp).mockResolvedValue({ success: true, data: null });
    vi.mocked(window.electronAPI.codePaneRenameSymbol).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneFormatDocument).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneGetWorkspaceSymbols).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneGetCodeActions).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneRunCodeAction).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneListRunTargets).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneRunTarget).mockResolvedValue({ success: true, data: null });
    vi.mocked(window.electronAPI.codePaneStopRunTarget).mockResolvedValue({ success: true });
    vi.mocked(window.electronAPI.codePaneListTests).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.codePaneRunTests).mockResolvedValue({ success: true, data: null });
    vi.mocked(window.electronAPI.codePaneRerunFailedTests).mockResolvedValue({ success: true, data: [] });
    vi.mocked(window.electronAPI.openFolder).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.writeClipboardText).mockResolvedValue(undefined);
  });

  afterEach(() => {
    updatePaneImpl = null;
    vi.useRealTimers();
  });

  it('opens a file from the tree and creates a tab', async () => {
    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
      });
    });
    expect(screen.getAllByText('index.ts').length).toBeGreaterThan(1);
    expect(fakeMonacoState.lastEditorModel?.getValue()).toBe('export const value = 1;\n');
  });

  it('renders external libraries and opens external files in read-only mode', async () => {
    vi.mocked(window.electronAPI.codePaneGetExternalLibrarySections).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'python-external-libraries',
          label: 'External Libraries',
          languageId: 'python',
          roots: [
            {
              id: 'python-site-packages',
              label: 'site-packages',
              path: '/usr/lib/python3.12/site-packages',
            },
          ],
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneListDirectory).mockImplementation(async ({ targetPath }) => {
      if (!targetPath || targetPath === '/workspace/project') {
        return {
          success: true,
          data: [
            {
              path: '/workspace/project/src/index.ts',
              name: 'index.ts',
              type: 'file',
            },
          ],
        };
      }

      if (targetPath === '/usr/lib/python3.12/site-packages') {
        return {
          success: true,
          data: [
            {
              path: '/usr/lib/python3.12/site-packages/requests',
              name: 'requests',
              type: 'directory',
            },
          ],
        };
      }

      if (targetPath === '/usr/lib/python3.12/site-packages/requests') {
        return {
          success: true,
          data: [
            {
              path: '/usr/lib/python3.12/site-packages/requests/api.py',
              name: 'api.py',
              type: 'file',
            },
          ],
        };
      }

      return { success: true, data: [] };
    });
    vi.mocked(window.electronAPI.codePaneReadFile).mockImplementation(async ({ filePath }) => ({
      success: true,
      data: filePath === '/usr/lib/python3.12/site-packages/requests/api.py'
        ? {
            content: 'def get(url: str):\n    return url\n',
            mtimeMs: 100,
            size: 34,
            language: 'python',
            isBinary: false,
            readOnly: true,
            displayPath: 'External Libraries/Python/site-packages/requests/api.py',
          }
        : {
            content: 'export const value = 1;\n',
            mtimeMs: 100,
            size: 24,
            language: 'typescript',
            isBinary: false,
          },
    }));

    renderCodePane(createPane());

    expect(await screen.findByText('codePane.externalLibraries · Python')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'site-packages' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'requests' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'api.py' }));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/usr/lib/python3.12/site-packages/requests/api.py',
      });
    });
    expect(window.electronAPI.codePaneDidOpenDocument).not.toHaveBeenCalled();
    expect(fakeMonacoState.lastEditorModel?.getValue()).toBe('def get(url: str):\n    return url\n');
  });

  it('does not render an outer active border', () => {
    const view = renderCodePane(createPane());
    const root = view.container.firstElementChild;

    expect(root).not.toBeNull();
    expect(root).not.toHaveClass('border');
    expect((root as HTMLElement).className).not.toContain('border-[rgb(var(--primary))]/45');
    expect((root as HTMLElement).className).not.toContain('border-zinc-800');
  });

  it('loads the file tree before Monaco finishes bootstrapping', async () => {
    let resolveMonaco: ((value: typeof fakeMonaco) => void) | null = null;
    hoisted.ensureMonacoEnvironmentMock.mockImplementation(() => new Promise((resolve) => {
      resolveMonaco = resolve as (value: typeof fakeMonaco) => void;
    }));

    renderCodePane(createPane());

    expect(await screen.findByRole('button', { name: 'index.ts' })).toBeInTheDocument();

    await act(async () => {
      resolveMonaco?.(fakeMonaco);
      await Promise.resolve();
    });
  });

  it('shows index progress in the bottom status bar while building', async () => {
    renderCodePane(createPane());

    await emitIndexProgress({
      paneId: 'pane-code-1',
      rootPath: '/workspace/project',
      state: 'building',
      processedDirectoryCount: 3,
      totalDirectoryCount: 12,
      indexedFileCount: 41,
      reusedPersistedIndex: false,
    });

    expect(await screen.findByText('codePane.indexingProgress')).toBeInTheDocument();
  });

  it('shows language workspace progress in the bottom status bar', async () => {
    renderCodePane(createPane());

    await emitLanguageWorkspaceChanged({
      state: {
        pluginId: 'official.java-jdtls',
        workspaceRoot: '/workspace/project',
        projectRoot: '/workspace/project',
        languageId: 'java',
        runtimeState: 'running',
        phase: 'importing-project',
        message: 'Importing Maven project',
        progressText: 'Resolving classpath',
        readyFeatures: ['definition', 'hover'],
        timestamp: '2026-04-13T00:00:00.000Z',
      },
    });

    expect(await screen.findByText('Java: Resolving classpath')).toBeInTheDocument();
  });

  it('toggles the workbench sidebar from the activity rail and persists the selected view', async () => {
    const view = renderCodePane(createPane());

    expect(await screen.findByPlaceholderText('codePane.searchFilesPlaceholder')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.filesTab' }));
    });

    expect(screen.queryByPlaceholderText('codePane.searchFilesPlaceholder')).not.toBeInTheDocument();
    expect(view.getPane().code?.layout?.sidebar).toMatchObject({
      visible: false,
      activeView: 'files',
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.searchTab' }));
    });

    expect(await screen.findByPlaceholderText('codePane.searchContentsPlaceholder')).toBeInTheDocument();
    expect(view.getPane().code?.layout?.sidebar).toMatchObject({
      visible: true,
      activeView: 'search',
    });
  });

  it('persists the code pane sidebar width after drag resizing', async () => {
    const view = renderCodePane(createPane());

    await screen.findByPlaceholderText('codePane.searchFilesPlaceholder');

    const resizeHandle = screen.getByTestId('code-pane-sidebar-resize-handle');

    await act(async () => {
      fireEvent.mouseDown(resizeHandle, { clientX: 300 });
      fireEvent.mouseMove(window, { clientX: 384 });
      fireEvent.mouseUp(window);
    });

    await waitFor(() => {
      expect(view.getPane().code?.layout?.sidebar).toMatchObject({
        visible: true,
        activeView: 'files',
        width: 384,
        lastExpandedWidth: 384,
      });
    });
  });

  it('does not bootstrap the project tree again when only isActive changes', async () => {
    const pane = createPane();
    const onActivate = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <CodePane
        windowId="win-code-1"
        pane={pane}
        isActive
        onActivate={onActivate}
        onClose={onClose}
      />,
    );

    await screen.findByRole('button', { name: 'index.ts' }, { timeout: 3000 });

    expect(window.electronAPI.codePaneListDirectory).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.codePaneWatchRoot).toHaveBeenCalledTimes(1);

    vi.mocked(window.electronAPI.codePaneListDirectory).mockClear();
    vi.mocked(window.electronAPI.codePaneWatchRoot).mockClear();

    await act(async () => {
      rerender(
        <CodePane
          windowId="win-code-1"
          pane={pane}
          isActive={false}
          onActivate={onActivate}
          onClose={onClose}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      rerender(
        <CodePane
          windowId="win-code-1"
          pane={pane}
          isActive
          onActivate={onActivate}
          onClose={onClose}
        />,
      );
      await Promise.resolve();
    });

    expect(window.electronAPI.codePaneListDirectory).not.toHaveBeenCalled();
    expect(window.electronAPI.codePaneWatchRoot).not.toHaveBeenCalled();
  });

  it('persists expanded directories in pane state', async () => {
    vi.mocked(window.electronAPI.codePaneListDirectory).mockImplementation(async ({ targetPath }) => {
      if (targetPath === '/workspace/project/src') {
        return {
          success: true,
          data: [
            {
              path: '/workspace/project/src/index.ts',
              name: 'index.ts',
              type: 'file',
            },
          ],
        };
      }

      return {
        success: true,
        data: [
          {
            path: '/workspace/project/src',
            name: 'src',
            type: 'directory',
          },
        ],
      };
    });

    const view = renderCodePane(createPane());

    const directoryButton = await screen.findByRole('button', { name: 'src' });
    await act(async () => {
      fireEvent.click(directoryButton);
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneListDirectory).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        targetPath: '/workspace/project/src',
      });
    });
    expect(view.getPane().code?.expandedPaths).toEqual([
      '/workspace/project',
      '/workspace/project/src',
    ]);
  });

  it('allows collapsing and expanding the root file tree entry', async () => {
    vi.mocked(window.electronAPI.codePaneListDirectory).mockResolvedValue({
      success: true,
      data: [
        {
          path: '/workspace/project/src',
          name: 'src',
          type: 'directory',
        },
      ],
    });

    const view = renderCodePane(createPane());

    const rootButton = await screen.findByRole('button', { name: 'project' });
    expect(await screen.findByRole('button', { name: 'src' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(rootButton);
    });

    expect(screen.queryByRole('button', { name: 'src' })).not.toBeInTheDocument();
    expect(view.getPane().code?.expandedPaths).toEqual([]);

    await act(async () => {
      fireEvent.click(rootButton);
    });

    expect(await screen.findByRole('button', { name: 'src' })).toBeInTheDocument();
    expect(view.getPane().code?.expandedPaths).toEqual(['/workspace/project']);
  });

  it('runs file context menu actions', async () => {
    const user = userEvent.setup();
    renderCodePane(createPane());

    const treeButton = await screen.findByRole('button', { name: 'index.ts' });

    await user.pointer({ keys: '[MouseRight]', target: treeButton });
    await user.click(await screen.findByText('codePane.copyPath'));
    expect(window.electronAPI.writeClipboardText).toHaveBeenCalledWith('/workspace/project/src/index.ts');
    expect(screen.getByText('codePane.pathCopied')).toBeInTheDocument();

    await user.pointer({ keys: '[MouseRight]', target: treeButton });
    await user.click(await screen.findByText('codePane.revealInFolder'));
    expect(window.electronAPI.openFolder).toHaveBeenCalledWith('/workspace/project/src');
  });

  it('searches project contents and opens a selected match', async () => {
    vi.mocked(window.electronAPI.codePaneSearchContents).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/index.ts',
          lineNumber: 1,
          column: 14,
          lineText: 'export const value = 1;',
        },
      ],
    });

    renderCodePane(createPane());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.searchTab' }));
    });

    fireEvent.change(screen.getByPlaceholderText('codePane.searchContentsPlaceholder'), {
      target: { value: 'value' },
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneSearchContents).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        query: 'value',
        limit: 120,
        maxMatchesPerFile: 6,
      });
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('export const value = 1;'));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
      });
    });
  });

  it('searches workspace symbols and opens the selected result', async () => {
    vi.mocked(window.electronAPI.codePaneGetWorkspaceSymbols).mockResolvedValue({
      success: true,
      data: [
        {
          name: 'AppService',
          kind: 5,
          filePath: '/workspace/project/src/app.ts',
          range: {
            startLineNumber: 2,
            startColumn: 3,
            endLineNumber: 2,
            endColumn: 13,
          },
          containerName: 'services',
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneReadFile).mockImplementation(async ({ filePath }) => ({
      success: true,
      data: {
        content: filePath.endsWith('app.ts') ? 'export class AppService {}\n' : 'export const value = 1;\n',
        mtimeMs: 100,
        size: 24,
        language: 'typescript',
        isBinary: false,
      },
    }));

    renderCodePane(createPane());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.searchTab' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.searchModeSymbols' }));
    });

    fireEvent.change(screen.getByPlaceholderText('codePane.workspaceSymbolsPlaceholder'), {
      target: { value: 'AppService' },
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneGetWorkspaceSymbols).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        query: 'AppService',
        limit: 120,
      });
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('AppService'));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/app.ts',
      });
    });
  });

  it('opens Search Everywhere and navigates to matching symbols', async () => {
    vi.mocked(window.electronAPI.codePaneSearchFiles).mockResolvedValue({
      success: true,
      data: ['/workspace/project/src/app.ts'],
    });
    vi.mocked(window.electronAPI.codePaneGetWorkspaceSymbols).mockResolvedValue({
      success: true,
      data: [
        {
          name: 'AppService',
          kind: 5,
          filePath: '/workspace/project/src/app.ts',
          range: {
            startLineNumber: 2,
            startColumn: 3,
            endLineNumber: 2,
            endColumn: 13,
          },
          containerName: 'services',
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneReadFile).mockImplementation(async ({ filePath }) => ({
      success: true,
      data: {
        content: filePath.endsWith('app.ts') ? 'export class AppService {}\n' : 'export const value = 1;\n',
        mtimeMs: 100,
        size: 24,
        language: 'typescript',
        isBinary: false,
      },
    }));

    renderCodePane(createPane());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.searchEverywhereOpen' }));
    });

    fireEvent.change(screen.getByPlaceholderText('codePane.searchEverywherePlaceholder'), {
      target: { value: 'AppService' },
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneSearchFiles).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        query: 'AppService',
        limit: 40,
      });
      expect(window.electronAPI.codePaneGetWorkspaceSymbols).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        query: 'AppService',
        limit: 40,
      });
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('AppService'));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/app.ts',
      });
    });
  });

  it('opens the run tool window and streams run session output', async () => {
    vi.mocked(window.electronAPI.codePaneListRunTargets).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'run-target-spring-boot',
          label: 'Spring Boot',
          detail: 'mvn spring-boot:run',
          kind: 'application',
          languageId: 'java',
          workingDirectory: '/workspace/project',
          canDebug: true,
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneRunTarget).mockResolvedValue({
      success: true,
      data: {
        id: 'run-session-1',
        targetId: 'run-target-spring-boot',
        label: 'Spring Boot',
        detail: 'mvn spring-boot:run',
        kind: 'application',
        languageId: 'java',
        state: 'starting',
        workingDirectory: '/workspace/project',
        startedAt: '2026-04-13T00:00:00.000Z',
      },
    });

    renderCodePane(createPane());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.runTab' }));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneListRunTargets).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        activeFilePath: null,
      });
    });

    expect(await screen.findByText('Spring Boot')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('codePane.runAction'));
    });

    expect(window.electronAPI.codePaneRunTarget).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      targetId: 'run-target-spring-boot',
    });

    await emitRunSessionChanged({
      rootPath: '/workspace/project',
      session: {
        id: 'run-session-1',
        targetId: 'run-target-spring-boot',
        label: 'Spring Boot',
        detail: 'mvn spring-boot:run',
        kind: 'application',
        languageId: 'java',
        state: 'running',
        workingDirectory: '/workspace/project',
        startedAt: '2026-04-13T00:00:00.000Z',
      },
    });
    await emitRunSessionOutput({
      rootPath: '/workspace/project',
      sessionId: 'run-session-1',
      chunk: '$ mvn spring-boot:run\nStarted successfully\n',
      stream: 'stdout',
    });

    expect(await screen.findByText(/Started successfully/)).toBeInTheDocument();
  });

  it('opens the tests tool window, shows the test tree, and reruns failed tests', async () => {
    vi.mocked(window.electronAPI.codePaneListTests).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'test-file-1',
          label: 'test_service.py',
          kind: 'file',
          filePath: '/workspace/project/tests/test_service.py',
          runnableTargetId: 'test-target-1',
          children: [
            {
              id: 'test-case-1',
              label: 'test_handles_request',
              kind: 'case',
              filePath: '/workspace/project/tests/test_service.py',
              runnableTargetId: 'test-target-case-1',
            },
          ],
        },
      ],
    });

    renderCodePane(createPane());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.testsTab' }));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneListTests).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        activeFilePath: null,
      });
    });

    const testFileButton = await screen.findByRole('button', { name: /test_service\.py/ });
    await act(async () => {
      fireEvent.click(testFileButton);
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/tests/test_service.py',
      });
    });

    await emitRunSessionChanged({
      rootPath: '/workspace/project',
      session: {
        id: 'test-session-1',
        targetId: 'test-target-1',
        label: 'test_service.py',
        detail: 'python -m pytest test_service.py',
        kind: 'test',
        languageId: 'python',
        state: 'failed',
        workingDirectory: '/workspace/project',
        startedAt: '2026-04-13T00:00:00.000Z',
        endedAt: '2026-04-13T00:00:03.000Z',
        exitCode: 1,
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('codePane.rerunFailedTests'));
    });

    expect(window.electronAPI.codePaneRerunFailedTests).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
    });
  });

  it('shows repository summary, branch graph, and changed files in the SCM tab', async () => {
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockResolvedValue({
      success: true,
      data: [
        {
          path: '/workspace/project/src/index.ts',
          status: 'modified',
          unstaged: true,
          section: 'unstaged',
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneGetGitRepositorySummary).mockResolvedValue({
      success: true,
      data: {
        repoRootPath: '/workspace/project',
        currentBranch: 'feature/scm',
        upstreamBranch: 'origin/feature/scm',
        detachedHead: false,
        headSha: '1234567890abcdef',
        aheadCount: 2,
        behindCount: 1,
        operation: 'merge',
        hasConflicts: true,
      },
    });
    vi.mocked(window.electronAPI.codePaneGetGitGraph).mockResolvedValue({
      success: true,
      data: [
        {
          sha: '1234567890abcdef',
          shortSha: '1234567',
          parents: ['abcdef1234567890'],
          subject: 'Merge feature branch',
          author: 'Test User',
          timestamp: 1_710_000_000,
          refs: ['HEAD -> feature/scm', 'origin/feature/scm'],
          isHead: true,
          isMergeCommit: true,
          lane: 0,
          laneCount: 1,
        },
      ],
    });

    renderCodePane(createPane());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.scmTab' }));
    });

    expect((await screen.findAllByText('feature/scm')).length).toBeGreaterThan(0);
    expect(screen.getByText('Merge feature branch')).toBeInTheDocument();
    expect(screen.getByText('codePane.gitSectionUnstaged')).toBeInTheDocument();
    expect(await screen.findByText('index.ts')).toBeInTheDocument();
    expect(window.electronAPI.codePaneGetGitGraph).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      limit: 60,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.openDiff' }));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadGitBaseFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
      });
    });
  });

  it('shows Monaco diagnostics in the problems tab', async () => {
    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    await act(async () => {
      fakeMonacoState.setMarkers('/workspace/project/src/index.ts', [
        {
          severity: fakeMonaco.MarkerSeverity.Error,
          message: 'Missing semicolon',
          startLineNumber: 1,
          startColumn: 10,
        },
      ]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.problemsTab' }));
    });

    expect(await screen.findByText('Missing semicolon')).toBeInTheDocument();
  });

  it('syncs language documents on open, change, save, and unmount', async () => {
    const view = renderCodePane(createPane());

    await openFileFromTree('index.ts');

    await waitFor(() => {
      expect(window.electronAPI.codePaneDidOpenDocument).toHaveBeenCalledWith({
        paneId: 'pane-code-1',
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        language: 'typescript',
        content: 'export const value = 1;\n',
      });
    });

    vi.useFakeTimers();

    await act(async () => {
      fakeMonacoState.models.get('/workspace/project/src/index.ts')?.setValue('export const value = 2;\n');
      vi.advanceTimersByTime(149);
      await Promise.resolve();
    });
    expect(window.electronAPI.codePaneDidChangeDocument).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.electronAPI.codePaneDidChangeDocument).toHaveBeenCalledWith({
      paneId: 'pane-code-1',
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      language: 'typescript',
      content: 'export const value = 2;\n',
    });

    await act(async () => {
      vi.advanceTimersByTime(650);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.electronAPI.codePaneDidSaveDocument).toHaveBeenCalledWith({
      paneId: 'pane-code-1',
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      language: 'typescript',
      content: 'export const value = 2;\n',
    });

    await act(async () => {
      view.unmount();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.electronAPI.codePaneDidCloseDocument).toHaveBeenCalledWith({
      paneId: 'pane-code-1',
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
    });

    vi.useRealTimers();
  });

  it('formats the active file with language edits', async () => {
    vi.mocked(window.electronAPI.codePaneFormatDocument).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/index.ts',
          range: {
            startLineNumber: 1,
            startColumn: 14,
            endLineNumber: 1,
            endColumn: 19,
          },
          newText: 'formattedValue',
        },
      ],
    });

    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.formatDocument' }));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneFormatDocument).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        language: 'typescript',
        tabSize: 2,
        insertSpaces: true,
      });
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneWriteFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        content: 'export const formattedValue = 1;\n',
        expectedMtimeMs: 100,
      });
    });
  });

  it('renames the symbol under the caret with workspace edits', async () => {
    vi.mocked(window.electronAPI.codePaneRenameSymbol).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/index.ts',
          range: {
            startLineNumber: 1,
            startColumn: 14,
            endLineNumber: 1,
            endColumn: 19,
          },
          newText: 'renamedValue',
        },
      ],
    });
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('renamedValue');

    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    const activeEditor = fakeMonaco.editor.create.mock.results.at(-1)?.value;
    await act(async () => {
      activeEditor.setPosition({ lineNumber: 1, column: 15 });
      fireEvent.click(screen.getByRole('button', { name: 'codePane.renameSymbol' }));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneRenameSymbol).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        language: 'typescript',
        position: {
          lineNumber: 1,
          column: 15,
        },
        newName: 'renamedValue',
      });
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneWriteFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        content: 'export const renamedValue = 1;\n',
        expectedMtimeMs: 100,
      });
    });

    promptSpy.mockRestore();
  });

  it('finds usages for the symbol under the caret and shows them in the search panel', async () => {
    vi.mocked(window.electronAPI.codePaneGetReferences).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/util.ts',
          range: {
            startLineNumber: 3,
            startColumn: 5,
            endLineNumber: 3,
            endColumn: 10,
          },
          previewText: 'return value + 1;',
        },
      ],
    });

    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    const activeEditor = fakeMonaco.editor.create.mock.results.at(-1)?.value;
    await act(async () => {
      activeEditor.setPosition({ lineNumber: 1, column: 15 });
      fireEvent.click(screen.getByRole('button', { name: 'codePane.findUsages' }));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneGetReferences).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        language: 'typescript',
        position: {
          lineNumber: 1,
          column: 15,
        },
      });
    });

    expect(await screen.findByText('util.ts')).toBeInTheDocument();
    expect(screen.getByText('return value + 1;')).toBeInTheDocument();
  });

  it('tracks navigation history and supports back/forward navigation', async () => {
    vi.mocked(window.electronAPI.codePaneGetDefinition).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/util.ts',
          range: {
            startLineNumber: 3,
            startColumn: 5,
            endLineNumber: 3,
            endColumn: 9,
          },
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneReadFile).mockImplementation(async ({ filePath }) => ({
      success: true,
      data: {
        content: filePath.endsWith('util.ts') ? 'export const util = 1;\n' : 'export const value = 1;\n',
        mtimeMs: 100,
        size: 24,
        language: 'typescript',
        isBinary: false,
      },
    }));

    const view = renderCodePane(createPane());

    await openFileFromTree('index.ts');

    const activeEditor = fakeMonaco.editor.create.mock.results.at(-1)?.value;
    await act(async () => {
      activeEditor.fireMouseDown({
        target: {
          position: {
            lineNumber: 1,
            column: 8,
          },
        },
        event: {
          ctrlKey: true,
          metaKey: false,
          leftButton: true,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.getPane().code?.activeFilePath).toBe('/workspace/project/src/util.ts');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.navigateBack' }));
    });

    await waitFor(() => {
      expect(view.getPane().code?.activeFilePath).toBe('/workspace/project/src/index.ts');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.navigateForward' }));
    });

    await waitFor(() => {
      expect(view.getPane().code?.activeFilePath).toBe('/workspace/project/src/util.ts');
    });
  });

  it('loads code actions for the active caret location and applies the selected action', async () => {
    vi.mocked(window.electronAPI.codePaneGetCodeActions).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'fix-1',
          title: 'Add missing import',
          kind: 'quickfix',
          isPreferred: true,
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneRunCodeAction).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/index.ts',
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
          },
          newText: 'import { helper } from "./helper";\n',
        },
      ],
    });

    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    const activeEditor = fakeMonaco.editor.create.mock.results.at(-1)?.value;
    await act(async () => {
      activeEditor.setPosition({ lineNumber: 1, column: 15 });
      fireEvent.click(screen.getByRole('button', { name: 'codePane.codeActions' }));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneGetCodeActions).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        language: 'typescript',
        range: {
          startLineNumber: 1,
          startColumn: 14,
          endLineNumber: 1,
          endColumn: 19,
        },
      });
    });

    await act(async () => {
      fireEvent.click(await screen.findByText('Add missing import'));
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneRunCodeAction).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        language: 'typescript',
        actionId: 'fix-1',
      });
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneWriteFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        content: 'import { helper } from "./helper";\nexport const value = 1;\n',
        expectedMtimeMs: 100,
      });
    });
  });

  it('registers Monaco definition providers that proxy to the language IPC bridge', async () => {
    vi.mocked(window.electronAPI.codePaneGetDefinition).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/index.ts',
          range: {
            startLineNumber: 1,
            startColumn: 8,
            endLineNumber: 1,
            endColumn: 13,
          },
        },
      ],
    });

    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    await waitFor(() => {
      expect(fakeMonacoState.definitionProviders.get('typescript')).toBeDefined();
    });

    const provider = fakeMonacoState.definitionProviders.get('typescript');

    const result = await provider?.provideDefinition(
      fakeMonacoState.lastEditorModel,
      { lineNumber: 1, column: 8 },
    ) as Array<{ uri: { path: string }; range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } }>;

    expect(window.electronAPI.codePaneGetDefinition).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      language: 'typescript',
      position: {
        lineNumber: 1,
        column: 8,
      },
    });
    expect(result).toEqual([
      {
        uri: { path: '/workspace/project/src/index.ts' },
        range: {
          startLineNumber: 1,
          startColumn: 8,
          endLineNumber: 1,
          endColumn: 13,
        },
      },
    ]);
  });

  it('registers Monaco document highlight and implementation providers that proxy to the language IPC bridge', async () => {
    vi.mocked(window.electronAPI.codePaneGetDocumentHighlights).mockResolvedValue({
      success: true,
      data: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 14,
            endLineNumber: 1,
            endColumn: 19,
          },
          kind: 'write',
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneGetImplementations).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/util.ts',
          range: {
            startLineNumber: 3,
            startColumn: 5,
            endLineNumber: 3,
            endColumn: 9,
          },
        },
      ],
    });

    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    await waitFor(() => {
      expect(fakeMonacoState.documentHighlightProviders.get('typescript')).toBeDefined();
      expect(fakeMonacoState.implementationProviders.get('typescript')).toBeDefined();
    });

    const documentHighlightProvider = fakeMonacoState.documentHighlightProviders.get('typescript');
    const highlightResult = await documentHighlightProvider?.provideDocumentHighlights(
      fakeMonacoState.lastEditorModel,
      { lineNumber: 1, column: 15 },
    ) as Array<{ range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; kind: number }>;

    expect(window.electronAPI.codePaneGetDocumentHighlights).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      language: 'typescript',
      position: {
        lineNumber: 1,
        column: 15,
      },
    });
    expect(highlightResult).toEqual([
      {
        range: {
          startLineNumber: 1,
          startColumn: 14,
          endLineNumber: 1,
          endColumn: 19,
        },
        kind: fakeMonaco.languages.DocumentHighlightKind.Write,
      },
    ]);

    const implementationProvider = fakeMonacoState.implementationProviders.get('typescript');
    const implementationResult = await implementationProvider?.provideImplementation(
      fakeMonacoState.lastEditorModel,
      { lineNumber: 1, column: 15 },
    ) as Array<{ uri: { path: string } }>;

    expect(window.electronAPI.codePaneGetImplementations).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      language: 'typescript',
      position: {
        lineNumber: 1,
        column: 15,
      },
    });
    expect(implementationResult).toEqual([
      {
        uri: { path: '/workspace/project/src/util.ts' },
        range: {
          startLineNumber: 3,
          startColumn: 5,
          endLineNumber: 3,
          endColumn: 9,
        },
      },
    ]);
  });

  it('registers Monaco completion and signature providers that proxy to the language IPC bridge', async () => {
    vi.mocked(window.electronAPI.codePaneGetCompletionItems).mockResolvedValue({
      success: true,
      data: [
        {
          label: 'formatValue',
          detail: 'mock detail',
          documentation: 'mock docs',
          kind: 3,
          insertText: 'formatValue()',
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneGetSignatureHelp).mockResolvedValue({
      success: true,
      data: {
        signatures: [
          {
            label: 'formatValue(value: string)',
            documentation: 'signature docs',
            parameters: [
              {
                label: 'value: string',
              },
            ],
          },
        ],
        activeSignature: 0,
        activeParameter: 0,
      },
    });

    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    await waitFor(() => {
      expect(fakeMonacoState.completionProviders.get('typescript')).toBeDefined();
      expect(fakeMonacoState.signatureHelpProviders.get('typescript')).toBeDefined();
    });

    const completionProvider = fakeMonacoState.completionProviders.get('typescript');
    const completionResult = await completionProvider?.provideCompletionItems(
      fakeMonacoState.lastEditorModel,
      { lineNumber: 1, column: 15 },
      {},
    ) as { suggestions: Array<{ label: string; insertText: string }> };

    expect(window.electronAPI.codePaneGetCompletionItems).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      language: 'typescript',
      position: {
        lineNumber: 1,
        column: 15,
      },
      triggerKind: 1,
    });
    expect(completionResult.suggestions[0]).toMatchObject({
      label: 'formatValue',
      insertText: 'formatValue()',
    });

    const signatureProvider = fakeMonacoState.signatureHelpProviders.get('typescript');
    const signatureResult = await signatureProvider?.provideSignatureHelp(
      fakeMonacoState.lastEditorModel,
      { lineNumber: 1, column: 18 },
    ) as { value: { signatures: Array<{ label: string }> } };

    expect(window.electronAPI.codePaneGetSignatureHelp).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      language: 'typescript',
      position: {
        lineNumber: 1,
        column: 18,
      },
    });
    expect(signatureResult.value.signatures[0]).toMatchObject({
      label: 'formatValue(value: string)',
    });
  });

  it('opens the first definition target on Ctrl/Cmd-click', async () => {
    vi.mocked(window.electronAPI.codePaneGetDefinition).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/util.ts',
          range: {
            startLineNumber: 3,
            startColumn: 5,
            endLineNumber: 3,
            endColumn: 9,
          },
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneReadFile).mockImplementation(async ({ filePath }) => ({
      success: true,
      data: {
        content: filePath.endsWith('util.ts') ? 'export const util = 1;\n' : 'export const value = 1;\n',
        mtimeMs: 100,
        size: 24,
        language: 'typescript',
        isBinary: false,
      },
    }));

    const view = renderCodePane(createPane());

    await openFileFromTree('index.ts');

    const activeEditor = fakeMonaco.editor.create.mock.results.at(-1)?.value;
    expect(activeEditor).toBeDefined();

    await act(async () => {
      activeEditor.fireMouseDown({
        target: {
          position: {
            lineNumber: 1,
            column: 8,
          },
        },
        event: {
          ctrlKey: true,
          metaKey: false,
          leftButton: true,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/util.ts',
      });
    });

    expect(view.getPane().code?.activeFilePath).toBe('/workspace/project/src/util.ts');
  });

  it('opens the first definition target when Monaco exposes browserEvent button metadata', async () => {
    vi.mocked(window.electronAPI.codePaneGetDefinition).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/util.ts',
          range: {
            startLineNumber: 3,
            startColumn: 5,
            endLineNumber: 3,
            endColumn: 9,
          },
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneReadFile).mockImplementation(async ({ filePath }) => ({
      success: true,
      data: {
        content: filePath.endsWith('util.ts') ? 'export const util = 1;\n' : 'export const value = 1;\n',
        mtimeMs: 100,
        size: 24,
        language: 'typescript',
        isBinary: false,
      },
    }));

    const view = renderCodePane(createPane());

    await openFileFromTree('index.ts');

    const activeEditor = fakeMonaco.editor.create.mock.results.at(-1)?.value;
    expect(activeEditor).toBeDefined();

    await act(async () => {
      activeEditor.fireMouseDown({
        target: {
          position: {
            lineNumber: 1,
            column: 8,
          },
        },
        event: {
          browserEvent: {
            ctrlKey: true,
            metaKey: false,
            button: 0,
            buttons: 1,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
          },
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.getPane().code?.activeFilePath).toBe('/workspace/project/src/util.ts');
    });
  });

  it('prefetches definitions on Ctrl/Cmd-hover and decorates the symbol as a link', async () => {
    vi.mocked(window.electronAPI.codePaneGetDefinition).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: '/workspace/project/src/util.ts',
          range: {
            startLineNumber: 3,
            startColumn: 5,
            endLineNumber: 3,
            endColumn: 9,
          },
        },
      ],
    });

    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    const activeEditor = fakeMonaco.editor.create.mock.results.at(-1)?.value;
    expect(activeEditor).toBeDefined();

    await act(async () => {
      activeEditor.fireMouseMove({
        target: {
          position: {
            lineNumber: 1,
            column: 14,
          },
        },
        event: {
          browserEvent: {
            ctrlKey: true,
            metaKey: false,
          },
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneGetDefinition).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        language: 'typescript',
        position: {
          lineNumber: 1,
          column: 14,
        },
      });
    });

    expect(activeEditor.deltaDecorations).toHaveBeenCalled();
  });

  it('opens read-only dependency definitions returned as virtual JDT documents', async () => {
    vi.mocked(window.electronAPI.codePaneGetDefinition).mockResolvedValue({
      success: true,
      data: [
        {
          filePath: 'jdt://contents/java.base/java/lang/String.class?=mock',
          uri: 'jdt://contents/java.base/java/lang/String.class?=mock',
          displayPath: 'External Libraries/java.base/java/lang/String.java',
          readOnly: true,
          language: 'java',
          content: 'package java.lang;\npublic final class String {}\n',
          range: {
            startLineNumber: 2,
            startColumn: 20,
            endLineNumber: 2,
            endColumn: 26,
          },
        },
      ],
    });

    const view = renderCodePane(createPane());

    await openFileFromTree('index.ts');

    const activeEditor = fakeMonaco.editor.create.mock.results.at(-1)?.value;
    expect(activeEditor).toBeDefined();

    vi.mocked(window.electronAPI.codePaneReadFile).mockClear();

    await act(async () => {
      activeEditor.fireMouseDown({
        target: {
          position: {
            lineNumber: 1,
            column: 8,
          },
        },
        event: {
          ctrlKey: true,
          metaKey: false,
          leftButton: true,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.getPane().code?.activeFilePath).toBe('jdt://contents/java.base/java/lang/String.class?=mock');
    });

    expect(screen.getAllByText('String.java').length).toBeGreaterThan(0);
    expect(window.electronAPI.codePaneReadFile).not.toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'jdt://contents/java.base/java/lang/String.class?=mock',
    }));
  });

  it('applies plugin diagnostics to Monaco markers and the problems panel', async () => {
    renderCodePane(createPane());

    await openFileFromTree('index.ts');
    await waitFor(() => {
      expect(window.electronAPI.onCodePaneDiagnosticsChanged).toHaveBeenCalled();
    });

    await emitDiagnosticsChanged({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      diagnostics: [
        {
          filePath: '/workspace/project/src/index.ts',
          owner: 'language-plugin',
          severity: 'warning',
          message: 'Plugin warning',
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 7,
          source: 'mock-lsp',
          code: 'MOCK001',
        },
      ],
    });

    await waitFor(() => {
      expect(fakeMonaco.editor.setModelMarkers).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.problemsTab' }));
    });

    expect(await screen.findByText('Plugin warning')).toBeInTheDocument();
    expect(fakeMonaco.editor.setModelMarkers).toHaveBeenCalled();
  });

  it('auto-saves dirty files after the debounce delay', async () => {
    renderCodePane(createPane());

    await openFileFromTree('index.ts');

    vi.useFakeTimers();

    await act(async () => {
      fakeMonacoState.models.get('/workspace/project/src/index.ts')?.setValue('export const value = 2;\n');
      vi.advanceTimersByTime(799);
      await Promise.resolve();
    });
    expect(window.electronAPI.codePaneWriteFile).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.electronAPI.codePaneWriteFile).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/index.ts',
      content: 'export const value = 2;\n',
      expectedMtimeMs: 100,
    });

    vi.useRealTimers();
  });

  it('restores diff mode from persisted pane state', async () => {
    const pane = createPane({
      openFiles: [{ path: '/workspace/project/src/index.ts' }],
      activeFilePath: '/workspace/project/src/index.ts',
      selectedPath: '/workspace/project/src/index.ts',
      viewMode: 'diff',
      diffTargetPath: '/workspace/project/src/index.ts',
    });

    const view = renderCodePane(pane);

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadGitBaseFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
      });
    });
    expect(fakeMonacoState.lastDiffModel?.original.getValue()).toBe('export const value = 0;\n');
    expect(fakeMonacoState.lastDiffModel?.modified.getValue()).toBe('export const value = 1;\n');
    expect(view.getPane().code?.viewMode).toBe('diff');
    expect(screen.getByText('codePane.diffView')).toBeInTheDocument();
  });

  it('flushes dirty files when the pane unmounts', async () => {
    const view = renderCodePane(createPane());

    await openFileFromTree('index.ts');

    await act(async () => {
      fakeMonacoState.models.get('/workspace/project/src/index.ts')?.setValue('export const value = 3;\n');
    });

    view.unmount();

    await waitFor(() => {
      expect(window.electronAPI.codePaneWriteFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
        content: 'export const value = 3;\n',
        expectedMtimeMs: 100,
      });
    });
  });

  it('does not reload the tree for watcher file change events', async () => {
    renderCodePane(createPane({
      openFiles: [{ path: '/workspace/project/src/index.ts' }],
      activeFilePath: '/workspace/project/src/index.ts',
      selectedPath: '/workspace/project/src/index.ts',
    }));

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
      });
    });

    vi.mocked(window.electronAPI.codePaneListDirectory).mockClear();
    vi.mocked(window.electronAPI.codePaneReadFile).mockClear();
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockClear();

    await emitFsChanged({
      rootPath: '/workspace/project',
      changes: [
        {
          type: 'change',
          path: '/workspace/project/src/index.ts',
        },
      ],
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneReadFile).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        filePath: '/workspace/project/src/index.ts',
      });
    });

    expect(window.electronAPI.codePaneListDirectory).not.toHaveBeenCalled();
    expect(window.electronAPI.codePaneGetGitStatus).toHaveBeenCalledTimes(1);
  });

  it('removes deleted files from the tree without reloading the whole directory', async () => {
    renderCodePane(createPane());

    await screen.findByRole('button', { name: 'index.ts' }, { timeout: 3000 });

    vi.mocked(window.electronAPI.codePaneListDirectory).mockClear();
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockClear();

    await emitFsChanged({
      rootPath: '/workspace/project',
      changes: [
        {
          type: 'unlink',
          path: '/workspace/project/src/index.ts',
        },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'index.ts' })).not.toBeInTheDocument();
    });

    expect(window.electronAPI.codePaneListDirectory).not.toHaveBeenCalled();
    expect(window.electronAPI.codePaneGetGitStatus).toHaveBeenCalledTimes(1);
  });

  it('reloads only the affected directory for watcher structural changes', async () => {
    vi.mocked(window.electronAPI.codePaneListDirectory).mockImplementation(async ({ targetPath }) => {
      if (targetPath === '/workspace/project/src') {
        return {
          success: true,
          data: [
            {
              path: '/workspace/project/src/index.ts',
              name: 'index.ts',
              type: 'file',
            },
          ],
        };
      }

      return {
        success: true,
        data: [
          {
            path: '/workspace/project/src',
            name: 'src',
            type: 'directory',
          },
        ],
      };
    });

    renderCodePane(createPane());

    const directoryButton = await screen.findByRole('button', { name: 'src' });
    await act(async () => {
      fireEvent.click(directoryButton);
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneListDirectory).toHaveBeenCalledWith({
        rootPath: '/workspace/project',
        targetPath: '/workspace/project/src',
      });
    });

    vi.mocked(window.electronAPI.codePaneListDirectory).mockClear();
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockClear();

    await emitFsChanged({
      rootPath: '/workspace/project',
      changes: [
        {
          type: 'add',
          path: '/workspace/project/src/new.ts',
        },
      ],
    });

    await waitFor(() => {
      expect(window.electronAPI.codePaneListDirectory).toHaveBeenCalledTimes(1);
    });

    expect(window.electronAPI.codePaneListDirectory).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      targetPath: '/workspace/project/src',
    });
    expect(window.electronAPI.codePaneGetGitStatus).toHaveBeenCalledTimes(1);
  });

  it('pins tabs from the context menu and keeps them first', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.codePaneListDirectory).mockResolvedValue({
      success: true,
      data: [
        {
          path: '/workspace/project/src/index.ts',
          name: 'index.ts',
          type: 'file',
        },
        {
          path: '/workspace/project/src/app.ts',
          name: 'app.ts',
          type: 'file',
        },
      ],
    });
    vi.mocked(window.electronAPI.codePaneReadFile).mockImplementation(async ({ filePath }) => ({
      success: true,
      data: {
        content: `// ${filePath}\n`,
        mtimeMs: filePath.endsWith('app.ts') ? 101 : 100,
        size: 24,
        language: 'typescript',
        isBinary: false,
      },
    }));

    const view = renderCodePane(createPane());

    await openFileFromTree('index.ts');
    await openFileFromTree('app.ts');

    const appTabLabels = screen.getAllByText('app.ts');
    const appTabLabel = appTabLabels[appTabLabels.length - 1];
    if (!appTabLabel) {
      throw new Error('expected app.ts tab label');
    }

    await user.pointer({ keys: '[MouseRight]', target: appTabLabel });
    await user.click(await screen.findByText('codePane.pinTab'));

    expect(view.getPane().code?.openFiles).toEqual([
      {
        path: '/workspace/project/src/app.ts',
        pinned: true,
      },
      {
        path: '/workspace/project/src/index.ts',
      },
    ]);
  });
});
