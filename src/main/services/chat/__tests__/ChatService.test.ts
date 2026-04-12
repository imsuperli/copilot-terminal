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

  it('keeps structured multi-turn messages for xunfei maas style chat completions', async () => {
    hoisted.openAICreateMock.mockResolvedValue(createAsyncIterable([
      {
        choices: [
          {
            message: {
              content: 'kiwi',
            },
          },
        ],
      },
    ]));

    const request = createRequest();
    request._provider.baseUrl = 'https://maas-api.cn-huabei-1.xf-yun.com/v2/';
    request.messages = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Call execute_command and then answer with the result.',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        toolCalls: [
          {
            id: 'call_1',
            name: 'execute_command',
            params: {
              command: 'printf kiwi',
              requires_approval: false,
            },
            status: 'completed',
          },
        ],
      },
      {
        id: 'msg-3',
        role: 'user',
        content: '',
        timestamp: new Date().toISOString(),
        toolResult: {
          toolCallId: 'call_1',
          content: 'kiwi',
        },
      },
    ];

    const service = new ChatService();
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await service.streamChat(request, { onChunk, onDone, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith('kiwi', undefined);

    const [payload] = hoisted.openAICreateMock.mock.calls.at(-1) ?? [];
    expect(payload.messages).toEqual([
      expect.objectContaining({
        role: 'system',
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Call execute_command and then answer with the result.',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'execute_command',
              arguments: '{"command":"printf kiwi","requires_approval":false}',
            },
          },
        ],
      }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'kiwi',
      }),
    ]);
  });

  it('parses xunfei maas style streaming tool call chunks', async () => {
    hoisted.openAICreateMock.mockResolvedValue(createAsyncIterable([
      {
        choices: [
          {
            delta: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  index: 0,
                  id: 'call_952e9716b735452891b3a6',
                  type: 'function',
                  function: {
                    name: 'execute_command',
                    arguments: '{"command":"p',
                  },
                },
              ],
              reasoning_content: '',
              plugins_content: null,
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  index: 0,
                  type: 'function',
                  function: {
                    arguments: 'wd","requires_approval":false}',
                  },
                },
              ],
              reasoning_content: '',
              plugins_content: null,
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              role: 'assistant',
              content: '',
              reasoning_content: '',
              plugins_content: null,
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
    ]));

    const request = createRequest();
    request._provider.baseUrl = 'https://maas-api.cn-huabei-1.xf-yun.com/v2/';

    const service = new ChatService();
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await service.streamChat(request, { onChunk, onDone, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith('', [
      expect.objectContaining({
        id: 'call_952e9716b735452891b3a6',
        name: 'execute_command',
        params: {
          command: 'pwd',
          requires_approval: false,
        },
        status: 'pending',
      }),
    ]);
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

  it('injects probed ssh environment details and anti-simulation rules into the system prompt', async () => {
    hoisted.openAICreateMock.mockResolvedValue(createAsyncIterable([
      {
        choices: [
          {
            message: {
              content: 'ready',
            },
          },
        ],
      },
    ]));

    const request = createRequest();
    request.environmentDetails = '[host]\nprod-01\n\n[kernel]\nLinux prod-01 6.1.0';
    request.systemPrompt = '输出尽量简洁。';

    const service = new ChatService();
    await service.streamChat(request, {
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    const [payload] = hoisted.openAICreateMock.mock.calls.at(-1) ?? [];
    expect(payload.messages[0]).toEqual(expect.objectContaining({
      role: 'system',
      content: expect.stringContaining('真实远端环境探测结果'),
    }));
    expect(payload.messages[0].content).toContain('prod-01');
    expect(payload.messages[0].content).toContain('不要先输出“我先去查看”');
    expect(payload.messages[0].content).toContain('禁止伪造命令输出');
    expect(payload.messages[0].content).toContain('附加用户指令：');
    expect(payload.messages[0].content).toContain('输出尽量简洁。');
  });
});
