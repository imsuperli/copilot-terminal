import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatSettingsTab } from '../ChatSettingsTab';
import { I18nProvider } from '../../i18n';

describe('ChatSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a provider and persists the chat settings payload', async () => {
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
    await user.type(screen.getByPlaceholderText(/claude-sonnet-4-5/), 'claude-sonnet-4-5');
    await user.type(screen.getByPlaceholderText('留空时默认使用模型列表中的第一项'), 'claude-sonnet-4-5');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
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

  it('persists responses wire API for openai-compatible providers', async () => {
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
    await user.selectOptions(screen.getByLabelText('Provider 类型'), 'openai-compatible');
    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.com/codex');
    const protocolSelect = screen.getByText('协议类型').closest('label')?.querySelector('select');
    expect(protocolSelect).not.toBeNull();
    await user.selectOptions(protocolSelect as HTMLSelectElement, 'responses');
    await user.type(screen.getByPlaceholderText(/claude-sonnet-4-5/), 'gpt-5.4');
    await user.type(screen.getByPlaceholderText('留空时默认使用模型列表中的第一项'), 'gpt-5.4');
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

  it('renders base url above api key in the provider form', async () => {
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

    const baseUrlInput = screen.getByLabelText('Base URL');
    const apiKeyInput = screen.getByLabelText('API Key');
    expect(baseUrlInput.compareDocumentPosition(apiKeyInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('rejects an openai-compatible provider when base url is not a valid http url', async () => {
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
    await user.selectOptions(screen.getByLabelText('Provider 类型'), 'openai-compatible');
    await user.type(screen.getByLabelText('Base URL'), 'sk-test');
    await user.type(screen.getByLabelText('API Key'), 'sk-valid');
    await user.type(screen.getByPlaceholderText(/claude-sonnet-4-5/), 'gpt-5.4');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(window.electronAPI.updateSettings).not.toHaveBeenCalled();
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
    await user.selectOptions(screen.getByLabelText('Provider 类型'), 'openai-compatible');
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.com/v1');
    await user.type(screen.getByLabelText('API Key'), 'https://api.example.com/v1');
    await user.type(screen.getByPlaceholderText(/claude-sonnet-4-5/), 'gpt-5.4');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(window.electronAPI.updateSettings).not.toHaveBeenCalled();
    expect(await screen.findByText('API Key 不能以 http:// 或 https:// 开头。')).toBeInTheDocument();
  });

  it('does not re-add a deleted model when the previous default model was removed', async () => {
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
              models: ['claude-sonnet-4-5', 'claude-sonnet-4-5-typo'],
              defaultModel: 'claude-sonnet-4-5-typo',
            },
          ],
          activeProviderId: 'provider-1',
          enableCommandSecurity: true,
        },
      } as any,
    });

    render(
      <I18nProvider>
        <ChatSettingsTab />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '编辑' }));
    await user.clear(screen.getByPlaceholderText(/每行一个模型/));
    await user.type(screen.getByPlaceholderText(/每行一个模型/), 'claude-sonnet-4-5');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(window.electronAPI.updateSettings).toHaveBeenCalledWith({
        chat: {
          providers: [
            expect.objectContaining({
              id: 'provider-1',
              models: ['claude-sonnet-4-5'],
              defaultModel: 'claude-sonnet-4-5',
            }),
          ],
          activeProviderId: 'provider-1',
          defaultSystemPrompt: '',
          enableCommandSecurity: true,
        },
      });
    });

    await user.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByPlaceholderText(/每行一个模型/)).toHaveValue('claude-sonnet-4-5');
    expect(screen.getByPlaceholderText('留空时默认使用模型列表中的第一项')).toHaveValue('claude-sonnet-4-5');
  });
});
