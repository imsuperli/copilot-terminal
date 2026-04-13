import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  CodePaneDiagnosticsChangedPayload,
  PluginRuntimeStateChangedPayload,
} from '../../../../shared/types/electron-api';
import type { PluginManifest } from '../../../../shared/types/plugin';
import type { ResolvedLanguagePlugin } from '../LanguagePluginResolver';
import { LanguageServerSupervisor } from '../LanguageServerSupervisor';
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

    supervisor = new LanguageServerSupervisor({
      runtimeRootPath: path.join(tempDir, 'runtime'),
      adapters: [createNodeFixtureAdapter()],
      emitDiagnostics: (payload) => {
        diagnosticsEvents.push(payload);
      },
      emitRuntimeState: (payload) => {
        runtimeEvents.push(payload);
      },
      now: () => '2026-04-12T00:00:00.000Z',
      requestTimeoutMs: 5000,
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
    }, 'open')).rejects.toThrow('Language server exited with code 1');

    await expect(supervisor.getHover(resolution, filePath, {
      lineNumber: 1,
      column: 1,
    })).rejects.toThrow('Language server exited with code 1');

    expect(spawnCount).toBe(1);
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

function createResolution(workspaceRoot: string, installPath: string): ResolvedLanguagePlugin {
  const manifest: PluginManifest = {
    schemaVersion: 1,
    id: 'acme.java-language',
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
      globalLanguageBindings: {},
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
