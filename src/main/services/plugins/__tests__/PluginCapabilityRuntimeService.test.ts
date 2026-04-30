import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnRuntimeProcess } from '../../language/runtime/shared';
import { PluginCapabilityRuntimeService } from '../PluginCapabilityRuntimeService';
import { PluginRegistryStore } from '../PluginRegistryStore';

describe('PluginCapabilityRuntimeService', () => {
  let tempDir: string;
  let registryStore: PluginRegistryStore;
  let runtimeRootPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-plugin-runtime-service-'));
    registryStore = new PluginRegistryStore({
      filePath: path.join(tempDir, 'registry.json'),
    });
    runtimeRootPath = path.join(tempDir, 'runtime');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('formats and lints documents through one-shot plugin runtimes', async () => {
    const pluginPath = path.join(tempDir, 'polyglot-tooling');
    await writePlugin(pluginPath, {
      schemaVersion: 1,
      id: 'acme.polyglot-tooling',
      name: 'Polyglot Tooling',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'formatter',
          languages: ['python'],
          runtime: {
            type: 'binary',
            entry: 'runtime.mjs',
          },
        },
        {
          type: 'linter',
          languages: ['python'],
          runtime: {
            type: 'binary',
            entry: 'runtime.mjs',
          },
        },
      ],
    }, `#!${process.execPath}
import process from 'node:process';

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk.toString('utf8')));
process.stdin.on('end', () => {
  const request = JSON.parse(chunks.join('').trim());
  if (request.command === 'format-document') {
    process.stdout.write(JSON.stringify({
      content: request.content.toUpperCase(),
    }));
    return;
  }

  if (request.command === 'lint-document') {
    process.stdout.write(JSON.stringify({
      diagnostics: [{
        message: 'Unused import',
        severity: 'warning',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 7,
      }],
    }));
  }
});
`);
    await registryStore.upsert('acme.polyglot-tooling', {
      source: 'sideload',
      installedVersion: '1.0.0',
      installPath: pluginPath,
      enabledByDefault: true,
      status: 'installed',
    });

    const runtimeEvents: string[] = [];
    const service = new PluginCapabilityRuntimeService({
      registryStore,
      codeFileService: {
        readFile: vi.fn(),
      } as never,
      runtimeRootPath,
      runtimeAdapters: [createTestRuntimeAdapter()],
      emitRuntimeState: (payload) => {
        runtimeEvents.push(`${payload.pluginId}:${payload.state}`);
      },
    });

    const edits = await service.formatDocument({
      rootPath: '/workspace',
      filePath: '/workspace/project/app.py',
      language: 'python',
      content: 'print("hello")',
    });
    const diagnostics = await service.lintDocument({
      rootPath: '/workspace',
      filePath: '/workspace/project/app.py',
      language: 'python',
      content: 'import os',
    });

    expect(edits).toEqual([
      expect.objectContaining({
        filePath: '/workspace/project/app.py',
        newText: 'PRINT("HELLO")',
      }),
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        owner: 'acme.polyglot-tooling',
        message: 'Unused import',
      }),
    ]);
    expect(runtimeEvents).toEqual(expect.arrayContaining([
      'acme.polyglot-tooling:starting',
      'acme.polyglot-tooling:running',
      'acme.polyglot-tooling:stopped',
    ]));
  });

  it('returns plugin-provided test items', async () => {
    const pluginPath = path.join(tempDir, 'pytest-provider');
    await writePlugin(pluginPath, {
      schemaVersion: 1,
      id: 'acme.pytest-provider',
      name: 'Pytest Provider',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'test-provider',
          languages: ['python'],
          runtime: {
            type: 'binary',
            entry: 'runtime.mjs',
          },
        },
      ],
    }, `#!${process.execPath}
import process from 'node:process';

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk.toString('utf8')));
process.stdin.on('end', () => {
  const request = JSON.parse(chunks.join('').trim());
  process.stdout.write(JSON.stringify({
    items: [{
      id: 'pytest:file',
      label: 'test_app.py',
      kind: 'file',
      filePath: request.activeFilePath,
      target: {
        command: 'python',
        args: ['-m', 'pytest', request.activeFilePath],
      },
      children: [{
        id: 'pytest:case',
        label: 'test_add',
        kind: 'case',
        filePath: request.activeFilePath,
        target: {
          command: 'python',
          args: ['-m', 'pytest', request.activeFilePath + '::test_add'],
        },
      }],
    }],
  }));
});
`);
    await registryStore.upsert('acme.pytest-provider', {
      source: 'sideload',
      installedVersion: '1.0.0',
      installPath: pluginPath,
      enabledByDefault: true,
      status: 'installed',
    });

    const service = new PluginCapabilityRuntimeService({
      registryStore,
      codeFileService: {
        readFile: vi.fn(),
      } as never,
      runtimeRootPath,
      runtimeAdapters: [createTestRuntimeAdapter()],
    });

    const items = await service.listTests({
      rootPath: '/workspace',
      activeFilePath: '/workspace/tests/test_app.py',
    });

    expect(items).toEqual([
      expect.objectContaining({
        label: 'test_app.py',
        children: [
          expect.objectContaining({
            label: 'test_add',
            target: expect.objectContaining({
              command: 'python',
            }),
          }),
        ],
      }),
    ]);
  });

  it('creates a debug driver for plugin debug adapters', async () => {
    const pluginPath = path.join(tempDir, 'python-debug');
    await writePlugin(pluginPath, {
      schemaVersion: 1,
      id: 'acme.python-debug',
      name: 'Python Debug',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'debug-adapter',
          languages: ['python'],
          adapterType: 'acme-python',
          runtime: {
            type: 'binary',
            entry: 'debug-runtime.mjs',
          },
        },
      ],
    }, `#!${process.execPath}
import process from 'node:process';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  const request = JSON.parse(line);
  const respond = (result) => {
    process.stdout.write(JSON.stringify({
      id: request.id,
      ok: true,
      result,
    }) + '\\n');
  };

  switch (request.command) {
    case 'start':
      respond({
        state: 'paused',
        currentFrame: {
          id: 'frame-1',
          name: 'main',
          filePath: request.payload.target.filePath,
          lineNumber: 12,
          column: 3,
        },
        stackFrames: [{
          id: 'frame-1',
          name: 'main',
          filePath: request.payload.target.filePath,
          lineNumber: 12,
          column: 3,
        }],
        scopes: [{
          id: 'locals',
          name: 'Locals',
          variables: [{
            id: 'value',
            name: 'value',
            value: '1',
          }],
        }],
      });
      return;
    case 'evaluate':
      respond({
        value: 'eval:' + request.payload.expression,
        type: 'string',
      });
      return;
    case 'resume':
      respond({
        state: 'stopped',
        currentFrame: null,
        stackFrames: [],
        scopes: [],
        stopReason: 'terminated',
      });
      return;
    case 'stop':
      respond({});
      process.exit(0);
      return;
    default:
      respond({});
  }
});
`);
    await registryStore.upsert('acme.python-debug', {
      source: 'sideload',
      installedVersion: '1.0.0',
      installPath: pluginPath,
      enabledByDefault: true,
      status: 'installed',
    });

    const terminations: Array<{ exitCode: number | null; error?: string }> = [];
    const service = new PluginCapabilityRuntimeService({
      registryStore,
      codeFileService: {
        readFile: vi.fn(),
      } as never,
      runtimeRootPath,
      runtimeAdapters: [createTestRuntimeAdapter()],
    });
    const driver = await service.createDebugDriver({
      rootPath: '/workspace',
      target: {
        id: 'target-1',
        rootPath: '/workspace',
        label: 'app.py',
        detail: 'python app.py',
        kind: 'application',
        languageId: 'python',
        workingDirectory: '/workspace',
        filePath: '/workspace/app.py',
        command: 'python',
        args: ['app.py'],
        canDebug: true,
      },
      breakpoints: [],
      exceptionBreakpoints: [],
      callbacks: {
        onOutput: () => {},
        onTerminated: (result) => {
          terminations.push(result);
        },
      },
    });

    expect(driver?.adapterType).toBe('acme-python');
    const snapshot = await driver?.start();
    const evaluation = await driver?.evaluate('value');
    await driver?.stop();
    await waitFor(() => terminations.length > 0);

    expect(snapshot).toEqual(expect.objectContaining({
      state: 'paused',
      currentFrame: expect.objectContaining({
        lineNumber: 12,
      }),
    }));
    expect(evaluation).toEqual({
      value: 'eval:value',
      type: 'string',
    });
    expect(terminations[0]).toEqual({
      exitCode: 0,
    });
  });
});

async function writePlugin(pluginPath: string, manifest: Record<string, unknown>, runtimeSource: string): Promise<void> {
  await fs.ensureDir(pluginPath);
  await fs.writeJson(path.join(pluginPath, 'plugin.json'), manifest);
  const runtimeEntries = (manifest.capabilities as Array<{ runtime?: { entry?: string } }>)
    .map((capability) => capability.runtime?.entry)
    .filter((entry): entry is string => typeof entry === 'string');

  for (const entry of runtimeEntries) {
    const absoluteEntry = path.join(pluginPath, entry);
    await fs.ensureDir(path.dirname(absoluteEntry));
    await fs.writeFile(absoluteEntry, runtimeSource, 'utf8');
    await fs.chmod(absoluteEntry, 0o755);
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for condition');
}

function createTestRuntimeAdapter() {
  return {
    supports: () => true,
    async spawn(runtime: { entry: string; args?: string[] }, context: { pluginInstallPath: string; projectRoot: string }) {
      return spawnRuntimeProcess('node', [
        path.join(context.pluginInstallPath, runtime.entry),
        ...(runtime.args ?? []),
      ], {
        cwd: context.pluginInstallPath,
        env: process.env,
      });
    },
  };
}
