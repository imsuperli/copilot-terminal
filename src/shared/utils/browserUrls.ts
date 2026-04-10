export const DEFAULT_BROWSER_URL = 'about:blank';

function hasAllowedProtocol(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

export function isAllowedBrowserUrl(rawValue: string | null | undefined): boolean {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (value === DEFAULT_BROWSER_URL) {
    return true;
  }

  try {
    return hasAllowedProtocol(new URL(value));
  } catch {
    return false;
  }
}

export function sanitizeBrowserUrl(
  rawValue: string | null | undefined,
  fallback: string = DEFAULT_BROWSER_URL,
): string {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (value === DEFAULT_BROWSER_URL) {
    return DEFAULT_BROWSER_URL;
  }

  try {
    const parsed = new URL(value);
    return hasAllowedProtocol(parsed) ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}
