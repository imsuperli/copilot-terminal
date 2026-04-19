import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE_SETTINGS, normalizeAppearanceSettings } from '../appearance';

describe('appearance settings', () => {
  it('returns defaults when no appearance settings are provided', () => {
    expect(normalizeAppearanceSettings(undefined)).toEqual(DEFAULT_APPEARANCE_SETTINGS);
  });

  it('clamps numeric values and falls back from unknown enum values', () => {
    const normalized = normalizeAppearanceSettings({
      themeId: 'unknown' as never,
      terminalOpacity: 0.1,
      readabilityMode: 'invalid' as never,
      skin: {
        kind: 'unknown' as never,
        gradient: '',
        dim: 9,
        blur: -1,
      },
    });

    expect(normalized.themeId).toBe(DEFAULT_APPEARANCE_SETTINGS.themeId);
    expect(normalized.readabilityMode).toBe(DEFAULT_APPEARANCE_SETTINGS.readabilityMode);
    expect(normalized.terminalOpacity).toBe(0.52);
    expect(normalized.skin.kind).toBe(DEFAULT_APPEARANCE_SETTINGS.skin.kind);
    expect(normalized.skin.gradient).toBe(DEFAULT_APPEARANCE_SETTINGS.skin.gradient);
    expect(normalized.skin.dim).toBe(0.92);
    expect(normalized.skin.blur).toBe(0);
  });
});
