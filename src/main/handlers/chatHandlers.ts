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

/** 从 workspace settings 中查找 provider 配置 */
function resolveProvider(ctx: HandlerContext, providerId: string): LLMProviderConfig | null {
  const workspace = ctx.getCurrentWorkspace?.();
  const providers = workspace?.settings?.chat?.providers ?? [];
  return providers.find((p) => p.id === providerId) ?? null;
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

      const provider = resolveProvider(ctx, request.providerId);
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

  let toolCalls: ToolCall[] | undefined;

  await service.streamChat(
    request,
    {
      onChunk: (chunk) => {
        win?.webContents.send('chat-stream-chunk', { paneId, chunk, messageId });
      },
      onDone: (fullContent, calls) => {
        toolCalls = calls;
        win?.webContents.send('chat-stream-done', {
          paneId,
          messageId,
          fullContent,
          toolCalls: calls,
        });
      },
      onError: (error) => {
        win?.webContents.send('chat-stream-error', { paneId, error });
        activeStreams.delete(paneId);
      },
    },
    abortController.signal,
  );

  // 处理工具调用
  if (toolCalls && toolCalls.length > 0 && !abortController.signal.aborted && toolExecutor) {
    for (const toolCall of toolCalls) {
      if (abortController.signal.aborted) break;

      // ask_followup_question 和 attempt_completion 由 renderer 处理，跳过
      if (toolCall.name === 'ask_followup_question' || toolCall.name === 'attempt_completion') {
        continue;
      }

      // 安全检查（仅对 execute_command）
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
          continue;
        }

        if (approvalDecision.action === 'ask') {
          // 发送审批请求，等待用户决定
          const approved = await requestToolApproval(
            win,
            paneId,
            approvalDecision.reason
              ? {
                ...toolCall,
                reason: approvalDecision.reason,
              }
              : toolCall,
            abortController.signal,
          );
          if (!approved) {
            const result: ToolResult = {
              toolCallId: toolCall.id,
              content: '用户拒绝了该命令的执行',
              isError: true,
            };
            win?.webContents.send('chat-tool-result', { paneId, ...result });
            continue;
          }
        }
      }

      // 执行工具
      if (!request.sshContext) {
        const result: ToolResult = {
          toolCallId: toolCall.id,
          content: '无 SSH 上下文，工具执行需要 SSH 连接',
          isError: true,
        };
        win?.webContents.send('chat-tool-result', { paneId, ...result });
        continue;
      }

      const result = await toolExecutor.execute(toolCall, request.sshContext);
      win?.webContents.send('chat-tool-result', { paneId, ...result });
    }
  }

  activeStreams.delete(paneId);
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
