import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  CodePaneDiagnosticsChangedPayload,
  CodePaneLanguageWorkspaceChangedPayload,
  PluginRuntimeStateChangedPayload,
} from '../../../../shared/types/electron-api';
import type { PluginManifest } from '../../../../shared/types/plugin';
import type { ResolvedLanguagePlugin } from '../LanguagePluginResolver';
import { LanguageServerSupervisor } from '../LanguageServerSupervisor';
import { LanguageWorkspaceService } from '../LanguageWorkspaceService';
import { spawnRuntimeProcess, type LanguageRuntimeAdapter } from '../runtime/shared';

describe('LanguageServerSupervisor', () => {
  let tempDir: string;
  let supervisor: LanguageServerSupervisor | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-terminal-language-supervisor-'));
  });

  afterEach(async () => {
    await supervisor?.resetSessions();
    await fs.remove(tempDir);
  });

  it('proxies LSP requests, diagnostics, and runtime state changes through a spawned language server', async () => {
    const workspaceRoot = path.join(tempDir, 'workspace');
    const installPath = path.join(tempDir, 'plugin-install');
    const filePath = path.join(workspaceRoot, 'src', 'Main.java');
    await fs.ensureDir(path.dirname(filePath));
    await fs.ensureDir(installPath);
    await fs.writeFile(filePath, 'problem in source');

    const diagnosticsEvents: CodePaneDiagnosticsChangedPayload[] = [];
    const runtimeEvents: PluginRuntimeStateChangedPayload[] = [];
    const workspaceEvents: CodePaneLanguageWorkspaceChangedPayload[] = [];
    const workspaceService = new LanguageWorkspaceService({
      emitState: (payload) => {
        workspaceEvents.push(payload);
      },
      now: () => '2026-04-12T00:00:00.000Z',
    });

    supervisor = new LanguageServerSupervisor({
      runtimeRootPath: path.join(tempDir, 'runtime'),
      adapters: [createNodeFixtureAdapter()],
      emitDiagnostics: (payload) => {
        diagnosticsEvents.push(payload);
      },
      emitRuntimeState: (payload) => {
        runtimeEvents.push(payload);
      },
      workspaceService,
      now: () => '2026-04-12T00:00:00.000Z',
      requestTimeoutMs: 5000,
      idleSessionTtlMs: 0,
    });

    const resolution = createResolution(workspaceRoot, installPath);

    await supervisor.syncDocument(resolution, {
      ownerId: 'pane-1:/workspace/src/Main.java',
      rootPath: workspaceRoot,
      filePath,
      languageId: 'java',
      content: 'problem in source',
    }, 'open');

    await waitForCondition(() => diagnosticsEvents.length > 0);
    expect(runtimeEvents.map((event) => event.state)).toEqual(expect.arrayContaining(['starting', 'running']));
    await waitForCondition(() => workspaceEvents.some((event) => event.state.phase === 'ready'));
    expect(workspaceEvents.map((event) => event.state.phase)).toEqual(expect.arrayContaining([
      'starting-runtime',
      'importing-project',
      'ready',
    ]));
    expect(diagnosticsEvents[0]).toMatchObject({
      rootPath: workspaceRoot,
      filePath,
      diagnostics: [
        {
          filePath,
          owner: 'language-plugin',
          severity: 'warning',
          message: 'Mock warning',
          source: 'mock-lsp',
          code: 'MOCK001',
        },
      ],
    });

    const definitions = await supervisor.getDefinition(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    });
    expect(definitions).toEqual([
      {
        filePath,
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
      },
    ]);

    const hover = await supervisor.getHover(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    });
    expect(hover).toEqual({
      contents: [
        {
          kind: 'markdown',
          value: '**Mock Hover**',
        },
      ],
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 5,
      },
    });

    const references = await supervisor.getReferences(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    });
    expect(references).toEqual([
      {
        filePath,
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
      },
    ]);

    const documentHighlights = await supervisor.getDocumentHighlights(resolution, filePath, {
      lineNumber: 1,
      column: 15,
    });
    expect(documentHighlights).toEqual([
      {
        range: {
          startLineNumber: 1,
          startColumn: 14,
          endLineNumber: 1,
          endColumn: 19,
        },
        kind: 'read',
      },
    ]);

    const symbols = await supervisor.getDocumentSymbols(resolution, filePath);
    expect(symbols).toEqual([
      {
        name: 'Main',
        detail: 'class',
        kind: 5,
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 3,
          endColumn: 1,
        },
        selectionRange: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
      },
    ]);

    const implementations = await supervisor.getImplementations(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    });
    expect(implementations).toEqual([
      {
        filePath,
        range: {
          startLineNumber: 5,
          startColumn: 3,
          endLineNumber: 5,
          endColumn: 13,
        },
      },
    ]);

    const completions = await supervisor.getCompletionItems(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    });
    expect(completions).toEqual([
      {
        label: 'mockCompletion',
        detail: 'Mock detail',
        documentation: '**Mock Completion**',
        kind: 3,
        insertText: 'mockCompletion()',
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
      },
    ]);

    const signatureHelp = await supervisor.getSignatureHelp(resolution, filePath, {
      lineNumber: 1,
      column: 5,
    }, {
      triggerCharacter: '(',
    });
    expect(signatureHelp).toEqual({
      signatures: [
        {
          label: 'mockCompletion(value: string)',
          documentation: '**Mock Signature**',
          parameters: [
            {
              label: 'value: string',
              documentation: 'value parameter',
            },
          ],
        },
      ],
      activeSignature: 0,
      activeParameter: 0,
    });

    const renameEdits = await supervisor.renameSymbol(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    }, 'RenamedMain');
    expect(renameEdits).toEqual([
      {
        filePath,
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
        newText: 'RenamedMain',
      },
    ]);

    const formattingEdits = await supervisor.formatDocument(resolution, filePath, {
      tabSize: 2,
      insertSpaces: true,
    });
    expect(formattingEdits).toEqual([
      {
        filePath,
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
        newText: 'Main',
      },
    ]);

    const workspaceSymbols = await supervisor.getWorkspaceSymbols(resolution, 'Main', 20);
    expect(workspaceSymbols).toEqual([
      {
        name: 'Main',
        kind: 5,
        filePath,
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
        containerName: 'mock',
      },
    ]);

    const codeActions = await supervisor.getCodeActions(resolution, filePath, {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 5,
    });
    expect(codeActions).toEqual([
      {
        id: 'code-action-1',
        title: 'Add missing import',
        kind: 'quickfix',
        isPreferred: true,
      },
      {
        id: 'code-action-2',
        title: 'Organize imports',
        kind: 'source.organizeImports',
      },
    ]);

    const quickFixEdits = await supervisor.runCodeAction(resolution, filePath, 'code-action-1');
    expect(quickFixEdits).toEqual([
      {
        filePath,
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        },
        newText: 'import mock.Dependency;\n',
      },
    ]);

    const organizeImportsEdits = await supervisor.runCodeAction(resolution, filePath, 'code-action-2');
    expect(organizeImportsEdits).toEqual([
      {
        filePath,
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        },
        newText: '// organized\n',
      },
    ]);

    await supervisor.closeDocument(resolution, 'pane-1:/workspace/src/Main.java', filePath);

    await waitForCondition(() => runtimeEvents.some((event) => event.state === 'stopped'));
    expect(diagnosticsEvents.at(-1)).toEqual({
      rootPath: workspaceRoot,
      filePath,
      diagnostics: [],
    });
  });

  it('backs off restarting a language server that just failed to initialize', async () => {
    const workspaceRoot = path.join(tempDir, 'workspace');
    const installPath = path.join(tempDir, 'plugin-install');
    const filePath = path.join(workspaceRoot, 'src', 'Main.java');
    await fs.ensureDir(path.dirname(filePath));
    await fs.ensureDir(installPath);
    await fs.writeFile(filePath, 'class Main {}');

    let spawnCount = 0;

    supervisor = new LanguageServerSupervisor({
      runtimeRootPath: path.join(tempDir, 'runtime'),
      adapters: [createFailingNodeAdapter(() => {
        spawnCount += 1;
      })],
      emitDiagnostics: () => {},
      emitRuntimeState: () => {},
      restartBackoffMs: 60_000,
    });

    const resolution = createResolution(workspaceRoot, installPath);

    await expect(supervisor.syncDocument(resolution, {
      ownerId: 'pane-1:/workspace/src/Main.java',
      rootPath: workspaceRoot,
      filePath,
      languageId: 'java',
      content: 'class Main {}',
    }, 'open')).rejects.toThrow('startup failed');

    await expect(supervisor.getHover(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    })).rejects.toThrow('startup failed');

    expect(spawnCount).toBe(1);
  });

  it('surfaces transport failures without uncaught EPIPE crashes', async () => {
    const workspaceRoot = path.join(tempDir, 'workspace');
    const installPath = path.join(tempDir, 'plugin-install');
    const filePath = path.join(workspaceRoot, 'src', 'main.py');
    await fs.ensureDir(path.dirname(filePath));
    await fs.ensureDir(installPath);
    await fs.writeFile(filePath, 'print("hello")\n');

    const runtimeEvents: PluginRuntimeStateChangedPayload[] = [];

    supervisor = new LanguageServerSupervisor({
      runtimeRootPath: path.join(tempDir, 'runtime'),
      adapters: [createShortLivedNodeAdapter()],
      emitDiagnostics: () => {},
      emitRuntimeState: (payload) => {
        runtimeEvents.push(payload);
      },
      requestTimeoutMs: 1000,
    });

    const resolution = createResolution(workspaceRoot, installPath);

    await expect(supervisor.syncDocument(resolution, {
      ownerId: 'pane-1:/workspace/src/main.py',
      rootPath: workspaceRoot,
      filePath,
      languageId: 'python',
      content: 'print("hello")\n',
    }, 'open')).rejects.toThrow();

    await waitForCondition(() => runtimeEvents.some((event) => event.state === 'error'));

    await expect(supervisor.getHover(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    })).rejects.toThrow();
  });

  it('keeps idle sessions warm until the configured ttl expires', async () => {
    const workspaceRoot = path.join(tempDir, 'workspace');
    const installPath = path.join(tempDir, 'plugin-install');
    const filePath = path.join(workspaceRoot, 'src', 'Main.java');
    await fs.ensureDir(path.dirname(filePath));
    await fs.ensureDir(installPath);
    await fs.writeFile(filePath, 'class Main {}');

    const runtimeEvents: PluginRuntimeStateChangedPayload[] = [];

    supervisor = new LanguageServerSupervisor({
      runtimeRootPath: path.join(tempDir, 'runtime'),
      adapters: [createNodeFixtureAdapter()],
      emitDiagnostics: () => {},
      emitRuntimeState: (payload) => {
        runtimeEvents.push(payload);
      },
      idleSessionTtlMs: 120,
      requestTimeoutMs: 5000,
    });

    const resolution = createResolution(workspaceRoot, installPath);

    await supervisor.syncDocument(resolution, {
      ownerId: 'pane-1:/workspace/src/Main.java',
      rootPath: workspaceRoot,
      filePath,
      languageId: 'java',
      content: 'class Main {}',
    }, 'open');

    await waitForCondition(() => runtimeEvents.some((event) => event.state === 'running'));
    runtimeEvents.length = 0;

    await supervisor.closeDocument(resolution, 'pane-1:/workspace/src/Main.java', filePath);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(runtimeEvents.some((event) => event.state === 'stopped')).toBe(false);

    await supervisor.prewarmSession(resolution);
    expect(runtimeEvents.some((event) => event.state === 'starting')).toBe(false);

    await supervisor.syncDocument(resolution, {
      ownerId: 'pane-1:/workspace/src/Main.java',
      rootPath: workspaceRoot,
      filePath,
      languageId: 'java',
      content: 'class Main {}',
    }, 'open');
    await supervisor.closeDocument(resolution, 'pane-1:/workspace/src/Main.java', filePath);
    await new Promise((resolve) => setTimeout(resolve, 140));

    expect(runtimeEvents.some((event) => event.state === 'stopped')).toBe(true);
  });

  it('returns read-only virtual class definitions for JDTLS dependency symbols', async () => {
    const workspaceRoot = path.join(tempDir, 'workspace');
    const installPath = path.join(tempDir, 'plugin-install');
    const filePath = path.join(workspaceRoot, 'src', 'Main.java');
    await fs.ensureDir(path.dirname(filePath));
    await fs.ensureDir(installPath);
    await fs.writeFile(filePath, 'class Main {}');

    supervisor = new LanguageServerSupervisor({
      runtimeRootPath: path.join(tempDir, 'runtime'),
      adapters: [createNodeFixtureAdapter()],
      emitDiagnostics: () => {},
      emitRuntimeState: () => {},
      requestTimeoutMs: 5000,
    });

    const resolution = createResolution(workspaceRoot, installPath, {
      pluginId: 'official.java-jdtls',
    });

    await supervisor.syncDocument(resolution, {
      ownerId: 'pane-1:/workspace/src/Main.java',
      rootPath: workspaceRoot,
      filePath,
      languageId: 'java',
      content: 'class Main {}',
    }, 'open');

    const definitions = await supervisor.getDefinition(resolution, filePath, {
      lineNumber: 1,
      column: 2,
    });

    expect(definitions).toEqual([
      {
        filePath: 'jdt://contents/java.base/java/lang/String.class?=mock',
        uri: 'jdt://contents/java.base/java/lang/String.class?=mock',
        displayPath: 'External Libraries/java.base/java/lang/String.java',
        readOnly: true,
        language: 'java',
        content: expect.stringContaining('public final class String'),
        range: {
          startLineNumber: 11,
          startColumn: 5,
          endLineNumber: 11,
          endColumn: 11,
        },
      },
    ]);
  });
});

function createNodeFixtureAdapter(): LanguageRuntimeAdapter {
  const fixturePath = path.join(__dirname, 'fixtures', 'mockLspServer.cjs');

  return {
    supports: (runtime) => runtime.type === 'node',
    async spawn(_runtime, context) {
      return spawnRuntimeProcess(process.execPath, [fixturePath], {
        cwd: context.projectRoot,
        env: process.env,
      });
    },
  };
}

function createFailingNodeAdapter(onSpawn: () => void): LanguageRuntimeAdapter {
  return {
    supports: (runtime) => runtime.type === 'node',
    async spawn(_runtime, context) {
      onSpawn();
      return spawnRuntimeProcess(process.execPath, ['-e', 'process.stderr.write("startup failed\\n"); process.exit(1);'], {
        cwd: context.projectRoot,
        env: process.env,
      });
    },
  };
}

function createShortLivedNodeAdapter(): LanguageRuntimeAdapter {
  return {
    supports: (runtime) => runtime.type === 'node',
    async spawn(_runtime, context) {
      return spawnRuntimeProcess(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 10)'], {
        cwd: context.projectRoot,
        env: process.env,
      });
    },
  };
}

function createResolution(
  workspaceRoot: string,
  installPath: string,
  options?: {
    pluginId?: string;
  },
): ResolvedLanguagePlugin {
  const manifest: PluginManifest = {
    schemaVersion: 1,
    id: options?.pluginId ?? 'acme.java-language',
    name: 'Java Language Support',
    publisher: 'Acme',
    version: '1.0.0',
    engines: {
      app: '>=3.0.0',
    },
    capabilities: [
      {
        type: 'language-server',
        languages: ['java'],
        runtime: {
          type: 'node',
          entry: path.join(__dirname, 'fixtures', 'mockLspServer.cjs'),
        },
      },
    ],
  };

  return {
    pluginId: manifest.id,
    record: {
      source: 'marketplace',
      installedVersion: manifest.version,
      installPath,
      enabledByDefault: true,
      status: 'installed',
    },
    manifest,
    capability: manifest.capabilities[0],
    workspaceRoot,
    projectRoot: workspaceRoot,
    languageId: 'java',
    registry: {
      schemaVersion: 1,
      plugins: {},
      globalPluginSettings: {},
    },
    globalSettings: {},
    workspaceSettings: {},
    mergedSettings: {},
  };
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Timed out waiting for condition');
}
