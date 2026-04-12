import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  ChatSettings,
  ChatStreamChunkPayload,
  ChatStreamDonePayload,
  ChatStreamErrorPayload,
  ChatToolApprovalRequestPayload,
  ChatToolResultPayload,
  LLMProviderConfig,
  ToolCall,
} from '../../shared/types/chat';
import type { Pane } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { preventMouseButtonFocus } from '../utils/buttonFocus';
import { getPaneBackend, isTerminalPane } from '../../shared/utils/terminalCapabilities';

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
      className="whitespace-pre-wrap break-words leading-6 text-[rgb(var(--foreground))]"
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">{t(`chatPane.toolName.${toolCall.name}` as any)}</div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getToolStatusTone(toolCall.status)}`}>
          {t(statusKey as any)}
        </span>
      </div>

      {'command' in toolCall.params && typeof toolCall.params.command === 'string' && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{t('chatPane.commandLabel')}</div>
          <pre className="overflow-x-auto rounded-xl bg-zinc-900/90 px-3 py-2 font-mono text-[12px] leading-6 text-zinc-100">
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
            className="rounded-xl bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90"
          >
            {t('chatPane.approve')}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            {t('chatPane.reject')}
          </button>
        </div>
      )}

      {toolCall.result && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{t('chatPane.toolResultLabel')}</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-100">
            {toolCall.result}
          </pre>
        </div>
      )}
    </div>
  );
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  windowId,
  pane,
  isActive,
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

  const terminalPanes = useWindowStore(useCallback((state) => {
    const terminalWindow = state.windows.find((window) => window.id === windowId);
    if (!terminalWindow) {
      return [] as Pane[];
    }

    return getAllPanes(terminalWindow.layout).filter((candidate) => isTerminalPane(candidate));
  }, [windowId]));

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
  const canSend = Boolean(selectedProvider && selectedModel && !streamingMessage);

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

      const requestMeta = currentRequestRef.current;
      currentRequestRef.current = null;
      setStreamingMessage(null);
      setErrorMessage(null);

      persistChatState((currentChat) => ({
        ...currentChat,
        isStreaming: false,
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
          status: inferToolStatus(payload.result, payload.isError),
          result: payload.result,
        }),
        {
          id: `tool-result-${payload.toolCallId}`,
          role: 'user',
          content: '',
          timestamp: new Date().toISOString(),
          toolResult: {
            toolCallId: payload.toolCallId,
            content: payload.result,
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
    if (!trimmed || !selectedProvider || !selectedModel || streamingMessage) {
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
    streamingMessage,
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

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-t-2 bg-zinc-950 ${
        isActive ? 'border-t-sky-400 ring-1 ring-sky-500/40' : 'border-t-sky-700/60'
      }`}
      onMouseDown={onActivate}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{t('chatPane.title')}</div>
          <div className="mt-1 text-xs text-zinc-400">
            {linkedPane
              ? t('chatPane.linkedPaneDescription', { target: getLinkedPaneLabel(linkedPane) })
              : t('chatPane.unlinkedDescription')}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onClose && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('common.close')}
              onMouseDown={preventMouseButtonFocus}
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 border-b border-zinc-900 bg-zinc-950/70 px-3 py-3 md:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{t('chatPane.providerLabel')}</span>
          <select
            value={selectedProviderId}
            onChange={(event) => handleProviderChange(event.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-[rgb(var(--ring))]"
          >
            <option value="">{t('chatPane.providerPlaceholder')}</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{t('chatPane.modelLabel')}</span>
          <select
            value={selectedModel}
            onChange={(event) => handleModelChange(event.target.value)}
            disabled={!selectedProvider}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-[rgb(var(--ring))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{t('chatPane.modelPlaceholder')}</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{t('chatPane.linkedPaneLabel')}</span>
          <select
            value={resolvedLinkedPaneId ?? ''}
            onChange={(event) => handleLinkedPaneChange(event.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-[rgb(var(--ring))]"
          >
            <option value="">{t('chatPane.unlinkedOption')}</option>
            {terminalPanes.map((terminalPane) => (
              <option key={terminalPane.id} value={terminalPane.id}>
                {getLinkedPaneLabel(terminalPane)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!settingsLoaded ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-300">
            {t('common.loading')}
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-zinc-800 bg-zinc-900/60 px-5 py-8 text-center">
            <div className="text-base font-semibold text-white">{t('chatPane.noProviderTitle')}</div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{t('chatPane.noProviderDescription')}</p>
          </div>
        ) : renderedMessages.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-zinc-800 bg-zinc-900/60 px-5 py-8 text-center">
            <div className="text-base font-semibold text-white">{t('chatPane.emptyTitle')}</div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {linkedPane && getPaneBackend(linkedPane) === 'ssh'
                ? t('chatPane.emptyDescriptionLinked')
                : t('chatPane.emptyDescription')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {renderedMessages.map((message) => {
              const isUser = message.role === 'user' && !message.toolResult;
              const isToolResult = Boolean(message.toolResult);
              const needsMutedChrome = isToolResult;

              return (
                <div
                  key={message.id}
                  className={`rounded-[22px] border px-4 py-3 ${
                    isUser
                      ? 'ml-auto max-w-[86%] border-[rgb(var(--primary))]/35 bg-[rgb(var(--primary))]/10'
                      : needsMutedChrome
                        ? 'max-w-[92%] border-zinc-800 bg-zinc-900/70'
                        : 'max-w-[92%] border-zinc-800 bg-zinc-900/90'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    <span>
                      {isUser
                        ? t('chatPane.role.user')
                        : isToolResult
                          ? t('chatPane.role.tool')
                          : t('chatPane.role.assistant')}
                    </span>
                    {message.model && !isUser && !isToolResult && (
                      <span>{message.model}</span>
                    )}
                  </div>

                  {isToolResult ? (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-100">
                      {message.toolResult?.content}
                    </pre>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {renderMarkdownLike(message.content)}
                    </div>
                  )}

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
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 bg-zinc-950/90 px-3 py-3">
        {errorMessage && (
          <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="rounded-[22px] border border-zinc-800 bg-zinc-900/85 p-3">
          <textarea
            value={composerValue}
            onChange={(event) => setComposerValue(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={providers.length === 0 ? t('chatPane.disabledPlaceholder') : t('chatPane.inputPlaceholder')}
            disabled={!providers.length || Boolean(streamingMessage)}
            className="min-h-[92px] w-full resize-none bg-transparent text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">
              {linkedPane && getPaneBackend(linkedPane) === 'ssh'
                ? t('chatPane.remoteToolingEnabled')
                : t('chatPane.remoteToolingDisabled')}
            </div>

            <div className="flex items-center gap-2">
              {streamingMessage ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleCancelStreaming();
                  }}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
                >
                  {t('chatPane.cancel')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void handleSend();
                  }}
                  disabled={!canSend || !composerValue.trim()}
                  className="rounded-xl bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
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
