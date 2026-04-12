import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { BrowserWindow } from 'electron';
import type {
  AgentPendingApproval,
  AgentPendingInteraction,
  AgentSendRequest,
  AgentSubmitInteractionRequest,
  AgentTaskSnapshot,
} from '../../../../shared/types/agent';
import type {
  AgentApprovalRequestEvent,
  AgentApprovalResultEvent,
  AgentCommandEvent,
  AgentCommandOutputEvent,
  AgentInteractionRequestEvent,
  AgentInteractionResultEvent,
  AgentOffloadRef,
  AgentReasoningEvent,
  AgentSystemNoticeEvent,
  AgentTimelineEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
} from '../../../../shared/types/agentTimeline';
import type {
  ChatMessage,
  LLMProviderConfig,
  ToolCall,
  ToolResult,
} from '../../../../shared/types/chat';
import { resolveToolApprovalDecision } from '../../../services/chat/ToolApprovalPolicy';
import { ChatService } from '../../../services/chat/ChatService';
import { ToolExecutor } from '../../../services/chat/ToolExecutor';
import { previewText } from '../../../utils/chatDebugLog';
import { ContextManager } from '../context/ContextManager';
import { parseAssistantSections } from '../assistant-message';
import { buildAgentSystemPrompt } from '../prompts/system';
import type { RemoteTerminalManager, RemoteCommandHandle } from '../../integrations/remote-terminal';
import type { InteractionRequest } from '../../services/interaction-detector';
import type { McpHub } from '../../services/mcp/McpHub';
import type { SkillsManager } from '../../services/skills/SkillsManager';

const MAX_AGENT_TOOL_ROUNDS = 8;
const OFFLOAD_THRESHOLD = 14_000;
const OFFLOAD_PREVIEW_HEAD = 6_000;
const OFFLOAD_PREVIEW_TAIL = 3_000;
const AGENT_OFFLOAD_DIR = path.join(os.tmpdir(), 'copilot-terminal-agent-offload');

interface AgentTaskDependencies {
  chatService: ChatService;
  toolExecutor: ToolExecutor | null;
  remoteTerminalManager: RemoteTerminalManager | null;
  skillsManager: SkillsManager;
  mcpHub: McpHub;
  commandSecurityEnabled: boolean;
  postState: (snapshot: AgentTaskSnapshot) => void;
  postEvent: (payload: { paneId: string; taskId: string; event: AgentTimelineEvent }) => void;
  postError: (payload: { paneId: string; taskId: string; error: string }) => void;
}

function cloneSnapshot(snapshot: AgentTaskSnapshot): AgentTaskSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AgentTaskSnapshot;
}

async function maybeOffloadContent(
  taskId: string,
  prefix: string,
  content: string,
): Promise<{ content: string; offloadRef?: AgentOffloadRef }> {
  if (content.length <= OFFLOAD_THRESHOLD) {
    return { content };
  }

  await fs.mkdir(AGENT_OFFLOAD_DIR, { recursive: true });
  const fileName = `${prefix}-${Date.now()}-${taskId}.log`;
  const filePath = path.join(AGENT_OFFLOAD_DIR, fileName);
  await fs.writeFile(filePath, content, 'utf8');

  const preview = `${content.slice(0, OFFLOAD_PREVIEW_HEAD)}\n\n...[offloaded ${content.length - OFFLOAD_PREVIEW_HEAD - OFFLOAD_PREVIEW_TAIL} chars]...\n\n${content.slice(-OFFLOAD_PREVIEW_TAIL)}`;
  return {
    content: `${preview}\n\n[full output offloaded to ${filePath}]`,
    offloadRef: {
      id: uuidv4(),
      path: filePath,
      preview: previewText(content, 360),
      totalChars: content.length,
    },
  };
}

export class AgentTask {
  private readonly snapshot: AgentTaskSnapshot;
  private readonly contextManager: ContextManager;
  private readonly deps: AgentTaskDependencies;
  private currentProvider: LLMProviderConfig | null = null;
  private latestRequest: AgentSendRequest | null = null;
  private runPromise: Promise<void> | null = null;
  private abortController: AbortController | null = null;
  private activeRemoteCommand: RemoteCommandHandle | null = null;
  private pendingApprovalResolver: ((approved: boolean) => void) | null = null;
  private pendingInteractionBridge:
    | {
        interactionId: string;
        interactionType: AgentPendingInteraction['interactionType'];
        sendInput: (input: string, appendNewline?: boolean) => void;
        cancel: () => void;
      }
    | null = null;
  private isCancelled = false;
  private commandOutputSeq = 0;

  constructor(snapshot: AgentTaskSnapshot, deps: AgentTaskDependencies) {
    this.snapshot = cloneSnapshot(snapshot);
    this.deps = deps;
    this.contextManager = new ContextManager(snapshot.messages);
  }

  getSnapshot(): AgentTaskSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  start(request: AgentSendRequest, provider: LLMProviderConfig): void {
    this.currentProvider = provider;
    this.latestRequest = request;
    this.snapshot.providerId = request.providerId;
    this.snapshot.model = request.model;
    this.snapshot.linkedPaneId = request.linkedPaneId;
    this.snapshot.sshContext = request.sshContext;
    this.snapshot.error = undefined;

    if (this.snapshot.messages.length === 0 && request.seedMessages?.length) {
      this.snapshot.messages = [...request.seedMessages];
      this.contextManager.replaceMessages(this.snapshot.messages);
      this.emitNotice('warning', 'Imported existing chat transcript into the new agent runtime.');
    }

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: request.text,
      timestamp: new Date().toISOString(),
    };
    this.snapshot.messages.push(userMessage);
    this.contextManager.appendMessage(userMessage);
    this.appendEvent({
      id: userMessage.id,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: userMessage.timestamp,
      kind: 'user-message',
      status: 'completed',
      content: request.text,
    });

    this.setStatus('running');
    if (!this.runPromise) {
      this.runPromise = this.runLoop().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.snapshot.error = message;
        this.setStatus(this.isCancelled ? 'cancelled' : 'failed');
        this.deps.postError({
          paneId: this.snapshot.paneId,
          taskId: this.snapshot.taskId,
          error: message,
        });
      }).finally(() => {
        this.runPromise = null;
        this.syncState();
      });
    }
  }

  cancel(): void {
    this.isCancelled = true;
    this.abortController?.abort();
    this.activeRemoteCommand?.cancel();
    this.setStatus('cancelled');
  }

  respondApproval(approved: boolean): void {
    if (!this.snapshot.pendingApproval || !this.pendingApprovalResolver) {
      return;
    }

    const pendingApproval = this.snapshot.pendingApproval;
    const approvalResult: AgentApprovalResultEvent = {
      id: `approval-result-${pendingApproval.approvalId}`,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'approval-result',
      status: 'completed',
      approvalId: pendingApproval.approvalId,
      approved,
      reason: approved ? undefined : 'Rejected by user',
    };
    this.appendEvent(approvalResult);
    this.snapshot.pendingApproval = undefined;
    const resolve = this.pendingApprovalResolver;
    this.pendingApprovalResolver = null;
    this.setStatus('running');
    resolve(approved);
  }

  submitInteraction(request: AgentSubmitInteractionRequest): void {
    if (!this.snapshot.pendingInteraction || !this.pendingInteractionBridge) {
      return;
    }

    const pendingInteraction = this.snapshot.pendingInteraction;
    const bridge = this.pendingInteractionBridge;
    const appendNewline = pendingInteraction.interactionType !== 'pager';
    if (request.cancel) {
      bridge.cancel();
    } else {
      bridge.sendInput(request.input ?? '', appendNewline);
    }

    const interactionResult: AgentInteractionResultEvent = {
      id: `interaction-result-${pendingInteraction.interactionId}`,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'interaction-result',
      status: 'completed',
      interactionId: pendingInteraction.interactionId,
      commandId: pendingInteraction.commandId,
      inputPreview: request.cancel
        ? undefined
        : pendingInteraction.secret
          ? '***'
          : (request.input ?? '').slice(0, 120),
      cancelled: request.cancel,
    };
    this.appendEvent(interactionResult);
    this.snapshot.pendingInteraction = undefined;
    this.pendingInteractionBridge = null;
    this.setStatus('running');
  }

  private async runLoop(): Promise<void> {
    for (let round = 0; round < MAX_AGENT_TOOL_ROUNDS; round += 1) {
      if (this.isCancelled || !this.latestRequest || !this.currentProvider) {
        return;
      }

      const summary = this.contextManager.maybeCompact();
      if (summary) {
        this.snapshot.messages = this.contextManager.getMessages();
        this.appendEvent({
          id: `context-summary-${Date.now()}`,
          taskId: this.snapshot.taskId,
          paneId: this.snapshot.paneId,
          timestamp: new Date().toISOString(),
          kind: 'context-summary',
          status: 'completed',
          summary,
        });
      }

      const toolCalls = await this.performAssistantTurn();
      if (this.isCancelled) {
        return;
      }

      if (!toolCalls?.length) {
        this.setStatus('completed');
        return;
      }

      for (const toolCall of toolCalls) {
        if (this.isCancelled) {
          return;
        }
        await this.executeToolCall(toolCall);
      }
    }

    this.emitNotice('error', 'Agent exceeded the maximum recursive tool rounds and stopped.');
    this.setStatus('failed');
  }

  private async performAssistantTurn(): Promise<ToolCall[] | undefined> {
    if (!this.latestRequest || !this.currentProvider) {
      return undefined;
    }

    const turnId = uuidv4();
    const reasoningEventId = `reasoning-${turnId}`;
    const assistantEventId = `assistant-${turnId}`;
    let aggregated = '';
    let toolCalls: ToolCall[] | undefined;
    let streamError: string | null = null;

    this.abortController = new AbortController();
    const systemPrompt = buildAgentSystemPrompt({
      request: this.latestRequest,
      skillsManager: this.deps.skillsManager,
      mcpHub: this.deps.mcpHub,
    });

    await this.deps.chatService.streamChat(
      {
        ...this.latestRequest,
        paneId: this.snapshot.paneId,
        windowId: this.snapshot.windowId,
        messages: this.contextManager.getMessages(),
        providerId: this.currentProvider.id,
        model: this.snapshot.model,
        enableTools: this.latestRequest.enableTools,
        systemPrompt,
        _provider: this.currentProvider,
      } as Parameters<ChatService['streamChat']>[0] & { _provider: LLMProviderConfig },
      {
        onChunk: (chunk) => {
          aggregated += chunk;
          const sections = parseAssistantSections(aggregated);

          if (sections.reasoning) {
            const reasoningEvent: AgentReasoningEvent = {
              id: reasoningEventId,
              taskId: this.snapshot.taskId,
              paneId: this.snapshot.paneId,
              timestamp: new Date().toISOString(),
              kind: 'reasoning',
              status: 'streaming',
              content: sections.reasoning,
            };
            this.appendEvent(reasoningEvent);
          }

          if (sections.response) {
            this.appendEvent({
              id: assistantEventId,
              taskId: this.snapshot.taskId,
              paneId: this.snapshot.paneId,
              timestamp: new Date().toISOString(),
              kind: 'assistant-message',
              status: 'streaming',
              content: sections.response,
            });
          }
        },
        onDone: (fullContent, nextToolCalls) => {
          aggregated = fullContent;
          toolCalls = nextToolCalls?.map((toolCall) => ({
            ...toolCall,
            status: 'pending',
          }));
        },
        onError: (error) => {
          streamError = error;
        },
      },
      this.abortController.signal,
    );

    if (streamError) {
      throw new Error(streamError);
    }

    const sections = parseAssistantSections(aggregated);
    if (sections.reasoning) {
      this.appendEvent({
        id: reasoningEventId,
        taskId: this.snapshot.taskId,
        paneId: this.snapshot.paneId,
        timestamp: new Date().toISOString(),
        kind: 'reasoning',
        status: 'completed',
        content: sections.reasoning,
      });
    }

    const assistantMessage: ChatMessage = {
      id: assistantEventId,
      role: 'assistant',
      content: sections.response || aggregated.trim(),
      timestamp: new Date().toISOString(),
      model: this.snapshot.model,
      toolCalls,
    };
    this.snapshot.messages.push(assistantMessage);
    this.contextManager.appendMessage(assistantMessage);
    this.appendEvent({
      id: assistantEventId,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: assistantMessage.timestamp,
      kind: 'assistant-message',
      status: 'completed',
      content: assistantMessage.content,
    });

    for (const toolCall of toolCalls ?? []) {
      const event: AgentToolCallEvent = {
        id: `tool-${toolCall.id}`,
        taskId: this.snapshot.taskId,
        paneId: this.snapshot.paneId,
        timestamp: new Date().toISOString(),
        kind: 'tool-call',
        status: 'pending',
        toolCall,
      };
      this.appendEvent(event);
    }

    return toolCalls;
  }

  private async executeToolCall(toolCall: ToolCall): Promise<void> {
    const toolEventId = `tool-${toolCall.id}`;
    this.appendEvent({
      id: toolEventId,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'tool-call',
      status: 'running',
      toolCall: {
        ...toolCall,
        status: 'executing',
      },
    });

    let result: ToolResult;

    if (toolCall.name === 'execute_command') {
      const approvalDecision = resolveToolApprovalDecision(toolCall, {
        commandSecurityEnabled: this.deps.commandSecurityEnabled,
      });

      if (approvalDecision.action === 'block') {
        result = {
          toolCallId: toolCall.id,
          content: `命令被安全策略阻止：${approvalDecision.reason ?? 'blocked'}`,
          isError: true,
        };
        await this.finishToolCall(toolCall, result, 'blocked');
        return;
      }

      if (approvalDecision.action === 'ask') {
        const approved = await this.waitForApproval(toolCall, approvalDecision.reason);
        if (!approved) {
          result = {
            toolCallId: toolCall.id,
            content: '用户拒绝了该命令的执行',
            isError: true,
          };
          await this.finishToolCall(toolCall, result, 'rejected');
          return;
        }
      }
    }

    if (!this.snapshot.sshContext || !this.deps.toolExecutor) {
      result = {
        toolCallId: toolCall.id,
        content: '缺少 SSH 上下文或工具执行器，无法继续执行远端工具。',
        isError: true,
      };
      await this.finishToolCall(toolCall, result, 'error');
      return;
    }

    if (toolCall.name === 'execute_command' && this.deps.remoteTerminalManager) {
      result = await this.executeRemoteCommand(toolCall);
      await this.finishToolCall(toolCall, result, result.isError ? 'error' : 'completed');
      return;
    }

    result = await this.deps.toolExecutor.execute(toolCall, this.snapshot.sshContext);
    await this.finishToolCall(toolCall, result, result.isError ? 'error' : 'completed');
  }

  private async executeRemoteCommand(toolCall: ToolCall): Promise<ToolResult> {
    if (!this.snapshot.sshContext || !this.deps.remoteTerminalManager) {
      return {
        toolCallId: toolCall.id,
        content: 'Remote terminal runtime unavailable.',
        isError: true,
      };
    }

    const command = String(toolCall.params.command ?? '');
    const interactive = toolCall.params.interactive === true;
    const commandEventId = `command-${toolCall.id}`;
    const host = this.snapshot.sshContext.host;

    const commandEvent: AgentCommandEvent = {
      id: commandEventId,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'command',
      status: 'running',
      commandId: commandEventId,
      host,
      command,
      interactive,
    };
    this.appendEvent(commandEvent);

    this.activeRemoteCommand = this.deps.remoteTerminalManager.runCommand({
      windowId: this.snapshot.sshContext.windowId,
      paneId: this.snapshot.sshContext.paneId,
      command,
      callbacks: {
        onOutput: (chunk) => {
          this.commandOutputSeq += 1;
          const event: AgentCommandOutputEvent = {
            id: `command-output-${toolCall.id}-${this.commandOutputSeq}`,
            taskId: this.snapshot.taskId,
            paneId: this.snapshot.paneId,
            timestamp: new Date().toISOString(),
            kind: 'command-output',
            status: 'completed',
            commandId: commandEventId,
            stream: 'pty',
            content: chunk,
          };
          this.appendEvent(event);
        },
        onInteraction: (request) => {
          this.presentInteraction(toolCall, request);
        },
      },
    });

    const commandResult = await this.activeRemoteCommand.result;
    this.activeRemoteCommand = null;
    this.pendingInteractionBridge = null;
    this.snapshot.pendingInteraction = undefined;

    this.appendEvent({
      ...commandEvent,
      status: commandResult.exitCode === 0 && !commandResult.timedOut ? 'completed' : 'error',
      exitCode: commandResult.exitCode,
    });

    const normalized = await maybeOffloadContent(
      this.snapshot.taskId,
      `command-${toolCall.id}`,
      commandResult.output,
    );
    if (normalized.offloadRef) {
      this.snapshot.offloadRefs.push(normalized.offloadRef);
    }

    const isError = commandResult.timedOut || commandResult.exitCode !== 0;
    return {
      toolCallId: toolCall.id,
      content: normalized.content || '(command completed with no output)',
      isError,
    };
  }

  private presentInteraction(toolCall: ToolCall, request: InteractionRequest): void {
    const pendingInteraction: AgentPendingInteraction = {
      interactionId: request.interactionId,
      commandId: `command-${toolCall.id}`,
      interactionType: request.interactionType,
      prompt: request.prompt,
      options: request.options,
      submitLabel: request.submitLabel,
      secret: request.secret,
      createdAt: new Date().toISOString(),
    };
    this.snapshot.pendingInteraction = pendingInteraction;
    this.pendingInteractionBridge = this.activeRemoteCommand
      ? {
          interactionId: request.interactionId,
          interactionType: request.interactionType,
          sendInput: this.activeRemoteCommand.sendInput,
          cancel: this.activeRemoteCommand.cancel,
        }
      : null;

    const event: AgentInteractionRequestEvent = {
      id: `interaction-${request.interactionId}`,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'interaction-request',
      status: 'pending',
      interactionId: request.interactionId,
      commandId: `command-${toolCall.id}`,
      interactionType: request.interactionType,
      prompt: request.prompt,
      options: request.options,
      submitLabel: request.submitLabel,
      secret: request.secret,
    };
    this.setStatus('waiting_interaction');
    this.appendEvent(event);
  }

  private async waitForApproval(toolCall: ToolCall, reason?: string): Promise<boolean> {
    const pendingApproval: AgentPendingApproval = {
      approvalId: uuidv4(),
      toolCall,
      reason,
      createdAt: new Date().toISOString(),
    };
    this.snapshot.pendingApproval = pendingApproval;

    const event: AgentApprovalRequestEvent = {
      id: `approval-${pendingApproval.approvalId}`,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'approval-request',
      status: 'pending',
      approvalId: pendingApproval.approvalId,
      toolCall,
      reason,
    };
    this.setStatus('waiting_approval');
    this.appendEvent(event);

    return await new Promise<boolean>((resolve) => {
      this.pendingApprovalResolver = resolve;
      this.syncState();
    });
  }

  private async finishToolCall(
    toolCall: ToolCall,
    result: ToolResult,
    status: ToolCall['status'],
  ): Promise<void> {
    const normalized = await maybeOffloadContent(
      this.snapshot.taskId,
      `tool-${toolCall.id}`,
      result.content,
    );
    if (normalized.offloadRef) {
      this.snapshot.offloadRefs.push(normalized.offloadRef);
    }

    this.appendEvent({
      id: `tool-${toolCall.id}`,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'tool-call',
      status: result.isError ? 'error' : 'completed',
      toolCall: {
        ...toolCall,
        status,
        result: normalized.content,
      },
    });

    const toolResultEvent: AgentToolResultEvent = {
      id: `tool-result-${toolCall.id}`,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'tool-result',
      status: 'completed',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: normalized.content,
      isError: result.isError,
      offloadRef: normalized.offloadRef,
    };
    this.appendEvent(toolResultEvent);

    const toolResultMessage: ChatMessage = {
      id: `tool-result-message-${toolCall.id}-${Date.now()}`,
      role: 'user',
      content: '',
      timestamp: new Date().toISOString(),
      toolResult: {
        toolCallId: toolCall.id,
        content: normalized.content,
        isError: result.isError,
      },
    };
    this.snapshot.messages.push(toolResultMessage);
    this.contextManager.appendMessage(toolResultMessage);
  }

  private appendEvent(event: AgentTimelineEvent): void {
    const existingIndex = this.snapshot.timeline.findIndex((item) => item.id === event.id);
    if (existingIndex >= 0) {
      this.snapshot.timeline[existingIndex] = event;
    } else {
      this.snapshot.timeline.push(event);
    }

    this.snapshot.updatedAt = new Date().toISOString();
    this.deps.postEvent({
      paneId: this.snapshot.paneId,
      taskId: this.snapshot.taskId,
      event,
    });
    this.syncState();
  }

  private emitNotice(level: AgentSystemNoticeEvent['level'], content: string): void {
    this.appendEvent({
      id: `notice-${uuidv4()}`,
      taskId: this.snapshot.taskId,
      paneId: this.snapshot.paneId,
      timestamp: new Date().toISOString(),
      kind: 'system-notice',
      status: 'completed',
      level,
      content,
    });
  }

  private setStatus(status: AgentTaskSnapshot['status']): void {
    this.snapshot.status = status;
    this.snapshot.updatedAt = new Date().toISOString();
    this.syncState();
  }

  private syncState(): void {
    this.deps.postState(this.getSnapshot());
  }
}
