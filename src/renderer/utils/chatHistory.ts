import type { AgentTaskSnapshot } from '../../shared/types/agent';
import type { ChatMessage } from '../../shared/types/chat';

export interface ChatConversationHistoryEntry {
  id: string;
  windowId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  linkedPaneId?: string;
  activeProviderId?: string;
  activeModel?: string;
  messages: ChatMessage[];
  agent?: AgentTaskSnapshot;
}

const CHAT_CONVERSATION_HISTORY_STORAGE_KEY = 'synapse:chat-conversation-history:v1';
const LEGACY_CHAT_CONVERSATION_HISTORY_STORAGE_KEY = 'copilot-terminal:chat-conversation-history:v1';
const MAX_HISTORY_ENTRIES_PER_WINDOW = 24;

function getRendererLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.error('[chatHistory] Failed to access localStorage:', error);
    return null;
  }
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function truncateTitle(value: string, maxLength = 44): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'New conversation';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function readAllConversationHistory(): ChatConversationHistoryEntry[] {
  const storage = getRendererLocalStorage();
  if (!storage) {
    return [];
  }

  try {
    const rawValue = storage.getItem(CHAT_CONVERSATION_HISTORY_STORAGE_KEY)
      ?? storage.getItem(LEGACY_CHAT_CONVERSATION_HISTORY_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is ChatConversationHistoryEntry => (
      entry
      && typeof entry.id === 'string'
      && typeof entry.windowId === 'string'
      && typeof entry.title === 'string'
      && Array.isArray(entry.messages)
    ));
  } catch (error) {
    console.error('[chatHistory] Failed to parse stored conversation history:', error);
    return [];
  }
}

function writeAllConversationHistory(entries: ChatConversationHistoryEntry[]): void {
  const storage = getRendererLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(CHAT_CONVERSATION_HISTORY_STORAGE_KEY, JSON.stringify(entries));
    storage.removeItem(LEGACY_CHAT_CONVERSATION_HISTORY_STORAGE_KEY);
  } catch (error) {
    console.error('[chatHistory] Failed to persist conversation history:', error);
  }
}

export function createChatConversationHistoryId(): string {
  return `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildChatConversationTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => (
    message.role === 'user' && message.content.trim()
  ));
  if (firstUserMessage) {
    return truncateTitle(firstUserMessage.content);
  }

  const firstRenderableMessage = messages.find((message) => message.content.trim());
  if (firstRenderableMessage) {
    return truncateTitle(firstRenderableMessage.content);
  }

  return 'New conversation';
}

export function normalizeAgentSnapshotForHistory(
  snapshot: AgentTaskSnapshot | undefined,
  paneId: string,
  windowId: string,
): AgentTaskSnapshot | undefined {
  if (!snapshot) {
    return undefined;
  }

  const cloned = cloneJsonValue(snapshot);
  const hadInflightStatus = ['running', 'waiting_approval', 'waiting_interaction'].includes(cloned.status);

  cloned.paneId = paneId;
  cloned.windowId = windowId;
  cloned.pendingApproval = undefined;
  cloned.pendingInteraction = undefined;

  cloned.timeline = cloned.timeline.map((event) => {
    const nextStatus = event.status && ['pending', 'running', 'streaming'].includes(event.status)
      ? 'cancelled'
      : event.status;

    if (event.kind === 'tool-call' && ['pending', 'approved', 'executing'].includes(event.toolCall.status)) {
      return {
        ...event,
        taskId: cloned.taskId,
        paneId,
        status: nextStatus,
        toolCall: {
          ...event.toolCall,
          status: 'error',
          reason: event.toolCall.reason ?? 'Execution was interrupted before this history snapshot was saved.',
        },
      };
    }

    return {
      ...event,
      taskId: cloned.taskId,
      paneId,
      status: nextStatus,
    };
  });

  if (hadInflightStatus) {
    cloned.status = 'cancelled';
    cloned.error = undefined;
    cloned.updatedAt = new Date().toISOString();
  }

  return cloned;
}

export function loadChatConversationHistory(windowId: string): ChatConversationHistoryEntry[] {
  return readAllConversationHistory()
    .filter((entry) => entry.windowId === windowId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((entry) => cloneJsonValue(entry));
}

export function getLatestChatConversationHistory(windowId: string): ChatConversationHistoryEntry | undefined {
  return loadChatConversationHistory(windowId)[0];
}

export function upsertChatConversationHistory(entry: ChatConversationHistoryEntry): ChatConversationHistoryEntry[] {
  const nextEntry = cloneJsonValue(entry);
  const existingEntries = readAllConversationHistory().filter((item) => item.id !== nextEntry.id);
  const targetWindowEntries = [
    nextEntry,
    ...existingEntries
      .filter((item) => item.windowId === nextEntry.windowId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  ].slice(0, MAX_HISTORY_ENTRIES_PER_WINDOW);
  const otherWindowEntries = existingEntries.filter((item) => item.windowId !== nextEntry.windowId);
  const merged = [...targetWindowEntries, ...otherWindowEntries];

  writeAllConversationHistory(merged);
  return loadChatConversationHistory(nextEntry.windowId);
}
