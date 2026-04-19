import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, History, SendHorizonal, Sparkles, Square, Undo2, X } from 'lucide-react';
import type { AgentTaskSnapshot } from '../../shared/types/agent';
import type { AgentTimelineEvent } from '../../shared/types/agentTimeline';
import type { ChatMessage, ChatSettings, ChatSshContext, LLMProviderConfig } from '../../shared/types/chat';
import type { Pane } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { preventMouseButtonFocus } from '../utils/buttonFocus';
import { getPaneBackend, isTerminalPane } from '../../shared/utils/terminalCapabilities';
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from '../utils/settingsEvents';
import { ChatNewConversationIcon } from './icons/ChatNewConversationIcon';
import { selectPreferredChatLinkedPaneId } from '../utils/chatPane';
import {
  buildChatConversationTitle,
  createChatConversationHistoryId,
  getLatestChatConversationHistory,
  loadChatConversationHistory,
  normalizeAgentSnapshotForHistory,
  upsertChatConversationHistory,
  type ChatConversationHistoryEntry,
} from '../utils/chatHistory';
import { AgentTimeline } from './agent/AgentTimeline';
import { renderMarkdownLike } from './agent/RichText';

export interface ChatPaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
}

interface ProviderModelOption {
  value: string;
  providerId: string;
  model: string;
  label: string;
}

interface MessageActionBarProps {
  copied: boolean;
  copyLabel: string;
  rollbackLabel?: string;
  onCopy: () => void;
  onRollback?: () => void;
}

function normalizeChatSettings(settings: ChatSettings | undefined): ChatSettings {
  return {
    providers: settings?.providers ?? [],
    activeProviderId: settings?.activeProviderId,
    defaultSystemPrompt: settings?.defaultSystemPrompt,
    enableCommandSecurity: settings?.enableCommandSecurity ?? true,
  };
}

function encodeProviderModelSelection(providerId: string, model: string): string {
  return JSON.stringify([providerId, model]);
}

function decodeProviderModelSelection(value: string): { providerId: string; model: string } | null {
  try {
    const parsed = JSON.parse(value);
    if (
      Array.isArray(parsed)
      && parsed.length === 2
      && typeof parsed[0] === 'string'
      && typeof parsed[1] === 'string'
    ) {
      return {
        providerId: parsed[0],
        model: parsed[1],
      };
    }
  } catch {
    return null;
  }

  return null;
}

function collectProviderModels(provider: LLMProviderConfig, activeModel?: string): string[] {
  const nextModels = [
    provider.defaultModel,
    ...(provider.models ?? []),
    activeModel,
  ].filter((model): model is string => Boolean(model && model.trim()));

  return Array.from(new Set(nextModels));
}

function buildProviderModelOptions(
  providers: LLMProviderConfig[],
  activeProviderId?: string,
  activeModel?: string,
): ProviderModelOption[] {
  return providers.flatMap((provider) => {
    const models = collectProviderModels(
      provider,
      provider.id === activeProviderId ? activeModel : undefined,
    );

    return models.map((model) => ({
      value: encodeProviderModelSelection(provider.id, model),
      providerId: provider.id,
      model,
      label: `${provider.name} / ${model}`,
    }));
  });
}

function ControlSelect({
  ariaLabel,
  value,
  onChange,
  disabled = false,
  icon,
  minWidthClass = 'min-w-[140px]',
  children,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  minWidthClass?: string;
  children: React.ReactNode;
}) {
  const hasIcon = Boolean(icon);

  return (
    <label className={`relative inline-flex max-w-full items-center ${minWidthClass}`}>
      <span className="sr-only">{ariaLabel}</span>
      {hasIcon ? (
        <span className="pointer-events-none absolute left-3 text-[rgb(var(--muted-foreground))]">
          {icon}
        </span>
      ) : null}
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`h-9 min-w-0 w-full appearance-none rounded-[16px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/90 pr-8 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]/70 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${hasIcon ? 'pl-9' : 'pl-3'}`}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 text-[rgb(var(--muted-foreground))]" />
    </label>
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is unavailable.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function cloneChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    toolCalls: message.toolCalls?.map((toolCall) => ({
      ...toolCall,
      params: { ...toolCall.params },
    })),
    toolResult: message.toolResult ? { ...message.toolResult } : undefined,
  }));
}

function hasConversationContent(messages: ChatMessage[], agent?: AgentTaskSnapshot): boolean {
  return messages.length > 0 || Boolean(agent?.timeline.length);
}

function formatHistoryTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildRollbackSnapshot(
  task: AgentTaskSnapshot | undefined,
  messageId: string,
  paneId: string,
  windowId: string,
): AgentTaskSnapshot | undefined {
  if (!task) {
    return undefined;
  }

  const rollbackMessageIndex = task.messages.findIndex((message) => (
    message.id === messageId && message.role === 'user'
  ));
  if (rollbackMessageIndex < 0) {
    return normalizeAgentSnapshotForHistory(task, paneId, windowId);
  }

  const nextMessages = task.messages.slice(0, rollbackMessageIndex);
  if (nextMessages.length === 0) {
    return undefined;
  }

  const rollbackTimelineIndex = task.timeline.findIndex((event) => (
    event.kind === 'user-message' && event.id === messageId
  ));
  const nextTimeline = rollbackTimelineIndex >= 0
    ? task.timeline.slice(0, rollbackTimelineIndex)
    : task.timeline;

  return normalizeAgentSnapshotForHistory({
    ...task,
    paneId,
    windowId,
    status: 'completed',
    timeline: nextTimeline,
    messages: nextMessages,
    pendingApproval: undefined,
    pendingInteraction: undefined,
    error: undefined,
    updatedAt: new Date().toISOString(),
  }, paneId, windowId);
}

function MessageActionBar({
  copied,
  copyLabel,
  rollbackLabel,
  onCopy,
  onRollback,
}: MessageActionBarProps) {
  const actionButtonClassName =
    'inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_82%,transparent)] text-[rgb(var(--muted-foreground))] transition-colors duration-150 hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--foreground))]';
  return (
    <div className="pointer-events-none flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
      {onRollback ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={rollbackLabel}
          onMouseDown={preventMouseButtonFocus}
          onClick={onRollback}
          className={actionButtonClassName}
        >
          <Undo2 size={13} strokeWidth={1.9} />
        </button>
      ) : null}
      <button
        type="button"
        tabIndex={-1}
        aria-label={copyLabel}
        onMouseDown={preventMouseButtonFocus}
        onClick={onCopy}
        className={actionButtonClassName}
      >
        {copied ? <Check size={13} strokeWidth={2.2} /> : <Copy size={13} strokeWidth={1.9} />}
      </button>
    </div>
  );
}

function renderLegacyMessage(
  message: ChatMessage,
  {
    copied,
    copyLabel,
    rollbackLabel,
    onCopy,
    onRollback,
  }: {
    copied: boolean;
    copyLabel: string;
    rollbackLabel?: string;
    onCopy: () => void;
    onRollback?: () => void;
  },
) {
  if (message.role === 'user' && !message.toolResult) {
    return (
      <div className="group flex items-start justify-end gap-2">
        <MessageActionBar
          copied={copied}
          copyLabel={copyLabel}
          rollbackLabel={rollbackLabel}
          onCopy={onCopy}
          onRollback={onRollback}
        />
        <div className="max-w-[78%] rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/95 px-4 py-3 sm:max-w-[68%]">
          <div className="space-y-2 text-[15px] leading-6 text-[rgb(var(--foreground))]">
            {renderMarkdownLike(message.content)}
          </div>
        </div>
      </div>
    );
  }

  if (message.toolResult) {
    return (
      <div className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--card))]/90 px-4 py-3 text-[rgb(var(--foreground))]">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-[rgb(var(--foreground))]">
          {message.toolResult.content}
        </pre>
      </div>
    );
  }

  return (
    <div className="group relative">
      <div className="absolute right-0 top-0 z-10">
        <MessageActionBar
          copied={copied}
          copyLabel={copyLabel}
          onCopy={onCopy}
        />
      </div>
      <div className="pr-10">
        <div className="space-y-2 text-[15px] leading-6 text-[rgb(var(--foreground))]">
          {renderMarkdownLike(message.content)}
        </div>
      </div>
    </div>
  );
}

function hasExecutableSshBinding(pane: Pane | null | undefined): boolean {
  if (!pane || getPaneBackend(pane) !== 'ssh') {
    return false;
  }

  return Boolean(
    pane.ssh?.profileId?.trim()
      || (pane.ssh?.host?.trim() && pane.ssh?.user?.trim()),
  );
}

function createOptimisticId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPathLeaf(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : undefined;
}

function isGenericWindowName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized === 'ai chat'
    || normalized === 'chat window'
    || normalized === 'ssh window'
    || normalized === 'local window'
    || normalized === 'terminal window'
    || normalized.endsWith(' window');
}

function resolveEmptyConversationTarget(
  terminalWindowName: string | undefined,
  linkedPane: Pane | null,
): string | undefined {
  if (linkedPane) {
    const cwdTarget = getPathLeaf(linkedPane.cwd)
      ?? getPathLeaf(linkedPane.ssh?.remoteCwd);
    if (cwdTarget) {
      return cwdTarget;
    }

    const sshHost = linkedPane.ssh?.host?.trim();
    if (sshHost) {
      return sshHost;
    }
  }

  const trimmedWindowName = terminalWindowName?.trim();
  if (trimmedWindowName && !isGenericWindowName(trimmedWindowName)) {
    return trimmedWindowName;
  }

  return undefined;
}

function createLegacyTimeline(messages: ChatMessage[]): AgentTimelineEvent[] {
  return messages.flatMap((message): AgentTimelineEvent[] => {
    if (message.toolResult) {
      return [{
        id: `legacy-tool-result-${message.id}`,
        taskId: 'legacy',
        paneId: 'legacy',
        timestamp: message.timestamp,
        kind: 'tool-result',
        status: message.toolResult.isError ? 'error' : 'completed',
        toolCallId: message.toolResult.toolCallId,
        content: message.toolResult.content,
        isError: message.toolResult.isError,
      }];
    }

    if (message.role === 'assistant') {
      return [{
        id: `legacy-assistant-${message.id}`,
        taskId: 'legacy',
        paneId: 'legacy',
        timestamp: message.timestamp,
        kind: 'assistant-message',
        status: 'completed',
        content: message.content,
      }];
    }

    if (message.role === 'system') {
      return [{
        id: `legacy-system-${message.id}`,
        taskId: 'legacy',
        paneId: 'legacy',
        timestamp: message.timestamp,
        kind: 'system-notice',
        status: 'completed',
        level: 'info',
        content: message.content,
      }];
    }

    return [{
      id: `legacy-user-${message.id}`,
      taskId: 'legacy',
      paneId: 'legacy',
      timestamp: message.timestamp,
      kind: 'user-message',
      status: 'completed',
      content: message.content,
    }];
  });
}

function buildOptimisticAgentTask({
  windowId,
  paneId,
  providerId,
  model,
  text,
  linkedPaneId,
  sshContext,
  previousMessages,
  previousTask,
}: {
  windowId: string;
  paneId: string;
  providerId: string;
  model: string;
  text: string;
  linkedPaneId?: string;
  sshContext?: ChatSshContext;
  previousMessages: ChatMessage[];
  previousTask?: AgentTaskSnapshot;
}): AgentTaskSnapshot {
  const timestamp = new Date().toISOString();
  const taskId = previousTask?.taskId ?? createOptimisticId('optimistic-task');
  const userMessageId = createOptimisticId('optimistic-user');
  const reasoningEventId = createOptimisticId('reasoning-optimistic');
  const baseTimeline = previousTask?.timeline ?? createLegacyTimeline(previousMessages);
  const userMessage: ChatMessage = {
    id: userMessageId,
    role: 'user',
    content: text,
    timestamp,
  };

  return {
    taskId,
    paneId,
    windowId,
    status: 'running',
    providerId,
    model,
    linkedPaneId,
    sshContext,
    timeline: [
      ...baseTimeline,
      {
        id: userMessageId,
        taskId,
        paneId,
        timestamp,
        kind: 'user-message',
        status: 'completed',
        content: text,
      },
      {
        id: reasoningEventId,
        taskId,
        paneId,
        timestamp,
        kind: 'reasoning',
        status: 'streaming',
        content: '',
      },
    ],
    messages: [
      ...(previousTask?.messages ?? previousMessages),
      userMessage,
    ],
    offloadRefs: [...(previousTask?.offloadRefs ?? [])],
    pendingApproval: undefined,
    pendingInteraction: undefined,
    error: undefined,
    createdAt: previousTask?.createdAt ?? timestamp,
    updatedAt: timestamp,
    usage: previousTask?.usage,
  };
}

function isOptimisticReasoningEvent(event: AgentTimelineEvent): boolean {
  return event.kind === 'reasoning' && event.id.startsWith('reasoning-optimistic-');
}

function isInternalBootstrapEvent(event: AgentTimelineEvent): boolean {
  return event.kind === 'user-message'
    || event.kind === 'system-notice'
    || event.kind === 'context-summary';
}

function isRenderableAssistantProgressEvent(event: AgentTimelineEvent): boolean {
  switch (event.kind) {
    case 'reasoning':
      return Boolean(event.content.trim());
    case 'assistant-message':
      return Boolean(event.content.trim());
    case 'tool-call':
    case 'tool-result':
    case 'command':
    case 'command-output':
    case 'approval-request':
    case 'interaction-request':
      return true;
    default:
      return false;
  }
}

function hasVisibleAgentProgress(events: AgentTimelineEvent[]): boolean {
  return events.some((event) => (
    !isInternalBootstrapEvent(event)
    && isRenderableAssistantProgressEvent(event)
  ));
}

function isOptimisticAgentTask(task: AgentTaskSnapshot | null | undefined): boolean {
  if (!task) {
    return false;
  }

  return task.taskId.startsWith('optimistic-task-')
    || task.timeline.some(isOptimisticReasoningEvent);
}

function mergeAgentTaskWithOptimisticReasoning(
  task: AgentTaskSnapshot,
  optimisticTask?: AgentTaskSnapshot | null,
): AgentTaskSnapshot {
  const optimisticReasoningEvents = optimisticTask?.timeline
    .filter(isOptimisticReasoningEvent)
    .map((event) => ({
      ...event,
      taskId: task.taskId,
      paneId: task.paneId,
    })) ?? [];

  if (
    task.status !== 'running'
    || optimisticReasoningEvents.length === 0
    || hasVisibleAgentProgress(task.timeline)
  ) {
    return task;
  }

  const existingEventIds = new Set(task.timeline.map((event) => event.id));

  return {
    ...task,
    timeline: [
      ...task.timeline,
      ...optimisticReasoningEvents.filter((event) => !existingEventIds.has(event.id)),
    ],
  };
}

function selectNewestAgentTask(
  primary?: AgentTaskSnapshot | null,
  secondary?: AgentTaskSnapshot | null,
): AgentTaskSnapshot | undefined {
  if (!primary) {
    return secondary ?? undefined;
  }

  if (!secondary) {
    return primary;
  }

  return primary.updatedAt >= secondary.updatedAt ? primary : secondary;
}

function isScrollContainerNearBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 32;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  windowId,
  pane,
  onActivate,
  onClose,
}) => {
  const { t } = useI18n();
  const updatePane = useWindowStore((state) => state.updatePane);
  const updatePaneRuntime = useWindowStore((state) => state.updatePaneRuntime);
  const paneRef = useRef(pane);
  const hasLiveTaskRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollPinnedRef = useRef(true);
  const autoScrollFrameRef = useRef<number | null>(null);
  const hasAttemptedHistoryHydrationRef = useRef(false);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [settings, setSettings] = useState<ChatSettings>(() => normalizeChatSettings(undefined));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [optimisticTask, setOptimisticTask] = useState<AgentTaskSnapshot | null>(null);
  const [liveAgentTask, setLiveAgentTask] = useState<AgentTaskSnapshot | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ChatConversationHistoryEntry[]>([]);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  useEffect(() => {
    paneRef.current = pane;
  }, [pane]);

  useEffect(() => {
    setLiveAgentTask(null);
    setOptimisticTask(null);
    autoScrollPinnedRef.current = true;
    hasAttemptedHistoryHydrationRef.current = false;
    setHistoryMenuOpen(false);
    setCopiedMessageId(null);
  }, [pane.id]);

  const terminalWindow = useWindowStore(useCallback(
    (state) => state.windows.find((window) => window.id === windowId) ?? null,
    [windowId],
  ));
  const terminalPanes = useMemo(
    () => terminalWindow
      ? getAllPanes(terminalWindow.layout).filter((candidate) => isTerminalPane(candidate))
      : [],
    [terminalWindow],
  );

  const chatState = pane.chat ?? { messages: [] };
  const refreshHistoryEntries = useCallback(() => {
    setHistoryEntries(loadChatConversationHistory(windowId));
  }, [windowId]);
  const persistedAgentState = useMemo(() => {
    if (optimisticTask && (!chatState.agent || chatState.agent.updatedAt < optimisticTask.updatedAt)) {
      return optimisticTask;
    }

    if (!chatState.agent) {
      return optimisticTask ?? undefined;
    }

    return mergeAgentTaskWithOptimisticReasoning(chatState.agent, optimisticTask);
  }, [chatState.agent, optimisticTask]);
  const agentState = useMemo(() => {
    const freshestTask = selectNewestAgentTask(persistedAgentState, liveAgentTask);
    if (!freshestTask) {
      return undefined;
    }

    return mergeAgentTaskWithOptimisticReasoning(freshestTask, optimisticTask);
  }, [liveAgentTask, optimisticTask, persistedAgentState]);
  const resolvedLinkedPaneId = selectPreferredChatLinkedPaneId(terminalPanes, chatState.linkedPaneId);
  const linkedPane = useMemo(
    () => terminalPanes.find((candidate) => candidate.id === resolvedLinkedPaneId) ?? null,
    [resolvedLinkedPaneId, terminalPanes],
  );
  const optimisticSshContext = useMemo(() => {
    if (!linkedPane || getPaneBackend(linkedPane) !== 'ssh' || !linkedPane.ssh) {
      return undefined;
    }

    const host = linkedPane.ssh.host?.trim();
    const user = linkedPane.ssh.user?.trim();
    if (!host || !user) {
      return undefined;
    }

    return {
      host,
      user,
      cwd: linkedPane.cwd || linkedPane.ssh.remoteCwd,
      windowId,
      paneId: linkedPane.id,
    };
  }, [linkedPane, windowId]);
  const hasExecutableLinkedSsh = hasExecutableSshBinding(linkedPane);
  const providers = settings.providers;
  const selectedProviderId = agentState?.providerId ?? chatState.activeProviderId ?? settings.activeProviderId ?? providers[0]?.id ?? '';
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const selectedModel = agentState?.model ?? chatState.activeModel ?? selectedProvider?.defaultModel ?? selectedProvider?.models[0] ?? '';
  const selectedProviderModelValue = selectedProvider && selectedModel
    ? encodeProviderModelSelection(selectedProvider.id, selectedModel)
    : '';
  const isBusy = agentState
    ? ['running', 'waiting_approval', 'waiting_interaction'].includes(agentState.status)
    : Boolean(chatState.isStreaming);
  const canSend = Boolean(selectedProvider && selectedModel && !isBusy);

  const persistChatState = useCallback((
    updater: (currentChat: NonNullable<Pane['chat']>) => NonNullable<Pane['chat']>,
    runtimeOnly = false,
  ) => {
    const currentChat = {
      messages: [],
      ...(paneRef.current.chat ?? {}),
    };
    const nextChat = updater(currentChat);

    paneRef.current = {
      ...paneRef.current,
      chat: nextChat,
    };

    const update = runtimeOnly ? updatePaneRuntime : updatePane;
    update(windowId, pane.id, { chat: nextChat });
  }, [pane.id, updatePane, updatePaneRuntime, windowId]);

  const syncAgentTask = useCallback((task: NonNullable<NonNullable<Pane['chat']>['agent']>) => {
    hasLiveTaskRef.current = true;
    setLiveAgentTask(task);
    const runtimeOnly = task.status === 'running';
    persistChatState((currentChat) => ({
      ...currentChat,
      agent: mergeAgentTaskWithOptimisticReasoning(task, currentChat.agent),
      messages: task.messages,
      activeProviderId: task.providerId,
      activeModel: task.model,
      linkedPaneId: task.linkedPaneId ?? currentChat.linkedPaneId,
      isStreaming: task.status === 'running',
    }), runtimeOnly);
  }, [persistChatState]);

  const syncRunningAgentTask = useCallback((task: NonNullable<NonNullable<Pane['chat']>['agent']>) => {
    hasLiveTaskRef.current = true;
    setLiveAgentTask(task);

    const currentChat = paneRef.current.chat;
    const needsRuntimeSync = currentChat?.activeProviderId !== task.providerId
      || currentChat?.activeModel !== task.model
      || currentChat?.linkedPaneId !== task.linkedPaneId
      || currentChat?.isStreaming !== true;

    if (!needsRuntimeSync) {
      return;
    }

    persistChatState((currentChat) => ({
      ...currentChat,
      activeProviderId: task.providerId,
      activeModel: task.model,
      linkedPaneId: task.linkedPaneId ?? currentChat.linkedPaneId,
      isStreaming: true,
    }), true);
  }, [persistChatState]);

  const resetCurrentAgentTask = useCallback(async (taskId?: string) => {
    if (!taskId) {
      return;
    }

    const response = await window.electronAPI.agentResetTask({
      paneId: pane.id,
      taskId,
    });
    if (!response.success) {
      throw new Error(response.error || 'Failed to reset agent task');
    }
  }, [pane.id]);

  const replaceConversationState = useCallback(({
    conversationId,
    messages,
    agent,
    activeProviderId,
    activeModel,
    linkedPaneId,
  }: {
    conversationId?: string;
    messages: ChatMessage[];
    agent?: AgentTaskSnapshot;
    activeProviderId?: string;
    activeModel?: string;
    linkedPaneId?: string;
  }) => {
    hasLiveTaskRef.current = false;
    setLiveAgentTask(null);
    setOptimisticTask(null);
    setErrorMessage(null);
    autoScrollPinnedRef.current = true;
    persistChatState((currentChat) => ({
      ...currentChat,
      conversationId,
      messages: cloneChatMessages(messages),
      agent,
      activeProviderId: activeProviderId ?? currentChat.activeProviderId,
      activeModel: activeModel ?? currentChat.activeModel,
      linkedPaneId: linkedPaneId ?? currentChat.linkedPaneId,
      isStreaming: false,
    }));
  }, [persistChatState]);

  const handleCopyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await copyTextToClipboard(content);
      setCopiedMessageId(messageId);
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId((currentMessageId) => (
          currentMessageId === messageId ? null : currentMessageId
        ));
        copyResetTimerRef.current = null;
      }, 1200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleRestoreConversation = useCallback(async (entry: ChatConversationHistoryEntry) => {
    if (isBusy) {
      return;
    }

    try {
      await resetCurrentAgentTask(agentState?.taskId);
      setComposerValue('');
      hasAttemptedHistoryHydrationRef.current = true;
      replaceConversationState({
        conversationId: entry.id,
        messages: entry.messages,
        agent: normalizeAgentSnapshotForHistory(entry.agent, pane.id, windowId),
        activeProviderId: entry.activeProviderId,
        activeModel: entry.activeModel,
        linkedPaneId: entry.linkedPaneId,
      });
      setHistoryMenuOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [agentState?.taskId, isBusy, pane.id, replaceConversationState, resetCurrentAgentTask, windowId]);

  const handleRollbackToMessage = useCallback(async (messageId: string, content: string) => {
    if (isBusy) {
      return;
    }

    const rollbackMessageIndex = chatState.messages.findIndex((message) => message.id === messageId);
    if (rollbackMessageIndex < 0) {
      return;
    }

    try {
      await resetCurrentAgentTask(agentState?.taskId);
      setComposerValue(content);
      hasAttemptedHistoryHydrationRef.current = true;
      const nextMessages = chatState.messages.slice(0, rollbackMessageIndex);
      const nextAgent = buildRollbackSnapshot(agentState ?? chatState.agent, messageId, pane.id, windowId);
      replaceConversationState({
        conversationId: nextMessages.length > 0 || nextAgent
          ? (chatState.conversationId ?? createChatConversationHistoryId())
          : undefined,
        messages: nextMessages,
        agent: nextAgent,
        linkedPaneId: resolvedLinkedPaneId,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [
    agentState,
    chatState.agent,
    chatState.conversationId,
    chatState.messages,
    isBusy,
    pane.id,
    replaceConversationState,
    resetCurrentAgentTask,
    resolvedLinkedPaneId,
    windowId,
  ]);

  const loadSettings = useCallback(async () => {
    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        setSettings(normalizeChatSettings(response.data.chat));
      }
    } catch (error) {
      console.error('Failed to load chat settings:', error);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      void loadSettings();
    };

    window.addEventListener(WORKSPACE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      window.removeEventListener(WORKSPACE_SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, [loadSettings]);

  useEffect(() => {
    refreshHistoryEntries();
  }, [refreshHistoryEntries]);

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!historyMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target
        && (historyMenuRef.current?.contains(target) || historyButtonRef.current?.contains(target))
      ) {
        return;
      }

      setHistoryMenuOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [historyMenuOpen]);

  useEffect(() => {
    if (hasAttemptedHistoryHydrationRef.current) {
      return;
    }

    if (hasConversationContent(chatState.messages, chatState.agent ?? agentState)) {
      hasAttemptedHistoryHydrationRef.current = true;
      return;
    }

    hasAttemptedHistoryHydrationRef.current = true;
    const latestEntry = getLatestChatConversationHistory(windowId);
    if (!latestEntry) {
      return;
    }

    replaceConversationState({
      conversationId: latestEntry.id,
      messages: latestEntry.messages,
      agent: normalizeAgentSnapshotForHistory(latestEntry.agent, pane.id, windowId),
      activeProviderId: latestEntry.activeProviderId,
      activeModel: latestEntry.activeModel,
      linkedPaneId: latestEntry.linkedPaneId,
    });
  }, [
    agentState,
    chatState.agent,
    chatState.messages,
    pane.id,
    replaceConversationState,
    windowId,
  ]);

  useEffect(() => {
    const conversationId = chatState.conversationId;
    const stableAgent = normalizeAgentSnapshotForHistory(chatState.agent ?? agentState, pane.id, windowId);
    if (!hasConversationContent(chatState.messages, stableAgent)) {
      refreshHistoryEntries();
      return;
    }

    if (!conversationId) {
      persistChatState((currentChat) => ({
        ...currentChat,
        conversationId: createChatConversationHistoryId(),
      }));
      return;
    }

    const referenceMessages = chatState.messages.length > 0
      ? chatState.messages
      : stableAgent?.messages ?? [];

    setHistoryEntries(upsertChatConversationHistory({
      id: conversationId,
      windowId,
      title: buildChatConversationTitle(referenceMessages),
      createdAt: stableAgent?.createdAt ?? referenceMessages[0]?.timestamp ?? new Date().toISOString(),
      updatedAt: stableAgent?.updatedAt ?? referenceMessages.at(-1)?.timestamp ?? new Date().toISOString(),
      linkedPaneId: chatState.linkedPaneId,
      activeProviderId: chatState.activeProviderId ?? stableAgent?.providerId,
      activeModel: chatState.activeModel ?? stableAgent?.model,
      messages: cloneChatMessages(referenceMessages),
      agent: stableAgent,
    }));
  }, [
    agentState,
    chatState.activeModel,
    chatState.activeProviderId,
    chatState.agent,
    chatState.conversationId,
    chatState.linkedPaneId,
    chatState.messages,
    pane.id,
    persistChatState,
    refreshHistoryEntries,
    windowId,
  ]);

  const handleTranscriptScroll = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    autoScrollPinnedRef.current = isScrollContainerNearBottom(element);
  }, []);

  useEffect(() => {
    if (!autoScrollPinnedRef.current) {
      return;
    }

    if (typeof window.requestAnimationFrame !== 'function') {
      const element = scrollContainerRef.current;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
      return;
    }

    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
    }

    autoScrollFrameRef.current = window.requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      const element = scrollContainerRef.current;
      if (!element || !autoScrollPinnedRef.current) {
        return;
      }

      element.scrollTop = element.scrollHeight;
    });

    return () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [agentState?.updatedAt, agentState?.status, chatState.messages.length]);

  useEffect(() => {
    const handleTaskState = (_event: unknown, payload: { paneId: string; task: NonNullable<NonNullable<Pane['chat']>['agent']> }) => {
      if (payload.paneId !== pane.id || !payload.task) {
        return;
      }

      setErrorMessage(payload.task.error ?? null);
      if (payload.task.status === 'running') {
        syncRunningAgentTask(payload.task);
      } else {
        syncAgentTask(payload.task);
      }
      setOptimisticTask((currentTask) => {
        if (!currentTask) {
          return null;
        }

        const keepOptimisticTask = payload.task.status === 'running'
          && !hasVisibleAgentProgress(payload.task.timeline);
        if (!keepOptimisticTask) {
          return null;
        }

        return {
          ...currentTask,
          taskId: payload.task.taskId,
          updatedAt: payload.task.updatedAt,
          providerId: payload.task.providerId,
          model: payload.task.model,
          linkedPaneId: payload.task.linkedPaneId,
          sshContext: payload.task.sshContext,
        };
      });
    };

    const handleTaskError = (_event: unknown, payload: { paneId: string; error: string }) => {
      if (payload.paneId !== pane.id) {
        return;
      }
      setErrorMessage(payload.error);
    };

    window.electronAPI.onAgentTaskState(handleTaskState);
    window.electronAPI.onAgentTaskError(handleTaskError);

    void window.electronAPI.agentGetTask({ paneId: pane.id }).then((response) => {
      if (response.success && response.data) {
        if (response.data.status === 'running') {
          syncRunningAgentTask(response.data);
        } else {
          syncAgentTask(response.data);
        }
      } else if (paneRef.current.chat?.agent && !isOptimisticAgentTask(paneRef.current.chat.agent)) {
        return window.electronAPI.agentRestoreTask({
          task: paneRef.current.chat.agent,
        }).then((restoreResponse) => {
          if (restoreResponse.success && restoreResponse.data) {
            syncAgentTask(restoreResponse.data);
          } else {
            hasLiveTaskRef.current = false;
          }
        });
      } else {
        hasLiveTaskRef.current = false;
      }
    }).catch((error) => {
      console.error('Failed to hydrate agent task:', error);
      hasLiveTaskRef.current = false;
    });

    return () => {
      window.electronAPI.offAgentTaskState(handleTaskState);
      window.electronAPI.offAgentTaskError(handleTaskError);
    };
  }, [pane.id, syncAgentTask, syncRunningAgentTask]);

  const handleProviderModelChange = useCallback((value: string) => {
    if (!value) {
      persistChatState((currentChat) => ({
        ...currentChat,
        activeProviderId: undefined,
        activeModel: '',
      }));
      return;
    }

    const nextSelection = decodeProviderModelSelection(value);
    if (!nextSelection) {
      return;
    }

    persistChatState((currentChat) => ({
      ...currentChat,
      activeProviderId: nextSelection.providerId,
      activeModel: nextSelection.model,
    }));
  }, [persistChatState]);

  const handleNewConversation = useCallback(() => {
    if (isBusy) {
      return;
    }

    void (async () => {
      try {
        const response = await window.electronAPI.agentResetTask({
          paneId: pane.id,
          taskId: agentState?.taskId,
        });
        if (!response.success) {
          throw new Error(response.error || 'Failed to reset agent task');
        }

        setComposerValue('');
        setErrorMessage(null);
        hasLiveTaskRef.current = false;
        setLiveAgentTask(null);
        setOptimisticTask(null);
        hasAttemptedHistoryHydrationRef.current = true;
        persistChatState((currentChat) => ({
          ...currentChat,
          conversationId: undefined,
          messages: [],
          agent: undefined,
          isStreaming: false,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(message);
      }
    })();
  }, [agentState?.taskId, isBusy, pane.id, persistChatState]);

  const handleCancelStreaming = useCallback(async () => {
    try {
      if (agentState) {
        await window.electronAPI.agentCancel({
          paneId: pane.id,
          taskId: agentState.taskId,
        });
      } else {
        await window.electronAPI.chatCancel({ paneId: pane.id });
      }
    } catch (error) {
      console.error('Failed to cancel agent task:', error);
    }
  }, [agentState, pane.id]);

  const resolveSshContext = useCallback(async (): Promise<ChatSshContext | undefined> => {
    if (!linkedPane || getPaneBackend(linkedPane) !== 'ssh' || !linkedPane.ssh) {
      return undefined;
    }

    const cwd = linkedPane.cwd || linkedPane.ssh.remoteCwd;
    const host = linkedPane.ssh.host?.trim();
    const user = linkedPane.ssh.user?.trim();
    if (host && user) {
      return {
        host,
        user,
        cwd,
        windowId,
        paneId: linkedPane.id,
      };
    }

    const profileId = linkedPane.ssh.profileId?.trim();
    if (!profileId) {
      return undefined;
    }

    const profileResponse = await window.electronAPI.getSSHProfile(profileId);
    if (!profileResponse.success || !profileResponse.data) {
      throw new Error(profileResponse.error || 'Linked SSH profile could not be loaded.');
    }

    return {
      host: profileResponse.data.host,
      user: profileResponse.data.user,
      cwd,
      windowId,
      paneId: linkedPane.id,
    };
  }, [linkedPane, windowId]);

  const handleSend = useCallback(async () => {
    const trimmed = composerValue.trim();
    if (!trimmed || !selectedProvider || !selectedModel || isBusy) {
      return;
    }

    const previousHasLiveTask = hasLiveTaskRef.current;
    const conversationId = chatState.conversationId ?? createChatConversationHistoryId();
    const previousChat = {
      ...chatState,
      messages: cloneChatMessages(chatState.messages),
      agent: agentState,
    };
    const seedMessages = hasLiveTaskRef.current ? undefined : chatState.messages;
    const optimisticTask = buildOptimisticAgentTask({
      windowId,
      paneId: pane.id,
      providerId: selectedProvider.id,
      model: selectedModel,
      text: trimmed,
      linkedPaneId: resolvedLinkedPaneId,
      sshContext: optimisticSshContext,
      previousMessages: chatState.messages,
      previousTask: agentState,
    });

    setComposerValue('');
    setErrorMessage(null);
    autoScrollPinnedRef.current = true;
    hasAttemptedHistoryHydrationRef.current = true;
    setLiveAgentTask(optimisticTask);
    setOptimisticTask(optimisticTask);
    persistChatState((currentChat) => ({
      ...currentChat,
      conversationId,
      messages: optimisticTask.messages,
      agent: optimisticTask,
      activeProviderId: selectedProvider.id,
      activeModel: selectedModel,
      linkedPaneId: resolvedLinkedPaneId,
      isStreaming: true,
    }), true);

    let sshContext: ChatSshContext | undefined;
    try {
      sshContext = await resolveSshContext();

      const response = await window.electronAPI.agentSend({
        paneId: pane.id,
        windowId,
        text: trimmed,
        providerId: selectedProvider.id,
        model: selectedModel,
        systemPrompt: settings.defaultSystemPrompt,
        enableTools: Boolean(sshContext),
        linkedPaneId: resolvedLinkedPaneId,
        sshContext,
        seedMessages,
      });

      if (!response.success) {
        throw new Error(response.error || t('chatPane.sendFailed'));
      }

      hasLiveTaskRef.current = true;
      const responseData = response.data;
      if (responseData?.taskId) {
        setOptimisticTask((currentTask) => (currentTask
          ? {
              ...currentTask,
              taskId: responseData.taskId,
              status: responseData.status ?? currentTask.status,
              updatedAt: new Date().toISOString(),
            }
          : currentTask));
        persistChatState((currentChat) => {
          if (!currentChat.agent) {
            return currentChat;
          }

          return {
            ...currentChat,
            agent: {
              ...currentChat.agent,
              taskId: responseData.taskId,
              status: responseData.status ?? currentChat.agent.status,
            },
          };
        }, true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      hasLiveTaskRef.current = previousHasLiveTask;
      setLiveAgentTask(null);
      setOptimisticTask(null);
      persistChatState(() => ({
        ...previousChat,
        isStreaming: false,
      }), true);
    }
  }, [
    agentState,
    chatState.conversationId,
    chatState.messages,
    composerValue,
    isBusy,
    linkedPane,
    pane.id,
    persistChatState,
    resolvedLinkedPaneId,
    resolveSshContext,
    selectedModel,
    selectedProvider,
    settings.defaultSystemPrompt,
    optimisticSshContext,
    t,
    windowId,
  ]);

  const handleComposerKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleApprovalResponse = useCallback((approvalId: string, approved: boolean) => {
    if (!agentState) {
      return;
    }

    void window.electronAPI.agentRespondApproval({
      paneId: pane.id,
      taskId: agentState.taskId,
      approvalId,
      approved,
    });
  }, [agentState, pane.id]);

  const handleSubmitInteraction = useCallback((interactionId: string, value: string) => {
    if (!agentState) {
      return;
    }

    void window.electronAPI.agentSubmitInteraction({
      paneId: pane.id,
      taskId: agentState.taskId,
      interactionId,
      input: value,
    });
  }, [agentState, pane.id]);

  const handleCancelInteraction = useCallback((interactionId: string) => {
    if (!agentState) {
      return;
    }

    void window.electronAPI.agentSubmitInteraction({
      paneId: pane.id,
      taskId: agentState.taskId,
      interactionId,
      cancel: true,
    });
  }, [agentState, pane.id]);

  const providerModelOptions = useMemo(() => (
    buildProviderModelOptions(providers, selectedProvider?.id, selectedModel)
  ), [providers, selectedModel, selectedProvider?.id]);
  const legacyUserRoundById = useMemo(() => {
    const rounds = new Map<string, number>();
    let round = 0;
    for (const message of chatState.messages) {
      if (message.role !== 'user' || message.toolResult) {
        continue;
      }

      round += 1;
      rounds.set(message.id, round);
    }

    return rounds;
  }, [chatState.messages]);

  const assistantLabel = t('chatPane.agentName');
  const copyMessageLabel = t('chatPane.copyMessage');
  const copiedMessageLabel = t('chatPane.copied');
  const sshConnected = hasExecutableLinkedSsh;
  const sshSignalTitle = sshConnected ? t('chatPane.sshConnected') : t('chatPane.sshDisconnected');
  const emptyConversationTarget = resolveEmptyConversationTarget(terminalWindow?.name, linkedPane)
    ?? t('chatPane.emptyWritingFallback');

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[rgb(var(--background))]"
      onMouseDown={onActivate}
    >
      <div className="border-b border-[rgb(var(--border))] px-3 py-2">
        <div className="mx-auto flex w-full max-w-[860px] items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <div
              role="status"
              aria-label={sshSignalTitle}
              title={sshSignalTitle}
              className="inline-flex h-6 items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-2"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${sshConnected ? 'bg-[rgb(var(--success))] shadow-[0_0_8px_rgba(22,198,12,0.45)]' : 'bg-[rgb(var(--destructive))] shadow-[0_0_8px_rgba(231,72,86,0.38)]'}`}
                aria-hidden="true"
              />
            </div>
            <span className="truncate text-[13px] font-semibold tracking-[0.02em] text-[rgb(var(--foreground))]">
              {t('chatPane.title')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative">
              <button
                ref={historyButtonRef}
                type="button"
                tabIndex={-1}
                aria-label={t('chatPane.history')}
                onMouseDown={preventMouseButtonFocus}
                onClick={() => setHistoryMenuOpen((open) => !open)}
                className="inline-flex shrink-0 items-center justify-center text-[rgb(var(--muted-foreground))] leading-none transition-colors duration-200 hover:text-[rgb(var(--foreground))]"
              >
                <History size={18} strokeWidth={1.9} />
              </button>

              {historyMenuOpen ? (
                <div
                  ref={historyMenuRef}
                  className="absolute right-0 top-[calc(100%+10px)] z-30 w-[320px] overflow-hidden rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--card))]/98 p-2 shadow-[0_30px_60px_-36px_rgba(0,0,0,0.95)]"
                >
                  <div className="px-2 pb-2 pt-1 text-[11px] font-medium tracking-[0.08em] text-[rgb(var(--muted-foreground))]">
                    {t('chatPane.history')}
                  </div>
                  {historyEntries.length > 0 ? (
                    <div className="max-h-[360px] space-y-1 overflow-y-auto">
                      {historyEntries.map((entry) => {
                        const isCurrentConversation = entry.id === chatState.conversationId;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              void handleRestoreConversation(entry);
                            }}
                            className={`flex w-full flex-col rounded-[16px] px-3 py-2.5 text-left transition-colors ${isCurrentConversation ? 'bg-[rgb(var(--secondary))] text-[rgb(var(--foreground))]' : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--secondary))]/80'}`}
                          >
                            <span className="truncate text-[13px] font-medium leading-5">
                              {entry.title}
                            </span>
                            <span className="mt-1 text-[11px] leading-5 text-[rgb(var(--muted-foreground))]">
                              {formatHistoryTimestamp(entry.updatedAt)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[16px] px-3 py-3 text-sm leading-6 text-[rgb(var(--muted-foreground))]">
                      {t('chatPane.historyEmpty')}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label={t('chatPane.newConversation')}
              onMouseDown={preventMouseButtonFocus}
              onClick={handleNewConversation}
              disabled={isBusy}
              className="inline-flex shrink-0 items-center justify-center text-[rgb(var(--muted-foreground))] leading-none transition-colors duration-200 hover:text-[rgb(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ChatNewConversationIcon size={20} />
            </button>

            {onClose && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={t('common.close')}
                onMouseDown={preventMouseButtonFocus}
                onClick={onClose}
                className="inline-flex shrink-0 items-center justify-center text-[rgb(var(--muted-foreground))] leading-none transition-colors duration-200 hover:text-[rgb(var(--foreground))]"
              >
                <X size={18} strokeWidth={1.9} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 pb-4 pt-1"
        onScroll={handleTranscriptScroll}
      >
        <div className="mx-auto flex min-h-full w-full max-w-[860px] flex-col">
          {!settingsLoaded ? (
            <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))]/80 px-5 py-4 text-sm text-[rgb(var(--muted-foreground))]">
              {t('common.loading')}
            </div>
          ) : providers.length === 0 ? (
            <div className="flex gap-3 pt-6">
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-[rgb(var(--border))] bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                <Sparkles size={15} />
              </div>
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-3 py-1 text-xs font-medium text-[rgb(var(--muted-foreground))]">
                  {assistantLabel}
                </div>
                <div className="mt-4 text-[15px] leading-7 text-[rgb(var(--foreground))]">{t('chatPane.noProviderTitle')}</div>
                <p className="mt-2 text-sm leading-7 text-[rgb(var(--muted-foreground))]">{t('chatPane.noProviderDescription')}</p>
              </div>
            </div>
          ) : agentState ? (
            <>
              <AgentTimeline
                task={agentState}
                assistantLabel={assistantLabel}
                copiedMessageId={copiedMessageId}
                copyMessageLabel={copyMessageLabel}
                copiedMessageLabel={copiedMessageLabel}
                onApprove={(approvalId) => handleApprovalResponse(approvalId, true)}
                onReject={(approvalId) => handleApprovalResponse(approvalId, false)}
                onSubmitInteraction={handleSubmitInteraction}
                onCancelInteraction={handleCancelInteraction}
                onCopyMessage={handleCopyMessage}
                onRollbackMessage={handleRollbackToMessage}
                rollbackLabelFormatter={(round) => t('chatPane.rollbackToRound', { round })}
              />
            </>
          ) : chatState.messages.length > 0 ? (
            <div className="space-y-6 pt-4">
              {chatState.messages.map((message, index) => (
                <div key={message.id}>
                  {renderLegacyMessage(message, {
                    copied: copiedMessageId === message.id,
                    copyLabel: copiedMessageId === message.id ? copiedMessageLabel : copyMessageLabel,
                    rollbackLabel: message.role === 'user'
                      ? t('chatPane.rollbackToRound', { round: legacyUserRoundById.get(message.id) ?? index + 1 })
                      : undefined,
                    onCopy: () => {
                      void handleCopyMessage(message.id, message.content);
                    },
                    onRollback: message.role === 'user'
                      ? () => {
                          void handleRollbackToMessage(message.id, message.content);
                        }
                      : undefined,
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-10">
              <div className="flex max-w-[520px] flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/85 text-[rgb(var(--foreground))] shadow-[0_18px_45px_-28px_rgba(0,0,0,0.9)]">
                  <Sparkles size={18} />
                </div>
                <div className="mt-6 text-[28px] font-semibold tracking-[-0.03em] text-[rgb(var(--foreground))] sm:text-[32px]">
                  {t('chatPane.emptyWritingWithAi', { target: emptyConversationTarget })}
                </div>
                <p className="mt-3 max-w-[420px] text-sm leading-7 text-[rgb(var(--muted-foreground))]">
                  {sshConnected ? t('chatPane.emptyDescriptionLinked') : t('chatPane.emptyDescription')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="mx-auto w-full max-w-[860px]">
          {errorMessage && (
            <div className="mb-3 rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          )}

          <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))]/95 p-2.5 shadow-[0_24px_50px_-38px_rgba(0,0,0,0.98)]">
            <textarea
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={providers.length === 0 ? t('chatPane.disabledPlaceholder') : t('chatPane.inputPlaceholder')}
              disabled={!providers.length || isBusy}
              rows={3}
              className="max-h-[168px] min-h-[72px] w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-6 text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--muted-foreground))] disabled:cursor-not-allowed disabled:opacity-60"
            />

            <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                <ControlSelect
                  ariaLabel={t('chatPane.providerModelLabel')}
                  value={selectedProviderModelValue}
                  onChange={handleProviderModelChange}
                  disabled={!providers.length}
                  minWidthClass="w-full sm:w-fit sm:max-w-[220px]"
                >
                  <option value="">{t('chatPane.providerModelPlaceholder')}</option>
                  {providerModelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </ControlSelect>

                {isBusy ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleCancelStreaming();
                    }}
                    className="inline-flex h-9 items-center gap-2 rounded-[16px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))]"
                  >
                    <Square size={12} />
                    {t('chatPane.cancel')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSend();
                    }}
                    disabled={!canSend || !composerValue.trim()}
                    className="inline-flex h-9 items-center gap-2 rounded-[16px] bg-[rgb(var(--primary))] px-4 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <SendHorizonal size={14} />
                    {t('chatPane.send')}
                  </button>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
