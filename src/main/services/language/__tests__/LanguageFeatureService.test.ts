import { describe, expect, it, vi } from 'vitest';
import type { CodePaneLocation } from '../../../../shared/types/electron-api';
import type { CodeFileService } from '../../code/CodeFileService';
import type { ResolvedLanguagePlugin } from '../LanguagePluginResolver';
import type { LanguagePluginResolver } from '../LanguagePluginResolver';
import type { LanguageServerSupervisor } from '../LanguageServerSupervisor';
import { LanguageFeatureService } from '../LanguageFeatureService';

describe('LanguageFeatureService', () => {
  const resolution = {
    pluginId: 'acme.java-language',
    record: {
      source: 'marketplace',
      installedVersion: '1.0.0',
      installPath: '/plugins/acme.java-language',
      enabledByDefault: true,
      status: 'installed',
    },
    manifest: {
      schemaVersion: 1,
      id: 'acme.java-language',
      name: 'Java Language Support',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [],
    },
    capability: {
      type: 'language-server',
      languages: ['java'],
      runtime: {
        type: 'java',
        entry: 'server/jdtls.jar',
      },
    },
    workspaceRoot: '/workspace',
    projectRoot: '/workspace/project',
    languageId: 'java',
    registry: {
      schemaVersion: 1,
      plugins: {},
      globalPluginSettings: {},
    },
    globalSettings: {},
    workspaceSettings: {},
    mergedSettings: {},
  } as ResolvedLanguagePlugin;

  it('uses pane-scoped owner ids when syncing an opened document', async () => {
    const { service, resolver, supervisor } = createService();
    resolver.resolve.mockResolvedValue(resolution);

    await service.openDocument({
      paneId: 'pane-1',
      rootPath: '/workspace',
      filePath: '/workspace/project/src/Main.java',
      language: 'java',
      content: 'class Main {}',
    }, null);

    expect(supervisor.syncDocument).toHaveBeenCalledWith(resolution, {
      ownerId: 'pane-1:/workspace/project/src/Main.java',
      rootPath: '/workspace',
      filePath: '/workspace/project/src/Main.java',
      languageId: 'java',
      content: 'class Main {}',
    }, 'open');
  });

  it('returns null hover when no language plugin resolves', async () => {
    const { service, resolver, codeFileService, supervisor } = createService();
    resolver.resolve.mockResolvedValue(null);

    const result = await service.getHover({
      rootPath: '/workspace',
      filePath: '/workspace/project/src/Main.java',
      language: 'java',
      position: {
        lineNumber: 1,
        column: 1,
      },
    }, null);

    expect(result).toBeNull();
    expect(codeFileService.readFile).not.toHaveBeenCalled();
    expect(supervisor.syncDocument).not.toHaveBeenCalled();
  });

  it('opens a transient document for feature requests when the renderer has not synced it', async () => {
    const { service, resolver, codeFileService, supervisor } = createService();
    const definition: CodePaneLocation[] = [
      {
        filePath: '/workspace/project/src/Main.java',
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
      },
    ];

    resolver.resolve.mockResolvedValue(resolution);
    supervisor.hasDocument.mockReturnValue(false);
    codeFileService.readFile.mockResolvedValue({
      content: 'class Main {}',
      mtimeMs: 1,
      size: 14,
      language: 'java',
      isBinary: false,
    });
    supervisor.getDefinition.mockResolvedValue(definition);

    const result = await service.getDefinition({
      rootPath: '/workspace',
      filePath: '/workspace/project/src/Main.java',
      language: 'java',
      position: {
        lineNumber: 1,
        column: 1,
      },
    }, null);

    expect(result).toEqual(definition);
    expect(codeFileService.readFile).toHaveBeenCalledWith({
      rootPath: '/workspace',
      filePath: '/workspace/project/src/Main.java',
    });
    expect(supervisor.syncDocument).toHaveBeenCalledWith(resolution, {
      ownerId: '__language-request__:/workspace/project/src/Main.java',
      rootPath: '/workspace',
      filePath: '/workspace/project/src/Main.java',
      languageId: 'java',
      content: 'class Main {}',
    }, 'open');
    expect(supervisor.closeDocument).toHaveBeenCalledWith(
      resolution,
      '__language-request__:/workspace/project/src/Main.java',
      '/workspace/project/src/Main.java',
    );
  });

  it('reuses already tracked documents without reading from disk again', async () => {
    const { service, resolver, codeFileService, supervisor } = createService();
    const references = [
      {
        filePath: '/workspace/project/src/Main.java',
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
        },
      },
    ];

    resolver.resolve.mockResolvedValue(resolution);
    supervisor.hasDocument.mockReturnValue(true);
    supervisor.getReferences.mockResolvedValue(references);

    const result = await service.getReferences({
      rootPath: '/workspace',
      filePath: '/workspace/project/src/Main.java',
      language: 'java',
      position: {
        lineNumber: 1,
        column: 1,
      },
    }, null);

    expect(result).toEqual(references);
    expect(codeFileService.readFile).not.toHaveBeenCalled();
    expect(supervisor.syncDocument).not.toHaveBeenCalled();
    expect(supervisor.closeDocument).not.toHaveBeenCalled();
  });

  it('invalidates resolver cache and clears running sessions on reset', async () => {
    const { service, resolver, supervisor } = createService();

    await service.resetSessions('acme.java-language');

    expect(resolver.invalidate).toHaveBeenCalledTimes(1);
    expect(supervisor.resetSessions).toHaveBeenCalledWith('acme.java-language');
  });

  it('reads virtual dependency documents through the language supervisor', async () => {
    const { service, resolver, supervisor } = createService();
    resolver.resolve.mockResolvedValue(resolution);
    supervisor.readVirtualDocument.mockResolvedValue({
      content: 'package java.lang;\npublic final class String {}\n',
      mtimeMs: 0,
      size: 47,
      language: 'java',
      isBinary: false,
      readOnly: true,
      documentUri: 'jdt://contents/java.base/java/lang/String.class?=mock',
      displayPath: 'External Libraries/java.base/java/lang/String.java',
    });

    const result = await service.readDocument({
      rootPath: '/workspace',
      filePath: 'jdt://contents/java.base/java/lang/String.class?=mock',
      documentUri: 'jdt://contents/java.base/java/lang/String.class?=mock',
    }, null);

    expect(result).toMatchObject({
      language: 'java',
      readOnly: true,
      documentUri: 'jdt://contents/java.base/java/lang/String.class?=mock',
    });
    expect(supervisor.readVirtualDocument).toHaveBeenCalledWith(
      resolution,
      'jdt://contents/java.base/java/lang/String.class?=mock',
    );
  });
});

function createService() {
  const codeFileService = {
    readFile: vi.fn(),
  } as unknown as CodeFileService & {
    readFile: ReturnType<typeof vi.fn>;
  };
  const resolver = {
    resolve: vi.fn(),
    invalidate: vi.fn(),
  } as unknown as LanguagePluginResolver & {
    resolve: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };
  const supervisor = {
    syncDocument: vi.fn(),
    closeDocument: vi.fn(),
    hasDocument: vi.fn(),
    getDefinition: vi.fn(),
    getHover: vi.fn(),
    getReferences: vi.fn(),
    getDocumentSymbols: vi.fn(),
    readVirtualDocument: vi.fn(),
    resetSessions: vi.fn(),
  } as unknown as LanguageServerSupervisor & {
    syncDocument: ReturnType<typeof vi.fn>;
    closeDocument: ReturnType<typeof vi.fn>;
    hasDocument: ReturnType<typeof vi.fn>;
    getDefinition: ReturnType<typeof vi.fn>;
    getHover: ReturnType<typeof vi.fn>;
    getReferences: ReturnType<typeof vi.fn>;
    getDocumentSymbols: ReturnType<typeof vi.fn>;
    readVirtualDocument: ReturnType<typeof vi.fn>;
    resetSessions: ReturnType<typeof vi.fn>;
  };

  return {
    service: new LanguageFeatureService({
      codeFileService,
      resolver,
      supervisor,
    }),
    codeFileService,
    resolver,
    supervisor,
  };
}
