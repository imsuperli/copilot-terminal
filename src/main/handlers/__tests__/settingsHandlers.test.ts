import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSettingsHandlers } from '../settingsHandlers';
import type { HandlerContext } from '../HandlerContext';
import type { Workspace } from '../../types/workspace';

const {
  mockIpcHandle,
  mockAnthropicMessagesCreate,
  mockAnthropicModelsList,
  mockOpenAIResponsesCreate,
  mockOpenAIChatCompletionsCreate,
  mockOpenAIModelsList,
} = vi.hoisted(() => ({
  mockIpcHandle: vi.fn(),
  mockAnthropicMessagesCreate: vi.fn(),
  mockAnthropicModelsList: vi.fn(),
  mockOpenAIResponsesCreate: vi.fn(),
  mockOpenAIChatCompletionsCreate: vi.fn(),
  mockOpenAIModelsList: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
  app: {
    getFileIcon: vi.fn(),
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockAnthropicMessagesCreate,
    };

    models = {
      list: mockAnthropicModelsList,
    };
  },
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    models = {
      list: mockOpenAIModelsList,
    };

    responses = {
      create: mockOpenAIResponsesCreate,
    };

    chat = {
      completions: {
        create: mockOpenAIChatCompletionsCreate,
      },
    };
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
    mockAnthropicMessagesCreate.mockReset();
    mockAnthropicModelsList.mockReset();
    mockOpenAIResponsesCreate.mockReset();
    mockOpenAIChatCompletionsCreate.mockReset();
    mockOpenAIModelsList.mockReset();
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

  it('auto-detects responses endpoints for codex-style gateways even when model listing is unavailable', async () => {
    mockOpenAIModelsList.mockRejectedValue(new Error('Settlement blocked'));

    const workspace = createWorkspace();
    let currentWorkspace: Workspace | null = workspace;
    const ctx = {
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace,
      getCurrentWorkspace: () => currentWorkspace,
      setCurrentWorkspace: vi.fn((nextWorkspace: Workspace | null) => {
        currentWorkspace = nextWorkspace;
      }),
    } as unknown as HandlerContext;

    registerSettingsHandlers(ctx);
    const validateHandler = getRegisteredHandler('validate-chat-provider');

    const response = await validateHandler({}, {
      baseUrl: 'https://api.example.com/api/codex/backend-api/codex',
      apiKey: 'sk-test',
    });

    expect(mockOpenAIModelsList).toHaveBeenCalledTimes(1);
    expect(mockOpenAIResponsesCreate).not.toHaveBeenCalled();
    expect(mockOpenAIChatCompletionsCreate).not.toHaveBeenCalled();
    expect(mockAnthropicMessagesCreate).not.toHaveBeenCalled();
    expect(response).toEqual({
      success: true,
      data: {
        resolvedType: 'openai-compatible',
        resolvedWireApi: 'responses',
        normalizedBaseUrl: 'https://api.example.com/api/codex/backend-api/codex',
        detectedModels: [],
        modelListSupported: false,
        modelListError: 'Settlement blocked',
      },
    });
  });

  it('falls back to anthropic when an endpoint is an Anthropic relay', async () => {
    mockOpenAIModelsList.mockRejectedValue(new Error('Not an OpenAI models endpoint'));
    mockAnthropicModelsList.mockResolvedValue({
      data: [
        {
          id: 'claude-sonnet-4-5',
        },
      ],
    });

    const workspace = createWorkspace();
    let currentWorkspace: Workspace | null = workspace;
    const ctx = {
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace,
      getCurrentWorkspace: () => currentWorkspace,
      setCurrentWorkspace: vi.fn((nextWorkspace: Workspace | null) => {
        currentWorkspace = nextWorkspace;
      }),
    } as unknown as HandlerContext;

    registerSettingsHandlers(ctx);
    const validateHandler = getRegisteredHandler('validate-chat-provider');

    const response = await validateHandler({}, {
      baseUrl: 'https://relay.example.com',
      apiKey: 'sk-ant-test',
    });

    expect(mockOpenAIModelsList).toHaveBeenCalledTimes(2);
    expect(mockAnthropicModelsList).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      success: true,
      data: {
        resolvedType: 'anthropic',
        normalizedBaseUrl: 'https://relay.example.com',
        detectedModels: ['claude-sonnet-4-5'],
        modelListSupported: true,
      },
    });
  });

  it('validates the selected model after detection and keeps model list errors as warnings', async () => {
    mockOpenAIModelsList.mockRejectedValue(new Error('Settlement blocked'));
    mockOpenAIResponsesCreate.mockResolvedValue({
      output_text: 'pong',
      output: [],
    });

    const workspace = createWorkspace();
    let currentWorkspace: Workspace | null = workspace;
    const ctx = {
      mainWindow: null,
      processManager: null,
      statusPoller: null,
      viewSwitcher: null,
      workspaceManager: null,
      autoSaveManager: null,
      ptySubscriptionManager: null,
      gitBranchWatcher: null,
      currentWorkspace,
      getCurrentWorkspace: () => currentWorkspace,
      setCurrentWorkspace: vi.fn((nextWorkspace: Workspace | null) => {
        currentWorkspace = nextWorkspace;
      }),
    } as unknown as HandlerContext;

    registerSettingsHandlers(ctx);
    const validateHandler = getRegisteredHandler('validate-chat-provider');

    const response = await validateHandler({}, {
      type: 'openai-compatible',
      baseUrl: 'https://api.example.com/api/codex/backend-api/codex',
      apiKey: 'sk-test',
      model: 'gpt-5.4',
    });

    expect(mockOpenAIResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4',
        input: 'Reply with exactly: pong',
        stream: false,
      }),
      expect.any(Object),
    );
    expect(response).toEqual({
      success: true,
      data: {
        resolvedType: 'openai-compatible',
        resolvedWireApi: 'responses',
        normalizedBaseUrl: 'https://api.example.com/api/codex/backend-api/codex',
        model: 'gpt-5.4',
        detectedModels: [],
        modelListSupported: false,
        modelListError: 'Settlement blocked',
      },
    });
  });
});
