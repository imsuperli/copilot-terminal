import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import {
  Check,
  Download,
  FolderUp,
  Globe,
  LoaderCircle,
  Plug,
  RefreshCw,
  Settings2,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { Settings, StatusLineConfig } from '../../../shared/types/workspace';
import type {
  PluginCatalogEntry,
  PluginListItem,
  PluginRequirement,
  PluginRegistry,
  PluginSettingOption,
  PluginSettingSchemaEntry,
  WorkspacePluginSettings,
} from '../../../shared/types/plugin';
import type { TranslationKey, TranslationParams } from '../../i18n';
import { useI18n } from '../../i18n';
import { notifyWorkspaceSettingsUpdated } from '../../utils/settingsEvents';

type WorkspaceEnableMode = 'inherit' | 'enabled' | 'disabled';
type PluginSettingScope = 'global' | 'workspace';
type TranslateFn = (key: TranslationKey, params?: TranslationParams) => string;
type PluginSettingDrafts = Record<string, {
  global: Record<string, unknown>;
  workspace: Record<string, unknown>;
}>;

interface PluginCenterProps {
  statusLineConfig: StatusLineConfig;
  onToggleStatusLine: (enabled: boolean) => Promise<void>;
  onStatusLineConfigChange: (updates: Partial<StatusLineConfig>) => Promise<void>;
}

export const PluginCenter: React.FC<PluginCenterProps> = ({
  statusLineConfig,
  onToggleStatusLine,
  onStatusLineConfigChange,
}) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [installedPlugins, setInstalledPlugins] = useState<PluginListItem[]>([]);
  const [catalogEntries, setCatalogEntries] = useState<PluginCatalogEntry[]>([]);
  const [pluginRegistry, setPluginRegistry] = useState<PluginRegistry>({
    schemaVersion: 1,
    plugins: {},
    globalLanguageBindings: {},
    globalPluginSettings: {},
  });
  const [workspacePluginSettings, setWorkspacePluginSettings] = useState<WorkspacePluginSettings>({});
  const [pluginSettingDrafts, setPluginSettingDrafts] = useState<PluginSettingDrafts>({});
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const loadPluginState = useCallback(async (options: { refreshCatalog?: boolean } = {}) => {
    const refreshCatalog = options.refreshCatalog === true;

    if (refreshCatalog) {
      setCatalogRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const [settingsResponse, installedResponse, registryResponse, catalogResponse] = await Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.listPlugins(),
        window.electronAPI.getPluginRegistry(),
        window.electronAPI.listPluginCatalog({ refresh: refreshCatalog }),
      ]);

      if (!settingsResponse.success || !settingsResponse.data) {
        throw new Error(settingsResponse.error || t('settings.plugins.errors.loadSettings'));
      }

      if (!installedResponse.success || !installedResponse.data) {
        throw new Error(installedResponse.error || t('settings.plugins.errors.loadInstalled'));
      }

      if (!registryResponse.success || !registryResponse.data) {
        throw new Error(registryResponse.error || t('settings.plugins.errors.loadRegistry'));
      }

      setWorkspacePluginSettings(settingsResponse.data.plugins ?? {});
      setInstalledPlugins(installedResponse.data);
      setPluginRegistry(registryResponse.data);
      setPluginSettingDrafts(buildPluginSettingDrafts(
        installedResponse.data,
        registryResponse.data,
        settingsResponse.data.plugins ?? {},
      ));

      if (catalogResponse.success && catalogResponse.data) {
        setCatalogEntries(catalogResponse.data);
      } else if (!catalogResponse.success) {
        setCatalogEntries([]);
        setErrorMessage(catalogResponse.error || t('settings.plugins.errors.loadCatalog'));
      }
    } catch (error) {
      console.error('Failed to load plugin center state:', error);
      setErrorMessage(error instanceof Error ? error.message : t('settings.plugins.errors.loadInstalled'));
    } finally {
      setLoading(false);
      setCatalogRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPluginState();
  }, [loadPluginState]);

  useEffect(() => {
    const handleRuntimeStateChanged = (_event: unknown, payload: {
      pluginId: string;
      state: PluginListItem['runtimeState'];
    }) => {
      setInstalledPlugins((currentPlugins) => currentPlugins.map((plugin) => (
        plugin.id === payload.pluginId
          ? {
              ...plugin,
              runtimeState: payload.state,
              health: payload.state === 'error'
                ? 'error'
                : payload.state === 'running' && plugin.health === 'error'
                  ? 'ok'
                  : plugin.health,
            }
          : plugin
      )));
    };

    window.electronAPI.onPluginRuntimeStateChanged(handleRuntimeStateChanged);

    return () => {
      window.electronAPI.offPluginRuntimeStateChanged(handleRuntimeStateChanged);
    };
  }, []);

  const availableCatalogEntries = useMemo(() => {
    const installedPluginIds = new Set(installedPlugins.map((plugin) => plugin.id));
    return catalogEntries.filter((entry) => !installedPluginIds.has(entry.id));
  }, [catalogEntries, installedPlugins]);

  const availableLanguageCatalogEntries = useMemo(() => availableCatalogEntries
    .filter((entry) => (entry.languages?.length ?? 0) > 0)
    .sort((left, right) => left.name.localeCompare(right.name)), [availableCatalogEntries]);

  const languageBindingOptions = useMemo(() => {
    const languages = new Set<string>();

    for (const plugin of installedPlugins) {
      for (const language of plugin.languages ?? []) {
        languages.add(language);
      }
    }

    return Array.from(languages)
      .sort((left, right) => left.localeCompare(right))
      .map((language) => ({
        language,
        plugins: installedPlugins
          .filter((plugin) => (plugin.languages ?? []).includes(language))
          .sort((left, right) => left.name.localeCompare(right.name)),
      }));
  }, [installedPlugins]);

  const performGlobalAction = useCallback(async (
    actionKey: string,
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage?: string,
  ) => {
    setActiveActionKey(actionKey);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const response = await action();
      if (!response.success) {
        throw new Error(response.error || t('settings.plugins.errors.actionFailed'));
      }

      if (successMessage) {
        setFeedbackMessage(successMessage);
      }

      await loadPluginState();
    } catch (error) {
      console.error('Plugin action failed:', error);
      setErrorMessage(error instanceof Error ? error.message : t('settings.plugins.errors.actionFailed'));
    } finally {
      setActiveActionKey(null);
    }
  }, [loadPluginState, t]);

  const performWorkspaceAction = useCallback(async (
    actionKey: string,
    action: () => Promise<{ success: boolean; data?: Settings; error?: string }>,
    successMessage?: string,
  ) => {
    setActiveActionKey(actionKey);
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const response = await action();
      if (!response.success) {
        throw new Error(response.error || t('settings.plugins.errors.actionFailed'));
      }

      if (response.data) {
        setWorkspacePluginSettings(response.data.plugins ?? {});
        notifyWorkspaceSettingsUpdated({
          plugins: response.data.plugins ?? {},
        });
      }

      if (successMessage) {
        setFeedbackMessage(successMessage);
      }

      await loadPluginState();
    } catch (error) {
      console.error('Workspace plugin action failed:', error);
      setErrorMessage(error instanceof Error ? error.message : t('settings.plugins.errors.actionFailed'));
    } finally {
      setActiveActionKey(null);
    }
  }, [loadPluginState, t]);

  const handleInstallMarketplacePlugin = useCallback(async (pluginId: string) => {
    await performGlobalAction(
      `install:${pluginId}`,
      () => window.electronAPI.installMarketplacePlugin({ pluginId }),
      t('settings.plugins.messages.installSuccess'),
    );
  }, [performGlobalAction, t]);

  const handleInstallLocalPlugin = useCallback(async () => {
    const fileSelection = await window.electronAPI.selectPluginPackage();
    const selectedPath = fileSelection.success ? fileSelection.data : null;
    if (!selectedPath) {
      return;
    }

    await performGlobalAction(
      `install-local:${selectedPath}`,
      () => window.electronAPI.installLocalPlugin({ filePath: selectedPath }),
      t('settings.plugins.messages.installSuccess'),
    );
  }, [performGlobalAction, t]);

  const handleUpdatePlugin = useCallback(async (pluginId: string) => {
    await performGlobalAction(
      `update:${pluginId}`,
      () => window.electronAPI.updatePlugin({ pluginId }),
      t('settings.plugins.messages.updateSuccess'),
    );
  }, [performGlobalAction, t]);

  const handleUninstallPlugin = useCallback(async (pluginId: string) => {
    await performGlobalAction(
      `uninstall:${pluginId}`,
      () => window.electronAPI.uninstallPlugin({ pluginId }),
      t('settings.plugins.messages.uninstallSuccess'),
    );
  }, [performGlobalAction, t]);

  const handleSetGlobalEnabled = useCallback(async (pluginId: string, enabled: boolean) => {
    await performGlobalAction(
      `global-enabled:${pluginId}`,
      () => window.electronAPI.setPluginEnabled({ pluginId, enabled, scope: 'global' }),
      t('settings.plugins.messages.globalDefaultSaved'),
    );
  }, [performGlobalAction, t]);

  const handleSetWorkspaceMode = useCallback(async (pluginId: string, mode: WorkspaceEnableMode) => {
    const enabled = mode === 'inherit' ? null : mode === 'enabled';
    await performWorkspaceAction(
      `workspace-enabled:${pluginId}`,
      () => window.electronAPI.setPluginEnabled({ pluginId, enabled, scope: 'workspace' }),
      t('settings.plugins.messages.workspaceOverrideSaved'),
    );
  }, [performWorkspaceAction, t]);

  const handleSetLanguageBinding = useCallback(async (
    scope: PluginSettingScope,
    language: string,
    pluginId: string | null,
  ) => {
    if (scope === 'global') {
      await performGlobalAction(
        `binding:${scope}:${language}`,
        () => window.electronAPI.setPluginLanguageBinding({ scope, language, pluginId }),
        t('settings.plugins.messages.languageBindingSaved'),
      );
      return;
    }

    await performWorkspaceAction(
      `binding:${scope}:${language}`,
      () => window.electronAPI.setPluginLanguageBinding({ scope, language, pluginId }),
      t('settings.plugins.messages.languageBindingSaved'),
    );
  }, [performGlobalAction, performWorkspaceAction, t]);

  const handlePluginSettingDraftChange = useCallback((
    pluginId: string,
    scope: PluginSettingScope,
    key: string,
    value: unknown,
  ) => {
    setPluginSettingDrafts((currentDrafts) => {
      const currentPluginDrafts = currentDrafts[pluginId] ?? { global: {}, workspace: {} };
      const nextScopeValues = {
        ...currentPluginDrafts[scope],
      };

      if (value === '' || value === undefined) {
        delete nextScopeValues[key];
      } else {
        nextScopeValues[key] = value;
      }

      return {
        ...currentDrafts,
        [pluginId]: {
          ...currentPluginDrafts,
          [scope]: nextScopeValues,
        },
      };
    });
  }, []);

  const handleSavePluginSettings = useCallback(async (
    pluginId: string,
    scope: PluginSettingScope,
  ) => {
    const values = pluginSettingDrafts[pluginId]?.[scope] ?? {};

    if (scope === 'global') {
      await performGlobalAction(
        `settings:${scope}:${pluginId}`,
        () => window.electronAPI.setPluginSettings({ pluginId, scope, values }),
        t('settings.plugins.messages.pluginSettingsSaved'),
      );
      return;
    }

    await performWorkspaceAction(
      `settings:${scope}:${pluginId}`,
      () => window.electronAPI.setPluginSettings({ pluginId, scope, values }),
      t('settings.plugins.messages.pluginSettingsSaved'),
    );
  }, [performGlobalAction, performWorkspaceAction, pluginSettingDrafts, t]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-6 py-5 text-sm text-[rgb(var(--muted-foreground))]">
          {t('settings.plugins.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
              <Plug size={22} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{t('settings.plugins.title')}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">
                {t('settings.plugins.pageDescription')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadPluginState({ refreshCatalog: true })}
              disabled={catalogRefreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {catalogRefreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {t('settings.plugins.actions.refreshCatalog')}
            </button>
            <button
              type="button"
              onClick={() => void handleInstallLocalPlugin()}
              disabled={activeActionKey === 'install-local'}
              className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 py-3 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <FolderUp size={16} />
              {t('settings.plugins.actions.installLocal')}
            </button>
          </div>
        </div>

        {(feedbackMessage || errorMessage) && (
          <div className={`mt-5 rounded-[20px] border px-4 py-3 text-sm ${
            errorMessage
              ? 'border-[rgba(255,92,92,0.24)] bg-[rgba(255,92,92,0.10)] text-[rgb(255,214,214)]'
              : 'border-[rgba(168,170,88,0.24)] bg-[rgba(168,170,88,0.10)] text-[rgb(var(--primary))]'
          }`}>
            {errorMessage ?? feedbackMessage}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Globe size={18} className="text-[rgb(var(--primary))]" />
          <h3 className="text-base font-semibold text-white">{t('settings.plugins.sections.languageBindings')}</h3>
        </div>
        <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
          <p className="max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">
            {t('settings.plugins.languageBindingsDescription')}
          </p>

          {languageBindingOptions.length === 0 ? (
            <div className="mt-5 rounded-[20px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/40 px-5 py-10 text-center">
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">{t('settings.plugins.emptyBindingsTitle')}</p>
              <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.plugins.emptyBindingsDescription')}</p>
              {availableLanguageCatalogEntries.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                    {t('settings.plugins.emptyBindingsQuickInstall')}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    {availableLanguageCatalogEntries.map((entry) => (
                      <button
                        key={`empty-binding-install:${entry.id}`}
                        type="button"
                        onClick={() => void handleInstallMarketplacePlugin(entry.id)}
                        disabled={activeActionKey === `install:${entry.id}`}
                        className="inline-flex items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 py-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {activeActionKey === `install:${entry.id}`
                          ? <LoaderCircle size={16} className="animate-spin" />
                          : <Download size={16} />}
                        {entry.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {languageBindingOptions.map(({ language, plugins }) => {
                const globalBinding = pluginRegistry.globalLanguageBindings?.[language] ?? '';
                const workspaceBinding = workspacePluginSettings.languageBindings?.[language] ?? '';

                return (
                  <div
                    key={language}
                    className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">{language}</div>
                        <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
                          {plugins.map((plugin) => plugin.name).join(' / ')}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 lg:min-w-[480px]">
                        <label className="text-sm text-[rgb(var(--foreground))]">
                          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                            {t('settings.plugins.scope.global')}
                          </span>
                          <select
                            aria-label={t('settings.plugins.aria.globalLanguageBinding', { language })}
                            value={globalBinding}
                            onChange={(event) => void handleSetLanguageBinding(
                              'global',
                              language,
                              event.target.value || null,
                            )}
                            className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
                          >
                            <option value="">{t('settings.plugins.binding.none')}</option>
                            {plugins.map((plugin) => (
                              <option key={plugin.id} value={plugin.id}>{plugin.name}</option>
                            ))}
                          </select>
                        </label>

                        <label className="text-sm text-[rgb(var(--foreground))]">
                          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">
                            {t('settings.plugins.scope.workspace')}
                          </span>
                          <select
                            aria-label={t('settings.plugins.aria.workspaceLanguageBinding', { language })}
                            value={workspaceBinding || '__inherit__'}
                            onChange={(event) => void handleSetLanguageBinding(
                              'workspace',
                              language,
                              event.target.value === '__inherit__' ? null : event.target.value,
                            )}
                            className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
                          >
                            <option value="__inherit__">{t('settings.plugins.binding.useGlobal')}</option>
                            {plugins.map((plugin) => (
                              <option key={plugin.id} value={plugin.id}>{plugin.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Wrench size={18} className="text-[rgb(var(--primary))]" />
          <h3 className="text-base font-semibold text-white">{t('settings.plugins.sections.builtin')}</h3>
        </div>
        <div className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--primary))]">
                <Plug size={22} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{t('settings.statusLine.pluginName')}</h3>
                  <span className="rounded-full border border-[rgba(168,170,88,0.20)] bg-[rgba(168,170,88,0.10)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                    {t('settings.statusLine.builtInBadge')}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">
                  {t('settings.statusLine.pageDescription')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-5 py-4">
              <div>
                <div className="text-sm font-medium text-white">{t('settings.statusLine.enableTitle')}</div>
                <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{t('settings.statusLine.enableDescription')}</div>
              </div>
              <Switch.Root
                checked={statusLineConfig.enabled}
                onCheckedChange={(checked) => void onToggleStatusLine(checked)}
                className="relative h-7 w-12 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
              >
                <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            </div>
          </div>

          {statusLineConfig.enabled && (
            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                <div className="text-sm font-semibold text-white">{t('settings.statusLine.displayFormat')}</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(['full', 'compact'] as const).map((format) => (
                    <label
                      key={format}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4 transition-colors hover:bg-[rgb(var(--accent))]"
                    >
                      <input
                        type="radio"
                        name="statusline-format"
                        value={format}
                        checked={statusLineConfig.cliFormat === format && statusLineConfig.cardFormat === format}
                        onChange={() => void onStatusLineConfigChange({
                          cliFormat: format,
                          cardFormat: format,
                        })}
                        className="mt-1 h-4 w-4 text-[rgb(var(--primary))]"
                      />
                      <div>
                        <div className="text-sm font-medium text-white">
                          {format === 'full' ? t('settings.statusLine.full') : t('settings.statusLine.compact')}
                        </div>
                        <div className="mt-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2 font-mono text-xs text-[rgb(var(--muted-foreground))]">
                          {format === 'full'
                            ? 'Model: Sonnet 4.6 | Context: 45% | Cost: $0.25'
                            : 'Sonnet 4.6 • 45% • $0.25'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-5">
                <div className="text-sm font-semibold text-white">{t('settings.statusLine.displayContent')}</div>
                <div className="mt-4 space-y-3">
                  {[
                    { key: 'showContext', title: t('settings.statusLine.contextPercentage'), description: t('settings.statusLine.contextExample') },
                    { key: 'showCost', title: t('settings.statusLine.cost'), description: t('settings.statusLine.costExample') },
                    { key: 'showTime', title: t('settings.plugins.statusline.showTime'), description: t('settings.plugins.statusline.showTimeDescription') },
                    { key: 'showTokens', title: t('settings.plugins.statusline.showTokens'), description: t('settings.plugins.statusline.showTokensDescription') },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4 transition-colors hover:bg-[rgb(var(--accent))]"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(statusLineConfig[item.key as keyof StatusLineConfig])}
                        onChange={(event) => void onStatusLineConfigChange({ [item.key]: event.target.checked })}
                        className="h-4 w-4 text-[rgb(var(--primary))]"
                      />
                      <div>
                        <div className="text-sm font-medium text-white">{item.title}</div>
                        <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">{item.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Settings2 size={18} className="text-[rgb(var(--primary))]" />
          <h3 className="text-base font-semibold text-white">{t('settings.plugins.sections.installed')}</h3>
        </div>

        {installedPlugins.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/40 px-6 py-16 text-center">
            <Plug size={40} className="mx-auto text-[rgb(var(--muted-foreground))] opacity-50" />
            <p className="mt-5 text-lg font-medium text-[rgb(var(--foreground))]">{t('settings.plugins.emptyInstalledTitle')}</p>
            <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.plugins.emptyInstalledDescription')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {installedPlugins.map((plugin) => {
              const workspaceMode = getWorkspaceEnableMode(plugin.id, workspacePluginSettings);
              const globalSettingsSchema = getScopedSettingsSchemaEntries(plugin, 'global');
              const workspaceSettingsSchema = getScopedSettingsSchemaEntries(plugin, 'workspace');

              return (
                <div
                  key={plugin.id}
                  className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 transition-colors hover:border-[rgb(var(--primary))]"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{plugin.name}</h3>
                        <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]">
                          {plugin.publisher}
                        </span>
                        <span className="rounded-full border border-[rgba(168,170,88,0.20)] bg-[rgba(168,170,88,0.10)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                          {formatInstallStatus(plugin, t)}
                        </span>
                        <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]">
                          {formatPluginSource(plugin.source, t)}
                        </span>
                        {plugin.updateAvailable && (
                          <span className="rounded-full border border-[rgba(255,180,92,0.24)] bg-[rgba(255,180,92,0.12)] px-2 py-0.5 text-[11px] font-medium text-[rgb(255,220,170)]">
                            {t('settings.plugins.badges.updateAvailable')}
                          </span>
                        )}
                      </div>

                      {(plugin.description || plugin.summary) && (
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">
                          {plugin.description ?? plugin.summary}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {(plugin.languages ?? []).map((language) => (
                          <span
                            key={`${plugin.id}:${language}`}
                            className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1 text-xs text-[rgb(var(--foreground))]"
                          >
                            {language}
                          </span>
                        ))}
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-sm font-medium text-white">{t('settings.plugins.globalDefaultTitle')}</div>
                              <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
                                {t('settings.plugins.globalDefaultDescription')}
                              </div>
                            </div>
                            <Switch.Root
                              checked={plugin.enabledByDefault === true}
                              onCheckedChange={(checked) => void handleSetGlobalEnabled(plugin.id, checked)}
                              className="relative h-7 w-12 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
                            >
                              <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
                            </Switch.Root>
                          </div>
                        </div>

                        <label className="rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4 text-sm text-[rgb(var(--foreground))]">
                          <div className="text-sm font-medium text-white">{t('settings.plugins.workspaceOverrideTitle')}</div>
                          <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
                            {t('settings.plugins.workspaceOverrideDescription')}
                          </div>
                          <select
                            aria-label={t('settings.plugins.aria.workspaceMode', { plugin: plugin.name })}
                            value={workspaceMode}
                            onChange={(event) => void handleSetWorkspaceMode(
                              plugin.id,
                              event.target.value as WorkspaceEnableMode,
                            )}
                            className="mt-3 w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
                          >
                            <option value="inherit">{t('settings.plugins.workspaceMode.inherit')}</option>
                            <option value="enabled">{t('settings.plugins.workspaceMode.enabled')}</option>
                            <option value="disabled">{t('settings.plugins.workspaceMode.disabled')}</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {plugin.updateAvailable && (
                        <button
                          type="button"
                          onClick={() => void handleUpdatePlugin(plugin.id)}
                          disabled={activeActionKey === `update:${plugin.id}`}
                          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <Download size={16} />
                          {t('settings.plugins.actions.update')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleUninstallPlugin(plugin.id)}
                        disabled={activeActionKey === `uninstall:${plugin.id}`}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[rgba(255,92,92,0.14)] bg-[rgba(255,92,92,0.08)] px-4 text-sm font-medium text-[rgb(var(--muted-foreground))] transition-colors hover:border-[rgba(255,92,92,0.34)] hover:bg-[rgba(255,92,92,0.14)] hover:text-[rgb(255,214,214)] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <Trash2 size={16} />
                        {t('settings.plugins.actions.uninstall')}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-4">
                    <InfoTile label={t('settings.plugins.labels.version')} value={plugin.version ?? '--'} />
                    <InfoTile label={t('settings.plugins.labels.latestVersion')} value={plugin.latestVersion ?? '--'} />
                    <InfoTile label={t('settings.plugins.labels.runtime')} value={formatRuntimeState(plugin, t)} />
                    <InfoTile label={t('settings.plugins.labels.installPath')} value={plugin.installPath ?? '--'} mono />
                  </div>

                  {(plugin.manifest?.capabilities.some((capability) => (capability.requirements?.length ?? 0) > 0)
                    || globalSettingsSchema.length > 0
                    || workspaceSettingsSchema.length > 0) && (
                    <details className="mt-5 overflow-hidden rounded-[20px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))]">
                      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-white">
                        {t('settings.plugins.configure')}
                      </summary>
                      <div className="border-t border-[rgb(var(--border))] px-5 py-5">
                        {plugin.manifest?.capabilities.some((capability) => (capability.requirements?.length ?? 0) > 0) && (
                          <div className="mb-5 rounded-[18px] border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4">
                            <div className="text-sm font-semibold text-white">{t('settings.plugins.requirements')}</div>
                            <div className="mt-3 space-y-2 text-sm text-[rgb(var(--muted-foreground))]">
                              {plugin.manifest.capabilities.flatMap((capability) => capability.requirements ?? []).map((requirement, index) => (
                                <div key={`${plugin.id}:requirement:${index}`} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-2">
                                  {formatRequirement(requirement, t)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid gap-5 xl:grid-cols-2">
                          {renderSettingsScopeCard({
                            t,
                            plugin,
                            scope: 'global',
                            entries: globalSettingsSchema,
                            drafts: pluginSettingDrafts[plugin.id]?.global ?? {},
                            activeActionKey,
                            onChange: handlePluginSettingDraftChange,
                            onSave: handleSavePluginSettings,
                          })}
                          {renderSettingsScopeCard({
                            t,
                            plugin,
                            scope: 'workspace',
                            entries: workspaceSettingsSchema,
                            drafts: pluginSettingDrafts[plugin.id]?.workspace ?? {},
                            activeActionKey,
                            onChange: handlePluginSettingDraftChange,
                            onSave: handleSavePluginSettings,
                          })}
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Download size={18} className="text-[rgb(var(--primary))]" />
          <h3 className="text-base font-semibold text-white">{t('settings.plugins.sections.available')}</h3>
        </div>

        {availableCatalogEntries.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--secondary))]/40 px-6 py-16 text-center">
            <Plug size={40} className="mx-auto text-[rgb(var(--muted-foreground))] opacity-50" />
            <p className="mt-5 text-lg font-medium text-[rgb(var(--foreground))]">{t('settings.plugins.emptyAvailableTitle')}</p>
            <p className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.plugins.emptyAvailableDescription')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {availableCatalogEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[24px] border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 transition-colors hover:border-[rgb(var(--primary))]"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{entry.name}</h3>
                      <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--muted-foreground))]">
                        {entry.publisher}
                      </span>
                      <span className="rounded-full border border-[rgba(168,170,88,0.20)] bg-[rgba(168,170,88,0.10)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                        {t('settings.plugins.badges.marketplace')}
                      </span>
                    </div>
                    {(entry.description || entry.summary) && (
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-[rgb(var(--muted-foreground))]">
                        {entry.description ?? entry.summary}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(entry.languages ?? []).map((language) => (
                        <span
                          key={`${entry.id}:${language}`}
                          className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1 text-xs text-[rgb(var(--foreground))]"
                        >
                          {language}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleInstallMarketplacePlugin(entry.id)}
                      disabled={activeActionKey === `install:${entry.id}`}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 text-sm font-medium text-[rgb(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <Download size={16} />
                      {t('settings.plugins.actions.install')}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <InfoTile label={t('settings.plugins.labels.latestVersion')} value={entry.latestVersion} />
                  <InfoTile label={t('settings.plugins.labels.platforms')} value={String(entry.platforms.length)} />
                  <InfoTile label={t('settings.plugins.labels.homepage')} value={entry.homepage ?? '--'} mono />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

function InfoTile({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[18px] border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] p-4">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[rgb(var(--muted-foreground))]">{label}</div>
      <div className={`mt-2 break-all text-sm text-white ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function renderSettingsScopeCard({
  t,
  plugin,
  scope,
  entries,
  drafts,
  activeActionKey,
  onChange,
  onSave,
}: {
  t: TranslateFn;
  plugin: PluginListItem;
  scope: PluginSettingScope;
  entries: Array<[string, PluginSettingSchemaEntry]>;
  drafts: Record<string, unknown>;
  activeActionKey: string | null;
  onChange: (pluginId: string, scope: PluginSettingScope, key: string, value: unknown) => void;
  onSave: (pluginId: string, scope: PluginSettingScope) => Promise<void>;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-[18px] border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4">
        <div className="text-sm font-semibold text-white">
          {scope === 'global' ? t('settings.plugins.scope.global') : t('settings.plugins.scope.workspace')}
        </div>
        <div className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">{t('settings.plugins.noSettings')}</div>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">
            {scope === 'global' ? t('settings.plugins.scope.global') : t('settings.plugins.scope.workspace')}
          </div>
          <div className="mt-1 text-xs text-[rgb(var(--muted-foreground))]">
            {scope === 'global' ? t('settings.plugins.scope.globalDescription') : t('settings.plugins.scope.workspaceDescription')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onSave(plugin.id, scope)}
          disabled={activeActionKey === `settings:${scope}:${plugin.id}`}
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-4 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--accent))] hover:text-[rgb(var(--primary))] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Check size={16} />
          {t('common.save')}
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {entries.map(([key, entry]) => (
          <label key={`${plugin.id}:${scope}:${key}`} className="block text-sm text-[rgb(var(--foreground))]">
            <span className="mb-2 block text-sm font-medium text-white">{entry.title}</span>
            {entry.description && (
              <span className="mb-2 block text-xs leading-5 text-[rgb(var(--muted-foreground))]">{entry.description}</span>
            )}
            {renderSettingControl({
              entry,
              value: drafts[key],
              onChange: (value) => onChange(plugin.id, scope, key, value),
            })}
          </label>
        ))}
      </div>
    </div>
  );
}

function renderSettingControl({
  entry,
  value,
  onChange,
}: {
  entry: PluginSettingSchemaEntry;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (entry.type === 'boolean') {
    return (
      <label className="flex items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3">
        <span className="text-sm text-[rgb(var(--foreground))]">{String(value ?? entry.defaultValue ?? false)}</span>
        <Switch.Root
          checked={Boolean(value ?? entry.defaultValue ?? false)}
          onCheckedChange={(checked) => onChange(checked)}
          className="relative h-7 w-12 rounded-full bg-[rgb(var(--muted))] transition-colors data-[state=checked]:bg-[rgb(var(--primary))]"
        >
          <Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </label>
    );
  }

  if (entry.type === 'enum') {
    const resolvedValue = normalizeSettingPrimitive(value ?? entry.defaultValue ?? entry.options?.[0]?.value);

    return (
      <select
        value={stringifySettingValue(resolvedValue)}
        onChange={(event) => onChange(parseSettingOptionValue(event.target.value, entry.options ?? []))}
        className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
      >
        {(entry.options ?? []).map((option) => (
          <option key={`${option.label}:${stringifySettingValue(option.value)}`} value={stringifySettingValue(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (entry.type === 'number') {
    const numericValue = typeof value === 'number'
      ? value
      : typeof entry.defaultValue === 'number'
        ? entry.defaultValue
        : '';

    return (
      <input
        type="number"
        value={numericValue}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        placeholder={entry.placeholder}
        className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
      />
    );
  }

  return (
    <input
      type="text"
      value={typeof value === 'string'
        ? value
        : typeof entry.defaultValue === 'string'
          ? entry.defaultValue
          : ''}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      placeholder={entry.placeholder}
      className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--secondary))] px-4 py-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))]"
    />
  );
}

function stringifySettingValue(value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return '';
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseSettingOptionValue(rawValue: string, options: PluginSettingOption[]): string | number | boolean {
  const matchedOption = options.find((option) => stringifySettingValue(option.value) === rawValue);
  return matchedOption?.value ?? rawValue;
}

function normalizeSettingPrimitive(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

function buildPluginSettingDrafts(
  installedPlugins: PluginListItem[],
  pluginRegistry: PluginRegistry,
  workspacePluginSettings: WorkspacePluginSettings,
): PluginSettingDrafts {
  return Object.fromEntries(
    installedPlugins.map((plugin) => {
      const schema = plugin.manifest?.settingsSchema ?? {};
      const globalDefaults = buildDefaultScopeValues(schema, 'global');
      const workspaceDefaults = buildDefaultScopeValues(schema, 'workspace');

      return [
        plugin.id,
        {
          global: {
            ...globalDefaults,
            ...(pluginRegistry.globalPluginSettings?.[plugin.id] ?? {}),
          },
          workspace: {
            ...workspaceDefaults,
            ...(workspacePluginSettings.pluginSettings?.[plugin.id] ?? {}),
          },
        },
      ];
    }),
  );
}

function buildDefaultScopeValues(
  schema: Record<string, PluginSettingSchemaEntry>,
  scope: PluginSettingScope,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([, entry]) => entry.scope === scope && entry.defaultValue !== undefined)
      .map(([key, entry]) => [key, entry.defaultValue]),
  );
}

function getWorkspaceEnableMode(
  pluginId: string,
  workspacePluginSettings: WorkspacePluginSettings,
): WorkspaceEnableMode {
  if ((workspacePluginSettings.disabledPluginIds ?? []).includes(pluginId)) {
    return 'disabled';
  }

  if ((workspacePluginSettings.enabledPluginIds ?? []).includes(pluginId)) {
    return 'enabled';
  }

  return 'inherit';
}

function getScopedSettingsSchemaEntries(
  plugin: PluginListItem,
  scope: PluginSettingScope,
): Array<[string, PluginSettingSchemaEntry]> {
  return Object.entries(plugin.manifest?.settingsSchema ?? {})
    .filter(([, entry]) => entry.scope === scope);
}

function formatPluginSource(
  source: PluginListItem['source'],
  t: TranslateFn,
): string {
  if (source === 'builtin') {
    return t('settings.plugins.source.builtin');
  }

  if (source === 'marketplace') {
    return t('settings.plugins.source.marketplace');
  }

  return t('settings.plugins.source.sideload');
}

function formatInstallStatus(
  plugin: PluginListItem,
  t: TranslateFn,
): string {
  if (plugin.installStatus === 'error' || plugin.health === 'error') {
    return t('settings.plugins.status.error');
  }

  if (plugin.updateAvailable) {
    return t('settings.plugins.status.updateAvailable');
  }

  if (plugin.installStatus === 'installed') {
    return t('settings.plugins.status.installed');
  }

  if (plugin.installStatus === 'installing') {
    return t('settings.plugins.status.installing');
  }

  if (plugin.installStatus === 'updating') {
    return t('settings.plugins.status.updating');
  }

  return t('settings.plugins.status.unknown');
}

function formatRuntimeState(
  plugin: PluginListItem,
  t: TranslateFn,
): string {
  switch (plugin.runtimeState) {
    case 'starting':
      return t('settings.plugins.runtime.starting');
    case 'running':
      return t('settings.plugins.runtime.running');
    case 'stopped':
      return t('settings.plugins.runtime.stopped');
    case 'error':
      return t('settings.plugins.runtime.error');
    case 'idle':
    default:
      return t('settings.plugins.runtime.idle');
  }
}

function formatRequirement(
  requirement: PluginRequirement,
  t: TranslateFn,
): string {
  const parts: string[] = [requirement.type];

  if (requirement.version) {
    parts.push(requirement.version);
  }

  if (requirement.command) {
    parts.push(`command=${requirement.command}`);
  }

  if (requirement.envVar) {
    parts.push(`env=${requirement.envVar}`);
  }

  if (requirement.optional) {
    parts.push(t('settings.plugins.requirementOptional'));
  }

  return parts.join(' • ');
}
