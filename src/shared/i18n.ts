export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'zh-CN';

export function normalizeLanguage(language?: string | null): AppLanguage {
  if (typeof language !== 'string') {
    return DEFAULT_LANGUAGE;
  }

  const normalized = language.toLowerCase();
  return normalized.startsWith('zh') ? 'zh-CN' : 'en-US';
}
