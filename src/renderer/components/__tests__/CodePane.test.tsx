import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodePane } from '../CodePane';
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

  return {
    addCommand: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    revealLineInCenter: vi.fn(),
    restoreViewState: vi.fn(),
    saveViewState: vi.fn(() => null),
    setPosition: vi.fn(),
    setSelection: vi.fn(),
    setModel: vi.fn((nextModel: FakeModel | null) => {
      model = nextModel;
      fakeMonacoState.lastEditorModel = nextModel;
    }),
    getModel: () => model,
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
  markerListeners: new Set<() => void>(),
  markersByPath: new Map<string, Array<{
    severity: number;
    message: string;
    startLineNumber: number;
    startColumn: number;
  }>>(),
  models: new Map<string, FakeModel>(),
  setMarkers(path: string, markers: Array<{
    severity: number;
    message: string;
    startLineNumber: number;
    startColumn: number;
  }>) {
    this.markersByPath.set(path, markers);
    for (const listener of Array.from(this.markerListeners)) {
      listener();
    }
  },
  reset() {
    this.lastDiffModel = null;
    this.lastEditorModel = null;
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
  KeyCode: {
    KeyS: 49,
  },
  KeyMod: {
    CtrlCmd: 2048,
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
    getModelMarkers: vi.fn(({ resource }: { resource: { path: string } }) => (
      fakeMonacoState.markersByPath.get(resource.path) ?? []
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
  const treeButton = await screen.findByRole('button', { name: fileName });
  await act(async () => {
    fireEvent.click(treeButton);
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
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockReset();
    vi.mocked(window.electronAPI.codePaneReadGitBaseFile).mockReset();
    vi.mocked(window.electronAPI.codePaneWatchRoot).mockReset();
    vi.mocked(window.electronAPI.codePaneUnwatchRoot).mockReset();
    vi.mocked(window.electronAPI.codePaneSearchFiles).mockReset();
    vi.mocked(window.electronAPI.codePaneSearchContents).mockReset();
    vi.mocked(window.electronAPI.onCodePaneFsChanged).mockReset();
    vi.mocked(window.electronAPI.offCodePaneFsChanged).mockReset();
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
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockResolvedValue({
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

  it('shows changed files in the SCM tab and opens a diff from there', async () => {
    vi.mocked(window.electronAPI.codePaneGetGitStatus).mockResolvedValue({
      success: true,
      data: [
        {
          path: '/workspace/project/src/index.ts',
          status: 'modified',
        },
      ],
    });

    renderCodePane(createPane());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'codePane.scmTab' }));
    });

    expect(await screen.findByText('index.ts')).toBeInTheDocument();

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
