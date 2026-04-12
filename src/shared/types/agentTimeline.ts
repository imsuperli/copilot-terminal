import type { ToolCall, ToolName } from './chat';

export type AgentTimelineEventStatus =
  | 'pending'
  | 'running'
  | 'streaming'
  | 'completed'
  | 'error'
  | 'cancelled';

export type AgentNoticeLevel = 'info' | 'warning' | 'error';
export type AgentInteractionType = 'confirm' | 'select' | 'password' | 'pager' | 'enter' | 'freeform';

export interface AgentOffloadRef {
  id: string;
  path: string;
  preview: string;
  totalChars: number;
}

export interface AgentTimelineEventBase {
  id: string;
  taskId: string;
  paneId: string;
  timestamp: string;
  kind: AgentTimelineEvent['kind'];
  status?: AgentTimelineEventStatus;
}

export interface AgentUserMessageEvent extends AgentTimelineEventBase {
  kind: 'user-message';
  content: string;
}

export interface AgentAssistantMessageEvent extends AgentTimelineEventBase {
  kind: 'assistant-message';
  content: string;
}

export interface AgentReasoningEvent extends AgentTimelineEventBase {
  kind: 'reasoning';
  content: string;
}

export interface AgentToolCallEvent extends AgentTimelineEventBase {
  kind: 'tool-call';
  toolCall: ToolCall;
}

export interface AgentToolResultEvent extends AgentTimelineEventBase {
  kind: 'tool-result';
  toolCallId: string;
  toolName?: ToolName;
  content: string;
  isError?: boolean;
  offloadRef?: AgentOffloadRef;
}

export interface AgentCommandEvent extends AgentTimelineEventBase {
  kind: 'command';
  commandId: string;
  host: string;
  command: string;
  interactive: boolean;
  exitCode?: number;
}

export interface AgentCommandOutputEvent extends AgentTimelineEventBase {
  kind: 'command-output';
  commandId: string;
  content: string;
  stream: 'stdout' | 'stderr' | 'pty';
  offloadRef?: AgentOffloadRef;
}

export interface AgentApprovalRequestEvent extends AgentTimelineEventBase {
  kind: 'approval-request';
  approvalId: string;
  toolCall: ToolCall;
  reason?: string;
}

export interface AgentApprovalResultEvent extends AgentTimelineEventBase {
  kind: 'approval-result';
  approvalId: string;
  approved: boolean;
  reason?: string;
}

export interface AgentInteractionRequestEvent extends AgentTimelineEventBase {
  kind: 'interaction-request';
  interactionId: string;
  commandId: string;
  interactionType: AgentInteractionType;
  prompt: string;
  options?: string[];
  submitLabel?: string;
  secret?: boolean;
}

export interface AgentInteractionResultEvent extends AgentTimelineEventBase {
  kind: 'interaction-result';
  interactionId: string;
  commandId: string;
  inputPreview?: string;
  cancelled?: boolean;
}

export interface AgentSystemNoticeEvent extends AgentTimelineEventBase {
  kind: 'system-notice';
  level: AgentNoticeLevel;
  title?: string;
  content: string;
}

export interface AgentContextSummaryEvent extends AgentTimelineEventBase {
  kind: 'context-summary';
  summary: string;
  offloadRefs?: AgentOffloadRef[];
}

export type AgentTimelineEvent =
  | AgentUserMessageEvent
  | AgentAssistantMessageEvent
  | AgentReasoningEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentCommandEvent
  | AgentCommandOutputEvent
  | AgentApprovalRequestEvent
  | AgentApprovalResultEvent
  | AgentInteractionRequestEvent
  | AgentInteractionResultEvent
  | AgentSystemNoticeEvent
  | AgentContextSummaryEvent;
