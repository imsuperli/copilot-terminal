/**
 * ChatService — LLM 流式调用核心服务
 * 支持 Anthropic Claude API 和 OpenAI 兼容协议
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  ChatSendRequest,
  ToolCall,
  ToolName,
} from '../../../shared/types/chat';

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (fullContent: string, toolCalls?: ToolCall[]) => void;
  onError: (error: string) => void;
}

/** 工具定义，在 API 调用时传给 LLM */
const TOOL_DEFINITIONS_ANTHROPIC: Anthropic.Tool[] = [
  {
    name: 'execute_command',
    description: '在当前连接的远程服务器上执行 CLI 命令。适合系统诊断、查看日志、检查资源状态等操作。',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要在远程服务器上执行的命令' },
        requires_approval: { type: 'boolean', description: '该命令是否需要用户确认才能执行（删除、重启等危险操作设为 true）' },
      },
      required: ['command', 'requires_approval'],
    },
  },
  {
    name: 'read_file',
    description: '读取远程服务器上的文件内容。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件的绝对路径' },
        limit: { type: 'number', description: '最多读取的行数（默认 200）' },
        offset: { type: 'number', description: '从第几行开始读（0-based，默认 0）' },
      },
      required: ['path'],
    },
  },
  {
    name: 'glob_search',
    description: '在远程服务器上按 glob 模式搜索文件。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob 模式，如 **/*.log, src/**/*.ts' },
        path: { type: 'string', description: '搜索起始目录（默认当前目录）' },
        limit: { type: 'number', description: '最多返回结果数（默认 100）' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'grep_search',
    description: '在远程服务器上搜索文件内容，支持正则表达式。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式模式' },
        path: { type: 'string', description: '搜索目录（默认当前目录）' },
        include: { type: 'string', description: '文件过滤 glob，如 *.log, *.{ts,js}' },
        case_sensitive: { type: 'boolean', description: '是否区分大小写（默认 false）' },
        context_lines: { type: 'number', description: '每个匹配前后显示的上下文行数（默认 0）' },
        max_matches: { type: 'number', description: '最多返回匹配数（默认 100）' },
      },
      required: ['pattern'],
    },
  },
];

/** 将 Anthropic 工具定义转换为 OpenAI function_calling 格式 */
const TOOL_DEFINITIONS_OPENAI: OpenAI.ChatCompletionTool[] = TOOL_DEFINITIONS_ANTHROPIC.map(
  (tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }),
);

type OpenAIFunctionCallLike = {
  name?: string;
  arguments?: string;
};

type OpenAIToolCallLike = {
  index?: number;
  id?: string;
  function?: OpenAIFunctionCallLike;
};

type OpenAIMessageLike = {
  content?: unknown;
  tool_calls?: OpenAIToolCallLike[];
  function_call?: OpenAIFunctionCallLike;
};

type OpenAIChoiceLike = {
  delta?: OpenAIMessageLike;
  message?: OpenAIMessageLike;
  text?: unknown;
};

function extractOpenAITextParts(content: unknown): string[] {
  if (typeof content === 'string') {
    return content ? [content] : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  const textParts: string[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      if (part) {
        textParts.push(part);
      }
      continue;
    }

    if (!part || typeof part !== 'object') {
      continue;
    }

    const candidate = part as {
      text?: unknown;
      content?: unknown;
    };

    if (typeof candidate.text === 'string' && candidate.text) {
      textParts.push(candidate.text);
      continue;
    }

    if (typeof candidate.content === 'string' && candidate.content) {
      textParts.push(candidate.content);
    }
  }

  return textParts;
}

function appendOpenAIToolCalls(
  payload: OpenAIMessageLike | undefined,
  toolCallsRaw: Map<number, { id: string; name: string; args: string }>,
): void {
  if (!payload) {
    return;
  }

  if (Array.isArray(payload.tool_calls)) {
    for (const tc of payload.tool_calls) {
      const idx = tc.index ?? 0;
      if (!toolCallsRaw.has(idx)) {
        toolCallsRaw.set(idx, {
          id: tc.id || uuidv4(),
          name: tc.function?.name || '',
          args: '',
        });
      }

      const existing = toolCallsRaw.get(idx)!;
      if (tc.function?.arguments) {
        existing.args += tc.function.arguments;
      }
      if (tc.function?.name) {
        existing.name = tc.function.name;
      }
      if (tc.id) {
        existing.id = tc.id;
      }
    }
    return;
  }

  if (payload.function_call) {
    if (!toolCallsRaw.has(0)) {
      toolCallsRaw.set(0, {
        id: uuidv4(),
        name: payload.function_call.name || '',
        args: '',
      });
    }

    const existing = toolCallsRaw.get(0)!;
    if (payload.function_call.arguments) {
      existing.args += payload.function_call.arguments;
    }
    if (payload.function_call.name) {
      existing.name = payload.function_call.name;
    }
  }
}

/** 构建系统提示词 */
function buildSystemPrompt(request: ChatSendRequest): string {
  const { sshContext, systemPrompt } = request;

  const contextSection = sshContext
    ? `
当前远程服务器连接信息：
- 主机: ${sshContext.host}
- 用户: ${sshContext.user}
${sshContext.cwd ? `- 工作目录: ${sshContext.cwd}` : ''}
`
    : '';

  const defaultPrompt = `你是一个专业的系统管理员助手，帮助用户管理和排查远程服务器问题。
${contextSection}
你可以使用工具在远程服务器上执行操作。遵循以下安全原则：
- 优先使用只读命令进行诊断（ls、cat、grep、ps、df 等）
- 对于可能影响系统状态的操作，将 requires_approval 设为 true
- 禁止执行 rm -rf /、格式化磁盘、重启系统等破坏性命令
- 执行命令前先解释要做什么`;

  return systemPrompt || defaultPrompt;
}

/** 将 ChatMessage[] 转换为 Anthropic API 格式 */
function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue; // system prompt 单独传

    if (msg.role === 'user') {
      if (msg.toolResult) {
        // 工具结果消息
        result.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolResult.toolCallId,
              content: msg.toolResult.content,
              is_error: msg.toolResult.isError,
            },
          ],
        });
      } else {
        result.push({ role: 'user', content: msg.content });
      }
    } else if (msg.role === 'assistant') {
      const content: Anthropic.MessageParam['content'] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content } as Anthropic.TextBlockParam);
      }
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.params,
          } as Anthropic.ToolUseBlockParam);
        }
      }
      if (content.length > 0) {
        result.push({ role: 'assistant', content });
      }
    }
  }

  return result;
}

/** 将 ChatMessage[] 转换为 OpenAI API 格式 */
function toOpenAIMessages(messages: ChatMessage[], systemPrompt: string): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      if (msg.toolResult) {
        result.push({
          role: 'tool',
          tool_call_id: msg.toolResult.toolCallId,
          content: msg.toolResult.content,
        });
      } else {
        result.push({ role: 'user', content: msg.content });
      }
    } else if (msg.role === 'assistant') {
      const toolCalls = msg.toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.params),
        },
      }));
      result.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: toolCalls?.length ? toolCalls : undefined,
      });
    }
  }

  return result;
}

export class ChatService {
  async streamChat(
    request: ChatSendRequest,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    // providers 由 chatHandlers 从 settings 读取后注入到 request
    const provider = (request as any)._provider as import('../../../shared/types/chat').LLMProviderConfig;
    if (!provider) {
      callbacks.onError('未找到 LLM Provider 配置');
      return;
    }

    if (provider.type === 'anthropic') {
      await this.streamAnthropic(request, provider, callbacks, signal);
    } else {
      await this.streamOpenAI(request, provider, callbacks, signal);
    }
  }

  private async streamAnthropic(
    request: ChatSendRequest,
    provider: import('../../../shared/types/chat').LLMProviderConfig,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const client = new Anthropic({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl || undefined,
    });

    const systemPrompt = buildSystemPrompt(request);
    const messages = toAnthropicMessages(request.messages);
    const tools = request.enableTools ? TOOL_DEFINITIONS_ANTHROPIC : undefined;

    let fullContent = '';
    const toolCallsAccumulator: Map<string, ToolCall> = new Map();

    try {
      const stream = await client.messages.create({
        model: request.model,
        max_tokens: 8096,
        system: systemPrompt,
        messages,
        tools,
        stream: true,
      }, { signal });

      for await (const event of stream) {
        if (signal?.aborted) break;

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const chunk = event.delta.text;
            fullContent += chunk;
            callbacks.onChunk(chunk);
          } else if (event.delta.type === 'input_json_delta') {
            // 工具调用参数累积，在 message_stop 时处理
            const blockIndex = event.index;
            const existing = toolCallsAccumulator.get(String(blockIndex));
            if (existing) {
              (existing as any)._rawInput = ((existing as any)._rawInput || '') + event.delta.partial_json;
            }
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            const tc: ToolCall & { _rawInput?: string } = {
              id: event.content_block.id,
              name: event.content_block.name as ToolName,
              params: {},
              status: 'pending',
              _rawInput: '',
            };
            toolCallsAccumulator.set(String(event.index), tc);
          }
        }
      }

      // 解析工具调用参数
      const toolCalls: ToolCall[] = [];
      for (const tc of toolCallsAccumulator.values()) {
        try {
          tc.params = JSON.parse((tc as any)._rawInput || '{}');
        } catch {
          tc.params = {};
        }
        delete (tc as any)._rawInput;
        toolCalls.push(tc);
      }

      callbacks.onDone(fullContent, toolCalls.length > 0 ? toolCalls : undefined);
    } catch (err) {
      if (signal?.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      callbacks.onError(message);
    }
  }

  private async streamOpenAI(
    request: ChatSendRequest,
    provider: import('../../../shared/types/chat').LLMProviderConfig,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl || undefined,
    });

    const systemPrompt = buildSystemPrompt(request);
    const messages = toOpenAIMessages(request.messages, systemPrompt);
    const tools = request.enableTools ? TOOL_DEFINITIONS_OPENAI : undefined;

    let fullContent = '';
    // 工具调用累积（按 index）
    const toolCallsRaw: Map<number, { id: string; name: string; args: string }> = new Map();

    try {
      const stream = await client.chat.completions.create({
        model: request.model,
        messages,
        tools,
        stream: true,
      }, { signal: signal as AbortSignal });

      for await (const chunk of stream) {
        if (signal?.aborted) break;

        const choice = chunk.choices[0] as OpenAIChoiceLike | undefined;
        if (!choice) {
          continue;
        }

        const delta = choice.delta;
        const deltaTextParts = extractOpenAITextParts(delta?.content);
        const textParts = deltaTextParts.length > 0
          ? deltaTextParts
          : [
              ...extractOpenAITextParts(choice.message?.content),
              ...(typeof choice.text === 'string' && choice.text ? [choice.text] : []),
            ];

        for (const textPart of textParts) {
          fullContent += textPart;
          callbacks.onChunk(textPart);
        }

        appendOpenAIToolCalls(delta, toolCallsRaw);
        if (!delta?.tool_calls && !delta?.function_call) {
          appendOpenAIToolCalls(choice.message, toolCallsRaw);
        }
      }

      // 构建 ToolCall 对象
      const toolCalls: ToolCall[] = [];
      for (const raw of toolCallsRaw.values()) {
        let params: Record<string, unknown> = {};
        try { params = JSON.parse(raw.args || '{}'); } catch { /* ignore */ }
        toolCalls.push({
          id: raw.id,
          name: raw.name as ToolName,
          params,
          status: 'pending',
        });
      }

      callbacks.onDone(fullContent, toolCalls.length > 0 ? toolCalls : undefined);
    } catch (err) {
      if (signal?.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      callbacks.onError(message);
    }
  }
}
