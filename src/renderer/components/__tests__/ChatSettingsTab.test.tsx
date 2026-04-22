import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatSettingsTab } from '../ChatSettingsTab';
import { I18nProvider } from '../../i18n';

describe('ChatSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(window.electronAPI.updateSettings).mockImplementation(async (settings: any) => ({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: settings.chat,
      } as any,
    }));
    vi.mocked(window.electronAPI.validateChatProvider).mockResolvedValue({
      success: true,
      data: {
        resolvedType: 'anthropic',
        model: 'claude-sonnet-4-5',
        detectedModels: ['claude-sonnet-4-5'],
        modelListSupported: true,
      },
    });
  });

  it('adds a provider through the detection dialog and persists the chat settings payload', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });

    vi.mocked(window.electronAPI.validateChatProvider)
      .mockResolvedValueOnce({
        success: true,
        data: {
          resolvedType: 'anthropic',
          detectedModels: ['claude-sonnet-4-5', 'claude-opus-4-1'],
          modelListSupported: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          resolvedType: 'anthropic',
          model: 'claude-sonnet-4-5',
          detectedModels: ['claude-sonnet-4-5', 'claude-opus-4-1'],
          modelListSupported: true,
        },
      });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '添加 Provider' }));
    await user.type(screen.getByLabelText('Provider 名称'), 'Claude API');
    await user.type(screen.getByLabelText('API Key'), 'sk-ant-test');
    await user.click(screen.getByRole('button', { name: '自动探测' }));

    expect(await screen.findByText('探测结果')).toBeInTheDocument();
    await user.click(screen.getByLabelText('claude-opus-4-1'));
    await user.selectOptions(screen.getByLabelText('默认模型'), 'claude-sonnet-4-5');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(window.electronAPI.validateChatProvider).toHaveBeenNthCalledWith(1, {
        baseUrl: undefined,
        apiKey: 'sk-ant-test',
      });
      expect(window.electronAPI.validateChatProvider).toHaveBeenNthCalledWith(2, {
        type: 'anthropic',
        baseUrl: undefined,
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-5',
      });
      expect(window.electronAPI.updateSettings).toHaveBeenCalledWith({
        chat: {
          providers: [
            expect.objectContaining({
              name: 'Claude API',
              type: 'anthropic',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            }),
          ],
          activeProviderId: expect.any(String),
          defaultSystemPrompt: '',
          enableCommandSecurity: true,
        },
      });
    });
  });

  it('falls back to manual models when model discovery is unavailable', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });

    vi.mocked(window.electronAPI.validateChatProvider)
      .mockResolvedValueOnce({
        success: true,
        data: {
          resolvedType: 'openai-compatible',
          resolvedWireApi: 'responses',
          normalizedBaseUrl: 'https://api.example.com/codex',
          detectedModels: [],
          modelListSupported: false,
          modelListError: 'Settlement blocked',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          resolvedType: 'openai-compatible',
          resolvedWireApi: 'responses',
          normalizedBaseUrl: 'https://api.example.com/codex',
          model: 'gpt-5.4',
          detectedModels: [],
          modelListSupported: false,
          modelListError: 'Settlement blocked',
        },
      });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '添加 Provider' }));
    await user.type(screen.getByLabelText('Provider 名称'), 'Codex Gateway');
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.com/codex');
    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: '自动探测' }));

    expect(await screen.findByText(/模型列表自动探测失败/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('模型列表'), 'gpt-5.4');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(window.electronAPI.updateSettings).toHaveBeenCalledWith({
        chat: {
          providers: [
            expect.objectContaining({
              name: 'Codex Gateway',
              type: 'openai-compatible',
              baseUrl: 'https://api.example.com/codex',
              wireApi: 'responses',
              apiKey: 'sk-test',
              models: ['gpt-5.4'],
              defaultModel: 'gpt-5.4',
            }),
          ],
          activeProviderId: expect.any(String),
          defaultSystemPrompt: '',
          enableCommandSecurity: true,
        },
      });
    });
  });

  it('requires running detection before saving a provider', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '添加 Provider' }));
    await user.type(screen.getByLabelText('Provider 名称'), 'Claude API');
    await user.type(screen.getByLabelText('API Key'), 'sk-ant-test');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(window.electronAPI.updateSettings).not.toHaveBeenCalled();
    expect(await screen.findByText('请先完成自动探测，再保存 Provider。')).toBeInTheDocument();
  });

  it('renders the provider dialog above the settings panel layer', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '添加 Provider' }));

    const providerNameInput = screen.getByLabelText('Provider 名称');
    const dialog = providerNameInput.closest('[role="dialog"]');

    expect(dialog).not.toBeNull();
    expect(dialog).toHaveStyle({ zIndex: '10021' });
  });

  it('rejects an invalid base url during detection', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '添加 Provider' }));
    await user.type(screen.getByLabelText('Provider 名称'), 'Codex Gateway');
    await user.type(screen.getByLabelText('Base URL'), 'sk-test');
    await user.type(screen.getByLabelText('API Key'), 'sk-valid');
    await user.click(screen.getByRole('button', { name: '自动探测' }));

    expect(window.electronAPI.validateChatProvider).not.toHaveBeenCalled();
    expect(await screen.findByText('Base URL 必须是合法的 http:// 或 https:// 地址。')).toBeInTheDocument();
  });

  it('rejects an api key that looks like a url', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '添加 Provider' }));
    await user.type(screen.getByLabelText('Provider 名称'), 'Codex Gateway');
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.com/v1');
    await user.type(screen.getByLabelText('API Key'), 'https://api.example.com/v1');
    await user.click(screen.getByRole('button', { name: '自动探测' }));

    expect(window.electronAPI.validateChatProvider).not.toHaveBeenCalled();
    expect(await screen.findByText('API Key 不能以 http:// 或 https:// 开头。')).toBeInTheDocument();
  });

  it('keeps the dialog open when persistence fails', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [],
          enableCommandSecurity: true,
        },
      } as any,
    });
    vi.mocked(window.electronAPI.updateSettings).mockResolvedValue({
      success: false,
      error: 'persist failed',
    });
    vi.mocked(window.electronAPI.validateChatProvider)
      .mockResolvedValueOnce({
        success: true,
        data: {
          resolvedType: 'anthropic',
          detectedModels: ['claude-sonnet-4-5'],
          modelListSupported: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          resolvedType: 'anthropic',
          model: 'claude-sonnet-4-5',
          detectedModels: ['claude-sonnet-4-5'],
          modelListSupported: true,
        },
      });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '添加 Provider' }));
    await user.type(screen.getByLabelText('Provider 名称'), 'Claude API');
    await user.type(screen.getByLabelText('API Key'), 'sk-ant-test');
    await user.click(screen.getByRole('button', { name: '自动探测' }));
    await screen.findByText('探测结果');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('persist failed')).toBeInTheDocument();
    expect(screen.getByLabelText('Provider 名称')).toHaveValue('Claude API');
  });

  it('updates command security from the defaults section', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      success: true,
      data: {
        language: 'zh-CN',
        ides: [],
        chat: {
          providers: [
            {
              id: 'provider-1',
              type: 'anthropic',
              name: 'Claude API',
              apiKey: 'sk-ant-test',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
          defaultSystemPrompt: 'You are a careful ops assistant.',
        },
      } as any,
    });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('switch', { name: '启用命令安全检查' }));

    await waitFor(() => {
      expect(window.electronAPI.updateSettings).toHaveBeenCalledWith({
        chat: {
          providers: [
            expect.objectContaining({
              id: 'provider-1',
            }),
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: false,
          defaultSystemPrompt: 'You are a careful ops assistant.',
        },
      });
    });
  });
});
