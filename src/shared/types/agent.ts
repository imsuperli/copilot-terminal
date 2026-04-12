import type { ChatMessage, ChatSshContext, ToolCall } from './chat';
import type {
  AgentInteractionType,
  AgentOffloadRef,
  AgentTimelineEvent,
} from './agentTimeline';

export type AgentTaskStatus =
  | 'idle'
  | 'running'
  | 'waiting_approval'
  | 'waiting_interaction'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentPendingApproval {
  approvalId: string;
  toolCall: ToolCall;
  reason?: string;
  createdAt: string;
}

export interface AgentPendingInteraction {
  interactionId: string;
  commandId: string;
  interactionType: AgentInteractionType;
  prompt: string;
  options?: string[];
  submitLabel?: string;
  secret?: boolean;
  createdAt: string;
}

export interface AgentUsageSnapshot {
  inputTokens?: number;
  outputTokens?: number;
  totalCostUsd?: number;
}

export interface AgentTaskSnapshot {
  taskId: string;
  paneId: string;
  windowId: string;
  status: AgentTaskStatus;
  providerId: string;
  model: string;
  linkedPaneId?: string;
  sshContext?: ChatSshContext;
  timeline: AgentTimelineEvent[];
  messages: ChatMessage[];
  offloadRefs: AgentOffloadRef[];
  pendingApproval?: AgentPendingApproval;
  pendingInteraction?: AgentPendingInteraction;
  error?: string;
  createdAt: string;
  updatedAt: string;
  usage?: AgentUsageSnapshot;
}

export interface AgentSendRequest {
  paneId: string;
  windowId: string;
  providerId: string;
  model: string;
  text: string;
  systemPrompt?: string;
  enableTools?: boolean;
  linkedPaneId?: string;
  sshContext?: ChatSshContext;
  environmentDetails?: string;
  seedMessages?: ChatMessage[];
}

export interface AgentSendResponse {
  taskId: string;
  status: AgentTaskStatus;
}

export interface AgentCancelRequest {
  paneId: string;
  taskId?: string;
}

export interface AgentResetRequest {
  paneId: string;
  taskId?: string;
}

export interface AgentRespondApprovalRequest {
  paneId: string;
  taskId: string;
  approvalId: string;
  approved: boolean;
}

export interface AgentSubmitInteractionRequest {
  paneId: string;
  taskId: string;
  interactionId: string;
  input?: string;
  cancel?: boolean;
}

export interface AgentGetTaskRequest {
  paneId: string;
  taskId?: string;
}

export interface AgentRestoreTaskRequest {
  task: AgentTaskSnapshot;
}

export interface AgentTaskEventPayload {
  paneId: string;
  taskId: string;
  event: AgentTimelineEvent;
}

export interface AgentTaskStatePayload {
  paneId: string;
  task: AgentTaskSnapshot;
}

export interface AgentTaskErrorPayload {
  paneId: string;
  taskId?: string;
  error: string;
}
