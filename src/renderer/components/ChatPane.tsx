import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, SendHorizonal, Sparkles, Square, X } from 'lucide-react';
import type { ChatMessage, ChatSettings, LLMProviderConfig } from '../../shared/types/chat';
import type { Pane } from '../types/window';
import { getAllPanes } from '../utils/layoutHelpers';
import { useI18n } from '../i18n';
import { useWindowStore } from '../stores/windowStore';
import { preventMouseButtonFocus } from '../utils/buttonFocus';
import { getPaneBackend, isTerminalPane } from '../../shared/utils/terminalCapabilities';
import { WORKSPACE_SETTINGS_UPDATED_EVENT } from '../utils/settingsEvents';
import { ChatNewConversationIcon } from './icons/ChatNewConversationIcon';
import { selectPreferredChatLinkedPaneId } from '../utils/chatPane';
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

function renderLegacyMessage(message: ChatMessage) {
  if (message.role === 'user' && !message.toolResult) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-[22px] border border-zinc-700/80 bg-zinc-800/85 px-4 py-3 sm:max-w-[68%]">
          <div className="space-y-3 text-[15px] leading-7 text-zinc-100">
            {renderMarkdownLike(message.content)}
          </div>
        </div>
      </div>
    );
  }

  if (message.toolResult) {
    return (
      <div className="rounded-[20px] border border-zinc-800/80 bg-zinc-900/75 px-4 py-3 text-zinc-200">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-zinc-100">
          {message.toolResult.content}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[15px] leading-7 text-zinc-200">
      {renderMarkdownLike(message.content)}
    </div>
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
  const hasLiveTaskRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [settings, setSettings] = useState<ChatSettings>(() => normalizeChatSettings(undefined));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const agentState = chatState.agent;
  const resolvedLinkedPaneId = selectPreferredChatLinkedPaneId(terminalPanes, chatState.linkedPaneId);
  const linkedPane = useMemo(
    () => terminalPanes.find((candidate) => candidate.id === resolvedLinkedPaneId) ?? null,
    [resolvedLinkedPaneId, terminalPanes],
  );
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
    const runtimeOnly = task.status === 'running';
    persistChatState((currentChat) => ({
      ...currentChat,
      agent: task,
      messages: task.messages,
      activeProviderId: task.providerId,
      activeModel: task.model,
      linkedPaneId: task.linkedPaneId ?? currentChat.linkedPaneId,
      isStreaming: task.status === 'running',
    }), runtimeOnly);
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
  }, [chatState.messages, agentState?.timeline.length, agentState?.status]);

  useEffect(() => {
    const handleTaskState = (_event: unknown, payload: { paneId: string; task: NonNullable<NonNullable<Pane['chat']>['agent']> }) => {
      if (payload.paneId !== pane.id || !payload.task) {
        return;
      }

      setErrorMessage(payload.task.error ?? null);
      syncAgentTask(payload.task);
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
        syncAgentTask(response.data);
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
  }, [pane.id, syncAgentTask]);

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

    setComposerValue('');
    setErrorMessage(null);
    hasLiveTaskRef.current = false;
    persistChatState((currentChat) => ({
      ...currentChat,
      messages: [],
      agent: undefined,
      isStreaming: false,
    }));
  }, [isBusy, persistChatState]);

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

  const handleSend = useCallback(async () => {
    const trimmed = composerValue.trim();
    if (!trimmed || !selectedProvider || !selectedModel || isBusy) {
      return;
    }

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
      activeProviderId: selectedProvider.id,
      activeModel: selectedModel,
      linkedPaneId: resolvedLinkedPaneId,
      isStreaming: true,
    }), true);

    try {
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
        seedMessages: hasLiveTaskRef.current ? undefined : chatState.messages,
      });

      if (!response.success) {
        throw new Error(response.error || t('chatPane.sendFailed'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      persistChatState((currentChat) => ({
        ...currentChat,
        isStreaming: false,
      }), true);
    }
  }, [
    agentState,
    chatState.messages,
    composerValue,
    isBusy,
    linkedPane,
    pane.id,
    persistChatState,
    resolvedLinkedPaneId,
    selectedModel,
    selectedProvider,
    settings.defaultSystemPrompt,
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

  const assistantLabel = selectedProvider?.name?.trim() || 'Agent';

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
            {agentState && (
              <span className="rounded-full border border-zinc-800/90 bg-zinc-950/80 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                {agentState.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t('chatPane.newConversation')}
              onMouseDown={preventMouseButtonFocus}
              onClick={handleNewConversation}
              disabled={isBusy}
              className="group relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-zinc-800/90 bg-[linear-gradient(180deg,rgba(31,31,35,0.96),rgba(18,18,21,0.98))] text-zinc-300 shadow-[0_18px_36px_-32px_rgba(0,0,0,0.98)] transition-all duration-200 before:absolute before:inset-[1px] before:rounded-full before:bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.12),transparent_46%)] hover:-translate-y-0.5 hover:border-zinc-700 hover:text-[rgb(var(--primary))] hover:shadow-[0_24px_44px_-34px_rgba(0,0,0,0.98)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="absolute inset-[7px] rounded-full border border-zinc-500/10 opacity-70 transition-opacity group-hover:opacity-100" />
              <ChatNewConversationIcon size={17} className="relative z-[1]" />
            </button>

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
          ) : agentState ? (
            <>
              <AgentTimeline
                task={agentState}
                assistantLabel={assistantLabel}
                onApprove={(approvalId) => handleApprovalResponse(approvalId, true)}
                onReject={(approvalId) => handleApprovalResponse(approvalId, false)}
                onSubmitInteraction={handleSubmitInteraction}
                onCancelInteraction={handleCancelInteraction}
              />
              <div ref={messagesEndRef} />
            </>
          ) : chatState.messages.length > 0 ? (
            <div className="space-y-6 pt-4">
              {chatState.messages.map((message) => (
                <div key={message.id}>
                  {renderLegacyMessage(message)}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="flex gap-3 pt-6">
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-zinc-800/90 bg-zinc-900/80 text-zinc-200">
                <Sparkles size={15} />
              </div>
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-zinc-800/80 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300">
                  {assistantLabel}
                </div>
                <div className="mt-4 text-[15px] leading-7 text-zinc-100">Remote Agent Ready</div>
                <p className="mt-2 text-sm leading-7 text-zinc-500">
                  {linkedPane && getPaneBackend(linkedPane) === 'ssh'
                    ? 'This pane is bound to an SSH session. The agent will show reasoning, tool calls, command output, approvals, and interactive prompts here.'
                    : 'Bind this chat to an SSH pane so the agent can execute real remote diagnostics instead of plain conversation.'}
                </p>
              </div>
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
                  ? 'SSH runtime bound'
                  : 'No SSH runtime bound'}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ControlSelect
                  ariaLabel={t('chatPane.providerModelLabel')}
                  value={selectedProviderModelValue}
                  onChange={handleProviderModelChange}
                  disabled={!providers.length}
                  icon={<Sparkles size={14} />}
                  minWidthClass="min-w-[240px] max-w-[360px]"
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
