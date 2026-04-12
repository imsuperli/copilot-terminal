import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronDown, SendHorizonal, Sparkles, Square, TerminalSquare, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  ChatSettings,
  ChatStreamChunkPayload,
  ChatStreamDonePayload,
  ChatStreamErrorPayload,
  ChatToolApprovalRequestPayload,
  ChatToolResultPayload,
  ToolCall,
} from '../../shared/types/chat';
import type { Pane } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { preventMouseButtonFocus } from '../utils/buttonFocus';
import { getPaneBackend, isTerminalPane } from '../../shared/utils/terminalCapabilities';
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from '../utils/settingsEvents';

export interface ChatPaneProps {
  windowId: string;
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
}

interface InlineCodeFragment {
  type: 'text' | 'code';
  value: string;
}

interface StreamingMessageState {
  messageId: string;
  content: string;
  model?: string;
}

function splitInlineCode(content: string): InlineCodeFragment[] {
  if (!content.includes('`')) {
    return [{ type: 'text', value: content }];
  }

  const parts = content.split(/(`[^`]+`)/g).filter(Boolean);
  return parts.map((part) => (
    part.startsWith('`') && part.endsWith('`')
      ? { type: 'code', value: part.slice(1, -1) }
      : { type: 'text', value: part }
  ));
}

function renderTextBlock(content: string, keyPrefix: string): React.ReactNode {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return null;
  }

  return paragraphs.map((paragraph, paragraphIndex) => (
    <p
      key={`${keyPrefix}-paragraph-${paragraphIndex}`}
      className="whitespace-pre-wrap break-words leading-7 text-inherit"
    >
      {splitInlineCode(paragraph).map((fragment, fragmentIndex) => (
        fragment.type === 'code' ? (
          <code
            key={`${keyPrefix}-fragment-${fragmentIndex}`}
            className="rounded bg-zinc-900/90 px-1.5 py-0.5 font-mono text-[12px] text-[rgb(var(--primary))]"
          >
            {fragment.value}
          </code>
        ) : (
          <React.Fragment key={`${keyPrefix}-fragment-${fragmentIndex}`}>
            {fragment.value}
          </React.Fragment>
        )
      ))}
    </p>
  ));
}

function renderMarkdownLike(content: string): React.ReactNode {
  if (!content.trim()) {
    return null;
  }

  const sections: React.ReactNode[] = [];
  const codeFencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeFencePattern.exec(content)) !== null) {
    const [fullMatch, language, code] = match;
    const precedingText = content.slice(lastIndex, match.index);
    if (precedingText.trim()) {
      sections.push(
        <div key={`text-${lastIndex}`} className="space-y-3">
          {renderTextBlock(precedingText, `text-${lastIndex}`)}
        </div>,
      );
    }

    sections.push(
      <div
        key={`code-${match.index}`}
        className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          <span>{language || 'text'}</span>
        </div>
        <pre className="overflow-x-auto px-3 py-3 text-[12px] leading-6 text-zinc-100">
          <code>{code.replace(/\n$/, '')}</code>
        </pre>
      </div>,
    );

    lastIndex = match.index + fullMatch.length;
  }

  const trailingText = content.slice(lastIndex);
  if (trailingText.trim()) {
    sections.push(
      <div key={`text-${lastIndex}`} className="space-y-3">
        {renderTextBlock(trailingText, `text-${lastIndex}`)}
      </div>,
    );
  }

  return sections;
}

function getToolStatusTone(status: ToolCall['status']) {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    case 'approved':
    case 'executing':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
    case 'rejected':
    case 'blocked':
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-200';
    default:
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }
}

function inferToolStatus(result: string, isError?: boolean): ToolCall['status'] {
  if (!isError) {
    return 'completed';
  }

  if (result.includes('用户拒绝')) {
    return 'rejected';
  }

  if (result.includes('安全策略阻止')) {
    return 'blocked';
  }

  return 'error';
}

function getLinkedPaneLabel(pane: Pane): string {
  if (pane.ssh?.host) {
    return pane.ssh.user ? `${pane.ssh.user}@${pane.ssh.host}` : pane.ssh.host;
  }

  return pane.cwd || pane.id;
}

function normalizeChatSettings(settings: ChatSettings | undefined): ChatSettings {
  return {
    providers: settings?.providers ?? [],
    activeProviderId: settings?.activeProviderId,
    defaultSystemPrompt: settings?.defaultSystemPrompt,
    enableCommandSecurity: settings?.enableCommandSecurity ?? true,
  };
}

function ToolCallCard({
  toolCall,
  t,
  needsApproval,
  onApprove,
  onReject,
}: {
  toolCall: ToolCall;
  t: (key: any, params?: Record<string, string | number>) => string;
  needsApproval: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const statusKey = `chatPane.toolStatus.${toolCall.status}` as const;

  return (
    <div className="rounded-[20px] border border-zinc-800/80 bg-zinc-900/70 p-4 shadow-[0_20px_40px_-34px_rgba(0,0,0,0.9)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-100">{t(`chatPane.toolName.${toolCall.name}` as any)}</div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getToolStatusTone(toolCall.status)}`}>
          {t(statusKey as any)}
        </span>
      </div>

      {'command' in toolCall.params && typeof toolCall.params.command === 'string' && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{t('chatPane.commandLabel')}</div>
          <pre className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-[#0d0d10] px-3 py-2.5 font-mono text-[12px] leading-6 text-zinc-100">
            {toolCall.params.command}
          </pre>
        </div>
      )}

      {toolCall.reason && (
        <p className="mt-3 text-xs leading-5 text-zinc-400">{toolCall.reason}</p>
      )}

      {needsApproval && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="rounded-full bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90"
          >
            {t('chatPane.approve')}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            {t('chatPane.reject')}
          </button>
        </div>
      )}

      {toolCall.result && (
        <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{t('chatPane.toolResultLabel')}</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-100">
            {toolCall.result}
          </pre>
        </div>
      )}
    </div>
  );
}

function ControlPill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-800/90 bg-zinc-900/75 px-3 py-2 text-xs text-zinc-300 shadow-[0_16px_30px_-28px_rgba(0,0,0,0.95)]">
      <span className="text-zinc-500">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
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
  icon: React.ReactNode;
  minWidthClass?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`relative inline-flex max-w-full items-center ${minWidthClass}`}>
      <span className="sr-only">{ariaLabel}</span>
      <span className="pointer-events-none absolute left-3 text-zinc-500">
        {icon}
      </span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-10 w-full appearance-none rounded-full border border-zinc-800/90 bg-zinc-900/75 pl-9 pr-9 text-sm text-zinc-100 outline-none transition-colors focus:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 text-zinc-500" />
    </label>
  );
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const currentRequestRef = useRef<{ messageId: string; model?: string } | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [settings, setSettings] = useState<ChatSettings>(() => normalizeChatSettings(undefined));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessageState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingApprovalIds, setPendingApprovalIds] = useState<string[]>([]);

  useEffect(() => {
    paneRef.current = pane;
  }, [pane]);

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
  const resolvedLinkedPaneId = chatState.linkedPaneId ?? terminalPanes[0]?.id;
  const linkedPane = useMemo(
    () => terminalPanes.find((candidate) => candidate.id === resolvedLinkedPaneId) ?? null,
    [resolvedLinkedPaneId, terminalPanes],
  );
  const providers = settings.providers;
  const selectedProviderId = chatState.activeProviderId ?? settings.activeProviderId ?? providers[0]?.id ?? '';
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const selectedModel = chatState.activeModel ?? selectedProvider?.defaultModel ?? selectedProvider?.models[0] ?? '';
  const isBusy = Boolean(chatState.isStreaming || streamingMessage);
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

  const updateToolCall = useCallback((
    toolCallId: string,
    updater: (toolCall: ToolCall) => ToolCall,
    toolResultMessage?: ChatMessage,
  ) => {
    persistChatState((currentChat) => {
      let found = false;
      const nextMessages = currentChat.messages.map((message) => {
        if (!message.toolCalls?.length) {
          return message;
        }

        let didChange = false;
        const nextToolCalls = message.toolCalls.map((toolCall) => {
          if (toolCall.id !== toolCallId) {
            return toolCall;
          }

          found = true;
          didChange = true;
          return updater(toolCall);
        });

        return didChange
          ? { ...message, toolCalls: nextToolCalls }
          : message;
      });

      if (toolResultMessage && found && !nextMessages.some((message) => message.id === toolResultMessage.id)) {
        nextMessages.push(toolResultMessage);
      }

      return {
        ...currentChat,
        messages: nextMessages,
      };
    });
  }, [persistChatState]);

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
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chatState.messages, streamingMessage]);

  useEffect(() => {
    const handleStreamChunk = (_event: unknown, payload: ChatStreamChunkPayload) => {
      if (payload.paneId !== pane.id) {
        return;
      }

      setStreamingMessage((current) => {
        if (!current || current.messageId !== payload.messageId) {
          return {
            messageId: payload.messageId,
            content: payload.chunk,
            model: currentRequestRef.current?.model,
          };
        }

        return {
          ...current,
          content: current.content + payload.chunk,
        };
      });
    };

    const handleStreamDone = (_event: unknown, payload: ChatStreamDonePayload) => {
      if (payload.paneId !== pane.id) {
        return;
      }

      const isFinal = payload.isFinal !== false;
      const requestMeta = currentRequestRef.current;
      if (isFinal) {
        currentRequestRef.current = null;
      }
      setStreamingMessage(null);
      setErrorMessage(null);

      persistChatState((currentChat) => ({
        ...currentChat,
        isStreaming: !isFinal,
        messages: [
          ...currentChat.messages,
          {
            id: payload.messageId,
            role: 'assistant',
            content: payload.fullContent,
            timestamp: new Date().toISOString(),
            model: requestMeta?.model,
            toolCalls: payload.toolCalls?.map((toolCall) => ({
              ...toolCall,
              status: 'pending',
            })),
          },
        ],
      }));
    };

    const handleStreamError = (_event: unknown, payload: ChatStreamErrorPayload) => {
      if (payload.paneId !== pane.id) {
        return;
      }

      const requestMeta = currentRequestRef.current;
      currentRequestRef.current = null;
      setStreamingMessage(null);
      setErrorMessage(payload.error);

      persistChatState((currentChat) => ({
        ...currentChat,
        isStreaming: false,
        messages: [
          ...currentChat.messages,
          {
            id: uuidv4(),
            role: 'assistant',
            content: `${t('chatPane.errorPrefix')} ${payload.error}`,
            timestamp: new Date().toISOString(),
            model: requestMeta?.model,
          },
        ],
      }));
    };

    const handleToolApprovalRequest = (_event: unknown, payload: ChatToolApprovalRequestPayload) => {
      if (payload.paneId !== pane.id) {
        return;
      }

      setPendingApprovalIds((current) => (
        current.includes(payload.toolCall.id)
          ? current
          : [...current, payload.toolCall.id]
      ));

      updateToolCall(payload.toolCall.id, (toolCall) => ({
        ...toolCall,
        ...payload.toolCall,
        status: 'pending',
        reason: payload.toolCall.reason ?? t('chatPane.toolNeedsApproval'),
      }));
    };

    const handleToolResult = (_event: unknown, payload: ChatToolResultPayload) => {
      if (payload.paneId !== pane.id) {
        return;
      }

      setPendingApprovalIds((current) => current.filter((toolCallId) => toolCallId !== payload.toolCallId));

      updateToolCall(
        payload.toolCallId,
        (toolCall) => ({
          ...toolCall,
          status: inferToolStatus(payload.content, payload.isError),
          result: payload.content,
        }),
        {
          id: `tool-result-${payload.toolCallId}`,
          role: 'user',
          content: '',
          timestamp: new Date().toISOString(),
          toolResult: {
            toolCallId: payload.toolCallId,
            content: payload.content,
            isError: payload.isError,
          },
        },
      );
    };

    window.electronAPI.onChatStreamChunk(handleStreamChunk);
    window.electronAPI.onChatStreamDone(handleStreamDone);
    window.electronAPI.onChatStreamError(handleStreamError);
    window.electronAPI.onChatToolApprovalRequest(handleToolApprovalRequest);
    window.electronAPI.onChatToolResult(handleToolResult);

    return () => {
      window.electronAPI.offChatStreamChunk(handleStreamChunk);
      window.electronAPI.offChatStreamDone(handleStreamDone);
      window.electronAPI.offChatStreamError(handleStreamError);
      window.electronAPI.offChatToolApprovalRequest(handleToolApprovalRequest);
      window.electronAPI.offChatToolResult(handleToolResult);
    };
  }, [pane.id, persistChatState, t, updateToolCall]);

  const handleProviderChange = useCallback((providerId: string) => {
    const provider = providers.find((candidate) => candidate.id === providerId);
    persistChatState((currentChat) => ({
      ...currentChat,
      activeProviderId: providerId,
      activeModel: provider?.defaultModel ?? provider?.models[0] ?? '',
    }));
  }, [persistChatState, providers]);

  const handleModelChange = useCallback((model: string) => {
    persistChatState((currentChat) => ({
      ...currentChat,
      activeModel: model,
    }));
  }, [persistChatState]);

  const handleLinkedPaneChange = useCallback((linkedPaneId: string) => {
    persistChatState((currentChat) => ({
      ...currentChat,
      linkedPaneId: linkedPaneId || undefined,
    }));
  }, [persistChatState]);

  const handleCancelStreaming = useCallback(async () => {
    try {
      await window.electronAPI.chatCancel({ paneId: pane.id });
    } catch (error) {
      console.error('Failed to cancel chat stream:', error);
    } finally {
      currentRequestRef.current = null;
      setStreamingMessage(null);
      persistChatState((currentChat) => ({
        ...currentChat,
        isStreaming: false,
      }), true);
    }
  }, [pane.id, persistChatState]);

  const handleSend = useCallback(async () => {
    const trimmed = composerValue.trim();
    if (!trimmed || !selectedProvider || !selectedModel || isBusy) {
      return;
    }

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...chatState.messages, userMessage];
    const sshContext = linkedPane && getPaneBackend(linkedPane) === 'ssh' && linkedPane.ssh?.host && linkedPane.ssh?.user
      ? {
          host: linkedPane.ssh.host,
          user: linkedPane.ssh.user,
          cwd: linkedPane.cwd || linkedPane.ssh.remoteCwd,
          windowId,
          paneId: linkedPane.id,
        }
      : undefined;

    setComposerValue('');
    setErrorMessage(null);

    persistChatState((currentChat) => ({
      ...currentChat,
      messages: nextMessages,
      activeProviderId: selectedProvider.id,
      activeModel: selectedModel,
      isStreaming: true,
    }));

    try {
      const response = await window.electronAPI.chatSend({
        paneId: pane.id,
        windowId,
        messages: nextMessages,
        providerId: selectedProvider.id,
        model: selectedModel,
        systemPrompt: settings.defaultSystemPrompt,
        enableTools: Boolean(sshContext),
        sshContext,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || t('chatPane.sendFailed'));
      }

      currentRequestRef.current = {
        messageId: response.data.messageId,
        model: selectedModel,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      currentRequestRef.current = null;
      setErrorMessage(message);

      persistChatState((currentChat) => ({
        ...currentChat,
        isStreaming: false,
        messages: [
          ...currentChat.messages,
          {
            id: uuidv4(),
            role: 'assistant',
            content: `${t('chatPane.errorPrefix')} ${message}`,
            timestamp: new Date().toISOString(),
            model: selectedModel,
          },
        ],
      }));
    }
  }, [
    chatState.messages,
    composerValue,
    linkedPane,
    pane.id,
    persistChatState,
    selectedModel,
    selectedProvider,
    settings.defaultSystemPrompt,
    isBusy,
    t,
    windowId,
  ]);

  const handleComposerKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleToolApprovalResponse = useCallback((toolCallId: string, approved: boolean) => {
    setPendingApprovalIds((current) => current.filter((candidate) => candidate !== toolCallId));
    window.electronAPI.chatRespondToolApproval({
      paneId: pane.id,
      toolCallId,
      approved,
    });

    updateToolCall(toolCallId, (toolCall) => ({
      ...toolCall,
      status: approved ? 'approved' : 'rejected',
      reason: approved ? undefined : t('chatPane.rejectedByUser'),
    }));
  }, [pane.id, t, updateToolCall]);

  const renderedMessages = [...chatState.messages];
  if (streamingMessage) {
    renderedMessages.push({
      id: streamingMessage.messageId,
      role: 'assistant',
      content: streamingMessage.content,
      timestamp: new Date().toISOString(),
      model: streamingMessage.model,
    });
  }

  const modelOptions = useMemo(() => {
    if (!selectedProvider) {
      return [] as string[];
    }

    const models = selectedProvider.models ?? [];
    if (selectedModel && !models.includes(selectedModel)) {
      return [selectedModel, ...models];
    }

    return models;
  }, [selectedModel, selectedProvider]);

  const assistantLabel = selectedProvider?.name?.trim() || t('chatPane.role.assistant');
  const linkedContextLabel = linkedPane
    ? getLinkedPaneLabel(linkedPane)
    : t('chatPane.unlinkedOption');

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-950"
      style={{
        backgroundImage: 'radial-gradient(circle at top, rgba(74, 222, 128, 0.08), transparent 28%), linear-gradient(180deg, #17171a 0%, #101012 100%)',
      }}
      onMouseDown={onActivate}
    >
      <div className="px-4 pb-2 pt-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
          <div className="inline-flex max-w-full items-center gap-3 rounded-full border border-zinc-800/90 bg-zinc-900/70 px-3 py-2 shadow-[0_18px_40px_-34px_rgba(0,0,0,0.9)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-200">
              <Sparkles size={14} />
            </span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-300">
              {assistantLabel}
            </span>
          </div>

          {onClose && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('common.close')}
              onMouseDown={preventMouseButtonFocus}
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800/90 bg-zinc-900/70 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
        <div className="mx-auto w-full max-w-4xl">
        {!settingsLoaded ? (
          <div className="rounded-[24px] border border-zinc-800/80 bg-zinc-900/60 px-5 py-4 text-sm text-zinc-300">
            {t('common.loading')}
          </div>
        ) : providers.length === 0 ? (
          <div className="flex gap-3 pt-6">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-zinc-800/90 bg-zinc-900/80 text-zinc-200">
              <Sparkles size={15} />
            </div>
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-zinc-800/80 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300">
                {assistantLabel}
              </div>
              <div className="mt-4 text-[15px] leading-7 text-zinc-100">{t('chatPane.noProviderTitle')}</div>
              <p className="mt-2 text-sm leading-7 text-zinc-500">{t('chatPane.noProviderDescription')}</p>
            </div>
          </div>
        ) : renderedMessages.length === 0 ? (
          <div className="flex gap-3 pt-6">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-zinc-800/90 bg-zinc-900/80 text-zinc-200">
              <Sparkles size={15} />
            </div>
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-zinc-800/80 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300">
                {assistantLabel}
              </div>
              <div className="mt-4 text-[15px] leading-7 text-zinc-100">{t('chatPane.emptyTitle')}</div>
              <p className="mt-2 text-sm leading-7 text-zinc-500">
                {linkedPane && getPaneBackend(linkedPane) === 'ssh'
                  ? t('chatPane.emptyDescriptionLinked')
                  : t('chatPane.emptyDescription')}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            {renderedMessages.map((message) => {
              const isUser = message.role === 'user' && !message.toolResult;
              const isToolResult = Boolean(message.toolResult);

              return (
                <div key={message.id}>
                  {isUser ? (
                    <div className="flex justify-end">
                      <div className="max-w-[78%] rounded-[22px] border border-zinc-700/80 bg-zinc-800/85 px-4 py-3 shadow-[0_24px_44px_-36px_rgba(0,0,0,0.95)] sm:max-w-[68%]">
                        <div className="space-y-3 text-[15px] leading-7 text-zinc-100">
                          {renderMarkdownLike(message.content)}
                        </div>
                      </div>
                    </div>
                  ) : isToolResult ? (
                    <div className="pl-[52px]">
                      <div className="max-w-[92%] rounded-[20px] border border-zinc-800/80 bg-zinc-900/75 px-4 py-3 text-zinc-200">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                          {t('chatPane.role.tool')}
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-100">
                          {message.toolResult?.content}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-zinc-800/90 bg-zinc-900/80 text-zinc-200">
                        <Sparkles size={15} />
                      </div>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100">{assistantLabel}</span>
                          {message.model && (
                            <span className="rounded-full border border-zinc-800/80 bg-zinc-900/70 px-2.5 py-1 text-[11px] text-zinc-400">
                              {message.model}
                            </span>
                          )}
                        </div>

                        <div className="space-y-3 text-[15px] leading-7 text-zinc-200">
                          {renderMarkdownLike(message.content)}
                        </div>

                        {message.toolCalls?.length ? (
                          <div className="mt-4 space-y-3">
                            {message.toolCalls.map((toolCall) => (
                              <ToolCallCard
                                key={toolCall.id}
                                toolCall={toolCall}
                                t={t}
                                needsApproval={pendingApprovalIds.includes(toolCall.id)}
                                onApprove={() => handleToolApprovalResponse(toolCall.id, true)}
                                onReject={() => handleToolApprovalResponse(toolCall.id, false)}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="mx-auto w-full max-w-5xl">
        {errorMessage && (
          <div className="mb-3 rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="rounded-[28px] border border-zinc-800/90 bg-[#17181b]/95 p-3 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.98)]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {providers.length > 1 ? (
              <ControlSelect
                ariaLabel={t('chatPane.providerLabel')}
                value={selectedProviderId}
                onChange={handleProviderChange}
                icon={<Bot size={14} />}
                minWidthClass="min-w-[156px] max-w-[220px]"
              >
                <option value="">{t('chatPane.providerPlaceholder')}</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </ControlSelect>
            ) : (
              <ControlPill
                icon={<Sparkles size={14} />}
                label={providers[0]?.name || assistantLabel}
              />
            )}

            {terminalPanes.length > 0 ? (
              <ControlSelect
                ariaLabel={t('chatPane.linkedPaneLabel')}
                value={resolvedLinkedPaneId ?? ''}
                onChange={handleLinkedPaneChange}
                icon={<TerminalSquare size={14} />}
                minWidthClass="min-w-[180px] max-w-[320px]"
              >
                <option value="">{t('chatPane.unlinkedOption')}</option>
                {terminalPanes.map((terminalPane) => (
                  <option key={terminalPane.id} value={terminalPane.id}>
                    {getLinkedPaneLabel(terminalPane)}
                  </option>
                ))}
              </ControlSelect>
            ) : (
              <ControlPill
                icon={<TerminalSquare size={14} />}
                label={linkedContextLabel}
              />
            )}
          </div>

          <textarea
            value={composerValue}
            onChange={(event) => setComposerValue(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={providers.length === 0 ? t('chatPane.disabledPlaceholder') : t('chatPane.inputPlaceholder')}
            disabled={!providers.length || isBusy}
            className="min-h-[108px] w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-7 text-zinc-100 outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">
              {linkedPane && getPaneBackend(linkedPane) === 'ssh'
                ? t('chatPane.remoteToolingEnabled')
                : t('chatPane.remoteToolingDisabled')}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ControlSelect
                ariaLabel={t('chatPane.modelLabel')}
                value={selectedModel}
                onChange={handleModelChange}
                disabled={!selectedProvider}
                icon={<Sparkles size={14} />}
                minWidthClass="min-w-[168px] max-w-[240px]"
              >
                <option value="">{t('chatPane.modelPlaceholder')}</option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </ControlSelect>

              {isBusy ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleCancelStreaming();
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
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
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[rgb(var(--primary))] px-4 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>
  );
};
