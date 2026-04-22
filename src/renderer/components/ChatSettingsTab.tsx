import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { Bot, SlidersHorizontal } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatSettings,
  LLMProviderConfig,
  LLMProviderType,
  LLMProviderWireApi,
} from '../../shared/types/chat';
import { resolveLLMProviderWireApi } from '../../shared/utils/chatProvider';
import { useI18n } from '../i18n';
import { notifyWorkspaceSettingsUpdated } from '../utils/settingsEvents';
import {
  idePopupActionButtonClassName,
  idePopupBarePanelClassName,
  idePopupEmptyStateClassName,
  idePopupInputClassName,
  idePopupSecondaryButtonClassName,
} from './ui/ide-popup';
import { CompactSettingRow, CompactSettingsSection } from './settings/CompactSettings';

interface ProviderFormState {
  id?: string;
  name: string;
  type: LLMProviderType;
  baseUrl: string;
  wireApi: LLMProviderWireApi;
  apiKey: string;
  modelsText: string;
  defaultModel: string;
}

function normalizeChatSettings(settings: ChatSettings | undefined): ChatSettings {
  return {
    providers: settings?.providers ?? [],
    activeProviderId: settings?.activeProviderId,
    defaultSystemPrompt: settings?.defaultSystemPrompt ?? '',
    enableCommandSecurity: settings?.enableCommandSecurity ?? true,
  };
}

function createEmptyProviderForm(): ProviderFormState {
  return {
    name: '',
    type: 'anthropic',
    baseUrl: '',
    wireApi: 'chat-completions',
    apiKey: '',
    modelsText: '',
    defaultModel: '',
  };
}

function createProviderForm(provider: LLMProviderConfig): ProviderFormState {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl ?? '',
    wireApi: resolveLLMProviderWireApi(provider) ?? 'chat-completions',
    apiKey: provider.apiKey,
    modelsText: provider.models.join('\n'),
    defaultModel: provider.defaultModel,
  };
}

function parseModels(modelsText: string): string[] {
  return Array.from(new Set(
    modelsText
      .split(/[\n,]/)
      .map((model) => model.trim())
      .filter(Boolean),
  ));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const ChatSettingsTab: React.FC = () => {
  const { t } = useI18n();
  const [chatSettings, setChatSettings] = useState<ChatSettings>(() => normalizeChatSettings(undefined));
  const [loading, setLoading] = useState(true);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(() => createEmptyProviderForm());
  const [formError, setFormError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);

    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        setChatSettings(normalizeChatSettings(response.data.chat));
      }
    } catch (error) {
      console.error('Failed to load chat settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const persistChatSettings = useCallback(async (nextSettings: ChatSettings) => {
    setChatSettings(nextSettings);

    try {
      await window.electronAPI.updateSettings({
        chat: nextSettings,
      });
      notifyWorkspaceSettingsUpdated({
        chat: nextSettings,
      });
    } catch (error) {
      console.error('Failed to update chat settings:', error);
    }
  }, []);

  const providers = chatSettings.providers;
  const activeProvider = useMemo(
    () => providers.find((provider) => provider.id === chatSettings.activeProviderId) ?? null,
    [chatSettings.activeProviderId, providers],
  );
  const barePanelClassName = idePopupBarePanelClassName;
  const inputClassName = `${idePopupInputClassName} !rounded-lg !px-3 !py-2`;
  const secondaryButtonClassName = `${idePopupSecondaryButtonClassName} h-9 rounded-lg px-3`;
  const primaryButtonClassName = `${idePopupActionButtonClassName('primary')} h-9 min-w-0 rounded-lg px-3`;
  const emptyStateClassName = `${idePopupEmptyStateClassName} px-5 py-8 text-center`;
  const mutedBadgeClassName = 'rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_78%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]';
  const compactSwitchRootClassName = 'relative h-6 w-10 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]';
  const compactSwitchThumbClassName = 'block h-5 w-5 translate-x-0.5 rounded-full bg-[color-mix(in_srgb,rgb(var(--background))_92%,transparent)] shadow-sm transition-transform data-[state=checked]:translate-x-[18px]';

  const handleAddProvider = useCallback(() => {
    setEditingProviderId('new');
    setProviderForm(createEmptyProviderForm());
    setFormError(null);
  }, []);

  const handleEditProvider = useCallback((provider: LLMProviderConfig) => {
    setEditingProviderId(provider.id);
    setProviderForm(createProviderForm(provider));
    setFormError(null);
  }, []);

  const handleDeleteProvider = useCallback(async (providerId: string) => {
    const remainingProviders = providers.filter((provider) => provider.id !== providerId);
    const nextSettings: ChatSettings = {
      ...chatSettings,
      providers: remainingProviders,
      activeProviderId: chatSettings.activeProviderId === providerId
        ? remainingProviders[0]?.id
        : chatSettings.activeProviderId,
    };

    await persistChatSettings(nextSettings);

    if (editingProviderId === providerId) {
      setEditingProviderId(null);
      setProviderForm(createEmptyProviderForm());
      setFormError(null);
    }
  }, [chatSettings, editingProviderId, persistChatSettings, providers]);

  const handleSaveProvider = useCallback(async () => {
    const models = parseModels(providerForm.modelsText);
    const baseUrl = providerForm.baseUrl.trim();
    const providerName = providerForm.name.trim();
    const apiKey = providerForm.apiKey.trim();
    const requestedDefaultModel = providerForm.defaultModel.trim();

    if (!providerName || !apiKey || models.length === 0) {
      setFormError(t('settings.chat.formValidationError'));
      return;
    }

    if (providerForm.type === 'openai-compatible' && !baseUrl) {
      setFormError(t('settings.chat.baseUrlRequiredError'));
      return;
    }

    if (baseUrl && !isValidHttpUrl(baseUrl)) {
      setFormError(t('settings.chat.baseUrlInvalidError'));
      return;
    }

    if (isHttpUrl(apiKey)) {
      setFormError(t('settings.chat.apiKeyInvalidError'));
      return;
    }

    const defaultModel = requestedDefaultModel && models.includes(requestedDefaultModel)
      ? requestedDefaultModel
      : models[0];

    const providerId = providerForm.id ?? uuidv4();
    const nextProvider: LLMProviderConfig = {
      id: providerId,
      type: providerForm.type,
      name: providerName,
      baseUrl: baseUrl || undefined,
      wireApi: providerForm.type === 'openai-compatible'
        ? providerForm.wireApi
        : undefined,
      apiKey,
      models,
      defaultModel,
    };

    const existingIndex = providers.findIndex((provider) => provider.id === providerId);
    const nextProviders = existingIndex >= 0
      ? providers.map((provider, index) => index === existingIndex ? nextProvider : provider)
      : [...providers, nextProvider];

    const nextSettings: ChatSettings = {
      ...chatSettings,
      providers: nextProviders,
      activeProviderId: chatSettings.activeProviderId ?? nextProvider.id,
    };

    await persistChatSettings(nextSettings);
    setEditingProviderId(null);
    setProviderForm(createEmptyProviderForm());
    setFormError(null);
  }, [chatSettings, persistChatSettings, providerForm, providers, t]);

  const handleProviderFieldChange = useCallback(<K extends keyof ProviderFormState>(field: K, value: ProviderFormState[K]) => {
    setProviderForm((current) => ({
      ...current,
      [field]: value,
    }));
    setFormError(null);
  }, []);

  const handleSystemPromptBlur = useCallback(async (event: React.FocusEvent<HTMLTextAreaElement>) => {
    await persistChatSettings({
      ...chatSettings,
      defaultSystemPrompt: event.target.value,
    });
  }, [chatSettings, persistChatSettings]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <CompactSettingsSection
        title={t('settings.chat.providersTitle')}
        help={t('settings.chat.providersDescription')}
        icon={<Bot size={15} />}
        actions={(
          <button
            type="button"
            onClick={handleAddProvider}
            className={primaryButtonClassName}
          >
            {t('settings.chat.addProvider')}
          </button>
        )}
        contentClassName="p-4"
        divided={false}
      >
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_62%,transparent)] px-4 py-3 text-sm text-[rgb(var(--muted-foreground))]">
              {t('common.loading')}
            </div>
          ) : providers.length === 0 ? (
            <div className={emptyStateClassName}>
              <div className="text-base font-semibold text-[rgb(var(--foreground))]">{t('settings.chat.noProvidersTitle')}</div>
              <p className="mt-1 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.chat.noProvidersDescription')}</p>
            </div>
          ) : (
            providers.map((provider) => (
              <div
                key={provider.id}
                className="rounded-[14px] border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_62%,transparent)] px-3 py-2.5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-[rgb(var(--foreground))]">{provider.name}</h4>
                      <span className={mutedBadgeClassName}>
                        {provider.type === 'anthropic'
                          ? t('settings.chat.providerTypeAnthropic')
                          : t('settings.chat.providerTypeOpenAICompatible')}
                      </span>
                      {provider.id === activeProvider?.id && (
                        <span className="rounded-full border border-[rgba(168,170,88,0.28)] bg-[rgba(168,170,88,0.12)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                          {t('settings.chat.activeProviderBadge')}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--muted-foreground))]">
                      <span>{t('settings.chat.defaultModelSummary', { model: provider.defaultModel })}</span>
                      <span>{t('settings.chat.modelsSummary', { count: provider.models.length })}</span>
                    </div>
                    {provider.baseUrl && (
                      <p className="mt-1 break-all font-mono text-xs text-[rgb(var(--foreground))]">
                        {provider.baseUrl}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditProvider(provider)}
                      className={secondaryButtonClassName}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteProvider(provider.id);
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-2xl border border-[rgb(var(--error)/0.16)] bg-[rgb(var(--error)/0.08)] px-4 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--error)/0.14)]"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {editingProviderId && (
          <div className={`mt-4 overflow-hidden ${barePanelClassName} !p-0`}>
            <div className="flex min-h-[42px] flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-2">
              <h4 className="text-sm font-semibold text-[rgb(var(--foreground))]">
                {editingProviderId === 'new'
                  ? t('settings.chat.addProviderTitle')
                  : t('settings.chat.editProviderTitle')}
              </h4>

              <button
                type="button"
                onClick={() => {
                  setEditingProviderId(null);
                  setProviderForm(createEmptyProviderForm());
                  setFormError(null);
                }}
                className="text-sm text-[rgb(var(--muted-foreground))] transition-colors hover:text-[rgb(var(--foreground))]"
              >
                {t('common.cancel')}
              </button>
            </div>

            <div className="divide-y divide-[rgb(var(--border))]">
              <CompactSettingRow label={t('settings.chat.providerNameLabel')}>
                <input
                  value={providerForm.name}
                  onChange={(event) => handleProviderFieldChange('name', event.target.value)}
                  placeholder={t('settings.chat.providerNamePlaceholder')}
                  className={`max-w-[520px] ${inputClassName}`}
                />
              </CompactSettingRow>

              <CompactSettingRow label={t('settings.chat.providerTypeLabel')}>
                <select
                  value={providerForm.type}
                  onChange={(event) => handleProviderFieldChange('type', event.target.value as LLMProviderType)}
                  className={`max-w-[320px] ${inputClassName}`}
                >
                  <option value="anthropic">{t('settings.chat.providerTypeAnthropic')}</option>
                  <option value="openai-compatible">{t('settings.chat.providerTypeOpenAICompatible')}</option>
                </select>
              </CompactSettingRow>

              <CompactSettingRow
                label={t('settings.chat.baseUrlLabel')}
                help={providerForm.type === 'anthropic' ? t('settings.chat.baseUrlAnthropicHint') : undefined}
              >
                <input
                  value={providerForm.baseUrl}
                  onChange={(event) => handleProviderFieldChange('baseUrl', event.target.value)}
                  placeholder={providerForm.type === 'anthropic'
                    ? 'https://api.anthropic.com (默认)'
                    : t('settings.chat.baseUrlPlaceholder')}
                  className={`max-w-[520px] ${inputClassName}`}
                />
              </CompactSettingRow>

              <CompactSettingRow label={t('settings.chat.apiKeyLabel')}>
                <input
                  value={providerForm.apiKey}
                  onChange={(event) => handleProviderFieldChange('apiKey', event.target.value)}
                  placeholder={t('settings.chat.apiKeyPlaceholder')}
                  className={`max-w-[520px] ${inputClassName}`}
                />
              </CompactSettingRow>

              <CompactSettingRow
                label={t('settings.chat.protocolLabel')}
                help={t('settings.chat.protocolHint')}
                disabled={providerForm.type !== 'openai-compatible'}
              >
                <select
                  value={providerForm.wireApi}
                  onChange={(event) => handleProviderFieldChange('wireApi', event.target.value as LLMProviderWireApi)}
                  disabled={providerForm.type !== 'openai-compatible'}
                  className={`max-w-[320px] ${inputClassName} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <option value="chat-completions">{t('settings.chat.protocolChatCompletions')}</option>
                  <option value="responses">{t('settings.chat.protocolResponses')}</option>
                </select>
              </CompactSettingRow>

              <CompactSettingRow
                label={t('settings.chat.modelsLabel')}
                help={t('settings.chat.modelsHint')}
                controlClassName="items-stretch"
              >
                <textarea
                  value={providerForm.modelsText}
                  onChange={(event) => handleProviderFieldChange('modelsText', event.target.value)}
                  placeholder={t('settings.chat.modelsPlaceholder')}
                  className={`min-h-[96px] max-w-[520px] ${inputClassName} leading-6`}
                />
              </CompactSettingRow>

              <CompactSettingRow
                label={t('settings.chat.defaultModelLabel')}
                help={t('settings.chat.defaultModelPlaceholder')}
              >
                <input
                  value={providerForm.defaultModel}
                  onChange={(event) => handleProviderFieldChange('defaultModel', event.target.value)}
                  placeholder={t('settings.chat.defaultModelPlaceholder')}
                  className={`max-w-[520px] ${inputClassName}`}
                />
              </CompactSettingRow>
            </div>

            {formError && (
              <p className="px-4 pt-3 text-sm text-[rgb(var(--error))]">{formError}</p>
            )}

            <div className="flex justify-end px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  void handleSaveProvider();
                }}
                className={primaryButtonClassName}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        )}
      </CompactSettingsSection>

      <CompactSettingsSection
        title={t('settings.chat.defaultsTitle')}
        help={t('settings.chat.defaultsDescription')}
        icon={<SlidersHorizontal size={15} />}
      >
          <CompactSettingRow
            label={t('settings.chat.activeProviderLabel')}
            htmlFor="chat-active-provider"
          >
            <select
              id="chat-active-provider"
              aria-label={t('settings.chat.activeProviderLabel')}
              value={chatSettings.activeProviderId ?? ''}
              onChange={(event) => {
                void persistChatSettings({
                  ...chatSettings,
                  activeProviderId: event.target.value || undefined,
                });
              }}
              className={inputClassName}
            >
              <option value="">{t('settings.chat.activeProviderPlaceholder')}</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </CompactSettingRow>

          <CompactSettingRow
            label={t('settings.chat.commandSecurityTitle')}
            help={t('settings.chat.commandSecurityDescription')}
          >
              <Switch.Root
                checked={chatSettings.enableCommandSecurity ?? true}
                onCheckedChange={(checked) => {
                  void persistChatSettings({
                    ...chatSettings,
                    enableCommandSecurity: checked,
                  });
                }}
                aria-label={t('settings.chat.commandSecurityTitle')}
                className={compactSwitchRootClassName}
              >
                <Switch.Thumb className={compactSwitchThumbClassName} />
              </Switch.Root>
          </CompactSettingRow>

          <CompactSettingRow
            label={t('settings.chat.systemPromptLabel')}
            help={t('settings.chat.systemPromptPlaceholder')}
            controlClassName="items-stretch"
          >
            <textarea
              value={chatSettings.defaultSystemPrompt ?? ''}
              onChange={(event) => {
                setChatSettings((current) => ({
                  ...current,
                  defaultSystemPrompt: event.target.value,
                }));
              }}
              onBlur={handleSystemPromptBlur}
              placeholder={t('settings.chat.systemPromptPlaceholder')}
              className={`min-h-[120px] max-w-[680px] ${inputClassName} leading-6`}
            />
          </CompactSettingRow>
      </CompactSettingsSection>
    </div>
  );
};
