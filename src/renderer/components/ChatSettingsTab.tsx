import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { v4 as uuidv4 } from 'uuid';
import type { ChatSettings, LLMProviderConfig, LLMProviderType } from '../../shared/types/chat';
import { useI18n } from '../i18n';

interface ProviderFormState {
  id?: string;
  name: string;
  type: LLMProviderType;
  baseUrl: string;
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
    } catch (error) {
      console.error('Failed to update chat settings:', error);
    }
  }, []);

  const providers = chatSettings.providers;
  const activeProvider = useMemo(
    () => providers.find((provider) => provider.id === chatSettings.activeProviderId) ?? null,
    [chatSettings.activeProviderId, providers],
  );

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
    const providerName = providerForm.name.trim();
    const apiKey = providerForm.apiKey.trim();
    let defaultModel = providerForm.defaultModel.trim();

    if (!providerName || !apiKey || models.length === 0) {
      setFormError(t('settings.chat.formValidationError'));
      return;
    }

    if (!defaultModel) {
      defaultModel = models[0];
    }

    const normalizedModels = models.includes(defaultModel)
      ? models
      : [defaultModel, ...models];

    const providerId = providerForm.id ?? uuidv4();
    const nextProvider: LLMProviderConfig = {
      id: providerId,
      type: providerForm.type,
      name: providerName,
      baseUrl: providerForm.type === 'openai-compatible' && providerForm.baseUrl.trim()
        ? providerForm.baseUrl.trim()
        : undefined,
      apiKey,
      models: normalizedModels,
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
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">{t('settings.chat.providersTitle')}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.chat.providersDescription')}</p>
          </div>

          <button
            type="button"
            onClick={handleAddProvider}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[rgb(var(--primary))] px-4 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90"
          >
            {t('settings.chat.addProvider')}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--muted-foreground))]">
              {t('common.loading')}
            </div>
          ) : providers.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/50 px-5 py-10 text-center">
              <div className="text-base font-semibold text-white">{t('settings.chat.noProvidersTitle')}</div>
              <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.chat.noProvidersDescription')}</p>
            </div>
          ) : (
            providers.map((provider) => (
              <div
                key={provider.id}
                className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-white">{provider.name}</h4>
                      <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]">
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
                    <p className="mt-3 text-xs text-[rgb(var(--muted-foreground))]">
                      {t('settings.chat.defaultModelSummary', { model: provider.defaultModel })}
                    </p>
                    <p className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
                      {t('settings.chat.modelsSummary', { count: provider.models.length })}
                    </p>
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
                      className="inline-flex h-9 items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))]"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteProvider(provider.id);
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-2xl border border-[rgba(255,92,92,0.16)] bg-[rgba(255,92,92,0.08)] px-4 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgba(255,92,92,0.14)]"
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
          <div className="mt-6 rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-white">
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
                className="text-sm text-[rgb(var(--muted-foreground))] transition-colors hover:text-white"
              >
                {t('common.cancel')}
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.chat.providerNameLabel')}</span>
                <input
                  value={providerForm.name}
                  onChange={(event) => handleProviderFieldChange('name', event.target.value)}
                  placeholder={t('settings.chat.providerNamePlaceholder')}
                  className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.chat.providerTypeLabel')}</span>
                <select
                  value={providerForm.type}
                  onChange={(event) => handleProviderFieldChange('type', event.target.value as LLMProviderType)}
                  className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
                >
                  <option value="anthropic">{t('settings.chat.providerTypeAnthropic')}</option>
                  <option value="openai-compatible">{t('settings.chat.providerTypeOpenAICompatible')}</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 md:col-span-2">
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.chat.apiKeyLabel')}</span>
                <input
                  value={providerForm.apiKey}
                  onChange={(event) => handleProviderFieldChange('apiKey', event.target.value)}
                  placeholder={t('settings.chat.apiKeyPlaceholder')}
                  className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
                />
              </label>

              <label className="flex flex-col gap-2 md:col-span-2">
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.chat.baseUrlLabel')}</span>
                <input
                  value={providerForm.baseUrl}
                  onChange={(event) => handleProviderFieldChange('baseUrl', event.target.value)}
                  placeholder={t('settings.chat.baseUrlPlaceholder')}
                  disabled={providerForm.type !== 'openai-compatible'}
                  className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>

              <label className="flex flex-col gap-2 md:col-span-2">
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.chat.modelsLabel')}</span>
                <textarea
                  value={providerForm.modelsText}
                  onChange={(event) => handleProviderFieldChange('modelsText', event.target.value)}
                  placeholder={t('settings.chat.modelsPlaceholder')}
                  className="min-h-[120px] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm leading-6 text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
                />
                <span className="text-xs leading-5 text-[rgb(var(--muted-foreground))]">{t('settings.chat.modelsHint')}</span>
              </label>

              <label className="flex flex-col gap-2 md:col-span-2">
                <span className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.chat.defaultModelLabel')}</span>
                <input
                  value={providerForm.defaultModel}
                  onChange={(event) => handleProviderFieldChange('defaultModel', event.target.value)}
                  placeholder={t('settings.chat.defaultModelPlaceholder')}
                  className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
                />
              </label>
            </div>

            {formError && (
              <p className="mt-4 text-sm text-[rgb(255,214,214)]">{formError}</p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  void handleSaveProvider();
                }}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[rgb(var(--primary))] px-4 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
        <div>
          <h3 className="text-base font-semibold text-white">{t('settings.chat.defaultsTitle')}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.chat.defaultsDescription')}</p>
        </div>

        <div className="mt-6 space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.chat.activeProviderLabel')}</span>
            <select
              value={chatSettings.activeProviderId ?? ''}
              onChange={(event) => {
                void persistChatSettings({
                  ...chatSettings,
                  activeProviderId: event.target.value || undefined,
                });
              }}
              className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
            >
              <option value="">{t('settings.chat.activeProviderPlaceholder')}</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </label>

          <div className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">{t('settings.chat.commandSecurityTitle')}</h4>
                <p className="mt-2 text-sm leading-6 text-[rgb(var(--muted-foreground))]">{t('settings.chat.commandSecurityDescription')}</p>
              </div>

              <Switch.Root
                checked={chatSettings.enableCommandSecurity ?? true}
                onCheckedChange={(checked) => {
                  void persistChatSettings({
                    ...chatSettings,
                    enableCommandSecurity: checked,
                  });
                }}
                aria-label={t('settings.chat.commandSecurityTitle')}
                className="relative h-7 w-12 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
              >
                <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.chat.systemPromptLabel')}</span>
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
              className="min-h-[160px] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm leading-6 text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
            />
          </label>
        </div>
      </section>
    </div>
  );
};
