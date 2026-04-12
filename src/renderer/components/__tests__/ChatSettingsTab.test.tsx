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
});
