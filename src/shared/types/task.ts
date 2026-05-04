import type { ChatMessage } from './chat';

export type AggregatedSessionSource = 'synapse' | 'claude-code' | 'codex';
export type AggregatedSessionScope = 'workspace' | 'user';
export type AggregatedSessionRestoreKind = 'full' | 'history-only';

export interface AggregatedSessionEntry {
  id: string;
  source: AggregatedSessionSource;
  scope: AggregatedSessionScope;
  title: string;
  updatedAt: number;
  createdAt?: number;
  cwd?: string;
  gitBranch?: string;
  model?: string;
  provider?: string;
  preview?: string;
  messageCount?: number;
  filePath?: string;
  sourceLabel: string;
  restoreKind: AggregatedSessionRestoreKind;
}

export interface AggregatedSessionMessage {
  id: string;
  role: ChatMessage['role'];
  content: string;
  timestamp: string;
  model?: string;
}

export interface AggregatedSessionDetail {
  entry: AggregatedSessionEntry;
  messages: AggregatedSessionMessage[];
  metadata?: Record<string, unknown>;
}

export type TaskActivityEventKind =
  | 'user-message'
  | 'assistant-message'
  | 'reasoning'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'approval-result'
  | 'interaction-request'
  | 'interaction-result'
  | 'checkpoint-saved'
  | 'history-restored'
  | 'artifact-saved'
  | 'report-exported'
  | 'canvas-event'
  | 'agent-status'
  | 'agent-error';

export type TaskActivityEventLevel = 'info' | 'warning' | 'error';

export interface TaskActivityEvent {
  id: string;
  conversationId?: string;
  paneId?: string;
  windowId?: string;
  workspaceId?: string;
  timestamp: string;
  kind: TaskActivityEventKind;
  level?: TaskActivityEventLevel;
  title: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type TaskPlanItemStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'cancelled';
export type TaskPlanSource = 'claude-todo' | 'agent-timeline' | 'assistant-message' | 'manual';

export interface TaskPlanItem {
  id: string;
  text: string;
  status: TaskPlanItemStatus;
  source: TaskPlanSource;
  order: number;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export type TaskArtifactKind =
  | 'conversation'
  | 'agent-snapshot'
  | 'plan'
  | 'canvas-report'
  | 'canvas-evidence'
  | 'external-session-import';

export interface TaskArtifactRecord {
  id: string;
  kind: TaskArtifactKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;
  windowId?: string;
  paneId?: string;
  conversationId?: string;
  filePath: string;
  contentType: 'application/json' | 'text/markdown';
  sizeBytes: number;
  preview?: string;
}

export interface BrowserSyncProfile {
  id: string;
  name: string;
  email?: string;
  source: 'chrome';
  supported: boolean;
}

export interface BrowserSyncState {
  enabled: boolean;
  profileId?: string;
  profileName?: string;
  lastSyncedAt?: string;
  lastSyncCount?: number;
  lastSyncError?: string;
  platformSupported: boolean;
}

export interface McpToolSnapshot {
  serverName: string;
  toolName: string;
  description?: string;
}

export interface McpServerConfigSnapshot {
  serverName: string;
  toolCount: number;
  tools: McpToolSnapshot[];
}
