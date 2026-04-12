import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSendRequest } from '../../../../shared/types/chat';

const hoisted = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  openAICreateMock: vi.fn(),
  openAIResponsesCreateMock: vi.fn(),
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
    responses = {
      create: hoisted.openAIResponsesCreateMock,
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
    wireApi?: 'chat-completions' | 'responses';
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
      wireApi: 'chat-completions',
      models: ['gpt-5.4'],
      defaultModel: 'gpt-5.4',
    },
  };
}

describe('ChatService', () => {
  beforeEach(() => {
    hoisted.anthropicCreateMock.mockReset();
    hoisted.openAICreateMock.mockReset();
    hoisted.openAIResponsesCreateMock.mockReset();
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

  it('streams text from the responses API when the provider uses responses wire format', async () => {
    hoisted.openAIResponsesCreateMock.mockResolvedValue(createAsyncIterable([
      {
        type: 'response.created',
        sequence_number: 1,
        response: {
          id: 'resp-1',
          output_text: '',
          output: [],
          error: null,
        },
      },
      {
        type: 'response.output_text.delta',
        sequence_number: 2,
        output_index: 0,
        item_id: 'item-1',
        content_index: 0,
        delta: 'hello from responses',
        logprobs: [],
      },
      {
        type: 'response.completed',
        sequence_number: 3,
        response: {
          id: 'resp-1',
          output_text: 'hello from responses',
          output: [
            {
              type: 'message',
              id: 'item-1',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'hello from responses',
                },
              ],
            },
          ],
          error: null,
        },
      },
    ]));

    const request = createRequest();
    request._provider.wireApi = 'responses';

    const service = new ChatService();
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await service.streamChat(request, { onChunk, onDone, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith('hello from responses');
    expect(onDone).toHaveBeenCalledWith('hello from responses', undefined);
  });

  it('parses function calls from the responses API stream', async () => {
    hoisted.openAIResponsesCreateMock.mockResolvedValue(createAsyncIterable([
      {
        type: 'response.created',
        sequence_number: 1,
        response: {
          id: 'resp-2',
          output_text: '',
          output: [],
          error: null,
        },
      },
      {
        type: 'response.output_item.added',
        sequence_number: 2,
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'fc-item-1',
          call_id: 'tool-call-1',
          name: 'execute_command',
          arguments: '',
          status: 'in_progress',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        sequence_number: 3,
        output_index: 0,
        item_id: 'fc-item-1',
        delta: '{"command":"pwd","requires_approval":false}',
      },
      {
        type: 'response.function_call_arguments.done',
        sequence_number: 4,
        output_index: 0,
        item_id: 'fc-item-1',
        name: 'execute_command',
        arguments: '{"command":"pwd","requires_approval":false}',
      },
      {
        type: 'response.completed',
        sequence_number: 5,
        response: {
          id: 'resp-2',
          output_text: '',
          output: [
            {
              type: 'function_call',
              id: 'fc-item-1',
              call_id: 'tool-call-1',
              name: 'execute_command',
              arguments: '{"command":"pwd","requires_approval":false}',
              status: 'completed',
            },
          ],
          error: null,
        },
      },
    ]));

    const request = createRequest();
    request._provider.wireApi = 'responses';

    const service = new ChatService();
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await service.streamChat(request, { onChunk, onDone, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith('', [
      expect.objectContaining({
        id: 'tool-call-1',
        name: 'execute_command',
        params: {
          command: 'pwd',
          requires_approval: false,
        },
        status: 'pending',
      }),
    ]);
  });
});
