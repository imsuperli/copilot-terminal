import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { Bot, SlidersHorizontal } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatProviderValidationResult,
  ChatSettings,
  LLMProviderConfig,
} from '../../shared/types/chat';
import { resolveLLMProviderWireApi } from '../../shared/utils/chatProvider';
import { useI18n } from '../i18n';
import { notifyWorkspaceSettingsUpdated } from '../utils/settingsEvents';
import {
  idePopupActionButtonClassName,
  idePopupEmptyStateClassName,
  idePopupInputClassName,
  idePopupNativeSelectClassName,
  idePopupSecondaryButtonClassName,
} from './ui/ide-popup';
import { Dialog } from './ui/Dialog';
import { CompactSettingRow, CompactSettingsSection } from './settings/CompactSettings';

interface ProviderDialogFormState {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  selectedModels: string[];
  manualModelsText: string;
  defaultModel: string;
}

interface ProviderDetectionState {
  isDetecting: boolean;
  hasAttempted: boolean;
  result: ChatProviderValidationResult | null;
  error: string | null;
}

function normalizeChatSettings(settings: ChatSettings | undefined): ChatSettings {
  return {
    providers: settings?.providers ?? [],
    activeProviderId: settings?.activeProviderId,
    defaultSystemPrompt: settings?.defaultSystemPrompt ?? '',
    workspaceInstructions: settings?.workspaceInstructions ?? '',
    contextFilePaths: settings?.contextFilePaths ?? [],
    enableCommandSecurity: settings?.enableCommandSecurity ?? true,
  };
}

function createEmptyProviderForm(): ProviderDialogFormState {
  return {
    name: '',
    baseUrl: '',
    apiKey: '',
    selectedModels: [],
    manualModelsText: '',
    defaultModel: '',
  };
}

function createProviderForm(provider: LLMProviderConfig): ProviderDialogFormState {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl ?? '',
    apiKey: provider.apiKey,
    selectedModels: provider.models,
    manualModelsText: provider.models.join('\n'),
    defaultModel: provider.defaultModel,
  };
}

function createEmptyDetectionState(): ProviderDetectionState {
  return {
    isDetecting: false,
    hasAttempted: false,
    result: null,
    error: null,
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
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderDialogFormState>(() => createEmptyProviderForm());
  const [providerDetection, setProviderDetection] = useState<ProviderDetectionState>(() => createEmptyDetectionState());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingProvider, setIsSavingProvider] = useState(false);

  const providers = chatSettings.providers;
  const activeProvider = useMemo(
    () => providers.find((provider) => provider.id === chatSettings.activeProviderId) ?? null,
    [chatSettings.activeProviderId, providers],
  );

  const inputClassName = `${idePopupInputClassName} !rounded-lg !px-3 !py-2`;
  const selectClassName = `${idePopupNativeSelectClassName} !rounded-lg !px-3 !py-2`;
  const secondaryButtonClassName = `${idePopupSecondaryButtonClassName} h-9 rounded-lg px-3`;
  const primaryButtonClassName = `${idePopupActionButtonClassName('primary')} h-9 min-w-0 rounded-lg px-3`;
  const emptyStateClassName = `${idePopupEmptyStateClassName} px-5 py-8 text-center`;
  const mutedBadgeClassName = 'rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_78%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]';
  const compactSwitchRootClassName = 'relative h-6 w-10 flex-shrink-0 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]';
  const compactSwitchThumbClassName = 'block h-5 w-5 translate-x-0.5 rounded-full bg-[color-mix(in_srgb,rgb(var(--background))_92%,transparent)] shadow-sm transition-transform data-[state=checked]:translate-x-[18px]';
  const detectedModels = providerDetection.result?.detectedModels ?? [];
  const hasDetectedModels = detectedModels.length > 0;
  const manualModels = parseModels(providerForm.manualModelsText);
  const resolvedModels = hasDetectedModels ? providerForm.selectedModels : manualModels;

  const loadSettings = useCallback(async () => {
    setLoading(true);

    try {
      const response = await window.electronAPI.getSettings();
      if (response.success && response.data) {
        setChatSettings(normalizeChatSettings(response.data.chat));
        setSettingsError(null);
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
    const response = await window.electronAPI.updateSettings({
      chat: nextSettings,
    });

    if (!response?.success || !response.data) {
      throw new Error(response?.error ?? t('settings.chat.saveFailedError'));
    }

    const persistedChatSettings = normalizeChatSettings(response.data.chat);
    setChatSettings(persistedChatSettings);
    setSettingsError(null);
    notifyWorkspaceSettingsUpdated({
      chat: persistedChatSettings,
    });

    return persistedChatSettings;
  }, [t]);

  const closeProviderDialog = useCallback(() => {
    if (isSavingProvider || providerDetection.isDetecting) {
      return;
    }

    setDialogOpen(false);
    setProviderForm(createEmptyProviderForm());
    setProviderDetection(createEmptyDetectionState());
    setFormError(null);
  }, [isSavingProvider, providerDetection.isDetecting]);

  const handleAddProvider = useCallback(() => {
    setDialogOpen(true);
    setProviderForm(createEmptyProviderForm());
    setProviderDetection(createEmptyDetectionState());
    setFormError(null);
    setSettingsError(null);
  }, []);

  const handleEditProvider = useCallback((provider: LLMProviderConfig) => {
    setDialogOpen(true);
    setProviderForm(createProviderForm(provider));
    setProviderDetection(createEmptyDetectionState());
    setFormError(null);
    setSettingsError(null);
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

    try {
      await persistChatSettings(nextSettings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to delete chat provider:', error);
      setSettingsError(message);
    }
  }, [chatSettings, persistChatSettings, providers]);

  const validateProviderForm = useCallback((requireName: boolean) => {
    const providerName = providerForm.name.trim();
    const baseUrl = providerForm.baseUrl.trim();
    const apiKey = providerForm.apiKey.trim();

    if (requireName && !providerName) {
      return t('settings.chat.providerNameRequiredError');
    }

    if (!apiKey) {
      return t('settings.chat.apiKeyRequiredError');
    }

    if (baseUrl && !isValidHttpUrl(baseUrl)) {
      return t('settings.chat.baseUrlInvalidError');
    }

    if (isHttpUrl(apiKey)) {
      return t('settings.chat.apiKeyInvalidError');
    }

    return null;
  }, [providerForm.apiKey, providerForm.baseUrl, providerForm.name, t]);

  const handleProviderFieldChange = useCallback(<K extends keyof ProviderDialogFormState>(
    field: K,
    value: ProviderDialogFormState[K],
  ) => {
    setProviderForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (field === 'baseUrl' || field === 'apiKey') {
      setProviderDetection(createEmptyDetectionState());
    }

    setFormError(null);
    setSettingsError(null);
  }, []);

  const handleManualModelsChange = useCallback((value: string) => {
    setProviderForm((current) => {
      const nextModels = parseModels(value);
      const requestedDefaultModel = current.defaultModel.trim();

      return {
        ...current,
        manualModelsText: value,
        defaultModel: requestedDefaultModel && nextModels.includes(requestedDefaultModel)
          ? requestedDefaultModel
          : nextModels[0] ?? '',
      };
    });
    setFormError(null);
  }, []);

  const handleToggleDetectedModel = useCallback((model: string, checked: boolean) => {
    setProviderForm((current) => {
      const nextSelectedModels = checked
        ? Array.from(new Set([...current.selectedModels, model]))
        : current.selectedModels.filter((candidate) => candidate !== model);
      const requestedDefaultModel = current.defaultModel.trim();

      return {
        ...current,
        selectedModels: nextSelectedModels,
        defaultModel: requestedDefaultModel && nextSelectedModels.includes(requestedDefaultModel)
          ? requestedDefaultModel
          : nextSelectedModels[0] ?? '',
      };
    });
    setFormError(null);
  }, []);

  const handleDetectProvider = useCallback(async () => {
    const validationError = validateProviderForm(false);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setProviderDetection({
      isDetecting: true,
      hasAttempted: true,
      result: null,
      error: null,
    });
    setFormError(null);
    setSettingsError(null);

    try {
      const response = await window.electronAPI.validateChatProvider({
        baseUrl: providerForm.baseUrl.trim() || undefined,
        apiKey: providerForm.apiKey.trim(),
      });

      if (!response?.success || !response.data) {
        throw new Error(response?.error ?? t('settings.chat.validationFailedError'));
      }

      const detection = response.data;
      setProviderForm((current) => {
        if (detection.detectedModels.length === 0) {
          const currentManualModels = parseModels(current.manualModelsText);
          const requestedDefaultModel = current.defaultModel.trim();

          return {
            ...current,
            baseUrl: detection.normalizedBaseUrl ?? current.baseUrl.trim(),
            defaultModel: requestedDefaultModel && currentManualModels.includes(requestedDefaultModel)
              ? requestedDefaultModel
              : currentManualModels[0] ?? '',
          };
        }

        const detectedModelSet = new Set(detection.detectedModels);
        const preservedModels = current.selectedModels.filter((model) => detectedModelSet.has(model));
        const nextSelectedModels = preservedModels.length > 0
          ? preservedModels
          : detection.detectedModels;
        const requestedDefaultModel = current.defaultModel.trim();

        return {
          ...current,
          baseUrl: detection.normalizedBaseUrl ?? current.baseUrl.trim(),
          selectedModels: nextSelectedModels,
          defaultModel: requestedDefaultModel && nextSelectedModels.includes(requestedDefaultModel)
            ? requestedDefaultModel
            : nextSelectedModels[0] ?? '',
        };
      });
      setProviderDetection({
        isDetecting: false,
        hasAttempted: true,
        result: detection,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to detect chat provider:', error);
      setProviderDetection({
        isDetecting: false,
        hasAttempted: true,
        result: null,
        error: message,
      });
      setFormError(message);
    }
  }, [providerForm.apiKey, providerForm.baseUrl, t, validateProviderForm]);

  const handleSaveProvider = useCallback(async () => {
    const validationError = validateProviderForm(true);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!providerDetection.result) {
      setFormError(t('settings.chat.detectRequiredError'));
      return;
    }

    const providerName = providerForm.name.trim();
    const apiKey = providerForm.apiKey.trim();
    const models = hasDetectedModels
      ? providerForm.selectedModels
      : parseModels(providerForm.manualModelsText);

    if (models.length === 0) {
      setFormError(t('settings.chat.modelsRequiredError'));
      return;
    }

    const requestedDefaultModel = providerForm.defaultModel.trim();
    const defaultModel = requestedDefaultModel && models.includes(requestedDefaultModel)
      ? requestedDefaultModel
      : models[0];

    setIsSavingProvider(true);
    setFormError(null);
    setSettingsError(null);

    try {
      const validationResponse = await window.electronAPI.validateChatProvider({
        type: providerDetection.result.resolvedType,
        baseUrl: (providerDetection.result.normalizedBaseUrl ?? providerForm.baseUrl.trim()) || undefined,
        apiKey,
        model: defaultModel,
      });

      if (!validationResponse?.success || !validationResponse.data) {
        throw new Error(validationResponse?.error ?? t('settings.chat.validationFailedError'));
      }

      const resolvedType = validationResponse.data.resolvedType;
      const resolvedBaseUrl = validationResponse.data.normalizedBaseUrl;
      const resolvedWireApi = resolvedType === 'openai-compatible'
        ? (
            validationResponse.data.resolvedWireApi
            ?? resolveLLMProviderWireApi({
              type: resolvedType,
              baseUrl: resolvedBaseUrl,
              wireApi: providerDetection.result.resolvedWireApi,
            })
          )
        : undefined;

      const providerId = providerForm.id ?? uuidv4();
      const nextProvider: LLMProviderConfig = {
        id: providerId,
        type: resolvedType,
        name: providerName,
        baseUrl: resolvedBaseUrl,
        wireApi: resolvedWireApi ?? undefined,
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
      closeProviderDialog();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to save chat provider:', error);
      setFormError(message);
    } finally {
      setIsSavingProvider(false);
    }
  }, [
    chatSettings,
    closeProviderDialog,
    hasDetectedModels,
    persistChatSettings,
    providerDetection.result,
    providerForm.apiKey,
    providerForm.baseUrl,
    providerForm.defaultModel,
    providerForm.id,
    providerForm.manualModelsText,
    providerForm.name,
    providerForm.selectedModels,
    providers,
    t,
    validateProviderForm,
  ]);

  const handleSystemPromptBlur = useCallback(async (event: React.FocusEvent<HTMLTextAreaElement>) => {
    try {
      await persistChatSettings({
        ...chatSettings,
        defaultSystemPrompt: event.target.value,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to update default system prompt:', error);
      setSettingsError(message);
    }
  }, [chatSettings, persistChatSettings]);

  const handleWorkspaceInstructionsBlur = useCallback(async (event: React.FocusEvent<HTMLTextAreaElement>) => {
    try {
      await persistChatSettings({
        ...chatSettings,
        workspaceInstructions: event.target.value,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to update workspace instructions:', error);
      setSettingsError(message);
    }
  }, [chatSettings, persistChatSettings]);

  const handleContextFilesBlur = useCallback(async (event: React.FocusEvent<HTMLTextAreaElement>) => {
    try {
      await persistChatSettings({
        ...chatSettings,
        contextFilePaths: event.target.value
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to update chat context files:', error);
      setSettingsError(message);
    }
  }, [chatSettings, persistChatSettings]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {settingsError && (
        <div className="rounded-xl border border-[rgb(var(--error)/0.2)] bg-[rgb(var(--error)/0.08)] px-4 py-3 text-sm text-[rgb(var(--error))]">
          {settingsError}
        </div>
      )}

      <CompactSettingsSection
        title={t('settings.chat.defaultsTitle')}
        help={t('settings.chat.defaultsDescription')}
        icon={<SlidersHorizontal size={15} />}
        contentClassName="overflow-hidden"
      >
        <CompactSettingRow
          label={t('settings.chat.systemPromptLabel')}
          help={t('settings.chat.systemPromptPlaceholder')}
        >
          <textarea
            defaultValue={chatSettings.defaultSystemPrompt ?? ''}
            onBlur={handleSystemPromptBlur}
            className={`${inputClassName} min-h-[120px] max-w-[720px] resize-y`}
            placeholder={t('settings.chat.systemPromptPlaceholder')}
          />
        </CompactSettingRow>

        <CompactSettingRow
          label={t('settings.chat.workspaceInstructionsLabel')}
          help={t('settings.chat.workspaceInstructionsDescription')}
        >
          <textarea
            defaultValue={chatSettings.workspaceInstructions ?? ''}
            onBlur={handleWorkspaceInstructionsBlur}
            className={`${inputClassName} min-h-[120px] max-w-[720px] resize-y`}
            placeholder={t('settings.chat.workspaceInstructionsPlaceholder')}
          />
        </CompactSettingRow>

        <CompactSettingRow
          label={t('settings.chat.contextFilesLabel')}
          help={t('settings.chat.contextFilesDescription')}
        >
          <textarea
            defaultValue={(chatSettings.contextFilePaths ?? []).join('\n')}
            onBlur={handleContextFilesBlur}
            className={`${inputClassName} min-h-[120px] max-w-[720px] resize-y font-mono text-xs`}
            placeholder={t('settings.chat.contextFilesPlaceholder')}
          />
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
              }).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                console.error('Failed to update command security setting:', error);
                setSettingsError(message);
              });
            }}
            className={compactSwitchRootClassName}
          >
            <Switch.Thumb className={compactSwitchThumbClassName} />
          </Switch.Root>
        </CompactSettingRow>
      </CompactSettingsSection>

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
                      {provider.type === 'openai-compatible' && (
                        <span>
                          {resolveLLMProviderWireApi(provider) === 'responses'
                            ? t('settings.chat.protocolResponses')
                            : t('settings.chat.protocolChatCompletions')}
                        </span>
                      )}
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
      </CompactSettingsSection>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeProviderDialog();
          }
        }}
        title={providerForm.id ? t('settings.chat.editProviderTitle') : t('settings.chat.addProviderTitle')}
        description={t('settings.chat.providerDialogDescription')}
        contentClassName="max-w-3xl"
        showCloseButton
        closeLabel={t('common.close')}
        overlayStyle={{ zIndex: 10020 }}
        contentStyle={{ zIndex: 10021 }}
      >
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_42%,transparent)]">
            <CompactSettingRow
              label={t('settings.chat.providerNameLabel')}
              htmlFor="chat-provider-name"
            >
              <input
                id="chat-provider-name"
                value={providerForm.name}
                onChange={(event) => handleProviderFieldChange('name', event.target.value)}
                placeholder={t('settings.chat.providerNamePlaceholder')}
                className={`max-w-[520px] ${inputClassName}`}
              />
            </CompactSettingRow>

            <CompactSettingRow
              label={t('settings.chat.baseUrlLabel')}
              help={t('settings.chat.baseUrlAutoHint')}
              htmlFor="chat-provider-base-url"
            >
              <input
                id="chat-provider-base-url"
                value={providerForm.baseUrl}
                onChange={(event) => handleProviderFieldChange('baseUrl', event.target.value)}
                placeholder={t('settings.chat.baseUrlPlaceholder')}
                className={`max-w-[520px] ${inputClassName}`}
              />
            </CompactSettingRow>

            <CompactSettingRow
              label={t('settings.chat.apiKeyLabel')}
              htmlFor="chat-provider-api-key"
            >
              <input
                id="chat-provider-api-key"
                value={providerForm.apiKey}
                onChange={(event) => handleProviderFieldChange('apiKey', event.target.value)}
                placeholder={t('settings.chat.apiKeyPlaceholder')}
                className={`max-w-[520px] ${inputClassName}`}
              />
            </CompactSettingRow>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                void handleDetectProvider();
              }}
              disabled={providerDetection.isDetecting || isSavingProvider}
              className={secondaryButtonClassName}
            >
              {providerDetection.isDetecting ? t('settings.chat.detectingProvider') : t('settings.chat.detectProvider')}
            </button>
          </div>

          {providerDetection.result && (
            <div className="space-y-4">
              <div className="rounded-[14px] border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--card))_78%,transparent)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[rgb(var(--foreground))]">{t('settings.chat.detectedSummaryTitle')}</span>
                  <span className={mutedBadgeClassName}>
                    {providerDetection.result.resolvedType === 'anthropic'
                      ? t('settings.chat.providerTypeAnthropic')
                      : t('settings.chat.providerTypeOpenAICompatible')}
                  </span>
                  {providerDetection.result.resolvedType === 'openai-compatible' && providerDetection.result.resolvedWireApi && (
                    <span className={mutedBadgeClassName}>
                      {providerDetection.result.resolvedWireApi === 'responses'
                        ? t('settings.chat.protocolResponses')
                        : t('settings.chat.protocolChatCompletions')}
                    </span>
                  )}
                </div>
                {providerDetection.result.normalizedBaseUrl && (
                  <p className="mt-2 break-all font-mono text-xs text-[rgb(var(--muted-foreground))]">
                    {providerDetection.result.normalizedBaseUrl}
                  </p>
                )}
              </div>

              {hasDetectedModels ? (
                <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_42%,transparent)]">
                  <CompactSettingRow
                    label={t('settings.chat.detectedModelsLabel')}
                    help={t('settings.chat.detectedModelsHint')}
                    controlClassName="items-stretch"
                  >
                    <div className="w-full max-w-[520px] space-y-3">
                      <div className="max-h-[240px] overflow-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))]/40 p-2">
                        <div className="space-y-1.5">
                          {detectedModels.map((model) => {
                            const checked = providerForm.selectedModels.includes(model);

                            return (
                              <label
                                key={model}
                                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))]"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => handleToggleDetectedModel(model, event.target.checked)}
                                  className="h-4 w-4 rounded border-[rgb(var(--border))]"
                                />
                                <span className="min-w-0 break-all">{model}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <select
                        aria-label={t('settings.chat.defaultModelLabel')}
                        value={providerForm.defaultModel}
                        onChange={(event) => handleProviderFieldChange('defaultModel', event.target.value)}
                        className={`w-full ${selectClassName}`}
                      >
                        {resolvedModels.length === 0 ? (
                          <option value="">{t('settings.chat.defaultModelPlaceholder')}</option>
                        ) : (
                          resolvedModels.map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))
                        )}
                      </select>
                    </div>
                  </CompactSettingRow>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_42%,transparent)]">
                  {providerDetection.result.modelListError && (
                    <div className="border-b border-[rgb(var(--border))] px-4 py-3 text-sm leading-6 text-[rgb(var(--muted-foreground))]">
                      {t('settings.chat.modelListUnavailable', { error: providerDetection.result.modelListError })}
                    </div>
                  )}

                  <CompactSettingRow
                    label={t('settings.chat.manualModelsFallbackLabel')}
                    help={t('settings.chat.manualModelsFallbackHint')}
                    htmlFor="chat-provider-models"
                    controlClassName="items-stretch"
                  >
                    <textarea
                      id="chat-provider-models"
                      value={providerForm.manualModelsText}
                      onChange={(event) => handleManualModelsChange(event.target.value)}
                      placeholder={t('settings.chat.modelsPlaceholder')}
                      className={`min-h-[108px] max-w-[520px] ${inputClassName} leading-6`}
                    />
                  </CompactSettingRow>

                  <CompactSettingRow
                    label={t('settings.chat.defaultModelLabel')}
                    help={t('settings.chat.defaultModelPlaceholder')}
                    htmlFor="chat-provider-default-model"
                  >
                    <input
                      id="chat-provider-default-model"
                      value={providerForm.defaultModel}
                      onChange={(event) => handleProviderFieldChange('defaultModel', event.target.value)}
                      placeholder={t('settings.chat.defaultModelPlaceholder')}
                      className={`max-w-[520px] ${inputClassName}`}
                    />
                  </CompactSettingRow>
                </div>
              )}
            </div>
          )}

          {providerDetection.hasAttempted && providerDetection.error && (
            <div className="rounded-xl border border-[rgb(var(--error)/0.2)] bg-[rgb(var(--error)/0.08)] px-4 py-3 text-sm text-[rgb(var(--error))]">
              {providerDetection.error}
            </div>
          )}

          {formError && !providerDetection.error && (
            <div className="rounded-xl border border-[rgb(var(--error)/0.2)] bg-[rgb(var(--error)/0.08)] px-4 py-3 text-sm text-[rgb(var(--error))]">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeProviderDialog}
              disabled={isSavingProvider || providerDetection.isDetecting}
              className={secondaryButtonClassName}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSaveProvider();
              }}
              disabled={isSavingProvider || providerDetection.isDetecting}
              className={primaryButtonClassName}
            >
              {isSavingProvider ? t('common.validating') : t('common.save')}
            </button>
          </div>
        </div>
      </Dialog>

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
              }).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                console.error('Failed to update active chat provider:', error);
                setSettingsError(message);
              });
            }}
            className={selectClassName}
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
              }).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                console.error('Failed to update chat command security setting:', error);
                setSettingsError(message);
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
