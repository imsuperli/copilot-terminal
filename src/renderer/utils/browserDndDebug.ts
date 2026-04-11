function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function logBrowserDnd(scope: string, payload?: Record<string, unknown>): void {
  if (typeof console === 'undefined') {
    return;
  }

  if (payload && Object.keys(payload).length > 0) {
    console.log(`[BrowserDnd] ${scope} ${safeSerialize(payload)}`);
    return;
  }

  console.log(`[BrowserDnd] ${scope}`);
}
