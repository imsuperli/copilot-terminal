import { BrowserWindow, ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentCancelRequest,
  AgentGetTaskRequest,
  AgentResetRequest,
  AgentRespondApprovalRequest,
  AgentRestoreTaskRequest,
  AgentSendRequest,
  AgentSubmitInteractionRequest,
} from '../../shared/types/agent';
import type { LLMProviderConfig, ToolCall } from '../../shared/types/chat';
import { resolveLLMProviderWireApi } from '../../shared/utils/chatProvider';
import { AgentController } from '../agent/core/controller/AgentController';
import { HandlerContext } from './HandlerContext';
import { errorResponse, successResponse } from './HandlerResponse';
import { ToolExecutor } from '../services/chat/ToolExecutor';

let controller: AgentController | null = null;

const CHAT_ENVIRONMENT_DETAILS_MAX_CHARS = 4000;
const CHAT_ENVIRONMENT_PROBE_COMMAND = [
  'printf "[host]\\n"; hostname 2>/dev/null || true',
  'printf "\\n[user]\\n"; id -un 2>/dev/null || whoami 2>/dev/null || true',
  'printf "\\n[cwd]\\n"; pwd 2>/dev/null || true',
  'printf "\\n[shell]\\n"; printf "%s\\n" "${SHELL:-unknown}"',
  'printf "\\n[kernel]\\n"; uname -a 2>/dev/null || true',
  'printf "\\n[os-release]\\n"; if [ -r /etc/os-release ]; then cat /etc/os-release; else echo "unavailable"; fi',
].join('; ');

function getWindow(ctx: HandlerContext): BrowserWindow | null {
  return ctx.getMainWindow?.() ?? ctx.mainWindow ?? null;
}

async function resolveProvider(ctx: HandlerContext, providerId: string): Promise<LLMProviderConfig | null> {
  const workspace = ctx.getCurrentWorkspace?.();
  const providers = workspace?.settings?.chat?.providers ?? [];
  const provider = providers.find((item) => item.id === providerId) ?? null;

  if (!provider) {
    return null;
  }

  const vaultApiKey = await ctx.chatProviderVaultService?.getApiKey(provider.id);
  return {
    ...provider,
    apiKey: vaultApiKey ?? provider.apiKey,
  };
}

function getToolExecutor(ctx: HandlerContext): ToolExecutor | null {
  return ctx.processManager ? new ToolExecutor(ctx.processManager) : null;
}

function truncateEnvironmentDetails(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= CHAT_ENVIRONMENT_DETAILS_MAX_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, CHAT_ENVIRONMENT_DETAILS_MAX_CHARS)}\n\n[environment details truncated]`;
}

async function collectEnvironmentDetails(
  request: Pick<AgentSendRequest, 'sshContext'>,
  toolExecutor: ToolExecutor | null,
): Promise<string | undefined> {
  if (!request.sshContext || !toolExecutor) {
    return undefined;
  }

  const probeToolCall: ToolCall = {
    id: `agent-env-probe-${uuidv4()}`,
    name: 'execute_command',
    params: {
      command: CHAT_ENVIRONMENT_PROBE_COMMAND,
      requires_approval: false,
      interactive: false,
    },
    status: 'pending',
  };

  const result = await toolExecutor.execute(probeToolCall, request.sshContext);
  if (result.isError) {
    return `环境探测失败：${result.content}`;
  }

  return truncateEnvironmentDetails(result.content);
}

function getController(ctx: HandlerContext): AgentController {
  if (controller) {
    return controller;
  }

  controller = new AgentController({
    processManager: ctx.processManager,
    resolveProvider: (providerId) => resolveProvider(ctx, providerId),
    commandSecurityEnabled: () => ctx.getCurrentWorkspace?.()?.settings?.chat?.enableCommandSecurity ?? true,
    postState: (task) => {
      getWindow(ctx)?.webContents.send('agent-task-state', {
        paneId: task.paneId,
        task,
      });
    },
    postEvent: (payload) => {
      getWindow(ctx)?.webContents.send('agent-timeline-event', payload);
    },
    postError: (payload) => {
      getWindow(ctx)?.webContents.send('agent-task-error', payload);
    },
  });

  return controller;
}

export function disposeAgentTaskForPane(paneId: string): void {
  controller?.disposePane(paneId);
}

export function registerAgentHandlers(ctx: HandlerContext) {
  ipcMain.handle('agent-send', async (_event, request: AgentSendRequest) => {
    try {
      const toolExecutor = getToolExecutor(ctx);
      const response = await getController(ctx).send({
        ...request,
        environmentDetails: request.environmentDetails ?? await collectEnvironmentDetails(request, toolExecutor),
      });
      return successResponse(response);
    } catch (error) {
      return errorResponse(new Error(error instanceof Error ? error.message : String(error)));
    }
  });

  ipcMain.handle('agent-cancel', async (_event, request: AgentCancelRequest) => {
    try {
      getController(ctx).cancel(request);
      return successResponse(undefined);
    } catch (error) {
      return errorResponse(new Error(error instanceof Error ? error.message : String(error)));
    }
  });

  ipcMain.handle('agent-reset-task', async (_event, request: AgentResetRequest) => {
    try {
      getController(ctx).reset(request);
      return successResponse(undefined);
    } catch (error) {
      return errorResponse(new Error(error instanceof Error ? error.message : String(error)));
    }
  });

  ipcMain.handle('agent-respond-approval', async (_event, request: AgentRespondApprovalRequest) => {
    try {
      getController(ctx).respondApproval(request);
      return successResponse(undefined);
    } catch (error) {
      return errorResponse(new Error(error instanceof Error ? error.message : String(error)));
    }
  });

  ipcMain.handle('agent-submit-interaction', async (_event, request: AgentSubmitInteractionRequest) => {
    try {
      getController(ctx).submitInteraction(request);
      return successResponse(undefined);
    } catch (error) {
      return errorResponse(new Error(error instanceof Error ? error.message : String(error)));
    }
  });

  ipcMain.handle('agent-get-task', async (_event, request: AgentGetTaskRequest) => {
    try {
      return successResponse(getController(ctx).getTask(request));
    } catch (error) {
      return errorResponse(new Error(error instanceof Error ? error.message : String(error)));
    }
  });

  ipcMain.handle('agent-restore-task', async (_event, request: AgentRestoreTaskRequest) => {
    try {
      return successResponse(getController(ctx).restore(request));
    } catch (error) {
      return errorResponse(new Error(error instanceof Error ? error.message : String(error)));
    }
  });
}
