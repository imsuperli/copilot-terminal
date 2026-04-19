export type AppearanceThemeId = 'obsidian' | 'aurora' | 'paper';

export type AppearanceSkinKind = 'none' | 'gradient' | 'image';

export type AppearanceReadabilityMode = 'balanced' | 'readability' | 'immersive';

export interface AppearanceSkinSettings {
  kind: AppearanceSkinKind;
  gradient: string;
  imagePath?: string;
  dim: number;
  blur: number;
}

export interface AppearanceSettings {
  themeId: AppearanceThemeId;
  skin: AppearanceSkinSettings;
  terminalOpacity: number;
  readabilityMode: AppearanceReadabilityMode;
  reduceMotion: boolean;
}
