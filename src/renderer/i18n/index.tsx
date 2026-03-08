import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { AppLanguage, DEFAULT_LANGUAGE, normalizeLanguage } from '../../shared/i18n';
import { enUSMessages, TranslationKey, zhCNMessages } from './messages';

type TranslationParams = Record<string, string | number>;

const messages = {
  'zh-CN': zhCNMessages,
  'en-US': enUSMessages,
} as const;

const dateFnsLocales = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const;

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''));
}

export function translateMessage(language: AppLanguage, key: TranslationKey, params?: TranslationParams): string {
  const message = messages[language][key] ?? zhCNMessages[key] ?? key;
  return interpolate(message, params);
}

export function formatRelativeTime(date: Date | string, language: AppLanguage): string {
  const timeString = formatDistanceToNow(new Date(date), {
    addSuffix: true,
    locale: dateFnsLocales[language],
  });

  if (language === 'zh-CN') {
    return timeString.replace(/不到|大约/g, '').trim();
  }

  return timeString;
}

interface I18nContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const noop = async () => {};

const defaultContextValue: I18nContextValue = {
  language: DEFAULT_LANGUAGE,
  setLanguage: noop,
  t: (key, params) => translateMessage(DEFAULT_LANGUAGE, key, params),
};

const I18nContext = createContext<I18nContextValue>(defaultContextValue);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let disposed = false;

    const loadLanguage = async () => {
      try {
        const response = await window.electronAPI?.getSettings?.();
        if (!disposed && response?.success) {
          setLanguageState(normalizeLanguage(response.data?.language));
        }
      } catch (error) {
        console.error('Failed to load language setting:', error);
      }
    };

    void loadLanguage();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);

    try {
      await window.electronAPI?.updateSettings?.({ language: nextLanguage });
    } catch (error) {
      console.error('Failed to persist language setting:', error);
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => translateMessage(language, key, params),
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export type { TranslationKey, TranslationParams };
