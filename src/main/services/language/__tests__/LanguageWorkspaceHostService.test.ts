import { describe, expect, it, vi } from 'vitest';
import type {
  CodePaneLanguageWorkspaceState,
  CodePaneLanguagePrewarmConfig,
} from '../../../../../shared/types/electron-api';
import type { Workspace } from '../../../types/workspace';
import type { LanguageFeatureService } from '../LanguageFeatureService';
import { LanguageWorkspaceHostService } from '../LanguageWorkspaceHostService';

describe('LanguageWorkspaceHostService', () => {
  it('deduplicates prewarm work for multiple panes on the same project', async () => {
    const { service, languageFeatureService } = createService();
    const config = {
      paneId: 'pane-1',
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/Main.java',
      language: 'java',
    };

    vi.mocked(languageFeatureService.getWorkspaceState)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(createReadyState());
    let resolvePrewarm: (() => void) | null = null;
    vi.mocked(languageFeatureService.prewarmWorkspace).mockImplementation(() => (
      new Promise((resolve) => {
        resolvePrewarm = () => resolve();
      })
    ));

    const firstAttach = service.attachPane(config);
    const secondAttach = service.attachPane({
      ...config,
      paneId: 'pane-2',
    });

    await Promise.resolve();

    expect(languageFeatureService.prewarmWorkspace).toHaveBeenCalledTimes(1);

    resolvePrewarm?.();

    const [firstResult, secondResult] = await Promise.all([firstAttach, secondAttach]);
    expect(firstResult).toMatchObject({ phase: 'ready' });
    expect(secondResult).toMatchObject({ phase: 'ready' });
  });

  it('returns current workspace state without prewarming when already ready', async () => {
    const { service, languageFeatureService } = createService();
    vi.mocked(languageFeatureService.getWorkspaceState).mockResolvedValue(createReadyState());

    const result = await service.attachPane({
      paneId: 'pane-1',
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/Main.java',
      language: 'java',
    });

    expect(result).toMatchObject({ phase: 'ready' });
    expect(languageFeatureService.prewarmWorkspace).not.toHaveBeenCalled();
  });

  it('detaches pane registrations cleanly', async () => {
    const { service, languageFeatureService } = createService();
    vi.mocked(languageFeatureService.getWorkspaceState).mockResolvedValue(createReadyState());

    await service.attachPane({
      paneId: 'pane-1',
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/Main.java',
      language: 'java',
    });

    service.detachPane('pane-1');
    service.detachPane('pane-1');

    const result = await service.getState({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/src/Main.java',
      language: 'java',
    });
    expect(result).toMatchObject({ phase: 'ready' });
  });

  it('prewarms a detected project language workspace from the project root', async () => {
    const { service, languageFeatureService, languagePluginResolver } = createService();
    vi.mocked(languagePluginResolver.resolveWorkspaceWarmup).mockResolvedValue({
      languageId: 'java',
      projectRoot: '/workspace/project',
      matchedIndicator: 'pom.xml',
    });
    vi.mocked(languageFeatureService.getWorkspaceState)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createReadyState());

    await service.prewarmProject('/workspace/project');

    expect(languagePluginResolver.resolveWorkspaceWarmup).toHaveBeenCalledWith('/workspace/project', undefined);
    expect(languageFeatureService.prewarmWorkspace).toHaveBeenCalledWith({
      rootPath: '/workspace/project',
      filePath: '/workspace/project/__workspace__.java',
      language: 'java',
    }, null);
  });
});

function createService() {
  const languageFeatureService = {
    prewarmWorkspace: vi.fn().mockResolvedValue(undefined),
    getWorkspaceState: vi.fn().mockResolvedValue(null),
  } as unknown as LanguageFeatureService & {
    prewarmWorkspace: ReturnType<typeof vi.fn>;
    getWorkspaceState: ReturnType<typeof vi.fn>;
  };
  const languagePluginResolver = {
    resolveWorkspaceWarmup: vi.fn().mockResolvedValue(null),
  };

  const workspace = null as Workspace | null;

  return {
    service: new LanguageWorkspaceHostService({
      languageFeatureService,
      languagePluginResolver: languagePluginResolver as any,
      getCurrentWorkspace: () => workspace,
    }),
    languageFeatureService,
    languagePluginResolver,
  };
}

function createReadyState(
  overrides?: Partial<CodePaneLanguageWorkspaceState>,
): CodePaneLanguageWorkspaceState {
  const baseConfig: CodePaneLanguagePrewarmConfig = {
    rootPath: '/workspace/project',
    filePath: '/workspace/project/src/Main.java',
    language: 'java',
  };

  return {
    pluginId: 'official.java-jdtls',
    workspaceRoot: baseConfig.rootPath,
    projectRoot: baseConfig.rootPath,
    languageId: 'java',
    runtimeState: 'running',
    phase: 'ready',
    readyFeatures: ['definition', 'hover'],
    timestamp: '2026-04-15T00:00:00.000Z',
    ...overrides,
  };
}
