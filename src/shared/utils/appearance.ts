import type {
  AppearanceReadabilityMode,
  AppearanceSettings,
  AppearanceSkinMotionMode,
  AppearanceSkinKind,
  AppearanceSkinPresetId,
  AppearanceSkinSettings,
} from '../types/appearance';

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  skin: {
    presetId: 'midnight',
    kind: 'gradient',
    gradient: 'radial-gradient(circle at 15% 12%, rgba(57, 114, 255, 0.30), transparent 28%), radial-gradient(circle at 82% 18%, rgba(245, 158, 11, 0.18), transparent 24%), linear-gradient(135deg, #05070a 0%, #111317 48%, #060607 100%)',
    dim: 0.52,
    blur: 0,
    motion: 'none',
  },
  terminalOpacity: 0.88,
  readabilityMode: 'balanced',
  reduceMotion: true,
};

function normalizeSkinKind(value: unknown): AppearanceSkinKind {
  return value === 'none' || value === 'image' || value === 'gradient' ? value : DEFAULT_APPEARANCE_SETTINGS.skin.kind;
}

function normalizeSkinPresetId(value: unknown): AppearanceSkinPresetId {
  return value === 'obsidian'
    || value === 'midnight'
    || value === 'aurora'
    || value === 'paper'
    || value === 'custom'
    ? value
    : DEFAULT_APPEARANCE_SETTINGS.skin.presetId;
}

function normalizeSkinMotionMode(value: unknown): AppearanceSkinMotionMode {
  return value === 'ambient' || value === 'none' ? value : DEFAULT_APPEARANCE_SETTINGS.skin.motion;
}

function normalizeReadabilityMode(value: unknown): AppearanceReadabilityMode {
  return value === 'readability' || value === 'immersive' || value === 'balanced'
    ? value
    : DEFAULT_APPEARANCE_SETTINGS.readabilityMode;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeSkin(value: Partial<AppearanceSkinSettings> | undefined): AppearanceSkinSettings {
  const defaults = DEFAULT_APPEARANCE_SETTINGS.skin;

  return {
    presetId: normalizeSkinPresetId(value?.presetId),
    kind: normalizeSkinKind(value?.kind),
    gradient: typeof value?.gradient === 'string' && value.gradient.trim()
      ? value.gradient
      : defaults.gradient,
    imagePath: typeof value?.imagePath === 'string' && value.imagePath.trim()
      ? value.imagePath
      : undefined,
    dim: normalizeNumber(value?.dim, defaults.dim, 0, 0.92),
    blur: normalizeNumber(value?.blur, defaults.blur, 0, 24),
    motion: normalizeSkinMotionMode(value?.motion),
  };
}

export function normalizeAppearanceSettings(value: Partial<AppearanceSettings> | undefined): AppearanceSettings {
  const defaults = DEFAULT_APPEARANCE_SETTINGS;

  // 向后兼容：如果有旧的 themeId，将其映射到新的 presetId
  const legacyThemeId = (value as any)?.themeId;
  let skin: Partial<AppearanceSkinSettings> | undefined = value?.skin;

  if (legacyThemeId && !skin?.presetId) {
    // 旧版本使用 themeId，需要迁移
    if (legacyThemeId === 'obsidian' || legacyThemeId === 'aurora' || legacyThemeId === 'paper') {
      skin = {
        ...(skin || {}),
        presetId: legacyThemeId as AppearanceSkinPresetId,
      };
    }
  }

  return {
    skin: normalizeSkin(skin),
    terminalOpacity: normalizeNumber(value?.terminalOpacity, defaults.terminalOpacity, 0.52, 1),
    readabilityMode: normalizeReadabilityMode(value?.readabilityMode),
    reduceMotion: value?.reduceMotion ?? defaults.reduceMotion,
  };
}
