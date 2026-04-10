import { describe, expect, it } from 'vitest';
import { DEFAULT_BROWSER_URL, isAllowedBrowserUrl, sanitizeBrowserUrl } from '../browserUrls';
import { normalizeBrowserInput } from '../../../renderer/utils/browserPane';

describe('browserUrls', () => {
  it('allows about:blank and http(s) urls', () => {
    expect(isAllowedBrowserUrl(DEFAULT_BROWSER_URL)).toBe(true);
    expect(isAllowedBrowserUrl('https://example.com')).toBe(true);
    expect(isAllowedBrowserUrl('http://localhost:3000')).toBe(true);
  });

  it('rejects non-http protocols', () => {
    expect(isAllowedBrowserUrl('file:///tmp/demo.html')).toBe(false);
    expect(isAllowedBrowserUrl('javascript:alert(1)')).toBe(false);
  });

  it('sanitizes unsupported urls back to about:blank', () => {
    expect(sanitizeBrowserUrl('file:///tmp/demo.html')).toBe(DEFAULT_BROWSER_URL);
    expect(sanitizeBrowserUrl('not a url')).toBe(DEFAULT_BROWSER_URL);
  });

  it('normalizes unsupported explicit protocols into a search query', () => {
    expect(normalizeBrowserInput('file:///tmp/demo.html')).toBe(
      'https://duckduckgo.com/?q=file%3A%2F%2F%2Ftmp%2Fdemo.html'
    );
    expect(normalizeBrowserInput('javascript:alert(1)')).toBe(
      'https://duckduckgo.com/?q=javascript%3Aalert(1)'
    );
  });
});
