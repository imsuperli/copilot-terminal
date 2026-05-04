import type { AgentTaskSnapshot } from '../../shared/types/agent';
import type { AgentTimelineEvent } from '../../shared/types/agentTimeline';
import type { CanvasActivityEvent } from '../../shared/types/canvas';
import type { ChatMessage } from '../../shared/types/chat';
import type { TaskActivityEvent } from '../../shared/types/task';

function summarizeContent(value: string | undefined, maxLength = 140): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function mapTimelineEvent(event: AgentTimelineEvent, task: AgentTaskSnapshot): TaskActivityEvent | null {
  switch (event.kind) {
    case 'reasoning':
      return {
        id: `timeline:${event.id}`,
        conversationId: undefined,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'reasoning',
        title: 'Reasoning',
        message: summarizeContent(event.content),
      };
    case 'tool-call':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'tool-call',
        level: event.status === 'error' ? 'error' : undefined,
        title: event.toolCall.name,
        message: summarizeContent(JSON.stringify(event.toolCall.params)),
      };
    case 'tool-result':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'tool-result',
        level: event.isError ? 'error' : undefined,
        title: event.toolName ?? 'Tool result',
        message: summarizeContent(event.content),
      };
    case 'approval-request':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'approval-request',
        level: 'warning',
        title: event.toolCall.name,
        message: summarizeContent(event.reason),
      };
    case 'approval-result':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'approval-result',
        level: event.approved ? 'info' : 'warning',
        title: event.approved ? 'Approved' : 'Rejected',
        message: summarizeContent(event.reason),
      };
    case 'interaction-request':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'interaction-request',
        level: 'warning',
        title: event.submitLabel ?? 'Interaction',
        message: summarizeContent(event.prompt),
      };
    case 'interaction-result':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'interaction-result',
        title: event.cancelled ? 'Cancelled' : 'Submitted',
        message: summarizeContent(event.inputPreview),
      };
    case 'assistant-message':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'assistant-message',
        title: 'Assistant',
        message: summarizeContent(event.content),
      };
    case 'user-message':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: 'user-message',
        title: 'User',
        message: summarizeContent(event.content),
      };
    case 'system-notice':
      return {
        id: `timeline:${event.id}`,
        paneId: task.paneId,
        windowId: task.windowId,
        timestamp: event.timestamp,
        kind: event.level === 'error' ? 'agent-error' : 'agent-status',
        level: event.level,
        title: event.title ?? 'System notice',
        message: summarizeContent(event.content),
      };
    default:
      return null;
  }
}

export function buildTaskActivityStream(input: {
  conversationId?: string;
  messages: ChatMessage[];
  agent?: AgentTaskSnapshot;
  canvasEvents?: CanvasActivityEvent[];
  artifacts?: Array<{ id: string; title: string; createdAt: string; kind: string }>;
}): TaskActivityEvent[] {
  const events: TaskActivityEvent[] = [];

  for (const message of input.messages) {
    if (!message.content.trim()) {
      continue;
    }

    events.push({
      id: `message:${message.id}`,
      conversationId: input.conversationId,
      paneId: input.agent?.paneId,
      windowId: input.agent?.windowId,
      timestamp: message.timestamp,
      kind: message.role === 'assistant' ? 'assistant-message' : 'user-message',
      title: message.role === 'assistant' ? 'Assistant' : 'User',
      message: summarizeContent(message.content),
    });
  }

  if (input.agent) {
    for (const timelineEvent of input.agent.timeline) {
      const mapped = mapTimelineEvent(timelineEvent, input.agent);
      if (mapped) {
        events.push(mapped);
      }
    }

    if (input.agent.error) {
      events.push({
        id: `agent-error:${input.agent.taskId}`,
        conversationId: input.conversationId,
        paneId: input.agent.paneId,
        windowId: input.agent.windowId,
        timestamp: input.agent.updatedAt,
        kind: 'agent-error',
        level: 'error',
        title: 'Agent error',
        message: summarizeContent(input.agent.error),
      });
    }
  }

  for (const canvasEvent of input.canvasEvents ?? []) {
    events.push({
      id: `canvas:${canvasEvent.id}`,
      conversationId: input.conversationId,
      paneId: canvasEvent.paneId,
      windowId: canvasEvent.windowId,
      workspaceId: canvasEvent.workspaceId,
      timestamp: canvasEvent.timestamp,
      kind: 'canvas-event',
      title: canvasEvent.title,
      message: summarizeContent(canvasEvent.message),
    });
  }

  for (const artifact of input.artifacts ?? []) {
    events.push({
      id: `artifact:${artifact.id}`,
      conversationId: input.conversationId,
      timestamp: artifact.createdAt,
      kind: 'artifact-saved',
      title: artifact.title,
      message: artifact.kind,
    });
  }

  return events
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .slice(-160);
}
