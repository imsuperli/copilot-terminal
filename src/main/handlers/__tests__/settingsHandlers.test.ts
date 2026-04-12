import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSettingsHandlers } from '../settingsHandlers';
import type { HandlerContext } from '../HandlerContext';
import type { Workspace } from '../../types/workspace';

const { mockIpcHandle } = vi.hoisted(() => ({
  mockIpcHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
  app: {
    getFileIcon: vi.fn(),
  },
}));

function getRegisteredHandler(channel: string) {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  expect(call, `IPC handler ${channel} should be registered`).toBeTruthy();
  return call?.[1] as (event: unknown, payload?: unknown) => Promise<unknown>;
}

function createWorkspace(): Workspace {
  return {
    version: '3.0',
    windows: [],
    groups: [],
    lastSavedAt: '2026-04-12T00:00:00.000Z',
    settings: {
      notificationsEnabled: true,
      theme: 'dark',
      autoSave: true,
      autoSaveInterval: 5,
      language: 'zh-CN',
      ides: [],
      terminal: {
        useBundledConptyDll: true,
        defaultShellProgram: '',
      },
      tmux: {
        enabled: true,
        autoInjectPath: true,
        enableForAllPanes: true,
      },
      features: {
        sshEnabled: true,
      },
      chat: {
        providers: [
          {
            id: 'provider-1',
            type: 'anthropic',
            name: 'Claude',
            apiKey: 'secret-key',
            models: ['claude-3-7-sonnet-latest'],
            defaultModel: 'claude-3-7-sonnet-latest',
          },
        ],
        activeProviderId: 'provider-1',
        defaultSystemPrompt: 'helpful',
        enableCommandSecurity: true,
      },
    },
  };
}

describe('registerSettingsHandlers', () => {
  beforeEach(() => {
    mockIpcHandle.mockReset();
  });

  it('loads workspace settings lazily when current workspace has not been initialized yet', async () => {
    const workspace = createWorkspace();
    let currentWorkspace: Workspace | null = null;
    const setCurrentWorkspace = vi.fn((nextWorkspace: Workspace | null) => {
      currentWorkspace = nextWorkspace;
    });
    const workspaceManager = {
      loadWorkspace: vi.fn().mockResolvedValue(workspace),
      saveWorkspace: vi.fn(),
    };

    const ctx = {
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace,
      getCurrentWorkspace: () => currentWorkspace,
      setCurrentWorkspace,
    } as unknown as HandlerContext;

    registerSettingsHandlers(ctx);
    const getSettingsHandler = getRegisteredHandler('get-settings');

    const response = await getSettingsHandler({});

    expect(workspaceManager.loadWorkspace).toHaveBeenCalledTimes(1);
    expect(setCurrentWorkspace).toHaveBeenCalled();
    expect(response).toEqual({
      success: true,
      data: {
        ...workspace.settings,
        chat: {
          ...workspace.settings.chat,
          providers: [
            {
              ...workspace.settings.chat!.providers[0],
              apiKey: '',
            },
          ],
        },
      },
    });
  });

  it('returns provider settings even when chat provider vault hydration fails', async () => {
    const workspace = createWorkspace();
    workspace.settings.chat!.providers[0].apiKey = '';

    let currentWorkspace: Workspace | null = workspace;
    const setCurrentWorkspace = vi.fn((nextWorkspace: Workspace | null) => {
      currentWorkspace = nextWorkspace;
    });
    const workspaceManager = {
      loadWorkspace: vi.fn(),
      saveWorkspace: vi.fn(),
    };
    const chatProviderVaultService = {
      hydrateProviders: vi.fn().mockRejectedValue(new SyntaxError('Unexpected non-whitespace character after JSON')),
    };

    const ctx = {
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      chatProviderVaultService,
      currentWorkspace,
      getCurrentWorkspace: () => currentWorkspace,
      setCurrentWorkspace,
    } as unknown as HandlerContext;

    registerSettingsHandlers(ctx);
    const getSettingsHandler = getRegisteredHandler('get-settings');

    const response = await getSettingsHandler({});

    expect(chatProviderVaultService.hydrateProviders).toHaveBeenCalledWith(workspace.settings.chat!.providers);
    expect(response).toEqual({
      success: true,
      data: {
        ...workspace.settings,
        chat: {
          ...workspace.settings.chat,
          providers: [
            {
              ...workspace.settings.chat!.providers[0],
              apiKey: '',
            },
          ],
        },
      },
    });
  });
});
