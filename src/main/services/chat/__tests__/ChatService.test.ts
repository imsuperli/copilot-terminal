import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSendRequest } from '../../../../shared/types/chat';

const hoisted = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  openAICreateMock: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    messages = {
      create: hoisted.anthropicCreateMock,
    };
  },
}));

vi.mock('openai', () => ({
  default: class OpenAIMock {
    chat = {
      completions: {
        create: hoisted.openAICreateMock,
      },
    };
  },
}));

import { ChatService } from '../ChatService';

function createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

function createRequest(): ChatSendRequest & {
  _provider: {
    id: string;
    type: 'openai-compatible';
    name: string;
    apiKey: string;
    models: string[];
    defaultModel: string;
    baseUrl?: string;
  };
} {
  return {
    paneId: 'chat-pane-1',
    windowId: 'win-1',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'help me inspect the server',
        timestamp: new Date().toISOString(),
      },
    ],
    providerId: 'provider-1',
    model: 'gpt-5.4',
    enableTools: true,
    sshContext: {
      host: '10.0.0.20',
      user: 'root',
      cwd: '/srv/app',
      windowId: 'win-1',
      paneId: 'ssh-pane-1',
    },
    _provider: {
      id: 'provider-1',
      type: 'openai-compatible',
      name: 'Codex',
      apiKey: 'test-key',
      baseUrl: 'https://example.invalid/v1',
      models: ['gpt-5.4'],
      defaultModel: 'gpt-5.4',
    },
  };
}

describe('ChatService', () => {
  beforeEach(() => {
    hoisted.anthropicCreateMock.mockReset();
    hoisted.openAICreateMock.mockReset();
  });

  it('parses legacy function_call chunks from openai-compatible streams', async () => {
    hoisted.openAICreateMock.mockResolvedValue(createAsyncIterable([
      {
        choices: [
          {
            delta: {
              function_call: {
                name: 'execute_command',
              },
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              function_call: {
                arguments: '{"command":"pwd","requires_approval":false}',
              },
            },
          },
        ],
      },
    ]));

    const service = new ChatService();
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await service.streamChat(createRequest(), { onChunk, onDone, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith('', [
      expect.objectContaining({
        name: 'execute_command',
        params: {
          command: 'pwd',
          requires_approval: false,
        },
        status: 'pending',
      }),
    ]);
  });

  it('falls back to final message content when delta content is absent', async () => {
    hoisted.openAICreateMock.mockResolvedValue(createAsyncIterable([
      {
        choices: [
          {
            message: {
              content: 'hello from the compatibility gateway',
            },
          },
        ],
      },
    ]));

    const service = new ChatService();
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await service.streamChat(createRequest(), { onChunk, onDone, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith('hello from the compatibility gateway');
    expect(onDone).toHaveBeenCalledWith('hello from the compatibility gateway', undefined);
  });
});
