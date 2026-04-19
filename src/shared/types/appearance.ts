export type AppearanceThemeId = 'obsidian' | 'aurora' | 'paper';

export type AppearanceSkinKind = 'none' | 'gradient' | 'image';
export type AppearanceSkinPresetId = 'none' | 'midnight' | 'aurora' | 'paper' | 'custom';
export type AppearanceSkinMotionMode = 'none' | 'ambient';

export type AppearanceReadabilityMode = 'balanced' | 'readability' | 'immersive';

export interface AppearanceSkinSettings {
  presetId: AppearanceSkinPresetId;
  kind: AppearanceSkinKind;
  gradient: string;
  imagePath?: string;
  dim: number;
  blur: number;
  motion: AppearanceSkinMotionMode;
}

export interface AppearanceSettings {
  themeId: AppearanceThemeId;
  skin: AppearanceSkinSettings;
  terminalOpacity: number;
  readabilityMode: AppearanceReadabilityMode;
  reduceMotion: boolean;
}
