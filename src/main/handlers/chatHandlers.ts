/**
 * Chat IPC Handlers
 * 负责 LLM 流式调用、工具执行和安全审批流程
 */

import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { HandlerContext } from './HandlerContext';
import { successResponse, errorResponse } from './HandlerResponse';
import { ChatService } from '../services/chat/ChatService';
import { ToolExecutor } from '../services/chat/ToolExecutor';
import { resolveToolApprovalDecision } from '../services/chat/ToolApprovalPolicy';
import type {
  ChatMessage,
  ChatSendRequest,
  ChatExecuteToolRequest,
  ChatToolApprovalResponse,
  ToolCall,
  ToolResult,
  LLMProviderConfig,
} from '../../shared/types/chat';

/** 每个 paneId 的流取消控制器 */
const activeStreams = new Map<string, AbortController>();

/** 等待工具审批的 resolver，key = paneId:toolCallId */
const pendingApprovals = new Map<string, (approved: boolean) => void>();

let chatService: ChatService | null = null;

function getChatService(): ChatService {
  if (!chatService) {
    chatService = new ChatService();
  }
  return chatService;
}

function getToolExecutor(ctx: HandlerContext): ToolExecutor | null {
  if (!ctx.processManager) {
    return null;
  }
  return new ToolExecutor(ctx.processManager);
}

const MAX_TOOL_LOOP_ROUNDS = 4;

/** 从 workspace settings 中查找 provider 配置 */
async function resolveProvider(ctx: HandlerContext, providerId: string): Promise<LLMProviderConfig | null> {
  const workspace = ctx.getCurrentWorkspace?.();
  const providers = workspace?.settings?.chat?.providers ?? [];
  const provider = providers.find((p) => p.id === providerId) ?? null;

  if (!provider) {
    return null;
  }

  const vaultApiKey = await ctx.chatProviderVaultService?.getApiKey(provider.id);
  return {
    ...provider,
    apiKey: vaultApiKey ?? provider.apiKey,
  };
}

/** 获取当前 BrowserWindow */
function getWindow(ctx: HandlerContext): BrowserWindow | null {
  return ctx.getMainWindow?.() ?? ctx.mainWindow ?? null;
}

function getApprovalKey(paneId: string, toolCallId: string): string {
  return `${paneId}:${toolCallId}`;
}

function isCommandSecurityEnabled(ctx: HandlerContext): boolean {
  return ctx.getCurrentWorkspace?.()?.settings?.chat?.enableCommandSecurity ?? true;
}

export function registerChatHandlers(ctx: HandlerContext) {

  /**
   * chat-send: 启动 LLM 流式调用
   * 返回 { messageId } 用于后续 chunk/done/error 事件的关联
   */
  ipcMain.handle('chat-send', async (_event, request: ChatSendRequest) => {
    try {
      const { paneId } = request;
      const messageId = uuidv4();

      // 取消已有流
      const existing = activeStreams.get(paneId);
      if (existing) {
        existing.abort();
        activeStreams.delete(paneId);
      }

      const provider = await resolveProvider(ctx, request.providerId);
      if (!provider) {
        return errorResponse(new Error(`Provider not found: ${request.providerId}`));
      }

      // 注入 provider 到 request（ChatService 通过 _provider 读取）
      const enrichedRequest = { ...request, _provider: provider };

      const abortController = new AbortController();
      activeStreams.set(paneId, abortController);

      const win = getWindow(ctx);
      const toolExecutor = getToolExecutor(ctx);

      // 异步执行流，立即返回 messageId
      runChatStream(enrichedRequest, messageId, abortController, win, toolExecutor, ctx);

      return successResponse({ messageId });
    } catch (error) {
      return errorResponse(error);
    }
  });

  /**
   * chat-cancel: 取消正在进行的流
   */
  ipcMain.handle('chat-cancel', async (_event, { paneId }: { paneId: string }) => {
    try {
      const controller = activeStreams.get(paneId);
      if (controller) {
        controller.abort();
        activeStreams.delete(paneId);
      }
      return successResponse(undefined);
    } catch (error) {
      return errorResponse(error);
    }
  });

  /**
   * chat-execute-tool: 直接执行工具（用于 renderer 主动触发）
   */
  ipcMain.handle('chat-execute-tool', async (_event, request: ChatExecuteToolRequest) => {
    try {
      const toolExecutor = getToolExecutor(ctx);
      if (!toolExecutor) {
        return errorResponse(new Error('ProcessManager unavailable'));
      }

      if (!request.sshContext) {
        return errorResponse(new Error('SSH context required for tool execution'));
      }

      const result = await toolExecutor.execute(request.toolCall, request.sshContext);
      return successResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  /**
   * chat-respond-tool-approval: 用户审批危险命令的响应
   */
  ipcMain.on('chat-respond-tool-approval', (_event, response: ChatToolApprovalResponse) => {
    const approvalKey = getApprovalKey(response.paneId, response.toolCallId);
    const resolver = pendingApprovals.get(approvalKey);
    if (resolver) {
      pendingApprovals.delete(approvalKey);
      resolver(response.approved);
    }
  });
}

/**
 * 异步运行 LLM 流，处理工具调用循环
 */
async function runChatStream(
  request: ChatSendRequest & { _provider: LLMProviderConfig },
  messageId: string,
  abortController: AbortController,
  win: BrowserWindow | null,
  toolExecutor: ToolExecutor | null,
  ctx: HandlerContext,
): Promise<void> {
  const { paneId } = request;
  const service = getChatService();
  const commandSecurityEnabled = isCommandSecurityEnabled(ctx);

  let roundMessageId = messageId;
  const conversationMessages = [...request.messages];

  for (let round = 0; round < MAX_TOOL_LOOP_ROUNDS && !abortController.signal.aborted; round += 1) {
    let toolCalls: ToolCall[] | undefined;
    let fullContent = '';
    let streamFailed = false;

    await service.streamChat(
      {
        ...request,
        messages: conversationMessages,
      },
      {
        onChunk: (chunk) => {
          win?.webContents.send('chat-stream-chunk', { paneId, chunk, messageId: roundMessageId });
        },
        onDone: (nextFullContent, calls) => {
          fullContent = nextFullContent;
          toolCalls = calls;
          win?.webContents.send('chat-stream-done', {
            paneId,
            messageId: roundMessageId,
            fullContent: nextFullContent,
            toolCalls: calls,
            isFinal: !calls?.length,
          });
        },
        onError: (error) => {
          streamFailed = true;
          win?.webContents.send('chat-stream-error', { paneId, error });
          activeStreams.delete(paneId);
        },
      },
      abortController.signal,
    );

    if (streamFailed || abortController.signal.aborted) {
      activeStreams.delete(paneId);
      return;
    }

    conversationMessages.push({
      id: roundMessageId,
      role: 'assistant',
      content: fullContent,
      timestamp: new Date().toISOString(),
      toolCalls,
    });

    if (!toolCalls?.length) {
      activeStreams.delete(paneId);
      return;
    }

    const toolResultMessages = await executeToolCalls(
      {
        paneId,
        toolCalls,
        request,
        win,
        toolExecutor,
        commandSecurityEnabled,
        abortSignal: abortController.signal,
      },
    );

    conversationMessages.push(...toolResultMessages);
    roundMessageId = uuidv4();
  }

  if (!abortController.signal.aborted) {
    win?.webContents.send('chat-stream-error', {
      paneId,
      error: '工具调用轮数超过限制，已停止继续执行',
    });
  }

  activeStreams.delete(paneId);
}

async function executeToolCalls({
  paneId,
  toolCalls,
  request,
  win,
  toolExecutor,
  commandSecurityEnabled,
  abortSignal,
}: {
  paneId: string;
  toolCalls: ToolCall[];
  request: ChatSendRequest & { _provider: LLMProviderConfig };
  win: BrowserWindow | null;
  toolExecutor: ToolExecutor | null;
  commandSecurityEnabled: boolean;
  abortSignal: AbortSignal;
}): Promise<ChatMessage[]> {
  const toolResultMessages: ChatMessage[] = [];

  for (const toolCall of toolCalls) {
    if (abortSignal.aborted) {
      break;
    }

    const result = await executeToolCall({
      paneId,
      toolCall,
      request,
      win,
      toolExecutor,
      commandSecurityEnabled,
      abortSignal,
    });

    toolResultMessages.push({
      id: `tool-result-${toolCall.id}`,
      role: 'user',
      content: '',
      timestamp: new Date().toISOString(),
      toolResult: {
        toolCallId: result.toolCallId,
        content: result.content,
        isError: result.isError,
      },
    });
  }

  return toolResultMessages;
}

async function executeToolCall({
  paneId,
  toolCall,
  request,
  win,
  toolExecutor,
  commandSecurityEnabled,
  abortSignal,
}: {
  paneId: string;
  toolCall: ToolCall;
  request: ChatSendRequest;
  win: BrowserWindow | null;
  toolExecutor: ToolExecutor | null;
  commandSecurityEnabled: boolean;
  abortSignal: AbortSignal;
}): Promise<ToolResult> {
  if (toolCall.name === 'execute_command') {
    const approvalDecision = resolveToolApprovalDecision(toolCall, {
      commandSecurityEnabled,
    });

    if (approvalDecision.action === 'block') {
      const result: ToolResult = {
        toolCallId: toolCall.id,
        content: `命令被安全策略阻止：${approvalDecision.reason ?? '匹配高危规则'}`,
        isError: true,
      };
      win?.webContents.send('chat-tool-result', { paneId, ...result });
      return result;
    }

    if (approvalDecision.action === 'ask') {
      const approved = await requestToolApproval(
        win,
        paneId,
        approvalDecision.reason
          ? {
            ...toolCall,
            reason: approvalDecision.reason,
          }
          : toolCall,
        abortSignal,
      );
      if (!approved) {
        const result: ToolResult = {
          toolCallId: toolCall.id,
          content: '用户拒绝了该命令的执行',
          isError: true,
        };
        win?.webContents.send('chat-tool-result', { paneId, ...result });
        return result;
      }
    }
  }

  if (!request.sshContext || !toolExecutor) {
    const result: ToolResult = {
      toolCallId: toolCall.id,
      content: '无 SSH 上下文，工具执行需要 SSH 连接',
      isError: true,
    };
    win?.webContents.send('chat-tool-result', { paneId, ...result });
    return result;
  }

  const result = await toolExecutor.execute(toolCall, request.sshContext);
  win?.webContents.send('chat-tool-result', { paneId, ...result });
  return result;
}

/**
 * 发送审批请求给 renderer，等待用户响应
 */
function requestToolApproval(
  win: BrowserWindow | null,
  paneId: string,
  toolCall: ToolCall,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const approvalKey = getApprovalKey(paneId, toolCall.id);
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      pendingApprovals.delete(approvalKey);
      signal?.removeEventListener('abort', handleAbort);
    };

    const finish = (approved: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(approved);
    };

    const handleAbort = () => {
      finish(false);
    };

    pendingApprovals.set(approvalKey, finish);
    win?.webContents.send('chat-tool-approval-request', { paneId, toolCall });

    // 超时 5 分钟自动拒绝
    timeout = setTimeout(() => {
      finish(false);
    }, 5 * 60 * 1000);

    signal?.addEventListener('abort', handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
    }
  });
}
