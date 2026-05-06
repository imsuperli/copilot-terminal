import type { SSHRemoteLocaleMode } from '../../../shared/types/ssh';

type SSHLocaleConfig = {
  remoteLocaleMode?: SSHRemoteLocaleMode;
  remoteLocale?: string;
};

const UTF8_FALLBACK_LOCALES = ['en_US.UTF-8', 'C.UTF-8'] as const;
const UTF8_PROCESS_ENV_KEYS = ['LC_ALL', 'LC_CTYPE', 'LANG'] as const;

export function buildSSHLocaleEnvironment(
  ssh?: SSHLocaleConfig,
  environment: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const locale = resolveSSHLocaleValue(ssh, environment);
  if (!locale) {
    return {};
  }

  return {
    LANG: locale,
    LC_CTYPE: locale,
    LC_ALL: locale,
  };
}

export function buildSSHLocaleExportCommand(
  ssh?: SSHLocaleConfig,
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  const localeEnvironment = buildSSHLocaleEnvironment(ssh, environment);
  const entries = Object.entries(localeEnvironment);
  if (entries.length === 0) {
    return null;
  }

  return `export ${entries.map(([key, value]) => `${key}=${shellEscape(value)}`).join(' ')}`;
}

export function wrapExecCommandWithSSHLocale(
  command: string,
  ssh?: SSHLocaleConfig,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const localeExportCommand = buildSSHLocaleExportCommand(ssh, environment);
  if (!localeExportCommand) {
    return command;
  }

  return `sh -lc ${shellEscape(`${localeExportCommand}\n${command}`)}`;
}

function resolveSSHLocaleValue(
  ssh?: SSHLocaleConfig,
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const remoteLocaleMode = ssh?.remoteLocaleMode;
  const customLocale = normalizeOptionalString(ssh?.remoteLocale);

  if (remoteLocaleMode === 'custom' && customLocale) {
    return customLocale;
  }

  for (const key of UTF8_PROCESS_ENV_KEYS) {
    const candidate = normalizeOptionalString(environment[key]);
    if (candidate && isUtf8Locale(candidate)) {
      return candidate;
    }
  }

  return UTF8_FALLBACK_LOCALES[0];
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isUtf8Locale(value: string): boolean {
  return /utf-?8/i.test(value);
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
